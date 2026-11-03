import Link from "next/link";
import { cn } from "@/lib/cn";
import { tabHref, viewHref, type View } from "../links";
import type { ExploreData, Filters, Urgency } from "../types";
import { groupTerm, segmentTerm, titleCase, urgencyTerm, type Words } from "../vocab";
import { ActionCard, type CardContext } from "./ActionCard";
import { Icon } from "./VisitIcons";

const STAKEHOLDER: Record<string, string> = { DEALER: "Dealer / retailer", INFLUENCER: "Mason / engineer", IHB: "House owner (IHB)", OTHER: "Other" };

/** The status lanes. "open" (everything not sorted) is the default; "all" switches the status filter off. */
const LANES = ["open", "new", "seen", "waiting", "resolved", "all"] as const;
type Lane = (typeof LANES)[number];

export const laneOf = (status: string | undefined, fallback: Lane = "open"): Lane =>
  (LANES as readonly string[]).includes(status ?? "") ? (status as Lane) : fallback;

const LANE_LABEL: Record<Lane, Record<Words, string>> = {
  open: { simple: "To do", expert: "Open" },
  new: { simple: "Not seen yet", expert: "New" },
  seen: { simple: "Seen", expert: "Acknowledged" },
  waiting: { simple: "Waiting for rep", expert: "Assigned" },
  resolved: { simple: "Sorted", expert: "Resolved" },
  all: { simple: "Everything", expert: "All" },
};

const field = "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink";

/**
 * "What needs you": every visit as an action card, in lanes by head office's follow-through, with urgency chips, a
 * search and filter bar, and the active filters as removable chips. Everything is in the URL, so any list is a link.
 */
