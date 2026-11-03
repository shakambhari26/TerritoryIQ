"""Chat over the visits: retrieval-augmented, local first.

Cost ladder, cheapest first; each step only runs if the one before could not answer well:
  1. calculated  a suggested question (ask.py): exact numbers, no API.
  2. local       the question is parsed into filters (rep, customer, group, urgency, flag, brand, customer type, dates)
                 and an intent (count, list, rank, tonnes, money, lookup); the answer is computed from the data and the
                 best-matching notes are found with a TF-IDF index that also knows the Bengali/Hindi slang lexicon.
                 No API.
  3. cached      the same question on the same data was already answered by the AI. No API.
  4. ai          "why / summarise / compare / what should we do" questions, or a local answer with low confidence:
                 Claude gets only the top retrieved visits and the computed figures, and must answer from them.
                 One API call. Off unless Anthropic credentials are set.

The index is rebuilt automatically when the data changes (new visits, new analyses), so answers are real time.
"""
from __future__ import annotations

import hashlib
import re
from collections import Counter, OrderedDict
from datetime import datetime, timedelta

import anthropic
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

from . import ask as asker
from .insights import brief, overview
from .lexicon import Lexicon
from .taxonomy import FLAGS, SEGMENTS

LEX = Lexicon.load()

SEGMENT_WORDS = {
    "HOT_ORDER": r"\border(s|ed|ing)?\b|purchas|\bbuy",
    "PAYMENT": r"payment|money|collect|dues|outstanding|cash",
    "COMPETITOR_PRICE": r"competitor|rival|price|pricing|\brate\b|cheaper|other brand",
    "COMPLAINT_ESCALATE": r"complain|complaint|problem|issue|delay|angry|unhappy",
    "SITE_PIPELINE": r"\bsites?\b|construction|roof|casting|pipeline",
    "NEW_LEAD": r"\bleads?\b|prospect|opportunit|new customer",
    "TECH_SUPPORT": r"technical|tech support",
    "HAPPY_CUSTOMER": r"happy|satisf|champion|loyal",
    "LOW_VALUE_VISIT": r"no result|useless|wasted|empty visit",
    "UNCLEAR_RECORDING": r"unclear|bad recording|re-?record|hallucinat",
}
FLAG_WORDS = {
    "CREDIT_REQUEST": r"credit", "STOCK_OUT": r"stock-?out|out of stock|no stock", "DELIVERY_PROBLEM": r"deliver",
    "FOLLOW_UP": r"follow-?up", "BRANDING_NEEDED": r"branding|poster|signboard|\bpop\b", "SCHEME_ASK": r"scheme|gift|discount",
    "QUALITY_ISSUE": r"quality|rust", "BULK_PROJECT": r"bulk|big order|large order|builder",
}
CATEGORY_WORDS = {
    "DEALER": r"\bdealers?\b|distributor", "RETAILER": r"retailer|\bshops?\b|hardware",
    "MASON": r"\bmasons?\b|mistri", "NEW MASON": r"new masons?", "ENGINEER": r"engineer",
    "IHB": r"house owner|\bihb\b|home builder|individual", "INFLUENCER": r"influencer",
}
SYNTHESIS = r"\bwhy\b|summar|explain|compare|comparison|trend|insight|should we|recommend|advice|suggest|strategy|analy[sz]e|what do you think|overall"
FOLLOW_ON = r"^(and|what about|how about|only|same for|now)\b"
COMMON = {"what", "which", "who", "how", "many", "much", "the", "and", "for", "with", "about", "visit", "visits", "show", "list",
          "tell", "say", "said", "give", "this", "that", "week", "today", "month", "most", "least", "best", "top", "have", "has",
          "did", "does", "were", "was", "are", "from", "last", "days", "all", "any", "steel", "elegant", "customer", "customers",
          # Words in many shop names; alone they do not identify a customer.
          "enterprise", "enterprises", "hardware", "traders", "builders", "agency", "store", "stores", "private", "limited"}


