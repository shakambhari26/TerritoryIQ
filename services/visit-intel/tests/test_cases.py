from fastapi.testclient import TestClient

from visit_intel.api import app

KEY = {"X-API-Key": "test-key"}


def visit(text, customer, rep="CASE REP"):
    return {"Sales Rep Name": rep, "Visit Date": "29-10-2026", "Visit Time": "09:30:00 AM", "Customer Name": customer,
            "Contact Person": customer, "Contact Number": "9000000003", "Visit Category": "RETAILER",
            "Transcript / Remarks": text}


def test_case_moves_new_seen_waiting_resolved_and_keeps_history(monkeypatch):
    for var in ("WHATSAPP_TOKEN", "SMTP_HOST", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    with TestClient(app) as c:
        key = c.post("/v1/visits/segment", json=visit("Delivery delayed again, customer very unhappy.", "Case Shop One"),
                     headers=KEY).json()["visit_key"]
        state = c.get(f"/v1/cases/{key}", headers=KEY).json()
        assert state["status"] == "new" and [e["kind"] for e in state["events"]] == ["visit"]

        seen = c.post(f"/v1/cases/{key}", json={"action": "seen", "actor": "Asha (HO)"}, headers=KEY).json()
        assert seen["status"] == "seen" and seen["seen_by"] == "Asha (HO)"
        assert c.post(f"/v1/cases/{key}", json={"action": "seen"}, headers=KEY).json()["events"] == seen["events"]

        sent = c.post("/v1/messages", json={"rep_name": "Case Rep", "kind": "todo", "title": "Find the late order",
                                            "todos": ["Call depot"], "visit_key": key}, headers=KEY).json()
        token = sent["reply_token"]
        assert c.get(f"/v1/cases/{key}", headers=KEY).json()["status"] == "waiting"
        c.get(f"/v1/inbox/t/{token}", headers=KEY)
        c.post(f"/v1/inbox/t/{token}", json={"text": "Truck leaves today", "done": True}, headers=KEY)
        waiting = c.get(f"/v1/cases/{key}", headers=KEY).json()
        assert waiting["status"] == "waiting" and waiting["rep_state"] == "done"

        resolved = c.post(f"/v1/cases/{key}", json={"action": "resolve", "actor": "Asha (HO)", "note": "Delivered"}, headers=KEY).json()
        assert resolved["status"] == "resolved" and resolved["resolution_note"] == "Delivered"
        kinds = [e["kind"] for e in resolved["events"]]
        assert kinds == ["visit", "seen", "message", "rep_read", "rep_replied", "rep_done", "resolved"]
        assert [e["at"] for e in resolved["events"]] == sorted(e["at"] for e in resolved["events"])

        reopened = c.post(f"/v1/cases/{key}", json={"action": "reopen", "note": "Customer called again"}, headers=KEY).json()
        assert reopened["status"] == "waiting" and reopened["events"][-1]["kind"] == "reopened"
        assert c.post(f"/v1/cases/{key}", json={"action": "note", "note": "  "}, headers=KEY).status_code == 422
        assert c.post("/v1/cases/no-such-visit", json={"action": "seen"}, headers=KEY).status_code == 404


def test_messaging_the_rep_about_a_visit_marks_it_seen_first():
    with TestClient(app) as c:
        key = c.post("/v1/visits/segment", json=visit("Dealer wants 3 MT next week.", "Send Seen Shop"), headers=KEY).json()["visit_key"]
        c.post("/v1/messages", json={"rep_name": "Case Rep", "title": "Call the dealer", "visit_key": key}, headers=KEY)
        state = c.get(f"/v1/cases/{key}", headers=KEY).json()
        assert state["status"] == "waiting" and [e["kind"] for e in state["events"]] == ["visit", "seen", "message"]


def test_explore_filters_on_status_urgency_and_search():
    with TestClient(app) as c:
        a = c.post("/v1/visits/segment", json=visit("Material quality bad, bars rusted, angry customer.", "Filter Shop A"),
                   headers=KEY).json()["visit_key"]
        b = c.post("/v1/visits/segment", json=visit("Confirmed 4 MT order today, payment done.", "Filter Shop B"),
                   headers=KEY).json()["visit_key"]
        c.post(f"/v1/cases/{b}", json={"action": "resolve"}, headers=KEY)

        def keys(**params):
            return {v["visit_key"] for v in c.get("/v1/explore", params=params, headers=KEY).json()["visits"]}

        assert a in keys(q="filter shop", status="open") and b not in keys(q="filter shop", status="open")
        assert keys(q="filter shop", status="resolved") == {b}
        assert a in keys(q="filter shop", urgency="urgent")
        data = c.get("/v1/explore", params={"q": "filter shop"}, headers=KEY).json()
        assert {f["value"] for f in data["facets"]["status"]} >= {"new", "resolved"}
        assert all(v["case"]["status"] for v in data["visits"])
