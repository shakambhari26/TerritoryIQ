"""Test the proposed 4-dimension taxonomy (urgency P0-P3, intent, sentiment, stakeholder + extraction).

Two predictors are scored against hand labels (data/labels/taxonomy_gold_v1.csv):
  1. the proposal's own trigger rules, implemented literally from its text;
  2. the 29 ML models from benchmark.py, leave-one-out.

Usage:  python experiments/test_taxonomy.py
Output: reports/taxonomy_test.md, reports/taxonomy_predictions.jsonl
"""
import json
import os
import re
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import LeaveOneOut, cross_val_predict
from sklearn.preprocessing import LabelEncoder

os.environ["PYTHONWARNINGS"] = "ignore"
warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / "experiments"), str(ROOT / "src")]
from benchmark import models  # noqa: E402
from visit_intel.lexicon import Lexicon  # noqa: E402

REPORTS = ROOT / "reports"
LEX = Lexicon.load()

STAKEHOLDER = {"DEALER": "DEALER", "RETAILER": "DEALER", "IHB": "IHB", "MASON": "INFLUENCER",
               "NEW MASON": "INFLUENCER", "ENGINEER": "INFLUENCER", "INFLUENCER": "INFLUENCER"}


def has(text, pattern):
    return re.search(pattern, text, re.IGNORECASE) is not None


def tonnes(text):
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:to\s*(\d+(?:\.\d+)?)\s*)?(?:mt|tons?|tonnes?)\b", text, re.IGNORECASE)
    if not m:
        return None
    lo, hi = float(m.group(1)), float(m.group(2) or m.group(1))
    return (lo + hi) / 2


# ---- the proposal's rules, written from its tables (not tuned to this data) ----
def rule_urgency(text, stakeholder):
    t, qty, lex = text, tonnes(text) or 0, LEX.summary(text)
    competitor = has(t, r"competitor|rival") or lex["lex_competitors"] or "COMPETITOR_PRICE" in lex["lex_segments"]
    if (competitor and stakeholder == "DEALER" and has(t, r"poach|switch|shift|leav|move to")) \
            or (qty > 50 and has(t, r"price|approv")) \
            or (has(t, r"quality|rust|weight") and has(t, r"concern|complain|issue|dispute|problem")):
        return "P0"
    if has(t, r"out of stock|stock-?out|no stock|stock (will )?run") or "STOCK_OUT" in lex["lex_flags"] \
            or (competitor and has(t, r"price|cheap|lower|cut")) \
            or (stakeholder == "INFLUENCER" and has(t, r"trial|sample|test")):
        return "P1"
    if has(t, r"order|replenish|inventory|stock|branding|pop\b|glow|signboard|credit|payment|scheme"):
        return "P2"
    return "P3"


def rule_intent(text):
    t, lex = text, LEX.summary(text)
    if has(t, r"quality|rust|weight|tolerance") and has(t, r"concern|complain|issue|dispute|problem"):
        return "QUALITY_WEIGHT"
    if has(t, r"out of stock|stock-?out|no stock|urgent") or "STOCK_OUT" in lex["lex_flags"]:
        return "STOCKOUT_URGENT_ORDER"
    if has(t, r"competitor|rival|price|rate|cheap|undercut") or "COMPETITOR_PRICE" in lex["lex_segments"]:
        return "PRICE_COMPETITOR"
    if has(t, r"credit|payment|outstanding|balance|dues?\b") or "PAYMENT" in lex["lex_segments"]:
        return "CREDIT_PAYMENT"
    if has(t, r"\bpop\b|point of purchase|branding|glow|signboard|scheme|gift|poster"):
        return "BRANDING_SCHEME"
    return "NONE"


def rule_sentiment(text):
    neg = has(text, r"concern|complain|delay|issue|problem|dissatisf|angry|unhappy")
    pos = has(text, r"happ|satisf|strong (interest|potential)|expanding|confirmed")
    return "NEGATIVE" if neg else "POSITIVE" if pos else "NEUTRAL"


def extract(text):
    lex = LEX.summary(text)
    stage = next((s for s, p in [("roof", r"roof|casting|slab|dhalai|lenter"), ("foundation", r"foundation|bhit|neev"),
                                 ("column", r"column|lintel|plinth")] if has(text, p)), None)
    return {
        "qty_mt": tonnes(text),
        "competitor_brand": (lex["lex_competitors"] or (["UNNAMED"] if has(text, r"competitor|rival") else [None]))[0],
        "price_delta": (m.group(0) if (m := re.search(r"₹\s?[\d,]+|rs\.?\s?[\d,]+", text, re.IGNORECASE)) else None),
        "grade": (m.group(0).upper() if (m := re.search(r"fe\s?-?5[05]0d?|crs", text, re.IGNORECASE)) else None),
        "stage": stage,
    }


def score(y_true, y_pred):
    return {"accuracy": accuracy_score(y_true, y_pred),
            "macro_f1": f1_score(y_true, y_pred, average="macro", zero_division=0)}


def ml_leaderboard(df, y_text):
    enc = LabelEncoder().fit(y_text)
    y = enc.transform(y_text)
    rows = []
    for name, model in models().items():
        if name == "Keyword rules":
            continue
        try:
            pred = cross_val_predict(clone(model), df, y, cv=LeaveOneOut(), n_jobs=-1)
        except Exception as exc:
            rows.append({"model": name, "error": str(exc)[:80]})
            continue
        rows.append({"model": name, **score(y, pred)})
    return pd.DataFrame(rows).sort_values("macro_f1", ascending=False).reset_index(drop=True)


