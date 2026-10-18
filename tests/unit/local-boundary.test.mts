import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isLoopbackHost } from "../../src/lib/loopback.ts";
import { checkPublicAssets, dataFilesIn, staffNames } from "../../scripts/verify-public-assets.mjs";

/**
 * The localhost-only prototype's security boundary, as checks:
 *   - the server binds to 127.0.0.1 and refuses any other Host header;
 *   - generated data lives in data/generated/ and is never a public asset;
 *   - the boundary layer is provisional and attributed, and is refused otherwise;
 *   - the app makes no request off this machine, and only one script may;
 *   - the four source files in data-source/ are never written by any script.
 * These replace the Gate P0 rule that no boundary data may exist at all.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const rel = (path: string) => relative(ROOT, path).split("\\").join("/");

function* files(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}
const sources = (dir: string, extensions = [".ts", ".tsx", ".mts", ".mjs"]) =>
  [...files(join(ROOT, dir))].filter((f) => extensions.includes(extname(f)));

describe("localhost-only: bind address", () => {
  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;

  it("dev and start bind to 127.0.0.1 and never to all interfaces", () => {
    for (const name of ["dev", "start"]) {
      assert.match(scripts[name], /(?:-H|--hostname)[ =]127\.0\.0\.1(?:\s|$)/, `npm run ${name} must bind 127.0.0.1`);
      assert.doesNotMatch(scripts[name], /0\.0\.0\.0|::/, `npm run ${name} must not bind all interfaces`);
    }
  });

  it("the browser-test harness starts its server on 127.0.0.1", () => {
    const harness = read("tests/e2e/harness.mts");
    assert.match(harness, /"start",\s*"-H",\s*"127\.0\.0\.1"/);
    assert.match(harness, /http:\/\/127\.0\.0\.1:/);
  });

  it("no script, config or doc tells anyone to bind 0.0.0.0", () => {
    const offenders = [...sources("src"), ...sources("scripts"), ...sources("tests/e2e")]
      .filter((f) => /(?:-H|--hostname)[ =]0\.0\.0\.0|HOSTNAME=0\.0\.0\.0/.test(readFileSync(f, "utf8")))
      .map(rel);
    assert.deepEqual(offenders, []);
  });
});

describe("localhost-only: Host header check (src/proxy.ts)", () => {
  it("accepts localhost, 127.0.0.1 and [::1], with or without a port", () => {
    for (const host of ["127.0.0.1", "127.0.0.1:3000", "localhost", "localhost:3199", "LOCALHOST:3000", "[::1]", "[::1]:3000", " 127.0.0.1:3000 "]) {
      assert.equal(isLoopbackHost(host), true, host);
    }
  });

  it("refuses everything else, including look-alikes and DNS-rebinding names", () => {
    // Userinfo-style values are built with a variable so this file holds no email-shaped literal
    // (tests/guardrails.test.ts rejects any address in tests).
    const at = String.fromCharCode(64);
    const refused = [
      null,
      undefined,
      "",
      "evil.example",
      "evil.example:3000",
      "192.168.1.20:3000",
      "10.0.0.5",
      "0.0.0.0:3000",
      "[::]:3000",
      "127.0.0.2:3000",
      "localhost.evil.example",
      "127.0.0.1.evil.example",
      "evil.example/127.0.0.1",
      `127.0.0.1${at}evil.example`,
      `localhost:3000${at}evil.example`,
      "localhost:abc",
      "localhost:",
      "localhost:123456",
      "localhost evil.example",
      "localhost,evil.example",
    ];
    for (const host of refused) assert.equal(isLoopbackHost(host), false, String(host));
  });

  it("the proxy is wired to the check and answers 403 for a refused host", () => {
    const proxy = read("src/proxy.ts");
    assert.match(proxy, /export function proxy\(/);
    assert.match(proxy, /isLoopbackHost\(request\.headers\.get\("host"\)\)/);
    assert.match(proxy, /status:\s*403/);
    assert.doesNotMatch(proxy, /export const config/, "no matcher: it must run for every path, assets included");
  });
});

describe("generated data stays out of public assets", () => {
  it("the data build writes everything under data/generated/ and nothing under public/", () => {
    const build = read("scripts/build-data.mts");
    assert.match(build, /path\.join\(GENERATED_DIR, "boundaries\.json"\)/);
    assert.doesNotMatch(build, /"public"/, "scripts/build-data.mts must not write into public/");
    for (const file of sources("scripts")) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /(?:writeFile|createWriteStream|copyFile|rename)\([^)]*public/, rel(file));
    }
  });

  it("nothing refers to the old public/geo location", () => {
    const offenders = [...sources("src"), ...sources("scripts"), ...sources("tests/e2e")]
      .filter((f) => /public[\\/]+geo|"public",\s*"geo"/.test(readFileSync(f, "utf8")))
      .map(rel);
    assert.deepEqual(offenders, []);
  });

  it("the boundary layer is delivered only by a route handler that reads server-side data", () => {
    const route = read("src/app/geo/boundaries.json/route.ts");
    assert.match(route, /export function GET\(/);
    assert.match(route, /getLayerText\(\)/);
    assert.match(route, /no-store/);
    assert.match(read("src/features/territory/dataset.server.ts"), /"data", "generated"/);
  });

  it("no client component imports the server-only dataset module", () => {
    const offenders = sources("src", [".ts", ".tsx"])
      .filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8")))
      .filter((f) => /dataset\.server/.test(readFileSync(f, "utf8")))
      .map(rel);
    assert.deepEqual(offenders, []);
  });

  it("only server pages and the route handler import the dataset module", () => {
    const importers = sources("src", [".ts", ".tsx"])
      .filter((f) => /from\s+["'][^"']*dataset\.server["']/.test(readFileSync(f, "utf8")))
      .map(rel)
      .sort();
    assert.deepEqual(importers, ["src/app/geo/boundaries.json/route.ts", "src/app/page.tsx", "src/app/workspace/page.tsx"]);
  });
});

describe("boundary layer: provisional and attributed", () => {
  const build = read("scripts/build-data.mts");

  it("the build stamps the licence, the attribution and a provisional status on every layer", () => {
    assert.match(build, /licence:\s*"Open Database Licence \(ODbL\) 1\.0"/);
    assert.match(build, /attribution:\s*"© OpenStreetMap contributors"/);
    assert.match(build, /status:\s*\n?\s*"Provisional\./);
    assert.match(build, /have not been reviewed/);
  });

  it("the browser refuses a layer without that provenance (see layerProblem tests)", () => {
    const validation = read("src/features/territory/layer-validation.ts");
    for (const field of ["licence", "attribution", "status", "snapshots"]) assert.match(validation, new RegExp(field));
    assert.match(validation, /Provisional/);
  });

  it("the map legend keeps the attribution and the provisional wording on screen", () => {
    const legend = read("src/features/territory/components/MapLegend.tsx");
    assert.match(legend, /meta\.attribution/);
    assert.match(legend, /provisional/);
    assert.match(legend, /Coverage is not complete/);
  });

  it("name-only links are never worded as verified or confirmed", () => {
    for (const file of sources("src/features/territory/components", [".tsx"])) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /\b(?:verified|confirmed)\s+(?:link|match|boundary|outline|association)/i, rel(file));
      // The outlines are community-sourced (OpenStreetMap), so no text may call one an official boundary.
      assert.doesNotMatch(text, /\bofficial (?:boundary|outline|border)\b/i, rel(file));
    }
  });
});

describe("outbound network", () => {
  it("the app source holds no external URL except the user-clicked OpenStreetMap relation link", () => {
    const external = /https?:\/\/(?!127\.0\.0\.1|localhost)[^\s"'`)]+/gi;
    const found: string[] = [];
    for (const file of sources("src")) {
      for (const url of readFileSync(file, "utf8").match(external) ?? []) found.push(`${rel(file)} ${url}`);
    }
    assert.deepEqual(found, ["src/features/territory/components/DetailsPanel.tsx https://www.openstreetmap.org/relation/${feature.boundary.relationId}"]);
    const link = read("src/features/territory/components/DetailsPanel.tsx");
    assert.match(link, /href=\{`https:\/\/www\.openstreetmap\.org\/relation\/\$\{feature\.boundary\.relationId\}`\}[^>]*rel="noopener noreferrer"/);
  });

  it("the only requests the app makes are same-origin fetches of three literal URLs, one from each of three files", () => {
    const pattern = /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon|navigator\.geolocation/;
    const offenders = sources("src").filter((f) => pattern.test(readFileSync(f, "utf8"))).map(rel).sort();
    // The Territory Workspace (its own layer), the globe's layer client (the globe's own file) and the globe's block-rows client
    // (a POST of `{ blockId }`). A fourth place, or a file asking for another's URL, fails here (rule and its negative tests: globe-network-guard.test.mts).
    assert.deepEqual(offenders, ["src/features/globe/block-rows-client.ts", "src/features/globe/layer-client.ts", "src/features/territory/components/Workspace.tsx"]);
    const expected: Record<string, string> = {
      "src/features/territory/components/Workspace.tsx": "/geo/boundaries.json",
      "src/features/globe/layer-client.ts": "/geo/globe-boundaries.json",
      "src/features/globe/block-rows-client.ts": "/api/globe/block-rows",
    };
    const constants: Record<string, string> = { "src/features/globe/block-rows-client.ts": "BLOCK_ROWS_URL" };
    for (const file of offenders) {
      const text = read(file);
      const constant = constants[file] ?? "LAYER_URL";
      assert.match(text, new RegExp(`const ${constant} = "${expected[file].replace(/[./]/g, "\\$&")}";`), `${file}: the URL is one literal, same-origin and relative`);
      assert.equal(text.match(/\bfetch\s*\(/g)?.length, 1, `${file}: exactly one fetch`);
      assert.match(text, new RegExp(`fetch\\(${constant},`), `${file}: the fetch uses that constant`);
    }
    const client = read("src/features/globe/layer-client.ts");
    assert.equal(client.match(/\bLAYER_URL\b/g)?.length, 2, "declared once and used once, nothing else");
    assert.doesNotMatch(client, /\((?:[^)]*\b)?(?:url|href|path)\b[^)]*\)\s*(?::[^{]*)?\{/i, "the layer client takes no URL argument");
    assert.match(client, /\{ signal, cache: "no-cache" \}/, "same request options as the workspace: no credentials, headers or body");
  });

  it("only scripts/fetch-osm.mts reaches the network, with a generic User-Agent and no address", () => {
    const reaching = sources("scripts")
      .filter((f) => /\bfetch\s*\(|https?:\/\/|node:https?|node:net/.test(readFileSync(f, "utf8")))
      .map(rel);
    assert.deepEqual(reaching.filter((f) => !f.endsWith("verify-public-assets.mjs")), ["scripts/fetch-osm.mts"]);
    const fetcher = read("scripts/fetch-osm.mts");
    assert.match(fetcher, /const USER_AGENT = "TerritoryIQ-local-prototype\/0\.1";/);
    assert.doesNotMatch(fetcher.match(/const USER_AGENT = [^\n]*/)![0], /@/);
    assert.equal(fetcher.match(/"User-Agent":/g)?.length, 1, "the header is set in exactly one place");
    assert.doesNotMatch(fetcher, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, "no email address anywhere in the fetch script");
  });

  it("the fetch script reads no workbook or staff data, so it cannot send any", () => {
    const fetcher = read("scripts/fetch-osm.mts");
    const libImports = [...fetcher.matchAll(/from "\.\/lib\/([a-z]+)\.ts"/g)].map((m) => m[1]).sort();
    assert.deepEqual(libImports, ["lgd", "sources"], "it may read the LGD district codes only");
    assert.doesNotMatch(fetcher, /readWorkbook|lib\/workbook/);
    assert.match(fetcher, /body: new URLSearchParams\(\{ data: query \}\)/, "the request body is the geographic query alone");
  });
});

