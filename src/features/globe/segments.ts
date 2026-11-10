/**
 * Segmenting the globe: a faceted filter over the blocks plus a "colour by", turned into paint for the renderer.
 *
 * Everything here is computed from what the page already holds (the name-free manifest, the Overview-derived
 * insights and the customer counts), so segmenting adds no request and exposes no name. Within one facet the values
 * are alternatives (OR); across facets they all must hold (AND). Each facet value shows how many blocks it would
 * leave given every OTHER facet, the usual faceted-search count, so a choice that empties the map is visible first.
 *
 * The map reflects the segment directly: blocks in it keep their colour, blocks outside it fade to a ghost outline
 * with no label, and districts are shaded by how many of their blocks are in the segment.
 *
 * Pure: no I/O and no DOM, so tests run it on synthetic data.
 */

import { ALLOCATION_STATE_LABEL, ALLOCATION_STATES, type AllocationState } from "../territory/types.ts";
import { CUSTOMER_TYPES, type CustomerSummary, type CustomerType } from "./customers.ts";
import type { GlobeInsights } from "./insights.ts";
import { BLOCK_STYLE, DISTRICT_STYLE, NEUTRAL } from "./styles.ts";
import type { GlobeManifest, UnitState } from "./types.ts";

// ------------------------------------------------------------------ facts --

export type StaffingFacet = "named" | "vacant" | "none";
export type CustomerFacet = CustomerType | "none";

/** What one block is, along every dimension the filter can cut. */
export interface BlockFacts {
  id: string;
  name: string;
  districtId: string | null;
  link: UnitState;
  /** Null when the insights were not built. */
  allocation: AllocationState | null;
  named: number;
  vacant: number;
  customers: number;
  customerTypes: CustomerType[];
  contested: boolean;
  /** Whether a validated outline exists, so it can be drawn. */
  drawn: boolean;
}

export function buildBlockFacts(manifest: GlobeManifest, insights: GlobeInsights | null, customers: CustomerSummary | null): BlockFacts[] {
  return manifest.blocks.map((b) => {
    const insight = insights?.blocks[b.id];
    const count = customers?.blocks[b.id];
    return {
      id: b.id,
      name: b.name,
      districtId: b.districtId,
      link: b.state,
      allocation: insight?.state ?? null,
      named: insight?.staff.named ?? 0,
      vacant: insight?.staff.vacant ?? 0,
      customers: count?.total ?? 0,
      customerTypes: CUSTOMER_TYPES.filter((t) => (count?.byType[t] ?? 0) > 0),
      contested: b.contested,
      drawn: b.geometry !== null,
    };
  });
}

// ----------------------------------------------------------------- filter --

export const FACETS = ["districts", "link", "allocation", "staffing", "customers"] as const;
export type FacetKey = (typeof FACETS)[number];

export interface SegmentFilter {
  /** Empty means every district. */
  districts: readonly string[];
  link: readonly UnitState[];
  allocation: readonly AllocationState[];
  staffing: readonly StaffingFacet[];
  customers: readonly CustomerFacet[];
  contestedOnly: boolean;
  drawnOnly: boolean;
}

export const EMPTY_FILTER: SegmentFilter = { districts: [], link: [], allocation: [], staffing: [], customers: [], contestedOnly: false, drawnOnly: false };

export function filterActive(filter: SegmentFilter): boolean {
  return FACETS.some((k) => filter[k].length > 0) || filter.contestedOnly || filter.drawnOnly;
}

/** How many separate choices the filter holds (for a badge). */
export function filterSize(filter: SegmentFilter): number {
  return FACETS.reduce((n, k) => n + filter[k].length, 0) + (filter.contestedOnly ? 1 : 0) + (filter.drawnOnly ? 1 : 0);
}

/** The values one block takes in a facet. A block can take several (named AND vacant slots; several customer types). */
export function facetValues(fact: BlockFacts, key: FacetKey): string[] {
  switch (key) {
    case "districts":
      return fact.districtId ? [fact.districtId] : [];
    case "link":
      return [fact.link];
    case "allocation":
      return fact.allocation ? [fact.allocation] : [];
    case "staffing": {
      const values: StaffingFacet[] = [];
      if (fact.named > 0) values.push("named");
      if (fact.vacant > 0) values.push("vacant");
      if (values.length === 0) values.push("none");
      return values;
    }
    case "customers":
      return fact.customerTypes.length > 0 ? [...fact.customerTypes] : ["none"];
  }
}

function matchesFacet(fact: BlockFacts, key: FacetKey, chosen: readonly string[]): boolean {
  if (chosen.length === 0) return true;
  return facetValues(fact, key).some((v) => chosen.includes(v));
}

function matchesExcept(fact: BlockFacts, filter: SegmentFilter, skip: FacetKey | null): boolean {
  if (filter.contestedOnly && !fact.contested) return false;
  if (filter.drawnOnly && !fact.drawn) return false;
  return FACETS.every((key) => key === skip || matchesFacet(fact, key, filter[key]));
}

