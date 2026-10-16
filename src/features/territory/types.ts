/**
 * Domain types for the territory prototype.
 *
 * Four things are kept apart and never merged by a join on a label:
 *   1. the company's sales territories and the workbook rows that list blocks
 *      under them (`SalesTerritory`, `TerritoryUnit`);
 *   2. official geographic units from the Local Government Directory
 *      (`GeoFeature`);
 *   3. the explicit, reviewable link between the two (`CrosswalkEntry`);
 *   4. boundary geometry from an external source (see `BoundaryLayer`).
 *
 * The workbook's `DISTRICT` column is a sales-territory label (B-23). It is
 * carried on `SalesTerritory.label` and is never an input to geographic
 * matching.
 */

// ---------------------------------------------------------------- staffing --

export type StaffRole = "ASM" | "PRIMARY" | "SECONDARY" | "DSO";

export const STAFF_ROLES: readonly StaffRole[] = [
  "ASM",
  "PRIMARY",
  "SECONDARY",
  "DSO",
];

/** Slots per role in the workbook layout (columns C to N). */
export const ROLE_CAPACITY: Readonly<Record<StaffRole, number>> = {
  ASM: 1,
  PRIMARY: 3,
  SECONDARY: 5,
  DSO: 3,
};

export const ROLE_LABEL: Readonly<Record<StaffRole, string>> = {
  ASM: "ASM",
  PRIMARY: "Primary",
  SECONDARY: "Secondary",
  DSO: "DSO",
};

/**
 * `named`: a person is listed. `vacant`: the workbook (or a local change)
 * says `Vacant`. A blank slot is not stored; blank never means vacant.
 */
export type SlotStatus = "named" | "vacant";

export interface StaffSlot {
  role: StaffRole;
  /** 1-based position within the role. */
  slot: number;
  status: SlotStatus;
  /** Trimmed names. Two for an ASM cell written `A / B`; empty when vacant. */
  names: string[];
}

export type UnitFlag =
  /** The ASM cell names two people separated by `/` (meaning undecided, B-21). */
  | "asm-two-names"
  /** The block label contains an en dash. */
  | "label-en-dash"
  /** The block label contains a non-breaking space. */
  | "label-nbsp"
  /** One or more slot cells hold only whitespace (treated as blank). */
  | "whitespace-only-cells";

export interface TerritoryUnit {
  /** Internal ID, e.g. `TU-001`. Stable across re-reads of the same workbook. */
  id: string;
  /** Workbook row number (header is row 1). */
  sourceRow: number;
  salesTerritoryId: string;
  /** Block or area label exactly as written (not trimmed or normalised). */
  blockLabel: string;
  /** Non-blank slots only. Absent slots are blank. */
  slots: StaffSlot[];
  flags: UnitFlag[];
}

export interface SalesTerritory {
  /** Internal ID, e.g. `ST-01`. */
  id: string;
  /** The workbook `DISTRICT` label, verbatim. Context only; see B-23. */
  label: string;
  unitIds: string[];
}

// --------------------------------------------------------------- geography --

export type GeoKind = "district" | "block";

export interface GeoFeature {
  /** Internal ID: `GD-<LGD district code>` or `GB-<LGD block code>`. */
  id: string;
  kind: GeoKind;
  /** Official LGD code. */
  lgdCode: number;
  /** Official name exactly as the LGD report prints it. */
  name: string;
  /** Parent district feature for a block; null for a district. */
  districtId: string | null;
  /** Number of village rows the LGD block report lists (blocks only). */
  villageRows: number | null;
  /** Link to a boundary source feature, if one was justified. */
  boundary: BoundaryLink | null;
  /** Why no boundary is available, when `boundary` is null. */
  boundaryGap: string | null;
}

export interface BoundaryLink {
  source: "osm";
  /** OpenStreetMap relation ID. */
  relationId: number;
  /** Name carried by the source feature. */
  sourceName: string;
  /** How the source feature was tied to the official unit. */
  basis: "lgd-district-code" | "name-and-district-containment";
}

export type MatchTier = "T1" | "T2" | "T3" | "T4";

