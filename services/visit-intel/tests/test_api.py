from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from visit_intel.api import app

RAW = Path(__file__).resolve().parent.parent / "data/raw/visit_transcripts_raw.csv"
KEY = {"X-API-Key": "test-key"}
ONE = {"Sales Rep Name": "RAVI KUMAR", "Visit Date": "30-10-2026", "Visit Time": "11:13:00 AM",
       "Customer Name": "Test Dealer", "Contact Person": "Test Dealer", "Contact Number": "9000000001",
       "Visit Category": "DEALER", "Transcript / Remarks": "The client has confirmed a 5 MT order and a full payment today."}


def test_requires_api_key():
    with TestClient(app) as c:
        assert c.get("/health").status_code == 200
        assert c.get("/v1/insights/md").status_code == 401
        assert c.get("/v1/insights/md", headers={"X-API-Key": "wrong"}).status_code == 401


def test_segment_is_idempotent_and_label_overrides():
    with TestClient(app) as c:
        r1 = c.post("/v1/visits/segment", json=ONE, headers=KEY).json()
        r2 = c.post("/v1/visits/segment", json=ONE, headers=KEY).json()
        assert r1["visit_key"] == r2["visit_key"] and r1["segment"]["code"] == "HOT_ORDER"
        assert sum(v["visit_key"] == r1["visit_key"] for v in c.get("/v1/visits", headers=KEY).json()) == 1

        labelled = c.post("/v1/labels", json={"visit_key": r1["visit_key"], "segment": "PAYMENT", "labeller": "sup"}, headers=KEY).json()
        assert labelled["segment"]["code"] == "PAYMENT" and labelled["segment"]["decided_by"] == "human"
        assert c.post("/v1/labels", json={"visit_key": r1["visit_key"], "segment": "NOPE"}, headers=KEY).status_code == 422


@pytest.mark.skipif(not RAW.exists(), reason="needs the (git-ignored) raw export")
def test_csv_import_and_every_role_view():
    with TestClient(app) as c:
        with open(RAW, "rb") as f:
            res = c.post("/v1/visits/import-csv", files={"file": ("v.csv", f, "text/csv")}, headers=KEY).json()
        assert res["stored"] == 34
        for role in ("md", "vp_sales", "supervisor", "business_analyst", "data_analyst"):
            body = c.get(f"/v1/insights/{role}", headers=KEY).json()
            assert body["role"] == role and body["overview"]["visits"] >= 34
        md = c.get("/v1/insights/md", headers=KEY).json()
        assert all("••••" in a["contact"] for a in md["alerts"])  # phones never leave the API in full


@pytest.mark.skipif(not RAW.exists(), reason="needs the (git-ignored) raw export")
def test_explore_filters_and_facets():
    with TestClient(app) as c:
        with open(RAW, "rb") as f:
            c.post("/v1/visits/import-csv", files={"file": ("v.csv", f, "text/csv")}, headers=KEY)
        everything = c.get("/v1/explore", headers=KEY).json()
        assert everything["total"] >= 34 and everything["facets"]["segment"]
        seg = everything["facets"]["segment"][0]
        one = c.get(f"/v1/explore?segment={seg['value']}", headers=KEY).json()
        assert one["total"] == seg["count"] and all(v["segment"] == seg["value"] for v in one["visits"])
        assert len(c.get("/v1/explore?segment=HOT_ORDER&urgency=P0&q=zzzz", headers=KEY).json()["visits"]) == 0


def test_ask_suggested_question_is_calculated_and_unknown_question_is_safe(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    with TestClient(app) as c:
        c.post("/v1/visits/segment", json=ONE, headers=KEY)
        a = c.post("/v1/ask", json={"question": "which visits need attention today", "role": "md"}, headers=KEY).json()
        assert a["source"] == "calculated" and a["matched_question"] == "Which visits need attention today?"
        b = c.post("/v1/ask", json={"question": "what is the weather in Kolkata", "role": "md"}, headers=KEY).json()
        assert b["source"] == "unavailable" and b["suggestions"]
        roles = c.get("/v1/insights/supervisor", headers=KEY).json()
        assert roles["suggested_questions"] and "recommendations" in roles
