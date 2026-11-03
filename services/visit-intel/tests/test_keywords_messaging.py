from fastapi.testclient import TestClient

from visit_intel import keywords
from visit_intel.api import app
from visit_intel.explain import wilson
from visit_intel.pipeline import analyze, normalize
from visit_intel.taxonomy import FLAGS, SEGMENTS

KEY = {"X-API-Key": "test-key"}
NO_KEYWORDS_NEEDED = {"CATEGORY_MISMATCH", "PHONE_INVALID"}  # computed from the data, not from words


def visit(text, rep="KEYWORD REP", category="DEALER"):
    return {"Sales Rep Name": rep, "Visit Date": "31-10-2026", "Visit Time": "10:00:00 AM", "Customer Name": "Ratan Saha",
            "Contact Person": "Ratan Saha", "Contact Number": "9000000002", "Visit Category": category,
            "Transcript / Remarks": text}


def test_every_segment_and_sub_segment_has_keywords_in_all_three_languages():
    rows = keywords.read_csv()
    assert all(keywords.kind_of(r["target"]) for r in rows), "every keyword must point at a known segment or flag"
    cov = keywords.coverage(keywords._rows_from_csv())
    for target in list(SEGMENTS) + [f for f in FLAGS if f not in NO_KEYWORDS_NEEDED]:
        langs = set(cov.get(target, {}))
        assert "en" in langs, target
        assert langs & {"bn", "bn-Beng"} and langs & {"hi", "hi-Deva"}, f"{target} lacks Bengali or Hindi keywords"


def test_negation_flips_meaning_in_english_bengali_and_hindi():
    m = keywords.get()
    s = m.score("The mason is not happy with the delivery")
    assert any(x["term"] == "happy" and x["negated_by"] == "not" for x in s["matches"])
    assert s["segment_scores"]["COMPLAINT_ESCALATE"] > s["segment_scores"]["HAPPY_CUSTOMER"]
    assert m.score("No complaint, customer is satisfied")["top"] == "HAPPY_CUSTOMER"
    assert any(x["negated_by"] == "না" for x in m.score("খুশি না")["matches"])
    assert m.score("maal nei, gari asheni")["flags"] == ["DELIVERY_PROBLEM", "STOCK_OUT"]


def test_softmax_probabilities_add_to_one_and_prior_wins_on_silence():
    s = keywords.get().score("hello")
    assert abs(sum(p["probability"] for p in s["probabilities"]) - 1) < 1e-3
    assert s["top"] == "LOW_VALUE_VISIT" and not s["evidence_found"]


def test_every_visit_explains_itself():
    r = analyze(normalize(visit("Dealer says SRMB is cheaper, dam beshi. Will switch if rate not reduced.")), None)
    e = r["explanation"]
    assert [st["id"] for st in e["steps"]] == ["read", "keywords", "rules", "ml", "decision", "flags", "urgency", "note", "reliability"]
    assert "softmax" in e["steps"][1]["math"] and e["summary"].startswith(r["segment"]["name"])
    assert r["segment"]["code"] == "COMPETITOR_PRICE" and "PRICE_OBJECTION" in r["flags"]


def test_wilson_interval():
    lo, hi = wilson(8, 9)
    assert 0.55 < lo < 0.57 and 0.97 < hi < 0.99
    assert wilson(0, 0) == (0.0, 1.0)


def test_keyword_database_is_editable_and_changes_scoring():
    with TestClient(app) as c:
        assert c.get("/v1/keywords").status_code == 401
        listing = c.get("/v1/keywords", params={"target": "STOCK_OUT"}, headers=KEY).json()
        assert listing["source"] == "database" and listing["total"] > 10
        before = c.post("/v1/keywords/test", json={"text": "rod ka akaal hai"}, headers=KEY).json()
        assert "STOCK_OUT" not in before["flags"]
        added = c.post("/v1/keywords", json={"term": "rod ka akaal", "language": "hi", "target": "STOCK_OUT", "weight": 3},
                       headers=KEY)
        assert added.status_code == 200
        assert c.post("/v1/keywords", json={"term": "Rod ka akaal", "language": "hi", "target": "STOCK_OUT", "weight": 3},
                      headers=KEY).status_code == 409
        assert "STOCK_OUT" in c.post("/v1/keywords/test", json={"text": "rod ka akaal hai"}, headers=KEY).json()["flags"]
        c.patch(f"/v1/keywords/{added.json()['id']}", json={"active": False}, headers=KEY)
        assert "STOCK_OUT" not in c.post("/v1/keywords/test", json={"text": "rod ka akaal hai"}, headers=KEY).json()["flags"]
        assert c.post("/v1/keywords", json={"term": "xyz", "target": "NOPE", "weight": 1}, headers=KEY).status_code == 422


