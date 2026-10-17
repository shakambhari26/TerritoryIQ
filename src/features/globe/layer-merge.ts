/**
 * Joins the outline path data served by `/geo/globe-boundaries.json` to the validated manifest, refusing anything the
 * validation did not pass. Pure: the fetch itself is in layer-client.ts.
 *
 * The manifest (scripts/globe/build_overlay.py) decided which outlines are valid and recorded a summary of each:
 * bounding box, label point and vertex count. Nothing here trusts the served file beyond that record:
 *
 *   1. the file must pass the same structural check the workspace applies (`layerProblem`): provenance, a
 *      "Provisional" status, no duplicate or unknown unit IDs, well-formed path data and boxes;
 *   2. it must be the globe's own dataset (dataset ID and kind) and the licence and attribution the manifest
 *      recorded, so the workspace's layer, or any other file, is refused;
 *   3. an outline is drawn only if the manifest validated it, its path decodes to the recorded bounding box
 *      (to the manifest's 5 decimals) and vertex count, and, for a block, its label point lies inside its parent
 *      district's outline. Shapes the manifest rejected are never drawn, even though they are in the file.
 *
 * An outline that fails (3) loses its geometry and keeps its colour state; it is listed in `refused` and says why.
 */

import { layerProblem } from "../territory/layer-validation.ts";
import { neutraliseUnreviewed } from "./classification.ts";
import { GLOBE_LAYER_FILE, GLOBE_LAYER_KIND } from "./layer-identity.ts";
import { decodeGeometry, pointInPolygons, type Polygon } from "./shapes.ts";
import type { BoundaryLayer } from "../territory/types.ts";
import type { GeometrySummary, GlobeManifest, GlobeOverlay, OverlayBlock, OverlayDistrict } from "./types.ts";

/** The manifest rounds boxes to 5 decimals (up to 5e-6 off); the rest is float noise. */
const BOX_TOLERANCE = 2e-5;

export interface RefusedOutline {
  id: string;
  reason: string;
}

export type MergeOutcome = { ok: true; overlay: GlobeOverlay; refused: RefusedOutline[] } | { ok: false; reason: string };

function vertexCount(polygons: readonly Polygon[]): number {
  return polygons.reduce((total, p) => total + p.outer.length + p.holes.reduce((n, hole) => n + hole.length, 0), 0);
}

function boxProblem(polygons: readonly Polygon[], expected: GeometrySummary["bbox"]): string | null {
  const points = polygons.flatMap((p) => p.outer);
  if (points.length === 0) return "the path data holds no outline";
  const lngs = points.map((c) => c[0]);
  const lats = points.map((c) => c[1]);
  const actual = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
  return actual.some((value, index) => !(Math.abs(value - expected[index]) <= BOX_TOLERANCE)) ? "its extent differs from the validated outline" : null;
}

export function mergeLayer(rawManifest: GlobeManifest, data: unknown): MergeOutcome {
  const manifest = neutraliseUnreviewed(rawManifest);
  const known = new Set<string>([...manifest.districts.map((d) => d.id), ...manifest.blocks.map((b) => b.id)]);
  const problem = layerProblem(data, known);
  if (problem) return { ok: false, reason: `The boundary file was refused: ${problem}` };
  const layer = data as BoundaryLayer;
  const built = manifest.meta.inputs[GLOBE_LAYER_FILE];
  const kind = (layer.meta as { kind?: unknown }).kind;
  if (!built || layer.meta.datasetId !== built.datasetId || kind !== GLOBE_LAYER_KIND || layer.meta.licence !== manifest.meta.licence || layer.meta.attribution !== manifest.meta.attribution) {
    return { ok: false, reason: "The boundary file is not the one this overlay was validated against. Rebuild the data and the overlay." };
  }

  const paths = new Map(layer.shapes.map((s) => [s.featureId, s.d]));
  const refused: RefusedOutline[] = [];
  const polygonsById = new Map<string, Polygon[]>();

  /** The summary joined to its path data, or null with the reason it cannot be drawn. */
  const join = (id: string, summary: GeometrySummary | null): { geometry: GeometrySummary & { d: string } | null; note: string | null } => {
    if (!summary) return { geometry: null, note: null };
    const d = paths.get(id);
    if (d === undefined) return { geometry: null, note: "the boundary file has no outline for it" };
    const geometry = { ...summary, d };
    const polygons = decodeGeometry(geometry);
    const mismatch = boxProblem(polygons, summary.bbox) ?? (vertexCount(polygons) === summary.vertices ? null : "its vertex count differs from the validated outline");
    if (mismatch) return { geometry: null, note: mismatch };
    polygonsById.set(id, polygons);
    return { geometry, note: null };
  };
  const refuse = (id: string, note: string) => refused.push({ id, reason: `Outline not drawn: ${note}.` });

  const districts: OverlayDistrict[] = manifest.districts.map((district) => {
    const { geometry, note } = join(district.id, district.geometry);
    if (note) refuse(district.id, note);
    return { ...district, geometry, noGeometryReason: geometry ? null : note ? `Outline not drawn: ${note}.` : district.noGeometryReason };
  });
  const districtPolygons = (id: string | null) => (id ? polygonsById.get(id) : undefined);

  const blocks: OverlayBlock[] = manifest.blocks.map((block) => {
    let { geometry, note } = join(block.id, block.geometry);
    if (geometry && geometry.anchor) {
      const parent = districtPolygons(block.districtId);
      if (!parent) {
        geometry = null;
        note = "its parent district has no outline";
      } else if (!pointInPolygons(geometry.anchor[0], geometry.anchor[1], parent)) {
        geometry = null;
        note = "its label point lies outside its parent district";
      }
    }
    if (note) refuse(block.id, note);
    const noGeometryReason = geometry ? null : note ? `Outline not drawn: ${note}.` : block.noGeometryReason;
    // The reason on a block that already had no outline says so; one that lost its outline here must too.
    const reason = note && block.state === "represented" ? `${block.reason} No outline is drawn: ${note}.` : block.reason;
    return { ...block, geometry, noGeometryReason, reason };
  });

  const drawn = new Map<string, number>();
  for (const block of blocks) if (block.geometry && block.districtId) drawn.set(block.districtId, (drawn.get(block.districtId) ?? 0) + 1);
  const finalDistricts = districts.map((d) => ({ ...d, drawnBlockCount: drawn.get(d.id) ?? 0 }));

  const overlay: GlobeOverlay = {
    ...manifest,
    districts: finalDistricts,
    blocks,
    rejected: [...manifest.rejected, ...refused],
    meta: {
      ...manifest.meta,
      counts: {
        ...manifest.meta.counts,
        districtsDrawn: finalDistricts.filter((d) => d.geometry).length,
        blocksDrawn: blocks.filter((b) => b.geometry).length,
        blocksRepresentedAndDrawn: blocks.filter((b) => b.state === "represented" && b.geometry).length,
      },
    },
  };
  return { ok: true, overlay, refused };
}
