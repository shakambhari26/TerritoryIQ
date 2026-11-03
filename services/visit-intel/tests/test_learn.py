from fastapi.testclient import TestClient

from visit_intel import keywords, learn
from visit_intel.api import app
from visit_intel.db import Keyword, SessionLocal

KEY = {"X-API-Key": "test-key"}
EMPTY = keywords.Matcher([])


def ex(text, seg, w=1.0):
    return learn.Example(text, seg, w)


def test_learns_the_longest_phrase_shared_by_the_same_visits():
    examples = [ex("Dealer wants the zinc coated rebar sample next week", "NEW_LEAD"),
                ex("Mason asked for zinc coated rebar sample urgently", "NEW_LEAD"),
                ex("Payment collected in full", "PAYMENT"), ex("Order confirmed 5 MT", "HOT_ORDER"),
                ex("Nothing much today", "LOW_VALUE_VISIT")]
    terms = {p["term"]: p for p in learn.propose(examples, EMPTY)}
    assert "zinc coated rebar sample" in terms and terms["zinc coated rebar sample"]["target"] == "NEW_LEAD"
    assert "zinc coated" not in terms and "rebar" not in terms  # same visits: one piece of evidence, the long-tail one
    assert terms["zinc coated rebar sample"]["weight"] == 0.5


def test_needs_precision_three_visits_for_a_single_word_and_skips_what_is_known():
    examples = [ex("rusted bars again", "COMPLAINT_ESCALATE"), ex("rusted bars at site", "COMPLAINT_ESCALATE"),
                ex("rusted bars but happy", "HAPPY_CUSTOMER"), ex("bundle rusted slightly", "COMPLAINT_ESCALATE"), ex("rusted again", "COMPLAINT_ESCALATE"),
                ex("order placed", "HOT_ORDER"), ex("payment pending", "PAYMENT"), ex("new dealer", "NEW_LEAD"),
                ex("site starts", "SITE_PIPELINE"), ex("engineer visit", "TECH_SUPPORT"), ex("nothing", "LOW_VALUE_VISIT"),
                *[ex(f"routine call {i}", "LOW_VALUE_VISIT") for i in range(3)]]  # keep "rusted" under 40% of visits
    terms = {p["term"] for p in learn.propose(examples, EMPTY)}
    assert "rusted bars" not in terms  # 2 of 3 visits = 67% < 80%; "rusted" alone: 4 of 5 = 80%
    known = keywords.Matcher([keywords.Row(1, "rust*", "en", "COMPLAINT_ESCALATE", "segment", 2.0, "verified", "")])
    assert "rusted" in terms and "rusted" not in {p["term"] for p in learn.propose(examples, known)}


def test_silver_visits_only_give_weak_hints():
    examples = [ex("tata tiscon cheaper by 200", "COMPETITOR_PRICE", learn.SILVER),
                ex("tata tiscon cheaper here", "COMPETITOR_PRICE", learn.SILVER),
                *[ex(f"filler visit number {i}", "LOW_VALUE_VISIT", learn.SILVER) for i in range(4)]]
    p = next(p for p in learn.propose(examples, EMPTY) if p["term"] == "tata tiscon cheaper")
    assert p["weight"] == 0.25


def test_learning_round_adds_drafts_and_retires_keywords_that_stop_agreeing():
    with TestClient(app):
        with SessionLocal() as s:
            s.add(Keyword(term="blue bundle tag", language="en", target="HAPPY_CUSTOMER", kind="segment", weight=0.5,
                          status="draft", added_by=learn.AUTHOR))
            s.commit()
            examples = [ex("blue bundle tag missing, angry", "COMPLAINT_ESCALATE"), ex("blue bundle tag wrong", "COMPLAINT_ESCALATE")]
            support, precision = learn.recheck("blue bundle tag", "HAPPY_CUSTOMER", examples)
            assert (support, precision) == (0, 0)
            learn.examples_from_db = lambda _s, _e=examples: _e  # type: ignore[assignment]
            try:
                r = learn.learn(s)
            finally:
                from importlib import reload
                reload(learn)
            assert {"term": "blue bundle tag", "target": "HAPPY_CUSTOMER", "precision": 0} in r["retired"]
            k = s.query(Keyword).filter_by(term="blue bundle tag", target="HAPPY_CUSTOMER").one()
            assert k.active is False


def test_learn_endpoint_dry_run_changes_nothing():
    with TestClient(app) as c:
        before = c.get("/v1/keywords", headers=KEY).json()["total"]
        r = c.post("/v1/keywords/learn", params={"dry_run": True}, headers=KEY).json()
        assert r["dry_run"] is True and c.get("/v1/keywords", headers=KEY).json()["total"] == before
