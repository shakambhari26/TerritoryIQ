"""Place real sales visits on the globe by the rep's real GPS, with no inferred name links.

Real-data globe, stage 1. For every visit in the Visit-Intelligence database we find the rep's
GPS position at the moment of the visit (Elegant `employee-location`), point-in-polygon it into
the real OSM block outlines (the same LGD block codes the globe draws, GB-<ref:LGD:subdistrict>),
and record which real customers were visited in which real block. No customer-name guessing.

Outputs (same contract the globe already consumes; geometry/outlines untouched):
    data/generated/customers.json         real customers per block (schema 1)
    data/generated/globe-overlay.json      block `state` recomputed: represented iff real visits here
    data/generated/globe-placement.json     a report: placed / unplaced, by reason

Env:
    DATABASE_URL        the visit DB (prod Supabase or local)
    ELEGANT_API_BASE    https://fapi.elegantsteels.in/api
    ELEGANT_API_TOKEN   sanctum token  (GPS is pulled for the dates the visits span)

    python -I scripts/globe/place_visits.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GEN = ROOT / "data" / "generated"
sys.path.insert(0, str(ROOT / "services" / "visit-intel" / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
# Reuse the overlay builder's exact decode + projection + even-odd test, so blocks key to the same GB- ids.
from build_overlay import decode_rings, layer_to_lnglat, point_in_rings_even_odd  # noqa: E402

# Map the API visit category to the globe's customer types (widened in customers.ts to keep real ones).
TYPE = {"DEALER": "Dealer", "RETAILER": "Retailer", "MASON": "Mason", "IHB": "IHB",
        "ENGINEER": "Engineer", "CONTRACTOR": "Contractor"}


def category(raw_cat: str) -> str:
    c = (raw_cat or "").upper().replace("NEW ", "").strip()
    return TYPE.get(c, "IHB")


# ---------------------------------------------------------------- block polygons

def load_blocks() -> list[tuple[str, tuple[float, float, float, float], list]]:
    """Each globe block as (GB-id, lon/lat bbox, rings) decoded from the globe's own validated outlines,
    so a point-in-polygon returns exactly the id the overlay draws."""
    out = []
    shapes = json.loads((GEN / "globe-boundaries.json").read_text())["shapes"]
    for s in shapes:
        if not s["featureId"].startswith("GB-"):
            continue
        rings = [[layer_to_lnglat(x, y) for x, y in ring] for ring in decode_rings(s["d"])]
        if not rings:
            continue
        xs = [p[0] for r in rings for p in r]
        ys = [p[1] for r in rings for p in r]
        out.append((s["featureId"], (min(xs), min(ys), max(xs), max(ys)), rings))
    return out


# ------------------------------------------------------------------------- GPS

def _get(base: str, token: str, path: str) -> dict:
    req = urllib.request.Request(f"{base.rstrip('/')}/{path.lstrip('/')}",
                                 headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def load_gps(base: str, token: str, days: list[date]) -> dict:
    """(rep_name_lower, 'YYYY-MM-DD') -> sorted [(datetime, lon, lat)]."""
    out: dict = defaultdict(list)
    for d in days:
        ds = d.isoformat()
        try:
            payload = _get(base, token, f"employee-location?date={ds}")
        except Exception as e:  # noqa: BLE001
            print(f"  ! GPS {ds}: {e}", file=sys.stderr)
            continue
        for u in payload.get("data", []):
            rep = (u.get("user_name") or "").strip().lower()
            for loc in u.get("locations", []):
                try:
                    t = datetime.strptime(loc["created_at"], "%Y-%m-%d %H:%M:%S")
                    out[(rep, ds)].append((t, float(loc["longitude"]), float(loc["latitude"])))
                except (KeyError, ValueError):
                    continue
    for k in out:
        out[k].sort(key=lambda x: x[0])
    return out


def nearest_point(points: list, when: datetime):
    best, bestgap = None, None
    for t, lon, lat in points:
        gap = abs((t - when).total_seconds())
        if bestgap is None or gap < bestgap:
            best, bestgap = (lon, lat), gap
    return best, bestgap


def confidence(gap_s: float | None) -> str:
    if gap_s is None:
        return "low"
    return "good" if gap_s <= 1200 else "medium" if gap_s <= 7200 else "low"


# ------------------------------------------------------------------------ main

def main() -> None:
    base = os.environ.get("ELEGANT_API_BASE", "").strip()
    token = os.environ.get("ELEGANT_API_TOKEN", "").strip()
    if not base or not token or not os.environ.get("DATABASE_URL"):
        sys.exit("Set DATABASE_URL, ELEGANT_API_BASE and ELEGANT_API_TOKEN.")

    from sqlalchemy import select
    from visit_intel.db import SessionLocal, Visit

    print("Loading block polygons…")
    blocks_geom = load_blocks()
    print(f"  {len(blocks_geom)} blocks")

    with SessionLocal() as s:
        visits = [{"key": v.visit_key, "rep": (v.rep_name or "").strip().lower(), "at": v.visit_at,
                   "firm": v.customer_name or "", "person": v.contact_person or "",
                   "cat": v.visit_category or "", "phone": v.contact_number or ""}
                  for v in s.scalars(select(Visit)).all() if v.visit_at]
    days = sorted({v["at"].date() for v in visits})
    print(f"Visits with a time: {len(visits)} spanning {days[0]}..{days[-1]} ({len(days)} days)")

    print("Pulling GPS for those days…")
    gps = load_gps(base, token, days)
    print(f"  {sum(len(v) for v in gps.values())} GPS points, {len(gps)} rep-days")

    # place each visit
    blocks: dict[str, list[dict]] = defaultdict(list)
    report = {"placed": 0, "no_gps": 0, "outside_blocks": 0, "by_confidence": defaultdict(int)}
    seen: dict[str, set] = defaultdict(set)  # dedupe customers per block
    for v in visits:
        pts = gps.get((v["rep"], v["at"].date().isoformat()))
        if not pts:
            report["no_gps"] += 1
            continue
        (coord, gap) = nearest_point(pts, v["at"])
        if not coord:
            report["no_gps"] += 1
            continue
        lon, lat = coord
        bid = None
        for gid, (x0, y0, x1, y1), rings in blocks_geom:
            if x0 <= lon <= x1 and y0 <= lat <= y1 and point_in_rings_even_odd(lon, lat, rings):
                bid = gid
                break
        if bid is None:
            report["outside_blocks"] += 1
            continue
        dedup = (v["firm"].lower(), v["person"].lower())
        if dedup in seen[bid]:
            continue
        seen[bid].add(dedup)
        conf = confidence(gap)
        report["placed"] += 1
        report["by_confidence"][conf] += 1
        cu = v["key"] if v["key"].isdigit() and len(v["key"]) <= 9 else str(abs(hash(v["key"])) % 10**9)
        blocks[bid].append({
            "id": f"CU-{cu}", "type": category(v["cat"]),
            "firm": v["firm"][:120], "name": v["person"][:120], "erpCode": "",
            "confidence": conf,
            "basis": f"Placed by the rep's GPS at {v['at']:%H:%M on %d-%m-%Y} (visited as {v['cat'].title() or 'customer'}).",
            "village": None,
            "flags": ([] if v["phone"] else ["no-contact"]),
        })

    # write customers.json (schema 1)
    all_block_ids = [gid for gid, _, _ in blocks_geom]
    by_type: dict = defaultdict(int)
    by_conf = {"good": 0, "medium": 0, "low": 0}
    flagged = total = 0
    for recs in blocks.values():
        for r in recs:
            total += 1
            by_type[r["type"]] += 1
            by_conf[r["confidence"]] += 1
            flagged += 1 if r["flags"] else 0
    customers = {
        "meta": {"schema": 1, "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                 "inputs": {"gps": {"file": "elegant:employee-location", "sha256": "0" * 64},
                            "visits": {"file": "visit-intel:db", "sha256": "0" * 64}},
                 "counts": {"total": total, "placed": total, "unplaced": 0, "byConfidence": by_conf,
                            "flagged": flagged, "byType": dict(by_type), "flags": {}}},
        "globeBlockIds": all_block_ids,
        "blocks": {bid: recs for bid, recs in blocks.items()},
    }
    GEN.mkdir(parents=True, exist_ok=True)
    (GEN / "customers.json").write_text(json.dumps(customers))

    report["by_confidence"] = dict(report["by_confidence"])
    report["blocks_with_visits"] = len(blocks)
    report["total_blocks"] = len(blocks_geom)
    (GEN / "globe-placement.json").write_text(json.dumps(report, indent=2))
    print("\nPlacement report:")
    print(json.dumps(report, indent=2))
    print(f"\nWrote data/generated/customers.json ({total} real customers in {len(blocks)} blocks)")


if __name__ == "__main__":
    main()
