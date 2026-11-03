"""Layer 1b: the keyword database. Every probable word for every segment and sub-segment, in English, Bengali and
Hindi (Roman letters and native script), with a weight. Scored like a Naive Bayes / logistic model, so the maths can
be shown to the reader:

    S(group) = prior(group) + sum of keyword weights, strongest first, each next one counting 80% of the one before
    P(group) = e^S(group) / sum over all groups of e^S        (softmax: turns scores into probabilities that add to 1)

A keyword is ignored when it is negated: "no", "not", "never"... in the 3 words before it (English), or "na", "nei",
"nahi"... in the 2 words after it (Bengali / Hindi put the negation after the verb). "not happy" is not happy.

The table lives in the database (db.Keyword); lexicon/keywords.csv only seeds it. Add or switch off keywords through
the API (/v1/keywords) without touching code.
"""
from __future__ import annotations

import csv
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .taxonomy import FLAGS, SEGMENTS

ROOT = Path(__file__).resolve().parents[2]
SEED_CSV = ROOT / "lexicon/keywords.csv"

PRIOR = {"LOW_VALUE_VISIT": 1.0}  # with no evidence at all, "nothing came of the visit" is the best guess
DECAY = 0.8                       # the 2nd keyword for a group counts 80%, the 3rd 64%... one long note can't swamp it
AMBIGUOUS_FACTOR = 0.5            # "kal", "Shyam": may mean something else, so half weight
FLAG_THRESHOLD = 2.0              # a sub-segment flag needs this much evidence (one strong keyword or two weaker ones)

NEG_BEFORE = {"no", "not", "never", "without", "nor", "neither", "zero", "cannot", "can't", "cant", "didn't", "didnt",
              "don't", "dont", "doesn't", "doesnt", "isn't", "isnt", "wasn't", "wasnt", "hasn't", "hasnt", "haven't"}
NEG_AFTER = {"na", "nei", "ni", "noy", "nai", "nahi", "nahin", "nehi", "mat", "না", "নেই", "নি", "নয়", "নাই", "नहीं", "नही", "न", "मत"}
_TOKEN = re.compile(r"[^\s,.;:!?()\"]+")


def kind_of(target: str) -> str | None:
    return "segment" if target in SEGMENTS else "flag" if target in FLAGS else None


@dataclass(frozen=True)
class Row:
    id: int
    term: str
    language: str
    target: str
    kind: str
    weight: float
    status: str
    meaning: str


def _pattern(term: str) -> str:
    prefix = term.endswith("*")
    stem = term.rstrip("*")
    body = re.escape(stem)
    if stem.isascii():
        # Latin: whole words only ("dam" must not match "damage"); a trailing * allows any ending (complain*).
        return rf"(?<![A-Za-z]){body}" + (r"[A-Za-z]*" if prefix else r"(?![A-Za-z])")
    # Bengali / Devanagari: no letter of the same script before it; any suffix after (দাম, দামে, দামের).
    return rf"(?<![ऀ-৿]){body}"