def test_two_way_message_round_trip(monkeypatch):
    for var in ("WHATSAPP_TOKEN", "SMTP_HOST", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://tiq.example")
    with TestClient(app) as c:
        key = c.post("/v1/visits/segment", json=visit("Mason complained the 10 mm bars are rusted. Very unhappy."), headers=KEY).json()["visit_key"]
        assert c.put("/v1/contacts", json={"rep_name": "Keyword Rep", "whatsapp": "12345"}, headers=KEY).status_code == 422
        saved = c.put("/v1/contacts", json={"rep_name": "Keyword Rep", "whatsapp": "98300 12345", "email": "rep@example.com"}, headers=KEY).json()
        assert saved["whatsapp"] == "…2345"

        d = c.post("/v1/messages/draft", json={"visit_key": key}, headers=KEY).json()
        assert d["source"] == "playbook" and d["todos"] and d["rep_name"] == "Keyword Rep"

        sent = c.post("/v1/messages", json={"rep_name": "Keyword Rep", "kind": "todo", "title": d["title"], "body": d["message"],
                                            "todos": d["todos"], "channels": ["in_app", "whatsapp", "email"], "visit_key": key},
                      headers=KEY).json()
        assert sent["deliveries"]["in_app"]["status"] == "delivered"
        assert sent["deliveries"]["whatsapp"]["status"] == "not_configured"
        assert sent["reply_link"].startswith("https://tiq.example/r/")
        token = sent["reply_token"]

        assert c.get("/v1/inbox/t/not-a-real-token-abcdefgh", headers=KEY).status_code == 404
        opened = c.get(f"/v1/inbox/t/{token}", headers=KEY).json()
        assert opened["status"] == "read"
        replied = c.post(f"/v1/inbox/t/{token}", json={"text": "Called him, replacing 2 bundles tomorrow", "done_todos": [0]}, headers=KEY).json()
        assert replied["status"] in ("replied", "done") and replied["todos"][0]["done"]
        closed = c.post(f"/v1/inbox/t/{token}", json={"done": True}, headers=KEY).json()
        assert closed["status"] == "done" and closed["done_at"]

        c.post(f"/v1/messages/{sent['id']}/note", json={"text": "Thanks, well handled"}, headers=KEY)
        inbox = c.get("/v1/inbox", params={"rep": "Keyword Rep"}, headers=KEY).json()
        assert [r["author"] for r in inbox[0]["replies"]] == ["rep", "ho"]
        assert inbox[0]["reply_link"].endswith(token) and "reply_token" not in inbox[0]
        assert inbox[0]["share"]["whatsapp"].startswith("https://wa.me/919830012345?text=")

        forged = token.split("-")[0] + "-" + "A" * 32
        assert c.get(f"/v1/inbox/t/{forged}", headers=KEY).status_code == 404
        other = format(sent["id"] + 1, "x")  # another message id with this message's signature
        assert c.get(f"/v1/inbox/t/{other}-{token.split('-')[1]}", headers=KEY).status_code == 404


def test_frontier_send_only_key_can_send_visits_but_read_nothing(monkeypatch):
    from visit_intel import config
    monkeypatch.setattr(config, "INGEST_KEY", "frontier-key")
    frontier = {"X-API-Key": "frontier-key"}
    with TestClient(app) as c:
        sent = c.post("/v1/visits/segment", json=visit("Order confirmed, 5 ton TMT, delivery Monday", rep="Frontier Rep"), headers=frontier)
        assert sent.status_code == 200 and sent.json()["visit_key"]
        again = {**visit("Order confirmed, 5 ton TMT", rep="Frontier Rep"), "Visit ID": "FR-77"}
        assert c.post("/v1/visits/segment", json=again, headers=frontier).json()["visit_key"] == "FR-77"
        again["Transcript / Remarks"] = "Order confirmed, 6 ton TMT"  # Frontier re-sends an edited visit: same row, updated
        c.post("/v1/visits/batch", json={"visits": [again]}, headers=frontier)
        assert c.get("/v1/visits/FR-77", headers=KEY).json()["transcript"] == "Order confirmed, 6 ton TMT"
        assert c.post("/v1/visits/batch", json={"visits": [visit("Dealer unhappy, rate beshi", rep="Frontier Rep")]},
                      headers=frontier).status_code == 200
        for path in ("/v1/visits", f"/v1/visits/{sent.json()['visit_key']}", "/v1/contacts", "/v1/messages", "/v1/keywords"):
            assert c.get(path, headers=frontier).status_code == 401, path
        assert c.post("/v1/visits/segment", json=visit("x"), headers={"X-API-Key": "wrong"}).status_code == 401
    monkeypatch.setattr(config, "INGEST_KEY", "")
    with TestClient(app) as c:  # unset means no second key, not an empty one that matches a blank header
        assert c.post("/v1/visits/segment", json=visit("x"), headers={"X-API-Key": ""}).status_code == 401
