"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  ALLOCATION_COLOUR,
  ALLOCATION_LABEL,
  ALLOCATION_ORDER,
  COLOUR_BY_LABEL,
  CUSTOMER_LABEL,
  CUSTOMER_ORDER,
  EMPTY_FILTER,
  filterActive,
  LINK_LABEL,
  LINK_ORDER,
  STAFFING_COLOUR,
  STAFFING_LABEL,
  STAFFING_ORDER,
  type BlockFacts,
  type ColourBy,
  type FacetKey,
  type SegmentFilter,
  type SegmentResult,
} from "../segments";
import { BLOCK_STYLE } from "../styles";
import type { ManifestDistrict } from "../types";

const fmt = new Intl.NumberFormat("en-IN");

/** One-click starting points. Each replaces the current filter. */
const PRESETS: Array<{ label: string; filter: Partial<SegmentFilter>; by?: ColourBy }> = [
  { label: "Open slots", filter: { staffing: ["vacant"] }, by: "staffing" },
  { label: "No rep link", filter: { link: ["unresolved"] } },
  { label: "Conflicting data", filter: { allocation: ["conflicting"] }, by: "allocation" },
  { label: "Missing data", filter: { allocation: ["missing"] }, by: "allocation" },
  { label: "Has customers", filter: { customers: ["Dealer", "Retailer", "Mason", "IHB"] } },
  { label: "Contested", filter: { contestedOnly: true } },
];

function toggle<T extends string>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FacetChip({ label, count, selected, colour, onClick, disabled }: { label: string; count: number; selected: boolean; colour?: string; onClick: () => void; disabled?: boolean }) {
  const empty = count === 0 && !selected;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
        selected ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-white text-ink hover:border-line-strong hover:bg-surface-muted",
        empty && "text-ink-subtle",
      )}
    >
      {colour ? <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colour }} /> : null}
      <span>{label}</span>
      <span className={cn("tabular-nums", selected ? "text-primary-ink" : "text-ink-muted")}>{fmt.format(count)}</span>
    </button>
  );
}

function Group({ title, children, chosen, onClear, defaultOpen = true }: { title: string; children: ReactNode; chosen: number; onClear: () => void; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-t border-line pt-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5">
          <svg aria-hidden="true" viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-open:rotate-90">
            <path d="m7 5 5 5-5 5" />
          </svg>
          {title}
          {chosen > 0 ? <span className="rounded-full bg-primary px-1.5 text-[0.625rem] leading-4 text-white">{chosen}</span> : null}
        </span>
        {chosen > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onClear();
            }}
            className="rounded px-1 text-[0.6875rem] font-semibold normal-case tracking-normal text-primary-ink hover:underline"
          >
            Clear
          </button>
        ) : null}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function Toggle({ label, note, checked, onChange }: { label: string; note: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1 text-xs text-ink">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 accent-[var(--color-primary,#2563eb)]" />
      <span className="leading-4">
        {label}
        <span className="block text-[0.6875rem] text-ink-muted">{note}</span>
      </span>
    </label>
  );
}

export interface SegmentPanelProps {
  filter: SegmentFilter;
  onFilter: (next: SegmentFilter) => void;
  colourBy: ColourBy;
  onColourBy: (by: ColourBy) => void;
  result: SegmentResult;
  facts: readonly BlockFacts[];
  districts: readonly ManifestDistrict[];
  /** Whether allocation and staffing are known (the insights were built). */
  hasInsights: boolean;
  /** Whether customer placements are known (the customer file was built). */
  hasCustomers: boolean;
  onSelectBlock: (id: string) => void;
  disabled: boolean;
}

/**
 * The Segment tab of the globe's left panel: colour by, presets, faceted filters with live counts and the blocks
 * that are in the segment. Every change repaints the globe at once (see segments.ts and GlobeRenderer.setPaint).
 */
