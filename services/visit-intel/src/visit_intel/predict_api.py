"""Prediction API: the trained model and rules behind one small, stateless, versioned contract for outside callers.

In production these routes are part of the main service (`api.py` includes `router`), so they use the very model object
the service already loaded (and reloads on POST /v1/reanalyze). They store nothing, read no visits, and accept only the
keys in VISIT_INTEL_PREDICT_KEYS: never the internal API key or Frontier's ingest key, and those keys never open them.
The public /docs and /openapi.json of the main service show only this surface (see api.py).

`app` at the bottom is the same contract as a standalone app, for local development and tests:
    VISIT_INTEL_PREDICT_KEYS=dev-key uvicorn visit_intel.predict_api:app --app-dir src --port 8200

Settings (environment):
    VISIT_INTEL_PREDICT_KEYS            Comma-separated, one per caller, named: "frontier-app:abc123,bi:def456". The name is
                                        logged with each call (never the transcript); revoke a caller by removing its key.
                                        Unset or invalid: the prediction routes answer 503 and the rest of the service runs as before.
    VISIT_INTEL_PREDICT_RATE_PER_MIN    visits per minute each caller may send (default 600; a batch of n counts as n).
    VISIT_INTEL_PREDICT_LIMITS          per-caller override, by name: "frontier-app=1200,bi=120".
    VISIT_INTEL_PREDICT_REQUIRE_MODEL   standalone app only: 1 = refuse to start without the trained model file.
                                        (The main service has VISIT_INTEL_REQUIRE_MODEL for the same purpose.)

The rate limiter lives in this process's memory, which is exact for one instance (the Railway default). If you ever run
several replicas, each enforces the limit on its own, so a caller could get up to replicas x limit.
"""
from __future__ import annotations

import hmac
import logging
import math
import os
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Callable, Iterable, Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Response, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.types import ASGIApp, Receive, Scope, Send

from . import config, keywords
from .model import SegmentModel
from .pipeline import analyze, normalize
from .taxonomy import FLAG_PARENT, FLAGS, SEGMENTS, URGENCY

log = logging.getLogger("visit_intel.predict")

MAX_BATCH = 200
MAX_TRANSCRIPT = 8000
MAX_BODY_BYTES = 2_000_000  # a full batch of maximum-length transcripts is about 1.7 MB
API_VERSION = "1"
DEFAULT_RATE_PER_MIN = 600
PREFIX = "/v1/predict"

TITLE = "Visit Intelligence: Prediction API"
DESCRIPTION = (
    "Classifies a sales-visit transcript into a business segment, urgency (P0-P3), flags and a recommended action, "
    "and extracts the facts it found. Stateless: nothing you send is stored. Send your key in the `X-API-Key` header "
    "(call from your server, never from a browser). Each caller has a visits-per-minute allowance (a batch of n counts "
    "as n); the response headers `X-RateLimit-Limit` and `X-RateLimit-Remaining` show it. `/v1` only gains optional "
    "fields; anything that could break you ships under `/v2`.")


# --------------------------------------------------------------------------------------------- keys and rate limit
def _parse_keys(raw: str) -> dict[str, str]:
    """'name:key,other:key2' or 'key' -> {key: name}."""
    out: dict[str, str] = {}
    for i, part in enumerate(p.strip() for p in raw.split(",") if p.strip()):
        name, sep, key = part.partition(":")
        key, name = (key, name) if sep else (name, f"caller{i + 1}")
        if key.strip():
            out[key.strip()] = name.strip() or f"caller{i + 1}"
    return out


def _parse_limits(raw: str) -> dict[str, int]:
    """'hr-app=1200,bi=120' -> {name: visits per minute}. A malformed entry is an error rather than being ignored."""
    out: dict[str, int] = {}
    for part in (p.strip() for p in raw.split(",") if p.strip()):
        name, sep, value = part.partition("=")
        if not sep or not name.strip() or not value.strip().isdigit() or int(value) < 1:
            raise RuntimeError(f"VISIT_INTEL_PREDICT_LIMITS: cannot read {part!r}; expected name=visits_per_minute, e.g. hr-app=1200")
        out[name.strip()] = int(value)
    return out


