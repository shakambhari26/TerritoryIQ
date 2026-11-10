/**
 * Validation for the head-office forms on /visit-insights (send a message, save a rep's contact, add or switch off a
 * keyword, add a note) and for the rep's public reply page (/r/[token]). Pure functions, no imports, so the unit tests
 * can drive them. Every field is checked against a fixed pattern or length; anything else is refused, never echoed.
 */

export const MAX_FORM_BYTES = 16_384;

const VISIT_KEY = /^[A-Za-z0-9_-]{1,64}$/;
const REP_NAME = /^[\p{L}\p{M} .'-]{1,200}$/u;
const CODE = /^[A-Z_]{3,40}$/;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const CHANNELS = new Set(["in_app", "whatsapp", "email"]);
const LANGUAGE = /^(en|bn|bn-Beng|hi|hi-Deva|mixed|brand)$/;
const STATUS = /^(verified|draft|ambiguous)$/;

function read(body: string): URLSearchParams | null {
  return body.length > MAX_FORM_BYTES ? null : new URLSearchParams(body);
}

const text = (v: string | null, max: number) => (v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

export interface MessageSubmission {
  rep_name: string;
  kind: "suggestion" | "todo";
  title: string;
  body: string;
  todos: string[];
  channels: string[];
  visit_key: string | null;
  ai_drafted: boolean;
}

export function parseMessageForm(body: string): MessageSubmission | null {
  const f = read(body);
  if (!f) return null;
  const rep = text(f.get("rep_name"), 200);
  const title = text(f.get("title"), 200);
  const visitKey = f.get("visit_key") ?? "";
  const kind = f.get("kind") === "suggestion" ? "suggestion" : "todo";
  const channels = [...new Set(f.getAll("channels"))].filter((c) => CHANNELS.has(c));
  if (!REP_NAME.test(rep) || title.length < 2 || !channels.length) return null;
  if (visitKey && !VISIT_KEY.test(visitKey)) return null;
  const todos = text(f.get("todos"), 6000)
    .split("\n")
    .map((t) => t.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 20);
  return { rep_name: rep, kind, title, body: text(f.get("body"), 4000), todos, channels, visit_key: visitKey || null, ai_drafted: f.get("ai_drafted") === "1" };
}

/** An empty field means "keep what is saved" (null), so saving only an email never wipes the WhatsApp number. */
export interface ContactSubmission {
  rep_name: string;
  whatsapp: string | null;
  email: string | null;
}

export function parseContactForm(body: string): ContactSubmission | null {
  const f = read(body);
  if (!f) return null;
  const rep = text(f.get("rep_name"), 200);
  const whatsapp = text(f.get("whatsapp"), 20).replace(/[^\d+ ]/g, "");
  const email = text(f.get("email"), 200);
  if (!REP_NAME.test(rep)) return null;
  if (email && !/^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}$/.test(email)) return null;
  if (!whatsapp && !email) return null;
  return { rep_name: rep, whatsapp: whatsapp || null, email: email || null };
}

export interface KeywordSubmission {
  term: string;
  language: string;
  target: string;
  weight: number;
  status: "verified" | "draft" | "ambiguous";
  meaning: string;
}

export type KeywordAction = { action: "add"; keyword: KeywordSubmission } | { action: "toggle"; id: number; active: boolean };

export function parseKeywordForm(body: string): KeywordAction | null {
  const f = read(body);
  if (!f) return null;
  if (f.get("action") === "toggle") {
    const id = Number(f.get("id"));
    if (!Number.isInteger(id) || id < 1) return null;
    return { action: "toggle", id, active: f.get("active") === "1" };
  }
  const term = text(f.get("term"), 120).replace(/\s+/g, " ");
  const language = f.get("language") ?? "";
  const target = f.get("target") ?? "";
  const weight = Number(f.get("weight"));
  const status = f.get("status") ?? "draft";
  if (term.length < 2 || !LANGUAGE.test(language) || !CODE.test(target) || !STATUS.test(status)) return null;
  if (!Number.isFinite(weight) || weight <= 0 || weight > 5) return null;
  return {
    action: "add",
    keyword: { term, language, target, weight, status: status as KeywordSubmission["status"], meaning: text(f.get("meaning"), 200) },
  };
}

export interface ReplySubmission {
  token: string;
  text: string | null;
  done_todos: number[];
  done: boolean;
}

export function parseReplyForm(body: string): ReplySubmission | null {
  const f = read(body);
  if (!f) return null;
  const token = f.get("token") ?? "";
  if (!TOKEN.test(token)) return null;
  const done = f
    .getAll("todo")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < 20);
  return { token, text: text(f.get("text"), 2000) || null, done_todos: [...new Set(done)], done: f.get("done") === "1" };
}

export function parseNoteForm(body: string): { id: number; text: string } | null {
  const f = read(body);
  if (!f) return null;
  const id = Number(f.get("id"));
  const note = text(f.get("text"), 2000);
  return Number.isInteger(id) && id > 0 && note ? { id, text: note } : null;
}

/** Valid reply-link token, for the public page's path segment. */
export const isToken = (t: string) => TOKEN.test(t);

/**
 * Where to go after a card's form: a path on the Visit Insights pages and its query, nothing else (no other host, no
 * `//`, no backslash, no fragment). Anything else is refused and the caller falls back to its fixed page.
 */
export function safeReturn(value: string | null | undefined): string | null {
  if (!value || value.length > 1500) return null;
  return /^\/visit-insights(?:\/[a-z-]+)?(?:\?[^#\s\\]*)?$/.test(value) ? value : null;
}

export const returnToOf = (body: string) => safeReturn(read(body)?.get("return_to"));

export interface CaseSubmission {
  visit_key: string;
  action: "seen" | "resolve" | "reopen" | "note";
  note: string;
  return_to: string | null;
}

/** Head office marks a visit seen, resolves or reopens it, or adds a note. A note needs text; the others do not. */
export function parseCaseForm(body: string): CaseSubmission | null {
  const f = read(body);
  if (!f) return null;
  const key = f.get("visit_key") ?? "";
  const action = f.get("action") ?? "";
  const note = text(f.get("note"), 2000);
  if (!VISIT_KEY.test(key) || !["seen", "resolve", "reopen", "note"].includes(action)) return null;
  if (action === "note" && !note) return null;
  return { visit_key: key, action: action as CaseSubmission["action"], note, return_to: safeReturn(f.get("return_to")) };
}
