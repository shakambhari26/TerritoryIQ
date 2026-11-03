"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { drawnClause, type OutlinesStatus } from "../outline-gate";
import { searchTargets, type Target } from "../targets";
import type { GlobeManifest, Level, ManifestBlock, ManifestDistrict, UnitState } from "../types";
import { BLOCK_STYLE, DISTRICT_STYLE } from "../styles";
import { targetForSelection, workspaceHref } from "../workspace-link";
import type { GlobeInsights } from "../insights";
import { BlockRowsSection } from "./BlockRowsSection";
import { InsightSections } from "./InsightsPanel";
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
  /** Every block, for the Blocks tab. Without it the panel has the Districts list only. */
  blocks?: readonly Target[];
  onSelect: (target: Target) => void;
  disabled: boolean;
  /** The district or block the globe is on, marked in the list. */
  activeId?: string | null;
  /** Where the globe is, outermost first (Earth, state, district, block). Shown so the last move is never in doubt. */
  trail?: readonly string[];
  /** Extra classes for the scrolling list, for a host that does not bound the panel's height. */
  listClassName?: string;
}

type PlaceTab = "districts" | "blocks";

/** Search box, the fly-to action and a plain list of places (Districts or Blocks). Every entry is a button, so it works with the keyboard alone. */
export function PlaceSearch({ targets, districts, blocks = [], onSelect, disabled, activeId = null, trail, listClassName }: SearchProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<PlaceTab>("districts");
  const [seenActive, setSeenActive] = useState(activeId);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const results = useMemo(() => searchTargets(targets, query, 12), [targets, query]);
  const searching = query.trim() !== "";
  const hasBlocks = blocks.length > 0;
  const activeTab: PlaceTab = hasBlocks ? tab : "districts";
  const showing = searching ? results : activeTab === "blocks" ? blocks : districts;
  const stateTarget = targets.find((t) => t.kind === "state");

  // A pick made on the globe moves the list to where that place is. Adjusting state while rendering is the pattern React documents for this.
  if (activeId !== seenActive) {
    setSeenActive(activeId);
    const kind = activeId ? targets.find((t) => t.kind !== "state" && t.id === activeId)?.kind : undefined;
    if (kind === "block" || kind === "district") setTab(kind === "block" ? "blocks" : "districts");
  }

  // Keeps the selected place in view inside the list only; scrollIntoView could also scroll the page.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !item) return;
    const top = item.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + item.offsetHeight - list.clientHeight;
  }, [activeId, activeTab, searching]);

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

  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next: PlaceTab = event.key === "ArrowLeft" || event.key === "Home" ? "districts" : "blocks";
    setTab(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }

  const tabClass = (selected: boolean) =>
    cn("min-h-9 flex-1 rounded-lg px-2 text-[0.8125rem] font-semibold leading-5 transition-colors", selected ? "bg-white text-primary-ink shadow-float" : "text-ink-muted hover:text-ink");
  const tabbed = hasBlocks && !searching;

  return (
    <section aria-labelledby={`${id}-title`} className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h2 id={`${id}-title`} className="text-base font-semibold tracking-tight text-ink">
          Go to a place
        </h2>
        {trail && trail.length > 0 ? (
          <p className="mt-0.5 truncate text-xs text-ink-muted" data-testid="globe-trail" title={trail.join(" › ")}>
            <span className="sr-only">You are at </span>
            {trail.join(" › ")}
          </p>
        ) : null}
      </div>
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
      {stateTarget && !searching ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect(stateTarget)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-primary px-3.5 py-2 text-left text-sm font-semibold leading-tight text-white shadow-float hover:bg-primary-hover disabled:opacity-50"
        >
          <span className="whitespace-nowrap">Fly to West Bengal</span>
          <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
          </svg>
        </button>
      ) : null}
      {tabbed ? (
        <div role="tablist" aria-label="Kind of place" className="flex gap-1 rounded-xl bg-surface-muted p-1">
          <button
            type="button"
            role="tab"
            id={`${id}-tab-districts`}
            aria-selected={activeTab === "districts"}
            aria-controls={`${id}-panel`}
            tabIndex={activeTab === "districts" ? 0 : -1}
            onClick={() => setTab("districts")}
            onKeyDown={moveTab}
            className={tabClass(activeTab === "districts")}
          >
            Districts <span className="font-normal tabular-nums">{districts.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            id={`${id}-tab-blocks`}
            aria-selected={activeTab === "blocks"}
            aria-controls={`${id}-panel`}
            tabIndex={activeTab === "blocks" ? 0 : -1}
            onClick={() => setTab("blocks")}
            onKeyDown={moveTab}
            className={tabClass(activeTab === "blocks")}
          >
            Blocks <span className="font-normal tabular-nums">{blocks.length}</span>
          </button>
        </div>
      ) : null}
      <p className="border-t border-line pt-2.5 text-xs font-medium text-ink-muted" aria-live="polite">
        {!searching ? `${showing.length} ${activeTab}` : `${results.length === 0 ? "No" : results.length} ${results.length === 1 ? "match" : "matches"}`}
      </p>
      <div id={`${id}-panel`} role={tabbed ? "tabpanel" : undefined} aria-labelledby={tabbed ? `${id}-tab-${activeTab}` : undefined} className="flex min-h-0 flex-1 flex-col">
        <ul ref={listRef} className={cn("relative -mx-2 -mt-1.5 min-h-[7rem] flex-1 space-y-0.5 overflow-y-auto px-2 pb-1", listClassName)} aria-label="Places">
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
                    "flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left text-[0.9375rem] leading-5 disabled:opacity-50",
                    active ? "bg-primary-soft font-semibold text-primary-ink ring-1 ring-primary/30" : "text-ink hover:bg-surface-muted",
                  )}
                >
                  <Dot colour={(target.kind === "block" ? BLOCK_STYLE : DISTRICT_STYLE)[target.state].fill} ring={target.state === "no-representative"} />
                  <span className="min-w-0 flex-1 truncate">{target.name}</span>
                  {/* Every row of the plain district list is a district, so the kind is repeated only where the list mixes kinds. */}
                  <span className={cn("max-w-[45%] shrink-0 truncate text-xs font-normal", active ? "text-primary-ink" : "text-ink-muted")}>
                    {target.kind === "district" && !searching ? "" : target.kind === "block" ? `block · ${target.context ?? "no district"}` : target.kind}
                    {target.kind !== "state" && !target.drawn ? (target.kind === "district" && !searching ? "No outline" : " · no outline") : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
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
  /** Counts for the region, allocation and quick-insight cards (insights.ts). Null when the workbook data has not been built. */
  insights?: GlobeInsights | null;
}

