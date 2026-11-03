"""Train the segment model from labelled visits and save it with its measured scores.

Usage:
    python scripts/train.py                      # seed labels (data/processed/visits_dataset.csv)
    python scripts/train.py --with-db-labels     # plus every reviewer label saved through the API

Then restart the API, or call POST /v1/reanalyze, to use the new model.
"""
import argparse
import json
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import select

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from visit_intel import config  # noqa: E402
from visit_intel.model import SegmentModel  # noqa: E402


def seed_rows() -> tuple[list[dict], list[str]]:
    df = pd.read_csv(ROOT / "data/processed/visits_dataset.csv", dtype=str).fillna("")
    df = df[df["segment_primary"] != ""]
    return df[["transcript", "visit_category"]].to_dict("records"), df["segment_primary"].tolist()


def db_rows() -> tuple[list[dict], list[str]]:
    from visit_intel.db import Label, SessionLocal, Visit, init_db
    init_db()
    with SessionLocal() as s:
        latest: dict[str, str] = {}
        for label in s.scalars(select(Label).order_by(Label.id)):
            latest[label.visit_key] = label.segment
        visits = {v.visit_key: v for v in s.scalars(select(Visit).where(Visit.visit_key.in_(latest)))}
    keys = [k for k in latest if k in visits]
    return [{"transcript": visits[k].transcript, "visit_category": visits[k].visit_category} for k in keys], [latest[k] for k in keys]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--with-db-labels", action="store_true")
    ap.add_argument("--out", type=Path, default=config.MODEL_PATH)
    args = ap.parse_args()

    visits, labels = seed_rows()
    if args.with_db_labels:
        v2, l2 = db_rows()
        # A reviewer label on the same transcript replaces the seed label.
        by_text = {v["transcript"]: i for i, v in enumerate(visits)}
        for v, label in zip(v2, l2):
            if v["transcript"] in by_text:
                labels[by_text[v["transcript"]]] = label
            else:
                visits.append(v)
                labels.append(label)

    model = SegmentModel.train(visits, labels)
    model.save(args.out)
    print(json.dumps(model.meta, indent=2))
    small = {c: n for c, n in model.meta["class_counts"].items() if n < 20}
    if small:
        print(f"\nWARNING: {len(small)} segments have fewer than 20 examples; the model is a placeholder until more labels arrive.")


if __name__ == "__main__":
    main()
