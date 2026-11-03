"""Build the ML-ready visit dataset from the raw Frontier transcript export.

Usage:  python scripts/build_dataset.py
Output: data/processed/visits_dataset.csv and data/processed/visits_dataset.xlsx
"""
import re
from pathlib import Path

import sys

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from visit_intel.features import CATEGORY_GROUP, KEYWORDS  # noqa: E402

RAW = ROOT / "data/raw/visit_transcripts_raw.csv"
LABELS = ROOT / "data/labels/seed_labels_v1.csv"
OUT = ROOT / "data/processed"

SEGMENTS = [
    ("HOT_ORDER", "Order Ready", "Customer is ordering or about to order. Push delivery and close.", "VP Sales, Supervisor"),
    ("PAYMENT", "Money to Collect", "Payment, outstanding or credit was discussed. Collect or approve credit.", "MD/ED, VP Sales"),
    ("COMPETITOR_PRICE", "Competitor / Price Fight", "Customer uses or compares a rival brand or price. Decide on scheme or price support.", "MD/ED, VP Sales, Business Analyst"),
    ("COMPLAINT_ESCALATE", "Needs Boss Attention", "Complaint about delay, quality or service. Fix fast before we lose the customer.", "MD/ED, Supervisor"),
    ("SITE_PIPELINE", "Upcoming Site Demand", "Construction is running or about to start. Steel will be needed soon.", "VP Sales, Supervisor"),
    ("NEW_LEAD", "New Opportunity", "New customer, new site or new product interest. Follow up to convert.", "VP Sales, Supervisor"),
    ("TECH_SUPPORT", "Technical Help Needed", "Engineer, site check or technical support required.", "Supervisor"),
    ("HAPPY_CUSTOMER", "Happy Customer / Champion", "Customer is satisfied or loyal. Use for referrals and testimonials.", "MD/ED, VP Sales"),
    ("LOW_VALUE_VISIT", "Visit With No Result", "Visit happened but nothing useful came out. Coach the rep.", "Supervisor, VP Sales"),
    ("UNCLEAR_RECORDING", "Bad / Unclear Recording", "Transcript is vague, off-topic or likely an AI mistake. Re-check with the rep.", "Data Analyst, Supervisor"),
]

def clean_name(s: str) -> str:
    return re.sub(r"\s+", " ", str(s)).strip().title()


