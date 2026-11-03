import Link from "next/link";
import { Suspense } from "react";
import { postAsk } from "../client.server";
import { askHref, exploreHref } from "../links";
import type { Filters, SuggestedQuestion, TabId } from "../types";
import { DataTable, VisitList } from "./parts";

export const MAX_QUESTION_LENGTH = 300;

interface AskPanelProps {
  tab: TabId;
  days: number | null;
  question: string | null;
  suggestions: SuggestedQuestion[];
  aiEnabled: boolean;
  filters?: Filters;
}

/**
 * "Ask AI": a plain GET form, so a question and its answer are a shareable link and work without scripts. Suggested
 * questions are answered by exact calculation in the service; other questions go to Claude, limited to the data.
 */
export function AskPanel({ tab, days, question, suggestions, aiEnabled, filters = {} }: AskPanelProps) {
  return (
    <section id="ask" className="rounded-2xl border border-navy-800 bg-navy-950 p-5 text-on-navy shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">
          <span aria-hidden="true">✨ </span>Ask AI about these visits
        </h2>
        <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-on-navy-muted">
          {aiEnabled ? "Any question · answers use only your data" : "Suggested questions · exact answers"}
        </span>
      </div>
      <form method="get" action="/visit-insights" className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="role" value={tab} />
        {days ? <input type="hidden" name="days" value={days} /> : null}
        {tab === "explore"
          ? Object.entries(filters).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))
          : null}
        <label htmlFor="ask-input" className="sr-only">
          Your question
        </label>
        <input
          id="ask-input"
          name="ask"
          defaultValue={question ?? ""}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder="e.g. Which dealers asked for credit this week?"
          className="h-10 min-w-0 flex-1 rounded-md border border-white/20 bg-white/5 px-3 text-sm text-on-navy placeholder:text-on-navy-subtle focus:border-accent"
        />
        <button type="submit" className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-navy-950 hover:brightness-105">
          Ask
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-xs text-on-navy-subtle">Try:</span>
        {suggestions.map((s) => (
          <Link
            key={s.id}
            href={askHref(tab, days, s.question, filters)}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-on-navy-muted hover:border-white/40 hover:text-on-navy"
          >
            {s.question}
          </Link>
        ))}
      </div>
      {question ? (
        <Suspense fallback={<p className="mt-4 text-sm text-on-navy-muted">Working out the answer…</p>}>
          <Answer tab={tab} days={days} question={question} filters={filters} />
        </Suspense>
      ) : null}
    </section>
  );
}

const SOURCE_LABEL = {
  calculated: "Calculated exactly from your data",
  ai: "AI answer · based only on your data",
  unavailable: "",
} as const;

async function Answer({ tab, days, question, filters }: { tab: TabId; days: number | null; question: string; filters: Filters }) {
  const res = await postAsk(question.slice(0, MAX_QUESTION_LENGTH), tab, days);
  if (!res.ok) {
    return <p role="alert" className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-on-navy-muted">{res.message}</p>;
  }
  const a = res.data;
  return (
    <div className="mt-4 rounded-xl bg-surface p-4 text-ink" aria-live="polite">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
        {a.matched_question ? `Answering: ${a.matched_question}` : `You asked: ${a.question}`}
        {SOURCE_LABEL[a.source] ? ` · ${SOURCE_LABEL[a.source]}` : ""}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm leading-6">{a.answer}</p>
      {a.table && a.table.rows.length ? (
        <div className="mt-3">
          <DataTable head={a.table.head} rows={a.table.rows} />
        </div>
      ) : null}
      {a.visits.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-accent-ink">Show the {a.visits.length} visits behind this answer</summary>
          <div className="mt-3">
            <VisitList visits={a.visits} empty="" />
          </div>
        </details>
      ) : null}
      {a.filter ? (
        <Link href={exploreHref(a.filter, days)} className="mt-3 inline-block text-sm font-medium text-accent-ink hover:underline">
          Open these in All visits →
        </Link>
      ) : null}
      {a.suggestions.length ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs font-medium text-ink-muted">You could also ask:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {a.suggestions.map((s) => (
              <Link key={s.id} href={askHref(tab, days, s.question, filters)} className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink hover:border-ink-subtle">
                {s.question}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
