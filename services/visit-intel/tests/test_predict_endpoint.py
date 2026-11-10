"""The prediction API as it runs in production: inside the main service (api.py), on the model that service loaded.

What must hold: its own keys only (the internal and ingest keys do not open it, and its keys open nothing else), the
same model object as the rest of the service, validation, per-caller rate limits, zero database writes, a public
/docs + /openapi.json that show only the prediction surface, and no effect on the internal API when switched off.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from visit_intel import api as api_module
from visit_intel import config, predict_api
from visit_intel.api import app
from visit_intel.db import engine

INTERNAL = {"X-API-Key": "test-key"}            # conftest's VISIT_INTEL_API_KEY
INGEST = {"X-API-Key": "ingest-key-xyz"}
FRONTIER = {"X-API-Key": "pk-frontier"}
BI = {"X-API-Key": "pk-bi"}
ORDER = {"id": "ref-1", "transcript": "The client has confirmed a 5 MT order and a full payment today.",
         "visit_category": "DEALER", "visit_date": "03-11-2026"}
PUBLIC = {"/health", "/v1/taxonomy", "/v1/predict", "/v1/predict/batch"}


class FakeModel:
    """Stands in for the trained model the service loads at start-up; counts its calls."""

    def __init__(self, version: str = "20261102-120722"):
        self.version, self.calls = version, 0
        self.meta = {"version": version, "rows": 120, "accuracy": 0.9, "macro_f1": 0.88}

    def predict(self, visits):
        self.calls += 1
        return [[("HOT_ORDER", 0.81), ("PAYMENT", 0.12), ("NEW_LEAD", 0.04)] for _ in visits]

    def contributions(self, visit, segment, top: int = 6):
        return {"for": [{"feature": 'word "order"', "pull": 1.2}], "against": []}


@pytest.fixture
def model(monkeypatch):
    m = FakeModel()
    monkeypatch.setattr(api_module.SegmentModel, "load", classmethod(lambda cls, path: m))
    return m


@pytest.fixture
def svc(monkeypatch, model):
    monkeypatch.setattr(config, "INGEST_KEY", INGEST["X-API-Key"])
    monkeypatch.setenv("VISIT_INTEL_PREDICT_KEYS", "frontier-app:pk-frontier,bi:pk-bi")
    monkeypatch.delenv("VISIT_INTEL_PREDICT_RATE_PER_MIN", raising=False)
    monkeypatch.delenv("VISIT_INTEL_PREDICT_LIMITS", raising=False)
    with TestClient(app) as c:
        yield c


# ---- the loaded model -------------------------------------------------------------------------------------------
def test_uses_the_model_the_service_loaded(svc, model):
    assert svc.get("/health").json()["model"] == model.version
    body = svc.post("/v1/predict", json=ORDER, headers=FRONTIER).json()
    assert body["model_version"] == model.version and model.calls == 1
    # POST /v1/reanalyze swaps the service's model; predictions follow it with no restart.
    newer = FakeModel("20261201-000000")
    api_module.STATE["model"] = newer
    assert svc.post("/v1/predict", json=ORDER, headers=FRONTIER).json()["model_version"] == newer.version
    assert newer.calls == 1


def test_prediction_contract(svc):
    r = svc.post("/v1/predict", json=ORDER, headers=FRONTIER)
    assert r.status_code == 200
    b = r.json()
    assert b["id"] == "ref-1"
    assert b["segment"]["code"] == "HOT_ORDER" and 0 <= b["segment"]["confidence"] <= 1
    assert b["urgency"]["level"] in ("P0", "P1", "P2", "P3")
    assert isinstance(b["flags"], list) and {"playbook_id", "owner", "text"} <= b["action"].keys()
    assert isinstance(b["extracted"], dict) and isinstance(b["needs_human_review"], bool)
    # Alternatives: the model's other candidates, most likely first, never the chosen segment.
    assert [a["code"] for a in b["alternatives"]] == ["PAYMENT", "NEW_LEAD"]
    assert all(a["source"] == "ml" and 0 < a["probability"] < 1 for a in b["alternatives"])
    assert "evidence" not in b and "explanation" not in b
    detail = svc.post("/v1/predict?detail=true", json=ORDER, headers=FRONTIER).json()
    assert isinstance(detail["evidence"], dict) and isinstance(detail["explanation"], dict)


def test_rules_only_alternatives_come_from_the_keyword_model(monkeypatch):
    monkeypatch.setattr(api_module.SegmentModel, "load", classmethod(lambda cls, path: None))
    monkeypatch.setenv("VISIT_INTEL_PREDICT_KEYS", "frontier-app:pk-frontier")
    with TestClient(app) as c:
        b = c.post("/v1/predict", json=ORDER, headers=FRONTIER).json()
    assert b["model_version"] == "rules-only"
    assert all(a["source"] == "keywords" and a["code"] != b["segment"]["code"] for a in b["alternatives"])


def test_batch_keeps_order(svc):
    visits = [ORDER, {"id": "ref-2", "transcript": "Payment of 2 lakh is outstanding, will collect tomorrow."},
              {"transcript": "Customer asked for a price cut, otherwise will buy from a competitor."}]
    r = svc.post("/v1/predict/batch", json={"visits": visits}, headers=FRONTIER)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 3 and [x["id"] for x in body["results"]] == ["ref-1", "ref-2", None]


# ---- keys -------------------------------------------------------------------------------------------------------
def test_only_prediction_keys_open_prediction_routes(svc):
    for path, payload in (("/v1/predict", ORDER), ("/v1/predict/batch", {"visits": [ORDER]})):
        for headers in ({}, {"X-API-Key": "nope"}, INTERNAL, INGEST):
            assert svc.post(path, json=payload, headers=headers).status_code == 401, (path, headers)
        assert svc.post(path, json=payload, headers=BI).status_code == 200


def test_prediction_keys_open_nothing_else(svc):
    for method, path in (("get", "/v1/visits"), ("get", "/v1/insights/md"), ("get", "/v1/keywords"),
                         ("get", "/v1/model/health"), ("post", "/v1/visits/segment"), ("post", "/v1/visits/batch"),
                         ("post", "/v1/reanalyze"), ("get", "/v1/internal/openapi.json")):
        assert svc.request(method, path, json={"visits": []}, headers=FRONTIER).status_code == 401, path


def test_a_bad_key_is_refused_before_the_body_is_judged(svc):
    assert svc.post("/v1/predict", json={"transcript": ""}).status_code == 401


# ---- validation -------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("payload", [
    {}, {"transcript": ""}, {"transcript": "   \n "}, {"transcript": "x" * 8001}, {"transcript": 123},
    {"transcript": "ok", "visit_date": "2026-11-03"}, {"transcript": "ok", "visit_date": "31-02-2026"},
    {"transcript": "ok", "id": "x" * 65}, [ORDER],
])
def test_invalid_single_payloads(svc, payload):
    r = svc.post("/v1/predict", json=payload, headers=FRONTIER)
    assert r.status_code == 422 and isinstance(r.json()["detail"], list)


def test_invalid_batches_and_bodies(svc):
    assert svc.post("/v1/predict/batch", json={"visits": []}, headers=FRONTIER).status_code == 422
    assert svc.post("/v1/predict/batch", json={"visits": [ORDER] * 201}, headers=FRONTIER).status_code == 422
    assert svc.post("/v1/predict/batch", json={"visits": [ORDER, {"transcript": ""}]}, headers=FRONTIER).status_code == 422
    r = svc.post("/v1/predict", content=b"{not json", headers={**FRONTIER, "Content-Type": "application/json"})
    assert r.status_code == 422
    big = svc.post("/v1/predict", content=b"x" * (predict_api.MAX_BODY_BYTES + 1),
                   headers={**FRONTIER, "Content-Type": "application/json"})
    assert big.status_code == 413 and "too large" in big.json()["detail"]


# ---- rate limits ------------------------------------------------------------------------------------------------
def test_rate_limit_is_per_caller(monkeypatch, model):
    monkeypatch.setenv("VISIT_INTEL_PREDICT_KEYS", "frontier-app:pk-frontier,bi:pk-bi")
    monkeypatch.setenv("VISIT_INTEL_PREDICT_RATE_PER_MIN", "3")
    monkeypatch.setenv("VISIT_INTEL_PREDICT_LIMITS", "frontier-app=4")
    with TestClient(app) as c:
        r = c.post("/v1/predict/batch", json={"visits": [ORDER] * 3}, headers=FRONTIER)
        assert r.status_code == 200 and r.headers["X-RateLimit-Limit"] == "4" and r.headers["X-RateLimit-Remaining"] == "1"
        assert c.post("/v1/predict", json={"transcript": ""}, headers=FRONTIER).status_code == 422  # costs nothing
        assert c.post("/v1/predict", json=ORDER, headers=FRONTIER).status_code == 200
        over = c.post("/v1/predict", json=ORDER, headers=FRONTIER)
        assert over.status_code == 429 and int(over.headers["Retry-After"]) >= 1
        ok = c.post("/v1/predict", json=ORDER, headers=BI)  # bi has its own allowance (the default, 3)
        assert ok.status_code == 200 and ok.headers["X-RateLimit-Limit"] == "3"
        too_big = c.post("/v1/predict/batch", json={"visits": [ORDER] * 5}, headers=BI)
        assert too_big.status_code == 429 and "Retry-After" not in too_big.headers
        # The internal API has no such limit and is unaffected.
        assert c.post("/v1/visits/segment", json={"Transcript / Remarks": "order 5 MT"}, headers=INTERNAL).status_code == 200


# ---- zero database writes ---------------------------------------------------------------------------------------
def test_predictions_write_nothing_to_the_database(svc):
    statements: list[str] = []

    def capture(conn, cursor, statement, *args):
        statements.append(statement.lstrip().split(None, 1)[0].upper())

    def writes() -> list[str]:
        return [s for s in statements if s in {"INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "REPLACE"}]

    keywords_reloaded = __import__("visit_intel.keywords", fromlist=["invalidate"])
    keywords_reloaded.invalidate()  # make the first prediction read the keyword table, so reads are seen too
    event.listen(engine, "before_cursor_execute", capture)
    try:
        assert svc.post("/v1/predict", json=ORDER, headers=FRONTIER).status_code == 200
        assert svc.post("/v1/predict?detail=true", json=ORDER, headers=FRONTIER).status_code == 200
        assert svc.post("/v1/predict/batch", json={"visits": [ORDER] * 5}, headers=FRONTIER).status_code == 200
        assert svc.post("/v1/predict", json={"transcript": ""}, headers=FRONTIER).status_code == 422
        assert "SELECT" in statements and writes() == [], statements  # the listener saw the keyword read, and no write
        # Positive control: the same listener does see the ingest endpoint's writes.
        unique = {"Visit ID": f"control-{uuid.uuid4()}", "Transcript / Remarks": "order 5 MT"}
        assert svc.post("/v1/visits/segment", json=unique, headers=INGEST).status_code == 200
        assert "INSERT" in writes(), statements
    finally:
        event.remove(engine, "before_cursor_execute", capture)


def test_ingest_still_stores_and_prediction_does_not(svc):
    raw = {**{"Visit ID": "predict-test-1"}, "Transcript / Remarks": "Confirmed 5 MT order, payment today.",
           "Visit Category": "DEALER"}
    before = len(svc.get("/v1/visits", headers=INTERNAL).json())
    assert svc.post("/v1/predict", json={"transcript": raw["Transcript / Remarks"]}, headers=FRONTIER).status_code == 200
    assert len(svc.get("/v1/visits", headers=INTERNAL).json()) == before
    assert svc.post("/v1/visits/segment", json=raw, headers=INGEST).status_code == 200
    assert len(svc.get("/v1/visits", headers=INTERNAL).json()) == before + 1


# ---- documentation ----------------------------------------------------------------------------------------------
def test_public_docs_show_only_the_prediction_surface(svc):
    spec = svc.get("/openapi.json").json()
    assert set(spec["paths"]) == PUBLIC
    assert spec["info"]["title"] == predict_api.TITLE
    assert spec["components"]["securitySchemes"]["APIKeyHeader"]["name"] == "X-API-Key"
    assert {"Prediction", "BatchOut", "VisitIn", "Alternative"} <= set(spec["components"]["schemas"])
    for code in ("401", "413", "422", "429"):
        assert code in spec["paths"]["/v1/predict"]["post"]["responses"]
    page = svc.get("/docs")
    assert page.status_code == 200 and "/openapi.json" in page.text and "swagger" in page.text.lower()
    assert svc.get("/redoc").status_code == 404


def test_full_internal_contract_needs_the_internal_key(svc):
    assert svc.get("/v1/internal/openapi.json").status_code == 401
    assert svc.get("/v1/internal/openapi.json", headers=INGEST).status_code == 401
    spec = svc.get("/v1/internal/openapi.json", headers=INTERNAL).json()
    assert "/v1/visits/segment" in spec["paths"] and "/v1/predict" in spec["paths"]


def test_taxonomy_and_health_stay_open(svc):
    assert svc.get("/health").status_code == 200
    t = svc.get("/v1/taxonomy").json()
    assert "HOT_ORDER" in t["segments"] and "P0" in t["urgency"] and t["flags"]


# ---- switched off or misconfigured: the internal service is unaffected ------------------------------------------
@pytest.mark.parametrize("env", [
    {},                                                                                   # not configured
    {"VISIT_INTEL_PREDICT_KEYS": "frontier-app:pk-frontier", "VISIT_INTEL_PREDICT_LIMITS": "ghost=5"},
    {"VISIT_INTEL_PREDICT_KEYS": "frontier-app:pk-frontier", "VISIT_INTEL_PREDICT_RATE_PER_MIN": "fast"},
    {"VISIT_INTEL_PREDICT_KEYS": "oops:test-key"},                                        # reuses the internal key
])
def test_off_or_misconfigured_turns_off_only_prediction(monkeypatch, model, env):
    for k in ("VISIT_INTEL_PREDICT_KEYS", "VISIT_INTEL_PREDICT_LIMITS", "VISIT_INTEL_PREDICT_RATE_PER_MIN"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    with TestClient(app) as c:
        assert c.post("/v1/predict", json=ORDER, headers=FRONTIER).status_code == 503
        assert c.post("/v1/predict", json=ORDER, headers=INTERNAL).status_code == 503
        assert c.get("/health").json()["model"] == model.version
        assert c.get("/v1/insights/md", headers=INTERNAL).status_code == 200


def test_require_model_refuses_to_start_without_it(monkeypatch):
    monkeypatch.setattr(api_module.SegmentModel, "load", classmethod(lambda cls, path: None))
    monkeypatch.setenv("VISIT_INTEL_REQUIRE_MODEL", "1")
    with pytest.raises(RuntimeError, match="no trained model"), TestClient(app):
        pass
