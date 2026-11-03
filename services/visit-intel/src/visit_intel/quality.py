"""Voice Note Quality Score (0-10), the same 5K rubric as the training program (Module 11)."""
from __future__ import annotations

import re

_ROLE = r"mason|dealer|retailer|owner|engineer|contractor|builder|client|customer|prospect|consumer|hardware|enterprise|traders"
_OUTCOME = r"confirm|order|paid|payment|collected|complain|concern|interest|satisf|happ|starting|finished|expected|using|convert|requir|delay|clarified|resolved"
_NUMBER = r"\d"
_NO_ORDER = r"no order|nothing ordered|did not order"
_BRAND = r"elegant|our (brand|company|product)|competitor|rival"


def score(text: str, customer_name: str, segment: str, ext: dict) -> dict:
    t = text or ""
    who = (1 if customer_name else 0) + (1 if re.search(_ROLE, t, re.I) or (customer_name and customer_name.split()[0].lower() in t.lower()) else 0)
    what = 0 if segment in {"LOW_VALUE_VISIT", "UNCLEAR_RECORDING"} else (2 if re.search(_OUTCOME, t, re.I) else 1)
    how_much = 2 if (ext["quantity"] or ext["amount"] or ext["percent_paid"] or re.search(_NO_ORDER, t, re.I)) else (1 if re.search(_NUMBER, t) else 0)
    brand = 1 if (ext["competitors"] or re.search(_BRAND, t, re.I)) else 0
    fu = ext["follow_up"]
    when = 2 if fu and fu["date"] else (1 if fu else 0)
    clarity = 0 if segment == "UNCLEAR_RECORDING" or len(t.split()) < 8 else 1
    parts = {"who": who, "what": what, "how_much": how_much, "brand": brand, "when": when, "clarity": clarity}
    issues = [msg for key, msg in [("what", "no clear result"), ("how_much", "no tonnes or rupees"), ("brand", "brand not named"),
                                   ("when", "no next step with a date"), ("clarity", "unclear or too short")]
              if parts[key] == 0]
    if ext["competitors"] and all(c["brand"] is None for c in ext["competitors"]):
        issues.append("competitor not named")
    return {"score": sum(parts.values()), "parts": parts, "issues": issues}