export function matches(fact: BlockFacts, filter: SegmentFilter): boolean {
  return matchesExcept(fact, filter, null);
}

export interface SegmentResult {
  active: boolean;
  matched: Set<string>;
  total: number;
  /** Per district: blocks in the segment, and all blocks. */
  byDistrict: Map<string, { matched: number; total: number }>;
  /** For each facet value, the blocks it would leave with every other facet as it is. */
  facetCounts: Record<FacetKey, Map<string, number>>;
  /** Blocks in the segment that are flagged contested, have no outline, etc., for the summary line. */
  undrawnMatched: number;
}

export function segment(facts: readonly BlockFacts[], filter: SegmentFilter): SegmentResult {
  const matched = new Set<string>();
  const byDistrict = new Map<string, { matched: number; total: number }>();
  const facetCounts = Object.fromEntries(FACETS.map((k) => [k, new Map<string, number>()])) as Record<FacetKey, Map<string, number>>;
  let undrawnMatched = 0;
  for (const fact of facts) {
    const inSegment = matches(fact, filter);
    if (inSegment) {
      matched.add(fact.id);
      if (!fact.drawn) undrawnMatched++;
    }
    if (fact.districtId) {
      const entry = byDistrict.get(fact.districtId) ?? { matched: 0, total: 0 };
      entry.total++;
      if (inSegment) entry.matched++;
      byDistrict.set(fact.districtId, entry);
    }
    for (const key of FACETS) {
      if (!matchesExcept(fact, filter, key)) continue;
      const counts = facetCounts[key];
      for (const value of facetValues(fact, key)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return { active: filterActive(filter), matched, total: facts.length, byDistrict, facetCounts, undrawnMatched };
}

// ----------------------------------------------------------- facet labels --

export const LINK_LABEL: Record<UnitState, string> = {
  represented: "Provisional rep link",
  unresolved: "Unresolved",
  "no-representative": "Confirmed: no rep",
};

export const STAFFING_LABEL: Record<StaffingFacet, string> = {
  named: "Has a named person",
  vacant: "Has an open slot",
  none: "No slots listed",
};

export const CUSTOMER_LABEL: Record<CustomerFacet, string> = {
  Dealer: "Dealer",
  Retailer: "Retailer",
  Mason: "Mason",
  IHB: "IHB",
  none: "None placed",
};

export const ALLOCATION_LABEL = ALLOCATION_STATE_LABEL;
export const ALLOCATION_ORDER = ALLOCATION_STATES;
export const LINK_ORDER: readonly UnitState[] = ["represented", "unresolved", "no-representative"];
export const STAFFING_ORDER: readonly StaffingFacet[] = ["named", "vacant", "none"];
export const CUSTOMER_ORDER: readonly CustomerFacet[] = [...CUSTOMER_TYPES, "none"];

// ------------------------------------------------------------------ paint --

export type ColourBy = "link" | "allocation" | "staffing";

export const COLOUR_BY_LABEL: Record<ColourBy, string> = {
  link: "Rep link",
  allocation: "Allocation",
  staffing: "Staffing",
};

export const ALLOCATION_COLOUR: Record<AllocationState, string> = {
  allocated: "#0e9f6e",
  confirmed_unallocated: "#e3a008",
  missing: NEUTRAL,
  conflicting: "#d6336c",
};

export const STAFFING_COLOUR = {
  staffed: "#3d6fe0",
  open: "#ea6c1f",
  none: NEUTRAL,
} as const;

type StaffingBand = keyof typeof STAFFING_COLOUR;

export const STAFFING_BAND_LABEL: Record<StaffingBand, string> = {
  staffed: "Every slot has a named person",
  open: "At least one open slot",
  none: "No slots listed",
};

function staffingBand(fact: BlockFacts): StaffingBand {
  if (fact.vacant > 0) return "open";
  if (fact.named > 0) return "staffed";
  return "none";
}

/** Districts, shaded by blocks in the segment: light to deep indigo. */
const DISTRICT_RAMP = ["#dbe4f7", "#a9bdf0", "#7393e4", "#4469d1", "#27459f"] as const;

export function districtRampColour(matched: number, max: number): string {
  if (matched <= 0 || max <= 0) return NEUTRAL;
  const t = Math.min(1, matched / max);
  return DISTRICT_RAMP[Math.min(DISTRICT_RAMP.length - 1, Math.floor(t * (DISTRICT_RAMP.length - 1e-9)))];
}

export const DISTRICT_RAMP_COLOURS = DISTRICT_RAMP;

export interface PaintEntry {
  fill: string;
  fillOpacity: number;
  edgeScale: number;
  muted: boolean;
}

const GHOST: PaintEntry = { fill: NEUTRAL, fillOpacity: 0.07, edgeScale: 0.35, muted: true };

function blockColour(fact: BlockFacts, by: ColourBy): { fill: string; fillOpacity: number } {
  if (by === "allocation") return { fill: fact.allocation ? ALLOCATION_COLOUR[fact.allocation] : NEUTRAL, fillOpacity: 0.8 };
  if (by === "staffing") return { fill: STAFFING_COLOUR[staffingBand(fact)], fillOpacity: 0.8 };
  const style = BLOCK_STYLE[fact.link];
  return { fill: style.fill, fillOpacity: style.fillOpacity };
}

/**
 * The renderer's paint, keyed `${kind}:${id}`, or null when nothing is segmented and the colours are the plain
 * provisional-link ones (the renderer then draws exactly what it drew before segmenting existed).
 */
export function buildPaint(manifest: GlobeManifest, facts: readonly BlockFacts[], result: SegmentResult, by: ColourBy): Map<string, PaintEntry> | null {
  if (!result.active && by === "link") return null;
  const paint = new Map<string, PaintEntry>();
  for (const fact of facts) {
    if (!result.matched.has(fact.id)) {
      paint.set(`block:${fact.id}`, GHOST);
      continue;
    }
    paint.set(`block:${fact.id}`, { ...blockColour(fact, by), edgeScale: 1, muted: false });
  }
  if (result.active) {
    // Districts become a choropleth of the segment: the more of its blocks are in it, the deeper the shade.
    const max = Math.max(0, ...[...result.byDistrict.values()].map((d) => d.matched));
    for (const d of manifest.districts) {
      const matched = result.byDistrict.get(d.id)?.matched ?? 0;
      paint.set(`district:${d.id}`, matched > 0 ? { fill: districtRampColour(matched, max), fillOpacity: 0.72, edgeScale: 1, muted: false } : { ...GHOST, fillOpacity: 0.1 });
    }
  } else {
    // Colour by, with no filter: districts keep their own provisional-link colour.
    for (const d of manifest.districts) {
      const style = DISTRICT_STYLE[d.state];
      paint.set(`district:${d.id}`, { fill: style.fill, fillOpacity: style.fillOpacity, edgeScale: 1, muted: false });
    }
  }
  return paint;
}

/** The highest number of blocks any district has in the segment, for the legend's ramp. */
export function maxDistrictMatches(result: SegmentResult): number {
  return Math.max(0, ...[...result.byDistrict.values()].map((d) => d.matched));
}

export interface LegendRow {
  colour: string;
  label: string;
  note?: string;
  ring?: boolean;
}

/** Legend rows for the blocks under a "colour by". */
export function blockLegend(by: ColourBy): LegendRow[] {
  if (by === "allocation") return ALLOCATION_STATES.map((s) => ({ colour: ALLOCATION_COLOUR[s], label: `Block: ${ALLOCATION_STATE_LABEL[s]}` }));
  if (by === "staffing") return (Object.keys(STAFFING_COLOUR) as StaffingBand[]).map((b) => ({ colour: STAFFING_COLOUR[b], label: `Block: ${STAFFING_BAND_LABEL[b]}` }));
  return [
    { colour: BLOCK_STYLE.represented.fill, label: "Block: provisional link", note: "named representative, unreviewed" },
    { colour: BLOCK_STYLE.unresolved.fill, label: "Block: unresolved or unverified", note: "not the same as none" },
  ];
}

// ------------------------------------------------------------- URL state --

/** A compact, shareable form of the filter and colour for the address bar (`?seg=`). */
export function encodeSegment(filter: SegmentFilter, by: ColourBy): string {
  const parts: string[] = [];
  for (const key of FACETS) if (filter[key].length > 0) parts.push(`${key}:${filter[key].join(",")}`);
  if (filter.contestedOnly) parts.push("contested:1");
  if (filter.drawnOnly) parts.push("drawn:1");
  if (by !== "link") parts.push(`by:${by}`);
  return parts.join(";");
}

export function decodeSegment(text: string, known: { districts: ReadonlySet<string> }): { filter: SegmentFilter; by: ColourBy } {
  const filter: { -readonly [K in keyof SegmentFilter]: SegmentFilter[K] } = { ...EMPTY_FILTER };
  let by: ColourBy = "link";
  const allowed: Record<FacetKey, (v: string) => boolean> = {
    districts: (v) => known.districts.has(v),
    link: (v) => (LINK_ORDER as readonly string[]).includes(v),
    allocation: (v) => (ALLOCATION_STATES as readonly string[]).includes(v),
    staffing: (v) => (STAFFING_ORDER as readonly string[]).includes(v),
    customers: (v) => (CUSTOMER_ORDER as readonly string[]).includes(v),
  };
  for (const part of text.split(";")) {
    const at = part.indexOf(":");
    if (at < 0) continue;
    const key = part.slice(0, at);
    const value = part.slice(at + 1);
    if ((FACETS as readonly string[]).includes(key)) {
      const k = key as FacetKey;
      const values = [...new Set(value.split(",").filter(allowed[k]))];
      (filter as Record<FacetKey, readonly string[]>)[k] = values;
    } else if (key === "contested") filter.contestedOnly = value === "1";
    else if (key === "drawn") filter.drawnOnly = value === "1";
    else if (key === "by" && (value === "allocation" || value === "staffing" || value === "link")) by = value;
  }
  return { filter, by };
}
