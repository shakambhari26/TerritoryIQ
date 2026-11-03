"""Visit Intelligence API.

Run locally:  VISIT_INTEL_API_KEY=dev-key uvicorn visit_intel.api:app --app-dir src --reload
Docs:         http://127.0.0.1:8000/docs
"""
from __future__ import annotations

import csv
import hmac
import io
import logging
import time
from collections import Counter
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select

from . import ask as asker
from . import rag
from . import config, explain, insights, keywords, messaging
from .db import Analysis, ChatLog, Keyword, Label, Message, SessionLocal, Visit, init_db, visit_dict
from .model import SegmentModel
from .pipeline import normalize
from .service import all_rows, ingest, reanalyze
from .taxonomy import FLAG_PARENT, FLAGS, SEGMENTS, URGENCY

log = logging.getLogger("visit_intel")
STATE: dict[str, Any] = {"model": None}


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not config.API_KEY:
        raise RuntimeError("Set VISIT_INTEL_API_KEY before starting the API.")
    init_db()
    STATE["model"] = SegmentModel.load(config.MODEL_PATH)
    log.warning("Model: %s", STATE["model"].version if STATE["model"] else "none (rules only)")
    yield


app = FastAPI(title="Visit Intelligence", version="1.0.0", lifespan=lifespan)


def require_key(x_api_key: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_api_key.encode(), config.API_KEY.encode()):
        raise HTTPException(401, "Missing or wrong X-API-Key")


def require_ingest_key(x_api_key: str = Header(default="")) -> None:
    """Frontier's send-only key, or the full key."""
    sent = x_api_key.encode()
    if not any(k and hmac.compare_digest(sent, k.encode()) for k in (config.API_KEY, config.INGEST_KEY)):
        raise HTTPException(401, "Missing or wrong X-API-Key")


class BatchIn(BaseModel):
    visits: list[dict[str, Any]] = Field(..., max_length=5000)


class AskIn(BaseModel):
    question: str = Field(..., min_length=2, max_length=300)
    role: str = "md"
    days: int | None = Field(None, ge=1, le=3650)


class ChatIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=300)
    role: str = Field("md", max_length=30)
    days: int | None = Field(None, ge=1, le=3650)
    previous: dict[str, Any] | None = None


class LabelIn(BaseModel):
    visit_key: str
    segment: str
    urgency: str | None = None
    labeller: str = "reviewer"


class KeywordIn(BaseModel):
    term: str = Field(..., min_length=2, max_length=120)
    language: str = Field("en", max_length=12)
    target: str
    weight: float = Field(..., gt=0, le=5)
    status: Literal["verified", "draft", "ambiguous"] = "draft"
    meaning: str = Field("", max_length=200)
    added_by: str = Field("territoryiq", max_length=100)


class KeywordPatch(BaseModel):
    weight: float | None = Field(None, gt=0, le=5)
    status: Literal["verified", "draft", "ambiguous"] | None = None
    active: bool | None = None
    meaning: str | None = Field(None, max_length=200)


class TextIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


class ContactIn(BaseModel):
    rep_name: str = Field(..., min_length=1, max_length=200)
    whatsapp: str | None = Field(None, max_length=20)
    email: str | None = Field(None, max_length=200)


class MessageIn(BaseModel):
    rep_name: str = Field(..., min_length=1, max_length=200)
    kind: Literal["suggestion", "todo"] = "suggestion"
    title: str = Field(..., min_length=2, max_length=200)
    body: str = Field("", max_length=4000)
    todos: list[str] = Field(default_factory=list, max_length=20)
    channels: list[Literal["in_app", "whatsapp", "email"]] = Field(default_factory=lambda: ["in_app"], min_length=1)
    visit_key: str | None = Field(None, max_length=64)
    sender: str = Field("Head Office", max_length=100)
    ai_drafted: bool = False