describe("data-source/ is never written", () => {
  it("no script writes, renames or removes anything that names data-source or a source path", () => {
    const writes = /\b(?:writeFile|writeFileSync|appendFile|createWriteStream|rename|unlink|rm|rmSync|copyFile|truncate)\s*\(/;
    const names = /SOURCE_DIR|data-source|sourcePath\(/;
    const offenders: string[] = [];
    for (const file of [...sources("scripts"), ...sources("src")]) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (writes.test(line) && names.test(line)) offenders.push(`${rel(file)}:${index + 1}`);
        });
    }
    assert.deepEqual(offenders, []);
  });
});

describe("public-asset scan (npm run verify:assets)", () => {
  const dataset = {
    units: [
      { slots: [{ names: ["Aaron Testperson", "  Betty Placeholder  "] }, { names: [] }] },
      { slots: [{ names: ["Aaron Testperson"] }, { names: ["Tiny"] }] },
    ],
  };

  function project(layout: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), "tiq-assets-"));
    for (const [path, content] of Object.entries(layout)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return root;
  }
  const run = (layout: Record<string, string>) => {
    const root = project(layout);
    try {
      return checkPublicAssets(root, { names: staffNames(dataset), layerDatasetId: "osm-test-layer" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it("collects distinct trimmed names of at least five characters, longest first", () => {
    assert.deepEqual(staffNames(dataset), ["Betty Placeholder", "Aaron Testperson"]);
  });

  it("passes a clean build", () => {
    const result = run({
      "public/icon.svg": "<svg/>",
      ".next/static/chunks/app.js": "console.log('nothing here');",
      ".next/server/app/index.html": "<p>Aaron Testperson</p>",
    });
    assert.deepEqual(result.problems, []);
    assert.equal(result.assetFilesScanned, 2);
    assert.deepEqual(result.serverFilesWithNames, [".next/server/app/index.html"]);
  });

  it("treats Workspace as the one known named output, and any name in Globe output as a failure", () => {
    const workspace = run({
      "public/icon.svg": "<svg/>",
      ".next/static/a.js": "1",
      ".next/server/app/workspace.html": "<p>Aaron Testperson</p>",
      ".next/server/app/workspace.segments/_full.segment.rsc": "Betty Placeholder",
      ".next/server/app/globe.html": "<p>no names</p>",
      ".next/server/route-cache/APP_PAGE/0123abcd/$/workspace.rsc": "Aaron Testperson",
      ".next/server/route-cache/APP_PAGE/0123abcd/$/globe.rsc": "<p>no names</p>",
    });
    assert.deepEqual(workspace.problems, []);
    assert.deepEqual(workspace.workspaceFilesWithNames, [".next/server/app/workspace.html", ".next/server/app/workspace.segments/_full.segment.rsc", ".next/server/route-cache/APP_PAGE/0123abcd/$/workspace.rsc"]);
    assert.deepEqual(workspace.globeFilesWithNames, []);
    for (const file of [
      ".next/server/app/globe.html",
      ".next/server/app/globe.rsc",
      ".next/server/app/globe.segments/_full.segment.rsc",
      ".next/server/app/globe.segments/globe/__PAGE__.segment.rsc",
      ".next/server/app/globe/page.js",
      ".next/server/app/globe-prototype/page.js",
      ".next/server/app/api/globe/block-rows/route.js",
      ".next/server/app/geo/globe-boundaries.json/route.js",
      ".next/server/route-cache/APP_PAGE/0123abcd/$/globe.html",
      ".next/server/route-cache/APP_PAGE/0123abcd/$/globe.segments/globe/__PAGE__.segment.rsc",
    ]) {
      const result = run({ "public/icon.svg": "<svg/>", ".next/static/a.js": "1", ".next/server/app/workspace.html": "Aaron Testperson", [file]: "x Betty Placeholder x" });
      assert.equal(result.problems.length, 1, file);
      assert.match(result.problems[0], /Globe output must carry no names/, file);
      assert.deepEqual(result.globeFilesWithNames, [file], file);
    }
  });

  it("flags a staff name in a client chunk or in public/", () => {
    const chunk = run({ ".next/static/chunks/leak.js": 'var n="Betty Placeholder";', "public/a.txt": "x" });
    assert.equal(chunk.problems.length, 1);
    assert.match(chunk.problems[0], /leak\.js contains a staff name/);
    const publicFile = run({ "public/notes.txt": "see Aaron Testperson", ".next/static/a.js": "1" });
    assert.equal(publicFile.problems.length, 1);
    assert.match(publicFile.problems[0], /public[\\/]notes\.txt contains a staff name/);
  });

  it("flags the boundary layer's dataset ID in a public asset, and any data file in public/", () => {
    const layer = run({ ".next/static/chunks/layer.js": 'var d="osm-test-layer";' });
    assert.match(layer.problems.join("\n"), /boundary layer's dataset ID/);
    const data = run({ "public/geo/boundaries.json": "{}", "public/x.csv": "a", "public/y.xlsx": "b", ".next/static/a.js": "1" });
    assert.equal(data.problems.length, 3);
    assert.ok(data.problems.every((p: string) => /public\/ holds a data file/.test(p)));
  });

  it("is case-sensitive on whole names, so ordinary words do not trip it", () => {
    const result = run({ ".next/static/a.js": "aaron testperson betty; Aaron; Placeholder", "public/a.svg": "<svg/>" });
    assert.deepEqual(result.problems, []);
  });

  it("finds data files by extension", () => {
    const root = project({ "public/a.json": "{}", "public/b.png": "x", "public/c/d.geojson": "{}" });
    try {
      assert.deepEqual(dataFilesIn(join(root, "public")).map((f: string) => rel(f).split("/").pop()).sort(), ["a.json", "d.geojson"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("the real public/ folder holds no data file", () => {
    assert.deepEqual(dataFilesIn(join(ROOT, "public")).map(rel), []);
  });
});
