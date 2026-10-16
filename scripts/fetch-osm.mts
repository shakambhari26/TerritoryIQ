/**
 * Fetches OpenStreetMap administrative boundaries for West Bengal (districts,
 * admin_level 5, and development blocks, admin_level 6) through the public
 * Overpass API, and stores the raw responses under data/raw/osm/ with their
 * SHA-256 values.
 *
 * Privacy: the only request headers set are a generic User-Agent and the
 * content type. No company address, account or identifier is sent. Each query
 * body is a public geographic query.
 *
 * Network access happens only when you run this script (`npm run data:fetch-osm`).
 * The app, the build and the tests never contact an external service.
 * Data is community-sourced under the Open Database Licence (ODbL); see the
 * attribution carried in the generated boundary layer.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readLgdDistricts } from "./lib/lgd.ts";
import { ROOT, SOURCES, sha256Buffer, sourcePath } from "./lib/sources.ts";

const USER_AGENT = "TerritoryIQ-local-prototype/0.1";
const MIRRORS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
// West Bengal and a margin; neighbouring states' relations are filtered out later.
const BBOX = "21.4,85.7,27.4,90.0";
const OUT_DIR = path.join(ROOT, "data", "raw", "osm");
const refresh = process.argv.includes("--refresh");

interface ManifestEntry {
  file: string;
  mirror: string;
  query: string;
  bytes: number;
  sha256: string;
  osmTimestamp: string | null;
  fetchedAt: string;
}

const manifest: ManifestEntry[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function overpass(file: string, query: string): Promise<unknown> {
  const target = path.join(OUT_DIR, file);
  if (!refresh) {
    try {
      const cached = await readFile(target);
      console.log(`cached  ${file} (${cached.length} bytes)`);
      return JSON.parse(cached.toString("utf8"));
    } catch {
      /* not cached yet */
    }
  }
  let lastError = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const mirror = MIRRORS[attempt % MIRRORS.length];
    try {
      const response = await fetch(mirror, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(300_000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = JSON.parse(text) as { osm3s?: { timestamp_osm_base?: string }; remark?: string };
      if (json.remark && /error|timed out|out of memory/i.test(json.remark)) throw new Error(json.remark);
      await writeFile(target, text);
      manifest.push({
        file,
        mirror,
        query,
        bytes: Buffer.byteLength(text),
        sha256: sha256Buffer(text),
        osmTimestamp: json.osm3s?.timestamp_osm_base ?? null,
        fetchedAt: new Date().toISOString(),
      });
      console.log(`fetched ${file} (${Buffer.byteLength(text)} bytes) from ${new URL(mirror).host}`);
      await sleep(2000);
      return json;
    } catch (error) {
      lastError = `${new URL(mirror).host}: ${error instanceof Error ? error.message : String(error)}`;
      console.log(`retry   ${file} after ${lastError}`);
      await sleep(4000 * (attempt + 1));
    }
  }
  throw new Error(`Overpass query failed for ${file}: ${lastError}`);
}

interface IndexElement {
  id: number;
  tags?: Record<string, string>;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
}

await mkdir(OUT_DIR, { recursive: true });

const lgdSpec = SOURCES.find((s) => s.key === "lgdDistricts")!;
const lgdDistrictCodes = new Set((await readLgdDistricts(sourcePath(lgdSpec))).districts.map((d) => d.code));

// 1. Cheap tag-and-bounds indexes.
const level5 = (await overpass(
  "index-level5.json",
  `[out:json][timeout:180];rel["boundary"="administrative"]["admin_level"="5"](${BBOX});out tags bb;`,
)) as { elements: IndexElement[] };
const level6 = (await overpass(
  "index-level6.json",
  `[out:json][timeout:180];rel["boundary"="administrative"]["admin_level"="6"](${BBOX});out tags bb;`,
)) as { elements: IndexElement[] };

// 2. West Bengal districts are the level-5 relations carrying an LGD district code we hold.
const districts = level5.elements.filter((e) => lgdDistrictCodes.has(Number(e.tags?.["ref:LGD:district"])));
console.log(`districts with an LGD code: ${districts.length} of ${lgdDistrictCodes.size}`);

// 3. Level-6 candidates: centre of the bounding box inside the bounding box of some district.
const distBoxes = districts.map((d) => d.bounds!).filter(Boolean);
const blocks = level6.elements.filter((e) => {
  if (!e.bounds) return false;
  const lat = (e.bounds.minlat + e.bounds.maxlat) / 2;
  const lon = (e.bounds.minlon + e.bounds.maxlon) / 2;
  return distBoxes.some((b) => lat >= b.minlat && lat <= b.maxlat && lon >= b.minlon && lon <= b.maxlon);
});
console.log(`level-6 relations in the state box: ${level6.elements.length}, candidates near a district: ${blocks.length}`);

// 4. Geometry in chunks.
async function geometry(prefix: string, ids: number[], size: number) {
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);
    await overpass(
      `${prefix}-${String(i / size + 1).padStart(2, "0")}.json`,
      `[out:json][timeout:300];rel(id:${chunk.join(",")});out geom;`,
    );
  }
}
await geometry("districts-geom", districts.map((d) => d.id).sort((a, b) => a - b), 8);
await geometry("blocks-geom", blocks.map((b) => b.id).sort((a, b) => a - b), 20);

// 5. Record provenance of this run (merged with any earlier run).
const manifestPath = path.join(OUT_DIR, "manifest.json");
let previous: ManifestEntry[] = [];
try {
  previous = JSON.parse(await readFile(manifestPath, "utf8")) as ManifestEntry[];
} catch {
  /* first run */
}
const merged = new Map(previous.map((m) => [m.file, m]));
for (const entry of manifest) merged.set(entry.file, entry);
await writeFile(manifestPath, JSON.stringify([...merged.values()], null, 2));
console.log(`done. manifest: ${path.relative(ROOT, manifestPath)}`);
