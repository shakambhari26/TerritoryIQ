"""Ask a question about the visits.

Accuracy first:
  1. A question that matches a suggested question is answered by exact calculation on the data ("calculated").
  2. Any other question goes to Claude, which can only see the data through three read-only tools and is told to
     use nothing else ("ai"). Needs Anthropic credentials (ANTHROPIC_API_KEY); off otherwise.
  3. Without credentials, the closest suggested questions are offered instead ("unavailable").
"""
from __future__ import annotations

import json
import os
import re
from collections import Counter

import anthropic
from anthropic import beta_tool

from .insights import _filter, _matches, brief, overview
from .taxonomy import FLAGS, SEGMENTS, URGENCY

AI_MODEL = os.environ.get("VISIT_INTEL_AI_MODEL", "claude-opus-5-5")
STOP = {"the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "are", "be", "we", "our", "my", "me", "i",
        "do", "does", "what", "which", "who", "how", "much", "many", "this", "that", "with", "by", "from", "there", "any",
        "can", "should", "need", "needs", "have", "has", "it", "at", "as", "about", "most", "s"}


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP}


def _list(rows, limit=10):
    return [brief(r) for r in rows][:limit]


def _people(rows) -> str:
    return "; ".join(f"{r['customer_name']} ({r['rep_name']})" for r in rows[:5]) + (" …" if len(rows) > 5 else "")


# ---------- calculated answers ----------

def q_attention(rows, meta):
    urgent = sorted((r for r in rows if r["result"]["urgency"]["level"] in ("P0", "P1")), key=lambda r: r["result"]["urgency"]["level"])
    if not urgent:
        return {"answer": "Nothing is urgent right now: no P0 or P1 visits in this period."}
    p0 = sum(r["result"]["urgency"]["level"] == "P0" for r in urgent)
    reasons = Counter(r["result"]["urgency"]["reason"] for r in urgent).most_common(3)
    return {"answer": f"{len(urgent)} visits need attention ({p0} critical, {len(urgent) - p0} high). "
                      f"Main reasons: {', '.join(f'{k} ({n})' for k, n in reasons)}. Each card below has an owner and an action.",
            "visits": _list(urgent), "filter": {"urgency": "P1" if not p0 else "P0"}}


def q_tonnes(rows, meta):
    o = overview(rows)
    with_qty = [r for r in rows if r["result"]["extracted"]["quantity"]]
    return {"answer": f"Reps mentioned {o['tonnes_mentioned']} MT in total; {o['tonnes_confirmed']} MT is confirmed. "
                      f"Only {len(with_qty)} of {len(rows)} notes stated a quantity, so the real pipeline is likely larger. "
                      "Ask reps to always say the tonnes (training Module 3).",
            "visits": _list(sorted(with_qty, key=lambda r: -r["result"]["extracted"]["quantity"]["value_mt"]))}


def q_competitors(rows, meta):
    comp = [r for r in rows if r["result"]["extracted"]["competitors"]]
    if not comp:
        return {"answer": "No competitor was mentioned in this period."}
    brands = Counter((c["brand"] or "not named") for r in comp for c in r["result"]["extracted"]["competitors"])
    reps = Counter(r["rep_name"] for r in comp)
    return {"answer": f"Competitors came up in {len(comp)} of {len(rows)} visits ({round(100 * len(comp) / len(rows))}%). "
                      f"Brands: {', '.join(f'{b} {n}' for b, n in brands.most_common())}. "
                      f"Reps who met them most: {', '.join(f'{r} ({n})' for r, n in reps.most_common(3))}.",
            "visits": _list(comp), "filter": {"segment": "COMPETITOR_PRICE"}}


def q_money(rows, meta):
    pay = [r for r in rows if r["result"]["segment"]["code"] == "PAYMENT" or {"PAYMENT_RECEIVED", "CREDIT_REQUEST"} & set(r["result"]["flags"])]
    if not pay:
        return {"answer": "No payment, dues or credit was discussed in this period."}
    received = [r for r in pay if "PAYMENT_RECEIVED" in r["result"]["flags"]]
    credit = [r for r in pay if "CREDIT_REQUEST" in r["result"]["flags"]]
    amounts = [r["result"]["extracted"]["amount"]["value_inr"] for r in pay if r["result"]["extracted"]["amount"]]
    total = f" Rupee amounts stated: ₹{sum(amounts):,.0f}." if amounts else " No rupee amounts were stated in the notes."
    return {"answer": f"{len(pay)} visits discussed money: {len(received)} with payment received, {len(credit)} asking for credit.{total}",
            "visits": _list(pay), "filter": {"segment": "PAYMENT"}}