def _has(text: str, pattern: str) -> bool:
    return re.search(pattern, text, re.I) is not None


# ---------- index ----------

class VisitIndex:
    """TF-IDF over each visit's note plus its labels and the lexicon's English meaning of any slang in it."""

    def __init__(self, rows: list[dict]):
        self.rows = rows
        docs = [self._doc(r) for r in rows]
        self.words = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english")
        self.chars = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
        self.Xw = self.words.fit_transform(docs) if docs else None
        self.Xc = self.chars.fit_transform(docs) if docs else None

    @staticmethod
    def _doc(r: dict) -> str:
        res = r["result"]
        slang = " ".join(LEX.rows_by_id[m.term_id]["meaning_en"] for m in LEX.tag(r["transcript"]))
        return " ".join([r["transcript"], r["customer_name"], r["contact_person"], r["rep_name"], r["visit_category"],
                         res["segment"]["name"], res["segment"]["group"], " ".join(FLAGS.get(f, f) for f in res["flags"]),
                         " ".join(c["brand"] or "competitor" for c in res["extracted"]["competitors"]), slang])

    def search(self, query: str, candidates: list[int] | None = None, k: int = 10) -> list[tuple[int, float]]:
        if self.Xw is None or not query.strip():
            return []
        expanded = query + " " + " ".join(LEX.rows_by_id[m.term_id]["meaning_en"] for m in LEX.tag(query))
        score = 0.7 * linear_kernel(self.words.transform([expanded]), self.Xw).ravel() \
            + 0.3 * linear_kernel(self.chars.transform([expanded]), self.Xc).ravel()
        idx = np.array(candidates if candidates is not None else range(len(self.rows)), dtype=int)
        if not len(idx):
            return []
        order = idx[np.argsort(-score[idx])][:k]
        return [(int(i), float(score[i])) for i in order]


_INDEX: dict = {"version": None, "index": None}


def data_version(rows: list[dict]) -> str:
    h = hashlib.sha1()
    for r in rows:
        h.update(f"{r['visit_key']}|{r['result']['segment']['code']}|{r['result']['urgency']['level']}|{r['result']['model_version']}".encode())
    return h.hexdigest()[:16]


def index_for(rows: list[dict]) -> VisitIndex:
    v = data_version(rows)
    if _INDEX["version"] != v:  # new or re-analysed visits: rebuild (milliseconds for thousands of visits)
        _INDEX.update(version=v, index=VisitIndex(rows))
    return _INDEX["index"]


# ---------- question understanding ----------