/**
 * What the visitor is looking at, in words: the same information the colours and outlines carry, then the insight cards
 * for the place, then the place's own list (a district's blocks, a block's workbook rows).
 */
export function GlobeDetails({ overlay, level, district, block, onSelectBlock, onSelectDistrict, disabled, outlines, insights = null }: DetailsProps) {
  const counts = overlay.meta.counts;
  const parent = block?.districtId ? (overlay.districts.find((d) => d.id === block.districtId) ?? null) : null;
  const blocks = useMemo(
    () => (district ? overlay.blocks.filter((b) => b.districtId === district.id).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [overlay.blocks, district],
  );
  const target = targetForSelection(level, district, block);
  const href = target ? workspaceHref(overlay, target) : null;

  return (
    <section aria-label="Details" tabIndex={0} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto text-sm leading-6">
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
        </div>
      ) : null}

      <InsightSections manifest={overlay} level={level} district={district} block={block} insights={insights} />

      {level === "district" && district ? (
        <div className="space-y-2">
          <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">Blocks</h3>
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

      {level === "block" && block ? <BlockRowsSection key={block.id} overlay={overlay} blockId={block.id} rowIds={block.rowIds} /> : null}

      <p className="mt-auto rounded-xl bg-surface-muted px-3 py-2.5 text-xs leading-5 text-ink-muted">
        {insights
          ? "Colour shows a provisional, unreviewed link only. It does not change the allocation states (Allocated, Confirmed unallocated, Missing / unverified, Conflicting), which are counted in the cards above and on the Overview."
          : "Colour shows a provisional, unreviewed link only. It does not change the allocation classifications (Assigned, Vacant, Unallocated, Data Missing / Unknown), which are not shown here."}
      </p>
    </section>
  );
}
