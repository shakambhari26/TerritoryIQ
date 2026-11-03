"""Layer 1: rules + slang lexicon. Fast, explainable, and the first opinion on every visit."""
from __future__ import annotations

import re

from .taxonomy import BULK_MT

_RESOLVED = r"addressed|resolved|clarified|sorted"


def _has(text: str, pattern: str) -> bool:
    return re.search(pattern, text, re.I) is not None


def segment_candidates(text: str, ext: dict, lex: dict, word_count: int) -> list[tuple[str, float, str]]:
    """All segments the rules see evidence for, as (segment, confidence, reason), strongest first."""
    t = text
    out: list[tuple[str, float, str]] = []
    if _has(t, r"\bthe audio\b|\bthe recording\b|instructions for (the )?visit|medical check-?up"):
        out.append(("UNCLEAR_RECORDING", 0.9, "describes the recording or a plan, not the visit"))
    complaint = _has(t, r"complain|concern|delay|dispute|problem|issue|rust|crack|unhappy|dissatisf") \
        or "COMPLAINT_ESCALATE" in lex["lex_segments"] or "QUALITY_ISSUE" in lex["lex_flags"]
    if complaint and not _has(t, r"concern(s)? regarding price|price concern"):
        resolved = _has(t, _RESOLVED)
        out.append(("COMPLAINT_ESCALATE", 0.6 if resolved else 0.85, "complaint words" + (" (marked resolved)" if resolved else "")))
    if ext["competitors"] or "COMPETITOR_PRICE" in lex["lex_segments"]:
        out.append(("COMPETITOR_PRICE", 0.85, "competitor mentioned"))
    if _has(t, r"confirm\w* (a |an )?(\d|order)|order (is )?confirmed|placed an order|collected (a )?(small )?order") \
            or (ext["quantity"] and _has(t, r"order")) or "HOT_ORDER" in lex["lex_segments"]:
        confirmed = _has(t, r"confirm|placed|collected|pakka")
        out.append(("HOT_ORDER", 0.9 if confirmed else 0.65, "order " + ("confirmed" if confirmed else "discussed")))
    elif _has(t, r"\border|inventory|requirement"):
        out.append(("HOT_ORDER", 0.5, "order or requirement mentioned"))
    if _has(t, r"payment|outstanding|balance|credit|dues\b|collect") or "PAYMENT" in lex["lex_segments"]:
        out.append(("PAYMENT", 0.75, "payment or credit discussed"))
    if _has(t, r"satisf|happ|advocate|all (are )?(currently )?working on our brand") or "HAPPY_CUSTOMER" in lex["lex_segments"]:
        out.append(("HAPPY_CUSTOMER", 0.8, "satisfaction or loyalty"))
    if _has(t, r"technical|engineer|evaluation|structural|support"):
        out.append(("TECH_SUPPORT", 0.7, "technical help"))
    if _has(t, r"prospect|potential|new (lead|product|site|customer)|strong interest|convert|introduc"):
        out.append(("NEW_LEAD", 0.7, "new opportunity"))
    if ext["construction_stage"] or _has(t, r"\bsites?\b|construction|project|pipeline") or "SITE_PIPELINE" in lex["lex_segments"]:
        out.append(("SITE_PIPELINE", 0.65, "site or construction activity"))
    if word_count < 8 or not out:
        out.append(("LOW_VALUE_VISIT", 0.55 if word_count < 12 else 0.4, "no business outcome found"))
    return sorted(out, key=lambda c: -c[1])


