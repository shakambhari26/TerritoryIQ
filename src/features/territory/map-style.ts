/**
 * One visual definition for the map: colours, hatch patterns, the three layers
 * and their legends. The SVG patterns and the legend swatches are generated from
 * the same specs, so a swatch can never drift from what the map draws.
 *
 * Rules the palette follows:
 *   - A light, neutral geographic canvas; white block strokes and slate district outlines keep every boundary
 *     readable, and dark labels carry a light halo. Blue is the selection, teal is "allocated", amber is conflicting
 *     data, and orange is reserved for representative pins, so none of them means anything else.
 *   - Colour is never the only cue: every state that is not plainly "has data"
 *     also has a pattern, and every pattern has a text label in the legend.
 *   - Two different things look different. A block whose allocation is missing
 *     (hatched diagonally, grey) is not the same as an area with no outline at
 *     all (dotted, no outline). Neither is ever drawn as "unallocated".
 */

import { ALLOCATION_STATES, ALLOCATION_STATE_LABEL, type AllocationState } from "./types.ts";
import { GEO_QUALITIES, GEO_QUALITY_LABEL, type GeoQuality } from "./quality.ts";

export type MapLayerMode = "boundaries" | "allocation" | "quality";

export const MAP_LAYERS: ReadonlyArray<{ value: MapLayerMode; label: string; hint: string }> = [
  { value: "boundaries", label: "Boundaries", hint: "Outlines and names only" },
  { value: "allocation", label: "Allocation status", hint: "Who covers each block" },
  { value: "quality", label: "Data quality", hint: "How well each block is tied to the workbook" },
];

/** The selection (primary blue), the representative pin (orange) and the faint teal lift around the state. */
export const SELECTED = "#2563EB";
export const MARKER = "#EA580C";
export const TEAL = "#0F8B78";

export const MAP_COLOR = {
  /** Warm off-white. The map is a flat sheet: no image, no gradient, no request. */
  canvas: "#f0eee8",
  /** Orientation only, and off until asked for. Quiet even when on, so the outlines stay the first thing the eye finds. */
  graticule: "rgba(107, 101, 88, 0.22)",
  graticuleText: "#7a7466",
  /** Warm paper steps, cycled over districts so neighbours read as separate regions without colour. */
  districtTints: ["#ebe8e0", "#e8e5dc", "#edeae3", "#e9e6de"],
  districtContext: "#eae7e0",
  /** Thin, muted warm grey: boundaries stay visible and understated. */
  districtLine: "#b4ae9f",
  districtLineStrong: "#6d675a",
  blockFill: "#f6f5f0",
  /** Block outlines on the boundaries layer, where the fill is almost white. */
  blockLine: "#cdc8bb",
  /** Block outlines on a status fill (allocation, data quality): white, so each block reads as its own cell. */
  blockLineOnFill: "#ffffff",
  ink: "#1c2433",
  inkSoft: "#5d5b54",
  /** The light halo behind every name and dot. */
  halo: "#f8f7f3",
  leader: "#8a857a",
  selectedCasing: "#ffffff",
  selected: SELECTED,
  selectedGlow: "rgba(37, 99, 235, 0.07)",
} as const;

/** The canvas is flat: kept as a name so the map and its tests share one definition. */
export const MAP_BACKDROP = "none";

/** Pin colours. Orange marks a representative; the white ring and core keep it legible on every fill. */
export const PIN_COLOR = {
  body: MARKER,
  bodyHover: "#f06a1f",
  ring: "#ffffff",
  core: "#ffffff",
  glow: "rgba(234, 88, 12, 0.3)",
  /** The selected marker: a dark outline around the same orange body. */
  selectedRing: "#1c2433",
  /** Territory pins whose ASM names disagree, or blocks claimed by several rows, get an amber ring, not a new colour. */
  contested: "#d97706",
} as const;

/**
 * A group of pins is neutral slate, never orange: orange means one representative, so a count on a badge cannot be
 * read as a person. The badge is also a different shape (a stacked card, not a teardrop).
 */
export const CLUSTER_COLOR = {
  face: "#ffffff",
  back: "#f1efe9",
  backEdge: "#c9c4b8",
  edge: "#6f6b61",
  edgeActive: "#1c2433",
  ink: "#1c2433",
  glow: "rgba(28, 36, 51, 0.28)",
} as const;

// ------------------------------------------------------------- patterns ----

export interface PatternSpec {
  id: string;
  kind: "diagonal" | "cross" | "vertical" | "dots";
  base: string;
  ink: string;
  /** Pattern tile size in screen pixels. */
  size: number;
  /** Stroke width, or dot radius, in screen pixels. */
  weight: number;
}