class DraftIn(BaseModel):
    visit_key: str | None = Field(None, max_length=64)
    rep_name: str | None = Field(None, max_length=200)
    instruction: str = Field("", max_length=500)
    language: Literal["en", "bn", "hi"] = "en"
    kind: Literal["suggestion", "todo"] = "todo"


class RespondIn(BaseModel):
    text: str | None = Field(None, max_length=2000)
    done_todos: list[int] | None = Field(None, max_length=20)
    done: bool = False


def _model_meta() -> dict | None:
    return STATE["model"].meta if STATE["model"] else None


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": STATE["model"].version if STATE["model"] else "rules-only"}


@app.post("/v1/visits/segment", dependencies=[Depends(require_ingest_key)])
def segment_one(visit: dict[str, Any]) -> dict:
    with SessionLocal() as s:
        ingest(s, [visit], STATE["model"])
        key = normalize(visit)["visit_key"]
        row = s.get(Analysis, key)
        if row is None:
            raise HTTPException(422, "Visit has no transcript")
        return {"visit_key": key, **row.result}


@app.post("/v1/visits/batch", dependencies=[Depends(require_ingest_key)])
def segment_batch(body: BatchIn) -> dict:
    with SessionLocal() as s:
        return ingest(s, body.visits, STATE["model"])


@app.post("/v1/visits/import-csv", dependencies=[Depends(require_ingest_key)])
async def import_csv(file: UploadFile = File(...)) -> dict:
    text = (await file.read()).decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(text)))
    with SessionLocal() as s:
        return ingest(s, rows, STATE["model"])


@app.get("/v1/visits", dependencies=[Depends(require_key)])
def list_visits(segment: str | None = None, urgency: str | None = None, needs_review: bool | None = None,
                limit: int = Query(200, le=2000)) -> list[dict]:
    with SessionLocal() as s:
        rows = all_rows(s)
    out = [insights.brief(r) for r in rows
           if (segment is None or r["result"]["segment"]["code"] == segment)
           and (urgency is None or r["result"]["urgency"]["level"] == urgency)
           and (needs_review is None or r["result"]["needs_human_review"] == needs_review)]
    out.sort(key=lambda b: b["visit_at"] or "", reverse=True)
    return out[:limit]


@app.get("/v1/visits/{visit_key}", dependencies=[Depends(require_key)])
def get_visit(visit_key: str) -> dict:
    with SessionLocal() as s:
        v, a = s.get(Visit, visit_key), s.get(Analysis, visit_key)
        if not v or not a:
            raise HTTPException(404, "No such visit")
        d = visit_dict(v)
        d["visit_at"] = d["visit_at"].isoformat() if d["visit_at"] else None
        return {**d, "result": a.result}


@app.get("/v1/review-queue", dependencies=[Depends(require_key)])
def review_queue(limit: int = Query(50, le=500)) -> list[dict]:
    return list_visits(needs_review=True, limit=limit)


@app.post("/v1/labels", dependencies=[Depends(require_key)])
def add_label(body: LabelIn) -> dict:
    if body.segment not in SEGMENTS:
        raise HTTPException(422, f"segment must be one of {list(SEGMENTS)}")
    if body.urgency and body.urgency not in URGENCY:
        raise HTTPException(422, f"urgency must be one of {list(URGENCY)}")
    with SessionLocal() as s:
        if not s.get(Visit, body.visit_key):
            raise HTTPException(404, "No such visit")
        s.add(Label(visit_key=body.visit_key, segment=body.segment, urgency=body.urgency, labeller=body.labeller[:100]))
        s.commit()
        reanalyze(s, STATE["model"], [body.visit_key])
        return {"visit_key": body.visit_key, **s.get(Analysis, body.visit_key).result}


@app.post("/v1/reanalyze", dependencies=[Depends(require_key)])
def reanalyze_all() -> dict:
    STATE["model"] = SegmentModel.load(config.MODEL_PATH)
    with SessionLocal() as s:
        n = reanalyze(s, STATE["model"])
    return {"reanalyzed": n, "model": STATE["model"].version if STATE["model"] else "rules-only"}