def parse(question: str, rows: list[dict], previous: dict | None = None) -> dict:
    q = question.lower()
    words = set(re.findall(r"[a-z]+", q))
    f: dict = {}
    segs = [code for code, p in SEGMENT_WORDS.items() if _has(q, p)]
    lex = LEX.summary(question)
    segs += [s for s in lex["lex_segments"] if s in SEGMENTS and s not in segs]
    if segs:
        f["segments"] = segs
    flags = [code for code, p in FLAG_WORDS.items() if _has(q, p)]
    if flags:
        f["flags"] = flags
    if m := re.search(r"\bp([0-3])\b", q):
        f["urgency"] = [f"P{m.group(1)}"]
    elif _has(q, r"urgent|critical|attention|red list"):
        f["urgency"] = ["P0", "P1"]
    cats = [c for c, p in CATEGORY_WORDS.items() if _has(q, p)]
    if "INFLUENCER" in cats or "MASON" in cats:
        cats += ["MASON", "NEW MASON", "ENGINEER", "INFLUENCER"] if "INFLUENCER" in cats else ["NEW MASON"]
    if cats:
        f["categories"] = sorted(set(cats))
    brands = lex["lex_competitors"]
    if brands:
        f["brands"] = brands

    reps = sorted({r["rep_name"] for r in rows})
    rep_hits = [rep for rep in reps if any(len(t) >= 4 and t in words for t in rep.lower().split())]
    rep_tokens = {t for rep in reps for t in rep.lower().split()}
    # A customer matches on its distinctive name words; keep only the best-matching customers ("Mohan Das" beats
    # every other Das).
    cust_score = {}
    for r in rows:
        tokens = {t for t in re.findall(r"[a-z]+", (r["customer_name"] + " " + r["contact_person"]).lower())
                  if len(t) >= 4 and t not in COMMON and t not in rep_tokens}
        if hit := len(tokens & words):
            cust_score[r["customer_name"]] = max(hit, cust_score.get(r["customer_name"], 0))
    best = max(cust_score.values(), default=0)
    cust_hits = sorted(c for c, n in cust_score.items() if n == best)
    if rep_hits:
        f["reps"] = rep_hits
    if cust_hits and len(cust_hits) <= 5:
        f["customers"] = cust_hits

    now = datetime.now()
    if _has(q, r"\btoday\b"):
        f["since"] = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif _has(q, r"yesterday"):
        f["since"] = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif _has(q, r"this week|last 7 days|past week"):
        f["since"] = now - timedelta(days=7)
    elif _has(q, r"this month|last 30 days|past month"):
        f["since"] = now - timedelta(days=30)

    if previous and _has(q.strip(), FOLLOW_ON):
        f = {**{k: v for k, v in previous.items() if k != "since"}, **f}

    if _has(q, SYNTHESIS):
        intent = "synthesis"
    elif _has(q, r"how many (tonnes|tons|mt)|how much (steel|tonnage)|\btonnage\b|\bmt\b"):
        intent = "tonnes"
    elif _has(q, r"how much (money|payment)|rupees|amount"):
        intent = "money"
    elif _has(q, r"\b(most|least|top|best|worst|highest|lowest)\b") and _has(q, r"\brep|sales ?(man|person|people)|who\b"):
        intent = "rank_rep"
    elif _has(q, r"\b(most|top|highest)\b") and _has(q, r"customer|dealer|mason|retailer"):
        intent = "rank_customer"
    elif _has(q, r"how many|number of|count"):
        intent = "count"
    elif (f.get("customers") or f.get("reps")) and _has(q, r"tell me about|what did|what does|about|said|say|status|history|latest"):
        intent = "lookup"
    elif _has(q, r"\b(which|list|show|who|what|find|give)\b"):
        intent = "list"
    else:
        intent = "search"
    return {"intent": intent, "filters": f}


def apply(rows: list[dict], f: dict) -> list[int]:
    out = []
    for i, r in enumerate(rows):
        res = r["result"]
        if f.get("segments") and res["segment"]["code"] not in f["segments"] and not (res["segment"].get("secondary") or {}).get("code") in f["segments"]:
            continue
        if f.get("flags") and not set(f["flags"]) & set(res["flags"]):
            continue
        if f.get("urgency") and res["urgency"]["level"] not in f["urgency"]:
            continue
        if f.get("categories") and r["visit_category"] not in f["categories"]:
            continue
        if f.get("brands") and not set(f["brands"]) & {c["brand"] for c in res["extracted"]["competitors"]}:
            continue
        if f.get("reps") and r["rep_name"] not in f["reps"]:
            continue
        if f.get("customers") and r["customer_name"] not in f["customers"]:
            continue
        if f.get("since") and (not r["visit_at"] or r["visit_at"] < f["since"]):
            continue
        out.append(i)
    return out