def flags(text: str, ext: dict, lex: dict, stakeholder: str, segment_hits: set[str]) -> list[str]:
    t, out = text, set(lex["lex_flags"]) & {
        "STOCK_OUT", "DELIVERY_PROBLEM", "QUALITY_ISSUE", "SCHEME_ASK", "BRANDING_NEEDED", "BULK_PROJECT", "GOVT_LEAD",
        "CONSTRUCTION_PAUSED", "NEW_DEALER_INTEREST", "QUALITY_PROOF", "PAYMENT_RECEIVED"}
    if ext["follow_up"] or _has(t, r"follow-?up"):
        out.add("FOLLOW_UP")
    if _has(t, r"out of stock|stock-?out|no stock"):
        out.add("STOCK_OUT")
    if _has(t, r"delay|late deliver|not delivered|did not arrive"):
        out.add("DELIVERY_PROBLEM")
    if _has(t, r"quality|rust|crack|weight") and "COMPLAINT_ESCALATE" in segment_hits:
        out.add("QUALITY_ISSUE")
    if _has(t, r"credit"):
        out.add("CREDIT_REQUEST")
    if _has(t, r"full payment|payments? (are |is )?confirmed|cleared|paid|received"):
        out.add("PAYMENT_RECEIVED")
    if _has(t, r"gift|scheme|discount"):
        out.add("SCHEME_ASK")
    if _has(t, r"\bpop\b|point of purchase|branding|signboard|glow ?board|poster"):
        out.add("BRANDING_NEEDED")
    if _has(t, r"offline|paused|stopped|on hold"):
        out.add("CONSTRUCTION_PAUSED")
    if ext["quantity"] and ext["quantity"]["value_mt"] >= BULK_MT.get(stakeholder, BULK_MT["OTHER"]):
        out.add("BULK_PROJECT")
    return sorted(out)


def urgency(segment: str, segment_hits: set[str], flag_list: list[str], ext: dict, text: str) -> tuple[str, str]:
    f = set(flag_list)
    unresolved_complaint = "COMPLAINT_ESCALATE" in segment_hits and not _has(text, _RESOLVED)
    if unresolved_complaint and "QUALITY_ISSUE" in f:
        return "P0", "unresolved quality complaint"
    if "COMPETITOR_PRICE" in segment_hits and _has(text, r"switch|shift|move to|poach|leav"):
        return "P0", "customer may switch to a competitor"
    if "BULK_PROJECT" in f and _has(text, r"pending|approv|discuss|negotiat"):
        return "P0", "bulk deal waiting for a decision"
    if unresolved_complaint or "DELIVERY_PROBLEM" in f:
        return "P1", "complaint or delivery problem"
    if "SWITCH_RISK" in f:
        return "P0", "customer may switch to a competitor"
    if "STOCK_OUT" in f:
        return "P1", "stock-out"
    if "CREDIT_RISK" in f:
        return "P1", "credit risk: cheque bounce or payment default"
    if "LOST_TO_COMPETITOR" in f:
        return "P1", "order lost to a competitor"
    if "COMPETITOR_PRICE" in segment_hits and _has(text, r"price|rate|cheap|lower|cut"):
        return "P1", "competitor price pressure"
    if ext["quantity"] and ext["quantity"]["value_mt"] >= 10 and not _has(text, r"confirm"):
        return "P1", "large order not yet confirmed"
    if ext["construction_stage"] and _has(text, r"starting today|starts today|this week"):
        return "P1", "construction starting now"
    if segment in {"UNCLEAR_RECORDING"}:
        return "P2", "note must be re-recorded"
    if segment in {"LOW_VALUE_VISIT", "HAPPY_CUSTOMER"} or "CONSTRUCTION_PAUSED" in f:
        return "P3", "informational"
    if segment_hits & {"HOT_ORDER", "PAYMENT", "COMPETITOR_PRICE", "NEW_LEAD", "TECH_SUPPORT"} or "BRANDING_NEEDED" in f:
        return "P2", "routine business follow-up"
    if segment == "SITE_PIPELINE" and (ext["quantity"] or _has(text, r"within|expected|pipeline|potential")):
        return "P2", "site demand coming"
    return "P3", "informational"


def sentiment(text: str, lex: dict) -> str:
    neg = _has(text, r"concern|complain|delay|problem|dissatisf|angry|unhappy|issue") and not _has(text, _RESOLVED + r"|satisf")
    pos = _has(text, r"happ|satisf|strong (interest|potential)|expanding|interest") or "HAPPY_CUSTOMER" in lex["lex_segments"]
    return "NEGATIVE" if neg else "POSITIVE" if pos else "NEUTRAL"


def category_mismatch(text: str, visit_category: str) -> bool:
    says_mason = _has(text, r"\bmet (with )?the mason\b|\bhead mason\b")
    return bool(says_mason and visit_category in {"DEALER", "RETAILER"})
