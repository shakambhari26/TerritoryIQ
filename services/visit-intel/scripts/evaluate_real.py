"""Honest accuracy on the REAL visit distribution — measured on human labels you imported.

The leave-one-out number in scripts/evaluate.py is on 34 curated transcripts. The real Elegant
API delivers short English summaries, so that number does not transfer. This script measures the
app on the real-data human labels in the database (the ones scripts/import_labels.py loaded),
leave-one-out and leakage-free: for each labelled real visit, the model is trained on the 34 seed
labels plus every OTHER real label, then asked to segment this one with no sight of its label.

Keyless. Trains only in memory — never overwrites models/segment_model.joblib. Writes
reports/real_data_evaluation.md.

Run the loop first:
  sample_to_label.py -> fill labels -> import_labels.py   (then this script)

Usage:  python scripts/evaluate_real.py
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

import pandas as pd
from sklearn.metrics import accuracy_score, f1_score
from sqlalchemy import select

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from visit_intel.db import Label, SessionLocal, Visit, init_db, visit_dict  # noqa: E402
from visit_intel.model import SegmentModel  # noqa: E402
from visit_intel.pipeline import analyze, normalize  # noqa: E402
from visit_intel.taxonomy import SEGMENTS  # noqa: E402

MIN_FOR_SIGNAL = 30


def real_labelled() -> list[tuple[dict, str]]:
    """Every visit with a human label (labeller not 'ai:'), as (visit_dict, segment)."""
    out = []
    with SessionLocal() as s:
        rows = s.execute(select(Visit)).scalars().all()
        for v in rows:
            labels = s.scalars(select(Label).where(Label.visit_key == v.visit_key).order_by(Label.id.desc())).all()
            human = next((lb for lb in labels if not (lb.labeller or "").startswith("ai:")), None)
            if human and (v.transcript or "").strip() and human.segment in SEGMENTS:
                out.append((visit_dict(v), human.segment))
    return out


def main() -> None:
    init_db()
    real = real_labelled()
    if not real:
        sys.exit("No real-data human labels in the database yet.\n"
                 "Run:  python scripts/sample_to_label.py  ->  fill labels  ->  python scripts/import_labels.py\n"
                 "then re-run this script.")

    raw = pd.read_csv(ROOT / "data/raw/visit_transcripts_raw.csv", dtype=str).fillna("")
    seed_df = pd.read_csv(ROOT / "data/labels/seed_labels_v1.csv", dtype=str).fillna("")
    seed_visits = [normalize(r) for r in raw.to_dict("records")]
    seed_labels = seed_df["segment_primary"].tolist()

    print(f"Real-data human labels: {len(real)}  (seed labels added to each training fold: {len(seed_visits)})")
    if len(real) < MIN_FOR_SIGNAL:
        print(f"WARNING: fewer than {MIN_FOR_SIGNAL} real labels — treat the numbers as a weak early signal, "
              "and keep labelling (sample_to_label.py).")

    rv = [v for v, _ in real]
    rl = [lab for _, lab in real]
    rows = []
    for i in range(len(real)):
        tv = seed_visits + [rv[j] for j in range(len(real)) if j != i]
        tl = seed_labels + [rl[j] for j in range(len(real)) if j != i]
        model = SegmentModel.train(tv, tl)
        r = analyze(rv[i], model)  # human_label=None -> no leakage from the stored label
        rows.append({"true": rl[i], "pred": r["segment"]["code"],
                     "decided_by": r["segment"]["decided_by"], "review": bool(r["needs_human_review"])})
        print(f"{i + 1}/{len(real)}", end="\r")
    df = pd.DataFrame(rows)
    auto = df[~df["review"]]

    def line(name, d):
        if d.empty:
            return f"| {name} | 0 | n/a | n/a |"
        return (f"| {name} | {len(d)} | {accuracy_score(d['true'], d['pred']):.0%} | "
                f"{f1_score(d['true'], d['pred'], average='macro', zero_division=0):.2f} |")

    out = [f"# Real-data evaluation (leave-one-out, {len(df)} human-labelled real visits)\n",
           "Measured on the real Elegant-API summary distribution — the number that actually applies in production.\n",
           "| Slice | Visits | Accuracy | Macro-F1 |", "|---|---|---|---|",
           line("All visits (app's answer)", df),
           line("Decided automatically (no review)", auto),
           line("Sent to human review", df[df["review"]]),
           "", f"Share sent to human review: **{df['review'].mean():.0%}**\n",
           "Decided by: " + ", ".join(f"{k} {v}" for k, v in Counter(df['decided_by']).items()) + "\n",
           "## Most-confused pairs (true -> pred)\n",
           pd.DataFrame([(f"{t} -> {p}", n) for (t, p), n in
                         Counter((str(t), str(p)) for t, p in zip(df['true'], df['pred']) if t != p).most_common(10)],
                        columns=["true -> pred", "count"]).to_markdown(index=False) if (df['true'] != df['pred']).any()
           else "No errors.\n"]
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports/real_data_evaluation.md").write_text("\n".join(out))
    print("\n" + "\n".join(out))
    print("\nWrote reports/real_data_evaluation.md")


if __name__ == "__main__":
    main()
