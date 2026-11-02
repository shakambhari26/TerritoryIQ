import { formatCount } from "../format";
import type { TerritoryModel } from "../model";

/**
 * Four compact figures under the map, each one the Overview already shows and computed from the same model (so it follows
 * local changes the same way): sales territories, workbook rows allocated, blocks with a provisional outline, and named
 * staff slots. Nothing here is new, estimated or historical.
 */
export function MapKpiStrip({ summary, territories }: { summary: TerritoryModel["summary"]; territories: number }) {
  const cards = [
    { id: "territories", label: "Sales territories", value: territories, note: `from ${formatCount(summary.units.total)} source records` },
    { id: "allocated", label: "Rows allocated", value: summary.units.byState.allocated, note: `of ${formatCount(summary.units.total)} workbook rows` },
    { id: "outlined", label: "Block outlines", value: summary.blocks.withBoundary, note: `of ${formatCount(summary.blocks.total)} reference blocks` },
    { id: "staffing", label: "Staff slots filled", value: summary.staffing.namedSlots, note: `${formatCount(summary.staffing.vacantSlots)} Vacant markers` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3" data-testid="map-kpis" aria-label="Key figures">
      {cards.map((card) => (
        <div key={card.id} data-testid={`map-kpi-${card.id}`} className="min-w-0 rounded-xl border border-line/70 bg-surface px-3 py-1.5 sm:px-3.5">
          <dt className="truncate font-mono text-[0.625rem] font-medium uppercase tracking-[0.14em] text-ink-subtle">{card.label}</dt>
          <dd className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="text-xl font-semibold leading-6 tracking-tight text-ink tabular-nums">{formatCount(card.value)}</span>
            <span className="truncate text-[0.6875rem] leading-4 text-ink-muted">{card.note}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
