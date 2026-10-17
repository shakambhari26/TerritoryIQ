import { readFile } from "node:fs/promises";
import path from "node:path";
import { neutraliseUnreviewed } from "./classification";
import type { GlobeManifest } from "./types";

/**
 * Server-side access to the globe overlay manifest (`python -I scripts/globe/build_overlay.py`). Server only:
 * the manifest holds staff names from the workbook, so it is never imported from a client component and is
 * never written to `public/`. It holds no outline path data; that is served by `/geo/boundaries.json`. Read once
 * at module scope like `dataset.server.ts`; restart the server (and rebuild, for a production build) after
 * regenerating it. Returns null when it has not been built.
 */
async function load(): Promise<GlobeManifest | null> {
  try {
    const text = await readFile(path.join(process.cwd(), "data", "generated", "globe-overlay.json"), "utf8");
    // A "no representative" state without a reviewed source record is not honoured (see classification.ts).
    return neutraliseUnreviewed(JSON.parse(text) as GlobeManifest);
  } catch {
    return null;
  }
}

const overlay = await load();

export function getGlobeManifest(): GlobeManifest | null {
  return overlay;
}