class RateLimiter:
    """Sliding one-minute window per caller, counted in visits. Rejected calls use up nothing."""

    def __init__(self, window: float = 60.0, clock: Callable[[], float] = time.monotonic):
        self.window, self.clock = window, clock
        self._hits: dict[str, deque[tuple[float, int]]] = {}
        self._lock = threading.Lock()

    def take(self, who: str, cost: int, limit: int) -> tuple[bool, int, int]:
        """-> (allowed, visits left in the window, seconds until `cost` would fit; 0 if it never can)."""
        with self._lock:
            now = self.clock()
            q = self._hits.setdefault(who, deque())
            while q and q[0][0] <= now - self.window:
                q.popleft()
            used = sum(c for _, c in q)
            if used + cost <= limit:
                q.append((now, cost))
                return True, limit - used - cost, 0
            if cost > limit:
                return False, max(limit - used, 0), 0
            need, freed = used + cost - limit, 0
            for t, c in q:
                freed += c
                if freed >= need:
                    return False, max(limit - used, 0), max(1, math.ceil(t + self.window - now))
            return False, 0, math.ceil(self.window)  # not reachable: cost <= limit means the window can free enough

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


STATE: dict[str, Any] = {"enabled": False, "keys": {}, "rate": DEFAULT_RATE_PER_MIN, "limits": {},
                         "limiter": RateLimiter(), "get_model": lambda: None}


def load_settings(reserved: Iterable[str] = ()) -> None:
    """Read the VISIT_INTEL_PREDICT_* settings. Raises RuntimeError, naming the setting, if any is wrong.

    `reserved` are keys that must never double as a prediction key (the internal API key and the ingest key)."""
    STATE["enabled"] = False
    keys = _parse_keys(os.environ.get("VISIT_INTEL_PREDICT_KEYS", ""))
    if not keys:
        raise RuntimeError("Set VISIT_INTEL_PREDICT_KEYS (comma-separated API keys) to enable the prediction API.")
    if set(keys) & {k for k in reserved if k}:
        raise RuntimeError("VISIT_INTEL_PREDICT_KEYS contains the internal API key or the ingest key; issue separate keys "
                           "with scripts/make_predict_key.py.")
    rate = os.environ.get("VISIT_INTEL_PREDICT_RATE_PER_MIN", "").strip()
    if rate and (not rate.isdigit() or int(rate) < 1):
        raise RuntimeError("VISIT_INTEL_PREDICT_RATE_PER_MIN must be a whole number of visits per minute, 1 or more.")
    limits = _parse_limits(os.environ.get("VISIT_INTEL_PREDICT_LIMITS", ""))
    unknown = set(limits) - set(keys.values())
    if unknown:
        raise RuntimeError(f"VISIT_INTEL_PREDICT_LIMITS names callers that have no key: {sorted(unknown)}")
    STATE.update(keys=keys, rate=int(rate) if rate else DEFAULT_RATE_PER_MIN, limits=limits, enabled=True)
    STATE["limiter"].reset()


def enable_in_service(get_model: Callable[[], SegmentModel | None], reserved: Iterable[str]) -> bool:
    """Called from the main service's start-up. Never stops the service: a missing or wrong setting only turns the
    prediction routes off (they answer 503), and says why in the log."""
    STATE["get_model"] = get_model
    if not os.environ.get("VISIT_INTEL_PREDICT_KEYS", "").strip():
        STATE["enabled"] = False
        log.warning("Prediction API off: VISIT_INTEL_PREDICT_KEYS is not set.")
        return False
    try:
        load_settings(reserved)
    except RuntimeError as e:
        log.error("Prediction API off: %s", e)
        return False
    log.warning("Prediction API on: %d caller(s) %s; %d visits/min default", len(STATE["keys"]),
                sorted(STATE["keys"].values()), STATE["rate"])
    return True