export function SegmentPanel({ filter, onFilter, colourBy, onColourBy, result, facts, districts, hasInsights, hasCustomers, onSelectBlock, disabled }: SegmentPanelProps) {
  const id = useId();
  const [districtQuery, setDistrictQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const active = filterActive(filter);
  const count = (key: FacetKey, value: string) => result.facetCounts[key].get(value) ?? 0;
  const set = (patch: Partial<SegmentFilter>) => onFilter({ ...filter, ...patch });

  const districtName = useMemo(() => new Map(districts.map((d) => [d.id, d.name])), [districts]);
  const sortedDistricts = useMemo(() => {
    const q = districtQuery.trim().toLowerCase();
    return [...districts]
      .filter((d) => q === "" || d.name.toLowerCase().includes(q))
      .sort((a, b) => count("districts", b.id) - count("districts", a.id) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districts, districtQuery, result]);

  const matchedBlocks = useMemo(
    () => facts.filter((f) => result.matched.has(f.id)).sort((a, b) => (districtName.get(a.districtId ?? "") ?? "").localeCompare(districtName.get(b.districtId ?? "") ?? "") || a.name.localeCompare(b.name)),
    [facts, result, districtName],
  );
  const districtsHit = [...result.byDistrict.values()].filter((d) => d.matched > 0).length;
  const share = result.total > 0 ? result.matched.size / result.total : 0;
  const LIST_LIMIT = 40;
  const listed = showAll ? matchedBlocks : matchedBlocks.slice(0, LIST_LIMIT);

  const colourOptions: ColourBy[] = hasInsights ? ["link", "allocation", "staffing"] : ["link"];

  return (
    <section aria-labelledby={`${id}-title`} className="flex min-h-0 flex-1 flex-col gap-3" data-testid="globe-segment">
      <div>
        <h2 id={`${id}-title`} className="text-base font-semibold tracking-tight text-ink">
          Segment the map
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">Blocks outside the segment fade out. Districts are shaded by how many of their blocks are in it.</p>
      </div>

      {/* Result summary: always visible, with the share as a bar. */}
      <div className="rounded-xl bg-surface-muted p-3" aria-live="polite" data-testid="globe-segment-summary">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-ink">
            <span className="text-lg font-semibold tabular-nums">{fmt.format(result.matched.size)}</span>
            <span className="text-ink-muted"> of {fmt.format(result.total)} blocks</span>
          </p>
          {active ? (
            <button type="button" onClick={() => onFilter(EMPTY_FILTER)} className="text-xs font-semibold text-primary-ink hover:underline" data-testid="globe-segment-reset">
              Reset
            </button>
          ) : null}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(share * 100).toFixed(1)}%` }} />
        </div>
        <p className="mt-1.5 text-[0.6875rem] text-ink-muted">
          In {districtsHit} of {districts.length} districts
          {result.undrawnMatched > 0 ? ` · ${result.undrawnMatched} with no outline to draw` : ""}
        </p>
      </div>

      <div className="-mx-2 min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2 pb-2">
        {/* Colour by */}
        <div>
          <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">Colour blocks by</p>
          <div role="radiogroup" aria-label="Colour blocks by" className="flex gap-1 rounded-xl bg-surface-muted p-1">
            {colourOptions.map((by) => (
              <button
                key={by}
                type="button"
                role="radio"
                aria-checked={colourBy === by}
                onClick={() => onColourBy(by)}
                className={cn("min-h-8 flex-1 rounded-lg px-2 text-xs font-semibold transition-colors", colourBy === by ? "bg-white text-primary-ink shadow-float" : "text-ink-muted hover:text-ink")}
              >
                {COLOUR_BY_LABEL[by]}
              </button>
            ))}
          </div>
        </div>

        {/* Presets */}
        <div>
          <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">Quick segments</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.filter((p) => (hasInsights || (!p.filter.staffing && !p.filter.allocation)) && (hasCustomers || !p.filter.customers)).map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  onFilter({ ...EMPTY_FILTER, ...preset.filter });
                  if (preset.by) onColourBy(preset.by);
                }}
                className="rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs font-medium text-ink hover:border-primary hover:bg-primary-soft hover:text-primary-ink"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <Group title="Rep link" chosen={filter.link.length} onClear={() => set({ link: [] })}>
          <div className="flex flex-wrap gap-1.5">
            {LINK_ORDER.map((value) => (
              <FacetChip key={value} label={LINK_LABEL[value]} count={count("link", value)} colour={BLOCK_STYLE[value].fill} selected={filter.link.includes(value)} onClick={() => set({ link: toggle(filter.link, value) })} />
            ))}
          </div>
        </Group>

        {hasInsights ? (
          <>
            <Group title="Allocation" chosen={filter.allocation.length} onClear={() => set({ allocation: [] })}>
              <div className="flex flex-wrap gap-1.5">
                {ALLOCATION_ORDER.map((value) => (
                  <FacetChip key={value} label={ALLOCATION_LABEL[value]} count={count("allocation", value)} colour={ALLOCATION_COLOUR[value]} selected={filter.allocation.includes(value)} onClick={() => set({ allocation: toggle(filter.allocation, value) })} />
                ))}
              </div>
            </Group>
            <Group title="Staffing" chosen={filter.staffing.length} onClear={() => set({ staffing: [] })}>
              <div className="flex flex-wrap gap-1.5">
                {STAFFING_ORDER.map((value) => (
                  <FacetChip
                    key={value}
                    label={STAFFING_LABEL[value]}
                    count={count("staffing", value)}
                    colour={value === "named" ? STAFFING_COLOUR.staffed : value === "vacant" ? STAFFING_COLOUR.open : STAFFING_COLOUR.none}
                    selected={filter.staffing.includes(value)}
                    onClick={() => set({ staffing: toggle(filter.staffing, value) })}
                  />
                ))}
              </div>
            </Group>
          </>
        ) : null}

        {hasCustomers ? (
          <Group title="Placed customers" chosen={filter.customers.length} onClear={() => set({ customers: [] })}>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOMER_ORDER.map((value) => (
                <FacetChip key={value} label={CUSTOMER_LABEL[value]} count={count("customers", value)} selected={filter.customers.includes(value)} onClick={() => set({ customers: toggle(filter.customers, value) })} />
              ))}
            </div>
            <p className="mt-1.5 text-[0.6875rem] leading-4 text-ink-muted">Placements are inferred from names, never confirmed.</p>
          </Group>
        ) : null}

        <Group title="Districts" chosen={filter.districts.length} onClear={() => set({ districts: [] })} defaultOpen={false}>
          <input
            type="search"
            value={districtQuery}
            onChange={(event) => setDistrictQuery(event.target.value)}
            placeholder="Filter districts"
            aria-label="Filter districts"
            className="mb-1.5 h-9 w-full rounded-lg bg-surface-muted px-3 text-xs text-ink placeholder:text-ink-subtle focus-visible:bg-white"
          />
          <ul className="max-h-48 space-y-0.5 overflow-y-auto">
            {sortedDistricts.map((d) => {
              const n = count("districts", d.id);
              const checked = filter.districts.includes(d.id);
              return (
                <li key={d.id}>
                  <label className={cn("flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-surface-muted", n === 0 && !checked ? "text-ink-subtle" : "text-ink")}>
                    <input type="checkbox" checked={checked} onChange={() => set({ districts: toggle(filter.districts, d.id) })} className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="tabular-nums text-ink-muted">{n}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Group>

        <Group title="More" chosen={(filter.contestedOnly ? 1 : 0) + (filter.drawnOnly ? 1 : 0)} onClear={() => set({ contestedOnly: false, drawnOnly: false })} defaultOpen={false}>
          <Toggle label="Contested only" note="More than one workbook row claims the block" checked={filter.contestedOnly} onChange={(v) => set({ contestedOnly: v })} />
          <Toggle label="Has an outline" note="Leave out blocks the globe cannot draw" checked={filter.drawnOnly} onChange={(v) => set({ drawnOnly: v })} />
        </Group>

        {active ? (
          <div className="border-t border-line pt-2.5">
            <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">Blocks in the segment</p>
            {matchedBlocks.length === 0 ? (
              <p className="text-xs text-ink-muted">No block matches. Remove a choice above, or Reset.</p>
            ) : (
              <ul className="space-y-0.5" data-testid="globe-segment-blocks">
                {listed.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelectBlock(f.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs text-ink hover:bg-surface-muted disabled:opacity-50"
                    >
                      <span className="min-w-0 truncate font-medium">{f.name}</span>
                      <span className="shrink-0 truncate text-[0.6875rem] text-ink-muted">
                        {f.districtId ? districtName.get(f.districtId) : ""}
                        {f.drawn ? "" : " · no outline"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {matchedBlocks.length > LIST_LIMIT ? (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 text-xs font-semibold text-primary-ink hover:underline">
                {showAll ? "Show fewer" : `Show all ${matchedBlocks.length}`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