export const PATTERNS = {
  missing: { id: "pat-missing", kind: "diagonal", base: "#ece9e1", ink: "#b3ad9f", size: 6, weight: 1.2 },
  conflicting: { id: "pat-conflicting", kind: "cross", base: "#fbefd9", ink: "#d99a3a", size: 7, weight: 1.2 },
  variant: { id: "pat-variant", kind: "vertical", base: "#f6f0d6", ink: "#b99a35", size: 6, weight: 1.2 },
  gap: { id: "pat-gap", kind: "dots", base: "#f5f3ee", ink: "#c3bdaf", size: 8, weight: 1 },
} as const satisfies Record<string, PatternSpec>;

export const patternUrl = (spec: PatternSpec): string => `url(#${spec.id})`;

/** CSS background that mirrors a pattern, for legend swatches. */
export function patternSwatch(spec: PatternSpec): string {
  const { base, ink, kind, weight } = spec;
  switch (kind) {
    case "diagonal":
      return `repeating-linear-gradient(45deg,${base} 0 3px,${ink} 3px ${3 + weight}px)`;
    case "cross":
      return `repeating-linear-gradient(45deg,${base} 0 3px,${ink} 3px ${3 + weight}px),repeating-linear-gradient(-45deg,transparent 0 3px,${ink} 3px ${3 + weight}px)`;
    case "vertical":
      return `repeating-linear-gradient(90deg,${base} 0 3px,${ink} 3px ${3 + weight}px)`;
    case "dots":
      return `radial-gradient(circle at 50% 50%,${ink} 0 ${weight}px,transparent ${weight + 0.5}px) 0 0/5px 5px,${base}`;
  }
}

// ----------------------------------------------------------------- fills ----

export const ALLOCATION_FILL: Readonly<Record<AllocationState, string>> = {
  allocated: "#9bcdb9",
  confirmed_unallocated: "#a6bde6",
  missing: patternUrl(PATTERNS.missing),
  conflicting: patternUrl(PATTERNS.conflicting),
};

export const QUALITY_FILL: Readonly<Record<GeoQuality, string>> = {
  reviewed: "#8e9ddb",
  provisional: "#c6cfee",
  contested: patternUrl(PATTERNS.conflicting),
  variant: patternUrl(PATTERNS.variant),
  unlisted: patternUrl(PATTERNS.missing),
};

export const ALLOCATION_SWATCH: Readonly<Record<AllocationState, string>> = {
  allocated: ALLOCATION_FILL.allocated,
  confirmed_unallocated: ALLOCATION_FILL.confirmed_unallocated,
  missing: patternSwatch(PATTERNS.missing),
  conflicting: patternSwatch(PATTERNS.conflicting),
};

const QUALITY_SWATCH: Readonly<Record<GeoQuality, string>> = {
  reviewed: QUALITY_FILL.reviewed,
  provisional: QUALITY_FILL.provisional,
  contested: patternSwatch(PATTERNS.conflicting),
  variant: patternSwatch(PATTERNS.variant),
  unlisted: patternSwatch(PATTERNS.missing),
};

// --------------------------------------------------------------- legends ----

export interface LegendItem {
  key: string;
  label: string;
  /** CSS `background` for the swatch. */
  swatch: string;
  /** Extra words for the tooltip. */
  title?: string;
}

const GAP_ITEM: LegendItem = {
  key: "gap",
  label: "No outline available",
  swatch: patternSwatch(PATTERNS.gap),
  title: "Part of the district with no block outline in the data. This is missing geography, not an unallocated area.",
};

export function legendItems(mode: MapLayerMode): LegendItem[] {
  if (mode === "allocation") {
    return [
      ...ALLOCATION_STATES.map((state) => ({ key: state, label: ALLOCATION_STATE_LABEL[state], swatch: ALLOCATION_SWATCH[state] })),
      GAP_ITEM,
    ];
  }
  if (mode === "quality") {
    return [
      ...GEO_QUALITIES.map((quality) => ({ key: quality, label: GEO_QUALITY_LABEL[quality], swatch: QUALITY_SWATCH[quality] })),
      GAP_ITEM,
    ];
  }
  return [
    { key: "district", label: "District", swatch: MAP_COLOR.districtTints[0] },
    { key: "block", label: "Block outline (provisional)", swatch: MAP_COLOR.blockFill },
    GAP_ITEM,
  ];
}

/** Stable tint for a district, so it keeps its shade across renders and layers. */
export function districtTint(lgdCode: number): string {
  const tints = MAP_COLOR.districtTints;
  return tints[Math.abs(Math.trunc(lgdCode)) % tints.length];
}