@app.get("/v1/model/health", dependencies=[Depends(require_key)])
def model_health() -> dict:
    with SessionLocal() as s:
        rows = all_rows(s)
    return insights.data_analyst(rows, _model_meta())


@app.get("/v1/insights/{role}", dependencies=[Depends(require_key)])
def role_insights(role: Literal["md", "vp_sales", "supervisor", "business_analyst", "data_analyst"],
                  days: int | None = Query(None, ge=1, le=3650)) -> dict:
    with SessionLocal() as s:
        rows = all_rows(s)
    data = insights.for_role(role, rows, days, _model_meta())
    data["suggested_questions"] = asker.suggestions(role)
    data["ai_enabled"] = asker.ai_available()
    return data


@app.get("/v1/explore", dependencies=[Depends(require_key)])
def explore(group: str | None = None, segment: str | None = None, urgency: str | None = None, flag: str | None = None,
            rep: str | None = None, stakeholder: str | None = None, review: str | None = None,
            q: str | None = Query(None, max_length=100), days: int | None = Query(None, ge=1, le=3650)) -> dict:
    with SessionLocal() as s:
        rows = all_rows(s)
    filters = {"group": group, "segment": segment, "urgency": urgency, "flag": flag, "rep": rep, "stakeholder": stakeholder,
               "review": review, "q": q}
    data = insights.explore(rows, filters, days, _model_meta())
    data["suggested_questions"] = asker.suggestions("explore")
    data["ai_enabled"] = asker.ai_available()
    return data


@app.post("/v1/ask", dependencies=[Depends(require_key)])
def ask(body: AskIn) -> dict:
    with SessionLocal() as s:
        rows = all_rows(s)
    return asker.ask(body.question.strip(), body.role, rows, body.days, _model_meta())


@app.get("/v1/taxonomy")
def taxonomy() -> dict:
    return {"segments": {c: {"name": n, "emoji": e, "group": g, "meaning": m} for c, (n, e, g, m) in SEGMENTS.items()},
            "urgency": {k: {"name": n, "sla": s} for k, (n, s) in URGENCY.items()},
            "flags": {f: {"name": n, "parent": FLAG_PARENT.get(f)} for f, n in FLAGS.items()}}


@app.get("/v1/methodology")
def methodology() -> dict:
    """How every score is calculated, in plain language and as a formula."""
    return {"scores": explain.METHODOLOGY,
            "thresholds": {"rules": config.RULES_CONFIDENT, "ml": config.ML_CONFIDENT, "agree": config.AGREE_CONFIDENT,
                           "keywords": config.KEYWORDS_CONFIDENT, "keywords_margin": config.KEYWORDS_MARGIN,
                           "flag": keywords.FLAG_THRESHOLD, "decay": keywords.DECAY}}


# ---------- keyword database ----------

def _kw_dict(k: Keyword) -> dict:
    return {"id": k.id, "term": k.term, "language": k.language, "target": k.target, "kind": k.kind, "weight": k.weight,
            "status": k.status, "meaning": k.meaning, "active": k.active, "added_by": k.added_by}


@app.get("/v1/keywords", dependencies=[Depends(require_key)])
def list_keywords(target: str | None = None, language: str | None = None, q: str | None = Query(None, max_length=60),
                  active: bool | None = None, limit: int = Query(500, le=5000)) -> dict:
    with SessionLocal() as s:
        query = select(Keyword).order_by(Keyword.target, Keyword.weight.desc(), Keyword.term)
        if target:
            query = query.where(Keyword.target == target)
        if language:
            query = query.where(Keyword.language == language)
        if active is not None:
            query = query.where(Keyword.active.is_(active))
        rows = list(s.scalars(query))
    if q:
        rows = [k for k in rows if q.lower() in k.term.lower() or q.lower() in (k.meaning or "").lower()]
    live = [keywords.Row(k.id, k.term, k.language, k.target, k.kind, k.weight, k.status, k.meaning) for k in rows if k.active]
    return {"total": len(rows), "keywords": [_kw_dict(k) for k in rows[:limit]], "coverage": keywords.coverage(live),
            "targets": {**{c: {"kind": "segment", "name": v[0]} for c, v in SEGMENTS.items()},
                        **{f: {"kind": "flag", "name": n, "parent": FLAG_PARENT.get(f)} for f, n in FLAGS.items()}},
            "source": keywords.source()}


