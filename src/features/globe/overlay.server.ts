import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BlockRow } from "./block-rows";
import { neutraliseUnreviewed } from "./classification";
import { buildBlockRowIndex, projectManifest } from "./overlay-projection.server";
import type { ServerManifest } from "./server-types";
import type { GlobeManifest } from "./types";

/**
 * Server-side access to the globe overlay manifest (`python -I scripts/globe/build_overlay.py`). Server only: the file
 * holds staff names from the workbook, so it is never imported from a client component and is never written to
 * `public/`. It holds no outline path data; that is served by `/geo/globe-boundaries.json`. Read once at module scope
 * like `dataset.server.ts`; restart the server (and rebuild, for a production build) after regenerating it.
 *
 * The parsed file stays inside this module. What leaves it is a projection with no names (`getGlobeManifest`, for the
 * page) and one block's rows on request (`getBlockRows`, for POST /api/globe/block-rows). Both are null when the
 * manifest has not been built.
 */
async function load(): Promise<{ manifest: GlobeManifest; rows: Map<string, BlockRow[]> } | null> {
  try {
    const text = await readFile(path.join(process.cwd(), "data", "generated", "globe-overlay.json"), "utf8");
    const server = JSON.parse(text) as ServerManifest;
    // A "no representative" state without a reviewed source record is not honoured (see classification.ts).
    return { manifest: neutraliseUnreviewed(projectManifest(server)), rows: buildBlockRowIndex(server) };
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
