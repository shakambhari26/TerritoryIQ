"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { drawnClause, type OutlinesStatus } from "../outline-gate";
import { searchTargets, type Target } from "../targets";
import type { GlobeManifest, Level, ManifestBlock, ManifestDistrict, UnitState } from "../types";
import { BLOCK_STYLE, DISTRICT_STYLE } from "../styles";
import { targetForSelection, workspaceHref } from "../workspace-link";
import { BlockRowsSection } from "./BlockRowsSection";
import { WorkspaceLink } from "./WorkspaceLink";

const stateChip: Record<UnitState, { label: string; className: string }> = {
  represented: { label: "Provisional representative link", className: "border-orange-300 bg-orange-50 text-orange-900" },
  "no-representative": { label: "Confirmed: no representative", className: "border-line-strong bg-white text-ink" },
  unresolved: { label: "Unresolved or unverified", className: "border-line bg-surface-muted text-ink-muted" },
};

function Dot({ colour, ring }: { colour: string; ring?: boolean }) {
  return <span aria-hidden="true" className={cn("inline-block size-2.5 shrink-0 rounded-full", ring && "ring-1 ring-ink/40")} style={{ backgroundColor: colour }} />;
}

export function StateChip({ state, kind }: { state: UnitState; kind: "district" | "block" }) {
  const chip = stateChip[state];
  const label = kind === "district" && state === "represented" ? "Has provisional representative links" : chip.label;
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium", chip.className)}>{label}</span>;
}

interface SearchProps {
  targets: readonly Target[];
  districts: readonly Target[];
  onSelect: (target: Target) => void;
  disabled: boolean;
  /** The district or block the globe is on, marked in the list. */
  activeId?: string | null;
}

