"""Fill real IHB lead status into the globe's market data (the one figure still at zero).

Pulls Elegant `visit-wise-ihb` per district for the last 30 days, matches each IHB site's real block
name to the globe block, and writes real highly-positive / positive / neutral / negative lead counts by
7/30/90-day period into data/generated/market.json. Everything else in that file is left as-is.

    python -I scripts/globe/add_ihb_leads.py
Env: ELEGANT_API_BASE, ELEGANT_API_TOKEN (DATABASE_URL not needed).
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

GEN = Path(__file__).resolve().parents[2] / "data" / "generated"
TODAY = date.today()
STATUS = {"highlypositive": "highlyPositive", "positive": "positive", "neutral": "neutral", "negative": "negative"}


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def post(base: str, token: str, body: dict, retries: int = 3) -> dict:
    data = json.dumps(body).encode()
    for attempt in range(retries):
        req = urllib.request.Request(f"{base.rstrip('/')}/visit-wise-ihb", data=data, method="POST",
                                     headers={"Authorization": f"Bearer {token}", "Accept": "application/json",
                                              "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                text = r.read().decode("utf-8", "replace").strip()
            return json.loads(text) if text else {"status": False}
        except Exception as e:  # noqa: BLE001
            time.sleep(2 ** attempt)
            last = e
    print(f"  ! district {body.get('districts')}: {last}", file=sys.stderr)
    return {"status": False}


def get(base: str, token: str, path: str) -> dict:
    req = urllib.request.Request(f"{base.rstrip('/')}/{path}", headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def main() -> None:
    base = os.environ.get("ELEGANT_API_BASE", "").strip()
    token = os.environ.get("ELEGANT_API_TOKEN", "").strip()
    if not base or not token:
        sys.exit("Set ELEGANT_API_BASE and ELEGANT_API_TOKEN.")

    overlay = json.loads((GEN / "globe-overlay.json").read_text())
    ob = overlay["blocks"]
    name_to_gb = {norm(b["name"]): b["id"] for b in (ob if isinstance(ob, list) else ob.values())}
    market = json.loads((GEN / "market.json").read_text())

    districts = []
    for st in get(base, token, "emp-states").get("data", []):
        if int(st.get("state_id")) == 1:
            districts = [int(d["district_id"]) for d in st.get("districts", [])]
    start = (TODAY - timedelta(days=30)).strftime("%d-%m-%Y")
    end = TODAY.strftime("%d-%m-%Y")

    leads: dict[str, dict[int, dict]] = defaultdict(lambda: {7: defaultdict(int), 30: defaultdict(int), 90: defaultdict(int)})
    total = matched = unmatched = 0
    for d in districts:
        payload = post(base, token, {"inputState": 1, "districts": [d], "startDate": start, "endDate": end})
        for rec in payload.get("data", []) or []:
            total += 1
            bucket = STATUS.get(norm(rec.get("lead_status") or rec.get("lead_status_label")))
            gb = name_to_gb.get(norm(rec.get("block")))
            if not bucket or not gb:
                unmatched += 1
                continue
            try:
                vd = datetime.strptime(rec.get("visit_date", ""), "%d-%m-%Y").date()
            except ValueError:
                continue
            days_ago = (TODAY - vd).days
            for P in (7, 30, 90):
                if 0 <= days_ago < P:
                    leads[gb][P][bucket] += 1
            matched += 1

    statuses = ("highlyPositive", "positive", "neutral", "negative")
    for gb, recs in market["blocks"].items():
        lg = leads.get(gb)
        recs["leads"] = {str(P): {s: int(lg[P].get(s, 0)) if lg else 0 for s in statuses} for P in (7, 30, 90)}
    (GEN / "market.json").write_text(json.dumps(market))
    print(f"IHB leads: {total} records, {matched} placed, {unmatched} unmatched -> market.json")


if __name__ == "__main__":
    main()
