import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

/**
 * Repository-wide guards that began as Gate P0 rules and still apply: no data
 * file in public/, no email address anywhere, no User-Agent set by the app, no
 * map or geometry library, and a pinned set of runtime dependencies. They cover
 * the application source, tests, docs, scripts and root configuration, and say
 * nothing about generated data kept under data/. The retired Gate P0 map
 * (src/features/map, /territory-map, tests/fixtures) and its fixture-specific
 * checks were removed on 2026-10-15; the localhost-only prototype's own
 * boundary (bind address, host check, where data may live, what the browser may
 * request) is checked in tests/unit/local-boundary.test.mts.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".next", ".git", "data-source", "data"]);

function* files(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

const rel = (path: string) => relative(ROOT, path).split("\\").join("/");
const read = (path: string) => readFileSync(path, "utf8");
const under = (dir: string) => [...files(join(ROOT, dir))];
const exists = (dir: string) => {
  try {
    readdirSync(join(ROOT, dir));
    return true;
  } catch {
    return false;
  }
};

/** All application source. */
const APP_CODE = under("src").filter((f) => [".ts", ".tsx", ".css"].includes(extname(f)));

describe("no data is served from public/ (Gate P0 criterion 2, kept for the local prototype)", () => {
  const GEO_EXTENSIONS = new Set([".geojson", ".topojson", ".shp", ".shx", ".dbf", ".kml", ".kmz", ".gpkg", ".mbtiles", ".pbf", ".osm"]);
  const DIRECTORIES = ["src", "tests", "docs", "scripts", "public"].filter(exists);

  test("no geographic data file exists under src, tests, docs, scripts or public", () => {
    const found = DIRECTORIES.flatMap(under).filter((f) => GEO_EXTENSIONS.has(extname(f).toLowerCase()));
    assert.deepEqual(found.map(rel), []);
  });

  test("public/ holds no boundary, spreadsheet or JSON data file", () => {
    // Next serves every file in public/ at a URL, verbatim, in `next start` and in any
    // deployment, to anything that can reach the port. The local prototype may draw
    // provisional OpenStreetMap outlines, but they live in data/generated/ and are
    // delivered by the route handler at /geo/boundaries.json, never from public/.
    const found = (exists("public") ? under("public") : []).filter((f) =>
      [".json", ".xls", ".xlsx", ".csv", ...GEO_EXTENSIONS].includes(extname(f).toLowerCase()),
    );
    assert.deepEqual(
      found.map(rel),
      [],
      "Generated data must not sit in public/. Run `npm run data:build`, which writes data/generated/boundaries.json, and remove the stale copy from public/geo/.",
    );
  });

  test("no JSON data file exists under src or tests", () => {
    const found = ["src", "tests"].flatMap(under).filter((f) => extname(f).toLowerCase() === ".json");
    assert.deepEqual(found.map(rel), []);
  });
});

// The external-URL and network-call checks that used to sit here covered only the retired Gate P0
// code. Their replacements cover all of src/ and live in tests/unit/local-boundary.test.mts
// ("outbound network"): one external link, one same-origin fetch.
describe("no map-tile provider terms arise: no map library is imported (Phase 0F section 6)", () => {
  test("application code imports no map, tile or geometry library", () => {
    const pattern = /from\s+["'](maplibre-gl|mapbox-gl|leaflet|react-leaflet|ol|d3-geo|topojson-client|@turf\/[^"']+|proj4)["']/;
    assert.deepEqual(APP_CODE.filter((f) => pattern.test(read(f))).map(rel), []);
  });

  test("the runtime dependencies are exactly the framework's", () => {
    const pkg = JSON.parse(read(join(ROOT, "package.json")));
    assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["next", "react", "react-dom"]);
  });
});

describe("User-Agent email disclosure: mitigation (docs/security-notes.md)", () => {
  // Matches a user@domain address. Scoped package names such as @scope/pkg do not match.
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
  const TEXT = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".css", ".md", ".json", ".txt", ".svg"]);
  const CANDIDATES = [
    ...["src", "tests", "docs", "scripts"].filter(exists).flatMap(under),
    ...["package.json", "tsconfig.json", "next.config.ts", "eslint.config.mjs", "README.md", "AGENTS.md"].map((f) => join(ROOT, f)),
  ].filter((f) => TEXT.has(extname(f)));

  test("no email address appears in code, tests, scripts, docs or root configuration", () => {
    const offenders = CANDIDATES.filter((f) => EMAIL.test(read(f))).map(rel);
    assert.deepEqual(offenders, []);
  });

  test("application code never sets a User-Agent header", () => {
    // scripts/fetch-osm.mts sets a generic one on purpose; local-boundary.test.mts pins it.
    const offenders = APP_CODE.filter((f) => /user-agent/i.test(read(f))).map(rel);
    assert.deepEqual(offenders, []);
  });
});
