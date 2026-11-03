"""Recommendations: plain-language next steps computed from the visits. Rules, not AI, so they are always grounded.

Each recommendation carries a `filter` that opens the matching visits in the All-visits view.
"""
from __future__ import annotations

from collections import Counter, defaultdict

from .taxonomy import SEGMENTS

PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _rec(rid, priority, title, why, action, owner, roles, filt=None, count=None) -> dict:
    return {"id": rid, "priority": priority, "title": title, "why": why, "action": action, "owner": owner,
            "roles": roles, "filter": filt or {}, "count": count}


def _seg(r) -> str:
    return r["result"]["segment"]["code"]


def build(rows: list[dict], model_meta: dict | None) -> list[dict]:
    if not rows:
        return [_rec("no-data", "high", "No visits yet", "Nothing has been imported.", "Import Frontier transcripts (scripts/backfill.py).",
                     "Data team", ["md", "vp_sales", "supervisor", "business_analyst", "data_analyst", "explore"])]
    recs = []
    n = len(rows)
    urgent = [r for r in rows if r["result"]["urgency"]["level"] in ("P0", "P1")]
    p0 = [r for r in urgent if r["result"]["urgency"]["level"] == "P0"]
    if p0:
        recs.append(_rec("p0", "high", f"Act today on {len(p0)} critical visit{'s' * (len(p0) > 1)}",
                         "P0 means a quality complaint, a customer about to switch, or a bulk deal waiting.",
                         "Area Sales Manager calls each customer today and reports back.", "Area Sales Manager",
                         ["md", "supervisor", "explore"], {"urgency": "P0"}, len(p0)))
    if len(urgent) > len(p0):
        k = len(urgent) - len(p0)
        recs.append(_rec("p1", "high", f"Follow up {k} high-urgency visit{'s' * (k > 1)} within 48 hours",
                         "Delays, competitor pressure, big unconfirmed orders or construction starting now.",
                         "Supervisor assigns each one and checks it is closed in 48 hours.", "Supervisor",
                         ["md", "supervisor", "vp_sales", "explore"], {"urgency": "P1"}, k))

    comp = [r for r in rows if r["result"]["extracted"]["competitors"]]
    unnamed = [r for r in comp if all(c["brand"] is None for c in r["result"]["extracted"]["competitors"])]
    if unnamed:
        recs.append(_rec("competitor-unnamed", "medium", f"{len(unnamed)} competitor mention{'s' * (len(unnamed) > 1)} without a brand name",
                         "We cannot see which brand is winning or at what price.",
                         "Remind reps (training Module 4): always say the brand and its price per kg.", "Supervisor",
                         ["vp_sales", "supervisor", "business_analyst", "explore"], {"segment": "COMPETITOR_PRICE"}, len(unnamed)))
    if comp and len(comp) / n >= 0.1:
        recs.append(_rec("competitor-share", "medium", f"Competitors came up in {round(100 * len(comp) / n)}% of visits",
                         "One visit in ten or more means real price pressure in the market.",
                         "Review dealer margin or a mason scheme for the affected areas.", "VP Sales",
                         ["md", "vp_sales", "business_analyst"], {"segment": "COMPETITOR_PRICE"}, len(comp)))

    pending = [r for r in rows if _seg(r) == "HOT_ORDER" and (q := r["result"]["extracted"]["quantity"])
               and q["value_mt"] >= 5 and "confirm" not in r["transcript"].lower()]
    if pending:
        mt = sum(r["result"]["extracted"]["quantity"]["value_mt"] for r in pending)
        recs.append(_rec("pending-orders", "high", f"Close {mt:g} MT of orders still under discussion",
                         f"{len(pending)} order{'s are' if len(pending) > 1 else ' is'} talked about but not confirmed.",
                         "Confirm quantity, sizes, delivery date and payment terms this week.", "VP Sales",
                         ["md", "vp_sales", "supervisor"], {"segment": "HOT_ORDER"}, len(pending)))

    sites = [r for r in rows if _seg(r) == "SITE_PIPELINE"]
    if sites:
        recs.append(_rec("site-demand", "medium", f"Visit {len(sites)} active site{'s' * (len(sites) > 1)} before the next stage",
                         "Steel is bought just before casting; being there first wins the order.",
                         "Plan visits to sites at foundation, column or roof stage.", "Field rep",
                         ["vp_sales", "supervisor", "explore"], {"segment": "SITE_PIPELINE"}, len(sites)))

    happy = [r for r in rows if _seg(r) == "HAPPY_CUSTOMER"]
    if happy:
        recs.append(_rec("referrals", "low", f"Ask {len(happy)} happy customer{'s' * (len(happy) > 1)} for referrals",
                         "Satisfied masons and house owners are the cheapest source of new leads.",
                         "Request one referral or a short testimonial from each.", "Field rep",
                         ["md", "vp_sales"], {"segment": "HAPPY_CUSTOMER"}, len(happy)))

    unclear = [r for r in rows if _seg(r) == "UNCLEAR_RECORDING"]
    if unclear:
        recs.append(_rec("re-record", "medium", f"Get {len(unclear)} unclear note{'s' * (len(unclear) > 1)} re-recorded",
                         "These notes describe the recording or a plan, or contain words that make no sense.",
                         "Supervisor asks the rep to re-record while they still remember the visit.", "Supervisor",
                         ["supervisor", "data_analyst", "explore"], {"segment": "UNCLEAR_RECORDING"}, len(unclear)))

    no_date = [r for r in rows if (fu := r["result"]["extracted"]["follow_up"]) and not fu["date"]]
    if no_date:
        recs.append(_rec("follow-up-dates", "low", f"{len(no_date)} follow-up{'s have' if len(no_date) > 1 else ' has'} no date",
                         "“Follow-up required” without a day is easily forgotten.",
                         "Reps must say the day and date (training Module 3: the “kal” problem).", "Supervisor",
                         ["supervisor"], {"flag": "FOLLOW_UP"}, len(no_date)))

    by_rep: dict[str, list[int]] = defaultdict(list)
    for r in rows:
        by_rep[r["rep_name"]].append(r["result"]["note_quality"]["score"])
    weak = sorted((rep for rep, s in by_rep.items() if sum(s) / len(s) < 5), key=lambda rep: sum(by_rep[rep]) / len(by_rep[rep]))
    if weak:
        names = ", ".join(weak[:3]) + (f" and {len(weak) - 3} more" if len(weak) > 3 else "")
        recs.append(_rec("coach", "medium", f"Coach {len(weak)} rep{'s' * (len(weak) > 1)} on the 5K note formula",
                         f"Average note score under 5/10: {names}.",
                         "15-minute 1-to-1 using their three weakest notes (training Module 13).", "Supervisor",
                         ["supervisor", "vp_sales"], {"rep": weak[0]}, len(weak)))

    review = [r for r in rows if r["result"]["needs_human_review"]]
    if review:
        recs.append(_rec("review", "medium", f"Check {len(review)} visit{'s' * (len(review) > 1)} the system was unsure about",
                         "Every correction becomes training data and makes the system more accurate.",
                         "Open Supervisor → “Check and correct” and pick the right group.", "Supervisor",
                         ["supervisor", "data_analyst"], {"review": "1"}, len(review)))

    phones: dict[str, set] = defaultdict(set)
    for r in rows:
        if r["contact_number"]:
            phones[r["contact_number"]].add(r["customer_name"])
    shared = sum(1 for c in phones.values() if len(c) > 1)
    invalid = sum("PHONE_INVALID" in r["result"]["flags"] for r in rows)
    if shared or invalid:
        recs.append(_rec("phones", "medium", "Fix customer phone numbers in Frontier",
                         f"{shared} number{'s are' if shared != 1 else ' is'} shared by different customers; {invalid} invalid.",
                         "Ask the Frontier team to validate 10-digit numbers and warn on duplicates.", "Data team",
                         ["data_analyst"], {"flag": "PHONE_INVALID"} if invalid else {}, shared + invalid))

    if model_meta:
        thin = [c for c, k in model_meta.get("class_counts", {}).items() if k < 20]
        if thin:
            recs.append(_rec("labels", "high" if model_meta["rows"] < 200 else "medium",
                             f"Label more visits: {len(thin)} group{'s have' if len(thin) > 1 else ' has'} fewer than 20 examples",
                             f"The model learned from only {model_meta['rows']} visits (macro-F1 {model_meta['macro_f1']}).",
                             "Export historical transcripts, then correct 300–500 in the review queue and retrain.", "Data team",
                             ["data_analyst", "md"], {}, len(thin)))

    no_result = Counter(r["rep_name"] for r in rows if _seg(r) in ("LOW_VALUE_VISIT", "UNCLEAR_RECORDING"))
    heavy = [rep for rep, k in no_result.items() if k >= 2]
    if heavy:
        recs.append(_rec("no-result", "low", f"{len(heavy)} rep{'s' * (len(heavy) > 1)} with repeated no-result visits",
                         ", ".join(heavy[:3]) + " recorded 2 or more visits with no business outcome.",
                         "Check whether the visits are planned with a purpose (order, payment, site, lead).", "VP Sales",
                         ["vp_sales"], {"rep": heavy[0]}, len(heavy)))

    return sorted(recs, key=lambda r: PRIORITY_ORDER[r["priority"]])


def for_role(role: str, rows: list[dict], model_meta: dict | None) -> list[dict]:
    return [r for r in build(rows, model_meta) if role in r["roles"] or role == "explore"][:6]


def segment_name(code: str) -> str:
    return SEGMENTS[code][0] if code in SEGMENTS else code
