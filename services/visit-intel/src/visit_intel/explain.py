"""Why the system says what it says. Every visit gets a plain-language summary plus the steps behind it, each with the
calculation and the actual numbers, so a manager can check the reasoning instead of trusting a black box.

Also serves the methodology page: how every score on the dashboards is calculated.
"""
from __future__ import annotations

import json
import math
import re
from functools import lru_cache

from . import config
from .keywords import AMBIGUOUS_FACTOR, DECAY, FLAG_THRESHOLD, PRIOR
from .taxonomy import FLAGS, SEGMENTS, URGENCY

Z95 = 1.96


def _name(code: str | None) -> str:
    return SEGMENTS[code][0] if code in SEGMENTS else FLAGS.get(code or "", code or "none")


def wilson(correct: int, n: int) -> tuple[float, float]:
    """95% Wilson score interval for a success rate: honest even for small samples, never outside 0-100%."""
    if n == 0:
        return 0.0, 1.0
    p = correct / n
    centre = p + Z95 ** 2 / (2 * n)
    spread = Z95 * math.sqrt(p * (1 - p) / n + Z95 ** 2 / (4 * n ** 2))
    denom = 1 + Z95 ** 2 / n
    return max(0.0, (centre - spread) / denom), min(1.0, (centre + spread) / denom)


@lru_cache(maxsize=1)
def _track_record() -> dict:
    path = config.MODEL_PATH.parent / "layer_accuracy.json"
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def reliability(decided_by: str) -> dict:
    rec = _track_record()
    if decided_by == "human":
        return {"plain": "A person confirmed this group, so it is treated as correct.", "measured": None}
    path = (rec.get("paths") or {}).get(decided_by) or (rec.get("layers") or {}).get("_auto")
    if not rec or not path or decided_by == "uncertain":
        return {"plain": "Not measured: this visit is waiting for a supervisor to confirm it." if decided_by == "uncertain"
                else "Not measured yet. Run scripts/evaluate.py after labelling visits.", "measured": None}
    lo, hi = wilson(path["correct"], path["n"])
    rate = path["correct"] / path["n"]
    return {
        "plain": f"When the system decided this way on hand-checked visits it was right {path['correct']} of {path['n']} times "
                 f"({rate:.0%}). With so few checks the true rate is likely between {lo:.0%} and {hi:.0%} (95% interval); "
                 "it narrows as supervisors confirm more visits.",
        "math": "Wilson 95% interval: (p + z²/2n ± z·√(p(1−p)/n + z²/4n²)) / (1 + z²/n), with z = 1.96",
        "measured": {"correct": path["correct"], "n": path["n"], "rate": round(rate, 3), "low": round(lo, 3), "high": round(hi, 3),
                     "evaluated_at": rec.get("evaluated_at")},
    }


def _scripts(text: str) -> list[str]:
    out = []
    if re.search(r"[A-Za-z]", text):
        out.append("Roman letters")
    if re.search(r"[ঀ-৿]", text):
        out.append("Bengali script")
    if re.search(r"[ऀ-ॿ]", text):
        out.append("Devanagari (Hindi) script")
    return out


