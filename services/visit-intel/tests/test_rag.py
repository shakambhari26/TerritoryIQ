import pytest

from visit_intel import rag
from visit_intel.pipeline import analyze, normalize

NOTES = [
    ("DEALER", "Sunrise Traders", "Order confirmed: 5 MT. They requested short-term credit."),
    ("MASON", "Sukanta Mondal", "Mason says price is high vs competitor, Shyam Steel is cheaper by 2 rupees per kg."),
    ("RETAILER", "Pal Hardware", "Complaint: delivery delay of 4 days, customer unhappy."),
    ("IHB", "Mohan Das", "Customer is happy with the quality and service."),
    ("IHB", "Bikash Das", "Roof casting work expected within 2 days."),
]


@pytest.fixture(scope="module")
def rows():
    out = []
    for i, (cat, name, text) in enumerate(NOTES):
        v = normalize({"Sales Rep Name": "Ravi Kumar" if i % 2 else "Amit Sen", "Visit Date": "30-10-2026",
                       "Visit Time": f"11:{10 + i}:00 AM", "Customer Name": name, "Contact Person": name,
                       "Contact Number": f"98000000{i:02d}", "Visit Category": cat, "Transcript / Remarks": text})
        out.append({**v, "result": analyze(v, None)})
    return out


@pytest.mark.parametrize("question,intent,needle", [
    ("How many orders did dealers give?", "count", "1 visit matches"),
    ("How many tonnes did Amit Sen bring?", "tonnes", "5 MT"),
    ("Tell me about Mohan Das", "lookup", "Mohan Das"),
    ("which dealers asked for credit", "list", "Sunrise"),
    ("dam beshi bolche kara?", "search", "price is high"),
])
def test_local_answers_without_api(rows, question, intent, needle, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    out = rag.chat(question, "md", rows, None, None)
    assert out["mode"] == "local" and out["intent"] == intent
    assert needle in out["answer"]


def test_best_customer_match_only(rows):
    assert rag.parse("Mohan Das", rows)["filters"]["customers"] == ["Mohan Das"]


def test_follow_on_keeps_previous_filters(rows):
    first = rag.chat("show me complaints", "md", rows, None, None)
    second = rag.chat("what about only retailers", "md", rows, first["filters"], None)
    assert second["filters"]["segments"] == ["COMPLAINT_ESCALATE"] and second["filters"]["categories"] == ["RETAILER"]


def test_synthesis_without_ai_falls_back_to_free_answer(rows, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    out = rag.chat("Why are competitors winning?", "md", rows, None, None)
    assert out["mode"] == "local" and "not switched on" in out["note"]


def test_index_rebuilds_when_data_changes(rows):
    first = rag.index_for(rows)
    assert rag.index_for(rows) is first
    assert rag.index_for(rows[:-1]) is not first
