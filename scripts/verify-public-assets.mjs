/**
 * Fails if the production build exposes workbook-derived data as a public asset.
 *
 * "Public assets" are the files a browser can download without the app rendering
 * anything for it: everything in `public/` and everything in `.next/static`
 * (client scripts, styles, fonts, media). The checks are:
 *
 *   1. `public/` holds no data file (JSON, spreadsheet, CSV or geographic format).
 *   2. No staff name from `data/generated/dataset.json` appears in a public asset.
 *   3. The boundary layer's dataset ID does not appear in a public asset: the
 *      layer is delivered only by the /geo/boundaries.json route handler.
 *
 * The prerendered pages under `.next/server` do contain staff names, by design:
 * the workspace shows who covers each area. They are served by the local server
 * only (loopback host check, 127.0.0.1 bind), so they are counted and reported
 * but are not an error.
 *
 * Run after `npm run build`:  npm run verify:assets
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** File types that must never sit in `public/`. */
export const DATA_EXTENSIONS = new Set([
  ".json", ".geojson", ".topojson", ".shp", ".shx", ".dbf", ".kml", ".kmz", ".gpkg", ".mbtiles", ".pbf", ".osm",
  ".xls", ".xlsx", ".xlsm", ".csv", ".tsv", ".ndjson",
]);

export function* walk(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

/**
 * Every distinct person name in a generated dataset, longest first. Names are
 * matched whole and case-sensitively, so ordinary words in scripts do not match.
 */
export function staffNames(dataset) {
  const names = new Set();
  for (const unit of dataset.units ?? []) {
    for (const slot of unit.slots ?? []) {
      for (const name of slot.names ?? []) {
        const trimmed = String(name).trim();
        if (trimmed.length >= 5) names.add(trimmed);
      }
    }
  }
  return [...names].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/** Files under `directories` that contain any marker, and how many files were read. */
export function findMarkers(directories, markers) {
  const hits = [];
  let filesScanned = 0;
  const needles = markers.map((marker) => ({ marker, bytes: Buffer.from(marker, "utf8") }));
  for (const directory of directories) {
    for (const file of walk(directory)) {
      const content = readFileSync(file);
      filesScanned += 1;
      for (const { marker, bytes } of needles) if (content.includes(bytes)) hits.push({ file, marker });
    }
  }
  return { hits, filesScanned };
}

/** Data files found under `directory` (normally `public/`). */
export function dataFilesIn(directory) {
  return [...walk(directory)].filter((file) => DATA_EXTENSIONS.has(extname(file).toLowerCase()));
}

/**
 * The whole check, against a project root. Returns problems (empty when clean)
 * plus counts, so a result that scanned nothing is visible.
 */
export function checkPublicAssets(root, { names, layerDatasetId }) {
  const publicDir = join(root, "public");
  const staticDir = join(root, ".next", "static");
  const serverDir = join(root, ".next", "server");
  const problems = [];

  for (const file of dataFilesIn(publicDir)) {
    problems.push(`public/ holds a data file: ${relative(root, file)}`);
  }

  const markers = [...names, ...(layerDatasetId ? [layerDatasetId] : [])];
  const assets = findMarkers([publicDir, staticDir], markers);
  for (const { file, marker } of assets.hits) {
    const what = marker === layerDatasetId ? "the boundary layer's dataset ID" : "a staff name";
    problems.push(`${relative(root, file)} contains ${what}`);
  }

  const server = findMarkers([serverDir], names);
  const serverFilesWithNames = new Set(server.hits.map((hit) => relative(root, hit.file).split("\\").join("/")));
  return {
    problems,
    assetFilesScanned: assets.filesScanned,
    serverFilesScanned: server.filesScanned,
    serverFilesWithNames: [...serverFilesWithNames].sort(),
    namesChecked: names.length,
  };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (!existsSync(join(root, ".next", "BUILD_ID"))) {
    console.error("verify:assets: no production build found (.next/BUILD_ID is missing). Run `npm run build` first.");
    process.exit(2);
  }
  const datasetPath = join(root, "data", "generated", "dataset.json");
  if (!existsSync(datasetPath)) {
    console.error("verify:assets: data/generated/dataset.json is missing, so there are no names to look for. Run `npm run data:build`.");
    process.exit(2);
  }
  const names = staffNames(JSON.parse(readFileSync(datasetPath, "utf8")));
  let layerDatasetId = null;
  const layerPath = join(root, "data", "generated", "boundaries.json");
  if (existsSync(layerPath)) layerDatasetId = JSON.parse(readFileSync(layerPath, "utf8")).meta?.datasetId ?? null;

  const result = checkPublicAssets(root, { names, layerDatasetId });
  if (names.length === 0 || result.assetFilesScanned === 0) {
    console.error(`verify:assets: checked ${names.length} names across ${result.assetFilesScanned} public files, so the result proves nothing.`);
    process.exit(2);
  }
  if (result.problems.length > 0) {
    console.error("verify:assets: FAILED. Workbook-derived data is exposed as a public asset:");
    for (const problem of result.problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    `verify:assets: OK. ${result.assetFilesScanned} public files (public/ and .next/static) scanned for ${result.namesChecked} staff names ` +
      `and the layer dataset ID: none found, and public/ holds no data file.`,
  );
  console.log(
    `  Served pages (.next/server): ${result.serverFilesWithNames.length} of ${result.serverFilesScanned} files contain staff names, as designed: ` +
      `${result.serverFilesWithNames.join(", ") || "none"}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