class BodyLimit:
    """Refuse an oversized prediction request (413) from its Content-Length, before the body is read into memory."""

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES, prefix: str = PREFIX):
        self.app, self.max_bytes, self.prefix = app, max_bytes, prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["path"].startswith(self.prefix):
            length = dict(scope["headers"]).get(b"content-length", b"0")
            if not length.isdigit() or int(length) > self.max_bytes:
                body = b'{"detail":"Request body too large: at most %d bytes (%d visits per batch)."}' % (self.max_bytes, MAX_BATCH)
                await send({"type": "http.response.start", "status": 413,
                            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)


# ----------------------------------------------------------------------------------------------------- contract
class VisitIn(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{
        "id": "visit-8841",
        "transcript": "The client has confirmed a 5 MT order and a full payment today. Will visit tomorrow.",
        "visit_category": "DEALER", "visit_date": "03-11-2026"}]})

    id: str | None = Field(None, max_length=64, description="Your own reference; echoed back unchanged.")
    transcript: str = Field(..., min_length=1, max_length=MAX_TRANSCRIPT,
                            description="Visit notes / transcript text (English, Bengali or Hindi). Not only spaces.")
    visit_category: str | None = Field(None, max_length=40, description="DEALER, RETAILER, MASON, NEW MASON, ENGINEER, INFLUENCER or IHB. Improves accuracy.")
    visit_date: str | None = Field(None, max_length=10, description="DD-MM-YYYY. Lets relative dates ('tomorrow') be resolved.")
    visit_time: str | None = Field(None, max_length=20)
    customer_name: str | None = Field(None, max_length=200, description="Optional; only used for the note-quality score.")
    contact_number: str | None = Field(None, max_length=20, description="Optional; only checked for a valid 10-digit Indian mobile number.")

    @field_validator("transcript")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("transcript is empty")
        return v

    @field_validator("visit_date")
    @classmethod
    def _ddmmyyyy(cls, v: str | None) -> str | None:
        if v:
            try:
                datetime.strptime(v, "%d-%m-%Y")
            except ValueError:
                raise ValueError("visit_date must be a real date written DD-MM-YYYY, e.g. 03-11-2026") from None
        return v or None


class BatchIn(BaseModel):
    visits: list[VisitIn] = Field(..., min_length=1, max_length=MAX_BATCH)


class SegmentRef(BaseModel):
    code: str = Field(description="Stable machine code, e.g. HOT_ORDER. Branch on this, not on `name`.")
    name: str
    emoji: str
    group: str
    meaning: str


class Segment(SegmentRef):
    confidence: float = Field(description="0 to 1. How sure the deciding method was.")
    decided_by: str = Field(description="Which method decided: rules, keywords, ml, a combination such as rules+ml, or uncertain.")
    secondary: SegmentRef | None = Field(None, description="A second topic the visit also touched, if any.")


class Alternative(BaseModel):
    code: str
    name: str
    probability: float = Field(description="0 to 1, from `source`.")
    source: Literal["ml", "keywords"] = Field(description="ml = the trained model; keywords = the keyword model (used when no trained model is loaded).")


class Urgency(BaseModel):
    level: Literal["P0", "P1", "P2", "P3"] = Field(description="P0 act today, down to P3 routine. See /v1/taxonomy for each SLA.")
    reason: str


class Action(BaseModel):
    playbook_id: str
    owner: str
    text: str


class NoteQuality(BaseModel):
    score: int = Field(description="How complete the note is, 0 to 10.")
    parts: dict[str, int]
    issues: list[str]


