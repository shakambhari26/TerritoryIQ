from fastapi.testclient import TestClient

from visit_intel import headline
from visit_intel.api import app

KEY = {"X-API-Key": "test-key"}


def test_reads_the_headline_word_in_latin_and_bengali_letters():
    assert headline.parse("Headline: ORDER. Subhash Pal, dealer, 4 tonnes")["segment"] == "HOT_ORDER"
    assert headline.parse("headline new customer, Maa Durga Stores")["segment"] == "NEW_LEAD"
    assert headline.parse("হেডলাইন: কমপ্লেন। মনোজ সাহা, ডিলার")["segment"] == "COMPLAINT_ESCALATE"
    assert headline.parse("হেডলাইন অর্ডার, সুভাষ পাল")["segment"] == "HOT_ORDER"
    assert headline.parse("Headline - NO RESULT. Shop closed")["segment"] == "LOW_VALUE_VISIT"


def test_only_a_headline_at_the_start_counts():
    assert headline.parse("Dealer placed an order, headline order was big") is None
    assert headline.parse("Headline: orderly shop, nothing else") is None
    assert headline.parse("") is None


def test_a_rep_headline_that_disagrees_with_the_system_goes_to_review():
    visit = {"Sales Rep Name": "HEADLINE REP", "Visit Date": "01-11-2026", "Visit Time": "10:00:00 AM",
             "Customer Name": "Amal Ghosh", "Contact Person": "Amal Ghosh", "Contact Number": "9000000004",
             "Visit Category": "RETAILER"}
    with TestClient(app) as c:
        agree = c.post("/v1/visits/segment", json={**visit, "Transcript / Remarks":
                       "Headline: COMPLAINT. Amal Ghosh, retailer. Two bundles rusted in the last delivery, very unhappy. Replace by tomorrow."},
                       headers=KEY).json()
        assert agree["rep_headline"]["segment"] == "COMPLAINT_ESCALATE" == agree["segment"]["code"]
        clash = c.post("/v1/visits/segment", json={**visit, "Customer Name": "Bipul Das", "Transcript / Remarks":
                       "Headline: HAPPY. Bipul Das, retailer. Two bundles rusted in the last delivery, very unhappy, complaint."},
                       headers=KEY).json()
        assert clash["rep_headline"]["segment"] == "HAPPY_CUSTOMER" != clash["segment"]["code"]
        assert clash["needs_human_review"] is True