def describe(f: dict) -> str:
    parts = []
    if f.get("segments"):
        parts.append(" or ".join(SEGMENTS[s][0] for s in f["segments"]))
    if f.get("flags"):
        parts.append(" / ".join(FLAGS[x] for x in f["flags"]))
    if f.get("urgency"):
        parts.append("urgency " + "/".join(f["urgency"]))
    if f.get("categories"):
        parts.append(", ".join(sorted({c.title() for c in f["categories"]})))
    if f.get("brands"):
        parts.append("brand " + ", ".join(f["brands"]))
    if f.get("reps"):
        parts.append("rep " + ", ".join(f["reps"]))
    if f.get("customers"):
        parts.append("customer " + ", ".join(f["customers"]))
    if f.get("since"):
        parts.append("since " + f["since"].strftime("%d %b"))
    return "; ".join(parts) or "all visits"


def _explore_filter(f: dict) -> dict:
    """The part of the parsed filters the All-visits page can show (one value per dropdown)."""
    out = {}
    if f.get("segments") and len(f["segments"]) == 1:
        out["segment"] = f["segments"][0]
    if f.get("flags") and len(f["flags"]) == 1:
        out["flag"] = f["flags"][0]
    if f.get("urgency") and len(f["urgency"]) == 1:
        out["urgency"] = f["urgency"][0]
    if f.get("reps") and len(f["reps"]) == 1:
        out["rep"] = f["reps"][0]
    if f.get("customers") and len(f["customers"]) == 1:
        out["q"] = f["customers"][0]
    return out


def _sentence(text: str, query: str) -> str:
    """The sentence of a note that best matches the question, so the answer quotes the evidence."""
    terms = {w for w in re.findall(r"[a-z]+", query.lower()) if len(w) > 3 and w not in COMMON}
    # Split only where a new sentence starts with a capital, so "e.g. price" stays in one piece.
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z])", text) if s.strip()]
    if not sentences:
        return text
    return max(sentences, key=lambda s: sum(t in s.lower() for t in terms))


# ---------- local answers ----------

