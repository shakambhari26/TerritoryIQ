"""Segment historical Frontier transcripts straight into the database (no API needed).

Usage:  python scripts/backfill.py data/raw/visit_transcripts_raw.csv [more.csv ...]
Safe to re-run: visits already stored are updated, never duplicated.
"""
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from visit_intel import config  # noqa: E402
from visit_intel.db import SessionLocal, init_db  # noqa: E402
from visit_intel.model import SegmentModel  # noqa: E402
from visit_intel.service import ingest  # noqa: E402

BATCH = 1000


def main(paths: list[str]) -> None:
    init_db()
    model = SegmentModel.load(config.MODEL_PATH)
    print(f"Model: {model.version if model else 'none (rules only)'}  ·  DB: {config.DATABASE_URL.split('@')[-1]}")
    totals = {"received": 0, "stored": 0, "skipped_empty": 0, "needs_review": 0}
    for path in paths:
        with open(path, encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        for i in range(0, len(rows), BATCH):
            with SessionLocal() as s:
                result = ingest(s, rows[i:i + BATCH], model)
            for k in totals:
                totals[k] += result[k]
            print(f"{path}: {min(i + BATCH, len(rows))}/{len(rows)}")
    print(totals)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
