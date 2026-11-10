"""Which words in a transcript drove the decision, as character spans the front end can colour.

Kinds: "decisive" (a keyword for the group the system chose), "other" (a keyword for a different group), "flag" (a
sub-topic keyword), "negated" (a keyword cancelled by a nearby "not"/"na"/"nahi"), and "ml" (a word the trained model
leaned on most for the chosen group). Spans never overlap: the longer one wins, then the kind higher in that list.
"""
from __future__ import annotations

import re

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

PRIORITY = {"negated": 0, "decisive": 1, "flag": 2, "other": 3, "ml": 4}
ML_WORD = re.compile(r'^word "(.+)"$')


def spans(transcript: str, result: dict) -> list[dict]:
    segment = result["segment"]["code"]
    out = []
    for m in (result.get("evidence") or {}).get("keywords", {}).get("matches", []):
        start, end = m["at"], m["at"] + len(m["matched"])
        if transcript[start:end].lower().replace("’", "'") != m["matched"].lower():
            continue  # the transcript changed since it was scored
        kind = ("negated" if m["negated_by"] else "flag" if m["kind"] == "flag"
                else "decisive" if m["target"] == segment else "other")
        out.append({"start": start, "end": end, "kind": kind, "target": m["target"], "weight": m["effective"],
                    "by": "keywords", "negated_by": m["negated_by"]})
    ml_step = next((s for s in (result.get("explanation") or {}).get("steps", []) if s["id"] == "ml"), None)
    for label, pull in ((ml_step or {}).get("table") or {}).get("rows", []):
        word = ML_WORD.match(str(label))
        if not word or not isinstance(pull, (int, float)) or pull <= 0:
            continue
        if all(w in ENGLISH_STOP_WORDS for w in word.group(1).lower().split()):
            continue  # "is", "the": real model features, but nothing a reader can learn from
        for hit in re.finditer(rf"(?<!\w){re.escape(word.group(1))}(?!\w)", transcript, re.IGNORECASE):
            out.append({"start": hit.start(), "end": hit.end(), "kind": "ml", "target": segment, "weight": round(pull, 3),
                        "by": "ml", "negated_by": None})
    out.sort(key=lambda s: (-(s["end"] - s["start"]), PRIORITY[s["kind"]]))
    kept: list[dict] = []
    for s in out:
        if all(s["end"] <= k["start"] or s["start"] >= k["end"] for k in kept):
            kept.append(s)
    return sorted(kept, key=lambda s: s["start"])
