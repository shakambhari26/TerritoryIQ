/**
 * Staffing on the globe: how many people work in a place, as a colour, so management can see where to hire.
 *
 * One scale for every level. A block is coloured by the number of distinct people working in it; a district by the
 * average of its blocks (so a district with many blocks is not "well staffed" just because it is big). Pure.
 */

import type { GlobeManifest, ManifestBlock, ManifestDistrict } from "./types";

/** How one outline is painted (the renderer's FeaturePaint, declared here so this module does not import the renderer). */
export interface FeaturePaint {
  fill: string;
  fillOpacity: number;
  edgeScale: number;
  muted: boolean;
}

export interface StaffBand {
  key: "low" | "few" | "good" | "many";
  /** People per block, from (inclusive). */
  from: number;
  label: string;
  colour: string;
}

/** Lowest first. A value belongs to the last band whose `from` it reaches. */
export const STAFF_BANDS: readonly StaffBand[] = [
  // Warm = short of people, cool = well staffed; stepped in lightness too. Validated colour-blind safe with the dataviz
  // validator (adjacent CVD ΔE ≥ 18); always shown with a text label.
  { key: "low", from: 0, label: "1–2 people · hire here", colour: "#c62828" },
  { key: "few", from: 2.5, label: "3 people", colour: "#eb8c3f" },
  { key: "good", from: 3.5, label: "4 people", colour: "#5598e7" },
  { key: "many", from: 4.5, label: "5 or more people", colour: "#184f95" },
];

/** Grey for a district the sheet does not list. */
export const NOT_IN_SHEET = "#8796b0";

export function bandFor(peoplePerBlock: number): StaffBand {
  let band = STAFF_BANDS[0];
  for (const candidate of STAFF_BANDS) if (peoplePerBlock >= candidate.from) band = candidate;
  return band;
}

/** Average people per block in a district, or null when the sheet lists no block there. */
export function districtAverage(district: ManifestDistrict, blocks: readonly ManifestBlock[]): number | null {
  const mine = blocks.filter((b) => b.districtId === district.id);
  return mine.length ? mine.reduce((n, b) => n + b.staff, 0) / mine.length : null;
}

/** The sheet's roles, with their full names. */
export const ROLE_NAME: Record<string, string> = {
  ASM: "Area Sales Manager",
  PRIMARY: "Primary Sales Officer",
  SECONDARY: "Secondary Sales Officer",
  DSO: "Distributor Sales Officer",
};
export const ROLE_ORDER = ["ASM", "PRIMARY", "SECONDARY", "DSO"] as const;
/** Validated categorical slots (all pairs pass the CVD check); a role is always also written next to its colour. */
export const ROLE_COLOUR: Record<string, string> = {
  ASM: "#2a78d6",
  PRIMARY: "#008300",
  SECONDARY: "#e87ba4",
  DSO: "#eda100",
};

/** The filter under the map: a headcount band (or "ASM only": no field staff), and optionally one district. */
export interface StaffFilter {
  band: StaffBand["key"] | "asm-only" | null;
  districtId: string | null;
}
export const NO_FILTER: StaffFilter = { band: null, districtId: null };
export const filterActive = (f: StaffFilter) => f.band !== null || f.districtId !== null;

export function matchesFilter(block: ManifestBlock, filter: StaffFilter): boolean {
  if (filter.districtId && block.districtId !== filter.districtId) return false;
  if (filter.band === "asm-only") return block.fieldStaff === 0;
  if (filter.band) return bandFor(block.staff).key === filter.band;
  return true;
}

/** Map paint: every block by its headcount, every district by its average. With a filter, other blocks fade out. */
export function staffPaint(manifest: GlobeManifest, filter: StaffFilter = NO_FILTER): Map<string, FeaturePaint> {
  const paint = new Map<string, FeaturePaint>();
  const active = filterActive(filter);
  for (const block of manifest.blocks) {
    const hit = !active || matchesFilter(block, filter);
    paint.set(`block:${block.id}`, hit ? { fill: bandFor(block.staff).colour, fillOpacity: 0.72, edgeScale: 1, muted: false } : { fill: NOT_IN_SHEET, fillOpacity: 0.12, edgeScale: 0.4, muted: true });
  }
  for (const district of manifest.districts) {
    const average = districtAverage(district, manifest.blocks);
    paint.set(`district:${district.id}`, {
      fill: average === null ? NOT_IN_SHEET : bandFor(average).colour,
      fillOpacity: average === null ? 0.35 : 0.62,
      edgeScale: 1,
      muted: false,
    });
  }
  return paint;
}
