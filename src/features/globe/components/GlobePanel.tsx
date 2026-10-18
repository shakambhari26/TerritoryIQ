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
  represented: { label: "Provisional representative link", className: "border-orange-300/50 bg-orange-400/15 text-orange-200" },
  "no-representative": { label: "Confirmed: no representative", className: "border-white/50 bg-white/15 text-white" },
  unresolved: { label: "Unresolved or unverified", className: "border-slate-400/40 bg-slate-400/10 text-slate-200" },
};

function Dot({ colour, ring }: { colour: string; ring?: boolean }) {
  return <span aria-hidden="true" className={cn("inline-block size-2.5 shrink-0 rounded-full", ring && "ring-1 ring-white/50")} style={{ backgroundColor: colour }} />;
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
}

/** Search box and a plain list of places. Every entry is a button, so it works with the keyboard alone. */
export function PlaceSearch({ targets, districts, onSelect, disabled }: SearchProps) {
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
    <section aria-labelledby={`${id}-title`} className="space-y-2">
      <h2 id={`${id}-title`} className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
        Go to a place
      </h2>
      <label className="sr-only" htmlFor={`${id}-input`}>
        Search West Bengal, a district or a block
      </label>
      <input
        id={`${id}-input`}
        ref={inputRef}
        type="search"
        value={query}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search West Bengal, a district or a block"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && results[0]) {
            event.preventDefault();
            onSelect(results[0]);
          } else move(event, "input");
        }}
        className="w-full rounded-md border border-line-strong bg-surface-muted px-3 py-2 text-sm text-ink placeholder:text-ink-subtle disabled:opacity-50"
      />
      {stateTarget && query.trim() === "" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect(stateTarget)}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-left text-sm font-semibold text-ink hover:border-accent disabled:opacity-50"
        >
          <span>Fly to West Bengal</span>
          <span className="text-[0.6875rem] font-medium text-accent-ink">validated target</span>
        </button>
      ) : null}
      <p className="text-[0.6875rem] text-ink-subtle" aria-live="polite">
        {query.trim() === "" ? `${districts.length} districts` : `${results.length === 0 ? "No" : results.length} ${results.length === 1 ? "match" : "matches"}`}
      </p>
      <ul ref={listRef} className="max-h-56 space-y-0.5 overflow-y-auto pr-1" aria-label="Places">
        {showing.map((target, index) => (
          <li key={`${target.kind}-${target.id}`}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(target)}
              onKeyDown={(event) => move(event, index)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-muted disabled:opacity-50"
            >
              <Dot colour={(target.kind === "block" ? BLOCK_STYLE : DISTRICT_STYLE)[target.state].fill} ring={target.state === "no-representative"} />
              <span className="min-w-0 flex-1 truncate">{target.name}</span>
              <span className="shrink-0 text-[0.6875rem] text-ink-subtle">
                {target.kind === "block" ? `block · ${target.context ?? "no district"}` : target.kind}
                {target.kind !== "state" && !target.drawn ? " · no outline" : ""}
              </span>
            </button>
          </li>
        ))}
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
    <section aria-label="Details" className="space-y-3 text-sm">
      {level === "globe" ? (
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-ink">Earth</h2>
          <p className="text-ink-muted">
            The globe turns until you choose a place. Pick West Bengal in the list, search for a district or block, or press the marker on the globe.
          </p>
          <p className="text-xs text-ink-subtle">Drag the globe to turn it by hand while it is turning.</p>
        </div>
      ) : null}

      {level === "state" ? (
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-ink">{overlay.state.name}</h2>
          <p className="text-ink-muted">
            {counts.districtsDrawn} of {counts.districts} district outlines passed validation; {drawnClause(outlines, counts.districtsDrawn)}.{" "}
            {counts.districtsRepresented} of them have at least one block with a provisional link to a named representative.
          </p>
          <p className="text-xs text-ink-subtle">{overlay.state.basis}</p>
          {overlay.state.bbox ? (
            <p className="font-mono text-[0.6875rem] text-ink-subtle">
              target box {overlay.state.bbox[0].toFixed(2)}E to {overlay.state.bbox[2].toFixed(2)}E, {overlay.state.bbox[1].toFixed(2)}N to {overlay.state.bbox[3].toFixed(2)}N
            </p>
          ) : null}
          {href ? <WorkspaceLink href={href} /> : null}
        </div>
      ) : null}

      {level === "district" && district ? (
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-ink">{district.name}</h2>
          <StateChip state={district.state} kind="district" />
          {href ? <WorkspaceLink href={href} /> : null}
          <p className="text-ink-muted">{district.reason}</p>
          <p className="text-xs text-ink-subtle">
            {district.drawnBlockCount} of {district.blockCount} blocks in the current reference list have a validated outline here.
            {outlines === "ready" ? "" : outlines === "loading" ? " None is drawn yet: the outline data is still loading." : " None is drawn: the outline data is unavailable."}
          </p>
          <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Blocks</h3>
          <ul className="max-h-48 space-y-0.5 overflow-y-auto pr-1" aria-label={`Blocks in ${district.name}`}>
            {blocks.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectBlock(b.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-ink hover:bg-surface-muted disabled:opacity-50"
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
          <h2 className="text-base font-semibold text-ink">{block.name}</h2>
          {parent ? (
            <p className="text-xs text-ink-subtle">
              Block in{" "}
              <button type="button" disabled={disabled} onClick={() => onSelectDistrict(parent.id)} className="font-medium text-accent-ink underline underline-offset-2 disabled:opacity-50">
                {parent.name}
              </button>
            </p>
          ) : null}
          <StateChip state={block.state} kind="block" />
          {href ? <WorkspaceLink href={href} /> : null}
          <p className="text-ink-muted">{block.reason}</p>
          {block.contested ? (
            <p className="rounded-md border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100">
              More than one workbook row is linked to this block. They are listed separately and not merged.
            </p>
          ) : null}
          {!block.geometry ? (
            <p className="rounded-md border border-line-strong bg-surface-muted px-2 py-1.5 text-xs text-ink-muted">
              No outline is drawn for this block: {block.noGeometryReason}. The globe shows its district instead.
            </p>
          ) : null}
          <BlockRowsSection key={block.id} overlay={overlay} blockId={block.id} rowIds={block.rowIds} />
        </div>
      ) : null}

      <p className="border-t border-line pt-2 text-[0.6875rem] leading-4 text-ink-subtle">
        Colour shows a provisional, unreviewed link only. It does not change the allocation classifications (Assigned, Vacant, Unallocated, Data Missing / Unknown), which are not shown here.
      </p>
    </section>
  );
}
