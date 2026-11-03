"""End-to-end accuracy of the whole app (rules + model + review gate), measured without leakage.

Each visit is analysed by a model trained on all the *other* labelled visits (leave-one-out), then compared with
its hand label. Reports accuracy overall, on visits the app decided by itself, and the share sent to human review.

Usage:  python scripts/evaluate.py
Output: reports/app_evaluation.md
"""
import json
import sys
from collections import Counter
from pathlib import Path

import pandas as pd
from sklearn.metrics import accuracy_score, f1_score

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from visit_intel.model import SegmentModel  # noqa: E402
from visit_intel.pipeline import analyze, normalize  # noqa: E402


def main() -> None:
    raw = pd.read_csv(ROOT / "data/raw/visit_transcripts_raw.csv", dtype=str).fillna("")
    seed = pd.read_csv(ROOT / "data/labels/seed_labels_v1.csv", dtype=str).fillna("")
    gold = pd.read_csv(ROOT / "data/labels/taxonomy_gold_v1.csv", dtype=str).fillna("")
    visits = [normalize(r) for r in raw.to_dict("records")]
    seg_true = seed["segment_primary"].tolist()

    rows = []
    for i, visit in enumerate(visits):
        others = [j for j in range(len(visits)) if j != i]
        model = SegmentModel.train([visits[j] for j in others], [seg_true[j] for j in others])
        r = analyze(visit, model)
        rows.append({"visit_id": seed["visit_id"][i], "true": seg_true[i], "pred": r["segment"]["code"],
                     "decided_by": r["segment"]["decided_by"], "review": r["needs_human_review"],
                     "urgency_true": gold["urgency"][i], "urgency_pred": r["urgency"]["level"],
                     "note_score": r["note_quality"]["score"]})
        print(f"{i + 1}/{len(visits)}", end="\r")
    df = pd.DataFrame(rows)
    auto = df[~df["review"]]

    def line(name, d, t="true", p="pred"):
        if d.empty:
            return f"| {name} | 0 | n/a | n/a |"
        return (f"| {name} | {len(d)} | {accuracy_score(d[t], d[p]):.0%} | "
                f"{f1_score(d[t], d[p], average='macro', zero_division=0):.2f} |")

    out = ["# Whole-app evaluation (leave-one-out, 34 visits)\n",
           "Labels are hand-made by one person; treat as a first signal.\n",
           "## Segment\n", "| Slice | Visits | Accuracy | Macro-F1 |", "|---|---|---|---|",
           line("All visits (app's answer)", df),
           line("Decided automatically (no review)", auto),
           line("Sent to human review", df[df["review"]]),
           "", f"Share sent to human review: **{df['review'].mean():.0%}**\n",
           "Decided by: " + ", ".join(f"{k} {v}" for k, v in Counter(df['decided_by']).items()) + "\n",
           "### Accuracy by decision layer\n", "| Layer | Visits | Accuracy | Macro-F1 |", "|---|---|---|---|",
           *[line(k, df[df["decided_by"] == k]) for k in df["decided_by"].unique()],
           "\n## Urgency\n", "| Slice | Visits | Accuracy | Macro-F1 |", "|---|---|---|---|",
           line("All visits", df, "urgency_true", "urgency_pred"),
           "\n## Errors\n", df[df["true"] != df["pred"]][["visit_id", "true", "pred", "decided_by", "review"]].to_markdown(index=False),
           "\n## Average note quality score\n", f"{df['note_score'].mean():.1f} / 10\n"]
    # Each method's measured track record, quoted (with a 95% interval) in every visit's explanation. See explain.py.
    record = {"evaluated_at": pd.Timestamp.now(tz="UTC").isoformat(timespec="seconds"), "visits": len(df),
              "layers": {}, "paths": {}}
    for _, row in df.iterrows():
        d = record["paths"].setdefault(row["decided_by"], {"n": 0, "correct": 0})
        d["n"] += 1
        d["correct"] += int(row["true"] == row["pred"])
        for layer in row["decided_by"].split("+") if row["decided_by"] not in ("uncertain", "human") else []:
            d = record["layers"].setdefault(layer, {"n": 0, "correct": 0})
            d["n"] += 1
            d["correct"] += int(row["true"] == row["pred"])
    auto = record["layers"]["_auto"] = {"n": int(len(df[~df["review"]])), "correct": int((df[~df["review"]]["true"] == df[~df["review"]]["pred"]).sum())}
    (ROOT / "models").mkdir(exist_ok=True)
    (ROOT / "models/layer_accuracy.json").write_text(json.dumps(record, indent=2))

    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports/app_evaluation.md").write_text("\n".join(out))
    print("\n".join(out[3:12] + out[14:20]))


if __name__ == "__main__":
    main()
