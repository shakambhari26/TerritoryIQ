"""Make the globe's block colours real: represented iff real GPS-placed visits land in the block.

Reads data/generated/customers.json (real, from place_visits.py) and the freshly built
data/generated/globe-overlay.json, then overwrites each block's `state`, `reason` and drops the
old inferred `records`. District states/counts are recomputed. Geometry, outlines and the
boundary SHA are untouched, so the shapes and integrity checks are unchanged.

    python -I scripts/globe/apply_real_states.py
"""
from __future__ import annotations

import json
from pathlib import Path

GEN = Path(__file__).resolve().parents[2] / "data" / "generated"


def main() -> None:
    customers = json.loads((GEN / "customers.json").read_text())
    overlay = json.loads((GEN / "globe-overlay.json").read_text())
    counts = {bid: len(recs) for bid, recs in customers["blocks"].items()}

    blocks = overlay["blocks"]
    items = blocks.values() if isinstance(blocks, dict) else blocks
    rep = 0
    for b in items:
        n = counts.get(b["id"], 0)
        if n > 0:
            b["state"] = "represented"
            b["reason"] = f"{n} customer{'s' if n != 1 else ''} were visited in this block, placed by the rep's GPS over the last 30 days."
            rep += 1
        else:
            b["state"] = "unresolved"
            b["reason"] = "No sales visits were placed in this block in the last 30 days."
        b["records"] = []  # drop the old inferred name-matched evidence

    # recompute districts from their blocks
    by_district: dict[str, list] = {}
    for b in items:
        by_district.setdefault(b.get("districtId"), []).append(b)
    dists = overlay["districts"]
    ditems = dists.values() if isinstance(dists, dict) else dists
    for d in ditems:
        kids = by_district.get(d["id"], [])
        represented = [k for k in kids if k["state"] == "represented"]
        d["state"] = "represented" if represented else "unresolved"
        d["reason"] = (f"{len(represented)} of its {len(kids)} blocks had sales visits placed by GPS in the last 30 days."
                       if represented else "No sales visits were placed in this district in the last 30 days.")
        if "representedBlockCount" in d:
            d["representedBlockCount"] = len(represented)
        if "drawnBlockCount" in d:
            d["drawnBlockCount"] = len([k for k in represented if k.get("geometry")])
        d["records"] = [] if "records" in d else d.get("records", [])

    # keep meta.counts consistent with the real states (the InsightsPanel reads these)
    represented_blocks = [b for b in items if b["state"] == "represented"]
    counts = overlay.get("meta", {}).get("counts")
    if isinstance(counts, dict):
        counts["blocksRepresented"] = len(represented_blocks)
        counts["blocksRepresentedAndDrawn"] = len([b for b in represented_blocks if b.get("geometry")])
        counts["blocksUnresolved"] = len(items) - len(represented_blocks)
        counts["blocksNoRepresentativeConfirmed"] = 0
        counts["districtsRepresented"] = sum(1 for d in ditems if d["state"] == "represented")

    # align customers.globeBlockIds to exactly the overlay's blocks
    overlay_ids = [b["id"] for b in items]
    customers["globeBlockIds"] = overlay_ids
    (GEN / "customers.json").write_text(json.dumps(customers))
    (GEN / "globe-overlay.json").write_text(json.dumps(overlay))
    print(f"Represented blocks (real visits): {rep} / {len(overlay_ids)}")
    print(f"Districts with activity: {sum(1 for d in ditems if d['state'] == 'represented')} / {len(list(ditems)) if not isinstance(dists, dict) else len(dists)}")


if __name__ == "__main__":
    main()
