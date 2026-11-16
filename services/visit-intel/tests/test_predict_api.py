"""The stateless prediction API: auth, contract, no storage."""
import os

os.environ["VISIT_INTEL_PREDICT_KEYS"] = "team-a:key-a,key-b"

from fastapi.testclient import TestClient  # noqa: E402

from visit_intel.predict_api import MAX_BATCH, app  # noqa: E402

A = {"X-API-Key": "key-a"}
ORDER = {"id": "ref-1", "transcript": "The client has confirmed a 5 MT order and a full payment today.",
         "visit_category": "DEALER"}


def test_health_is_open_everything_else_needs_a_key():
    with TestClient(app) as c:
        assert c.get("/health").json()["ok"] is True
        for method, path in (("post", "/v1/predict"), ("post", "/v1/predict/batch"), ("get", "/v1/taxonomy")):
            assert c.request(method, path, json=ORDER).status_code == 401
            assert c.request(method, path, json=ORDER, headers={"X-API-Key": "nope"}).status_code == 401


def test_both_keys_work_and_contract():
    with TestClient(app) as c:
        for key in ("key-a", "key-b"):
            r = c.post("/v1/predict", json=ORDER, headers={"X-API-Key": key})
            assert r.status_code == 200
        body = r.json()
        assert body["id"] == "ref-1" and body["segment"]["code"] == "HOT_ORDER"
        assert body["urgency"]["level"] in ("P0", "P1", "P2", "P3")
        assert {"flags", "action", "needs_human_review", "model_version"} <= body.keys()
        assert "evidence" not in body and "explanation" not in body


def test_detail_adds_evidence():
    with TestClient(app) as c:
        body = c.post("/v1/predict?detail=true", json=ORDER, headers=A).json()
        assert "evidence" in body and "explanation" in body


def test_batch_and_limits():
    with TestClient(app) as c:
        r = c.post("/v1/predict/batch", json={"visits": [ORDER, {"transcript": "Payment of 2 lakh is outstanding, will collect tomorrow."}]}, headers=A)
        assert r.status_code == 200 and r.json()["count"] == 2
        assert c.post("/v1/predict/batch", json={"visits": []}, headers=A).status_code == 422
        assert c.post("/v1/predict/batch", json={"visits": [ORDER] * (MAX_BATCH + 1)}, headers=A).status_code == 422
        assert c.post("/v1/predict", json={"transcript": ""}, headers=A).status_code == 422
        assert c.post("/v1/predict", json={"transcript": "x" * 8001}, headers=A).status_code == 422


def test_taxonomy():
    with TestClient(app) as c:
        t = c.get("/v1/taxonomy", headers=A).json()
        assert "HOT_ORDER" in t["segments"] and "P0" in t["urgency"] and t["flags"]


def test_stores_nothing():
    from sqlalchemy import func, inspect, select
    from visit_intel.db import Analysis, SessionLocal, Visit, engine

    def counts():
        if "visits" not in inspect(engine).get_table_names():  # the API never creates tables itself
            return (0, 0)
        with SessionLocal() as s:
            return (s.scalar(select(func.count()).select_from(Visit)), s.scalar(select(func.count()).select_from(Analysis)))

    before = counts()
    with TestClient(app) as c:
        assert c.post("/v1/predict", json=ORDER, headers=A).status_code == 200
        assert c.post("/v1/predict/batch", json={"visits": [ORDER]}, headers=A).status_code == 200
    assert counts() == before


# ---- rate limits ------------------------------------------------------------------------------------------------
import pytest  # noqa: E402

from visit_intel.predict_api import RateLimiter, _parse_limits  # noqa: E402


def test_limiter_sliding_window_and_retry_after():
    now = [0.0]
    rl = RateLimiter(window=60, clock=lambda: now[0])
    assert rl.take("a", 3, 5) == (True, 2, 0)
    now[0] = 10
    assert rl.take("a", 2, 5) == (True, 0, 0)
    ok, left, retry = rl.take("a", 1, 5)
    assert (ok, left) == (False, 0) and retry == 50  # the first 3 visits leave the window at t=60
    assert rl.take("b", 5, 5)[0] is True  # callers do not share an allowance
    now[0] = 60
    assert rl.take("a", 3, 5)[0] is True  # window slid; the rejected call above used nothing
    assert rl.take("a", 9, 5) == (False, 0, 0)  # larger than the whole allowance: waiting never helps (retry 0)


