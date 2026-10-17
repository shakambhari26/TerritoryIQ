import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Guards for the globe prototype (src/features/globe, src/app/globe-prototype, scripts/globe, public/globe).
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
const GLOBE_SOURCES = [...sources("src/features/globe"), ...sources("src/app/globe-prototype")];

describe("globe prototype: the browser makes no outbound request", () => {
  it("the one request is the same-origin layer fetch in layer-client.ts; no XHR, socket, beacon or geolocation anywhere", () => {
    const fetches = /\bfetch\s*\(/;
    assert.deepEqual(GLOBE_SOURCES.filter((f) => fetches.test(readFileSync(f, "utf8"))).map(rel), ["src/features/globe/layer-client.ts"]);
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

  it("outline path data is never in public/ and never in the page props: the manifest holds summaries only", () => {
    assert.ok(!existsSync(join(ROOT, "public", "geo")));
    const builder = read("scripts/globe/build_overlay.py");
    const geometryFor = builder.slice(builder.indexOf("def geometry_for"), builder.indexOf("out_blocks = []"));
    assert.doesNotMatch(geometryFor, /"d"/, "the builder does not write path data into the manifest");
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
    const page = read("src/app/globe-prototype/page.tsx");
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
    // The page (for the manifest props) and the globe's outline route (for the integrity record). Nothing else.
    assert.deepEqual(importers, ["src/app/geo/globe-boundaries.json/route.ts", "src/app/globe-prototype/page.tsx"]);
    const clientImporters = sources("src")
      .filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8")))
      .filter((f) => /overlay\.server/.test(readFileSync(f, "utf8")));
    assert.deepEqual(clientImporters, []);
  });

  it("the Territory Workspace does not import the globe", () => {
    const offenders = sources("src")
      .filter((f) => !f.includes(`${join("src", "features", "globe")}`) && !f.includes(join("src", "app", "globe-prototype")))
      // The globe's own outline route is part of the prototype; the workspace's route (geo/boundaries.json) is not.
      .filter((f) => rel(f) !== "src/app/geo/globe-boundaries.json/route.ts")
      .filter((f) => /features\/globe|globe-prototype/.test(readFileSync(f, "utf8")))
      .map(rel);
    assert.deepEqual(offenders, []);
    assert.doesNotMatch(read("src/app/geo/boundaries.json/route.ts"), /globe/i, "the workspace's boundary route does not know about the globe");
  });
});

describe("globe prototype: wording stays provisional", () => {
  it("no text calls a link verified or an outline official", () => {
    for (const file of sources("src/features/globe", [".tsx", ".ts"])) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /\b(?:verified|confirmed)\s+(?:link|match|boundary|outline|association)/i, rel(file));
      assert.doesNotMatch(text, /\bofficial (?:boundary|outline|border)\b/i, rel(file));
    }
  });

  it("the legend and the page keep the attribution and the provisional wording on screen", () => {
    const experience = read("src/features/globe/components/GlobeExperience.tsx");
    assert.match(experience, /meta\.attribution/);
    assert.match(experience, /provisional and not official boundaries/);
    assert.match(experience, /Provisional outlines/);
    assert.match(experience, /NASA Earth Observatory/);
  });

  it("colour semantics are their own states and never reuse the allocation classification names", () => {
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const file of ["styles.ts", "types.ts"]) assert.doesNotMatch(code(read(`src/features/globe/${file}`)), /Assigned|Vacant|Unallocated|Data Missing/, file);
    assert.match(read("src/features/globe/types.ts"), /type UnitState = "represented" \| "no-representative" \| "unresolved"/);
  });
});

describe("globe prototype: Python tooling and asset provenance", () => {
  const python = (name: string) => read(`scripts/globe/${name}`);

  it("only the texture fetcher can reach a network: one host, a generic User-Agent, no address", () => {
    const fetcher = python("fetch_textures.py");
    assert.match(fetcher, /USER_AGENT = "TerritoryIQ-local-prototype\/0\.1"/);
    assert.match(fetcher, /HOST = "assets\.science\.nasa\.gov"/);
    assert.equal(fetcher.match(/headers=\{/g)?.length, 1);
    assert.doesNotMatch(fetcher, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
    const hosts = [...fetcher.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]);
    for (const host of hosts) assert.ok(host === "assets.science.nasa.gov" || host === "science.nasa.gov", host);
    const builder = python("build_overlay.py");
    assert.doesNotMatch(builder, /urllib|requests|socket|http\.client|\bftp/);
  });

  it("the build script writes only under data/generated/, and the fetcher only under public/globe/ and scripts/globe/", () => {
    const builder = python("build_overlay.py");
    assert.match(builder, /GENERATED = ROOT \/ "data" \/ "generated"/);
    assert.doesNotMatch(builder, /"public"|data-source/);
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
  const present = existsSync(join(generated, "globe-boundaries.json")) && existsSync(join(generated, "boundaries.json"));
  const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

  it("records the globe's outline file and the workspace layer it was cut from, by SHA-256, and says it is provisional ODbL data", { skip: present ? false : "run npm run data:build and python -I scripts/globe/build_overlay.py first" }, () => {
    const record = JSON.parse(read("scripts/globe/texture-manifest.json")).outlineData;
    assert.equal(record.file, "data/generated/globe-boundaries.json");
    assert.equal(record.servedAt, "/geo/globe-boundaries.json");
    assert.equal(record.sha256, sha(join(generated, "globe-boundaries.json")));
    assert.equal(record.bytes, readFileSync(join(generated, "globe-boundaries.json")).length);
    assert.equal(record.derivedFrom.sha256, sha(join(generated, "boundaries.json")));
    assert.equal(record.derivedFrom.bytes, readFileSync(join(generated, "boundaries.json")).length);
    const overlay = JSON.parse(readFileSync(join(generated, "globe-overlay.json"), "utf8"));
    assert.equal(overlay.meta.inputs["globe-boundaries.json"].sha256, record.sha256, "the manifest the server checks against says the same");
    assert.equal(record.shapes, record.districts + record.blocks);
    assert.match(record.licence, /ODbL|Open Database Licence/);
    assert.match(record.attribution, /OpenStreetMap contributors/);
    assert.match(record.status, /^Provisional/);
    assert.ok(record.snapshots.length >= 1 && /^2026-/.test(record.snapshots[0]));
  });

  it("the texture script keeps this record when it rewrites the manifest", () => {
    assert.match(read("scripts/globe/fetch_textures.py"), /get\("outlineData"\)/);
  });

  it("no geometry file is in public/", () => {
    const found = [...files(join(ROOT, "public"))].filter((f) => /\.(json|geojson|topojson)$/i.test(f)).map(rel);
    assert.deepEqual(found, []);
  });
});