def main():
    df = pd.read_csv(ROOT / "data/processed/visits_dataset.csv")
    gold = pd.read_csv(ROOT / "data/labels/taxonomy_gold_v1.csv", dtype=str).fillna("")
    df = df.merge(gold, on="visit_id")

    df["pred_stakeholder"] = df["visit_category"].map(STAKEHOLDER)
    df["pred_urgency"] = [rule_urgency(t, s) for t, s in zip(df["transcript"], df["pred_stakeholder"])]
    df["pred_intent"] = df["transcript"].map(rule_intent)
    df["pred_sentiment"] = df["transcript"].map(rule_sentiment)
    ext = pd.DataFrame([extract(t) for t in df["transcript"]])

    lines = ["# Proposed taxonomy: test on 34 real visits\n"]
    lines.append("Labels are hand-made by one person (see `data/labels/taxonomy_gold_v1.csv`). "
                 "Treat every number as a first signal, not a verdict.\n")

    lines.append("## How often each category occurs in the real data\n")
    for dim in ["urgency", "intent", "sentiment", "stakeholder"]:
        counts = df[dim].value_counts()
        lines.append(f"**{dim}**: " + ", ".join(f"{k} {v}" for k, v in counts.items()) + "\n")

    summary = []
    for dim in ["urgency", "intent", "sentiment"]:
        y = df[dim].values
        rules = score(y, df[f"pred_{dim}"].values)
        board = ml_leaderboard(df, y)
        best = board.dropna(subset=["macro_f1"]).iloc[0]
        dummy = board[board["model"].str.startswith("Dummy")].iloc[0]
        summary.append({"dimension": dim, "rules_accuracy": rules["accuracy"], "rules_macro_f1": rules["macro_f1"],
                        "best_ml": best["model"], "ml_accuracy": best["accuracy"], "ml_macro_f1": best["macro_f1"],
                        "always_majority_accuracy": (y == pd.Series(y).mode()[0]).mean()})
        lines.append(f"\n## {dim.title()}\n")
        lines.append(f"Rules: accuracy **{rules['accuracy']:.0%}**, macro-F1 **{rules['macro_f1']:.2f}**\n")
        lines.append("```\n" + classification_report(y, df[f"pred_{dim}"].values, zero_division=0) + "```\n")
        lines.append("Top ML models (leave-one-out):\n\n" + board.head(5).round(3).to_markdown(index=False) + "\n")
        print(f"{dim:10s} rules acc {rules['accuracy']:.0%} F1 {rules['macro_f1']:.2f} | "
              f"best ML {best['model']} acc {best['accuracy']:.0%} F1 {best['macro_f1']:.2f}")

    st_acc = (df["pred_stakeholder"] == df["stakeholder"]).mean()
    summary.append({"dimension": "stakeholder", "rules_accuracy": st_acc, "rules_macro_f1": np.nan,
                    "best_ml": "category mapping", "ml_accuracy": np.nan, "ml_macro_f1": np.nan,
                    "always_majority_accuracy": (df["stakeholder"] == df["stakeholder"].mode()[0]).mean()})
    print(f"stakeholder from Frontier category: {st_acc:.0%}")

    # Extraction: how many visits contain each field, and is the extracted value right?
    ext_rows = []
    for field, gold_col in [("qty_mt", "gold_qty_mt"), ("competitor_brand", "gold_competitor_brand"),
                            ("price_delta", "gold_price_delta"), ("grade", "gold_grade"), ("stage", "gold_stage")]:
        g = df[gold_col].replace("", None)
        p = ext[field].astype(object).where(ext[field].notna(), None)
        present = g.notna().sum()
        correct = sum(1 for a, b in zip(g, p) if a is not None and b is not None and str(a) == str(b).replace(".0", "") or
                      (a is not None and b is not None and _num(a) == _num(b)))
        invented = sum(1 for a, b in zip(g, p) if a is None and b is not None)
        ext_rows.append({"field": field, "visits_where_rep_said_it": f"{present}/34",
                         "extracted_correctly": f"{correct}/{present}" if present else "n/a",
                         "false_extractions": invented})
    ext_df = pd.DataFrame(ext_rows)
    print("\n" + ext_df.to_string(index=False))

    summ = pd.DataFrame(summary)
    lines.insert(2, "## Summary\n\n" + summ.round(2).to_markdown(index=False) + "\n\n"
                 "## Extraction fill rate\n\n" + ext_df.to_markdown(index=False) + "\n")
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "taxonomy_test.md").write_text("\n".join(lines))

    with open(REPORTS / "taxonomy_predictions.jsonl", "w") as f:
        for (_, r), (_, e) in zip(df.iterrows(), ext.iterrows()):
            f.write(json.dumps({
                "visit_id": r["visit_id"],
                "segmentation": {"urgency": r["pred_urgency"], "intent": r["pred_intent"], "sentiment": r["pred_sentiment"],
                                 "stakeholder": r["pred_stakeholder"]},
                "gold": {"urgency": r["urgency"], "intent": r["intent"], "sentiment": r["sentiment"]},
                "extracted": {k: (None if pd.isna(v) else v) for k, v in e.items()},
                "transcript": r["transcript"],
            }, ensure_ascii=False) + "\n")
    print("\n" + summ.round(2).to_string(index=False))


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return v


if __name__ == "__main__":
    main()
