"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { DistrictTeamPayload } from "../block-rows";
import { bandFor, districtAverage } from "../staffing";
import { searchTargets, type Target } from "../targets";
import type { GlobeManifest, Level, ManifestBlock, ManifestDistrict } from "../types";
import { BlockTeam, DistrictTeam, type Lookup } from "./TeamSection";

/** A search box: type a district or block name, pick a result, the globe flies there. */
export function SearchBox({ targets, onSelect, disabled }: { targets: readonly Target[]; onSelect: (target: Target) => void; disabled: boolean }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const results = useMemo(() => searchTargets(targets.filter((t) => t.kind !== "state"), query, 8), [targets, query]);
  const pick = (target: Target) => {
    setQuery("");
    inputRef.current?.blur();
    onSelect(target);
  };
  return (
    <div className="relative" data-testid="globe-search">
      <label className="sr-only" htmlFor={`${id}-input`}>
        Search a district or block
      </label>
      <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle">
        <circle cx="9" cy="9" r="5.5" />
        <path d="m13.5 13.5 3.5 3.5" />
      </svg>
      <input
        id={`${id}-input`}
        ref={inputRef}
        type="search"
        value={query}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search a district or block"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && results[0]) {
            event.preventDefault();
            pick(results[0]);
          } else if (event.key === "Escape") setQuery("");
        }}
        className="h-11 w-full rounded-xl bg-white pl-9 pr-3 text-sm text-ink shadow-float ring-1 ring-line placeholder:text-ink-subtle disabled:opacity-50"
      />
      {query.trim() ? (
        <ul className="absolute inset-x-0 top-12 z-10 max-h-80 overflow-y-auto rounded-xl bg-white p-1 shadow-float ring-1 ring-line" aria-label="Places">
          {results.length === 0 ? <li className="px-3 py-2 text-sm text-ink-muted">No match</li> : null}
          {results.map((target) => (
            <li key={`${target.kind}-${target.id}`}>
              <button type="button" onClick={() => pick(target)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-surface-muted">
                <span className="truncate font-medium">{target.name}</span>
                <span className="shrink-0 text-xs text-ink-muted">{target.kind === "district" ? "district" : target.context}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Swatch({ colour }: { colour: string }) {
  return <span aria-hidden="true" className="inline-block size-3 shrink-0 rounded-sm" style={{ backgroundColor: colour }} />;
}

function BigNumbers({ items }: { items: Array<{ value: number | string; label: string }> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl bg-surface-muted px-3 py-2">
          <p className="text-xl font-semibold tabular-nums leading-7 text-ink">{item.value}</p>
          <p className="text-xs text-ink-muted">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

/** A ranked list, fewest people first, so the places that need people are at the top. */
function RankedList({ title, rows, onSelect, disabled }: { title: string; rows: Array<{ id: string; name: string; value: number; note: string }>; onSelect: (id: string) => void; disabled: boolean }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-ink-muted">{title}</h3>
      <ul className="mt-1 space-y-0.5" aria-label={title} data-testid="globe-ranked">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(row.id)}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-ink hover:bg-surface-muted disabled:opacity-50"
            >
              <Swatch colour={bandFor(row.value).colour} />
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-ink-muted">{row.note}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

interface DetailsProps {
  overlay: GlobeManifest;
  level: Level;
  district: ManifestDistrict | null;
  block: ManifestBlock | null;
  districtTeam: Lookup<DistrictTeamPayload>;
  onSelectBlock: (id: string) => void;
  onSelectDistrict: (id: string) => void;
  disabled: boolean;
}

/**
 * The selected place and how many people work there. West Bengal: districts, fewest people per block first. A district:
 * its team by role and its blocks, fewest people first. A block: its team. Everything comes from the area-mapping sheet.
 */
export function GlobeDetails({ overlay, level, district, block, districtTeam, onSelectBlock, onSelectDistrict, disabled }: DetailsProps) {
  const parent = block?.districtId ? (overlay.districts.find((d) => d.id === block.districtId) ?? null) : null;
  const blocks = useMemo(() => (district ? overlay.blocks.filter((b) => b.districtId === district.id) : []), [overlay.blocks, district]);
  const districtRows = useMemo(
    () =>
      overlay.districts
        .map((d) => ({ d, average: districtAverage(d, overlay.blocks) }))
        .filter((x): x is { d: ManifestDistrict; average: number } => x.average !== null)
        .sort((a, b) => a.average - b.average || a.d.name.localeCompare(b.d.name))
        .map(({ d, average }) => ({ id: d.id, name: d.name, value: average, note: `${average.toFixed(1)} per block` })),
    [overlay],
  );
  const totalStaff = overlay.meta.sheet?.staff ?? 0;
  const totalVacant = overlay.districts.reduce((n, d) => n + d.vacancies, 0);

  return (
    <section aria-label="Details" tabIndex={0} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto text-sm leading-6" data-testid="globe-details">
      {level === "globe" || level === "state" ? (
        <>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">West Bengal sales team</h2>
            <p className="text-ink-muted">Red places have the fewest people. Click a district or block to see who works there.</p>
          </div>
          <BigNumbers
            items={[
              { value: totalStaff, label: "people" },
              { value: overlay.meta.counts.blocks, label: "blocks" },
              { value: totalVacant, label: "vacant" },
            ]}
          />
          <RankedList title="Districts · fewest people per block first" rows={districtRows} onSelect={onSelectDistrict} disabled={disabled} />
        </>
      ) : null}

      {level === "district" && district ? (
        <>
          <div>
            <p className="text-xs font-semibold text-ink-muted">District</p>
            <h2 className="text-xl font-semibold tracking-tight text-ink">{district.name}</h2>
          </div>
          {blocks.length === 0 ? (
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">The area-mapping sheet lists no block in this district.</p>
          ) : (
            <>
              <BigNumbers
                items={[
                  { value: district.staff, label: "people" },
                  { value: blocks.length, label: "blocks" },
                  { value: district.vacancies, label: "vacant" },
                ]}
              />
              <RankedList
                title="Blocks · fewest people first"
                rows={[...blocks].sort((a, b) => a.staff - b.staff || a.name.localeCompare(b.name)).map((b) => ({ id: b.id, name: b.name, value: b.staff, note: people(b.staff) }))}
                onSelect={onSelectBlock}
                disabled={disabled}
              />
              <div>
                <h3 className="mb-2 text-xs font-semibold text-ink-muted">Team</h3>
                <DistrictTeam lookup={districtTeam} blocks={blocks} districtName={district.name} />
              </div>
            </>
          )}
        </>
      ) : null}

      {level === "block" && block ? (
        <>
          <div>
            <p className="text-xs font-semibold text-ink-muted">Block</p>
            <h2 className="text-xl font-semibold tracking-tight text-ink">{block.name}</h2>
            {parent ? (
              <p className="text-xs text-ink-muted">
                in{" "}
                <button type="button" disabled={disabled} onClick={() => onSelectDistrict(parent.id)} className="font-medium text-primary-ink underline underline-offset-2 disabled:opacity-50">
                  {parent.name}
                </button>
              </p>
            ) : null}
          </div>
          <p className="flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink" data-testid="globe-headcount">
            <Swatch colour={bandFor(block.staff).colour} />
            <span>
              <strong className="font-semibold">{people(block.staff)}</strong> work here
              {block.vacancies ? `, ${block.vacancies} vacant` : ""}
            </span>
          </p>
          <BlockTeam key={block.id} block={block} />
          {!block.geometry ? <p className="text-xs text-ink-subtle" data-testid="globe-no-outline">The map has no boundary for this area, so it shows the district.</p> : null}
        </>
      ) : null}
    </section>
  );
}
