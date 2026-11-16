import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BlockRow } from "./block-rows";
import { neutraliseUnreviewed } from "./classification";
import { buildBlockRowIndex, projectManifest } from "./overlay-projection.server";
import type { ServerManifest } from "./server-types";
import type { GlobeManifest } from "./types";

/**
 * Server-side access to the globe overlay manifest (`npm run data:build-globe`). Server only: the file
 * holds staff names from the workbook, so it is never imported from a client component and is never written to
 * `public/`. It holds no outline path data; that is served by `/geo/globe-boundaries.json`. Read once at module scope
 * like `dataset.server.ts`; restart the server (and rebuild, for a production build) after regenerating it.
 *
 * The parsed file stays inside this module. What leaves it is a projection with no names (`getGlobeManifest`, for the
 * page) and one block's rows on request (`getBlockRows`, for POST /api/globe/block-rows). Both are null when the
 * manifest has not been built.
 */
async function load(): Promise<{ manifest: GlobeManifest; rows: Map<string, BlockRow[]>; blocksByDistrict: Map<string, string[]> } | null> {
  try {
    const text = await readFile(path.join(process.cwd(), "data", "generated", "globe-overlay.json"), "utf8");
    const server = JSON.parse(text) as ServerManifest;
    // A "no representative" state without a reviewed source record is not honoured (see classification.ts).
    const manifest = neutraliseUnreviewed(projectManifest(server));
    const blocksByDistrict = new Map<string, string[]>(manifest.districts.map((d) => [d.id, []]));
    for (const block of manifest.blocks) if (block.districtId) blocksByDistrict.get(block.districtId)?.push(block.id);
    return { manifest, rows: buildBlockRowIndex(server), blocksByDistrict };
  } catch {
    return null;
  }
}

const loaded = await load();

export function getGlobeManifest(): GlobeManifest | null {
  return loaded?.manifest ?? null;
}

/** The rows of one block: an array (empty for a block with none), or null for an ID that is no block or when nothing is built. */
export function getBlockRows(blockId: string): BlockRow[] | null {
  return loaded?.rows.get(blockId) ?? null;
}

/** Whether the manifest was built, to tell "not built" from "no such block". */
export function blockRowsAvailable(): boolean {
  return loaded !== null;
}

/**
 * Every place in one district with its rows, in the manifest's order (the order the page lists them in), or null for an
 * ID that is no district or when nothing is built. For POST /api/globe/district-team.
 */
export function getDistrictTeam(districtId: string): Array<{ blockId: string; rows: BlockRow[] }> | null {
  const ids = loaded?.blocksByDistrict.get(districtId);
  if (!ids) return null;
  return ids.map((blockId) => ({ blockId, rows: loaded!.rows.get(blockId) ?? [] }));
}