def visit(text: str, result: dict, ml_pulls: dict | None, model_meta: dict | None) -> dict:
    seg = result["segment"]
    ev = result["evidence"]
    kw = ev["keywords"]
    decision = ev["decision"]
    steps = []

    langs = kw["languages"]
    steps.append({
        "id": "read", "title": "1. Reading the note",
        "plain": f"{len(text.split())} words in {', '.join(_scripts(text)) or 'no readable text'}. "
                 + (f"Keywords recognised in: {', '.join(f'{k} ({n})' for k, n in sorted(langs.items()))}." if langs else
                    "No keyword from the database was found."),
    })

    used = [m for m in kw["matches"] if m["effective"] > 0]
    ignored = [m for m in kw["matches"] if m["negated_by"]]
    top3 = kw["probabilities"][:3]
    scores = kw["segment_scores"]
    steps.append({
        "id": "keywords", "title": "2. Keyword database",
        "plain": (f"{len(used)} keyword{'s' * (len(used) != 1)} counted"
                  + (f", {len(ignored)} ignored because negated (e.g. “{ignored[0]['negated_by']} {ignored[0]['matched']}”)" if ignored else "")
                  + f". Strongest group: {_name(kw['top'])} with {kw['top_probability']:.0%}, "
                    f"{kw['margin']:.0%} ahead of the next."),
        "math": f"Score S(group) = prior + Σ weightᵢ × {DECAY}^(i−1) (strongest first, ambiguous words × {AMBIGUOUS_FACTOR}). "
                "Probability P(group) = e^S(group) ÷ Σ e^S(all groups)  (softmax).",
        "table": {"head": ["Heard", "Language", "Evidence for", "Weight", "Counted"],
                  "rows": [[m["matched"], m["language"], _name(m["target"]), m["weight"],
                            "ignored (negated by “%s”)" % m["negated_by"] if m["negated_by"] else m["effective"]]
                           for m in kw["matches"]][:25]},
        "numbers": [{"label": _name(p["segment"]), "score": scores[p["segment"]], "probability": p["probability"]} for p in top3],
        "note": (f"Spread of belief (normalised entropy) = {kw['entropy']:.2f}: 0 means all evidence points to one group, "
                 "1 means no idea." + (f" Prior: {', '.join(f'{_name(k)} +{v}' for k, v in PRIOR.items())} (the default when nothing is said)."
                                       if PRIOR else "")),
    })

    rules = ev["rules"]
    steps.append({
        "id": "rules", "title": "3. Business rules",
        "plain": f"The rules picked {_name(rules['segment'])} ({rules['confidence']:.0%}) because: {rules['reason']}.",
        "math": f"Fixed patterns written with the sales team. A rule result is trusted alone at ≥ {config.RULES_CONFIDENT:.0%}.",
    })

    if ev["ml"]:
        ml_top = ev["ml"][0]
        pulls = ml_pulls or {"for": [], "against": []}
        steps.append({
            "id": "ml", "title": "4. Machine-learning model",
            "plain": f"The model learned from {model_meta['rows'] if model_meta else '?'} hand-labelled visits and says "
                     f"{_name(ml_top['segment'])} ({ml_top['probability']:.0%})."
                     + (f" Biggest reasons: {', '.join(p['feature'] for p in pulls['for'][:3])}." if pulls["for"] else ""),
            "math": "Logistic regression on TF-IDF word and letter patterns + keyword scores: z(group) = b + Σ wⱼ·xⱼ, "
                    "P(group) = softmax(z). TF-IDF weight of a word = (count in note) × log(total notes ÷ notes with the word). "
                    "Pull of a feature = xⱼ × (wⱼ for this group − average wⱼ over all groups).",
            "numbers": [{"label": _name(p["segment"]), "probability": p["probability"]} for p in ev["ml"]],
            "table": {"head": ["Feature", "Pull toward " + _name(ml_top["segment"])],
                      "rows": [[p["feature"], p["pull"]] for p in pulls["for"] + pulls["against"]]},
            "note": (f"Measured without cheating (each visit predicted by a model that never saw it): "
                     f"accuracy {model_meta['accuracy']:.0%}, macro-F1 {model_meta['macro_f1']} "
                     "(the average of per-group F1, so rare groups count as much as common ones).") if model_meta else None,
        })
    else:
        steps.append({"id": "ml", "title": "4. Machine-learning model", "plain": "No trained model is loaded; rules and keywords decide."})

    votes = decision["votes"]
    steps.append({
        "id": "decision", "title": "5. Final decision",
        "plain": decision["step"],
        "math": f"Order of trust: human label → rules ≥ {config.RULES_CONFIDENT:.0%} → 2-of-3 agreement (all three, or the surest "
                f"> {config.AGREE_CONFIDENT:.0%}) → ML ≥ {config.ML_CONFIDENT:.0%} → keywords ≥ {config.KEYWORDS_CONFIDENT:.0%} "
                f"with a {config.KEYWORDS_MARGIN:.0%} lead → otherwise human review.",
        "table": {"head": ["Method", "Says", "Confidence"],
                  "rows": [[k, _name(v["segment"]) if v["segment"] else "—", f"{v['confidence']:.0%}" if v["segment"] else "—"]
                           for k, v in votes.items()]},
    })

    flag_scores = kw["flag_scores"]
    steps.append({
        "id": "flags", "title": "6. Sub-segments (flags)",
        "plain": (", ".join(FLAGS.get(f, f) for f in result["flags"]) or "None") + ".",
        "math": f"A sub-segment is raised when its keyword score reaches {FLAG_THRESHOLD} (one strong word or two weaker ones), "
                "or when a business rule finds it (dates, tonnes, phone checks).",
        "table": {"head": ["Sub-segment", "Keyword score", "Raised"],
                  "rows": [[FLAGS.get(f, f), v, "yes" if f in result["flags"] else "no"] for f, v in sorted(flag_scores.items(), key=lambda x: -x[1])]},
    })

    urg = result["urgency"]
    name, sla = URGENCY[urg["level"]]
    steps.append({
        "id": "urgency", "title": "7. Urgency",
        "plain": f"{urg['level']} · {name} (act within: {sla}) because {urg['reason']}.",
        "math": "The first matching rule wins: P0 unresolved quality complaint / customer may switch / bulk deal waiting → "
                "P1 complaint or delivery problem / stock-out / credit risk / competitor price pressure / big unconfirmed order / "
                "construction starting now → P2 routine follow-up or re-record → P3 information only.",
    })

    nq = result["note_quality"]
    parts = nq["parts"]
    steps.append({
        "id": "note", "title": "8. Note quality score",
        "plain": f"{nq['score']}/10." + (f" Missing: {', '.join(nq['issues'])}." if nq["issues"] else " Complete note."),
        "math": "Sum of the 5K rubric (training Module 11): who (0-2) + what happened (0-2) + how much (0-2) + brand (0-1) + "
                "when next (0-2) + clarity (0-1).",
        "table": {"head": ["Part", "Points"], "rows": [[k.replace("_", " "), v] for k, v in parts.items()]},
    })

    rel = reliability(seg["decided_by"])
    steps.append({"id": "reliability", "title": "9. How far to trust this", "plain": rel["plain"], "math": rel.get("math")})

    top_words = sorted((m for m in used if m["target"] == seg["code"]), key=lambda m: -m["effective"])[:3]
    because = (", ".join(f"“{m['matched']}”" for m in top_words) if top_words else rules["reason"])
    summary = (f"{seg['name']} ({seg['confidence']:.0%}) because of {because}. {decision['step']} "
               f"Urgency {urg['level']}: {urg['reason']}.")
    return {"summary": summary, "steps": steps, "reliability": rel.get("measured")}