@app.post("/v1/keywords", dependencies=[Depends(require_key)])
def add_keyword(body: KeywordIn) -> dict:
    kind = keywords.kind_of(body.target)
    if kind is None:
        raise HTTPException(422, "target must be a segment or a sub-segment flag code")
    term = " ".join(body.term.split())
    with SessionLocal() as s:
        if s.scalars(select(Keyword).where(Keyword.target == body.target, Keyword.term.ilike(term))).first():
            raise HTTPException(409, "This keyword already exists for that group")
        k = Keyword(term=term, language=body.language, target=body.target, kind=kind, weight=body.weight,
                    status=body.status, meaning=body.meaning, added_by=body.added_by)
        s.add(k)
        s.commit()
        keywords.invalidate()
        return _kw_dict(k)


@app.patch("/v1/keywords/{keyword_id}", dependencies=[Depends(require_key)])
def edit_keyword(keyword_id: int, body: KeywordPatch) -> dict:
    with SessionLocal() as s:
        k = s.get(Keyword, keyword_id)
        if not k:
            raise HTTPException(404, "No such keyword")
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(k, field, value)
        s.commit()
        keywords.invalidate()
        return _kw_dict(k)


@app.post("/v1/keywords/test", dependencies=[Depends(require_key)])
def test_keywords(body: TextIn) -> dict:
    """Score any sentence against the keyword database, to check a new keyword before relying on it."""
    return keywords.get().score(body.text)


# ---------- two-way messages ----------

@app.get("/v1/messaging/status", dependencies=[Depends(require_key)])
def messaging_status() -> dict:
    return {"channels": messaging.channel_status(), "ai_enabled": asker.ai_available()}


@app.get("/v1/contacts", dependencies=[Depends(require_key)])
def list_contacts() -> list[dict]:
    with SessionLocal() as s:
        return messaging.contacts(s)


@app.put("/v1/contacts", dependencies=[Depends(require_key)])
def put_contact(body: ContactIn) -> dict:
    with SessionLocal() as s:
        try:
            return messaging.save_contact(s, body.rep_name.strip(), body.whatsapp, body.email)
        except ValueError as e:
            raise HTTPException(422, str(e)) from None


@app.post("/v1/messages/draft", dependencies=[Depends(require_key)])
def draft_message(body: DraftIn) -> dict:
    with SessionLocal() as s:
        try:
            return messaging.draft(s, visit_key=body.visit_key, rep_name=body.rep_name, instruction=body.instruction,
                                   language=body.language, kind=body.kind)
        except ValueError as e:
            raise HTTPException(422, str(e)) from None


@app.post("/v1/messages", dependencies=[Depends(require_key)])
def send_message(body: MessageIn) -> dict:
    todos = [t.strip()[:300] for t in body.todos if t.strip()]
    with SessionLocal() as s:
        if body.visit_key and not s.get(Visit, body.visit_key):
            raise HTTPException(404, "No such visit")
        return messaging.send(s, rep_name=body.rep_name.strip(), kind=body.kind, title=body.title.strip(), body=body.body.strip(),
                              todos=todos, channels=list(dict.fromkeys(body.channels)), visit_key=body.visit_key,
                              sender=body.sender, ai_drafted=body.ai_drafted)


