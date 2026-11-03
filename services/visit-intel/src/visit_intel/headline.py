"""The rep's own label: a note that opens with "Headline: ORDER" (the reps' guide, docs/rep-guide) names its group.

Reps say one of 9 English words. Speech-to-text may write it in Latin or Bengali / Devanagari letters, so each word
has its common spellings. Only the start of the note counts (first 80 characters), so "headline" said later in passing
is not taken as a label. The word is the rep's claim, not the answer: when it disagrees with the system, the visit
goes to a supervisor, whose decision becomes a human label (learn.py and model training then use it).
"""
from __future__ import annotations

import re

WORDS: dict[str, tuple[str, ...]] = {
    "NEW_LEAD": ("new customer", "নিউ কাস্টমার", "न्यू कस्टमर"),
    "LOW_VALUE_VISIT": ("no result", "নো রেজাল্ট", "नो रिजल्ट"),
    "HOT_ORDER": ("order", "অর্ডার", "অডার", "ऑर्डर", "आर्डर"),
    "PAYMENT": ("payment", "পেমেন্ট", "पेमेंट"),
    "COMPETITOR_PRICE": ("competitor", "কম্পিটিটর", "কমপিটিটর", "कम्पटीटर", "कॉम्पिटिटर"),
    "COMPLAINT_ESCALATE": ("complaint", "complain", "কমপ্লেন", "কমপ্লেইন", "কমপ্লেন্ট", "कंप्लेंट", "कम्प्लेन"),
    "SITE_PIPELINE": ("site", "সাইট", "साइट"),
    "TECH_SUPPORT": ("engineer", "ইঞ্জিনিয়ার", "इंजीनियर"),
    "HAPPY_CUSTOMER": ("happy", "হ্যাপি", "হ্যাপী", "हैप्पी"),
}
_LEAD = r"(?:headline|head line|হেডলাইন|হেড লাইন|हेडलाइन|हेड लाइन)"
_SPELLING = {w.lower(): seg for seg, words in WORDS.items() for w in words}
# Longest first, so "new customer" wins over a shorter word and "no result" is not read as something else.
_RX = re.compile(rf"^\W{{0,3}}{_LEAD}\s*[:\-–—.,]?\s*(" + "|".join(sorted(map(re.escape, _SPELLING), key=len, reverse=True)) + r")(?![A-Za-z])",
                 re.IGNORECASE)


def parse(text: str) -> dict | None:
    """{"word": what was said, "segment": its group} when the note opens with a headline, else None."""
    m = _RX.match((text or "")[:80])
    return {"word": m.group(1), "segment": _SPELLING[m.group(1).lower()]} if m else None