def q_top_reps(rows, meta):
    from .insights import vp_sales
    reps = vp_sales(rows)["reps"]
    head = ["Rep", "Visits", "Result rate", "Note score", "Tonnes"]
    table = [[r["rep_name"], r["visits"], f"{round(r['result_rate'] * 100)}%", f"{r['avg_note_score']}/10", r["tonnes"]] for r in reps]
    best = reps[0] if reps else None
    return {"answer": f"{best['rep_name']} leads with a {round(best['result_rate'] * 100)}% result rate over {best['visits']} visits. "
                      "Result rate is the share of visits that produced an order, payment, lead, site demand or customer feedback."
            if best else "No visits yet.", "table": {"head": head, "rows": table}}


def q_coach(rows, meta):
    from .insights import supervisor
    coach = supervisor(rows)["coach"]
    if not coach:
        return {"answer": "Every rep averages 5/10 or better on note quality."}
    return {"answer": f"{len(coach)} reps average under 5/10 on note quality: "
                      + ", ".join(f"{c['rep_name']} ({c['avg_note_score']})" for c in coach)
                      + ". Coach them on the 5K formula: who, what happened, how much, which brand, when next.",
            "table": {"head": ["Rep", "Avg note score", "Notes"], "rows": [[c["rep_name"], f"{c['avg_note_score']}/10", c["notes"]] for c in coach]},
            "filter": {"rep": coach[0]["rep_name"]}}


def q_pipeline(rows, meta):
    pipe = [r for r in rows if r["result"]["segment"]["code"] in ("SITE_PIPELINE", "NEW_LEAD", "HOT_ORDER")]
    seg = Counter(r["result"]["segment"]["name"] for r in pipe)
    return {"answer": f"{len(pipe)} visits are pipeline: " + ", ".join(f"{k} {v}" for k, v in seg.most_common()) + ".",
            "visits": _list(pipe), "filter": {"group": "Demand Pipeline"}}


def q_follow_ups(rows, meta):
    fu = [r for r in rows if "FOLLOW_UP" in r["result"]["flags"]]
    dated = sorted((r for r in fu if r["result"]["extracted"]["follow_up"] and r["result"]["extracted"]["follow_up"]["date"]),
                   key=lambda r: r["result"]["extracted"]["follow_up"]["date"])
    return {"answer": f"{len(fu)} visits promised a follow-up; {len(dated)} have a date. "
                      + (f"Earliest: {dated[0]['customer_name']} on {dated[0]['result']['extracted']['follow_up']['date']}." if dated else ""),
            "visits": _list(dated + [r for r in fu if r not in dated]), "filter": {"flag": "FOLLOW_UP"}}


def q_rerecord(rows, meta):
    bad = [r for r in rows if r["result"]["segment"]["code"] == "UNCLEAR_RECORDING" or r["result"]["note_quality"]["score"] <= 3]
    return {"answer": f"{len(bad)} notes should be re-recorded (unclear, or note score 3/10 or less): {_people(bad)}." if bad
            else "All notes are usable.", "visits": _list(bad), "filter": {"segment": "UNCLEAR_RECORDING"}}


def q_review(rows, meta):
    rev = [r for r in rows if r["result"]["needs_human_review"]]
    return {"answer": f"{len(rev)} visits are waiting for a supervisor to confirm the group." if rev
            else "Nothing is waiting for review. (New visits the system is unsure about will appear here.)",
            "visits": _list(rev), "filter": {"review": "1"}}


def q_customer_type(rows, meta):
    by = Counter(r["result"]["stakeholder"] for r in rows if r["result"]["segment"]["code"] == "HOT_ORDER")
    tot = Counter(r["result"]["stakeholder"] for r in rows)
    table = [[s, tot[s], by.get(s, 0)] for s in sorted(tot)]
    top = by.most_common(1)
    return {"answer": (f"{top[0][0].title()} customers bring the most orders ({top[0][1]})." if top else "No orders in this period.")
            + " INFLUENCER = masons and engineers, CHANNEL/DEALER = dealers and retailers, IHB = house owners.",
            "table": {"head": ["Customer type", "Visits", "Order visits"], "rows": table}}


