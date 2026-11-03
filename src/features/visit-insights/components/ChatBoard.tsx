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

/** The answering layers, cheapest first. Most questions stop at 1-3 and never call the AI. */
const LAYERS = ["Exact calculation", "Search your visits", "Saved answers", "AI, only if needed"];

const MODE_LABEL: Record<ChatReply["mode"], { text: string; style: string }> = {
  calculated: { text: "Exact · no AI cost", style: "bg-accent-soft text-accent-ink" },
  local: { text: "From your data · no AI cost", style: "bg-accent-soft text-accent-ink" },
  cached: { text: "Saved AI answer · no new cost", style: "bg-surface-muted text-ink-muted" },
  ai: { text: "AI answer · uses API", style: "bg-amber-50 text-amber-900" },
};

const LAYER_OF: Record<ChatReply["mode"], string> = { calculated: "Layer 1", local: "Layer 2", cached: "Layer 3", ai: "Layer 4" };

type Turn = { who: "you"; text: string } | { who: "bot"; reply: ChatReply } | { who: "error"; text: string };

function exploreLink(filter: Record<string, string>, days: number | null): string {
  const q = new URLSearchParams({ role: "explore", ...filter });
  if (days) q.set("days", String(days));
  return `/visit-insights?${q}`;
}

/**
 * Chat with the visit data, at the top of the page. A layered retrieval (rag.py in the service) answers by exact
 * calculation, then by searching the visits, then from saved answers, and calls the AI only when those cannot. Every
 * answer says which layer answered. The chat keeps the last answer's filters, so "what about only retailers?" narrows it.
 */
export function ChatBoard({ role, days, starters = STARTERS }: { role: TabId; days: number | null; starters?: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const previous = useRef<ChatReply["filters"] | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.parentElement?.scrollTo({ top: end.current.offsetTop });
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

  return (
    <section aria-labelledby="chat-title" className="overflow-hidden rounded-2xl border border-navy-800 bg-navy-950 text-on-navy shadow-card">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="chat-title" className="flex items-center gap-2 text-lg font-semibold">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 4.5 11.6 9l4.4 1.6-4.4 1.6L10 16.5l-1.6-4.3L4 10.6 8.4 9 10 4.5Z" />
              <path d="M17.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
            </svg>
            Ask anything about your visits
          </h2>
          <ol className="flex flex-wrap items-center gap-1 text-[0.6875rem] text-on-navy-subtle" aria-label="How it answers">
            {LAYERS.map((l, i) => (
              <li key={l} className="flex items-center gap-1">
                <span className="rounded-full border border-white/15 px-2 py-0.5">
                  {i + 1}. {l}
                </span>
                {i < LAYERS.length - 1 ? <span aria-hidden="true">→</span> : null}
              </li>
            ))}
          </ol>
        </div>
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Your question
          </label>
          <input
            id="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={300}
            placeholder="e.g. Which dealers asked for credit? · dam beshi bolche kara?"
            className="h-11 min-w-0 flex-1 rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-on-navy placeholder:text-on-navy-subtle focus:border-accent"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-navy-950 hover:brightness-105 disabled:opacity-50">
            Ask
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {starters.map((q) => (
            <button key={q} type="button" onClick={() => void send(q)} className="rounded-full border border-white/15 px-3 py-1 text-xs text-on-navy-muted hover:border-white/40 hover:text-on-navy">
              {q}
            </button>
          ))}
        </div>
      </div>

      {turns.length || busy ? (
        <div className="max-h-[32rem] space-y-3 overflow-y-auto border-t border-white/10 bg-surface p-4 text-ink" aria-live="polite">
          {turns.map((t, i) =>
            t.who === "you" ? (
              <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-navy-950 px-3 py-2 text-sm text-on-navy">
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
      ) : null}
    </section>
  );
}

function BotTurn({ reply, days, onAsk }: { reply: ChatReply; days: number | null; onAsk: (q: string) => void }) {
  const mode = MODE_LABEL[reply.mode];
  return (
    <div className="mr-4 max-w-3xl rounded-2xl rounded-bl-sm border border-line bg-surface-muted px-3 py-2">
      <span className={`inline-block rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${mode.style}`}>
        {LAYER_OF[reply.mode]} · {mode.text}
      </span>
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
