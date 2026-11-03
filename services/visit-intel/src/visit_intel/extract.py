"""Fact extraction. Every value comes with the exact text it was taken from; nothing is guessed."""
from __future__ import annotations

import re
from datetime import date, timedelta

from .lexicon import Lexicon

_QTY = re.compile(r"(\d+(?:\.\d+)?)\s*(?:(?:to|-|–)\s*(\d+(?:\.\d+)?)\s*)?(mt|metric tonnes?|tonnes?|tons?|quintals?|qtl)\b", re.I)
_MONEY = re.compile(r"(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d+)?)\s*(lakh|lac|k|thousand)?", re.I)
_PERCENT = re.compile(r"(\d{1,3})\s?%")
_GRADE = re.compile(r"\bfe\s?-?(500|550)\s?d?\b|\bcrs\b", re.I)
_SIZE = re.compile(r"\b(8|10|12|16|20|25|32)\s?mm\b", re.I)
_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_STAGES = [("roof", r"roof|casting|slab|dhalai|lenter|lintel"), ("foundation", r"foundation|\bbhit\b|\bneev\b|plinth"),
           ("column", r"column|beam")]


def _evidence(text: str, m: re.Match, pad: int = 25) -> str:
    return text[max(0, m.start() - pad): m.end() + pad].strip()


def quantity(text: str) -> dict | None:
    m = _QTY.search(text)
    if not m:
        return None
    lo, hi = float(m.group(1)), float(m.group(2) or m.group(1))
    value = (lo + hi) / 2
    if m.group(3).lower().startswith(("quintal", "qtl")):
        value /= 10
    return {"value_mt": round(value, 2), "evidence": _evidence(text, m)}


def money(text: str) -> dict | None:
    m = _MONEY.search(text)
    if not m:
        return None
    value = float(m.group(1).replace(",", ""))
    unit = (m.group(2) or "").lower()
    value *= {"lakh": 100_000, "lac": 100_000, "k": 1_000, "thousand": 1_000}.get(unit, 1)
    return {"value_inr": value, "evidence": _evidence(text, m)}


def follow_up(text: str, visit_day: date | None) -> dict | None:
    lower = text.lower()
    if re.search(r"\btoday\b", lower):
        offset, word = 0, "today"
    elif re.search(r"\btomorrow\b", lower):
        offset, word = 1, "tomorrow"
    elif re.search(r"\bnext week\b|agle hafte|porer shoptahe", lower):
        offset, word = 7, "next week"
    elif m := re.search(r"within (\d+)(?:\s?-\s?(\d+))? days?", lower):
        offset, word = int(m.group(2) or m.group(1)), m.group(0)
    elif m := re.search(r"\b(?:by|on|next)\s+(" + "|".join(_DAYS) + r")\b", lower):
        word = m.group(0)
        offset = None if visit_day is None else ((_DAYS.index(m.group(1)) - visit_day.weekday()) % 7 or 7)
    elif re.search(r"\bkal\b", lower):
        return {"date": None, "evidence": "kal", "ambiguous": True}
    elif re.search(r"follow-?up|keep in contact|visit again", lower):
        return {"date": None, "evidence": "follow-up (no date given)", "ambiguous": False}
    else:
        return None
    when = None if visit_day is None or offset is None else (visit_day + timedelta(days=offset)).isoformat()
    return {"date": when, "evidence": word, "ambiguous": False}


def competitors(text: str, lex: Lexicon) -> list[dict]:
    named = [{"brand": m.maps_to.split(":")[1], "evidence": m.matched, "ambiguous": m.review_status == "ambiguous"}
             for m in lex.tag(text) if m.maps_to.startswith("COMPETITOR:")]
    if not named and (m := re.search(r"competitor|rival|other brand|another brand", text, re.I)):
        named = [{"brand": None, "evidence": _evidence(text, m), "ambiguous": False}]
    return named


def extract_all(text: str, visit_day: date | None, lex: Lexicon) -> dict:
    text = text or ""
    stage = next((s for s, p in _STAGES if re.search(p, text, re.I)), None)
    grade = _GRADE.search(text)
    pct = _PERCENT.search(text)
    return {
        "quantity": quantity(text),
        "amount": money(text),
        "percent_paid": int(pct.group(1)) if pct and re.search(r"pa(id|yment)|cleared|outstanding", text, re.I) else None,
        "competitors": competitors(text, lex),
        "grade": grade.group(0).upper().replace(" ", "") if grade else None,
        "sizes_mm": sorted({int(s) for s in _SIZE.findall(text)}),
        "construction_stage": stage,
        "follow_up": follow_up(text, visit_day),
    }