class Prediction(BaseModel):
    id: str | None = Field(None, description="Your `id`, echoed back.")
    segment: Segment
    alternatives: list[Alternative] = Field(description="Up to 3 other segments the model considered, most likely first. May be empty.")
    urgency: Urgency
    flags: list[str] = Field(description="Codes from /v1/taxonomy, e.g. FOLLOW_UP, PAYMENT_RECEIVED.")
    sentiment: str
    action: Action = Field(description="Recommended next step from the business playbook.")
    needs_human_review: bool = Field(description="True when the methods disagree or none is sure: show a person before acting.")
    note_quality: NoteQuality
    extracted: dict[str, Any] = Field(description="Facts found in the text (quantity, amount, follow-up date, competitors...), each with its evidence.")
    model_version: str = Field(description="Version of the trained model, or 'rules-only'. Store it with your results.")
    evidence: dict[str, Any] | None = Field(None, description="Only with ?detail=true: what each method said.")
    explanation: dict[str, Any] | None = Field(None, description="Only with ?detail=true: step-by-step reasoning.")


class BatchOut(BaseModel):
    count: int
    results: list[Prediction] = Field(description="Same order as the request.")


class Error(BaseModel):
    detail: Any = Field(description="A message, or for 422 a list of {loc, msg, type} naming each invalid field.")


ERRORS: dict[int | str, dict[str, Any]] = {
    401: {"model": Error, "description": "Missing or wrong X-API-Key."},
    413: {"model": Error, "description": f"Body larger than {MAX_BODY_BYTES} bytes."},
    422: {"model": Error, "description": "The body does not match the schema; `detail` names each invalid field."},
    429: {"model": Error, "description": "Over your visits-per-minute allowance. Wait `Retry-After` seconds."},
    503: {"model": Error, "description": "The prediction API is switched off on this server."},
}

api_key = APIKeyHeader(name="X-API-Key", auto_error=False, description="Key issued to your team.")


def caller(key: str | None = Security(api_key)) -> str:
    if not STATE["enabled"]:
        raise HTTPException(503, "The prediction API is not enabled on this server.")
    sent = (key or "").encode()
    found = None
    for known, name in STATE["keys"].items():  # compare against every key so timing does not reveal which matched
        if hmac.compare_digest(sent, known.encode()):
            found = name
    if found is None:
        raise HTTPException(401, "Missing or wrong X-API-Key")
    return found


def spend(who: str, cost: int, response: Response) -> None:
    limit = STATE["limits"].get(who, STATE["rate"])
    ok, left, retry = STATE["limiter"].take(who, cost, limit)
    headers = {"X-RateLimit-Limit": str(limit), "X-RateLimit-Remaining": str(left)}
    if not ok:
        if cost > limit:
            raise HTTPException(429, f"This call has {cost} visits but your allowance is {limit} per minute: send fewer at a time.", headers)
        raise HTTPException(429, f"Over {limit} visits per minute. Try again in {retry} s.", {**headers, "Retry-After": str(retry)})
    response.headers.update(headers)


def _alternatives(r: dict) -> list[dict]:
    chosen = r["segment"]["code"]
    ml, kw = r["evidence"]["ml"], r["evidence"]["keywords"]
    if ml:
        ranked = [(a["segment"], a["probability"], "ml") for a in ml]
    elif kw.get("evidence_found"):
        ranked = [(p["segment"], p["probability"], "keywords") for p in kw["probabilities"]]
    else:
        ranked = []
    return [{"code": c, "name": SEGMENTS[c][0] if c in SEGMENTS else c, "probability": round(float(p), 3), "source": s}
            for c, p, s in ranked if c != chosen and p >= 0.01][:3]


def _predict(v: VisitIn, full: bool) -> dict:
    raw = {"transcript": v.transcript, "visit_category": v.visit_category, "visit_date": v.visit_date,
           "visit_time": v.visit_time, "customer_name": v.customer_name, "contact_number": v.contact_number}
    r = analyze(normalize(raw), STATE["get_model"](), None)
    out = {
        "id": v.id,
        "segment": r["segment"],
        "alternatives": _alternatives(r),
        "urgency": r["urgency"],
        "flags": r["flags"],
        "sentiment": r["sentiment"],
        "action": r["action"],
        "needs_human_review": r["needs_human_review"],
        "note_quality": r["note_quality"],
        "extracted": r["extracted"],
        "model_version": r["model_version"],
    }
    if full:
        out["evidence"], out["explanation"] = r["evidence"], r["explanation"]
    return out