class Matcher:
    def __init__(self, rows: list[Row]):
        self.rows = rows
        self.by_key: dict[tuple[str, str], Row] = {}
        by_target: dict[str, set[str]] = {}
        for r in rows:
            self.by_key[(r.target, r.term.lower())] = r
            by_target.setdefault(r.target, set()).add(r.term.lower())
        # One regex per group, so "full payment" can be evidence for Payment received AND its "payment" for Payment.
        # Inside a group the longest term wins ("order confirmed" is one match, not "order confirmed" + "order").
        self._regexes = []
        for target, terms in by_target.items():
            ordered = sorted(terms, key=lambda t: -len(t.rstrip("*")))
            names = {f"k{i}": t for i, t in enumerate(ordered)}
            rx = re.compile("|".join(f"(?P<k{i}>{_pattern(t)})" for i, t in enumerate(ordered)), re.IGNORECASE)
            self._regexes.append((target, names, rx))

    def _negator(self, text: str, start: int, end: int, term: str) -> str | None:
        term_tokens = set(term.lower().rstrip("*").split())
        if term_tokens & (NEG_BEFORE | NEG_AFTER):
            return None  # the keyword already contains the negation ("not satisfied", "maal nei")
        before = [t.lower() for t in _TOKEN.findall(text[:start])[-3:]]
        after = [t.lower() for t in _TOKEN.findall(text[end:])[:2]]
        return next((t for t in before if t in NEG_BEFORE), None) or next((t for t in after if t in NEG_AFTER), None)

    def score(self, text: str) -> dict:
        text = (text or "").replace("’", "'")
        matches = []
        for target, names, rx in self._regexes:
            for m in rx.finditer(text):
                r = self.by_key[(target, names[m.lastgroup])]
                negator = self._negator(text, m.start(), m.end(), r.term)
                eff = 0.0 if negator else r.weight * (AMBIGUOUS_FACTOR if r.status == "ambiguous" else 1.0)
                matches.append({"id": r.id, "term": r.term, "matched": m.group(0), "target": r.target, "kind": r.kind,
                                "weight": r.weight, "effective": round(eff, 3), "language": r.language, "status": r.status,
                                "meaning": r.meaning, "negated_by": negator, "at": m.start()})

        # Each distinct term counts once per group, strongest first, with diminishing returns.
        per_target: dict[str, dict[str, float]] = {}
        for x in matches:
            if x["effective"] > 0:
                bucket = per_target.setdefault(x["target"], {})
                bucket[x["term"]] = max(bucket.get(x["term"], 0.0), x["effective"])

        def total(target: str) -> float:
            ws = sorted(per_target.get(target, {}).values(), reverse=True)
            return sum(w * DECAY ** i for i, w in enumerate(ws))

        seg_scores = {s: round(PRIOR.get(s, 0.0) + total(s), 3) for s in SEGMENTS}
        top = max(seg_scores.values())
        exp = {s: math.exp(v - top) for s, v in seg_scores.items()}  # subtract the max first: same result, no overflow
        z = sum(exp.values())
        probs = sorted(((s, e / z) for s, e in exp.items()), key=lambda p: -p[1])
        entropy = -sum(p * math.log(p) for _, p in probs if p > 0) / math.log(len(probs))
        flag_scores = {f: round(total(f), 3) for f in FLAGS if f in per_target}
        return {
            "matches": sorted(matches, key=lambda x: x["at"]),
            "segment_scores": seg_scores,
            "probabilities": [{"segment": s, "probability": round(p, 4)} for s, p in probs],
            "top": probs[0][0], "top_probability": round(probs[0][1], 4),
            "margin": round(probs[0][1] - probs[1][1], 4),
            "entropy": round(entropy, 4),
            "evidence_found": bool(per_target),
            "flag_scores": flag_scores,
            "flags": sorted(f for f, v in flag_scores.items() if v >= FLAG_THRESHOLD),
            "languages": dict(Counter(x["language"] for x in matches if x["effective"] > 0)),
        }


# ---------- storage ----------

def read_csv(path: Path = SEED_CSV) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [r for r in csv.DictReader(f) if r["term"].strip()]


def sync_from_csv(session: Session, path: Path = SEED_CSV) -> int:
    """Add CSV keywords the database does not have yet. Never overwrites or re-activates a row someone edited."""
    from .db import Keyword
    have = {(t.lower(), g) for t, g in session.execute(select(Keyword.term, Keyword.target))}
    added = 0
    for r in read_csv(path):
        term, target = r["term"].strip(), r["target"].strip()
        kind = kind_of(target)
        if kind is None or (term.lower(), target) in have:
            continue
        session.add(Keyword(term=term, language=r["language"].strip(), target=target, kind=kind, weight=float(r["weight"]),
                            status=r["status"].strip() or "draft", meaning=(r.get("meaning") or "").strip(), added_by="seed"))
        have.add((term.lower(), target))
        added += 1
    session.commit()
    if added:
        invalidate()
    return added


def _rows_from_db() -> list[Row]:
    from .db import Keyword, SessionLocal
    with SessionLocal() as s:
        return [Row(k.id, k.term, k.language, k.target, k.kind, k.weight, k.status, k.meaning)
                for k in s.scalars(select(Keyword).where(Keyword.active.is_(True)))]


def _rows_from_csv() -> list[Row]:
    return [Row(-(i + 1), r["term"].strip(), r["language"], r["target"], kind_of(r["target"]) or "segment",
                float(r["weight"]), r["status"], r.get("meaning") or "")
            for i, r in enumerate(read_csv()) if kind_of(r["target"])]


_STATE: dict[str, Matcher | str | None] = {"matcher": None, "source": None}


def get() -> Matcher:
    """The live matcher, built from the database (or from the CSV if the database is not reachable)."""
    if _STATE["matcher"] is None:
        try:
            rows, source = _rows_from_db(), "database"
        except SQLAlchemyError:
            rows, source = [], "csv"
        if not rows:
            rows, source = _rows_from_csv(), "csv"
        _STATE["matcher"], _STATE["source"] = Matcher(rows), source
    return _STATE["matcher"]  # type: ignore[return-value]


def source() -> str:
    get()
    return str(_STATE["source"])


def invalidate() -> None:
    _STATE["matcher"] = None


def coverage(rows: list[Row]) -> dict:
    """How many keywords each segment / sub-segment has, per language. Thin cells are where errors come from."""
    table: dict[str, Counter] = {}
    for r in rows:
        table.setdefault(r.target, Counter())[r.language] += 1
    return {t: {"total": sum(c.values()), **dict(c)} for t, c in sorted(table.items())}