def q_complaints(rows, meta):
    comp = [r for r in rows if r["result"]["segment"]["code"] == "COMPLAINT_ESCALATE" or {"QUALITY_ISSUE", "DELIVERY_PROBLEM"} & set(r["result"]["flags"])]
    kinds = Counter(f for r in comp for f in r["result"]["flags"] if f in ("QUALITY_ISSUE", "DELIVERY_PROBLEM"))
    return {"answer": (f"{len(comp)} visits raised a complaint. "
                       + (", ".join(f"{FLAGS[k]}: {n}" for k, n in kinds.items()) + "." if kinds else "Type not stated."))
            if comp else "No complaints in this period.", "visits": _list(comp), "filter": {"segment": "COMPLAINT_ESCALATE"}}


def q_no_result(rows, meta):
    nr = [r for r in rows if r["result"]["segment"]["code"] in ("LOW_VALUE_VISIT", "UNCLEAR_RECORDING")]
    return {"answer": f"{len(nr)} of {len(rows)} visits ({round(100 * len(nr) / max(1, len(rows)))}%) produced no business result. "
                      f"Reps: {', '.join(f'{k} ({v})' for k, v in Counter(r['rep_name'] for r in nr).most_common(4))}.",
            "visits": _list(nr), "filter": {"segment": "LOW_VALUE_VISIT"}}


def q_model(rows, meta):
    if not meta:
        return {"answer": "No ML model is loaded; the system is using rules only."}
    weak = sorted(meta["per_class_f1"].items(), key=lambda kv: kv[1])[:3]
    return {"answer": f"Tested on visits it never saw, the model scores macro-F1 {meta['macro_f1']} and accuracy {round(meta['accuracy'] * 100)}%, "
                      f"learned from {meta['rows']} labelled visits. Weakest groups: {', '.join(f'{k} ({v})' for k, v in weak)}. "
                      "Rules and the review step sit on top of the model; scripts/evaluate.py measures the whole app.",
            "table": {"head": ["Group", "Examples", "F1"], "rows": [[k, meta["class_counts"].get(k, 0), v] for k, v in meta["per_class_f1"].items()]}}


def q_data_quality(rows, meta):
    from .insights import data_analyst
    q = data_analyst(rows, meta)["quality"]
    return {"answer": f"{q['invalid_phones']} invalid phone numbers, {len(q['shared_phones'])} phone numbers shared by different customers, "
                      f"{q['category_mismatch']} visits where the customer type does not match the note, and {q['unclear_recordings']} unclear recordings.",
            "table": {"head": ["Phone", "Customers"], "rows": [[s["phone"], ", ".join(s["customers"])] for s in q["shared_phones"]]}}


def q_labels(rows, meta):
    if not meta:
        return {"answer": "No model yet. Label at least 50 visits per group, then run scripts/train.py."}
    thin = {c: n for c, n in meta["class_counts"].items() if n < 50}
    return {"answer": f"{len(thin)} groups have fewer than 50 labelled examples; aim for 50–100 each. "
                      "Export historical transcripts and correct them in the review queue.",
            "table": {"head": ["Group", "Labelled examples"], "rows": sorted(([c, n] for c, n in thin.items()), key=lambda x: x[1])}}


# (id, roles, question, extra keywords, function)
SUGGESTED = [
    ("attention", ["md", "supervisor", "explore"], "Which visits need attention today?", "urgent red critical p0 p1 priority act", q_attention),
    ("tonnes", ["md", "vp_sales"], "How many tonnes are confirmed and in the pipeline?", "mt tons tonnage volume order quantity", q_tonnes),
    ("competitors", ["md", "vp_sales", "business_analyst", "explore"], "Where are competitors hurting us?", "competitor rival brand price shyam srmb tata", q_competitors),
    ("money", ["md", "vp_sales"], "How much money is waiting to be collected?", "payment collection dues outstanding credit cash", q_money),
    ("top_reps", ["vp_sales", "md"], "Which reps produce the most results?", "best top performer rep ranking leaderboard", q_top_reps),
    ("coach", ["vp_sales", "supervisor"], "Which reps need coaching?", "training weak poor note quality score coach", q_coach),
    ("pipeline", ["vp_sales", "supervisor"], "What is in the pipeline?", "site demand opportunity lead upcoming", q_pipeline),
    ("follow_ups", ["supervisor"], "Which follow-ups are due?", "follow up next visit date revisit", q_follow_ups),
    ("rerecord", ["supervisor", "data_analyst"], "Which notes must be re-recorded?", "unclear bad recording vague hallucination", q_rerecord),
    ("review", ["supervisor", "data_analyst"], "Which visits are waiting for my review?", "review queue unsure correct label", q_review),
    ("customer_type", ["business_analyst"], "Which customer type brings the most orders?", "dealer mason retailer ihb engineer stakeholder", q_customer_type),
    ("complaints", ["business_analyst", "md", "supervisor"], "What are customers complaining about?", "complaint delay quality rust problem issue", q_complaints),
    ("no_result", ["business_analyst", "vp_sales"], "How many visits produce no result?", "wasted empty useless no outcome", q_no_result),
    ("model", ["data_analyst"], "How accurate is the model?", "accuracy f1 score performance ml", q_model),
    ("data_quality", ["data_analyst"], "What data quality problems exist?", "phone duplicate invalid mismatch wrong", q_data_quality),
    ("labels", ["data_analyst"], "Which groups need more labelled examples?", "label training data examples retrain", q_labels),
]