export interface FeatureCandidate {
  featureId: string;
  tier: MatchTier;
  /** Similarity score for T4 candidates, otherwise null. */
  score: number | null;
}

/**
 * How far a workbook row's block label is linked to official geography.
 *   provisional: exactly one exact-name candidate block, unreviewed;
 *   ambiguous:   several exact-name candidates, or a district-type match;
 *   weak:        only structural or spelling-variant candidates;
 *   none:        no candidate at any tier.
 */
export type LinkStatus = "provisional" | "ambiguous" | "weak" | "none";

export type ReviewStatus = "open" | "confirmed" | "held" | "excluded";

export interface CrosswalkEntry {
  unitId: string;
  status: LinkStatus;
  /** The one official feature the row is linked to; set only when `provisional`. */
  featureId: string | null;
  /** Every plausible candidate, none selected unless `featureId` is set. */
  candidates: FeatureCandidate[];
  /** Plain-language justification, or the reason there is no link. */
  reason: string;
}

// ----------------------------------------------------------- allocation ----

/**
 * The four allocation states kept distinct (requester preference, B-28).
 * Missing data never becomes `confirmed_unallocated`.
 */
export type AllocationState =
  | "allocated"
  | "confirmed_unallocated"
  | "missing"
  | "conflicting";

export const ALLOCATION_STATES: readonly AllocationState[] = [
  "allocated",
  "confirmed_unallocated",
  "missing",
  "conflicting",
];

export const ALLOCATION_STATE_LABEL: Readonly<Record<AllocationState, string>> =
  {
    allocated: "Allocated",
    confirmed_unallocated: "Confirmed unallocated",
    missing: "Missing / unverified",
    conflicting: "Conflicting data",
  };

// -------------------------------------------------------------- dataset ----

export interface SourceFileRecord {
  file: string;
  sha256: string;
  bytes: number;
}

export interface DatasetMeta {
  generatedAt: string;
  workbook: SourceFileRecord & { dataRows: number };
  lgdDistricts: SourceFileRecord & { reportGenerated: string };
  lgdBlocks: SourceFileRecord & { reportGenerated: string; villageRows: number };
  /** How the crosswalk was produced, so counts can be reproduced. */
  matching: {
    protocol: string;
    exactTierRows: number;
    provisionalRows: number;
    ambiguousRows: number;
    weakRows: number;
    noneRows: number;
  };
}

export interface TerritoryDataset {
  meta: DatasetMeta;
  salesTerritories: SalesTerritory[];
  units: TerritoryUnit[];
  features: GeoFeature[];
  crosswalk: CrosswalkEntry[];
}

// ------------------------------------------------------------- boundary ----

export interface BoundaryShape {
  /** `GeoFeature.id` this shape draws. */
  featureId: string;
  /** SVG path data in the layer's planar coordinates. */
  d: string;
  /** Bounding box [minX, minY, maxX, maxY] in the same coordinates. */
  bbox: [number, number, number, number];
  /**
   * Label position [x, y, r]: a point inside the drawn shape and the radius of the largest circle around it
   * that fits. It positions text only. Optional so a layer built before it existed still loads; the map then
   * falls back to the middle of the bounding box.
   */
  anchor?: [number, number, number];
}

export interface BoundaryLayerMeta {
  datasetId: string;
  title: string;
  source: string;
  licence: string;
  attribution: string;
  /** Overpass `timestamp_osm_base` values of the extracts, ISO 8601. */
  snapshots: string[];
  retrievedAt: string;
  /** SHA-256 of each raw extract, by file name. */
  rawSha256: Record<string, string>;
  projection: string;
  simplificationDegrees: number;
  status: string;
}

export interface BoundaryLayer {
  meta: BoundaryLayerMeta;
  /** [minX, minY, width, height] of everything the layer draws. */
  viewBox: [number, number, number, number];
  shapes: BoundaryShape[];
}

// -------------------------------------------------------------- selection --

export type Selection =
  | { kind: "unit"; id: string }
  | { kind: "feature"; id: string }
  | { kind: "territory"; id: string }
  | null;