@app.get("/v1/messages", dependencies=[Depends(require_key)])
def get_messages(rep: str | None = None, status: str | None = None, limit: int = Query(100, le=500)) -> list[dict]:
    with SessionLocal() as s:
        return messaging.list_messages(s, rep, status, limit)


@app.post("/v1/messages/{message_id}/note", dependencies=[Depends(require_key)])
def ho_note(message_id: int, body: TextIn) -> dict:
    """Head office adds to the thread; the rep sees it on the reply link and in the in-app inbox."""
    with SessionLocal() as s:
        m = s.get(Message, message_id)
        if not m:
            raise HTTPException(404, "No such message")
        return messaging.respond(s, m, "ho", body.text, None, False)


@app.get("/v1/inbox", dependencies=[Depends(require_key)])
def inbox(rep: str = Query(..., min_length=1, max_length=200), limit: int = Query(50, le=200)) -> list[dict]:
    """In-app delivery: the rep's app (e.g. Frontier) reads this rep's messages."""
    with SessionLocal() as s:
        return messaging.list_messages(s, rep, None, limit)


@app.post("/v1/inbox/{message_id}/respond", dependencies=[Depends(require_key)])
def inbox_respond(message_id: int, body: RespondIn) -> dict:
    with SessionLocal() as s:
        m = s.get(Message, message_id)
        if not m:
            raise HTTPException(404, "No such message")
        return messaging.respond(s, m, "rep", body.text, body.done_todos, body.done)


@app.get("/v1/inbox/t/{token}", dependencies=[Depends(require_key)])
def inbox_by_token(token: str) -> dict:
    """The rep's private reply link. Opening it marks the message read."""
    with SessionLocal() as s:
        m = messaging.by_token(s, token)
        if not m:
            raise HTTPException(404, "This link is not valid or has expired")
        messaging.mark_read(s, m)
        return messaging.message_dict(s, m)


@app.post("/v1/inbox/t/{token}", dependencies=[Depends(require_key)])
def respond_by_token(token: str, body: RespondIn) -> dict:
    with SessionLocal() as s:
        m = messaging.by_token(s, token)
        if not m:
            raise HTTPException(404, "This link is not valid or has expired")
        return messaging.respond(s, m, "rep", body.text, body.done_todos, body.done)


@app.post("/v1/chat", dependencies=[Depends(require_key)])
def chat(body: ChatIn) -> dict:
    started = time.perf_counter()
    with SessionLocal() as s:
        rows = insights._filter(all_rows(s), body.days)
        previous = {k: v for k, v in (body.previous or {}).items() if k in ("segments", "flags", "urgency", "categories", "brands", "reps", "customers")}
        out = rag.chat(body.message.strip(), body.role, rows, previous or None, _model_meta())
        usage = out.get("usage") or {}
        s.add(ChatLog(role=body.role[:30], question=body.message[:300], mode=out["mode"], intent=str(out.get("intent", ""))[:30],
                      latency_ms=int((time.perf_counter() - started) * 1000),
                      input_tokens=usage.get("input_tokens", 0), output_tokens=usage.get("output_tokens", 0)))
        s.commit()
    out["ai_enabled"] = asker.ai_available()
    return out


@app.get("/v1/chat/stats", dependencies=[Depends(require_key)])
def chat_stats() -> dict:
    with SessionLocal() as s:
        logs = list(s.scalars(select(ChatLog)))
    modes = Counter(log.mode for log in logs)
    free = sum(n for m, n in modes.items() if m != "ai")
    return {"questions": len(logs), "by_mode": dict(modes), "answered_without_api": round(free / len(logs), 3) if logs else None,
            "ai_input_tokens": sum(log.input_tokens for log in logs), "ai_output_tokens": sum(log.output_tokens for log in logs),
            "avg_latency_ms_local": round(sum(log.latency_ms for log in logs if log.mode != "ai") / max(1, free)),
            "model": asker.AI_MODEL}
