import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BoundaryLayerMeta, TerritoryDataset } from "./types";

/**
 * Server-side access to the generated data (`npm run data:build`). Server only:
 * the dataset holds staff names from the workbook, so it must never be imported
 * from a client component, and nothing here is ever written to `public/`.
 * Files are read once at module scope, as the Next.js Cache Components guide
 * recommends for local files that do not change while the server runs; restart
 * the server (and rebuild, for a production build) after rebuilding the data.
 *
 * Each getter returns null when the data has not been built, and the pages then
 * show a clear "data not built" state instead of failing.
 */
const GENERATED_DIR = path.join(process.cwd(), "data", "generated");

async function load(): Promise<TerritoryDataset | null> {
  try {
    const text = await readFile(path.join(GENERATED_DIR, "dataset.json"), "utf8");
    return JSON.parse(text) as TerritoryDataset;
  } catch {
    return null;
  }
}

const dataset = await load();

export function getDataset(): TerritoryDataset | null {
  return dataset;
}

/**
 * The boundary layer: provisional OpenStreetMap outlines keyed by official unit
 * ID. It holds no staff or workbook data. The raw text is kept so the route
 * handler at /geo/boundaries.json can serve it unchanged; the browser validates
 * it before drawing anything (`layerProblem`).
 */
async function loadLayer(): Promise<{ text: string; meta: BoundaryLayerMeta | null } | null> {
  try {
    const text = await readFile(path.join(GENERATED_DIR, "boundaries.json"), "utf8");
    const layer = JSON.parse(text) as { meta?: BoundaryLayerMeta };
    return { text, meta: layer.meta ?? null };
  } catch {
    return null;
  }
}

const layer = await loadLayer();

export function getLayerText(): string | null {
  return layer?.text ?? null;
}

export function getLayerMeta(): BoundaryLayerMeta | null {
  return layer?.meta ?? null;
}
