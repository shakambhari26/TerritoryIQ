"""Storage: visits as received (never edited), the latest analysis of each, and human labels."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from . import config


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Visit(Base):
    __tablename__ = "visits"
    visit_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    rep_name: Mapped[str] = mapped_column(String(200), index=True)
    visit_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    customer_name: Mapped[str] = mapped_column(String(300))
    contact_person: Mapped[str] = mapped_column(String(300))
    contact_number: Mapped[str] = mapped_column(String(32), index=True)
    visit_category: Mapped[str] = mapped_column(String(40))
    transcript: Mapped[str] = mapped_column(Text)
    raw: Mapped[dict] = mapped_column(JSON)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Analysis(Base):
    __tablename__ = "analyses"
    visit_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    segment: Mapped[str] = mapped_column(String(40), index=True)
    urgency: Mapped[str] = mapped_column(String(4), index=True)
    confidence: Mapped[float] = mapped_column(Float)
    decided_by: Mapped[str] = mapped_column(String(20))
    needs_review: Mapped[bool] = mapped_column(Boolean, index=True)
    note_score: Mapped[int] = mapped_column(Integer)
    model_version: Mapped[str] = mapped_column(String(40))
    result: Mapped[dict] = mapped_column(JSON)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Label(Base):
    __tablename__ = "labels"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    visit_key: Mapped[str] = mapped_column(String(64), index=True)
    segment: Mapped[str] = mapped_column(String(40))
    urgency: Mapped[str | None] = mapped_column(String(4))
    labeller: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ChatLog(Base):
    """One row per chat question: how it was answered and what the AI cost, for the API-usage report."""
    __tablename__ = "chat_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    role: Mapped[str] = mapped_column(String(30))
    question: Mapped[str] = mapped_column(String(300))
    mode: Mapped[str] = mapped_column(String(20), index=True)
    intent: Mapped[str] = mapped_column(String(30))
    latency_ms: Mapped[int] = mapped_column(Integer)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)


class Keyword(Base):
    """One keyword (any language or script) and the segment or sub-segment flag it is evidence for.

    Seeded from lexicon/keywords.csv; after that this table is the source of truth (edit through /v1/keywords).
    `weight` is log-odds evidence: 3 decisive, 2 strong, 1 supporting, 0.5 a weak hint. A term ending in * matches any
    word that starts with it. Ambiguous terms count at half weight.
    """
    __tablename__ = "keywords"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    term: Mapped[str] = mapped_column(String(120), index=True)
    language: Mapped[str] = mapped_column(String(12))
    target: Mapped[str] = mapped_column(String(40), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # segment | flag
    weight: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(12), default="draft")  # verified | draft | ambiguous
    meaning: Mapped[str] = mapped_column(String(200), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    added_by: Mapped[str] = mapped_column(String(100), default="seed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Contact(Base):
    """How to reach a field rep: WhatsApp number and email. In-app messages need no contact details."""
    __tablename__ = "contacts"
    rep_name: Mapped[str] = mapped_column(String(200), primary_key=True)
    whatsapp: Mapped[str] = mapped_column(String(20), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Message(Base):
    """A suggestion or to-do list from head office to one rep, with per-channel delivery results.

    Its reply link's token is derived from the id (messaging.make_token), so no token is stored."""
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    sender: Mapped[str] = mapped_column(String(100))
    rep_name: Mapped[str] = mapped_column(String(200), index=True)
    visit_key: Mapped[str | None] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(12))  # suggestion | todo
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    todos: Mapped[list] = mapped_column(JSON, default=list)  # [{"text": str, "done": bool}]
    channels: Mapped[list] = mapped_column(JSON, default=list)
    deliveries: Mapped[dict] = mapped_column(JSON, default=dict)  # channel -> {"status", "detail", "at"}
    ai_drafted: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(12), default="sent", index=True)  # sent | read | replied | done
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MessageReply(Base):
    __tablename__ = "message_replies"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message_id: Mapped[int] = mapped_column(Integer, index=True)
    author: Mapped[str] = mapped_column(String(10))  # rep | ho
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


engine = create_engine(config.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)
    if engine.dialect.name == "postgresql":
        # Supabase publishes the public schema through its Data API. Row-level security with no policies closes that
        # door (the anon key reads nothing); this service connects as the table owner, which bypasses it.
        with engine.begin() as conn:
            for table in Base.metadata.sorted_tables:
                conn.exec_driver_sql(f'ALTER TABLE "{table.name}" ENABLE ROW LEVEL SECURITY')
    from .keywords import sync_from_csv
    with SessionLocal() as s:
        sync_from_csv(s)


def latest_label(session: Session, visit_key: str) -> dict | None:
    row = session.scalars(select(Label).where(Label.visit_key == visit_key).order_by(Label.id.desc()).limit(1)).first()
    return {"segment": row.segment, "urgency": row.urgency, "labeller": row.labeller} if row else None


def visit_dict(v: Visit) -> dict:
    return {"visit_key": v.visit_key, "rep_name": v.rep_name, "visit_at": v.visit_at, "customer_name": v.customer_name,
            "contact_person": v.contact_person, "contact_number": v.contact_number,
            "visit_category": v.visit_category, "transcript": v.transcript}
