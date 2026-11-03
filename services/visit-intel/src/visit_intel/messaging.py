"""Two-way messages between head office (HO) and field reps.

HO sends a suggestion or a to-do list about a visit (or a rep's recent work) through any of three channels:
  in_app    always stored; Frontier (or any app) reads it from GET /v1/inbox?rep=... and posts replies back
  whatsapp  WhatsApp Business Cloud API   (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID; WHATSAPP_TEMPLATE for messages
            outside WhatsApp's 24-hour window, with two body parameters: title and reply link)
  email     SMTP                           (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM)
A channel without settings is recorded as "not configured", never silently dropped.

Every message carries a private reply link (PUBLIC_BASE_URL + /r/<token>): the rep opens it on the phone, ticks
to-dos done and writes back. The token is an HMAC of the message id (REPLY_LINK_SECRET, or derived from the API key),
so nothing secret is stored and head office can always re-share the link; it cannot be guessed or forged for another
message. Links expire after LINK_DAYS. Without WhatsApp/email set up, head office can still share it from their own
WhatsApp or mail app (share links on every message).

HO can ask the AI to analyse the visit and draft the solution first (draft()); HO always reviews before sending.
Names and phone numbers are removed before anything goes to the AI.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import smtplib
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import anthropic
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import ask as asker
from . import config
from .db import Analysis, Contact, Message, MessageReply, Visit
from .taxonomy import FLAGS

CHANNELS = ("in_app", "whatsapp", "email")
LINK_DAYS = 60
LANGUAGES = {"en": "English", "bn": "Bengali (Bangla script)", "hi": "Hindi (Devanagari script)"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _secret() -> bytes:
    explicit = os.environ.get("REPLY_LINK_SECRET", "").strip()
    return explicit.encode() if explicit else hashlib.sha256(b"reply-link|" + config.API_KEY.encode()).digest()


def _b36(n: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while True:
        n, r = divmod(n, 36)
        out = digits[r] + out
        if not n:
            return out


def make_token(message_id: int) -> str:
    mac = hmac.new(_secret(), f"msg:{message_id}".encode(), hashlib.sha256).digest()
    return f"{_b36(message_id)}-{base64.urlsafe_b64encode(mac).decode()[:32]}"


def _mask(value: str) -> str:
    if not value:
        return ""
    if "@" in value:
        user, _, domain = value.partition("@")
        return f"{user[:2]}…@{domain}"
    return f"…{value[-4:]}"


def whatsapp_number(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    if re.fullmatch(r"[6-9]\d{9}", digits):
        return "91" + digits
    if re.fullmatch(r"91[6-9]\d{9}", digits):
        return digits
    return None


def valid_email(raw: str) -> bool:
    return bool(re.fullmatch(r"[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}", raw or ""))


# ---------- contacts ----------

def contacts(session: Session) -> list[dict]:
    reps = {name for name in session.scalars(select(Visit.rep_name).distinct()) if name}
    stored = {c.rep_name: c for c in session.scalars(select(Contact))}
    out = []
    for rep in sorted(reps | set(stored)):
        c = stored.get(rep)
        out.append({"rep_name": rep, "whatsapp": _mask(c.whatsapp) if c else "", "email": _mask(c.email) if c else "",
                    "has_whatsapp": bool(c and c.whatsapp), "has_email": bool(c and c.email)})
    return out


def save_contact(session: Session, rep_name: str, whatsapp: str | None, email: str | None) -> dict:
    c = session.get(Contact, rep_name) or Contact(rep_name=rep_name)
    if whatsapp is not None:
        if whatsapp and not whatsapp_number(whatsapp):
            raise ValueError("WhatsApp number must be a 10-digit Indian mobile number")
        c.whatsapp = whatsapp_number(whatsapp) or ""
    if email is not None:
        if email and not valid_email(email):
            raise ValueError("Email address is not valid")
        c.email = email.strip()
    session.add(c)
    session.commit()
    return {"rep_name": rep_name, "whatsapp": _mask(c.whatsapp), "email": _mask(c.email)}


# ---------- channels ----------

def channel_status() -> dict:
    return {
        "in_app": True,
        "whatsapp": bool(os.environ.get("WHATSAPP_TOKEN") and os.environ.get("WHATSAPP_PHONE_NUMBER_ID")),
        "email": bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_FROM")),
        "reply_links": bool(os.environ.get("PUBLIC_BASE_URL")),
    }


def _reply_link(token: str) -> str | None:
    base = os.environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/")
    return f"{base}/r/{token}" if base else None


def _plain_text(m: Message, link: str | None) -> str:
    lines = [m.title, "", m.body]
    if m.todos:
        lines += ["", "To do:"] + [f"{i}. {t['text']}" for i, t in enumerate(m.todos, 1)]
    if link:
        lines += ["", f"Reply or mark done: {link}"]
    lines += ["", f"— {m.sender}, Elegant Steel"]
    return "\n".join(lines)


def _send_whatsapp(to: str, m: Message, link: str | None) -> dict:
    token, phone_id = os.environ.get("WHATSAPP_TOKEN"), os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
    if not (token and phone_id):
        return {"status": "not_configured", "detail": "Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID"}
    if not to:
        return {"status": "skipped", "detail": "No WhatsApp number saved for this rep"}
    template = os.environ.get("WHATSAPP_TEMPLATE")
    if template:
        payload = {"messaging_product": "whatsapp", "to": to, "type": "template",
                   "template": {"name": template, "language": {"code": os.environ.get("WHATSAPP_TEMPLATE_LANG", "en")},
                                "components": [{"type": "body", "parameters": [
                                    {"type": "text", "text": m.title[:200]}, {"type": "text", "text": link or "-"}]}]}}
    else:
        payload = {"messaging_product": "whatsapp", "to": to, "type": "text",
                   "text": {"preview_url": bool(link), "body": _plain_text(m, link)[:4000]}}
    req = urllib.request.Request(f"https://graph.facebook.com/v21.0/{phone_id}/messages", data=json.dumps(payload).encode(),
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read() or b"{}")
        return {"status": "sent", "detail": (body.get("messages") or [{}])[0].get("id", "")}
    except urllib.error.HTTPError as e:
        return {"status": "failed", "detail": f"WhatsApp API {e.code}"}
    except (urllib.error.URLError, TimeoutError, OSError):
        return {"status": "failed", "detail": "WhatsApp API not reachable"}


def _send_email(to: str, m: Message, link: str | None) -> dict:
    host, sender = os.environ.get("SMTP_HOST"), os.environ.get("SMTP_FROM")
    if not (host and sender):
        return {"status": "not_configured", "detail": "Set SMTP_HOST and SMTP_FROM"}
    if not to:
        return {"status": "skipped", "detail": "No email saved for this rep"}
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = m.title, sender, to
    msg.set_content(_plain_text(m, link))
    try:
        with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", 587)), timeout=10) as smtp:
            smtp.starttls()
            if os.environ.get("SMTP_USER"):
                smtp.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
            smtp.send_message(msg)
        return {"status": "sent", "detail": ""}
    except (smtplib.SMTPException, OSError):
        return {"status": "failed", "detail": "Email server refused or not reachable"}


# ---------- messages ----------

def send(session: Session, *, rep_name: str, kind: str, title: str, body: str, todos: list[str], channels: list[str],
         visit_key: str | None, sender: str, ai_drafted: bool) -> dict:
    m = Message(sender=sender, rep_name=rep_name, visit_key=visit_key, kind=kind, title=title, body=body,
                todos=[{"text": t, "done": False} for t in todos], channels=channels, ai_drafted=ai_drafted, deliveries={})
    session.add(m)
    session.flush()
    token = make_token(m.id)
    link = _reply_link(token)
    contact = session.get(Contact, rep_name)
    deliveries = {}
    for ch in channels:
        if ch == "in_app":
            deliveries[ch] = {"status": "delivered", "detail": "In the rep's inbox"}
        elif ch == "whatsapp":
            deliveries[ch] = _send_whatsapp(contact.whatsapp if contact else "", m, link)
        elif ch == "email":
            deliveries[ch] = _send_email(contact.email if contact else "", m, link)
        deliveries[ch]["at"] = _now().isoformat(timespec="seconds")
    m.deliveries = deliveries
    session.commit()
    return {**message_dict(session, m), "reply_token": token}


def _share(session: Session, m: Message, link: str | None) -> dict:
    """Links that open head office's own WhatsApp or mail app with the message filled in: works with no setup."""
    text = _plain_text(m, link)
    c = session.get(Contact, m.rep_name)
    number = c.whatsapp if c and c.whatsapp else ""
    mail = f"mailto:{urllib.parse.quote(c.email) if c and c.email else ''}?" + urllib.parse.urlencode(
        {"subject": m.title, "body": text}, quote_via=urllib.parse.quote)
    return {"whatsapp": f"https://wa.me/{number}?" + urllib.parse.urlencode({"text": text}, quote_via=urllib.parse.quote),
            "email": mail}