def answer_local(question: str, rows: list[dict], previous: dict | None) -> dict:
    p = parse(question, rows, previous)
    intent, f = p["intent"], p["filters"]
    idx = index_for(rows)
    hits = apply(rows, f)
    soft_dropped = False
    if f.get("segments") and not hits and intent in ("list", "search", "lookup"):
        # Segment words can be topics ("what did masons say about price"), not hard filters: retry without them.
        hits, soft_dropped = apply(rows, {k: v for k, v in f.items() if k != "segments"}), True
    has_filters = bool(f)
    ranked = idx.search(question, hits if has_filters else None, k=10)
    top = [i for i, s in ranked if s > 0.02] or (hits[:10] if has_filters else [])
    scope = describe({k: v for k, v in f.items() if not (soft_dropped and k == "segments")})
    sel = [rows[i] for i in hits]
    n = len(sel)

    if f.get("since") and not sel:
        latest = max((r["visit_at"] for r in rows if r["visit_at"]), default=None)
        return _out("local", "high", f"No visits match {scope}." + (f" The latest visits are from {latest:%d %b %Y}." if latest else ""),
                    [], f, intent)
    if intent == "count":
        by = Counter(r["result"]["segment"]["name"] for r in sel)
        text = f"{_n(n)} {scope}." + (" By group: " + ", ".join(f"{k} {v}" for k, v in by.most_common(5)) + "." if n else "")
        return _out("local", "high" if has_filters else "medium", text, sel[:5], f, intent)
    if intent == "tonnes":
        q = [(r, r["result"]["extracted"]["quantity"]["value_mt"]) for r in sel if r["result"]["extracted"]["quantity"]]
        total = sum(v for _, v in q)
        conf = [v for r, v in q if "confirm" in r["transcript"].lower()]
        text = (f"{total:g} MT mentioned in {len(q)} of {n} visits ({scope}); {sum(conf):g} MT confirmed."
                + (f" {n - len(q)} notes gave no quantity, so the real figure is likely higher." if n - len(q) else ""))
        return _out("local", "high", text, [r for r, _ in sorted(q, key=lambda x: -x[1])][:5], f, intent)
    if intent == "money":
        a = [(r, r["result"]["extracted"]["amount"]["value_inr"]) for r in sel if r["result"]["extracted"]["amount"]]
        pay = [r for r in sel if r["result"]["segment"]["code"] == "PAYMENT" or {"PAYMENT_RECEIVED", "CREDIT_REQUEST"} & set(r["result"]["flags"])]
        text = (f"{len(pay)} visits ({scope}) discussed payment or credit. "
                + (f"Amounts stated: ₹{sum(v for _, v in a):,.0f} across {len(a)} notes." if a else "No rupee amounts were stated in the notes."))
        return _out("local", "high", text, pay[:5], f, intent)
    if intent == "rank_rep":
        c = Counter(r["rep_name"] for r in sel)
        if not c:
            return _out("local", "medium", f"No visits match {scope}.", [], f, intent)
        text = f"Reps with the most visits matching {scope}: " + ", ".join(f"{k} ({v})" for k, v in c.most_common(5)) + "."
        return _out("local", "high", text, [r for r in sel if r["rep_name"] == c.most_common(1)[0][0]][:5], f, intent)
    if intent == "rank_customer":
        c = Counter(r["customer_name"] for r in sel)
        text = (f"Customers with the most visits matching {scope}: " + ", ".join(f"{k} ({v})" for k, v in c.most_common(5)) + ".") if c \
            else f"No visits match {scope}."
        return _out("local", "high" if c else "medium", text, sel[:5], f, intent)
    if intent == "lookup":
        target = sel or [rows[i] for i in top]
        if not target:
            return _out("local", "low", "I could not find that customer or rep in the visits.", [], f, intent)
        latest = max(target, key=lambda r: r["visit_at"] or datetime.min)
        segs = Counter(r["result"]["segment"]["name"] for r in target)
        who = (f.get("customers") or f.get("reps") or [latest["customer_name"]])[0]
        text = (f"{who}: {len(target)} visit{'s' * (len(target) > 1)} ({', '.join(f'{k} {v}' for k, v in segs.most_common(3))}). "
                f"Latest ({latest['visit_at']:%d %b} by {latest['rep_name']}): “{latest['transcript']}” "
                f"Next step: {latest['result']['action']['text']}.")
        return _out("local", "high", text, target[:5], f, intent)

    # list / search / synthesis: evidence from retrieval inside the filters
    picks = [rows[i] for i in top][:5] if top else sel[:5]
    if not picks:
        return _out("local", "low", f"No visits match {scope}.", [], f, intent)
    expanded = question + " " + " ".join(LEX.rows_by_id[m.term_id]["meaning_en"] for m in LEX.tag(question))
    lines = [f"• {r['customer_name']} ({r['visit_category'].lower()}, {r['rep_name']}): “{_sentence(r['transcript'], expanded)}”" for r in picks]
    total = n if has_filters else len(top)
    head = f"{_n(total)} {scope}. Most relevant:" if has_filters else "The most relevant visits:"
    best = ranked[0][1] if ranked else 0
    confidence = "low" if intent == "synthesis" else ("high" if has_filters else ("medium" if best >= 0.15 else "low"))
    return _out("local", confidence, head + "\n" + "\n".join(lines), picks, f, intent)


def _n(n: int) -> str:
    return f"{n} visit matches" if n == 1 else f"{n} visits match"


def _out(mode, confidence, text, visits, f, intent) -> dict:
    return {"mode": mode, "confidence": confidence, "answer": text, "visits": [brief(r) for r in visits], "intent": intent,
            "filters": {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in f.items()},
            "explore_filter": _explore_filter(f)}


# ---------- AI answers (RAG: only the retrieved visits go to the model) ----------

AI_SYSTEM = """You answer questions from Elegant Steel managers about sales-visit notes. Elegant Steel sells TMT steel \
bars in West Bengal through dealers, retailers, masons, engineers and house owners (IHB).

You get the question, figures computed from the full data, and the most relevant visits. Use only that material. Never \
invent a number, name or fact; if the material cannot answer the question, say so and say what reps should record. \
Cite visits by their number like [2].

Write for busy non-technical readers: plain English, short sentences, at most 120 words, bullets when listing. End with \
one line starting "Recommended:" giving a concrete next step."""

