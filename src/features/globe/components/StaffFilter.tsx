"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { bandFor, filterActive, matchesFilter, NO_FILTER, STAFF_BANDS, type StaffFilter } from "../staffing";
import type { ManifestBlock, ManifestDistrict } from "../types";
import { BlockTeam } from "./TeamSection";

interface Props {
  blocks: readonly ManifestBlock[];
  districts: readonly ManifestDistrict[];
  filter: StaffFilter;
  onFilter: (next: StaffFilter) => void;
  /** Fly the globe to a block. */
  onSelectBlock: (id: string) => void;
  disabled: boolean;
}

const CHIPS: Array<{ key: StaffFilter["band"]; label: string; colour: string | null }> = [
  { key: null, label: "All places", colour: null },
  { key: "asm-only", label: "ASM only · no field staff", colour: "#7f1d1d" },
  ...STAFF_BANDS.map((b) => ({ key: b.key, label: b.key === "low" ? "1–2 people" : b.label, colour: b.colour })),
];

/**
 * "Which places have how many people": pick a headcount (or "ASM only"), optionally a district, and get the list of
 * places with their district, their headcount and, on request, their team. The map fades every other block.
 */
export function StaffFilterPanel({ blocks, districts, filter, onFilter, onSelectBlock, disabled }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const districtName = useMemo(() => new Map(districts.map((d) => [d.id, d.name])), [districts]);
  const inDistrict = useMemo(() => blocks.filter((b) => !filter.districtId || b.districtId === filter.districtId), [blocks, filter.districtId]);
  const countFor = (band: StaffFilter["band"]) => inDistrict.filter((b) => matchesFilter(b, { band, districtId: null })).length;
  const results = useMemo(
    () =>
      blocks
        .filter((b) => matchesFilter(b, filter))
        .sort((a, b) => a.staff - b.staff || (districtName.get(a.districtId ?? "") ?? "").localeCompare(districtName.get(b.districtId ?? "") ?? "") || a.name.localeCompare(b.name)),
    [blocks, filter, districtName],
  );
  const listedDistricts = useMemo(() => districts.filter((d) => d.blockCount > 0).sort((a, b) => a.name.localeCompare(b.name)), [districts]);

  return (
    <section aria-labelledby="staff-filter-title" className="mt-4 rounded-card bg-surface p-4 shadow-card" data-testid="staff-filter">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="staff-filter-title" className="text-base font-semibold text-ink">
            Find places by number of people
          </h2>
          <p className="text-xs text-ink-muted">Pick a group to list the places and fade the rest of the map.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="staff-filter-district" className="text-xs font-medium text-ink-muted">
            District
          </label>
          <select
            id="staff-filter-district"
            value={filter.districtId ?? ""}
            onChange={(event) => onFilter({ ...filter, districtId: event.target.value || null })}
            className="h-9 rounded-lg bg-surface-muted px-2 text-sm text-ink ring-1 ring-line"
            data-testid="staff-filter-district"
          >
            <option value="">All districts</option>
            {listedDistricts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {filterActive(filter) ? (
            <button type="button" onClick={() => onFilter(NO_FILTER)} className="h-9 rounded-lg px-3 text-xs font-semibold text-primary-ink hover:bg-primary-soft">
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div role="radiogroup" aria-label="Number of people" className="mt-3 flex flex-wrap gap-2">
        {CHIPS.map((chip) => {
          const selected = filter.band === chip.key;
          return (
            <button
              key={chip.key ?? "all"}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onFilter({ ...filter, band: chip.key })}
              className={cn(
                "flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium ring-1 transition-colors",
                selected ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-line hover:ring-ink/40",
              )}
              data-testid={`staff-chip-${chip.key ?? "all"}`}
            >
              {chip.colour ? <span aria-hidden="true" className="size-3 rounded-sm" style={{ backgroundColor: chip.colour }} /> : null}
              {chip.label}
              <span className={cn("tabular-nums", selected ? "text-white/70" : "text-ink-muted")}>{countFor(chip.key)}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs font-medium text-ink-muted" aria-live="polite" data-testid="staff-filter-count">
        {results.length} {results.length === 1 ? "place" : "places"}
        {filter.districtId ? ` in ${districtName.get(filter.districtId)}` : ""}
      </p>
      <ul className="mt-1 max-h-[28rem] divide-y divide-line overflow-y-auto rounded-xl ring-1 ring-line" data-testid="staff-filter-results">
        {results.map((b) => (
          <li key={b.id} className="px-3 py-2">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: bandFor(b.staff).colour }} />
              <button type="button" disabled={disabled} onClick={() => onSelectBlock(b.id)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink hover:text-primary-ink hover:underline disabled:opacity-50">
                {b.name}
              </button>
              <span className="hidden w-40 shrink-0 truncate text-xs text-ink-muted sm:block">{districtName.get(b.districtId ?? "")}</span>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink">
                {b.staff} {b.staff === 1 ? "person" : "people"}
              </span>
              <button
                type="button"
                aria-expanded={open === b.id}
                onClick={() => setOpen(open === b.id ? null : b.id)}
                className="w-24 shrink-0 rounded-lg px-2 py-1 text-right text-xs font-semibold text-primary-ink hover:bg-primary-soft"
              >
                {open === b.id ? "Hide team" : "Show team"}
              </button>
            </div>
            {open === b.id ? (
              <div className="mt-2 rounded-lg bg-surface-muted p-3">
                <BlockTeam block={b} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
