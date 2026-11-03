"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  buildMarketSample,
  PERIODS,
  summarise,
  type BlockRef,
  type LeadStatus,
  type PeriodDays,
  type PlaceRef,
  type Scope,
  type VisitType,
} from "../sample-data";

/**
 * Head-office market overview under the globe: channel partners, influencers, IHB and MO, IHB lead status, customer
 * visits and the sales team, for whatever the globe has selected (West Bengal, a district or a block). Every figure
 * and name is sample data from ../sample-data.ts, and the panel says so in its heading.
 */

const fmt = new Intl.NumberFormat("en-IN");
const PERIOD_LABEL: Record<PeriodDays, string> = { 7: "Last 7 days", 30: "Last 30 days", 90: "Last 90 days" };

function PeriodSelect({ value, onChange, label }: { value: PeriodDays; onChange: (days: PeriodDays) => void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(Number(event.target.value) as PeriodDays)}
      className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink"
    >
      {PERIODS.map((days) => (
        <option key={days} value={days}>
          {PERIOD_LABEL[days]}
        </option>
      ))}
    </select>
  );
}

function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("overflow-hidden rounded-card bg-surface shadow-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-muted px-4 py-3">
        <h3 id={id} className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          {title}
        </h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** One coloured tile: a number in a circle over its label, as in the head-office sheet. Circle shades are dark enough for white text (WCAG AA). */
function CountTile({ label, value, tile, dot }: { label: string; value: number; tile: string; dot: string }) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg px-3 py-4", tile)}>
      <span className={cn("inline-flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-sm font-bold text-white", dot)}>{fmt.format(value)}</span>
      <span className="text-sm font-semibold text-ink">{label}</span>
    </div>
  );
}

const ICON_PATHS: Record<VisitType, ReactNode> = {
  dealers: <path d="M3 12l4-4 3 2 4-3 7 5M3 12l5 5 2-1 2 2 2-1 2 1 3-3M10 10l3 3" />,
  retailers: <path d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9 20h.01M17 20h.01" />,
  engineers: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-5v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1" />,
  contractors: <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M9 7h2m2 0h2M9 11h2m2 0h2M9 15h2m2 0h2" />,
  masons: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />,
  ihb: <path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" />,
};

const VISIT_TILES: { type: VisitType; label: string; icon: string }[] = [
  { type: "dealers", label: "Dealers", icon: "bg-blue-600" },
  { type: "retailers", label: "Retailers", icon: "bg-lime-600" },
  { type: "engineers", label: "Engineers", icon: "bg-orange-500" },
  { type: "contractors", label: "Contractors", icon: "bg-amber-500" },
  { type: "masons", label: "Masons", icon: "bg-violet-500" },
  { type: "ihb", label: "IHB", icon: "bg-red-700" },
];

const LEAD_ROWS: { status: LeadStatus; label: string; dot: string; badge: string }[] = [
  { status: "highlyPositive", label: "Highly positive", dot: "bg-lime-600", badge: "bg-lime-100 text-lime-800" },
  { status: "positive", label: "Positive", dot: "bg-teal-400", badge: "bg-teal-50 text-teal-700" },
  { status: "neutral", label: "Neutral", dot: "bg-amber-400", badge: "bg-amber-50 text-amber-700" },
  { status: "negative", label: "Negative", dot: "bg-red-700", badge: "bg-red-100 text-red-800" },
];