_CACHE: "OrderedDict[str, dict]" = OrderedDict()
CACHE_SIZE = 500


def answer_ai(question: str, local: dict, rows: list[dict], role: str) -> dict:
    key = hashlib.sha1(f"{data_version(rows)}|{role}|{' '.join(question.lower().split())}".encode()).hexdigest()
    if key in _CACHE:
        _CACHE.move_to_end(key)
        return {**_CACHE[key], "mode": "cached"}

    p = parse(question, rows)
    hits = apply(rows, p["filters"]) if p["filters"] else None
    picked = [rows[i] for i, _ in index_for(rows).search(question, hits, k=12)]
    o = overview([rows[i] for i in hits] if hits is not None else rows)
    stats = (f"Scope: {describe(p['filters'])}. Visits in scope: {o['visits']}. Urgent (P0+P1): {o['alerts_p0_p1']}. "
             f"Tonnes mentioned: {o['tonnes_mentioned']} (confirmed {o['tonnes_confirmed']}). Competitor visits: {o['competitor_visits']}. "
             f"Average note score: {o['avg_note_score']}/10.")
    context = "\n".join(
        f"[{n}] {r['visit_at']:%d %b} | rep {r['rep_name']} | {r['customer_name']} ({r['visit_category'].lower()}) | "
        f"{r['result']['segment']['name']} | {r['result']['urgency']['level']} | flags: {', '.join(r['result']['flags']) or 'none'} | "
        f"note: {r['transcript']}"
        for n, r in enumerate(picked, 1) if r["visit_at"])
    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model=asker.AI_MODEL,
        max_tokens=2000,
        system=AI_SYSTEM,
        output_config={"effort": "low"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        messages=[{"role": "user", "content": f"Reader's role: {role}\nFigures: {stats}\n\nVisits:\n{context}\n\nQuestion: {question}"}],
    )
    if response.stop_reason == "refusal":
        return {**local, "note": "The AI declined; this is the free local answer."}
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    out = {**local, "mode": "ai", "confidence": "high", "answer": text or local["answer"], "visits": [brief(r) for r in picked[:5]],
           "usage": {"input_tokens": response.usage.input_tokens, "output_tokens": response.usage.output_tokens}}
    _CACHE[key] = out
    if len(_CACHE) > CACHE_SIZE:
        _CACHE.popitem(last=False)
    return out


# ---------- entry point ----------

def chat(message: str, role: str, rows: list[dict], previous: dict | None, model_meta: dict | None) -> dict:
    match = asker._match(message)
    if match:
        qid, _, text, _, fn = match
        out = fn(rows, model_meta)
        return {"mode": "calculated", "confidence": "high", "answer": out["answer"], "visits": out.get("visits", [])[:5],
                "intent": qid, "filters": previous or {}, "explore_filter": out.get("filter") or {}, "matched_question": text,
                "suggestions": [s for s in asker.suggestions(role) if s["id"] != qid][:3]}
    local = answer_local(message, rows, previous)
    local["suggestions"] = asker.suggestions(role)[:3]
    wants_ai = local["intent"] == "synthesis" or local["confidence"] == "low"
    if wants_ai and asker.ai_available():
        try:
            return {**answer_ai(message, local, rows, role), "suggestions": local["suggestions"]}
        except anthropic.RateLimitError:
            local["note"] = "The AI is busy; this is the free local answer."
        except (anthropic.APIStatusError, anthropic.APIConnectionError):
            local["note"] = "The AI could not be reached; this is the free local answer."
    elif wants_ai:
        local["note"] = "A fuller written answer needs the AI, which is not switched on. This is the free local answer."
    return local
