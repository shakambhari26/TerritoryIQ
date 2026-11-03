import Link from "next/link";
import { cn } from "@/lib/cn";
import { exploreHref } from "../links";
import type { ExploreData, Filters } from "../types";
import { Empty, Section, VisitList } from "./parts";

const URGENCY_NAMES: Record<string, string> = { P0: "P0 · Critical", P1: "P1 · High", P2: "P2 · Medium", P3: "P3 · Low" };
const STAKEHOLDER_NAMES: Record<string, string> = { DEALER: "Dealer / retailer", INFLUENCER: "Mason / engineer", IHB: "House owner (IHB)", OTHER: "Other" };

const selectClass = "mt-1 block h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-ink";

/**
 * All visits (admin): one dropdown per segment level. Business area -> group (sub-segment) -> urgency, plus flags,
 * rep and customer type. A plain GET form, so every filtered list is a link. The counts beside each option already
 * respect the other filters, and the chips above the list filter in one click.
 */
export function ExploreView({ d, days }: { d: ExploreData; days: number | null }) {
  const f = d.filters;
  const count = (key: keyof ExploreData["facets"], value: string) => d.facets[key].find((x) => x.value === value)?.count ?? 0;
  const groups = [...new Set(d.segments.map((s) => s.group))];
  const segName = Object.fromEntries(d.segments.map((s) => [s.code, `${s.emoji} ${s.name}`]));
  const active = Object.entries(f).filter(([, v]) => v);
  const without = (key: string): Filters => Object.fromEntries(active.filter(([k]) => k !== key));

  return (
    <div className="grid gap-5">
      <Section title="Filter visits" hint="Pick a business area, then a group inside it (sub-segment), then narrow by urgency, flag, rep or customer type.">
        <form method="get" action="/visit-insights" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="role" value="explore" />
          {days ? <input type="hidden" name="days" value={days} /> : null}
          <label className="text-xs font-medium text-ink-muted">
            Business area
            <select name="group" defaultValue={f.group ?? ""} className={selectClass}>
              <option value="">All areas</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g} ({count("group", g)})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Group (sub-segment)
            <select name="segment" defaultValue={f.segment ?? ""} className={selectClass}>
              <option value="">All groups</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {d.segments
                    .filter((s) => s.group === g)
                    .map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.emoji} {s.name} ({count("segment", s.code)})
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Urgency
            <select name="urgency" defaultValue={f.urgency ?? ""} className={selectClass}>
              <option value="">Any urgency</option>
              {Object.entries(URGENCY_NAMES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label} ({count("urgency", k)})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Flag
            <select name="flag" defaultValue={f.flag ?? ""} className={selectClass}>
              <option value="">Any flag</option>
              {d.facets.flag.map((x) => (
                <option key={x.value} value={x.value}>
                  {d.flag_names[x.value] ?? x.value} ({x.count})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Rep
            <select name="rep" defaultValue={f.rep ?? ""} className={selectClass}>
              <option value="">All reps</option>
              {d.facets.rep.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.value} ({x.count})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Customer type
            <select name="stakeholder" defaultValue={f.stakeholder ?? ""} className={selectClass}>
              <option value="">All types</option>
              {d.facets.stakeholder.map((x) => (
                <option key={x.value} value={x.value}>
                  {STAKEHOLDER_NAMES[x.value] ?? x.value} ({x.count})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Needs review
            <select name="review" defaultValue={f.review ?? ""} className={selectClass}>
              <option value="">Any</option>
              <option value="1">Only visits waiting for review</option>
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Search notes
            <input name="q" defaultValue={f.q ?? ""} maxLength={100} placeholder="customer, rep or word" className={selectClass} />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="h-9 rounded-md bg-navy-950 px-4 text-sm font-semibold text-on-navy hover:bg-navy-800">
              Apply filters
            </button>
            <Link href={exploreHref({}, days)} className="inline-flex h-9 items-center rounded-md border border-line-strong px-4 text-sm text-ink hover:border-ink-subtle">
              Clear all
            </Link>
          </div>
        </form>
      </Section>

      <Section title="Quick filters" hint="One click. Numbers already respect the filters you have chosen.">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Business area</p>
        <Chips items={d.facets.group.map((x) => ({ key: x.value, label: x.value, count: x.count, href: exploreHref({ ...without("segment"), group: x.value }, days), on: f.group === x.value }))} />
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-subtle">Group</p>
        <Chips items={d.facets.segment.map((x) => ({ key: x.value, label: segName[x.value] ?? x.value, count: x.count, href: exploreHref({ ...f, segment: x.value }, days), on: f.segment === x.value }))} />
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-subtle">Urgency</p>
        <Chips items={d.facets.urgency.map((x) => ({ key: x.value, label: URGENCY_NAMES[x.value] ?? x.value, count: x.count, href: exploreHref({ ...f, urgency: x.value }, days), on: f.urgency === x.value }))} />
        {active.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
            <span className="text-ink-muted">Active:</span>
            {active.map(([k, v]) => (
              <Link key={k} href={exploreHref(without(k), days)} className="rounded-full bg-navy-950 px-3 py-1 text-xs text-on-navy hover:bg-navy-800" aria-label={`Remove filter ${k}`}>
                {k === "segment" ? segName[v] ?? v : k === "flag" ? d.flag_names[v] ?? v : k === "stakeholder" ? STAKEHOLDER_NAMES[v] ?? v : v} ✕
              </Link>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title={`${d.total} of ${d.all} visits`} hint="Most urgent first. Open “What the rep said” for the full note.">
        {d.visits.length ? <VisitList visits={d.visits} empty="" /> : <Empty>No visits match these filters.</Empty>}
        {d.total > d.visits.length ? <p className="mt-3 text-sm text-ink-muted">Showing the first {d.visits.length}. Narrow the filters to see the rest.</p> : null}
      </Section>
    </div>
  );
}

function Chips({ items }: { items: { key: string; label: string; count: number; href: string; on: boolean }[] }) {
  if (!items.length) return <p className="mt-2 text-sm text-ink-muted">None.</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          aria-current={c.on ? "true" : undefined}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
            c.on ? "border-navy-950 bg-navy-950 text-on-navy" : "border-line-strong bg-surface text-ink hover:border-ink-subtle",
          )}
        >
          {c.label}
          <span className={cn("rounded-full px-1.5 text-xs tabular-nums", c.on ? "bg-white/15" : "bg-surface-muted text-ink-muted")}>{c.count}</span>
        </Link>
      ))}
    </div>
  );
}