const lastActive = (days: number) => (days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`);

export interface MarketDashboardProps {
  blocks: readonly BlockRef[];
  districts: readonly PlaceRef[];
  stateName: string;
  /** What the globe has selected. "globe" (nothing yet) shows the whole state. */
  level: "globe" | "state" | "district" | "block";
  districtId: string | null;
  blockId: string | null;
  /** When given, district names in the sales team table fly the globe there. */
  onSelectDistrict?: (districtId: string) => void;
}

export function MarketDashboard({ blocks, districts, stateName, level, districtId, blockId, onSelectDistrict }: MarketDashboardProps) {
  const market = useMemo(() => buildMarketSample(blocks, districts), [blocks, districts]);
  const [leadDays, setLeadDays] = useState<PeriodDays>(7);
  const [visitDays, setVisitDays] = useState<PeriodDays>(7);
  const [teamDays, setTeamDays] = useState<PeriodDays>(7);
  const [showAllTeam, setShowAllTeam] = useState(false);

  const districtName = useMemo(() => new Map(districts.map((d) => [d.id, d.name])), [districts]);
  const scope: Scope =
    level === "block" && blockId ? { level: "block", blockId } : level === "district" && districtId ? { level: "district", districtId } : { level: "state" };
  const place =
    scope.level === "block" ? `${blocks.find((b) => b.id === scope.blockId)?.name ?? "Block"} block` : scope.level === "district" ? `${districtName.get(scope.districtId) ?? "District"} district` : stateName;

  const counts = summarise(market, scope, 7); // partner counts do not depend on the period
  const leads = summarise(market, scope, leadDays).leads;
  const visits = summarise(market, scope, visitDays).visits;
  const team = summarise(market, scope, teamDays).team;
  const leadTotal = Object.values(leads).reduce((a, b) => a + b, 0);
  const visitTotal = Object.values(visits).reduce((a, b) => a + b, 0);
  const shownTeam = showAllTeam ? team : team.slice(0, 12);

  return (
    <section aria-labelledby="market-title" className="mt-5 space-y-4" data-testid="market-dashboard" data-scope={scope.level}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* The place is not in the heading: the globe panel already has a heading with the place's name. */}
          <h2 id="market-title" className="text-lg font-semibold text-ink">
            Market overview
          </h2>
          <p className="text-sm text-ink-muted" data-testid="market-place">
            <strong className="font-semibold text-ink">{place}</strong> · {counts.blockCount === 1 ? "one block" : `${fmt.format(counts.blockCount)} blocks`}. Follows the place selected on the globe; choose a district or block to narrow it.
          </p>
        </div>
        <span className="rounded-full border border-dashed border-amber-500 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800" data-testid="market-sample-badge">
          Sample data · not real figures or people
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Channel partners">
          <div className="flex gap-3">
            <CountTile label="Dealers" value={counts.partners.dealers} tile="bg-blue-100" dot="bg-blue-600" />
            <CountTile label="Retailers" value={counts.partners.retailers} tile="bg-lime-100" dot="bg-lime-700" />
          </div>
        </Panel>
        <Panel title="Influencers">
          <div className="flex gap-3">
            <CountTile label="Engineers" value={counts.partners.engineers} tile="bg-orange-100" dot="bg-orange-700" />
            <CountTile label="Contractors" value={counts.partners.contractors} tile="bg-amber-100" dot="bg-amber-700" />
            <CountTile label="Masons" value={counts.partners.masons} tile="bg-violet-100" dot="bg-violet-600" />
          </div>
        </Panel>
        <Panel title="IHB">
          <div className="flex">
            <CountTile label="IHB" value={counts.partners.ihb} tile="bg-red-100" dot="bg-red-700" />
          </div>
        </Panel>
        <Panel title="MO">
          <div className="flex">
            <CountTile label="MO" value={counts.partners.mo} tile="bg-cyan-100" dot="bg-cyan-700" />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
        <Panel title="IHB lead status" action={<PeriodSelect value={leadDays} onChange={setLeadDays} label="Period for IHB lead status" />}>
          <ul className="space-y-3">
            {LEAD_ROWS.map((row) => (
              <li key={row.status} className="flex items-center gap-3">
                <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", row.dot)} />
                <span className="flex-1 text-sm text-ink">{row.label}</span>
                <span className="text-xs text-ink-subtle">{leadTotal ? `${Math.round((leads[row.status] / leadTotal) * 100)}%` : "–"}</span>
                <span className={cn("inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-semibold", row.badge)}>{fmt.format(leads[row.status])}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line pt-2 text-xs text-ink-muted">{fmt.format(leadTotal)} IHB leads in the period</p>
        </Panel>
        <Panel title="Customer visits" action={<PeriodSelect value={visitDays} onChange={setVisitDays} label="Period for customer visits" />}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {VISIT_TILES.map((tile) => (
              <div key={tile.type} className="flex items-start justify-between gap-3 rounded-lg bg-surface-muted p-4">
                <div>
                  <p className="text-sm text-ink-muted">{tile.label}</p>
                  <p className="mt-1 text-2xl font-bold text-ink">{fmt.format(visits[tile.type])}</p>
                </div>
                <span aria-hidden="true" className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-white", tile.icon)}>
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {ICON_PATHS[tile.type]}
                  </svg>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-muted">{fmt.format(visitTotal)} visits in the period</p>
        </Panel>
      </div>

      <Panel title={`Sales team · ${place}`} action={<PeriodSelect value={teamDays} onChange={setTeamDays} label="Period for the sales team" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-subtle">
                <th scope="col" className="py-2 pr-3 font-semibold">Name</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Role</th>
                <th scope="col" className="py-2 pr-3 font-semibold">District</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Blocks</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Visits</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">IHB leads</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Positive</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Dealers + retailers</th>
                <th scope="col" className="py-2 font-semibold">Last visit</th>
              </tr>
            </thead>
            <tbody>
              {shownTeam.map((row) => (
                <tr key={row.person.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 font-medium text-ink">{row.person.name}</td>
                  <td className="py-2 pr-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", row.person.role === "ASM" ? "bg-navy-950 text-on-navy" : "bg-surface-muted text-ink-muted")}>{row.person.role}</span>
                  </td>
                  <td className="py-2 pr-3 text-ink-muted">
                    {row.person.districtId && onSelectDistrict && scope.level === "state" ? (
                      <button type="button" onClick={() => onSelectDistrict(row.person.districtId!)} className="text-accent-ink underline underline-offset-2">
                        {districtName.get(row.person.districtId)}
                      </button>
                    ) : row.person.districtId ? (
                      districtName.get(row.person.districtId)
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.person.blockIds.length}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums text-ink">{fmt.format(row.visits)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt.format(row.leads)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.leads ? `${Math.round((row.positiveLeads / row.leads) * 100)}%` : "–"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt.format(row.partners)}</td>
                  <td className="py-2 text-ink-muted">{lastActive(row.person.lastVisitDaysAgo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <span>
            {team.length} {team.length === 1 ? "person covers" : "people cover"} {scope.level === "block" ? "this block" : "these blocks"}. Each row counts only the blocks that person covers here; an ASM covers every block of their district.
          </span>
          {team.length > 12 ? (
            <button type="button" onClick={() => setShowAllTeam((v) => !v)} className="font-medium text-accent-ink underline underline-offset-2">
              {showAllTeam ? "Show top 12" : `Show all ${team.length}`}
            </button>
          ) : null}
        </div>
      </Panel>
    </section>
  );
}