def message_dict(session: Session, m: Message, with_replies: bool = True) -> dict:
    link = _reply_link(make_token(m.id))
    out = {"id": m.id, "created_at": m.created_at.isoformat(timespec="seconds") if m.created_at else None, "sender": m.sender,
           "rep_name": m.rep_name, "visit_key": m.visit_key, "kind": m.kind, "title": m.title, "body": m.body,
           "todos": m.todos, "channels": m.channels, "deliveries": m.deliveries, "ai_drafted": m.ai_drafted, "status": m.status,
           "read_at": m.read_at.isoformat(timespec="seconds") if m.read_at else None,
           "done_at": m.done_at.isoformat(timespec="seconds") if m.done_at else None,
           "reply_link": link, "share": _share(session, m, link)}
    if with_replies:
        out["replies"] = [{"author": r.author, "text": r.text, "at": r.created_at.isoformat(timespec="seconds")}
                          for r in session.scalars(select(MessageReply).where(MessageReply.message_id == m.id).order_by(MessageReply.id))]
    return out


def list_messages(session: Session, rep: str | None = None, status: str | None = None, limit: int = 100) -> list[dict]:
    q = select(Message).order_by(Message.id.desc()).limit(limit)
    if rep:
        q = q.where(Message.rep_name == rep)
    if status:
        q = q.where(Message.status == status)
    return [message_dict(session, m) for m in session.scalars(q)]