def main() -> None:
    df = pd.read_csv(RAW, dtype=str)
    df.columns = ["rep_name_raw", "visit_date_raw", "visit_time_raw", "customer_name_raw",
                  "contact_person_raw", "contact_number", "visit_category", "transcript"]
    df.insert(0, "visit_id", [f"V{i:04d}" for i in range(1, len(df) + 1)])

    df["rep_name"] = df["rep_name_raw"].map(clean_name)
    df["customer_name"] = df["customer_name_raw"].map(clean_name)
    df["contact_person"] = df["contact_person_raw"].map(clean_name)
    df["visit_category"] = df["visit_category"].str.strip().str.upper()
    df["category_group"] = df["visit_category"].map(CATEGORY_GROUP).fillna("OTHER")
    ts = pd.to_datetime(df["visit_date_raw"] + " " + df["visit_time_raw"], format="%d-%m-%Y %I:%M:%S %p")
    df["visit_datetime"] = ts.dt.strftime("%Y-%m-%d %H:%M:%S")
    df["visit_date"] = ts.dt.strftime("%Y-%m-%d")
    df["visit_hour"] = ts.dt.hour
    df["weekday"] = ts.dt.day_name()

    df["transcript"] = df["transcript"].str.strip()
    df["word_count"] = df["transcript"].str.split().str.len()
    df["char_count"] = df["transcript"].str.len()
    lower = df["transcript"].str.lower()
    for col, pattern in KEYWORDS.items():
        df[col] = lower.str.contains(pattern, regex=True).astype(int)

    # Data-quality checks: a valid Indian mobile is 10 digits starting 6-9.
    df["phone_valid"] = df["contact_number"].str.fullmatch(r"[6-9]\d{9}").astype(int)
    shared = df.groupby("contact_number")["customer_name"].transform("nunique")
    df["phone_shared_by_n_customers"] = shared
    df["contact_differs_from_customer"] = (df["customer_name"] != df["contact_person"]).astype(int)

    labels = pd.read_csv(LABELS, dtype=str).fillna("")
    df = df.merge(labels, on="visit_id", how="left")
    seg_names = {code: name for code, name, *_ in SEGMENTS}
    df["segment_primary_name"] = df["segment_primary"].map(seg_names)

    cols = ["visit_id", "rep_name", "visit_date", "visit_datetime", "visit_hour", "weekday",
            "customer_name", "contact_person", "contact_number", "visit_category", "category_group",
            "transcript", "word_count", "char_count", *KEYWORDS,
            "phone_valid", "phone_shared_by_n_customers", "contact_differs_from_customer",
            "segment_primary", "segment_primary_name", "segment_secondary", "label_confidence",
            "follow_up_needed", "qty_mt", "transcript_issue", "label_note",
            "rep_name_raw", "customer_name_raw", "contact_person_raw", "visit_date_raw", "visit_time_raw"]
    df = df[cols]

    issues = df[(df["phone_valid"] == 0) | (df["phone_shared_by_n_customers"] > 1) | (df["transcript_issue"] != "")]
    issues = issues[["visit_id", "rep_name", "customer_name", "contact_number", "phone_valid",
                     "phone_shared_by_n_customers", "transcript_issue", "label_note", "transcript"]]
    seg_df = pd.DataFrame(SEGMENTS, columns=["segment_code", "plain_name", "what_it_means", "who_uses_it"])
    seg_df["count_in_seed_data"] = seg_df["segment_code"].map(df["segment_primary"].value_counts()).fillna(0).astype(int)
    dictionary = pd.DataFrame({"column": cols, "description": [DESCRIPTIONS.get(c, "") for c in cols]})

    OUT.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT / "visits_dataset.csv", index=False)
    with pd.ExcelWriter(OUT / "visits_dataset.xlsx", engine="openpyxl") as xw:
        df.to_excel(xw, sheet_name="visits", index=False)
        seg_df.to_excel(xw, sheet_name="segments", index=False)
        issues.to_excel(xw, sheet_name="data_quality_issues", index=False)
        dictionary.to_excel(xw, sheet_name="data_dictionary", index=False)
        for ws in xw.book.worksheets:
            ws.freeze_panes = "B2"
            for col_cells in ws.columns:
                width = max(len(str(c.value or "")) for c in col_cells[:50])
                ws.column_dimensions[col_cells[0].column_letter].width = min(max(width + 2, 10), 60)

    print(f"{len(df)} visits -> {OUT}")
    print(seg_df[["segment_code", "count_in_seed_data"]].to_string(index=False))
    print(f"{len(issues)} rows with data-quality issues")


DESCRIPTIONS = {
    "visit_id": "Stable ID for the visit (V0001...)",
    "rep_name": "Sales rep, cleaned to Title Case",
    "visit_date": "Visit date, ISO format",
    "visit_datetime": "Visit date and time, 24h ISO format",
    "visit_hour": "Hour of day (0-23)",
    "weekday": "Day of week",
    "customer_name": "Customer, cleaned to Title Case",
    "contact_person": "Person or firm met, cleaned to Title Case",
    "contact_number": "Phone as recorded (personal data: hash before sharing or training)",
    "visit_category": "MASON, NEW MASON, ENGINEER, INFLUENCER, DEALER, RETAILER, IHB",
    "category_group": "INFLUENCER (mason/engineer), CHANNEL (dealer/retailer), END_CUSTOMER (IHB)",
    "transcript": "Gemini speech-to-text summary of the visit (the main ML input)",
    "word_count": "Words in transcript",
    "char_count": "Characters in transcript",
    "phone_valid": "1 if a valid 10-digit Indian mobile",
    "phone_shared_by_n_customers": ">1 means the same phone is recorded for different customers",
    "contact_differs_from_customer": "1 if contact person differs from customer name",
    "segment_primary": "Seed label: main business segment (hand-labelled, needs review)",
    "segment_primary_name": "Plain-language name of the main segment",
    "segment_secondary": "Seed label: second segment if the visit covers two topics",
    "label_confidence": "How sure the labeller was: high / medium / low",
    "follow_up_needed": "yes / no",
    "qty_mt": "Quantity in metric tonnes if mentioned (2-3 tons stored as 2.5)",
    "transcript_issue": "vague, noise, meta_text, plan_not_outcome, likely_hallucination, category_mismatch, name_mismatch, invalid_phone",
    "label_note": "Why this label was chosen",
}
DESCRIPTIONS.update({k: f"Rule flag (0/1): transcript matches /{v}/" for k, v in KEYWORDS.items()})
DESCRIPTIONS.update({c: "Original value from the export, unchanged" for c in
                     ["rep_name_raw", "customer_name_raw", "contact_person_raw", "visit_date_raw", "visit_time_raw"]})

if __name__ == "__main__":
    main()