def test_parse_limits():
    assert _parse_limits("hr=1200, bi=120") == {"hr": 1200, "bi": 120}
    for bad in ("hr", "hr=", "hr=abc", "hr=0", "=5"):
        with pytest.raises(RuntimeError):
            _parse_limits(bad)


def test_rate_limit_headers_and_429(monkeypatch):
    monkeypatch.setenv("VISIT_INTEL_PREDICT_RATE_PER_MIN", "3")
    monkeypatch.setenv("VISIT_INTEL_PREDICT_LIMITS", "team-a=5")
    with TestClient(app) as c:
        r = c.post("/v1/predict", json=ORDER, headers=A)
        assert r.headers["X-RateLimit-Limit"] == "5" and r.headers["X-RateLimit-Remaining"] == "4"  # team-a override
        assert c.post("/v1/predict/batch", json={"visits": [ORDER] * 4}, headers=A).status_code == 200
        r = c.post("/v1/predict", json=ORDER, headers=A)
        assert r.status_code == 429 and int(r.headers["Retry-After"]) >= 1 and r.headers["X-RateLimit-Remaining"] == "0"
        # key-b has no override: default 3, and its allowance is its own
        b = {"X-API-Key": "key-b"}
        assert c.post("/v1/predict/batch", json={"visits": [ORDER] * 3}, headers=b).status_code == 200
        big = c.post("/v1/predict/batch", json={"visits": [ORDER] * 4}, headers=b)
        assert big.status_code == 429 and "Retry-After" not in big.headers and "send fewer" in big.json()["detail"]
        # a bad key is refused before it can touch anyone's allowance
        assert c.post("/v1/predict", json=ORDER, headers={"X-API-Key": "nope"}).status_code == 401


def test_startup_refuses_bad_settings(monkeypatch):
    monkeypatch.setenv("VISIT_INTEL_PREDICT_LIMITS", "ghost=10")
    with pytest.raises(RuntimeError, match="no key"), TestClient(app):
        pass
    monkeypatch.delenv("VISIT_INTEL_PREDICT_LIMITS")
    monkeypatch.setenv("VISIT_INTEL_PREDICT_RATE_PER_MIN", "fast")
    with pytest.raises(RuntimeError, match="RATE_PER_MIN"), TestClient(app):
        pass
    monkeypatch.delenv("VISIT_INTEL_PREDICT_RATE_PER_MIN")
    monkeypatch.setenv("VISIT_INTEL_PREDICT_REQUIRE_MODEL", "1")  # the tests run without a trained model
    with pytest.raises(RuntimeError, match="no trained model"), TestClient(app):
        pass


# ---- the published contract ------------------------------------------------------------------------------------
def test_openapi_exposes_only_the_prediction_surface():
    with TestClient(app) as c:
        spec = c.get("/openapi.json").json()
    assert set(spec["paths"]) == {"/health", "/v1/predict", "/v1/predict/batch", "/v1/taxonomy"}
    assert spec["components"]["securitySchemes"]["APIKeyHeader"]["name"] == "X-API-Key"
    for name in ("Prediction", "BatchOut", "VisitIn", "Segment", "Urgency"):
        assert name in spec["components"]["schemas"]
    assert spec["paths"]["/v1/predict"]["post"]["operationId"] == "predict_visit"
    assert "429" in spec["paths"]["/v1/predict"]["post"]["responses"]


def test_response_shape_is_the_contract():
    with TestClient(app) as c:
        body = c.post("/v1/predict", json={"transcript": "Customer asked for a price cut, otherwise will buy from a competitor."}, headers=A).json()
        assert body["id"] is None and "evidence" not in body  # null id is kept, detail fields are left out
        assert body["segment"]["secondary"] is None or "code" in body["segment"]["secondary"]
        detail = c.post("/v1/predict?detail=true", json=ORDER, headers=A).json()
        assert isinstance(detail["evidence"], dict) and isinstance(detail["explanation"], dict)