METHODOLOGY = [
    {"score": "Segment and confidence", "plain": "Three independent methods (rules, keyword database, ML model) each give an "
     "opinion with a confidence. The final group follows a fixed order of trust; when they disagree and none is confident, "
     "the visit goes to a supervisor instead of being guessed.",
     "math": "Keyword: P = softmax(prior + Σ weightᵢ·0.8^(i−1)). ML: P = softmax(b + Σ wⱼ·TF-IDFⱼ). Confidence shown = the "
     "confidence of the method(s) that decided."},
    {"score": "Keyword weight", "plain": "Each keyword carries evidence: 3 decisive, 2 strong, 1 supporting, 0.5 a hint. "
     "Negated words (“not happy”, “khushi na”) count zero. Ambiguous words (kal, Shyam) count half.",
     "math": "Weights are log-odds: +1 multiplies the odds of that group by e ≈ 2.7."},
    {"score": "Reliability (x of n right)", "plain": "How often this way of deciding was right on hand-checked visits, with a "
     "range that is honest about small samples.", "math": "Wilson 95% interval, z = 1.96."},
    {"score": "Macro-F1", "plain": "The model's grade across all groups, rare ones counting as much as common ones.",
     "math": "F1 = 2·precision·recall ÷ (precision + recall) per group; macro-F1 = their average. Measured with leave-one-out: "
     "each visit is predicted by a model trained on all the others."},
    {"score": "Urgency P0-P3", "plain": "A ladder of business rules; the first that matches sets the urgency and the deadline.",
     "math": "P0 same day · P1 24-48 h · P2 this week · P3 trend reports."},
    {"score": "Note quality (0-10)", "plain": "Whether the rep said who, what, how much, which brand, when next, clearly.",
     "math": "who 0-2 + what 0-2 + how much 0-2 + brand 0-1 + when 0-2 + clarity 0-1."},
    {"score": "Rep result rate", "plain": "Share of a rep's visits that produced a business result (order, payment, lead, site, "
     "competitor intelligence, technical help, happy customer).", "math": "result visits ÷ all visits."},
    {"score": "Tonnes confirmed / mentioned", "plain": "Tonnes said in notes; ‘confirmed’ counts only orders that say confirmed.",
     "math": "Σ MT from notes (quintal ÷ 10; a range 2-3 MT counts as 2.5)."},
    {"score": "Competitor share", "plain": "Share of visits where any rival brand or ‘competitor’ was mentioned.",
     "math": "visits with a competitor ÷ all visits."},
]