def suggestions(role: str) -> list[dict]:
    return [{"id": i, "question": q} for i, roles, q, _, _ in SUGGESTED if role in roles]


def _match(question: str):
    words = _words(question)
    if not words:
        return None
    best, best_score = None, 0.0
    for item in SUGGESTED:
        _, _, text, extra, _ = item
        core = _words(text)
        score = len(words & core) / len(core) + 0.25 * len(words & _words(extra))
        if score > best_score:
            best, best_score = item, score
    return best if best_score >= 0.6 else None


# ---------- AI answers (grounded through tools) ----------

SYSTEM = """You answer questions from Elegant Steel managers about sales-visit data. Elegant Steel sells TMT steel bars \
in West Bengal through dealers, retailers, masons, engineers and house owners (IHB). Each visit has been sorted into a \
group (segment), an urgency (P0 critical, P1 high, P2 medium, P3 low), flags, and facts extracted from the rep's note.

Use the tools to look up every number, name and fact you state. Do not use any other knowledge about this company or its \
customers, and never estimate or invent a figure. If the tools cannot answer the question, say so plainly and say what \
the reps would need to record so it could be answered next time.

Write for busy, non-technical readers: plain English, short sentences, at most 120 words, bullet points when listing. \
Say how many visits the answer is based on. End with one line starting "Recommended:" giving a concrete next step."""


