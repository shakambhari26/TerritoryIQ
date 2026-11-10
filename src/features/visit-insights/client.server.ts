/**
 * Server-side client for the Visit Intelligence API. Server only: the API key never reaches the browser, and the
 * browser never talks to the ML service directly.
 *
 *   VISIT_INTEL_URL       base URL, e.g. http://127.0.0.1:8100 locally, or the Railway private-network address
 *   VISIT_INTEL_API_KEY   the same key the service was started with
 *
 * With no VISIT_INTEL_URL / VISIT_INTEL_API_KEY but SUPABASE_URL + SUPABASE_SECRET_KEY set, the read-only views (role
 * insights, all visits, one visit, how it scores, the keyword database and its add / switch-off) are read from Supabase
 * instead (supabase.server.ts). Everything that needs the service itself (Ask, chat, messages) stays unavailable.
 *
 * Errors come back as a fixed kind and sentence; nothing from the upstream response is echoed to the page.
 */

import type { ChatSubmission } from "./chat-form.ts";
import * as local from "./supabase.server.ts";
import type { CaseSubmission, ContactSubmission, KeywordSubmission, MessageSubmission, ReplySubmission } from "./forms.ts";
import type {
  CaseState,
  ChatReply,
  ChatStats,
  Contact,
  Draft,
  ExploreData,
  Filters,
  KeywordList,
  KeywordScore,
  MessagingStatus,
  Methodology,
  RoleId,
  SentMessage,
  Taxonomy,
  VisitDetail,
} from "./types.ts";

export type Fetched<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "not-configured" | "unreachable" | "upstream"; message: string };

const TIMEOUT_MS = 10_000;
// A chat question may take several AI tool calls; most answer locally in milliseconds.
const ASK_TIMEOUT_MS = 60_000;

function config(): { url: string; key: string } | null {
  const url = process.env.VISIT_INTEL_URL?.trim().replace(/\/+$/, "");
  const key = process.env.VISIT_INTEL_API_KEY?.trim();
  return url && key ? { url, key } : null;
}

/** True when the service is not configured but Supabase is: the stored visits and analyses are used. */
const viaSupabase = () => !config() && local.supabaseConfigured();

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Fetched<T>> {
  const cfg = config();
  if (!cfg) {
    return { ok: false, kind: "not-configured", message: "Visit Intelligence is not connected. Set VISIT_INTEL_URL and VISIT_INTEL_API_KEY (or SUPABASE_URL and SUPABASE_SECRET_KEY to read the stored visits)." };
  }
  let response: Response;
  try {
    response = await fetch(`${cfg.url}${path}`, {
      ...init,
      headers: { ...init.headers, "X-API-Key": cfg.key },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, kind: "unreachable", message: "The Visit Intelligence service did not respond." };
  }
  if (!response.ok) {
    return { ok: false, kind: "upstream", message: `The Visit Intelligence service returned an error (${response.status}).` };
  }
  return { ok: true, data: (await response.json()) as T };
}

export function getInsights<T>(role: RoleId, days: number | null): Promise<Fetched<T>> {
  if (viaSupabase()) return local.getInsights<T>(role, days);
  return call<T>(`/v1/insights/${role}${days ? `?days=${days}` : ""}`);
}

export function getTaxonomy(): Promise<Fetched<Taxonomy>> {
  if (viaSupabase()) return local.getTaxonomy();
  return call<Taxonomy>("/v1/taxonomy");
}

export function postLabel(label: { visit_key: string; segment: string; urgency: string | null }): Promise<Fetched<unknown>> {
  return call("/v1/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...label, labeller: "territoryiq-supervisor" }),
  });
}

export function getExplore(filters: Filters, days: number | null): Promise<Fetched<ExploreData>> {
  if (viaSupabase()) return local.getExplore(filters, days);
  const q = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => Boolean(e[1])));
  if (days) q.set("days", String(days));
  return call<ExploreData>(`/v1/explore${q.size ? `?${q}` : ""}`);
}

