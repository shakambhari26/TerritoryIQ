"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatReply, TabId } from "../types";

/** The one same-origin route this component calls (src/app/api/visit-insights/chat/route.ts). */
const CHAT_URL = "/api/visit-insights/chat";

const STARTERS = [
  "Which dealers asked for credit?",
  "What did masons say about price?",
  "How many tonnes did each rep bring?",
  "Anything urgent this week?",
];

const MODE_LABEL: Record<ChatReply["mode"], { text: string; style: string }> = {
  calculated: { text: "Exact · no AI cost", style: "bg-accent-soft text-accent-ink" },
  local: { text: "From your data · no AI cost", style: "bg-accent-soft text-accent-ink" },
  cached: { text: "Saved AI answer · no new cost", style: "bg-surface-muted text-ink-muted" },
  ai: { text: "AI answer · uses API", style: "bg-amber-50 text-amber-900" },
};

type Turn = { who: "you"; text: string } | { who: "bot"; reply: ChatReply } | { who: "error"; text: string };

function exploreLink(filter: Record<string, string>, days: number | null): string {
  const q = new URLSearchParams({ role: "explore", ...filter });
  if (days) q.set("days", String(days));
  return `/visit-insights?${q}`;
}

/**
 * Chat with the visit data. Every answer says whether it cost an AI call. The window keeps the last answer's filters,
 * so a follow-up like "what about only retailers?" narrows the previous question.
 */
export function ChatBoard({ role, days }: { role: TabId; days: number | null }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const previous = useRef<ChatReply["filters"] | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, busy]);

  async function send(message: string) {
    const text = message.trim().slice(0, 300);
    if (!text || busy) return;
    setTurns((t) => [...t, { who: "you", text }]);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, role, days, previous: previous.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong.");
      previous.current = (data as ChatReply).filters;
      setTurns((t) => [...t, { who: "bot", reply: data as ChatReply }]);
    } catch (e) {
      setTurns((t) => [...t, { who: "error", text: e instanceof Error ? e.message : "Something went wrong." }]);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-navy-950 px-5 text-sm font-semibold text-on-navy shadow-lg hover:bg-navy-800"
      >
        <span aria-hidden="true">💬</span> Chat with your visits
      </button>
    );
  }

  return (
    <section
      aria-label="Chat with your visits"
      className="fixed inset-x-2 bottom-2 z-40 flex max-h-[85dvh] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[420px]"
    >
      <header className="flex items-center gap-2 bg-navy-950 px-4 py-3 text-on-navy">
        <span aria-hidden="true">💬</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Chat with your visits</p>
          <p className="text-xs text-on-navy-subtle">Answers come from your visit data. Most cost nothing.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-sm text-on-navy-muted hover:text-on-navy" aria-label="Close chat">
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {turns.length === 0 ? (
          <div>
            <p className="text-sm text-ink-muted">Ask anything about the visits, in English or in Bengali/Hindi trade words (e.g. “dam beshi bolche kara?”).</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink hover:border-ink-subtle">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {turns.map((t, i) =>
          t.who === "you" ? (
            <p key={i} className="ml-8 rounded-2xl rounded-br-sm bg-navy-950 px-3 py-2 text-sm text-on-navy">
              {t.text}
            </p>
          ) : t.who === "error" ? (
            <p key={i} role="alert" className="mr-8 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-800">
              {t.text}
            </p>
          ) : (
            <BotTurn key={i} reply={t.reply} days={days} onAsk={(q) => void send(q)} />
          ),
        )}
        {busy ? <p className="mr-8 text-sm text-ink-muted">Looking through the visits…</p> : null}
        <div ref={end} />
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
        <label htmlFor="chat-input" className="sr-only">
          Your question
        </label>
        <input
          id="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={300}
          placeholder="Ask about your visits…"
          className="h-10 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink"
        />
        <button type="submit" disabled={busy || !draft.trim()} className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-navy-950 disabled:opacity-50">
          Send
        </button>
      </form>
    </section>
  );
}

function BotTurn({ reply, days, onAsk }: { reply: ChatReply; days: number | null; onAsk: (q: string) => void }) {
  const mode = MODE_LABEL[reply.mode];
  return (
    <div className="mr-4 rounded-2xl rounded-bl-sm border border-line bg-surface-muted px-3 py-2">
      <span className={`inline-block rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${mode.style}`}>{mode.text}</span>
      <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink">{reply.answer}</p>
      {reply.note ? <p className="mt-1 text-xs text-ink-muted">{reply.note}</p> : null}
      {reply.visits.length ? (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-accent-ink">Sources: {reply.visits.length} visit{reply.visits.length > 1 ? "s" : ""}</summary>
          <ul className="mt-1 space-y-1">
            {reply.visits.map((v) => (
              <li key={v.visit_key} className="text-xs text-ink-muted">
                <span className="font-medium text-ink">{v.customer_name}</span> · {v.segment_name} · {v.urgency} · rep {v.rep_name}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {Object.keys(reply.explore_filter).length ? (
        <a href={exploreLink(reply.explore_filter, days)} className="mt-1 inline-block text-xs font-medium text-accent-ink hover:underline">
          Open in All visits →
        </a>
      ) : null}
      {reply.suggestions.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {reply.suggestions.map((s) => (
            <button key={s.id} type="button" onClick={() => onAsk(s.question)} className="rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[0.6875rem] text-ink hover:border-ink-subtle">
              {s.question}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
