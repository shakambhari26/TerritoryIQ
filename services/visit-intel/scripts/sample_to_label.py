"""Pick the most informative real visits for a human to label — the keyless way to raise accuracy.

No API key, no LLM. It reads the visits already in the database, scores each by how much a
human label would teach the model, and writes a worklist CSV. A supervisor fills the `segment`
column; `scripts/import_labels.py` loads it back; `scripts/train.py --with-db-labels` retrains
the ML on the real distribution. That is what drops the ~50% review rate on real summaries.

Why these visits (active learning)
----------------------------------
A label is most valuable where the model is least sure, so each visit is scored by:
  * +2.0 if the pipeline sent it to human review (genuinely uncertain)
  * + (1 - confidence)                             (how unsure the shown answer is)
  * +1.0 if rules / keywords / ML disagree         (the three methods conflict)
Then the picks are **stratified across the 10 segments** (round-robin by the model's current
guess) so rare segments — the ones with too few examples to train on — still get labelled.
Visits that already have a human label are skipped.

Usage
-----
  python scripts/sample_to_label.py --n 150 --out data/labels/to_label.csv
  # a supervisor fills the `segment` column (valid codes are listed in the file header),
  # then: python scripts/import_labels.py data/labels/to_label.csv
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from sqlalchemy import select  # noqa: E402

from visit_intel.db import Analysis, Label, SessionLocal, Visit, init_db  # noqa: E402
from visit_intel.taxonomy import SEGMENTS  # noqa: E402


def informativeness(result: dict) -> float:
    seg = result.get("segment", {})
    conf = float(seg.get("confidence") or 0.0)
    score = (1.0 - conf)
    if result.get("needs_human_review"):
        score += 2.0
    votes = (result.get("evidence", {}).get("decision", {}) or {}).get("votes", {})
    chosen = [v.get("segment") for v in votes.values() if v.get("segment")]
    if chosen and len(set(chosen)) == len(chosen):  # all different = full disagreement
        score += 1.0
    return score


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--n", type=int, default=150, help="how many visits to put in the worklist")
    p.add_argument("--out", default="data/labels/to_label.csv")
    p.add_argument("--include-ai-labelled", action="store_true",
                   help="also offer visits that already have an AI label (default: skip them too)")
    args = p.parse_args()

    init_db()
    # collect candidates grouped by the model's current guess, so we can stratify
    by_seg: dict[str, list[dict]] = defaultdict(list)
    with SessionLocal() as s:
        labelled = {k for (k,) in s.execute(select(Label.visit_key)).all()}
        rows = s.execute(select(Visit, Analysis).join(Analysis, Analysis.visit_key == Visit.visit_key)).all()
        for v, a in rows:
            if v.visit_key in labelled and not args.include_ai_labelled:
                continue
            res = a.result
            code = res.get("segment", {}).get("code", "UNCLEAR_RECORDING")
            by_seg[code].append({
                "visit_key": v.visit_key,
                "rep_name": v.rep_name or "",
                "customer_name": v.customer_name or "",
                "visit_category": v.visit_category or "",
                "transcript": v.transcript or "",
                "model_guess": code,
                "model_guess_name": res.get("segment", {}).get("name", ""),
                "confidence": round(float(res.get("segment", {}).get("confidence") or 0.0), 3),
                "decided_by": res.get("segment", {}).get("decided_by", ""),
                "why": (res.get("explanation", {}) or {}).get("summary", "") if isinstance(res.get("explanation"), dict) else "",
                "_score": informativeness(res),
            })
    for code in by_seg:
        by_seg[code].sort(key=lambda r: r["_score"], reverse=True)

    # round-robin across segments, highest-score first within each, until we have n
    picked: list[dict] = []
    order = sorted(by_seg, key=lambda c: len(by_seg[c]))  # start with the rarest segments
    cursors = {c: 0 for c in by_seg}
    while len(picked) < args.n and any(cursors[c] < len(by_seg[c]) for c in by_seg):
        for code in order:
            if cursors[code] < len(by_seg[code]):
                picked.append(by_seg[code][cursors[code]])
                cursors[code] += 1
                if len(picked) >= args.n:
                    break

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    cols = ["segment", "visit_key", "model_guess", "model_guess_name", "confidence", "decided_by",
            "visit_category", "customer_name", "rep_name", "transcript", "why"]
    with open(out, "w", newline="", encoding="utf-8") as f:
        f.write("# Fill the `segment` column with ONE of these codes, then run scripts/import_labels.py:\n")
        f.write("# " + "  ".join(f"{c}={name}" for c, (name, *_ ) in SEGMENTS.items()) + "\n")
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in picked:
            w.writerow({"segment": "", **r})

    dist = defaultdict(int)
    for r in picked:
        dist[r["model_guess"]] += 1
    print(f"Wrote {len(picked)} visits to {out}")
    print("Coverage by current model guess:")
    for code in sorted(dist, key=lambda c: -dist[c]):
        print(f"  {code:20} {dist[code]}")
    print("\nNext: fill the `segment` column, then  python scripts/import_labels.py", out)


if __name__ == "__main__":
    main()
