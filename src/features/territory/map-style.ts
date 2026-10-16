/**
 * One visual definition for the map: colours, hatch patterns, the three layers
 * and their legends. The SVG patterns and the legend swatches are generated from
 * the same specs, so a swatch can never drift from what the map draws.
 *
 * Rules the palette follows:
 *   - Deep navy surfaces with restrained fills; outlines and labels carry the map. Molten Orange is kept for
 *     the selection and the representative pins, and teal for assigned areas, so neither means anything else.
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

/** Molten Orange (selected regions, representative pins) and the subtle teal for assigned areas. */
export const EMBER = "#E8622A";
export const TEAL = "#14B8A6";

export const MAP_COLOR = {
  /** Deep navy. A soft lift behind the state (see `MAP_BACKDROP`) keeps the canvas from reading as a flat slab. */
  canvas: "#0b1220",
  /** Orientation only, and off until asked for. Quiet even when on, so the outlines stay the first thing the eye finds. */
  graticule: "rgba(140, 160, 200, 0.17)",
  graticuleText: "#8a9bbd",
  /** Quiet navy steps, cycled over districts so neighbours read as separate regions without colour. */
  districtTints: ["#14213b", "#162441", "#122039", "#15233e"],
  districtContext: "#101b31",
  districtLine: "#41557f",
  districtLineStrong: "#b4c4e6",
  blockFill: "#1b2a47",
  blockLine: "#5b7099",
  ink: "#eef3fb",
  inkSoft: "#b9c6de",
  halo: "#0b1220",
  leader: "#8fa0bf",
  selectedCasing: "#0b1220",
  selected: EMBER,
  selectedGlow: "rgba(232, 98, 42, 0.16)",
} as const;

/** The canvas: a lifted navy centre fading to the edge, with no image and no request. */
export const MAP_BACKDROP = "radial-gradient(125% 95% at 50% 42%, #16233f 0%, #0f1a30 48%, #0b1220 100%)";

/** Pin colours. Orange marks a representative; the dark core and ring keep it legible on every fill. */
export const PIN_COLOR = {
  body: EMBER,
  bodyHover: "#f0763f",
  ring: "#0b1220",
  core: "#0b1220",
  glow: "rgba(232, 98, 42, 0.45)",
  /** Territory pins whose ASM names disagree, or blocks claimed by several rows, get an amber ring, not a new colour. */
  contested: "#f2b84b",
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
  missing: { id: "pat-missing", kind: "diagonal", base: "#1c2944", ink: "#6c80a8", size: 6, weight: 1.2 },
  conflicting: { id: "pat-conflicting", kind: "cross", base: "#4d3a12", ink: "#f2b84b", size: 7, weight: 1.3 },
  variant: { id: "pat-variant", kind: "vertical", base: "#3a3216", ink: "#d2aa3a", size: 6, weight: 1.3 },
  gap: { id: "pat-gap", kind: "dots", base: "#0f1a2f", ink: "#4d6089", size: 8, weight: 1.05 },
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
  allocated: "#147a74",
  confirmed_unallocated: "#3a62b0",
  missing: patternUrl(PATTERNS.missing),
  conflicting: patternUrl(PATTERNS.conflicting),
};

export const QUALITY_FILL: Readonly<Record<GeoQuality, string>> = {
  reviewed: "#5667d6",
  provisional: "#2b3a78",
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
