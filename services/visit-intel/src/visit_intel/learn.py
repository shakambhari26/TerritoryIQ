"""The keyword database learns by itself: new words and long-tail phrases (up to 5 words) found in visits whose group
is known, mapped to that group, and retired again when later visits stop agreeing with them.

Which visits teach it:
  * every visit a person labelled (the supervisor's "Correct group"), and
  * "silver" visits: decided automatically by at least two layers agreeing (e.g. rules+keywords+ml), confidence >= 0.8,
    not sent to review. Silver visits count half, so the system cannot talk itself into a word on its own say-so.
A phrase becomes a keyword for group G when
    it is in >= 2 visits of G (3 for a single word),  precision = (weighted) share of its visits that are G >= 80%,  and it is in <= 40% of
    all visits (a phrase everyone says, like "the customer", tells nothing).
Phrases found in exactly the same visits are one piece of evidence: the longest is kept (the long-tail phrase).
Weight from the weighted support s (human 1, silver 0.5 per visit): min(1, 0.5 + 0.25 (s - 2)) x precision, floor
0.25. Two human visits give 0.5, four or more give 1.0; two silver visits only a 0.25 hint. Always weaker than a
hand-made "strong" keyword (2.0).
Learned keywords are saved as status "draft", added_by "auto-learner", so they show and can be switched off in the
Keyword database page. Each run re-checks them; one whose precision falls below 60% is switched off.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import keywords
from .db import Analysis, Keyword, Label, Visit
from .taxonomy import SEGMENTS

AUTHOR = "auto-learner"
MAX_WORDS = 5
MIN_VISITS = 2       # for a phrase of 2+ words: specific, so two visits are enough
MIN_VISITS_WORD = 3  # a single word is more often a coincidence ("project" in two happy visits)
MIN_SUPPORT = 2.0
MIN_PRECISION = 0.8
MAX_SHARE = 0.4
RETIRE_BELOW = 0.6
SILVER = 0.5
# Words that carry no group by themselves, beyond English stop words (Roman Bengali / Hindi fillers and visit boilerplate).
FILLER = {"customer", "client", "visit", "visited", "discussed", "discussion", "regarding", "said", "told", "met", "site",
          "sir", "ji", "da", "dada", "bhai", "ache", "hai", "kore", "theke", "er", "ke", "ki", "ka", "o", "e", "ta", "te"}
_WORD = re.compile(r"[^\W\d_][\w'-]*", re.UNICODE)


@dataclass(frozen=True)
class Example:
    text: str
    segment: str
    weight: float  # 1.0 for a human label, SILVER for an automatic decision


def _dull(word: str) -> bool:
    return word in ENGLISH_STOP_WORDS or word in FILLER or len(word) < 3


def phrases(text: str) -> set[str]:
    """Every 1-5 word phrase that starts and ends on a meaningful word."""
    words = [w.lower() for w in _WORD.findall(text)]
    out = set()
    for n in range(1, MAX_WORDS + 1):
        for i in range(len(words) - n + 1):
            gram = words[i:i + n]
            if not _dull(gram[0]) and not _dull(gram[-1]):
                out.add(" ".join(gram))
    return out


def _language(term: str) -> str:
    if re.search(r"[ঀ-৿]", term):
        return "bn-Beng"
    if re.search(r"[ऀ-ॿ]", term):
        return "hi-Deva"
    return "en"


def _covered(term: str, segment: str, matcher: keywords.Matcher) -> bool:
    """Already evidence for this group: a keyword for it matches inside the phrase."""
    return any(m["target"] == segment and m["effective"] > 0 for m in matcher.score(term)["matches"])


def _stats(examples: list[Example]) -> tuple[dict[str, Counter], dict[str, Counter], dict[str, frozenset[int]]]:
    weighted: dict[str, Counter] = defaultdict(Counter)
    visits: dict[str, Counter] = defaultdict(Counter)
    where: dict[str, set[int]] = defaultdict(set)
    for i, ex in enumerate(examples):
        for p in phrases(ex.text):
            weighted[p][ex.segment] += ex.weight
            visits[p][ex.segment] += 1
            where[p].add(i)
    return weighted, visits, {p: frozenset(s) for p, s in where.items()}


def weight_for(support: float, precision: float) -> float:
    return round(max(0.25, min(1.0, 0.5 + 0.25 * (support - MIN_SUPPORT))) * precision, 2)


def propose(examples: list[Example], matcher: keywords.Matcher) -> list[dict]:
    """New (term, segment, weight) the examples support and the matcher does not know yet. Pure: no database."""
    weighted, visits, where = _stats(examples)
    best: dict[tuple[frozenset[int], str], dict] = {}
    for phrase, counts in weighted.items():
        segment, support = counts.most_common(1)[0]
        precision = support / sum(counts.values())
        if visits[phrase][segment] < (MIN_VISITS if " " in phrase else MIN_VISITS_WORD) or precision < MIN_PRECISION or len(where[phrase]) > MAX_SHARE * len(examples):
            continue
        key = (where[phrase], segment)
        if key in best and len(best[key]["term"]) >= len(phrase):
            continue
        best[key] = {"term": phrase, "target": segment, "visits": visits[phrase][segment], "support": round(support, 2),
                     "precision": round(precision, 3),
                     "weight": weight_for(support, precision)}
    return sorted((p for p in best.values() if not _covered(p["term"], p["target"], matcher)),
                  key=lambda p: (-p["support"], -len(p["term"]), p["term"]))


def recheck(term: str, target: str, examples: list[Example]) -> tuple[float, float]:
    """(support, precision) of an existing learned keyword on today's examples."""
    rx = re.compile(keywords._pattern(term), re.IGNORECASE)
    counts: Counter = Counter()
    for ex in examples:
        if rx.search(ex.text):
            counts[ex.segment] += ex.weight
    seen = sum(counts.values())
    return counts[target], (counts[target] / seen if seen else 1.0)


