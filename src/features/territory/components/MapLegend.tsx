"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { REFERENCE_LIST_NOTE } from "../format";
import { CLUSTER_COLOR, PIN_COLOR, SELECTED, legendItems, type MapLayerMode } from "../map-style";
import type { BoundaryLayerMeta } from "../types";

export interface MapCoverage {
  districtsDrawn: number;
  districtsTotal: number;
  blocksDrawn: number;
  blocksTotal: number;
}

/** What the representative pins on the map are, for the legend. Null when none are shown. */
export interface PinLegend {
  kind: "territory" | "block";
  count: number;
}

function PinSwatch() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 15 20" width="10" height="13" className="shrink-0 overflow-visible">
      <path d="M7.5 19.4C7.5 19.4 1 12.6 1 7.6A6.5 6.5 0 1 1 14 7.6C14 12.6 7.5 19.4 7.5 19.4Z" fill={PIN_COLOR.body} stroke={PIN_COLOR.ring} strokeWidth="1.4" />
      <circle cx="7.5" cy="7.4" r="2.2" fill={PIN_COLOR.core} />
    </svg>
  );
}

/** The same stacked-card shape the map draws for a group of pins, drawn small. */
function GroupSwatch() {
  return (
    <span aria-hidden="true" className="relative inline-block h-3.5 w-3.5 shrink-0">
      <span className="absolute right-0 top-0 h-3 w-3 rounded-[4px] border" style={{ background: CLUSTER_COLOR.back, borderColor: CLUSTER_COLOR.backEdge }} />
      <span className="absolute bottom-0 left-0 h-3 w-3 rounded-[4px] border" style={{ background: CLUSTER_COLOR.face, borderColor: CLUSTER_COLOR.edge }} />
    </span>
  );
}

/** A press on the key must not reach the map underneath: it would start a drag or clear the selection. */
const keepOffMap = {
  onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  onDoubleClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
};

/**
 * The key: a compact white card at the bottom left of the map saying what the colours and markers mean. It follows the
 * layer on the map and is built from the same specs the map draws. The map decides whether it is open (see GeoMap: open on a
 * wide map unless a marker would sit under it, or as the reader chose) and reserves the room it needs (see map-layout.ts).
 */
