"""Ingest and re-analysis, shared by the API and the backfill script so both behave identically."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Analysis, Visit, latest_label, visit_dict
from .model import SegmentModel
from .pipeline import analyze, normalize


def _save(session: Session, key: str, result: dict) -> None:
    row = session.get(Analysis, key) or Analysis(visit_key=key)
    row.segment = result["segment"]["code"]
    row.urgency = result["urgency"]["level"]
    row.confidence = result["segment"]["confidence"]
    row.decided_by = result["segment"]["decided_by"]
    row.needs_review = result["needs_human_review"]
    row.note_score = result["note_quality"]["score"]
    row.model_version = result["model_version"]
    row.result = result
    session.add(row)


def ingest(session: Session, raws: list[dict], model: SegmentModel | None) -> dict:
    """Idempotent: the same Frontier visit sent twice is stored once (keyed on its ID or rep+time+customer+phone)."""
    stored = skipped = review = 0
    for raw in raws:
        visit = normalize(raw)
        if not visit["transcript"]:
            skipped += 1
            continue
        row = session.get(Visit, visit["visit_key"]) or Visit(visit_key=visit["visit_key"])
        for field in ("rep_name", "visit_at", "customer_name", "contact_person", "contact_number", "visit_category", "transcript"):
            setattr(row, field, visit[field])
        row.raw = {k: (None if v is None else str(v)) for k, v in raw.items()}
        session.add(row)
        result = analyze(visit, model, latest_label(session, visit["visit_key"]))
        _save(session, visit["visit_key"], result)
        stored += 1
        review += result["needs_human_review"]
    session.commit()
    return {"received": len(raws), "stored": stored, "skipped_empty": skipped, "needs_review": review}


def reanalyze(session: Session, model: SegmentModel | None, keys: list[str] | None = None) -> int:
    query = select(Visit) if keys is None else select(Visit).where(Visit.visit_key.in_(keys))
    n = 0
    for v in session.scalars(query):
        _save(session, v.visit_key, analyze(visit_dict(v), model, latest_label(session, v.visit_key)))
        n += 1
    session.commit()
    return n


def all_rows(session: Session) -> list[dict]:
    rows = session.execute(select(Visit, Analysis).join(Analysis, Analysis.visit_key == Visit.visit_key)).all()
    return [{**visit_dict(v), "result": a.result} for v, a in rows]