export function postChat(body: ChatSubmission): Promise<Fetched<ChatReply>> {
  return call<ChatReply>("/v1/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, ASK_TIMEOUT_MS);
}

export function getChatStats(): Promise<Fetched<ChatStats>> {
  return call<ChatStats>("/v1/chat/stats");
}

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function getVisit(key: string): Promise<Fetched<VisitDetail>> {
  if (viaSupabase()) return local.getVisit(key);
  return call<VisitDetail>(`/v1/visits/${encodeURIComponent(key)}`);
}

export async function getMethodology(): Promise<Fetched<Methodology>> {
  if (viaSupabase()) return local.getMethodology();
  return call<Methodology>("/v1/methodology");
}

// ---------- keyword database ----------

export function getKeywords(filter: { target?: string; language?: string; q?: string }): Promise<Fetched<KeywordList>> {
  if (viaSupabase()) return local.getKeywords(filter);
  const q = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])));
  return call<KeywordList>(`/v1/keywords${q.size ? `?${q}` : ""}`);
}

export function postKeyword(k: KeywordSubmission): Promise<Fetched<unknown>> {
  if (viaSupabase()) return local.postKeyword(k, "territoryiq");
  return call("/v1/keywords", json({ ...k, added_by: "territoryiq" }));
}

export function setKeywordActive(id: number, active: boolean): Promise<Fetched<unknown>> {
  if (viaSupabase()) return local.setKeywordActive(id, active);
  return call(`/v1/keywords/${id}`, json({ active }, "PATCH"));
}

export function testKeywords(text: string): Promise<Fetched<KeywordScore>> {
  return call<KeywordScore>("/v1/keywords/test", json({ text }));
}

// ---------- two-way messages ----------

export function getMessagingStatus(): Promise<Fetched<MessagingStatus>> {
  return call<MessagingStatus>("/v1/messaging/status");
}

export function getContacts(): Promise<Fetched<Contact[]>> {
  return call<Contact[]>("/v1/contacts");
}

export function putContact(c: ContactSubmission): Promise<Fetched<unknown>> {
  return call("/v1/contacts", json(c, "PUT"));
}

export function postDraft(body: { visit_key: string | null; rep_name: string | null; instruction: string; language: string; kind: string }): Promise<Fetched<Draft>> {
  // The AI analyses the case before writing, so allow it the same time as a free-text question.
  return call<Draft>("/v1/messages/draft", json(body), ASK_TIMEOUT_MS);
}

export function postMessage(m: MessageSubmission): Promise<Fetched<SentMessage>> {
  return call<SentMessage>("/v1/messages", json({ ...m, sender: "Head Office" }), 30_000);
}

export function getMessages(rep: string | null): Promise<Fetched<SentMessage[]>> {
  return call<SentMessage[]>(`/v1/messages${rep ? `?rep=${encodeURIComponent(rep)}` : ""}`);
}

export function postNote(id: number, text: string): Promise<Fetched<unknown>> {
  return call(`/v1/messages/${id}/note`, json({ text }));
}

// ---------- head-office follow-through ----------

/** Mark a visit seen, resolve or reopen it, or add a note. Who did it is "Head Office": the app has one shared login. */
export function postCase(c: CaseSubmission): Promise<Fetched<CaseState>> {
  return call<CaseState>(`/v1/cases/${encodeURIComponent(c.visit_key)}`, json({ action: c.action, note: c.note, actor: "Head Office" }));
}

/** The rep's reply link. The token is only ever passed through; it is checked (as a hash) by the service. */
export function getByToken(token: string): Promise<Fetched<SentMessage>> {
  return call<SentMessage>(`/v1/inbox/t/${encodeURIComponent(token)}`);
}

export function respondByToken(token: string, r: Omit<ReplySubmission, "token">): Promise<Fetched<unknown>> {
  return call(`/v1/inbox/t/${encodeURIComponent(token)}`, json(r));
}
