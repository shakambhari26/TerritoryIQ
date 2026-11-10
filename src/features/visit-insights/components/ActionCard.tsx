import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { visitHref } from "../links";
import type { CaseAction, CaseEvent, CaseState, Contact, Draft, MessagingStatus, Urgency, VisitBrief } from "../types";
import {
  EVENT_TERMS,
  SEGMENT_TERMS,
  kidLine,
  nextStep,
  ownerTerm,
  segmentTerm,
  statusTerm,
  titleCase,
  urgencyTerm,
  type Words,
} from "../vocab";
import { SendForm } from "./Messaging";
import { Transcript } from "./Transcript";
import { formatWhen } from "./parts";
import { Icon, SEGMENT_ICON, toneOf, type IconName } from "./VisitIcons";

/** What every card needs from the page: the words, where forms come back to, and what sending can use. */
export interface CardContext {
  words: Words;
  returnTo: string;
  messaging: MessagingStatus | null;
  contacts: Contact[];
  /** The card a form just came back to, and what happened there. */
  landed: { key: string; done: string } | null;
}

const URGENCY_CHIP: Record<Urgency, string> = {
  P0: "bg-red-600 text-white",
  P1: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  P2: "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
  P3: "bg-surface-muted text-ink-muted ring-1 ring-line",
};

