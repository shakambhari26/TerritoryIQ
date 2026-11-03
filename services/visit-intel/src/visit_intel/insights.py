"""One view per role, built from analysed visits. Plain numbers and lists; the front end only formats them."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta

from .recommend import for_role as recommendations_for
from .taxonomy import FLAGS, SEGMENTS, URGENCY

RESULT_SEGMENTS = {"HOT_ORDER", "PAYMENT", "NEW_LEAD", "SITE_PIPELINE", "COMPETITOR_PRICE", "HAPPY_CUSTOMER", "COMPLAINT_ESCALATE", "TECH_SUPPORT"}
ROLES = ("md", "vp_sales", "supervisor", "business_analyst", "data_analyst")


def _mask(phone: str) -> str:
    return f"••••••{phone[-4:]}" if len(phone) >= 4 else ""


def brief(row: dict) -> dict:
    r = row["result"]
    qty = r["extracted"]["quantity"]
    return {
        "visit_key": row["visit_key"],
        "visit_at": row["visit_at"].isoformat(timespec="minutes") if row["visit_at"] else None,
        "rep_name": row["rep_name"],
        "customer_name": row["customer_name"],
        "contact": _mask(row["contact_number"]),
        "visit_category": row["visit_category"],
        "segment": r["segment"]["code"], "segment_name": r["segment"]["name"], "emoji": r["segment"]["emoji"],
        "group": r["segment"]["group"], "confidence": r["segment"]["confidence"], "decided_by": r["segment"]["decided_by"],
        "urgency": r["urgency"]["level"], "urgency_reason": r["urgency"]["reason"],
        "flags": r["flags"], "qty_mt": qty["value_mt"] if qty else None,
        "follow_up": r["extracted"]["follow_up"],
        "note_score": r["note_quality"]["score"], "note_issues": r["note_quality"]["issues"],
        "action": r["action"], "needs_review": r["needs_human_review"],
        "transcript": row["transcript"],
        "why": (r.get("explanation") or {}).get("summary"),
    }


def _filter(rows: list[dict], days: int | None) -> list[dict]:
    if not days:
        return rows
    dated = [r["visit_at"] for r in rows if r["visit_at"]]
    if not dated:
        return rows
    # Relative to the newest visit, so a historical import still shows its "last N days".
    cutoff = max(dated) - timedelta(days=days)
    return [r for r in rows if r["visit_at"] and r["visit_at"] >= cutoff]


def _qty(row) -> float:
    q = row["result"]["extracted"]["quantity"]
    return q["value_mt"] if q else 0.0


def _by_urgency(items: list[dict]) -> list[dict]:
    order = {k: i for i, k in enumerate(URGENCY)}
    return sorted(items, key=lambda b: (order[b["urgency"]], b["visit_at"] or ""), reverse=False)


def overview(rows: list[dict]) -> dict:
    seg = Counter(r["result"]["segment"]["code"] for r in rows)
    confirmed = sum(_qty(r) for r in rows if r["result"]["segment"]["code"] == "HOT_ORDER" and "confirm" in r["transcript"].lower())
    return {
        "visits": len(rows),
        "reps": len({r["rep_name"] for r in rows}),
        "customers": len({r["customer_name"] for r in rows}),
        "tonnes_confirmed": round(confirmed, 1),
        "tonnes_mentioned": round(sum(_qty(r) for r in rows), 1),
        "alerts_p0_p1": sum(r["result"]["urgency"]["level"] in ("P0", "P1") for r in rows),
        "competitor_visits": sum(bool(r["result"]["extracted"]["competitors"]) for r in rows),
        "payment_visits": seg["PAYMENT"] + sum("PAYMENT_RECEIVED" in r["result"]["flags"] for r in rows if r["result"]["segment"]["code"] != "PAYMENT"),
        "needs_review": sum(r["result"]["needs_human_review"] for r in rows),
        "avg_note_score": round(sum(r["result"]["note_quality"]["score"] for r in rows) / len(rows), 1) if rows else None,
        "date_from": min((r["visit_at"] for r in rows if r["visit_at"]), default=None),
        "date_to": max((r["visit_at"] for r in rows if r["visit_at"]), default=None),
    }


def segment_counts(rows: list[dict]) -> list[dict]:
    seg = Counter(r["result"]["segment"]["code"] for r in rows)
    return [{"code": c, "name": n, "emoji": e, "group": g, "count": seg[c]} for c, (n, e, g, _) in SEGMENTS.items()]


def md(rows: list[dict]) -> dict:
    groups = Counter(r["result"]["segment"]["group"] for r in rows)
    brands = Counter((c["brand"] or "Unnamed") for r in rows for c in r["result"]["extracted"]["competitors"])
    alerts = _by_urgency([brief(r) for r in rows if r["result"]["urgency"]["level"] in ("P0", "P1")])
    return {"overview": overview(rows), "groups": [{"group": g, "count": n} for g, n in groups.most_common()],
            "competitors": [{"brand": b, "visits": n} for b, n in brands.most_common()],
            "alerts": alerts[:20], "segments": segment_counts(rows)}


def vp_sales(rows: list[dict]) -> dict:
    by_rep: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_rep[r["rep_name"]].append(r)
    reps = []
    for rep, rs in by_rep.items():
        segs = Counter(r["result"]["segment"]["code"] for r in rs)
        results = sum(n for s, n in segs.items() if s in RESULT_SEGMENTS)
        reps.append({
            "rep_name": rep, "visits": len(rs), "result_rate": round(results / len(rs), 2),
            "avg_note_score": round(sum(r["result"]["note_quality"]["score"] for r in rs) / len(rs), 1),
            "orders": segs["HOT_ORDER"], "tonnes": round(sum(_qty(r) for r in rs), 1), "new_leads": segs["NEW_LEAD"],
            "competitor_visits": sum(bool(r["result"]["extracted"]["competitors"]) for r in rs),
            "no_result": segs["LOW_VALUE_VISIT"] + segs["UNCLEAR_RECORDING"],
            "alerts": sum(r["result"]["urgency"]["level"] in ("P0", "P1") for r in rs),
        })
    reps.sort(key=lambda x: (-x["result_rate"], -x["visits"]))
    pipeline = [brief(r) for r in rows if r["result"]["segment"]["code"] in ("SITE_PIPELINE", "NEW_LEAD", "HOT_ORDER")]
    competitor = [brief(r) for r in rows if r["result"]["extracted"]["competitors"]]
    return {"overview": overview(rows), "reps": reps, "pipeline": pipeline[:30], "competitor_visits": competitor[:30]}


def supervisor(rows: list[dict]) -> dict:
    todo = _by_urgency([brief(r) for r in rows if r["result"]["urgency"]["level"] in ("P0", "P1")])
    follow = [brief(r) for r in rows if "FOLLOW_UP" in r["result"]["flags"] and r["result"]["urgency"]["level"] not in ("P0", "P1")]
    follow.sort(key=lambda b: (b["follow_up"] or {}).get("date") or "9999")
    rerecord = [brief(r) for r in rows if r["result"]["segment"]["code"] == "UNCLEAR_RECORDING" or r["result"]["note_quality"]["score"] <= 3]
    review = [brief(r) for r in rows if r["result"]["needs_human_review"]]
    coach = []
    by_rep: dict[str, list[int]] = defaultdict(list)
    for r in rows:
        by_rep[r["rep_name"]].append(r["result"]["note_quality"]["score"])
    for rep, scores in by_rep.items():
        avg = sum(scores) / len(scores)
        if avg < 5:
            coach.append({"rep_name": rep, "avg_note_score": round(avg, 1), "notes": len(scores)})
    coach.sort(key=lambda c: c["avg_note_score"])
    return {"overview": overview(rows), "urgent": todo, "follow_ups": follow[:40], "re_record": rerecord[:40],
            "review_queue": review[:40], "coach": coach}


def business_analyst(rows: list[dict]) -> dict:
    matrix: dict[str, Counter] = defaultdict(Counter)
    daily: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        matrix[r["result"]["stakeholder"]][r["result"]["segment"]["code"]] += 1
        if r["visit_at"]:
            daily[r["visit_at"].date().isoformat()][r["result"]["segment"]["group"]] += 1
    flags = Counter(f for r in rows for f in r["result"]["flags"])
    return {
        "overview": overview(rows),
        "segments": segment_counts(rows),
        "by_stakeholder": [{"stakeholder": s, **{c: n for c, n in cnt.items()}} for s, cnt in sorted(matrix.items())],
        "daily": [{"date": d, **dict(c)} for d, c in sorted(daily.items())],
        "sentiment": dict(Counter(r["result"]["sentiment"] for r in rows)),
        "urgency": {k: sum(r["result"]["urgency"]["level"] == k for r in rows) for k in URGENCY},
        "flags": [{"flag": f, "name": FLAGS.get(f, f), "count": n} for f, n in flags.most_common()],
    }


def data_analyst(rows: list[dict], model_meta: dict | None) -> dict:
    phones: dict[str, set] = defaultdict(set)
    for r in rows:
        if r["contact_number"]:
            phones[r["contact_number"]].add(r["customer_name"])
    shared = {p: sorted(c) for p, c in phones.items() if len(c) > 1}
    scores = Counter(r["result"]["note_quality"]["score"] for r in rows)
    ambiguous = Counter(t for r in rows for t in r["result"]["evidence"]["lexicon"]["lex_ambiguous"])
    conf = [r["result"]["segment"]["confidence"] for r in rows]
    return {
        "overview": overview(rows),
        "model": model_meta,
        "decided_by": dict(Counter(r["result"]["segment"]["decided_by"] for r in rows)),
        "avg_confidence": round(sum(conf) / len(conf), 3) if conf else None,
        "quality": {
            "invalid_phones": sum("PHONE_INVALID" in r["result"]["flags"] for r in rows),
            "shared_phones": [{"phone": _mask(p), "customers": c} for p, c in shared.items()],
            "category_mismatch": sum("CATEGORY_MISMATCH" in r["result"]["flags"] for r in rows),
            "unclear_recordings": sum(r["result"]["segment"]["code"] == "UNCLEAR_RECORDING" for r in rows),
            "ambiguous_slang": dict(ambiguous),
        },
        "note_score_distribution": [{"score": s, "visits": scores.get(s, 0)} for s in range(11)],
    }


def for_role(role: str, rows: list[dict], days: int | None, model_meta: dict | None) -> dict:
    rows = _filter(rows, days)
    view = {"md": md, "vp_sales": vp_sales, "supervisor": supervisor, "business_analyst": business_analyst}.get(role)
    data = view(rows) if view else data_analyst(rows, model_meta)
    data["recommendations"] = recommendations_for(role, rows, model_meta)
    data["role"], data["generated_at"] = role, datetime.now().isoformat(timespec="seconds")
    return data


# ---- All visits (admin): filters + counts for every dropdown ----

FILTER_KEYS = ("group", "segment", "urgency", "flag", "rep", "stakeholder", "review", "q")


def _value(row: dict, key: str) -> list[str]:
    r = row["result"]
    return {
        "group": [r["segment"]["group"]],
        "segment": [r["segment"]["code"]],
        "urgency": [r["urgency"]["level"]],
        "flag": r["flags"],
        "rep": [row["rep_name"]],
        "stakeholder": [r["stakeholder"]],
        "review": ["1" if r["needs_human_review"] else "0"],
    }[key]


def _matches(row: dict, filters: dict, skip: str | None = None) -> bool:
    for key, want in filters.items():
        if not want or key == skip:
            continue
        if key == "q":
            hay = " ".join([row["transcript"], row["customer_name"], row["rep_name"]]).lower()
            if want.lower() not in hay:
                return False
        elif want not in _value(row, key):
            return False
    return True


def explore(rows: list[dict], filters: dict, days: int | None, model_meta: dict | None) -> dict:
    rows = _filter(rows, days)
    filters = {k: v for k, v in filters.items() if k in FILTER_KEYS and v}
    facets = {}
    for key in ("group", "segment", "urgency", "flag", "rep", "stakeholder"):
        counts = Counter(v for row in rows if _matches(row, filters, skip=key) for v in _value(row, key))
        facets[key] = [{"value": v, "count": n} for v, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]
    hits = [r for r in rows if _matches(r, filters)]
    visits = sorted((brief(r) for r in hits), key=lambda b: (list(URGENCY).index(b["urgency"]), b["visit_at"] or ""))
    return {
        "role": "explore", "filters": filters, "total": len(hits), "all": len(rows),
        "facets": facets, "visits": visits[:200],
        "segments": [{"code": c, "name": n, "emoji": e, "group": g} for c, (n, e, g, _) in SEGMENTS.items()],
        "flag_names": FLAGS,
        "overview": overview(hits),
        "recommendations": recommendations_for("explore", hits, model_meta),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }
