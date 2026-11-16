import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Guards for the globe prototype (src/features/globe, src/app/globe, scripts/globe, public/globe).
 * They keep the prototype's promises checkable: no outbound request from the app, Three.js confined to one
 * browser-only feature folder, no data in public/, honest wording, and texture files that match their provenance.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const rel = (path: string) => relative(ROOT, path).split("\\").join("/");

function* files(directory: string): Generator<string> {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}
const sources = (dir: string, extensions = [".ts", ".tsx", ".mts"]) => [...files(join(ROOT, dir))].filter((f) => extensions.includes(extname(f)));
const GLOBE_SOURCES = [...sources("src/features/globe"), ...sources("src/app/globe")];

describe("globe prototype: the browser makes no outbound request", () => {
  it("the only requests are the same-origin layer fetch and the two team POSTs; no XHR, socket, beacon or geolocation anywhere", () => {
    const fetches = /\bfetch\s*\(/;
    assert.deepEqual(GLOBE_SOURCES.filter((f) => fetches.test(readFileSync(f, "utf8"))).map(rel).sort(), [
      "src/features/globe/block-rows-client.ts",
      "src/features/globe/district-team-client.ts",
      "src/features/globe/layer-client.ts",
    ]);
    const other = /XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon|navigator\.geolocation/;
    assert.deepEqual(GLOBE_SOURCES.filter((f) => other.test(readFileSync(f, "utf8"))).map(rel), []);
    // Three.js loaders fetch too; the renderer uses ImageLoader with literal /globe/ paths only (next test).
    assert.doesNotMatch(read("src/features/globe/GlobeRenderer.ts"), /FileLoader|TextureLoader\([^)]*http/);
  });

  it("the layer client is a literal same-origin GET that takes no URL, and its answer goes through mergeLayer", () => {
    const client = read("src/features/globe/layer-client.ts");
    assert.match(client, /const LAYER_URL = "\/geo\/globe-boundaries\.json";/);
    assert.doesNotMatch(client.replace(/\/\*[\s\S]*?\*\//g, ""), /\/geo\/boundaries\.json/, "the globe never asks for the workspace's layer");
    assert.match(client, /export async function fetchBoundaryLayer\(signal: AbortSignal\)/);
    const experience = read("src/features/globe/components/GlobeExperience.tsx");
    assert.match(experience, /fetchBoundaryLayer\(controller\.signal\)[\s\S]*mergeLayer\(manifest, data\)/);
    // Only the globe experience reaches the client, so no other component can start a request.
    const importers = GLOBE_SOURCES.filter((f) => /from\s+["'][^"']*layer-client["']/.test(readFileSync(f, "utf8"))).map(rel);
    assert.deepEqual(importers, ["src/features/globe/components/GlobeExperience.tsx"]);
  });

  it("each team client is a literal same-origin POST that takes no URL, and only the team section uses them", () => {
    const rows = read("src/features/globe/block-rows-client.ts");
    assert.match(rows, /const BLOCK_ROWS_URL = "\/api\/globe\/block-rows";/);
    assert.match(rows, /export async function fetchBlockRows\(blockId: string, rowIds: readonly string\[\], signal: AbortSignal\)/);
    assert.match(rows, /body: JSON\.stringify\(\{ blockId \}\)/);
    assert.match(rows, /parseBlockRowsPayload\(body, blockId, rowIds\)/, "the answer is checked against the place and the page's row IDs");
    const district = read("src/features/globe/district-team-client.ts");
    assert.match(district, /const DISTRICT_TEAM_URL = "\/api\/globe\/district-team";/);
    assert.match(district, /body: JSON\.stringify\(\{ districtId \}\)/);
    assert.match(district, /parseDistrictTeamPayload\(body, districtId, expected\)/, "the answer is checked against the page's places and row IDs");
    for (const client of [rows, district]) {
      assert.match(client, /method: "POST"/);
      assert.match(client, /cache: "no-store"/);
    }
    for (const name of ["block-rows-client", "district-team-client"]) {
      const importers = GLOBE_SOURCES.filter((f) => new RegExp(`from\\s+["'][^"']*${name}["']`).test(readFileSync(f, "utf8"))).map(rel);
      const allowed = name === "block-rows-client" ? ["src/features/globe/components/TeamSection.tsx", "src/features/globe/district-team-client.ts"] : ["src/features/globe/components/TeamSection.tsx"];
      assert.deepEqual(importers.sort(), allowed, name);
    }
  });

  it("outline path data is never in public/ and never in the page props: the manifest holds summaries only", () => {
    assert.ok(!existsSync(join(ROOT, "public", "geo")));
    const builder = read("scripts/globe/build-area-map.mts");
    const summary = builder.slice(builder.indexOf("    summary: {"), builder.indexOf("const districtFeature"));
    assert.ok(summary.length > 0);
    assert.doesNotMatch(summary, /\bd:/, "the builder does not write path data into the manifest");
    assert.doesNotMatch(read("src/features/globe/types.ts").split("export interface OverlayGeometry")[0].split("export interface GeometrySummary")[1] ?? "", /\bd:/, "a summary has no path data");
  });

  it("no external URL in the globe code", () => {
    const external = /https?:\/\/(?!127\.0\.0\.1|localhost)[^\s"'`)]+/gi;
    const found = GLOBE_SOURCES.flatMap((f) => (readFileSync(f, "utf8").match(external) ?? []).map((u) => `${rel(f)} ${u}`));
    assert.deepEqual(found, []);
  });

  it("every texture the renderer loads is a same-origin file under /globe/ that exists in public/globe/", () => {
    const renderer = read("src/features/globe/GlobeRenderer.ts");
    const fallback = read("src/features/globe/components/GlobeFallback.tsx");
    const urls = [...(renderer + fallback).matchAll(/["'(](\/globe\/[A-Za-z0-9._-]+)["')]/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(urls)].sort(), ["/globe/earth-clouds.jpg", "/globe/earth-day-4k.jpg", "/globe/earth-day-8k.jpg", "/globe/earth-ocean-mask.png"], "only the approved bundled NASA textures: no regional or higher-resolution imagery");
    for (const url of new Set(urls)) assert.ok(existsSync(join(ROOT, "public", url)), `${url} exists`);
    const loads = [...renderer.matchAll(/loadTexture\(manager,\s*([^,]+),/g)].map((m) => m[1]);
    for (const expression of loads) assert.doesNotMatch(expression, /https?:|\$\{/, "texture paths are literal, never built from input");
  });
});

describe("globe prototype: three.js stays inside one lazy, browser-only folder", () => {
  it("only src/features/globe imports three", () => {
    const offenders = sources("src")
      .filter((f) => !rel(f).startsWith("src/features/globe/"))
      .filter((f) => /from\s+["']three(?:\/[^"']*)?["']/.test(readFileSync(f, "utf8")))
      .map(rel);
    assert.deepEqual(offenders, []);
  });

  it("the page reaches the globe only through the lazy loader, with server rendering off", () => {
    const page = read("src/app/globe/page.tsx");
    assert.match(page, /GlobeLoader/);
    assert.doesNotMatch(page, /GlobeExperience|GlobeRenderer|from\s+["']three/);
    const loader = read("src/features/globe/components/GlobeLoader.tsx");
    assert.match(loader, /^"use client";/);
    assert.match(loader, /dynamic\(\(\) => import\("\.\/GlobeExperience"\),\s*\{\s*ssr:\s*false/);
  });

  it("only GlobeExperience imports the renderer, and no server file imports the client renderer", () => {
    const importers = sources("src")
      .filter((f) => /from\s+["'][^"']*GlobeRenderer["']/.test(readFileSync(f, "utf8")))
      .map(rel)
      .sort();
    assert.deepEqual(importers, ["src/features/globe/components/GlobeExperience.tsx"]);
  });

  it("the overlay manifest is read only on the server, by the page alone, and never by a client component", () => {
    const importers = sources("src")
      .filter((f) => /from\s+["'][^"']*overlay\.server["']/.test(readFileSync(f, "utf8")))
      .map(rel);
    // The page (for the manifest props), the globe's outline route (for the integrity record) and the two team routes (one
    // selected place's rows, one selected district's rows). Nothing else.
    assert.deepEqual(importers.sort(), [
      "src/app/api/globe/block-rows/route.ts",
      "src/app/api/globe/district-team/route.ts",
      "src/app/geo/globe-boundaries.json/route.ts",
      "src/app/globe/page.tsx",
    ]);
    const clientImporters = sources("src")
      .filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8")))
      .filter((f) => /overlay\.server/.test(readFileSync(f, "utf8")));
    assert.deepEqual(clientImporters, []);
  });

  it("the Territory Workspace does not import the globe", () => {
    const offenders = sources("src")
      .filter((f) => !f.includes(`${join("src", "features", "globe")}`) && !f.includes(join("src", "app", "globe")))
      // The globe's own outline and team routes are part of the globe; the workspace's route (geo/boundaries.json) is not.
      .filter(
        (f) =>
          !["src/app/geo/globe-boundaries.json/route.ts", "src/app/api/globe/block-rows/route.ts", "src/app/api/globe/district-team/route.ts"].includes(rel(f)),
      )
      .filter((f) => /features\/globe|globe-prototype/.test(readFileSync(f, "utf8")))
      .map(rel);
    assert.deepEqual(offenders, []);
    assert.doesNotMatch(read("src/app/geo/boundaries.json/route.ts"), /globe/i, "the workspace's boundary route does not know about the globe");
  });
});

describe("globe prototype: wording stays honest", () => {
  it("no text calls a link verified or an outline official", () => {
    for (const file of sources("src/features/globe", [".tsx", ".ts"])) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /\b(?:verified|confirmed)\s+(?:link|match|boundary|outline|association)/i, rel(file));
      assert.doesNotMatch(text, /\bofficial (?:boundary|outline|border)\b/i, rel(file));
    }
  });

  it("the page keeps the OpenStreetMap and NASA attribution on screen, and says the outlines are not official boundaries", () => {
    const experience = read("src/features/globe/components/GlobeExperience.tsx");
    assert.match(experience, /meta\.attribution/);
    assert.match(experience, /not official boundaries/);
    assert.match(experience, /NASA Earth Observatory/);
  });

  it("colour semantics are their own states and never reuse the allocation classification names", () => {
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const file of ["styles.ts", "types.ts"]) assert.doesNotMatch(code(read(`src/features/globe/${file}`)), /Assigned|Vacant|Unallocated|Data Missing/, file);
    assert.match(read("src/features/globe/types.ts"), /type UnitState = "represented" \| "no-representative" \| "unresolved"/);
  });
});

describe("globe prototype: build tooling and asset provenance", () => {
  const python = (name: string) => read(`scripts/globe/${name}`);

  it("only the texture fetcher can reach a network: one host, a generic User-Agent, no address", () => {
    const fetcher = python("fetch_textures.py");
    assert.match(fetcher, /USER_AGENT = "TerritoryIQ-local-prototype\/0\.1"/);
    assert.match(fetcher, /HOST = "assets\.science\.nasa\.gov"/);
    assert.equal(fetcher.match(/headers=\{/g)?.length, 1);
    assert.doesNotMatch(fetcher, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
    const hosts = [...fetcher.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]);
    for (const host of hosts) assert.ok(host === "assets.science.nasa.gov" || host === "science.nasa.gov", host);
    const builder = read("scripts/globe/build-area-map.mts");
    assert.doesNotMatch(builder, /\bfetch\s*\(|node:https?|node:net|https?:\/\//, "the globe build is offline");
  });

  it("the build script writes only under data/generated/, and the fetcher only under public/globe/ and scripts/globe/", () => {
    const builder = read("scripts/globe/build-area-map.mts");
    assert.match(builder, /const GENERATED = path\.join\(ROOT, "data", "generated"\);/);
    const writes = [...builder.matchAll(/writeFile\(([^,]+),/g)].map((m) => m[1]);
    assert.ok(writes.length > 0);
    for (const target of writes) assert.match(target, /^path\.join\(GENERATED\b/, "every write is under data/generated/");
    assert.doesNotMatch(builder, /"public"/);
    const fetcher = python("fetch_textures.py");
    assert.match(fetcher, /OUT_DIR = ROOT \/ "public" \/ "globe"/);
    assert.doesNotMatch(fetcher, /data-source|"data"/);
  });

  it("public/globe holds only image files", () => {
    const found = [...files(join(ROOT, "public", "globe"))].map((f) => extname(f).toLowerCase());
    assert.ok(found.length > 0);
    assert.deepEqual(found.filter((e) => ![".jpg", ".png"].includes(e)), []);
  });

  it("every file in public/globe matches the SHA-256 recorded in the provenance manifest", () => {
    const manifest = JSON.parse(read("scripts/globe/texture-manifest.json"));
    const derived = Object.entries(manifest.derived) as Array<[string, { sha256: string; bytes: number }]>;
    const onDisk = [...files(join(ROOT, "public", "globe"))].map((f) => f.split(/[\\/]/).pop()).sort();
    assert.deepEqual(derived.map(([name]) => name).sort(), onDisk, "no undocumented file, no missing file");
    for (const [name, record] of derived) {
      const bytes = readFileSync(join(ROOT, "public", "globe", name));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), record.sha256, name);
      assert.equal(bytes.length, record.bytes, name);
    }
  });

  it("the manifest records the exact NASA source, date, hash and credit for each downloaded file", () => {
    const manifest = JSON.parse(read("scripts/globe/texture-manifest.json"));
    assert.match(manifest.retrievedAt, /^2026-\d\d-\d\dT/);
    for (const key of ["day", "clouds"]) {
      const source = manifest.sources[key];
      assert.match(source.url, /^https:\/\/assets\.science\.nasa\.gov\/content\/dam\/science\/esd\/eo\//);
      assert.match(source.sha256, /^[0-9a-f]{64}$/);
      assert.match(source.credit, /NASA Earth Observatory/);
      assert.match(source.page, /^https:\/\/science\.nasa\.gov\/earth\/earth-observatory\//);
      assert.ok(source.bytes > 100_000);
    }
    assert.match(manifest.sources.day.title, /Blue Marble: Next Generation with Topography and Bathymetry, July/);
  });
});

describe("globe prototype: the outline data's provenance record matches the files", () => {
  const generated = join(ROOT, "data", "generated");
  const present = existsSync(join(generated, "globe-boundaries.json")) && existsSync(join(generated, "globe-overlay.json"));
  const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

  it("the manifest records the outline file by SHA-256, and the file says it is provisional ODbL OpenStreetMap data", { skip: present ? false : "run npm run data:build and npm run data:build-globe first" }, () => {
    const overlay = JSON.parse(readFileSync(join(generated, "globe-overlay.json"), "utf8"));
    const record = overlay.meta.inputs["globe-boundaries.json"];
    assert.equal(record.sha256, sha(join(generated, "globe-boundaries.json")));
    const layer = JSON.parse(readFileSync(join(generated, "globe-boundaries.json"), "utf8"));
    assert.equal(record.shapes, layer.shapes.length);
    assert.equal(layer.meta.counts.shapes, layer.meta.counts.districts + layer.meta.counts.blocks);
    assert.match(layer.meta.licence, /ODbL|Open Database Licence/);
    assert.match(layer.meta.attribution, /OpenStreetMap contributors/);
    assert.match(layer.meta.status, /^Provisional/);
    assert.ok(layer.meta.snapshots.length >= 1 && /^2026-/.test(layer.meta.snapshots[0]));
  });

  it("no geometry file is in public/", () => {
    const found = [...files(join(ROOT, "public"))].filter((f) => /\.(json|geojson|topojson)$/i.test(f)).map(rel);
    assert.deepEqual(found, []);
  });
});