const STATUS_CHIP: Record<CaseState["status"], { style: string; icon: IconName }> = {
  new: { style: "bg-red-50 text-red-800 ring-1 ring-red-200", icon: "inbox" },
  seen: { style: "bg-amber-50 text-amber-900 ring-1 ring-amber-200", icon: "eye" },
  waiting: { style: "bg-sky-50 text-sky-800 ring-1 ring-sky-200", icon: "clock" },
  resolved: { style: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200", icon: "check" },
};

const EVENT_ICON: Record<CaseEvent["kind"], IconName> = {
  visit: "mic",
  seen: "eye",
  message: "send",
  rep_read: "eye",
  rep_replied: "reply",
  note: "note",
  rep_done: "check",
  resolved: "check",
  reopened: "rotate",
};

export const LANDED_TEXT: Record<string, { ok: boolean; simple: string; expert: string }> = {
  seen: { ok: true, simple: "Marked as seen. Everyone at head office can now see this was looked at.", expert: "Acknowledged." },
  sent: { ok: true, simple: "Sent to the rep. Their reply will show in the history on this card.", expert: "Task dispatched to rep." },
  resolve: { ok: true, simple: "Marked as sorted. You'll find it under “Sorted”.", expert: "Resolved. Moved to the Resolved lane." },
  reopen: { ok: true, simple: "Opened again.", expert: "Reopened." },
  note: { ok: true, simple: "Note saved to the history.", expert: "Note logged." },
  error: { ok: false, simple: "That didn't work. Please try again in a moment.", expert: "Action failed; nothing was changed." },
};

const btn = "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors";
const solid = `${btn} bg-navy-950 text-on-navy hover:bg-navy-800`;
const ghost = `${btn} border border-line-strong bg-surface text-ink hover:border-ink-subtle`;

/** When an event happened, in India time; the service sends every event with its zone. */
function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

/** One head-office step as a plain form post. Without `action`, the pressed button's name="action" says which. */
function CaseForm({ v, action, returnTo, children, className }: { v: VisitBrief; action?: CaseAction; returnTo: string; children: ReactNode; className?: string }) {
  return (
    <form method="post" action="/api/visit-insights/cases" className={className}>
      <input type="hidden" name="visit_key" value={v.visit_key} />
      {action ? <input type="hidden" name="action" value={action} /> : null}
      <input type="hidden" name="return_to" value={returnTo} />
      {children}
    </form>
  );
}

/** A playbook draft for the send form, so head office only has to check it and press Send. */
function cardDraft(v: VisitBrief, words: Words): Draft {
  const name = segmentTerm(v.segment, words, v.segment_name);
  return {
    rep_name: v.rep_name,
    visit_key: v.visit_key,
    kind: "todo",
    analysis: "",
    options: [],
    recommendation: "",
    title: `${name}: ${titleCase(v.customer_name)}`.slice(0, 200),
    message: `${v.action.text}.\n\nWhy: ${v.urgency_reason}`,
    todos: [v.action.text, "Reply here when it is done"],
    source: "playbook",
  };
}

/** Where a visit stands, as four steps a child could follow. */
function Progress({ c, words }: { c: CaseState | null; words: Words }) {
  const status = c?.status ?? "new";
  const steps = [
    { label: words === "simple" ? "Seen" : "Acknowledged", done: status !== "new" },
    { label: words === "simple" ? "Rep asked" : "Assigned", done: (c?.messages ?? 0) > 0 },
    { label: words === "simple" ? "Rep did it" : "Rep complete", done: c?.rep_state === "done" },
    { label: words === "simple" ? "Sorted" : "Resolved", done: status === "resolved" },
  ];
  return (
    <ol className="flex items-center gap-1" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.label} className="flex min-w-0 flex-1 items-center gap-1">
          <span
            className={cn(
              "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
              s.done ? "bg-emerald-600 text-white" : "bg-surface-muted text-ink-subtle ring-1 ring-line-strong",
            )}
            aria-hidden="true"
          >
            {s.done ? "✓" : i + 1}
          </span>
          <span className={cn("truncate text-xs", s.done ? "font-medium text-ink" : "text-ink-subtle")}>
            {s.label}
            <span className="sr-only">{s.done ? " (done)" : " (not yet)"}</span>
          </span>
          {i < steps.length - 1 ? <span className={cn("h-px min-w-3 flex-1", s.done ? "bg-emerald-500" : "bg-line-strong")} aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}

/** The visit's history, oldest first: the visit, head office's steps, the messages and the rep's answers. */
export function Timeline({ events, words }: { events: CaseEvent[]; words: Words }) {
  return (
    <ol className="relative ml-2 border-l border-line-strong pl-5">
      {events.map((e, i) => (
        <li key={i} className="relative pb-3 last:pb-0">
          <span className="absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full bg-surface text-ink-muted ring-1 ring-line-strong">
            <Icon name={EVENT_ICON[e.kind]} className="h-3.5 w-3.5" />
          </span>
          <p className="text-sm text-ink">
            <span className="font-medium">{EVENT_TERMS[e.kind][words]}</span>
            <span className="text-ink-subtle">
              {" "}
              · {titleCase(e.actor)} · {when(e.at)}
            </span>
          </p>
          {e.text ? <p className="mt-0.5 whitespace-pre-line text-sm text-ink-muted">“{e.text}”</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function ActionCard({ v, ctx }: { v: VisitBrief; ctx: CardContext }) {
  const { words, returnTo } = ctx;
  const simple = words === "simple";
  const c = v.case ?? null;
  const status = c?.status ?? "new";
  const tone = toneOf(v.group);
  const rep = titleCase(v.rep_name);
  const landed = ctx.landed?.key === v.visit_key ? LANDED_TEXT[ctx.landed.done] : null;
  const contact = ctx.contacts.find((x) => x.rep_name === v.rep_name) ?? null;
  const events = c?.events ?? [];

  return (
    <article
      id={`visit-${v.visit_key}`}
      className={cn(
        "scroll-mt-24 rounded-2xl border border-l-4 border-line bg-surface p-4 shadow-card sm:p-5",
        tone.edge,
        landed && "ring-2 ring-accent",
        status === "resolved" && "opacity-90",
      )}
    >
      <header className="flex flex-wrap items-start gap-3">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", tone.disc)}>
          <Icon name={SEGMENT_ICON[v.segment] ?? "note"} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-6 text-ink">{segmentTerm(v.segment, words, v.segment_name)}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", URGENCY_CHIP[v.urgency])}>{urgencyTerm(v.urgency, words)}</span>
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CHIP[status].style)}>
              <Icon name={STATUS_CHIP[status].icon} className="h-3.5 w-3.5" />
              {statusTerm(status, words)}
              {status === "seen" && c?.seen_at ? <span className="font-normal opacity-80"> · {when(c.seen_at)}</span> : null}
            </span>
            {v.rep_headline ? (
              <span
                title={simple ? "The word the rep said at the start of the note" : "Rep's spoken headline (self-label)"}
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                  v.rep_headline.segment === v.segment ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-300",
                )}
              >
                {simple ? "Rep said" : "Rep headline"}: {v.rep_headline.word.toUpperCase()}
                {v.rep_headline.segment === v.segment
                  ? simple ? " ✓ AI agrees" : " · agrees"
                  : simple ? ` · AI thinks “${segmentTerm(v.segment, words, v.segment_name)}”` : " · disagrees · review"}
              </span>
            ) : null}
            {v.needs_review ? (
              <span className="rounded-full border border-dashed border-line-strong px-2 py-0.5 text-xs text-ink-muted">
                {simple ? "AI wasn't sure" : "Low confidence · review"}
              </span>
            ) : null}
          </div>
        </div>
        <time className="text-xs text-ink-subtle" dateTime={v.visit_at ?? undefined}>
          {formatWhen(v.visit_at)}
        </time>
      </header>

      {landed ? (
        <p role={landed.ok ? "status" : "alert"} className={cn("mt-3 rounded-lg px-3 py-2 text-sm", landed.ok ? "bg-accent-soft text-accent-ink" : "bg-red-50 text-red-800")}>
          {landed[words]}
        </p>
      ) : null}

      <p className="mt-3 text-sm text-ink">
        <span className="font-semibold">{titleCase(v.customer_name)}</span>
        <span className="text-ink-muted">
          {" "}
          ({v.visit_category.toLowerCase()}) · {simple ? "visited by" : "rep"} {rep}
          {v.qty_mt !== null ? ` · ${v.qty_mt} ${simple ? "tonnes" : "MT"}` : ""}
        </span>
      </p>
      {simple && kidLine(SEGMENT_TERMS, v.segment) ? <p className="mt-0.5 text-sm text-ink-muted">{kidLine(SEGMENT_TERMS, v.segment)}</p> : null}

      <Transcript v={v} words={words} />

      <section className={cn("mt-3 rounded-xl p-3", tone.soft)} aria-label={simple ? "What to do" : "Recommended action"}>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          <Icon name="sparkles" className="h-4 w-4" />
          {simple ? "What to do" : `Playbook ${v.action.playbook_id}`}
        </p>
        <p className="mt-1 text-sm text-ink">
          <span className="font-semibold">{ownerTerm(v.action.owner, words)}:</span> {v.action.text}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {simple ? `Why: ${v.urgency_reason}` : `Why: ${v.why ?? v.urgency_reason}`}
          {!simple ? ` · confidence ${Math.round(v.confidence * 100)}% · decided by ${v.decided_by}` : ""}
        </p>
      </section>

      <div className="mt-3 grid gap-2">
        <Progress c={c} words={words} />
        <p className="flex items-start gap-1.5 text-sm text-ink">
          <Icon name="user" className="mt-0.5 h-4 w-4 text-accent-ink" />
          <span>
            <span className="font-semibold">{simple ? "Your next step: " : "Next: "}</span>
            {nextStep(c, v.rep_name, words)}
          </span>
        </p>
        {status === "resolved" && c?.resolution_note ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {simple ? "How it was sorted: " : "Resolution: "}
            {c.resolution_note}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-line pt-3">
        {status === "new" ? (
          <CaseForm v={v} action="seen" returnTo={returnTo}>
            <button type="submit" className={solid}>
              <Icon name="eye" className="h-4 w-4" />
              {simple ? "I've seen it" : "Acknowledge"}
            </button>
          </CaseForm>
        ) : null}
        {status !== "resolved" ? (
          <details className="group/send open:basis-full">
            <summary className={cn(status === "new" ? ghost : solid, "list-none marker:hidden")}>
              <Icon name="send" className="h-4 w-4" />
              {simple ? `Send ${rep.split(" ")[0]} a to-do` : "Assign task"}
            </summary>
            <div className="mt-3 rounded-xl border border-line bg-surface-muted p-3">
              <SendForm rep={v.rep_name} visitKey={v.visit_key} draft={cardDraft(v, words)} status={ctx.messaging} contact={contact} returnTo={returnTo} />
            </div>
          </details>
        ) : null}
        <details className="open:basis-full">
          <summary className={cn(ghost, "list-none marker:hidden")}>
            <Icon name={status === "resolved" ? "note" : "check"} className="h-4 w-4" />
            {status === "resolved" ? (simple ? "Add a note" : "Note") : simple ? "Mark sorted / add a note" : "Resolve / note"}
          </summary>
          <CaseForm v={v} returnTo={returnTo} className="mt-3 grid gap-2 rounded-xl border border-line bg-surface-muted p-3">
            <label className="block text-xs font-medium text-ink-muted">
              {simple ? "What happened? (optional when marking sorted)" : "Note (optional on resolve)"}
              <textarea name="note" rows={2} maxLength={2000} className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink" />
            </label>
            <div className="flex flex-wrap gap-2">
              {status !== "resolved" ? (
                <button type="submit" name="action" value="resolve" className={solid}>
                  <Icon name="check" className="h-4 w-4" />
                  {simple ? "Mark sorted" : "Resolve"}
                </button>
              ) : null}
              <button type="submit" name="action" value="note" className={ghost}>
                {simple ? "Just save the note" : "Save note"}
              </button>
            </div>
          </CaseForm>
        </details>
        {status === "resolved" ? (
          <CaseForm v={v} action="reopen" returnTo={returnTo}>
            <button type="submit" className={ghost}>
              <Icon name="rotate" className="h-4 w-4" />
              {simple ? "Open again" : "Reopen"}
            </button>
          </CaseForm>
        ) : null}
        <Link href={visitHref(v.visit_key)} className="ml-auto inline-flex h-9 items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
          {simple ? "How the AI decided" : "Full reasoning"} →
        </Link>
      </div>

      {events.length ? (
        <details className="mt-3" open={status !== "resolved" && events.length > 1}>
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-ink-muted">
            <Icon name="clock" className="h-4 w-4" />
            {simple ? "What has happened so far" : "Activity log"} ({events.length})
          </summary>
          <div className="mt-3">
            <Timeline events={events} words={words} />
          </div>
        </details>
      ) : null}
    </article>
  );
}