# --------------------------------------------------------------------------------------------------- endpoints
router = APIRouter(tags=["Prediction"])
DETAIL = Query(False, description="Also return the evidence and a step-by-step explanation (larger response).")


@router.post(PREFIX, operation_id="predict_visit", summary="Classify one visit", response_model=Prediction,
             response_model_exclude_unset=True, responses=ERRORS)
def predict(visit: VisitIn, response: Response, detail: bool = DETAIL, who: str = Depends(caller)) -> dict:
    spend(who, 1, response)
    log.info("predict caller=%s", who)
    return _predict(visit, detail)


@router.post(PREFIX + "/batch", operation_id="predict_visits_batch", summary=f"Classify up to {MAX_BATCH} visits in one call",
             response_model=BatchOut, response_model_exclude_unset=True, responses=ERRORS)
def predict_batch(body: BatchIn, response: Response, detail: bool = DETAIL, who: str = Depends(caller)) -> dict:
    spend(who, len(body.visits), response)
    log.info("predict/batch caller=%s n=%d", who, len(body.visits))
    results = [_predict(v, detail) for v in body.visits]
    return {"count": len(results), "results": results}


def taxonomy_body() -> dict:
    return {"segments": {c: {"name": n, "emoji": e, "group": g, "meaning": m} for c, (n, e, g, m) in SEGMENTS.items()},
            "urgency": {k: {"name": n, "sla": sla} for k, (n, sla) in URGENCY.items()},
            "flags": {f: {"name": n, "parent": FLAG_PARENT.get(f)} for f, n in FLAGS.items()}}


# ------------------------------------------------------------------------------ standalone app (local development)
class Health(BaseModel):
    ok: bool
    api_version: str
    model: str


_LOCAL: dict[str, SegmentModel | None] = {"model": None}


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_settings()
    STATE["get_model"] = lambda: _LOCAL["model"]
    before = dict(keywords._STATE)
    if os.environ.get("VISIT_INTEL_PREDICT_USE_DB_KEYWORDS") != "1":
        # Stateless by default: never touch a database, use the keyword list shipped with the code.
        keywords._STATE["matcher"] = keywords.Matcher(keywords._rows_from_csv())
        keywords._STATE["source"] = "csv"
    _LOCAL["model"] = SegmentModel.load(config.MODEL_PATH)
    if _LOCAL["model"] is None and os.environ.get("VISIT_INTEL_PREDICT_REQUIRE_MODEL") == "1":
        raise RuntimeError(f"VISIT_INTEL_PREDICT_REQUIRE_MODEL=1 but no trained model at {config.MODEL_PATH}.")
    log.warning("Prediction API (standalone) up. Model: %s; keywords: %s",
                _LOCAL["model"].version if _LOCAL["model"] else "none (rules only)", keywords.source())
    try:
        yield
    finally:
        keywords._STATE.update(before)


app = FastAPI(title=TITLE, version=API_VERSION + ".0.0", description=DESCRIPTION, lifespan=lifespan)
app.add_middleware(BodyLimit)
app.include_router(router)


@app.get("/health", operation_id="health", summary="Liveness and model version (no key needed)", response_model=Health)
def health() -> dict:
    return {"ok": True, "api_version": API_VERSION, "model": _LOCAL["model"].version if _LOCAL["model"] else "rules-only"}


@app.get("/v1/taxonomy", operation_id="get_taxonomy", summary="The segments, urgency levels and flags the API can return",
         responses={401: ERRORS[401]})
def taxonomy(who: str = Depends(caller)) -> dict:
    return taxonomy_body()