/** Search box and a plain list of places. Every entry is a button, so it works with the keyboard alone. */
export function PlaceSearch({ targets, districts, onSelect, disabled, activeId = null }: SearchProps) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const results = useMemo(() => searchTargets(targets, query, 12), [targets, query]);
  const showing = query.trim() === "" ? districts : results;
  const stateTarget = targets.find((t) => t.kind === "state");

  function move(event: KeyboardEvent<HTMLElement>, from: "input" | number) {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      (from === "input" ? buttons[0] : buttons[from + 1])?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (from === "input" || from === 0) inputRef.current?.focus();
      else buttons[from - 1]?.focus();
    } else if (event.key === "Escape" && query !== "") {
      event.preventDefault();
      setQuery("");
      inputRef.current?.focus();
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex min-h-0 flex-col gap-4 lg:flex-1">
      <h2 id={`${id}-title`} className="text-base font-semibold tracking-tight text-ink">
        Go to a place
      </h2>
      <label className="sr-only" htmlFor={`${id}-input`}>
        Search West Bengal, a district or a block
      </label>
      <div className="relative">
        <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle">
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
          placeholder="Search districts or blocks"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) {
              event.preventDefault();
              onSelect(results[0]);
            } else move(event, "input");
          }}
          className="h-11 w-full rounded-xl bg-surface-muted pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus-visible:bg-white disabled:opacity-50"
        />
      </div>
      {stateTarget && query.trim() === "" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect(stateTarget)}
          className="flex min-h-11 w-full flex-col items-start justify-center rounded-xl bg-primary px-3.5 py-2 text-left text-sm font-semibold leading-tight text-white shadow-float hover:bg-primary-hover disabled:opacity-50"
        >
          <span className="whitespace-nowrap">Fly to West Bengal</span>
          <span className="text-[0.6875rem] font-medium text-white">validated target</span>
        </button>
      ) : null}
      <p className="border-t border-line pt-3 text-xs font-medium text-ink-muted" aria-live="polite">
        {query.trim() === "" ? `${districts.length} districts` : `${results.length === 0 ? "No" : results.length} ${results.length === 1 ? "match" : "matches"}`}
      </p>
      <ul ref={listRef} className="-mx-2 -mt-2 max-h-56 min-h-0 space-y-1 overflow-y-auto px-2 pb-1 lg:max-h-none lg:min-h-[7rem] lg:flex-1" aria-label="Places">
        {showing.map((target, index) => {
          const active = activeId !== null && target.kind !== "state" && target.id === activeId;
          return (
            <li key={`${target.kind}-${target.id}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(target)}
                onKeyDown={(event) => move(event, index)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left text-[0.9375rem] leading-5 disabled:opacity-50",
                  active ? "bg-primary-soft font-semibold text-primary-ink" : "text-ink hover:bg-surface-muted",
                )}
              >
                <Dot colour={(target.kind === "block" ? BLOCK_STYLE : DISTRICT_STYLE)[target.state].fill} ring={target.state === "no-representative"} />
                <span className="min-w-0 flex-1 truncate">{target.name}</span>
                {/* Every row of the plain list is a district, so the kind is repeated only where the list mixes kinds. */}
                <span className={cn("shrink-0 text-xs font-normal", active ? "text-primary-ink" : "text-ink-muted")}>
                  {target.kind === "district" && query.trim() === ""
                    ? ""
                    : target.kind === "block"
                      ? `block · ${target.context ?? "no district"}`
                      : target.kind}
                  {target.kind !== "state" && !target.drawn ? (target.kind === "district" && query.trim() === "" ? "No outline" : " · no outline") : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface DetailsProps {
  overlay: GlobeManifest;
  level: Level;
  district: ManifestDistrict | null;
  block: ManifestBlock | null;
  onSelectBlock: (id: string) => void;
  onSelectDistrict: (id: string) => void;
  disabled: boolean;
  /** Where the outline file is. The wording about what is drawn follows it. */
  outlines: OutlinesStatus;
}

/** What the visitor is looking at, in words: the same information the colours and outlines carry. */
export function GlobeDetails({ overlay, level, district, block, onSelectBlock, onSelectDistrict, disabled, outlines }: DetailsProps) {
  const counts = overlay.meta.counts;
  const parent = block?.districtId ? (overlay.districts.find((d) => d.id === block.districtId) ?? null) : null;
  const blocks = useMemo(
    () => (district ? overlay.blocks.filter((b) => b.districtId === district.id).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [overlay.blocks, district],
  );
  const target = targetForSelection(level, district, block);
  const href = target ? workspaceHref(overlay, target) : null;

  return (
    <section aria-label="Details" className="flex min-h-0 flex-col gap-5 text-sm leading-6 lg:flex-1 lg:overflow-y-auto">
      {level === "globe" ? (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Earth</h2>
          <p className="text-ink-muted">
            The globe turns until you choose a place. Pick West Bengal in the list, search for a district or block, or press the marker on the globe.
          </p>
          <p className="text-xs leading-5 text-ink-muted">Drag the globe to turn it by hand while it is turning.</p>
        </div>
      ) : null}

      {level === "state" ? (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight text-ink">{overlay.state.name}</h2>
          <p className="text-ink-muted">
            {counts.districtsDrawn} of {counts.districts} district outlines passed validation; {drawnClause(outlines, counts.districtsDrawn)}.{" "}
            {counts.districtsRepresented} of them have at least one block with a provisional link to a named representative.
          </p>
          {href ? <WorkspaceLink href={href} /> : null}
          <details className="group text-xs text-ink-subtle">
            <summary className="cursor-pointer font-medium text-primary-ink">About this target</summary>
            <p className="mt-1.5">{overlay.state.basis}</p>
            {overlay.state.bbox ? (
              <p className="mt-1.5 font-mono text-[0.6875rem]">
                target box {overlay.state.bbox[0].toFixed(2)}E to {overlay.state.bbox[2].toFixed(2)}E, {overlay.state.bbox[1].toFixed(2)}N to {overlay.state.bbox[3].toFixed(2)}N
              </p>
            ) : null}
          </details>
        </div>
      ) : null}

      {level === "district" && district ? (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight text-ink">{district.name}</h2>
          <StateChip state={district.state} kind="district" />
          {href ? <WorkspaceLink href={href} /> : null}
          <p className="text-ink-muted">{district.reason}</p>
          <p className="text-xs text-ink-subtle">
            {district.drawnBlockCount} of {district.blockCount} blocks in the current reference list have a validated outline here.
            {outlines === "ready" ? "" : outlines === "loading" ? " None is drawn yet: the outline data is still loading." : " None is drawn: the outline data is unavailable."}
          </p>
          <h3 className="pt-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">Blocks</h3>
          <ul className="space-y-0.5" aria-label={`Blocks in ${district.name}`}>
            {blocks.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectBlock(b.id)}
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-ink hover:bg-surface-muted disabled:opacity-50"
                >
                  <Dot colour={BLOCK_STYLE[b.state].fill} />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  {!b.geometry ? <span className="shrink-0 text-[0.6875rem] text-ink-subtle">no outline</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {level === "block" && block ? (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight text-ink">{block.name}</h2>
          {parent ? (
            <p className="text-xs text-ink-subtle">
              Block in{" "}
              <button type="button" disabled={disabled} onClick={() => onSelectDistrict(parent.id)} className="font-medium text-primary-ink underline underline-offset-2 disabled:opacity-50">
                {parent.name}
              </button>
            </p>
          ) : null}
          <StateChip state={block.state} kind="block" />
          {href ? <WorkspaceLink href={href} /> : null}
          <p className="text-ink-muted">{block.reason}</p>
          {block.contested ? (
            <p className="rounded-lg border border-warn-line bg-warn-soft px-2.5 py-1.5 text-xs text-warn-ink">
              More than one workbook row is linked to this block. They are listed separately and not merged.
            </p>
          ) : null}
          {!block.geometry ? (
            <p className="rounded-lg border border-line bg-surface-muted px-2.5 py-1.5 text-xs text-ink-muted">
              No outline is drawn for this block: {block.noGeometryReason}. The globe shows its district instead.
            </p>
          ) : null}
          <BlockRowsSection key={block.id} overlay={overlay} blockId={block.id} rowIds={block.rowIds} />
        </div>
      ) : null}

      <p className="mt-auto rounded-xl bg-surface-muted px-3 py-2.5 text-xs leading-5 text-ink-muted">
        Colour shows a provisional, unreviewed link only. It does not change the allocation classifications (Assigned, Vacant, Unallocated, Data Missing / Unknown), which are not shown here.
      </p>
    </section>
  );
}