def _ai(question: str, role: str, rows: list[dict]) -> dict:
    client = anthropic.Anthropic()
    seg_codes, levels, flag_codes = ", ".join(SEGMENTS), ", ".join(URGENCY), ", ".join(FLAGS)

    def filtered(segment, urgency, rep, flag, stakeholder, search):
        filt = {"segment": segment, "urgency": urgency, "rep": rep, "flag": flag, "stakeholder": stakeholder, "q": search}
        return [r for r in rows if _matches(r, {k: v for k, v in filt.items() if v})]

    @beta_tool
    def get_overview() -> str:
        """Totals for the selected period: visits, reps, tonnes, urgent count, competitor and payment visits, average note score,
        and visit counts per group and per urgency."""
        o = overview(rows)
        o["date_from"], o["date_to"] = str(o["date_from"]), str(o["date_to"])
        o["per_group"] = dict(Counter(r["result"]["segment"]["name"] for r in rows))
        o["per_urgency"] = dict(Counter(r["result"]["urgency"]["level"] for r in rows))
        return json.dumps(o)

    @beta_tool
    def count_visits(group_by: str, segment: str = "", urgency: str = "", rep: str = "", flag: str = "",
                     stakeholder: str = "", search: str = "") -> str:
        """Count visits, optionally filtered, grouped by one field.

        Args:
            group_by: One of segment, group, urgency, rep, stakeholder, flag, sentiment, competitor, customer.
            segment: Optional segment code filter.
            urgency: Optional urgency filter: P0, P1, P2 or P3.
            rep: Optional exact rep name filter.
            flag: Optional flag code filter.
            stakeholder: Optional customer type filter: DEALER, INFLUENCER, IHB or OTHER.
            search: Optional text that must appear in the note, customer or rep name.
        """
        hits = filtered(segment, urgency, rep, flag, stakeholder, search)
        key = {
            "segment": lambda r: [r["result"]["segment"]["code"]], "group": lambda r: [r["result"]["segment"]["group"]],
            "urgency": lambda r: [r["result"]["urgency"]["level"]], "rep": lambda r: [r["rep_name"]],
            "stakeholder": lambda r: [r["result"]["stakeholder"]], "flag": lambda r: r["result"]["flags"],
            "sentiment": lambda r: [r["result"]["sentiment"]], "customer": lambda r: [r["customer_name"]],
            "competitor": lambda r: [c["brand"] or "not named" for c in r["result"]["extracted"]["competitors"]],
        }.get(group_by)
        if key is None:
            return json.dumps({"error": f"group_by must be one of segment, group, urgency, rep, stakeholder, flag, sentiment, competitor, customer"})
        return json.dumps({"matching_visits": len(hits), "counts": dict(Counter(v for r in hits for v in key(r)).most_common(30))})

    @beta_tool
    def list_visits(segment: str = "", urgency: str = "", rep: str = "", flag: str = "", stakeholder: str = "",
                    search: str = "", limit: int = 10) -> str:
        """List matching visits with the rep's note, extracted facts and the recommended action.

        Args:
            segment: Optional segment code filter.
            urgency: Optional urgency filter: P0, P1, P2 or P3.
            rep: Optional exact rep name filter.
            flag: Optional flag code filter.
            stakeholder: Optional customer type filter: DEALER, INFLUENCER, IHB or OTHER.
            search: Optional text that must appear in the note, customer or rep name.
            limit: Maximum visits to return, 1 to 20.
        """
        hits = filtered(segment, urgency, rep, flag, stakeholder, search)
        out = [{"date": r["visit_at"].isoformat() if r["visit_at"] else None, "rep": r["rep_name"], "customer": r["customer_name"],
                "customer_type": r["visit_category"], "group": r["result"]["segment"]["name"], "urgency": r["result"]["urgency"]["level"],
                "flags": r["result"]["flags"], "tonnes": (r["result"]["extracted"]["quantity"] or {}).get("value_mt"),
                "competitors": [c["brand"] or "not named" for c in r["result"]["extracted"]["competitors"]],
                "note": r["transcript"], "note_score": r["result"]["note_quality"]["score"], "action": r["result"]["action"]["text"]}
               for r in hits[: max(1, min(int(limit), 20))]]
        return json.dumps({"matching_visits": len(hits), "visits": out})

    prompt = (f"Reader's role: {role}.\nSegment codes: {seg_codes}.\nUrgency levels: {levels}.\nFlag codes: {flag_codes}.\n\n"
              f"Question: {question}")
    runner = client.beta.messages.tool_runner(
        model=AI_MODEL,
        max_tokens=4000,
        max_iterations=6,
        system=SYSTEM,
        tools=[get_overview, count_visits, list_visits],
        output_config={"effort": "medium"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        messages=[{"role": "user", "content": prompt}],
    )
    final = runner.until_done()
    if final.stop_reason == "refusal":
        return {"source": "unavailable", "answer": "The AI declined this question. Try one of the suggested questions."}
    text = "".join(b.text for b in final.content if b.type == "text").strip()
    return {"source": "ai", "answer": text or "The AI did not return an answer. Try rephrasing."}


def ai_available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def ask(question: str, role: str, rows: list[dict], days: int | None, model_meta: dict | None) -> dict:
    rows = _filter(rows, days)
    follow = suggestions(role)
    match = _match(question)
    if match:
        qid, _, text, _, fn = match
        out = fn(rows, model_meta)
        return {"question": question, "source": "calculated", "matched_question": text, "visits": [], "table": None, "filter": None,
                **out, "suggestions": [s for s in follow if s["id"] != qid][:4]}
    if ai_available():
        try:
            out = _ai(question, role, rows)
        except anthropic.AuthenticationError:
            out = {"source": "unavailable", "answer": "The AI key is not valid. Ask the admin to check ANTHROPIC_API_KEY."}
        except anthropic.RateLimitError:
            out = {"source": "unavailable", "answer": "The AI is busy right now. Try again in a minute."}
        except (anthropic.APIStatusError, anthropic.APIConnectionError):
            out = {"source": "unavailable", "answer": "The AI could not be reached. Try a suggested question instead."}
        return {"question": question, "matched_question": None, "visits": [], "table": None, "filter": None, **out,
                "suggestions": follow[:4]}
    return {"question": question, "source": "unavailable", "matched_question": None, "visits": [], "table": None, "filter": None,
            "answer": "Free-text AI answers are not switched on yet (an Anthropic API key is needed). "
                      "These questions are answered exactly from your data:", "suggestions": follow[:6]}
