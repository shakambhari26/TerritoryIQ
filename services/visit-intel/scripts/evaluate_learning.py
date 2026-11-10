"""Does the keyword auto-learner (learn.py) make the app more accurate? Measured without leakage.

For each visit: learn keywords from the hand labels of the *other* visits only, train the model on the others, then
analyse the held-out visit. Run once without learning and once with it; compare whole-app and keyword-layer accuracy.

Usage:  python scripts/evaluate_learning.py
Output: reports/learning_evaluation.md
"""
import sys
from pathlib import Path

import pandas as pd
from sklearn.metrics import accuracy_score, f1_score

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from visit_intel import keywords, learn  # noqa: E402
from visit_intel.model import SegmentModel  # noqa: E402
from visit_intel.pipeline import analyze, normalize  # noqa: E402


def run(visits, truth, seed_rows, with_learning: bool):
    rows, learned_counts = [], []
    for i, visit in enumerate(visits):
        others = [j for j in range(len(visits)) if j != i]
        matcher = keywords.Matcher(seed_rows)
        if with_learning:
            examples = [learn.Example(visits[j]["transcript"], truth[j], 1.0) for j in others]
            new = learn.propose(examples, matcher)
            learned_counts.append(len(new))
            extra = [keywords.Row(-100000 - k, p["term"], "en", p["target"], "segment", p["weight"], "draft", "")
                     for k, p in enumerate(new)]
            matcher = keywords.Matcher(seed_rows + extra)
        keywords._STATE["matcher"], keywords._STATE["source"] = matcher, "csv"
        model = SegmentModel.train([visits[j] for j in others], [truth[j] for j in others])
        r = analyze(visit, model)
        kw_top = r["evidence"]["keywords"]["top"]
        rows.append({"true": truth[i], "app": r["segment"]["code"], "keywords": kw_top, "review": r["needs_human_review"]})
        print(f"{'with' if with_learning else 'without'} learning {i + 1}/{len(visits)}", end="\r")
    return pd.DataFrame(rows), learned_counts


def line(name, d, col):
    return (f"| {name} | {accuracy_score(d['true'], d[col]):.0%} | "
            f"{f1_score(d['true'], d[col], average='macro', zero_division=0):.2f} |")


def main() -> None:
    raw = pd.read_csv(ROOT / "data/raw/visit_transcripts_raw.csv", dtype=str).fillna("")
    seed = pd.read_csv(ROOT / "data/labels/seed_labels_v1.csv", dtype=str).fillna("")
    visits = [normalize(r) for r in raw.to_dict("records")]
    truth = seed["segment_primary"].tolist()
    seed_rows = keywords._rows_from_csv()

    base, _ = run(visits, truth, seed_rows, False)
    learned, counts = run(visits, truth, seed_rows, True)
    full = learn.propose([learn.Example(v["transcript"], t, 1.0) for v, t in zip(visits, truth)], keywords.Matcher(seed_rows))

    out = [f"# Keyword auto-learner: leave-one-out on {len(visits)} hand-labelled visits\n",
           "Each visit is scored by keywords learned only from the other visits (no leakage).\n",
           "| Layer | Accuracy | Macro-F1 |", "|---|---|---|",
           line("Keyword layer alone, seed keywords", base, "keywords"),
           line("Keyword layer alone, seed + learned", learned, "keywords"),
           line("Whole app, seed keywords", base, "app"),
           line("Whole app, seed + learned", learned, "app"),
           "", f"Keywords learned per fold: {min(counts)}-{max(counts)} (average {sum(counts) / len(counts):.1f}).",
           f"Sent to review: {base['review'].mean():.0%} without learning, {learned['review'].mean():.0%} with.",
           "", "## What it learns from all 34 labels\n", "| Group | Phrase | Visits | Precision | Weight |", "|---|---|---|---|---|",
           *[f"| {p['target']} | {p['term']} | {p['visits']} | {p['precision']:.0%} | {p['weight']} |" for p in full]]
    (ROOT / "reports/learning_evaluation.md").write_text("\n".join(out) + "\n")
    print("\n".join(out[:12]))


if __name__ == "__main__":
    main()