def examples_from_db(session: Session) -> list[Example]:
    labels: dict[str, str] = {}
    for lab in session.scalars(select(Label).order_by(Label.id)):
        labels[lab.visit_key] = lab.segment  # the latest label wins
    out = []
    for v, a in session.execute(select(Visit, Analysis).join(Analysis, Analysis.visit_key == Visit.visit_key)):
        if v.visit_key in labels:
            out.append(Example(v.transcript, labels[v.visit_key], 1.0))
        elif "+" in a.decided_by and not a.needs_review and a.confidence >= 0.8 and a.segment in SEGMENTS:
            out.append(Example(v.transcript, a.segment, SILVER))
    return out


def learn(session: Session, dry_run: bool = False) -> dict:
    """One learning round: add what the visits now support, re-weigh or retire what was learned before."""
    examples = examples_from_db(session)
    matcher = keywords.get()
    learned = list(session.scalars(select(Keyword).where(Keyword.added_by == AUTHOR)))
    known = {(k.term.lower(), k.target) for k in learned}
    added, retired, reweighed = [], [], []
    for k in learned:
        if not k.active:
            continue
        support, precision = recheck(k.term, k.target, examples)
        if precision < RETIRE_BELOW:
            retired.append({"term": k.term, "target": k.target, "precision": round(precision, 3)})
            k.active = False
        elif (w := weight_for(support, precision)) != k.weight:
            reweighed.append({"term": k.term, "target": k.target, "from": k.weight, "to": w})
            k.weight = w
    for p in propose(examples, matcher):
        if (p["term"], p["target"]) in known:
            continue  # switched off before (by a person or by a re-check): do not bring it back
        added.append(p)
        session.add(Keyword(term=p["term"], language=_language(p["term"]), target=p["target"], kind="segment",
                            weight=p["weight"], status="draft", added_by=AUTHOR,
                            meaning=f"Learned from {p['visits']} visits, {p['precision']:.0%} of them {SEGMENTS[p['target']][0]}"))
    if dry_run:
        session.rollback()
    else:
        session.commit()
        if added or retired or reweighed:
            keywords.invalidate()
    return {"examples": len(examples), "human": sum(e.weight == 1.0 for e in examples),
            "silver": sum(e.weight == SILVER for e in examples), "added": added, "retired": retired,
            "reweighed": reweighed, "dry_run": dry_run}
