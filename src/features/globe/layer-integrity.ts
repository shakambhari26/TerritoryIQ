/**
 * Server side of the globe's outline file: checks `data/generated/globe-boundaries.json` against the validated
 * manifest, and turns the outcome into the response of the same-origin route `/geo/globe-boundaries.json`.
 *
 * Server only (it hashes with node:crypto and reads a file). It serves exactly one thing: the file whose identity the
 * manifest recorded when scripts/globe/build_overlay.py validated it. Anything else is refused with a code and no data:
 *
 *   unavailable   the manifest was not built, or records no outline file (rebuild)
 *   missing       the file is not there
 *   identity      the file is another dataset: not the globe's dataset ID or kind (for instance the workspace's layer)
 *   tampered      the bytes are not the bytes that were validated (SHA-256), or are not JSON
 *   invalid       the bytes match but the structure fails the layer check, or a shape is not a validated outline
 *
 * The browser does not trust the answer either: layer-merge.ts joins it to the manifest outline by outline.
 * Pure apart from `readGlobeLayerFile`; the checks take bytes and a manifest so the tests can tamper with both.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { layerProblem } from "../territory/layer-validation.ts";
import { GLOBE_LAYER_FILE, GLOBE_LAYER_KIND } from "./layer-identity.ts";
import type { GlobeManifest } from "./types.ts";

export type GlobeLayerFault = "unavailable" | "missing" | "identity" | "tampered" | "invalid";

export type GlobeLayerResult = { ok: true; text: string; sha256: string } | { ok: false; fault: GlobeLayerFault; reason: string };

const fail = (fault: GlobeLayerFault, reason: string): GlobeLayerResult => ({ ok: false, fault, reason });

export function verifyGlobeLayer(bytes: Uint8Array | null, manifest: GlobeManifest | null): GlobeLayerResult {
  if (!manifest) return fail("unavailable", "The globe overlay manifest has not been built.");
  const record = manifest.meta.inputs[GLOBE_LAYER_FILE];
  if (!record || typeof record.sha256 !== "string" || typeof record.datasetId !== "string" || record.kind !== GLOBE_LAYER_KIND) {
    return fail("unavailable", "The manifest records no globe outline file. Rebuild the overlay.");
  }
  if (bytes === null) return fail("missing", "The globe outline file has not been built.");

  let parsed: unknown;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed = JSON.parse(text);
  } catch {
    return fail("tampered", "The globe outline file is not valid JSON.");
  }
  const meta = (parsed as { meta?: { datasetId?: unknown; kind?: unknown } } | null)?.meta;
  if (!meta || meta.datasetId !== record.datasetId || meta.kind !== GLOBE_LAYER_KIND) {
    return fail("identity", "The file is not the dataset the globe overlay was validated against.");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== record.sha256) return fail("tampered", "The globe outline file does not match the validated copy (SHA-256).");

  // Only outlines the validation passed may be in the file, and none twice.
  const validated = new Set<string>([...manifest.districts, ...manifest.blocks].filter((unit) => unit.geometry !== null).map((unit) => unit.id));
  const problem = layerProblem(parsed, validated);
  if (problem) return fail("invalid", problem);
  const shapes = (parsed as { shapes: unknown[] }).shapes.length;
  if (record.shapes !== undefined && record.shapes !== shapes) return fail("invalid", "The globe outline file holds a different number of outlines than were validated.");
  return { ok: true, text, sha256 };
}

/** Reads the file fresh on every call, so a file changed after the server started is caught, not served. */
export async function readGlobeLayerFile(directory: string, manifest: GlobeManifest | null): Promise<GlobeLayerResult> {
  let bytes: Uint8Array | null;
  try {
    bytes = await readFile(path.join(directory, GLOBE_LAYER_FILE));
  } catch {
    bytes = null;
  }
  return verifyGlobeLayer(bytes, manifest);
}

/** The same value as the `/geo/:path*` rule in next.config.ts (tests/unit/response-headers-config.test.mts keeps the two equal). */
const CACHE_CONTROL = "private, no-store";
const NO_STORE = { "Cache-Control": CACHE_CONTROL, "X-Content-Type-Options": "nosniff" } as const;

/** The route's answer. A refusal carries a code and a plain sentence and never any of the file's content. */
export function globeLayerResponse(result: GlobeLayerResult): Response {
  if (result.ok) {
    return new Response(result.text, { headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE } });
  }
  const status = result.fault === "missing" || result.fault === "unavailable" ? 404 : 500;
  return Response.json({ code: result.fault, error: result.reason }, { status, headers: NO_STORE });
}
