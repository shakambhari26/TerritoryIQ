"""Shared feature definitions: used by the dataset builder, the benchmark and the live model, so they never drift."""
from __future__ import annotations

import re

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import OneHotEncoder

from . import keywords
from .taxonomy import SEGMENTS

CATEGORY_GROUP = {
    "MASON": "INFLUENCER", "NEW MASON": "INFLUENCER", "ENGINEER": "INFLUENCER", "INFLUENCER": "INFLUENCER",
    "DEALER": "CHANNEL", "RETAILER": "CHANNEL",
    "IHB": "END_CUSTOMER",  # Individual House Builder
}

# Simple keyword flags. These are features for the model, not the final answer.
KEYWORDS = {
    "kw_order": r"\border|ordering|purchas|\bmt\b|\btons?\b",
    "kw_payment": r"payment|outstanding|balance|credit|collect",
    "kw_competitor": r"competitor|rival|other brand",
    "kw_price": r"price|rate|per kg|cost",
    "kw_quality": r"quality",
    "kw_complaint": r"concern|delay|complain|issue|problem",
    "kw_follow_up": r"follow-?up|tomorrow|next week|by friday|keep in contact",
    "kw_satisfaction": r"satisf|happ|resolved",
    "kw_site": r"\bsite|roof|casting|construction|project",
    "kw_technical": r"technical|engineer|evaluation|specs",
    "kw_new": r"\bnew\b|potential|prospect|interest|convert|introduc",
    "kw_meta_text": r"\bthe audio\b|\bthe speaker\b|\binstructions for\b",
}
# Keyword-database score per segment (see keywords.py), so the model also learns from the multilingual keyword base.
KWDB_COLS = [f"kwdb_{s.lower()}" for s in SEGMENTS]
KW_COLS = list(KEYWORDS) + KWDB_COLS
_COMPILED = {k: re.compile(v) for k, v in KEYWORDS.items()}


def keyword_flags(text: str) -> dict[str, float]:
    lower = (text or "").lower()
    out: dict[str, float] = {k: int(bool(rx.search(lower))) for k, rx in _COMPILED.items()}
    scores = keywords.get().score(text or "")["segment_scores"]
    out.update({f"kwdb_{s.lower()}": scores[s] / 3 for s in SEGMENTS})  # /3: one decisive keyword = 1.0
    return out


def model_frame(rows: list[dict]) -> pd.DataFrame:
    """The columns the model reads, built from cleaned visits (transcript + visit_category)."""
    out = []
    for r in rows:
        category = (r.get("visit_category") or "").strip().upper()
        out.append({"transcript": r.get("transcript") or "", "visit_category": category,
                    "category_group": CATEGORY_GROUP.get(category, "OTHER"), **keyword_flags(r.get("transcript"))})
    return pd.DataFrame(out)


def text_features() -> ColumnTransformer:
    return ColumnTransformer([
        ("words", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1), "transcript"),
        ("chars", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, max_features=3000), "transcript"),
        ("cat", OneHotEncoder(handle_unknown="ignore"), ["visit_category", "category_group"]),
        ("kw", "passthrough", KW_COLS),
    ])
