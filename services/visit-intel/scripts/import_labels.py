"""Load a filled worklist CSV from scripts/sample_to_label.py back as human labels.

No API key. Reads rows with a `visit_key` and a filled `segment` (one of the 10 codes),
writes them as human labels (labeller "human:csv" by default), and re-analyses those visits
so the dashboard reflects the human decision. Rows with an empty or invalid `segment` are
skipped and counted. Re-running is safe: a visit's prior human label is replaced, not stacked.

Usage
-----
  python scripts/import_labels.py data/labels/to_label.csv [--labeller human:priya] [--urgency]
  # then retrain on the real distribution:
  python scripts/train.py --with-db-labels
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from sqlalchemy import delete  # noqa: E402

from visit_intel import config  # noqa: E402
from visit_intel.db import Label, SessionLocal, init_db  # noqa: E402
from visit_intel.model import SegmentModel  # noqa: E402
from visit_intel.service import reanalyze  # noqa: E402
from visit_intel.taxonomy import SEGMENTS  # noqa: E402

VALID = set(SEGMENTS)
URGENCIES = {"P0", "P1", "P2", "P3"}


def read_rows(path: str) -> list[dict]:
    with open(path, encoding="utf-8-sig") as f:
        lines = [ln for ln in f if not ln.lstrip().startswith("#")]  # drop the header comment lines
    return list(csv.DictReader(lines))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("csv", help="the filled worklist CSV")
    p.add_argument("--labeller", default="human:csv", help="who labelled (must NOT start with 'ai:')")
    p.add_argument("--urgency", action="store_true", help="also import an `urgency` column (P0–P3) if present")
    args = p.parse_args()
    if args.labeller.startswith("ai:"):
        sys.exit("--labeller must not start with 'ai:' (that prefix is reserved for AI labels).")

    rows = read_rows(args.csv)
    imported = skipped = bad = 0
    keys: list[str] = []
    init_db()
    with SessionLocal() as s:
        for r in rows:
            key = (r.get("visit_key") or "").strip()
            seg = (r.get("segment") or "").strip().upper()
            if not key or not seg:
                skipped += 1
                continue
            if seg not in VALID:
                print(f"  ! invalid segment {seg!r} for {key} — skipped")
                bad += 1
                continue
            urg = (r.get("urgency") or "").strip().upper() if args.urgency else ""
            urg = urg if urg in URGENCIES else None
            # replace any prior human label for this visit; AI labels are left (a human label beats them)
            s.execute(delete(Label).where(Label.visit_key == key, ~Label.labeller.startswith("ai:")))
            s.add(Label(visit_key=key, segment=seg, urgency=urg, labeller=args.labeller))
            keys.append(key)
            imported += 1
        s.commit()

    model = SegmentModel.load(config.MODEL_PATH)
    for i in range(0, len(keys), 500):
        with SessionLocal() as s:
            reanalyze(s, model, keys[i:i + 500])
    print(f"Imported {imported} human labels  (skipped empty: {skipped}, invalid: {bad})")
    print("Next: python scripts/train.py --with-db-labels   # retrain ML on the real distribution")


if __name__ == "__main__":
    main()
