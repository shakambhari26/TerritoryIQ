"""Clean a Frontier visit and segment it: rules, then model, then (if they disagree or are unsure) human review."""
from __future__ import annotations

import hashlib
import re
from collections import Counter
from datetime import date, datetime

from . import config, explain, extract, headline, keywords, quality, rules
from .lexicon import Lexicon
from .model import SegmentModel
from .taxonomy import STAKEHOLDER, playbook_action, segment_info

LEX = Lexicon.load()

# Frontier export headers -> our field names. snake_case input is accepted as-is.
FRONTIER_COLUMNS = {
    "Visit ID": "frontier_visit_id",
    "Sales Rep Name": "rep_name", "Visit Date": "visit_date", "Visit Time": "visit_time",
    "Customer Name": "customer_name", "Contact Person": "contact_person", "Contact Number": "contact_number",
    "Visit Category": "visit_category", "Transcript / Remarks": "transcript",
}


def _title(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip().title()


def _parse_when(d: str, t: str) -> datetime | None:
    d, t = (d or "").strip(), (t or "").strip()
    for fmt in ("%d-%m-%Y %I:%M:%S %p", "%d-%m-%Y %I:%M %p", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d/%m/%Y %I:%M:%S %p"):
        try:
            return datetime.strptime(f"{d} {t}".strip(), fmt)
        except ValueError:
            continue
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(d, fmt)
        except ValueError:
            continue
    return None


def normalize(raw: dict) -> dict:
    r = {FRONTIER_COLUMNS.get(k, k): v for k, v in raw.items()}
    phone = re.sub(r"\D", "", str(r.get("contact_number") or ""))
    visit_at = _parse_when(str(r.get("visit_date") or ""), str(r.get("visit_time") or ""))
    key_src = "|".join([str(r.get("frontier_visit_id") or ""), str(r.get("rep_name") or "").lower(), str(r.get("visit_date") or ""),
                        str(r.get("visit_time") or ""), str(r.get("customer_name") or "").lower(), phone])
    return {
        "visit_key": str(r.get("frontier_visit_id") or "").strip()[:64] or hashlib.sha1(key_src.encode()).hexdigest()[:16],
        "rep_name": _title(r.get("rep_name")),
        "visit_at": visit_at,
        "customer_name": _title(r.get("customer_name")),
        "contact_person": _title(r.get("contact_person")),
        "contact_number": phone,
        "visit_category": str(r.get("visit_category") or "").strip().upper(),
        "transcript": re.sub(r"\s+", " ", str(r.get("transcript") or "")).strip(),
    }


def decide(human_label: dict | None, rule: tuple[str, float], kw: dict, ml: tuple[str | None, float]):
    """Three independent opinions (rules, keyword database, ML model), then a fixed order of trust.

    Returns (segment, confidence, decided_by, needs_review, decision) where `decision` records which step fired.
    """
    rule_seg, rule_conf = rule
    ml_seg, ml_conf = ml
    kw_seg = kw["top"] if kw["evidence_found"] else None
    kw_conf = kw["top_probability"]
    votes = {"rules": (rule_seg, rule_conf), "keywords": (kw_seg, kw_conf), "ml": (ml_seg, ml_conf)}

    def out(seg, conf, by, review, step):
        return seg, conf, by, review, {"step": step, "votes": {k: {"segment": s, "confidence": round(c, 3)} for k, (s, c) in votes.items()}}

    if human_label:
        return out(human_label["segment"], 1.0, "human", False, "A reviewer set this group; a human label always wins.")
    if rule_conf >= config.RULES_CONFIDENT:
        return out(rule_seg, rule_conf, "rules", False,
                   f"The rules were confident ({rule_conf:.0%} ≥ {config.RULES_CONFIDENT:.0%}), so they decide.")
    agreeing = [k for k, (s, _) in votes.items() if s == rule_seg]
    if len(agreeing) < 2:
        others = Counter(s for s, _ in votes.values() if s)
        best, n = others.most_common(1)[0] if others else (None, 0)
        if n >= 2:
            agreeing = [k for k, (s, _) in votes.items() if s == best]
    if len(agreeing) >= 2:
        seg = votes[agreeing[0]][0]
        conf = max(votes[k][1] for k in agreeing)
        # Two weak opinions agreeing is not enough: all three must agree, or one of the two must be fairly sure.
        if len(agreeing) == 3 or conf > config.AGREE_CONFIDENT:
            return out(seg, conf, "+".join(agreeing), False,
                       f"{len(agreeing)} of 3 independent methods ({', '.join(agreeing)}) agree"
                       + ("." if len(agreeing) == 3 else f" and the surest is {conf:.0%} (> {config.AGREE_CONFIDENT:.0%})."))
        majority = (seg, conf, f"2 of 3 methods ({', '.join(agreeing)}) agree, but none is more than "
                               f"{config.AGREE_CONFIDENT:.0%} sure, so a supervisor is asked to check. The majority answer is shown.")
    else:
        majority = None
    if ml_seg and ml_conf >= config.ML_CONFIDENT:
        return out(ml_seg, ml_conf, "ml", False, f"The ML model was confident ({ml_conf:.0%} ≥ {config.ML_CONFIDENT:.0%}).")
    if kw_seg and kw_conf >= config.KEYWORDS_CONFIDENT and kw["margin"] >= config.KEYWORDS_MARGIN:
        return out(kw_seg, kw_conf, "keywords", False,
                   f"The keyword evidence was strong ({kw_conf:.0%} ≥ {config.KEYWORDS_CONFIDENT:.0%}, "
                   f"lead over the next group {kw['margin']:.0%} ≥ {config.KEYWORDS_MARGIN:.0%}).")
    if majority:
        return out(*majority[:2], "uncertain", True, majority[2])
    seg, conf, by = max(((s, c, k) for k, (s, c) in votes.items() if s), key=lambda v: v[1])
    return out(seg, conf, "uncertain", True,
               f"The three methods disagree and none is confident, so the surest one ({by}, {conf:.0%}) is shown "
               "and a supervisor is asked to check.")


def analyze(visit: dict, model: SegmentModel | None, human_label: dict | None = None) -> dict:
    """`visit` is a normalized visit. Returns the full result contract stored and served by the API."""
    text = visit["transcript"]
    words = len(text.split())
    visit_day: date | None = visit["visit_at"].date() if visit.get("visit_at") else None
    stakeholder = STAKEHOLDER.get(visit["visit_category"], "OTHER")
    lex = LEX.summary(text)
    ext = extract.extract_all(text, visit_day, LEX)

    candidates = rules.segment_candidates(text, ext, lex, words)
    hits = {c[0] for c in candidates}
    rule_seg, rule_conf, rule_reason = candidates[0]
    kw = keywords.get().score(text)
    ml = model.predict([visit])[0] if model else []
    ml_seg, ml_conf = (ml[0] if ml else (None, 0.0))
    segment, confidence, decided_by, review, decision = decide(human_label, (rule_seg, rule_conf), kw, (ml_seg, ml_conf))
    rep_headline = headline.parse(text)
    if rep_headline and not human_label and rep_headline["segment"] != segment:
        review = True  # the rep and the system disagree: a supervisor settles it, and that becomes a human label
    hits.add(segment)

    secondary = next((c[0] for c in candidates if c[0] != segment and c[1] >= 0.6), None)
    flag_list = sorted(set(rules.flags(text, ext, lex, stakeholder, hits)) | set(kw["flags"]))
    if rules.category_mismatch(text, visit["visit_category"]):
        flag_list.append("CATEGORY_MISMATCH")
    if visit["contact_number"] and not re.fullmatch(r"[6-9]\d{9}", visit["contact_number"]):
        flag_list.append("PHONE_INVALID")
    level, level_reason = rules.urgency(segment, hits, flag_list, ext, text)
    if human_label and human_label.get("urgency"):
        level, level_reason = human_label["urgency"], "set by reviewer"
    note = quality.score(text, visit["customer_name"], segment, ext)

    result = {
        "segment": {**segment_info(segment), "confidence": round(confidence, 3), "decided_by": decided_by,
                    "secondary": segment_info(secondary) if secondary else None},
        "evidence": {"rules": {"segment": rule_seg, "confidence": rule_conf, "reason": rule_reason},
                     "ml": [{"segment": s, "probability": round(p, 3)} for s, p in ml[:3]],
                     "lexicon": lex,
                     "keywords": kw,
                     "decision": decision},
        "urgency": {"level": level, "reason": level_reason},
        "stakeholder": stakeholder,
        "sentiment": rules.sentiment(text, lex),
        "flags": sorted(set(flag_list)),
        "extracted": ext,
        "note_quality": note,
        "action": playbook_action(level, segment, flag_list),
        "needs_human_review": review,
        "rep_headline": rep_headline,
        "model_version": model.version if model else "rules-only",
    }
    pulls = model.contributions(visit, ml_seg) if model and ml_seg else None
    result["explanation"] = explain.visit(text, result, pulls, model.meta if model else None)
    return result