export function Inbox({ d, view, lane, ctx }: { d: ExploreData; view: View; lane: Lane; ctx: CardContext }) {
  const { words } = ctx;
  const simple = words === "simple";
  const f = view.filters;
  const count = (key: keyof ExploreData["facets"], value: string) => d.facets[key]?.find((x) => x.value === value)?.count ?? 0;
  const laneCount = (l: Lane) =>
    l === "all"
      ? (d.facets.status ?? []).reduce((s, x) => s + x.count, 0)
      : l === "open"
        ? (d.facets.status ?? []).filter((x) => x.value !== "resolved").reduce((s, x) => s + x.count, 0)
        : count("status", l);
  const urgent = count("urgency", "P0") + count("urgency", "P1");
  const segName = Object.fromEntries(d.segments.map((s) => [s.code, segmentTerm(s.code, words, s.name)]));
  const chips: { key: keyof Filters; label: string }[] = (
    [
      ["group", f.group && groupTerm(f.group, words)],
      ["segment", f.segment && segName[f.segment]],
      ["urgency", f.urgency && (f.urgency === "urgent" ? (simple ? "Urgent" : "P0 + P1") : urgencyTerm(f.urgency as Urgency, words))],
      ["rep", f.rep && titleCase(f.rep)],
      ["category", f.category && titleCase(f.category)],
      ["stakeholder", f.stakeholder && (STAKEHOLDER[f.stakeholder] ?? f.stakeholder)],
      ["flag", f.flag && (d.flag_names[f.flag] ?? f.flag)],
      ["review", f.review === "1" && (simple ? "AI wasn't sure" : "Needs review")],
      ["q", f.q && `“${f.q}”`],
    ] as [keyof Filters, string | false | undefined][]
  )
    .filter((c): c is [keyof Filters, string] => Boolean(c[1]))
    .map(([key, label]) => ({ key, label }));
  const urgencyChips: { value: string; label: string; n: number }[] = [
    { value: "", label: simple ? "Any" : "All", n: d.facets.urgency.reduce((s, x) => s + x.count, 0) },
    { value: "urgent", label: simple ? "Urgent" : "P0 + P1", n: urgent },
    ...(["P0", "P1", "P2", "P3"] as Urgency[]).map((u) => ({ value: u, label: urgencyTerm(u, words).split(" ·").slice(0, 2).join(" ·"), n: count("urgency", u) })),
  ];

  return (
    <section id="inbox" aria-labelledby="inbox-title" className="scroll-mt-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="inbox-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Icon name="inbox" className="h-5 w-5 text-accent-ink" />
            {simple ? "What needs you" : "Action queue"}
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {simple
              ? "Each card is one visit: what happened, what to do, and whether it got done. Act right on the card."
              : "Visits by follow-through status. Acknowledge, assign, resolve inline; history is logged."}
          </p>
        </div>
        <p className="text-sm text-ink-muted">
          {d.total} {simple ? "shown" : "results"}
        </p>
      </div>

      <nav aria-label={simple ? "Where things stand" : "Status lanes"} className="mt-4 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {LANES.map((l) => (
          <Link
            key={l}
            href={viewHref(view, { status: l }) + "#inbox"}
            aria-current={l === lane ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium",
              l === lane ? "bg-navy-950 text-on-navy" : "bg-surface-muted text-ink hover:bg-line",
            )}
          >
            {LANE_LABEL[l][words]}
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", l === lane ? "bg-white/15" : "bg-surface text-ink-muted")}>{laneCount(l)}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-ink-subtle">{simple ? "How urgent" : "Urgency"}</span>
        {urgencyChips.map((u) => {
          const on = (f.urgency ?? "") === u.value;
          return (
            <Link
              key={u.value || "any"}
              href={viewHref(view, { urgency: u.value }) + "#inbox"}
              aria-current={on ? "true" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                on ? "border-navy-950 bg-navy-950 text-on-navy" : "border-line-strong text-ink hover:border-ink-subtle",
              )}
            >
              {u.label}
              <span className="tabular-nums opacity-70">{u.n}</span>
            </Link>
          );
        })}
      </div>

      <form method="get" action="/visit-insights#inbox" className="mt-3 grid gap-2 rounded-xl bg-surface-muted p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <input type="hidden" name="role" value={view.tab} />
        {view.days ? <input type="hidden" name="days" value={view.days} /> : null}
        {(["status", "urgency", "group"] as const).map((k) => (f[k] ? <input key={k} type="hidden" name={k} value={f[k]} /> : null))}
        <label className="relative block">
          <span className="sr-only">Search</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-ink-subtle" />
          <input name="q" defaultValue={f.q ?? ""} maxLength={100} placeholder={simple ? "Search a customer, rep or word" : "Search customer / rep / transcript"} className={cn(field, "pl-10")} />
        </label>
        <label className="block">
          <span className="sr-only">Rep</span>
          <select name="rep" defaultValue={f.rep ?? ""} className={field}>
            <option value="">{simple ? "Every rep" : "All reps"}</option>
            {d.facets.rep.map((x) => (
              <option key={x.value} value={x.value}>
                {titleCase(x.value)} ({x.count})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Customer type</span>
          <select name="category" defaultValue={f.category ?? ""} className={field}>
            <option value="">{simple ? "Every kind of customer" : "All customer types"}</option>
            {(d.facets.category ?? []).map((x) => (
              <option key={x.value} value={x.value}>
                {titleCase(x.value)} ({x.count})
              </option>
            ))}
          </select>
        </label>
        {!simple ? (
          <div className="grid gap-2 sm:col-span-3 sm:grid-cols-4 sm:row-start-2">
            <select name="segment" defaultValue={f.segment ?? ""} className={field} aria-label="Segment">
              <option value="">All segments</option>
              {d.segments.map((s) => (
                <option key={s.code} value={s.code}>
                  {segName[s.code]} ({count("segment", s.code)})
                </option>
              ))}
            </select>
            <select name="flag" defaultValue={f.flag ?? ""} className={field} aria-label="Flag">
              <option value="">All flags</option>
              {d.facets.flag.map((x) => (
                <option key={x.value} value={x.value}>
                  {d.flag_names[x.value] ?? x.value} ({x.count})
                </option>
              ))}
            </select>
            <select name="stakeholder" defaultValue={f.stakeholder ?? ""} className={field} aria-label="Stakeholder">
              <option value="">All stakeholders</option>
              {d.facets.stakeholder.map((x) => (
                <option key={x.value} value={x.value}>
                  {STAKEHOLDER[x.value] ?? x.value} ({x.count})
                </option>
              ))}
            </select>
            <select name="review" defaultValue={f.review ?? ""} className={field} aria-label="Review">
              <option value="">Any confidence</option>
              <option value="1">Needs review only</option>
            </select>
          </div>
        ) : null}
        <button type="submit" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-navy-950 px-4 text-sm font-semibold text-on-navy hover:bg-navy-800 sm:row-start-1 sm:col-start-4">
          <Icon name="filter" className="h-4 w-4" />
          {simple ? "Show" : "Apply"}
        </button>
      </form>

      {chips.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-muted">{simple ? "Showing only:" : "Filters:"}</span>
          {chips.map((c) => (
            <Link
              key={c.key}
              href={viewHref(view, { [c.key]: "" }) + "#inbox"}
              aria-label={`Remove ${c.label}`}
              className="inline-flex items-center gap-1 rounded-full bg-navy-950 px-3 py-1 text-xs text-on-navy hover:bg-navy-800"
            >
              {c.label} <span aria-hidden="true">✕</span>
            </Link>
          ))}
          <Link href={tabHref(view.tab, view.days, f.status ? { status: f.status } : {}) + "#inbox"} className="text-xs font-medium text-accent-ink hover:underline">
            {simple ? "Show everything again" : "Clear all"}
          </Link>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4">
        {d.visits.length ? (
          d.visits.map((v) => <ActionCard key={v.visit_key} v={v} ctx={ctx} />)
        ) : (
          <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
            <Icon name="check" className="h-8 w-8 text-emerald-600" />
            <p className="font-medium text-ink">{lane === "open" || lane === "new" ? (simple ? "Nothing waiting for you here. Well done." : "Queue clear.") : simple ? "No visits match." : "No results."}</p>
            {chips.length ? <p className="text-sm text-ink-muted">{simple ? "Try removing a filter above." : "Relax a filter."}</p> : null}
          </div>
        )}
        {d.total > d.visits.length ? (
          <p className="text-sm text-ink-muted">
            {simple ? `Showing the first ${d.visits.length}. Use search or filters to find the rest.` : `First ${d.visits.length} of ${d.total}; narrow the filters.`}
          </p>
        ) : null}
      </div>
    </section>
  );
}