def by_token(session: Session, token: str) -> Message | None:
    parts = re.fullmatch(r"([0-9a-z]{1,12})-[A-Za-z0-9_-]{32}", token or "")
    if not parts:
        return None
    message_id = int(parts.group(1), 36)
    if not hmac.compare_digest(make_token(message_id), token):
        return None
    m = session.get(Message, message_id)
    if not m:
        return None
    created = m.created_at if m.created_at.tzinfo else m.created_at.replace(tzinfo=timezone.utc)
    return m if _now() - created <= timedelta(days=LINK_DAYS) else None


def mark_read(session: Session, m: Message) -> None:
    if m.status == "sent":
        m.status, m.read_at = "read", _now()
        session.commit()


def respond(session: Session, m: Message, author: str, text: str | None, done_todos: list[int] | None, done: bool) -> dict:
    """A reply from the rep (link page or in-app) or a note from HO. Ticking every to-do, or `done`, closes the message."""
    if text and text.strip():
        session.add(MessageReply(message_id=m.id, author=author, text=text.strip()[:2000]))
        if author == "rep" and m.status in ("sent", "read"):
            m.status = "replied"
    if done_todos is not None and author == "rep":
        todos = [dict(t) for t in m.todos]
        for i, t in enumerate(todos):
            t["done"] = i in done_todos
        m.todos = todos
    if author == "rep" and (done or (m.todos and all(t["done"] for t in m.todos))):
        m.status, m.done_at = "done", m.done_at or _now()
    if m.read_at is None and author == "rep":
        m.read_at = _now()
    session.commit()
    return message_dict(session, m)


# ---------- AI draft ----------

