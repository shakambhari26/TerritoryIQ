/**
 * Shapes of the globe overlay manifest written by scripts/globe/build_overlay.py to
 * data/generated/globe-overlay.json, as the page receives it. The file itself carries workbook names (server-types.ts
 * describes it), so it is read only on the server (overlay.server.ts), which hands the page a strict projection of it:
 * every block lists only the IDs of its workbook rows (`rowIds`). The names, row labels and sales territories of those
 * rows are fetched for one selected block at a time from POST /api/globe/block-rows (block-rows.ts). Nothing here is
 * ever written to public/.
 *
 * The manifest holds no outline path data. It records, for every outline that passed validation, the summary
 * the validation produced (bounding box, label point, vertex count), and the identity (dataset ID, SHA-256, shape
 * count) of the globe's own outline file, data/generated/globe-boundaries.json. That file is served by the
 * same-origin `/geo/globe-boundaries.json` route handler (layer-integrity.ts checks it against the manifest) and is
 * joined to the manifest in layer-merge.ts, which refuses any outline that does not match its validated summary.
 * `GlobeManifest` is the page's props; `GlobeOverlay` is the manifest after that join and is what the renderer draws.
 */

/** Colour semantics. About a provisional link to a named representative, never about allocation. */
export type UnitState = "represented" | "no-representative" | "unresolved";

export type BBox = readonly [west: number, south: number, east: number, north: number];

/** What validation recorded about an outline. No path data. */
export interface GeometrySummary {
  /** Degrees. */
  bbox: BBox;
  /** Label point inside the outline, [lng, lat], or null. */
  anchor: readonly [number, number] | null;
  vertices: number;
}

/** A validated outline joined to its path data from the layer. */
export interface OverlayGeometry extends GeometrySummary {
  /** Layer path data (see features/geo/layer.ts). Decoded and converted to longitude / latitude in shapes.ts. */
  d: string;
}

export type UnitType = "district" | "block";
export type ReviewStatus = "pending" | "approved" | "rejected" | "superseded";

/**
 * A reviewed source record that confirms a unit has no associated representative: the PROPOSED schema (version 1)
 * in docs/no-representative-record.md and docs/schemas/no-representative-record.schema.json. The base data holds
 * none, so nothing carries one today; without a record that passes `confirmationProblem` a "no-representative"
 * state is not honoured (see classification.ts), and no white outline is drawn.
 */
export interface Confirmation {
  schemaVersion: 1;
  /** Stable ID of this record (not of the unit), for audit and for superseding it. */
  recordId: string;
  /** The `recordId` this record replaces, if any. An approved record is superseded, never edited. */
  supersedes?: string;
  /** The unit the record is about: its type, the app's feature ID and its LGD code. All three must match the unit. */
  unit: { type: UnitType; id: string; lgdCode: number };
  /** The one thing the record asserts. A missing row, a vacant marker or a failed name match never produces it. */
  assertion: "no-representative-associated";
  /** Where the assertion comes from. */
  source: { kind: string; reference: string; location: string; retrievedAt: string; sha256?: string };
  /** Who put the record in the repository, and when. */
  provenance: { recordedBy: string; recordedAt: string };
  /** The date from which the assertion holds (YYYY-MM-DD). A future date is not yet in force. */
  effectiveDate: string;
  review: { status: ReviewStatus; reviewedBy: string | null; reviewedAt: string | null; notes?: string };
}

export interface OverlayBlock {
  id: string;
  name: string;
  lgdCode: number;
  districtId: string | null;
  state: UnitState;
  reason: string;
  /** Present only with a reviewed source record that confirms "no representative". */
  confirmation?: Confirmation | null;
  contested: boolean;
  /** The workbook rows linked to this block, by row ID (`TU-…`), in the manifest's order. Their names are not here. */
  rowIds: string[];
  geometry: OverlayGeometry | null;
  noGeometryReason: string | null;
}

export interface OverlayDistrict {
  id: string;
  name: string;
  lgdCode: number;
  state: UnitState;
  reason: string;
  /** Present only with a reviewed source record that confirms "no representative". */
  confirmation?: Confirmation | null;
  blockCount: number;
  representedBlockCount: number;
  drawnBlockCount: number;
  geometry: OverlayGeometry | null;
  noGeometryReason: string | null;
}

export type ManifestBlock = Omit<OverlayBlock, "geometry"> & { geometry: GeometrySummary | null };
export type ManifestDistrict = Omit<OverlayDistrict, "geometry"> & { geometry: GeometrySummary | null };

export interface GlobeOverlay {
  meta: {
    schema: number;
    generatedAt: string;
    inputs: Record<string, { sha256: string; datasetId?: string; generatedAt?: string; kind?: string; shapes?: number }>;
    crs: string;
    layerSource: string;
    licence: string;
    attribution: string;
    snapshots: string[];
    status: string;
    colourRule: Record<string, string>;
    counts: {
      districts: number;
      districtsDrawn: number;
      districtsRepresented: number;
      blocks: number;
      blocksDrawn: number;
      blocksRepresented: number;
      blocksRepresentedAndDrawn: number;
      blocksNoRepresentativeConfirmed: number;
      blocksUnresolved: number;
      blocksContested: number;
      shapesRejected: number;
      parentFailures: number;
      duplicateShapes: number;
    };
  };
  state: { id: string; name: string; bbox: BBox | null; centre: readonly [number, number] | null; basis: string };
  districts: OverlayDistrict[];
  blocks: OverlayBlock[];
  rejected: Array<{ id: string; reason: string }>;
}

/** The manifest as the server hands it to the page: outline summaries, no path data. */
export type GlobeManifest = Omit<GlobeOverlay, "districts" | "blocks"> & {
  districts: ManifestDistrict[];
  blocks: ManifestBlock[];
};

/** What the camera is looking at. `globe` is the rotating whole Earth. */
export type Level = "globe" | "state" | "district" | "block";
export type Phase = "idle" | "flying" | "arrived";
