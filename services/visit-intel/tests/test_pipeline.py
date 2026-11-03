from datetime import datetime

from visit_intel.extract import extract_all, follow_up
from visit_intel.lexicon import Lexicon
from visit_intel.pipeline import analyze, normalize

LEX = Lexicon.load()


def visit(text, category="DEALER", name="Test Customer", phone="9876543210"):
    return normalize({"Sales Rep Name": "A REP", "Visit Date": "30-10-2026", "Visit Time": "11:13:00 AM",
                      "Customer Name": name, "Contact Person": name, "Contact Number": phone,
                      "Visit Category": category, "Transcript / Remarks": text})


def test_normalize_frontier_export_row():
    v = visit("hello")
    assert v["rep_name"] == "A Rep"
    assert v["visit_at"] == datetime(2026, 10, 30, 11, 13)
    assert v["visit_key"] == visit("different text")["visit_key"]  # same visit re-sent keeps its key


def test_confirmed_order_is_decided_by_rules():
    r = analyze(visit("The client has confirmed a 5 MT order and a full payment today."), None)
    assert r["segment"]["code"] == "HOT_ORDER"
    assert r["segment"]["decided_by"] == "rules"
    assert r["extracted"]["quantity"]["value_mt"] == 5
    assert "PAYMENT_RECEIVED" in r["flags"]
    assert not r["needs_human_review"]


def test_meta_text_is_unclear_and_asks_for_re_record():
    r = analyze(visit("The audio mentions a payment follow-up."), None)
    assert r["segment"]["code"] == "UNCLEAR_RECORDING"
    assert r["action"]["playbook_id"] == "PB-17"


def test_unresolved_quality_complaint_is_p0():
    r = analyze(visit("Mason has a complaint: the 8 mm bars are rusted and the quality is poor."), None)
    assert r["segment"]["code"] == "COMPLAINT_ESCALATE"
    assert r["urgency"]["level"] == "P0"
    assert r["action"]["owner"] == "Area Sales Manager"


def test_bengali_slang_maps_to_competitor_and_payment():
    r = analyze(visit("Rajmistri bollo dam beshi, Shyam Steel sosta dicche. Baki taka porer shoptahe debe."), None, )
    assert r["segment"]["code"] == "COMPETITOR_PRICE"
    assert r["extracted"]["competitors"][0]["brand"] == "SHYAM"
    assert "PAYMENT" in r["evidence"]["lexicon"]["lex_segments"]


def test_no_invented_facts():
    r = analyze(visit("Discussed market situation."), None)
    ext = r["extracted"]
    assert ext["quantity"] is None and ext["amount"] is None and ext["grade"] is None and ext["competitors"] == []


def test_follow_up_dates_resolve_from_visit_day():
    friday = follow_up("next order will be placed by Friday", datetime(2026, 10, 30).date())  # visit on a Friday
    assert friday["date"] == "2026-11-06"
    assert follow_up("will come kal", None)["ambiguous"] is True


def test_quintal_converts_to_mt():
    assert extract_all("needs 20 quintal", None, LEX)["quantity"]["value_mt"] == 2


def test_invalid_phone_and_category_mismatch_flags():
    r = analyze(visit("Met with the Mason. His next roof job work is ongoing.", category="DEALER", phone="635800000"), None)
    assert "PHONE_INVALID" in r["flags"] and "CATEGORY_MISMATCH" in r["flags"]
