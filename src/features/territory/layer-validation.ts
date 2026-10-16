/**
 * Structural check of a boundary layer fetched at run time. A layer that fails
 * is refused with a reason, and the app falls back to its boundary-unavailable
 * states, so a damaged or wrong file can never draw nonsense.
 */

import type { BoundaryLayer } from "./types.ts";

const isNumberArray = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every((n) => typeof n === "number" && Number.isFinite(n));

const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Returns a reason the data is not a usable layer, or null when it is. */
export function layerProblem(data: unknown, knownFeatureIds?: ReadonlySet<string>): string | null {
  if (typeof data !== "object" || data === null) return "The boundary file is not a JSON object.";
  const layer = data as Partial<BoundaryLayer>;
  const meta = layer.meta;
  if (!meta || typeof meta !== "object") return "The boundary file has no provenance record.";
  for (const field of ["datasetId", "licence", "attribution", "source", "retrievedAt", "status"] as const) {
    if (!isText(meta[field])) return `The boundary file's provenance is missing "${field}".`;
  }
  // Outlines are community-sourced and unreviewed; a layer that does not say so is not drawn.
  if (!/^provisional\b/i.test(meta.status)) return 'The boundary file does not declare itself "Provisional".';
  if (!Array.isArray(meta.snapshots) || meta.snapshots.length === 0) return "The boundary file records no source snapshot date.";
  if (!isNumberArray(layer.viewBox, 4)) return "The boundary file has no valid view box.";
  if (!Array.isArray(layer.shapes)) return "The boundary file has no shapes.";
  const seen = new Set<string>();
  for (const [index, shape] of layer.shapes.entries()) {
    if (!shape || !isText(shape.featureId)) return `Shape ${index} has no unit ID.`;
    if (seen.has(shape.featureId)) return `Shape ${index} repeats unit ${shape.featureId}.`;
    seen.add(shape.featureId);
    if (!isText(shape.d) || !/^M-?\d/.test(shape.d)) return `Shape ${shape.featureId} has no path data.`;
    if (!isNumberArray(shape.bbox, 4)) return `Shape ${shape.featureId} has no valid bounding box.`;
    if (shape.anchor !== undefined) {
      // A label anchor outside its own shape's box would put the name on the wrong place on the map.
      const { anchor, bbox } = shape;
      if (!isNumberArray(anchor, 3) || anchor[2] < 0) return `Shape ${shape.featureId} has an invalid label anchor.`;
      if (anchor[0] < bbox[0] || anchor[0] > bbox[2] || anchor[1] < bbox[1] || anchor[1] > bbox[3]) {
        return `Shape ${shape.featureId} has a label anchor outside its own bounding box.`;
      }
    }
    if (knownFeatureIds && !knownFeatureIds.has(shape.featureId)) return `Shape ${shape.featureId} does not belong to any official unit in the dataset.`;
  }
  return null;
}