DRAFT_SCHEMA = {
    "type": "object",
    "properties": {
        "analysis": {"type": "string", "description": "What is really going on and the likely root cause, 2-4 sentences."},
        "options": {"type": "array", "items": {"type": "string"}, "description": "2-3 possible responses HO considered."},
        "recommendation": {"type": "string", "description": "Which option and why, citing the facts."},
        "title": {"type": "string", "description": "Message subject for the rep, under 80 characters."},
        "message": {"type": "string", "description": "The message to the rep, short, practical, respectful."},
        "todos": {"type": "array", "items": {"type": "string"}, "description": "1-5 concrete to-dos, each with a deadline."},
    },
    "required": ["analysis", "options", "recommendation", "title", "message", "todos"],
    "additionalProperties": False,
}

DRAFT_SYSTEM = """You are a senior sales manager at Elegant Steel, a TMT bar maker in West Bengal (dealers, retailers, masons,
engineers, individual house builders; rivals include SRMB, Shyam, Rashmi, Maithan, Captain, Tata Tiscon, JSW and local rod).
Head office will send your draft to a field sales rep, after reviewing it.

Work only from the facts given. Never invent quantities, prices, dates or names; if a fact is missing, make getting it a to-do.
First analyse the situation and the likely root cause, weigh 2-3 options, pick one, then write the message and to-dos.
To-dos must be concrete actions the rep can do and tick off, each with a deadline that fits the urgency
(P0 today, P1 within 48 hours, P2 this week, P3 when convenient). Keep the message under 120 words.
Names were replaced with placeholders such as [customer]; keep the placeholders as they are."""


def _redact(text: str, names: list[str]) -> str:
    out = re.sub(r"\+?\d[\d\s-]{8,}\d", "[phone]", text or "")
    for n in sorted({n for n in names if n and len(n) > 2}, key=len, reverse=True):
        out = re.sub(re.escape(n), "[customer]", out, flags=re.I)
        for part in n.split():
            if len(part) > 3:
                out = re.sub(rf"\b{re.escape(part)}\b", "[customer]", out, flags=re.I)
    return out


def _visit_facts(v: Visit, a: Analysis) -> dict:
    r = a.result
    names = [v.customer_name, v.contact_person]
    ext = r["extracted"]
    return {
        "date": v.visit_at.isoformat(timespec="minutes") if v.visit_at else None,
        "customer_type": v.visit_category, "group": r["segment"]["name"], "confidence": r["segment"]["confidence"],
        "urgency": f"{r['urgency']['level']} ({r['urgency']['reason']})",
        "sub_segments": [FLAGS.get(f, f) for f in r["flags"]],
        "facts": {"tonnes": (ext["quantity"] or {}).get("value_mt"), "amount_inr": (ext["amount"] or {}).get("value_inr"),
                  "competitors": [c["brand"] or "not named" for c in ext["competitors"]], "bar_sizes_mm": ext["sizes_mm"],
                  "construction_stage": ext["construction_stage"], "follow_up": (ext["follow_up"] or {}).get("evidence")},
        "playbook_action": f"{r['action']['owner']}: {r['action']['text']}",
        "note_quality": f"{r['note_quality']['score']}/10, missing: {', '.join(r['note_quality']['issues']) or 'nothing'}",
        "rep_note": _redact(v.transcript, names),
        "why_system_says_so": _redact((r.get("explanation") or {}).get("summary", ""), names),
    }


def _rep_facts(session: Session, rep: str) -> dict:
    rows = session.execute(select(Visit, Analysis).join(Analysis, Analysis.visit_key == Visit.visit_key)
                           .where(Visit.rep_name == rep).order_by(Visit.visit_at.desc()).limit(30)).all()
    if not rows:
        return {}
    segs: dict[str, int] = {}
    for _, a in rows:
        segs[a.result["segment"]["name"]] = segs.get(a.result["segment"]["name"], 0) + 1
    urgent = [_visit_facts(v, a) for v, a in rows if a.urgency in ("P0", "P1")][:5]
    return {"recent_visits": len(rows), "groups": segs,
            "avg_note_score": round(sum(a.note_score for _, a in rows) / len(rows), 1),
            "needs_review": sum(a.needs_review for _, a in rows), "urgent_visits": urgent}


