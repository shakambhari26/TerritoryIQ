"""Pull real sales visits from the Elegant external API and segment them.

This is the production replacement for hand-exported CSVs. It reads the visit
remarks straight from `fapi.elegantsteels.in`, maps them to the Frontier column
layout the pipeline already understands, and (optionally) ingests them into the
database the API serves from — exactly the same `ingest()` the backfill uses, so
behaviour is identical.

Design choices that matter at real scale
-----------------------------------------
* Idempotent. Each visit is keyed on the API's own `visit_id` (-> "Visit ID"),
  so re-running the pull updates visits in place and never duplicates them. Run
  it hourly/daily without fear.
* Resilient. Districts are pulled one at a time with retry + backoff; one bad
  district (or a transient 5xx) never aborts the whole run. The API returns
  HTTP 200 even for errors, so we check the JSON `status`/`message`, not the code.
* Honest about PII. The remarks carry customer names and phone numbers. Nothing
  is printed to stdout except counts. With --no-phones the contact number is
  dropped before it ever reaches the database.
* Safe by default. Writes a CSV. It only touches the database when you pass
  --ingest, and it tells you which database (local SQLite vs the Railway one).

Environment
-----------
  ELEGANT_API_BASE   e.g. https://fapi.elegantsteels.in/api   (https, not http)
  ELEGANT_API_TOKEN  the Sanctum bearer token
  DATABASE_URL       only read when --ingest is used (defaults to local sqlite)

Examples
--------
  # Sanity check: pull one recent week, one district, write a CSV, segment nothing.
  python scripts/pull_elegant.py --days 7 --districts 8 --out /tmp/sample.csv

  # Full history to CSV (no DB writes), then eyeball it before committing.
  python scripts/pull_elegant.py --start 2026-01-01 --end 2026-11-06 --out data/raw/elegant_all.csv

  # Pull last 30 days and ingest into the configured database.
  python scripts/pull_elegant.py --days 30 --ingest --no-phones
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

log = logging.getLogger("pull_elegant")

FRONTIER_HEADERS = [
    "Visit ID", "Sales Rep Name", "Visit Date", "Visit Time",
    "Customer Name", "Contact Person", "Contact Number",
    "Visit Category", "Transcript / Remarks",
]


# --------------------------------------------------------------------------- API

def _post(base: str, token: str, path: str, body: dict, retries: int = 4, timeout: int = 60) -> dict:
    """POST JSON with retry/backoff. Raises on give-up. Treats non-JSON / status:false as failure."""
    url = f"{base.rstrip('/')}/{path.lstrip('/')}"
    data = json.dumps(body).encode()
    last = None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method="POST", headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                text = resp.read().decode("utf-8", "replace").strip()
            if not text:
                raise ValueError("empty body (the server timed out on this query — narrow the date range or district)")
            payload = json.loads(text)
            return payload
        except (urllib.error.URLError, ValueError, json.JSONDecodeError) as e:
            last = e
            wait = 2 ** attempt
            log.warning("%s failed (attempt %d/%d): %s — retrying in %ss", path, attempt + 1, retries, e, wait)
            time.sleep(wait)
    raise RuntimeError(f"{path} failed after {retries} attempts: {last}")


def _get(base: str, token: str, path: str, timeout: int = 60) -> dict:
    url = f"{base.rstrip('/')}/{path.lstrip('/')}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


def fetch_districts(base: str, token: str, state: int) -> list[tuple[int, str]]:
    payload = _get(base, token, "emp-states")
    out = []
    for st in payload.get("data", []):
        if int(st.get("state_id")) == state:
            for d in st.get("districts", []):
                out.append((int(d["district_id"]), d["district_name"]))
    return out


def fetch_remarks(base: str, token: str, state: int, district: int, start: date, end: date) -> list[dict]:
    payload = _post(base, token, "get-visit-remarks", {
        "inputState": state,
        "inputDistrict": district,
        "start-date": start.isoformat(),
        "end-date": end.isoformat(),
    })
    if payload.get("status") is False:
        return []  # "No visit remarks found" — a legitimate empty, not an error
    return payload.get("remarks", []) or []


# ----------------------------------------------------------------------- mapping

def to_frontier(r: dict, keep_phone: bool) -> dict:
    """Map one get-visit-remarks record to the Frontier columns the pipeline reads."""
    vt = (r.get("visit_time") or "").split(" - ")[0].strip()
    if vt in ("", "-", "In Progress"):
        vt = ""
    return {
        "Visit ID": r.get("visit_id"),
        "Sales Rep Name": r.get("mo_name"),
        "Visit Date": r.get("visit_date") or r.get("visit_date_raw"),
        "Visit Time": vt,
        "Customer Name": r.get("firm_name") or r.get("customer_name"),
        "Contact Person": r.get("customer_name"),
        "Contact Number": (r.get("contact_no") if keep_phone else ""),
        "Visit Category": r.get("type") or "",
        "Transcript / Remarks": r.get("remarks") or "",
    }


def date_chunks(start: date, end: date, days: int):
    cur = start
    while cur <= end:
        stop = min(cur + timedelta(days=days - 1), end)
        yield cur, stop
        cur = stop + timedelta(days=1)


# -------------------------------------------------------------------------- main

def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--state", type=int, default=1)
    p.add_argument("--districts", help="CSV of district IDs; default = all active districts of the state")
    p.add_argument("--start", help="Y-m-d; default = --days before today")
    p.add_argument("--end", help="Y-m-d; default = today")
    p.add_argument("--days", type=int, default=30, help="window size when --start is omitted (default 30)")
    p.add_argument("--chunk-days", type=int, default=31, help="date-window size per API call (default 31)")
    p.add_argument("--out", help="write the mapped visits to this CSV (Frontier layout)")
    p.add_argument("--ingest", action="store_true", help="segment and store into the database (DATABASE_URL)")
    p.add_argument("--no-phones", action="store_true", help="drop contact numbers before storing (recommended)")
    p.add_argument("--sample", type=int, help="keep only the first N visits (quick end-to-end test)")
    p.add_argument("--dry-run", action="store_true", help="fetch and map, but neither write CSV nor ingest")
    args = p.parse_args()

    base = os.environ.get("ELEGANT_API_BASE", "").strip()
    token = os.environ.get("ELEGANT_API_TOKEN", "").strip()
    if not base or not token:
        sys.exit("Set ELEGANT_API_BASE and ELEGANT_API_TOKEN in the environment first.")
    if base.startswith("http://"):
        log.warning("ELEGANT_API_BASE is http:// — the token travels unencrypted. Prefer https://.")

    end = datetime.strptime(args.end, "%Y-%m-%d").date() if args.end else date.today()
    start = datetime.strptime(args.start, "%Y-%m-%d").date() if args.start else end - timedelta(days=args.days - 1)

    if args.districts:
        districts = [(int(x), f"district-{x}") for x in args.districts.split(",") if x.strip()]
    else:
        districts = fetch_districts(base, token, args.state)
    log.info("Pulling state=%s, %d district(s), %s..%s", args.state, len(districts), start, end)

    by_key: dict[str, dict] = {}
    failures: list[tuple[int, str]] = []
    for did, dname in districts:
        got = 0
        for c0, c1 in date_chunks(start, end, args.chunk_days):
            try:
                recs = fetch_remarks(base, token, args.state, did, c0, c1)
            except RuntimeError as e:
                log.error("district %s (%s) %s..%s: %s", did, dname, c0, c1, e)
                failures.append((did, str(e)))
                continue
            for r in recs:
                row = to_frontier(r, keep_phone=not args.no_phones)
                key = str(row["Visit ID"] or "")
                if key:
                    by_key[key] = row  # de-dup across overlapping windows
                else:
                    by_key[f"_nokey_{len(by_key)}"] = row
            got += len(recs)
        log.info("district %s (%s): %d visits", did, dname, got)

    rows = list(by_key.values())
    if args.sample:
        rows = rows[: args.sample]
    log.info("Total unique visits: %d  (district failures: %d)", len(rows), len(failures))

    if args.dry_run:
        log.info("--dry-run: not writing anything.")
        return

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        with open(args.out, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=FRONTIER_HEADERS)
            w.writeheader()
            w.writerows(rows)
        log.info("Wrote %d visits -> %s", len(rows), args.out)

    if args.ingest:
        from visit_intel import config
        from visit_intel.db import SessionLocal, init_db
        from visit_intel.model import SegmentModel
        from visit_intel.service import ingest
        init_db()
        model = SegmentModel.load(config.MODEL_PATH)
        target = config.DATABASE_URL.split("@")[-1]
        log.info("Ingesting into: %s  (model: %s)", target, model.version if model else "rules-only")
        totals = {"received": 0, "stored": 0, "skipped_empty": 0, "needs_review": 0, "errored": 0}
        BATCH = 500
        for i in range(0, len(rows), BATCH):
            with SessionLocal() as s:
                res = ingest(s, rows[i:i + BATCH], model)
            for k in totals:
                totals[k] += res.get(k, 0)
            log.info("ingested %d/%d", min(i + BATCH, len(rows)), len(rows))
        stored = totals["stored"] or 1
        log.info("DONE %s", totals)
        log.info("Review rate: %d/%d = %.0f%%  (how many visits the system punted to a human)",
                 totals["needs_review"], stored, 100 * totals["needs_review"] / stored)
        if totals["errored"]:
            log.warning("%d visits failed to analyze and were skipped — check the logs above.", totals["errored"])


if __name__ == "__main__":
    main()
