"""Head office's follow-through on each visit: new -> seen -> waiting on rep -> resolved, and the history behind it.

Only head office's own steps are stored (VisitCase, CaseEvent). Whether the rep was messaged, opened it, replied or
finished comes from the messages tables, so the history can never disagree with the message thread.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import CaseEvent, Message, MessageReply, VisitCase

STATUSES = ("new", "seen", "waiting", "resolved")
ACTIONS = ("seen", "resolve", "reopen", "note")
LIFECYCLE = ("visit", "seen", "message", "rep_read", "rep_replied", "note", "rep_done", "resolved", "reopened")
IST = timezone(timedelta(hours=5, minutes=30))


def _aware(d: datetime | None, naive_tz: timezone = timezone.utc) -> datetime | None:
    """SQLite drops the zone: stored timestamps are UTC, visit times are local (India)."""
    if d is None:
        return None
    return d if d.tzinfo else d.replace(tzinfo=naive_tz)


def _iso(d: datetime | None) -> str | None:
    return d.isoformat(timespec="seconds") if d else None


def _status(case: VisitCase | None, messages: list[Message]) -> str:
    if case and case.status == "resolved":
        return "resolved"
    if messages:
        return "waiting"
    return "seen" if case else "new"


def _rep_state(messages: list[Message]) -> str | None:
    """The latest message's state: sent | read | replied | done."""
    return messages[-1].status if messages else None


def _events(visit: dict, case: VisitCase | None, events: list[CaseEvent], messages: list[Message],
            replies: dict[int, list[MessageReply]]) -> list[dict]:
    out = []
    if visit.get("visit_at"):
        out.append({"kind": "visit", "at": _aware(visit["visit_at"], IST), "actor": visit["rep_name"], "text": ""})
    for e in events:
        out.append({"kind": e.kind, "at": _aware(e.at), "actor": e.actor, "text": e.text})
    for m in messages:
        out.append({"kind": "message", "at": _aware(m.created_at), "actor": m.sender, "text": m.title,
                    "todos": len(m.todos or []), "message_id": m.id})
        if m.read_at:
            out.append({"kind": "rep_read", "at": _aware(m.read_at), "actor": m.rep_name, "text": ""})
        for r in replies.get(m.id, []):
            out.append({"kind": "rep_replied" if r.author == "rep" else "note", "at": _aware(r.created_at),
                        "actor": m.rep_name if r.author == "rep" else "Head Office", "text": r.text})
        if m.done_at:
            out.append({"kind": "rep_done", "at": _aware(m.done_at), "actor": m.rep_name, "text": ""})
    # To the second, then in lifecycle order: a reply and "done" sent together are stamped microseconds apart.
    out.sort(key=lambda e: (e["at"].replace(microsecond=0), LIFECYCLE.index(e["kind"])))
    return [{**e, "at": _iso(e["at"])} for e in out]


def for_visits(session: Session, visits: list[dict]) -> dict[str, dict]:
    """Case state and history for every visit, in four queries."""
    keys = [v["visit_key"] for v in visits]
    if not keys:
        return {}
    cases = {c.visit_key: c for c in session.scalars(select(VisitCase))}
    events: dict[str, list[CaseEvent]] = {}
    for e in session.scalars(select(CaseEvent).order_by(CaseEvent.id)):
        events.setdefault(e.visit_key, []).append(e)
    messages: dict[str, list[Message]] = {}
    for m in session.scalars(select(Message).where(Message.visit_key.is_not(None)).order_by(Message.id)):
        messages.setdefault(m.visit_key, []).append(m)
    ids = [m.id for ms in messages.values() for m in ms]
    replies: dict[int, list[MessageReply]] = {}
    if ids:
        for r in session.scalars(select(MessageReply).where(MessageReply.message_id.in_(ids)).order_by(MessageReply.id)):
            replies.setdefault(r.message_id, []).append(r)
    out = {}
    for v in visits:
        k = v["visit_key"]
        c, ms = cases.get(k), messages.get(k, [])
        out[k] = {
            "status": _status(c, ms),
            "rep_state": _rep_state(ms),
            "seen_at": _iso(_aware(c.seen_at)) if c else None,
            "seen_by": c.seen_by if c else None,
            "resolved_at": _iso(_aware(c.resolved_at)) if c and c.status == "resolved" else None,
            "resolution_note": c.resolution_note if c and c.status == "resolved" else None,
            "messages": len(ms),
            "events": _events(v, c, events.get(k, []), ms, replies),
        }
    return out


def act(session: Session, visit_key: str, action: str, actor: str, note: str = "") -> None:
    """Apply one head-office step. Every step also marks the visit seen; resolving twice keeps the first time."""
    if action not in ACTIONS:
        raise ValueError(f"action must be one of {ACTIONS}")
    note = note.strip()[:2000]
    actor = actor.strip()[:100] or "Head Office"
    now = datetime.now(timezone.utc)
    c = session.get(VisitCase, visit_key)
    if c is None:
        c = VisitCase(visit_key=visit_key, status="seen", seen_at=now, seen_by=actor)
        session.add(c)
        session.add(CaseEvent(visit_key=visit_key, kind="seen", actor=actor, at=now))
    if action == "resolve" and c.status != "resolved":
        c.status, c.resolved_at, c.resolved_by, c.resolution_note = "resolved", now, actor, note
        session.add(CaseEvent(visit_key=visit_key, kind="resolved", actor=actor, text=note, at=now))
    elif action == "reopen" and c.status == "resolved":
        c.status, c.resolved_at, c.resolved_by, c.resolution_note = "seen", None, "", ""
        session.add(CaseEvent(visit_key=visit_key, kind="reopened", actor=actor, text=note, at=now))
    elif action == "note":
        if not note:
            raise ValueError("A note needs some text")
        session.add(CaseEvent(visit_key=visit_key, kind="note", actor=actor, text=note, at=now))
    session.commit()