def _playbook_draft(rep: str, facts: dict) -> dict:
    """No AI available: a draft built from the business playbook, so HO can still send something grounded."""
    if "group" in facts:
        action = facts["playbook_action"].split(": ", 1)[-1]
        day = datetime.fromisoformat(facts["date"]).strftime("%d %b") if facts["date"] else "recently"
        todos = [action]
        if "no next step with a date" in facts["note_quality"]:
            todos.append("Agree a follow-up date with the customer and record it in Frontier")
        if "no tonnes or rupees" in facts["note_quality"]:
            todos.append("Find out the quantity in MT (or the amount in ₹) and record it")
        if facts["facts"]["competitors"]:
            todos.append("Note the competitor brand and its price per kg")
        return {"analysis": f"The visit was grouped as {facts['group']} with urgency {facts['urgency']}.",
                "options": [], "recommendation": "Follow the standard playbook step for this group.",
                "title": f"{facts['group']}: next steps", "message": f"Please act on your visit of {day}. "
                f"{facts['playbook_action']}.", "todos": todos[:5]}
    urgent = len(facts.get("urgent_visits", []))
    return {"analysis": f"{rep} logged {facts.get('recent_visits', 0)} recent visits, average note score "
                        f"{facts.get('avg_note_score', '?')}/10, {urgent} urgent.",
            "options": [], "recommendation": "Close urgent visits first, then improve note quality.",
            "title": "This week's priorities", "message": "Please close your urgent visits first and record tonnes, brand and "
            "next date in every note.", "todos": (["Call each urgent customer and log the outcome"] if urgent else [])
            + ["Use the 5K note formula in every voice note"]}


def draft(session: Session, *, visit_key: str | None, rep_name: str | None, instruction: str, language: str, kind: str) -> dict:
    v = session.get(Visit, visit_key) if visit_key else None
    a = session.get(Analysis, visit_key) if visit_key else None
    rep = v.rep_name if v else (rep_name or "")
    if not rep:
        raise ValueError("Give a visit or a rep")
    facts = _visit_facts(v, a) if v and a else _rep_facts(session, rep)
    if not facts:
        raise ValueError("No visits found for this rep")
    base = {"rep_name": rep, "visit_key": visit_key, "kind": kind}
    if not asker.ai_available():
        return {**base, **_playbook_draft(rep, facts), "source": "playbook",
                "note": "AI drafting is not switched on (an Anthropic API key is needed); this draft comes from the playbook."}
    prompt = (f"Write a {'to-do list' if kind == 'todo' else 'suggestion'} for the rep in {LANGUAGES.get(language, 'English')}.\n"
              f"Head office instruction: {instruction.strip() or '(none: use your judgement)'}\n\n"
              f"Facts (JSON):\n{json.dumps(facts, ensure_ascii=False, default=str)}")
    try:
        client = anthropic.Anthropic()
        response = client.beta.messages.create(
            model=asker.AI_MODEL,
            max_tokens=16000,
            system=DRAFT_SYSTEM,
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": DRAFT_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.AuthenticationError:
        note = "The AI key is not valid; this draft comes from the playbook."
    except anthropic.RateLimitError:
        note = "The AI is busy; this draft comes from the playbook. Try again in a minute."
    except (anthropic.APIStatusError, anthropic.APIConnectionError):
        note = "The AI could not be reached; this draft comes from the playbook."
    else:
        if response.stop_reason == "refusal":
            note = "The AI declined; this draft comes from the playbook."
        elif response.stop_reason == "max_tokens":
            note = "The AI answer was cut off; this draft comes from the playbook."
        else:
            text = next((b.text for b in response.content if b.type == "text"), "")
            try:
                out = json.loads(text)
            except ValueError:
                note = "The AI answer could not be read; this draft comes from the playbook."
            else:
                return {**base, **out, "todos": out["todos"][:8], "source": "ai",
                        "usage": {"input_tokens": response.usage.input_tokens, "output_tokens": response.usage.output_tokens}}
    return {**base, **_playbook_draft(rep, facts), "source": "playbook", "note": note}
