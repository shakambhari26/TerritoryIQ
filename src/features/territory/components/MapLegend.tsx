import { EMBER, PIN_COLOR, legendItems, type MapLayerMode } from "../map-style";
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
    <svg aria-hidden="true" focusable="false" viewBox="0 0 28 36" width="11" height="14" className="shrink-0 overflow-visible">
      <path d="M14 35C14 35 3 22.5 3 13.5a11 11 0 1 1 22 0C25 22.5 14 35 14 35Z" fill={PIN_COLOR.body} stroke={PIN_COLOR.ring} strokeWidth="2" />
      <circle cx="14" cy="13.5" r="4.2" fill={PIN_COLOR.core} />
    </svg>
  );
}

/**
 * Legend and notices under the map, in three tiers: what the colours mean (read first), what the markers are, and
 * the provisional-boundary and coverage warnings (quieter, never removed). The legend follows the layer on the
 * map and is built from the same specs the map draws. The attribution is required by the OpenStreetMap licence
 * (ODbL) and stays visible whenever a layer is shown. The coverage line says how much of the official geography
 * has an outline and what has none, so the map never reads as complete.
 */
export function MapLegend({
  meta,
  coverage,
  layerMode,
  pins,
}: {
  meta: BoundaryLayerMeta | null;
  coverage?: MapCoverage;
  layerMode: MapLayerMode;
  pins?: PinLegend | null;
}) {
  const items = legendItems(layerMode);
  return (
    <div className="space-y-2 px-3 py-2.5 text-[0.6875rem] leading-4 text-ink-muted sm:px-4 sm:text-xs sm:leading-5" data-testid="map-legend">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Map legend" data-testid="legend-items">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5" title={item.title}>
            <span aria-hidden="true" className="inline-block h-3 w-4 shrink-0 rounded-sm border border-white/25" style={{ background: item.swatch }} />
            <span className="font-medium text-ink">{item.label}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-4 shrink-0 rounded-sm border-2" style={{ borderColor: EMBER, background: "rgba(232,98,42,0.16)" }} />
          <span className="font-medium text-ink">Selected</span>
        </li>
        {pins ? (
          <li className="flex items-center gap-1.5" data-testid="legend-pins">
            <PinSwatch />
            <span className="font-medium text-ink">
              {pins.kind === "territory" ? "ASM pin, one per sales territory" : "Representative pin, one per block"}
            </span>
            <span className="text-ink-subtle">({pins.count}, provisional position)</span>
          </li>
        ) : null}
      </ul>
      <div className="space-y-1 border-t border-line pt-2 text-ink-muted">
        <p>
          Outlines are <strong className="font-semibold text-ink">provisional</strong>: each links an official block to a community-drawn boundary
          by exact name, and none has been reviewed. They are indicative, not an authoritative depiction of any border.{" "}
          {meta ? (
            <span>
              {meta.attribution} ({meta.licence}); snapshot {[...new Set(meta.snapshots.map((s) => s.slice(0, 10)))].join(", ")}.
            </span>
          ) : (
            <span>No boundary layer is loaded, so no geography is drawn.</span>
          )}
        </p>
        {pins ? (
          <p data-testid="legend-pins-note">
            A pin sits on the label point of a drawn block; it does not show where anyone is. Names come from the workbook and are not verified as people.
          </p>
        ) : null}
        {coverage ? (
          <p data-testid="map-coverage" className="border-l-2 border-amber-400/60 pl-2">
            <strong className="font-semibold text-ink">Coverage is not complete.</strong>{" "}
            {meta
              ? `Outlines exist for ${coverage.districtsDrawn} of ${coverage.districtsTotal} districts and ${coverage.blocksDrawn} of ${coverage.blocksTotal} official blocks; the rest show as dotted gaps, which are missing geography and not unallocated areas. `
              : `No outlines are loaded for the ${coverage.districtsTotal} districts and ${coverage.blocksTotal} official blocks. `}
            No ward or urban-body boundaries are drawn (Kolkata and Howrah wards have no source), and no outline has been checked against an authoritative source.
          </p>
        ) : null}
      </div>
    </div>
  );
}
