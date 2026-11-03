import Link from "next/link";
import { cn } from "@/lib/cn";
import { viewHref, type View } from "../links";
import type { CaseStatus, Overview } from "../types";
import { GROUP_TERMS, groupTerm, kidLine, statusTerm, type Words } from "../vocab";
import { GROUP_ICON, Icon, toneOf } from "./VisitIcons";

const GROUP_ORDER = ["Service & Supply", "Revenue", "Cash", "Market & Competition", "Demand Pipeline", "Relationship & Channel", "Visit Quality"];

const FUNNEL: { status: CaseStatus; bar: string }[] = [
  { status: "new", bar: "bg-red-400" },
  { status: "seen", bar: "bg-amber-400" },
  { status: "waiting", bar: "bg-sky-400" },
  { status: "resolved", bar: "bg-emerald-500" },
];

const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;

/** The period's story in a few sentences, built only from the counts (no AI): what happened, then how we responded. */
function sentences(o: Overview, days: number | null, words: Words): string[] {
  const when = days ? `the last ${days} days` : "all";
  const f = o.followup ?? {};
  const [fresh, seen, waiting, done] = [f.new ?? 0, f.seen ?? 0, f.waiting ?? 0, f.resolved ?? 0];
  if (words === "expert") {
    return [
      `${o.visits} visits · ${o.reps} reps · ${o.customers} accounts (${days ? when : "all time"}).`,
      `${o.alerts_p0_p1} P0/P1 escalations; ${o.competitor_visits} competitive mentions; ${o.payment_visits} receivable discussions.`,
      `Volume: ${o.tonnes_mentioned} MT mentioned, ${o.tonnes_confirmed} MT confirmed.`,
      `Case funnel: ${fresh} new → ${seen} acknowledged → ${waiting} assigned → ${done} resolved.`,
    ];
  }
  const out = [`${days ? `In ${when}, ` : "So far, "}${n(o.reps, "rep", "reps")} made ${n(o.visits, "visit", "visits")} to ${n(o.customers, "customer", "customers")}.`];
  if (o.alerts_p0_p1) out.push(`${n(o.alerts_p0_p1, "visit needs", "visits need")} someone to act within two days.`);
  if (o.tonnes_mentioned) out.push(`Customers talked about ${o.tonnes_mentioned} tonnes of steel; ${o.tonnes_confirmed} tonnes are confirmed orders.`);
  const extra = [
    o.competitor_visits ? `${n(o.competitor_visits, "visit", "visits")} mentioned another brand` : "",
    o.payment_visits ? `${n(o.payment_visits, "visit was", "visits were")} about money` : "",
  ].filter(Boolean);
  if (extra.length) out.push(`${extra.join(", and ")}.`);
  out.push(
    fresh
      ? `Head office has sorted ${done}, is waiting on reps for ${waiting}, and ${fresh} ${fresh === 1 ? "has" : "have"} not been looked at yet.`
      : `Every visit has been looked at: ${done} sorted, ${waiting} waiting on reps.`,
  );
  return out;
}

export function Story({ o, view, words }: { o: Overview; view: View; words: Words }) {
  const f = o.followup ?? {};
  const total = Math.max(1, FUNNEL.reduce((s, x) => s + (f[x.status] ?? 0), 0));
  const groups = Object.entries(o.groups ?? {}).sort(([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));
  const simple = words === "simple";

  return (
    <section aria-labelledby="story-title" className="grid grid-cols-1 gap-4">
      <div className="grid min-w-0 gap-5 rounded-2xl bg-gradient-to-br from-navy-950 to-navy-800 p-5 text-on-navy shadow-card sm:p-6 lg:grid-cols-[3fr_2fr]">
        <div>
          <h2 id="story-title" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-on-navy-subtle">
            <Icon name="book" className="h-4 w-4" />
            {simple ? "The story so far" : "Period summary"}
          </h2>
          <div className="mt-3 grid gap-1.5 text-base leading-7 sm:text-lg">
            {sentences(o, view.days, words).map((s) => (
              <p key={s}>{s}</p>
            ))}
          </div>
        </div>
        <div className="self-end">
          <p className="text-xs font-semibold uppercase tracking-widest text-on-navy-subtle">{simple ? "How we are responding" : "Follow-through"}</p>
          <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            {FUNNEL.map((x) => (
              <span key={x.status} className={x.bar} style={{ width: `${((f[x.status] ?? 0) / total) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {FUNNEL.map((x) => (
              <li key={x.status}>
                <Link
                  href={viewHref(view, { status: x.status })}
                  className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                >
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", x.bar)} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-on-navy-muted">{statusTerm(x.status, words)}</span>
                  <span className="font-semibold tabular-nums">{f[x.status] ?? 0}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {groups.length ? (
        <nav aria-label={simple ? "What the visits were about" : "Business areas"}>
          <p className="mb-2 text-sm font-medium text-ink-muted">{simple ? "What the visits were about. Tap one to see only those." : "Business areas (filter)"}</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
            {groups.map(([g, count]) => {
              const on = view.filters.group === g;
              const tone = toneOf(g);
              return (
                <li key={g}>
                  <Link
                    href={viewHref(view, { group: on ? "" : g, segment: "" }) + "#inbox"}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "flex h-full flex-col gap-2 rounded-xl border bg-surface p-3 shadow-card transition hover:-translate-y-0.5 hover:border-ink-subtle",
                      on ? "border-navy-950 ring-2 ring-navy-950" : "border-line",
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span className={cn("grid h-9 w-9 place-items-center rounded-lg", tone.disc)}>
                        <Icon name={GROUP_ICON[g] ?? "note"} />
                      </span>
                      <span className="text-2xl font-semibold tabular-nums text-ink">{count}</span>
                    </span>
                    <span className="text-sm font-semibold leading-5 text-ink">{groupTerm(g, words)}</span>
                    {simple ? <span className="text-xs leading-4 text-ink-muted">{kidLine(GROUP_TERMS, g)}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </section>
  );
}