export function MapKey({ layerMode, pins, open, compact, onToggle }: { layerMode: MapLayerMode; pins?: PinLegend | null; open: boolean; compact: boolean; onToggle: () => void }) {
  const items = legendItems(layerMode);
  const keyId = useId();
  const toggle = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={keyId}
      onClick={onToggle}
      data-testid="legend-toggle"
      title={open ? "Fold the key" : "Show the key"}
      className={
        open
          ? "absolute right-0.5 top-0.5 inline-flex size-6 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-muted hover:text-ink"
          : "inline-flex h-7 items-center gap-1 rounded-xl border border-line/60 bg-surface px-2.5 text-[0.6875rem] font-semibold text-ink shadow-float hover:bg-surface-muted"
      }
    >
      {open ? (
        <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 8 5 5 5-5" />
        </svg>
      ) : (
        <>
          Key
          <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 5-5 5 5" />
          </svg>
        </>
      )}
      <span className="sr-only">{open ? "Hide key" : "Show key"}</span>
    </button>
  );
  return (
    <div data-testid="map-key" className={cn("absolute bottom-3 z-[15] max-w-[calc(100%-1.5rem)]", compact ? "right-3" : "left-3")} {...keepOffMap}>
      {open ? (
        <div className="relative w-fit max-w-[14.5rem] rounded-xl border border-line/60 bg-surface py-2 pl-2.5 pr-7 text-[0.6875rem] leading-4 text-ink-muted shadow-float">
          <ul id={keyId} className="flex flex-col items-start gap-y-1" aria-label="Map legend" data-testid="legend-items">
            {items.map((item) => (
              <li key={item.key} className="flex items-center gap-1.5" title={item.title}>
                <span aria-hidden="true" className="inline-block h-2.5 w-3.5 shrink-0 rounded-sm ring-1 ring-ink/15" style={{ background: item.swatch }} />
                <span className="font-medium text-ink">{item.label}</span>
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2.5 w-3.5 shrink-0 rounded-sm border-[1.5px]" style={{ borderColor: SELECTED, background: "rgba(37,99,235,0.1)" }} />
              <span className="font-medium text-ink">Selected</span>
            </li>
            {pins ? (
              <>
                <li className="flex items-center gap-1.5" data-testid="legend-pins" title={`${pins.count} pins, each at a provisional position`}>
                  <PinSwatch />
                  <span className="font-medium text-ink">{pins.kind === "territory" ? "ASM pin, one per sales territory" : "Representative pin, one per block"}</span>
                </li>
                <li className="flex items-center gap-1.5" data-testid="legend-groups" title="Pins that would overlap are grouped; zoom in or open the group to see them one by one">
                  <GroupSwatch />
                  <span className="font-medium text-ink">Group of pins</span>
                </li>
              </>
            ) : null}
          </ul>
          {toggle}
        </div>
      ) : (
        toggle
      )}
    </div>
  );
}

/**
 * The line under the map: one sentence saying the outlines are provisional with the source attribution, and a disclosure
 * for the full wording. The attribution is required by the OpenStreetMap licence (ODbL) and stays visible whenever a layer
 * is shown, as does the statement that the outlines are provisional. The disclosure is collapsed by default and holds the
 * longer notices: how the outlines were tied to blocks, what a pin is, and how much of the reference list has an outline
 * and what has none, so the map never reads as complete.
 */
export function MapLegend({
  meta,
  coverage,
  pins,
}: {
  meta: BoundaryLayerMeta | null;
  coverage?: MapCoverage;
  pins?: PinLegend | null;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="space-y-1 text-[0.6875rem] leading-4 text-ink-muted" data-testid="map-legend">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p data-testid="map-attribution" className="min-w-0">
          <strong className="font-semibold text-ink">Outlines are provisional.</strong>{" "}
          {meta ? (
            <span>
              {meta.attribution} ({meta.licence}); snapshot {[...new Set(meta.snapshots.map((s) => s.slice(0, 10)))].join(", ")}.
            </span>
          ) : (
            <span>No boundary layer is loaded, so no geography is drawn.</span>
          )}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((on) => !on)}
          data-testid="map-about-toggle"
          className="inline-flex shrink-0 items-center gap-1 rounded text-primary-ink underline-offset-2 hover:underline"
        >
          About these outlines
          <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : undefined }}>
            <path d="m5 8 5 5 5-5" />
          </svg>
        </button>
      </div>
      <div id={panelId} hidden={!open} data-testid="map-about" className="space-y-1 rounded-lg bg-surface-muted/60 px-3 py-2 text-xs leading-5">
        <p>
          Each outline links a block in the reference list to a community-drawn boundary by exact name, and none has been reviewed. They are
          indicative, not an authoritative depiction of any border.
        </p>
        {pins ? (
          <p data-testid="legend-pins-note">
            A pin sits on the label point of a drawn block; it does not show where anyone is. Names come from the workbook and are not verified as people.
          </p>
        ) : null}
        {coverage ? (
          <p data-testid="map-coverage" className="border-l-2 border-warn pl-2">
            <strong className="font-semibold text-ink">Coverage is not complete.</strong>{" "}
            {meta
              ? `${coverage.blocksDrawn} of ${coverage.blocksTotal} blocks in the current reference list have provisional outlines, and ${coverage.districtsDrawn} of ${coverage.districtsTotal} districts; the rest show as dotted gaps, which are missing geography and not unallocated areas. `
              : `No outlines are loaded for the ${coverage.blocksTotal} blocks in the current reference list or its ${coverage.districtsTotal} districts. `}
            No ward or urban-body boundaries are drawn (Kolkata and Howrah wards have no source), and no outline has been checked against an authoritative source.{" "}
            <span data-testid="map-reference-note">{REFERENCE_LIST_NOTE}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
