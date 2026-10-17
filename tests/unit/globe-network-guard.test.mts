import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { networkViolations, type AllowedFetch } from "./helpers/network-guard.mts";

/**
 * The network guard, widened by exactly one request: the globe's same-origin GET of /geo/globe-boundaries.json.
 * These tests check the real source tree against the allowed list, and then check that the guard still catches
 * everything it must (external URLs, arbitrary fetch URLs, XHR, sockets, beacons, a third fetch, and a file asking
 * for another file's URL), with synthetic sources, so a guard that has gone slack fails here.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ALLOWED: AllowedFetch[] = [
  { file: "src/features/territory/components/Workspace.tsx", url: "/geo/boundaries.json" },
  { file: "src/features/globe/layer-client.ts", url: "/geo/globe-boundaries.json" },
];

function* files(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

describe("network guard: the real source tree", () => {
  const sources: Record<string, string> = {};
  for (const file of files(join(ROOT, "src"))) {
    if ([".ts", ".tsx", ".mts", ".mjs"].includes(extname(file))) sources[relative(ROOT, file).split("\\").join("/")] = readFileSync(file, "utf8");
  }

  it("holds: only the two allowed files request anything, each only its own literal URL", () => {
    assert.deepEqual(networkViolations(sources, ALLOWED), []);
  });

  it("the globe's allowed file is the only globe file that can request, and it asks for the globe's URL, not the workspace's", () => {
    const globe = Object.keys(sources).filter((f) => f.startsWith("src/features/globe/") || f.startsWith("src/app/globe-prototype/"));
    const requesting = globe.filter((f) => /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon/.test(sources[f]));
    assert.deepEqual(requesting, ["src/features/globe/layer-client.ts"]);
    assert.match(sources["src/features/globe/layer-client.ts"], /const LAYER_URL = "\/geo\/globe-boundaries\.json";/);
    assert.doesNotMatch(sources["src/features/globe/layer-client.ts"], /"\/geo\/boundaries\.json"/);
  });

  it("the server route for the globe's file is a GET that reads no request input and takes no URL", () => {
    const route = sources["src/app/geo/globe-boundaries.json/route.ts"].replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(route, /export async function GET\(\)/, "no request argument: nothing from the caller can choose a file");
    assert.match(route, /path\.join\(process\.cwd\(\), "data", "generated"\)/);
    assert.doesNotMatch(route, /request|searchParams|params|headers\(|cookies\(/);
  });
});

describe("network guard: it still blocks everything else", () => {
  const client = (url: string, extra = "") => `const LAYER_URL = "${url}";\nexport const load = (s: AbortSignal) => fetch(LAYER_URL, { signal: s, cache: "no-cache" });\n${extra}`;
  const good = { "src/features/globe/layer-client.ts": client("/geo/globe-boundaries.json"), "src/features/territory/components/Workspace.tsx": client("/geo/boundaries.json") };
  const flagged = (sources: Record<string, string>) => networkViolations({ ...good, ...sources }, ALLOWED);

  it("accepts the two allowed requests as written", () => {
    assert.deepEqual(networkViolations(good, ALLOWED), []);
  });

  it("blocks an external URL in an allowed file, an absolute same-host URL, a protocol-relative URL and a parent path", () => {
    for (const url of ["https://example.test/outlines.json", "http://127.0.0.1:3000/geo/globe-boundaries.json", "//cdn.example.test/outlines.json", "/geo/../secret.json", "/geo/globe-boundaries.json?x=1"]) {
      assert.notDeepEqual(flagged({ "src/features/globe/layer-client.ts": client(url) }), [], url);
    }
  });

  it("blocks a file asking for the other file's URL (the globe may not read the workspace layer, nor the reverse)", () => {
    assert.match(flagged({ "src/features/globe/layer-client.ts": client("/geo/boundaries.json") }).join("\n"), /requests \/geo\/boundaries\.json, not \/geo\/globe-boundaries\.json/);
    assert.match(flagged({ "src/features/territory/components/Workspace.tsx": client("/geo/globe-boundaries.json") }).join("\n"), /not \/geo\/boundaries\.json/);
  });

  it("blocks an arbitrary fetch URL: a variable, a template, a parameter or a concatenation, in any file", () => {
    const attempts = [
      'export const a = (u: string) => fetch(u);',
      "export const b = (id: string) => fetch(`/geo/${id}.json`);",
      'export const c = () => fetch("/api/anything");',
      'export const d = (p: string) => fetch("/geo/" + p);',
      'export const e = () => window.fetch("https://example.test/x");',
    ];
    for (const code of attempts) assert.match(flagged({ "src/features/globe/other.ts": code }).join("\n"), /not on the allowed list/, code);
    for (const code of attempts) assert.notDeepEqual(flagged({ "src/features/globe/layer-client.ts": client("/geo/globe-boundaries.json", code) }), [], `second fetch in the allowed file: ${code}`);
  });

  it("blocks XHR, sockets, event streams, beacons and geolocation, in any file, allowed or not", () => {
    const attempts = [
      'new XMLHttpRequest().open("GET", "/geo/globe-boundaries.json");',
      'new WebSocket("ws://127.0.0.1:3000/x");',
      'new EventSource("/geo/globe-boundaries.json");',
      'navigator.sendBeacon("/geo/globe-boundaries.json", "x");',
      "navigator.geolocation.getCurrentPosition(() => {});",
    ];
    for (const code of attempts) {
      assert.match(flagged({ "src/features/globe/other.ts": code }).join("\n"), /not on the allowed list/, code);
      assert.match(flagged({ "src/features/globe/layer-client.ts": client("/geo/globe-boundaries.json", code) }).join("\n"), /XHR, a socket|not hold exactly one fetch/, `in the allowed file: ${code}`);
    }
  });

  it("blocks a new file that is not on the list even if it copies the allowed code exactly", () => {
    assert.match(flagged({ "src/features/globe/second-client.ts": client("/geo/globe-boundaries.json") }).join("\n"), /second-client\.ts: .*not on the allowed list/);
  });

  it("blocks an allowed file that stops using its constant, or declares it twice", () => {
    assert.notDeepEqual(flagged({ "src/features/globe/layer-client.ts": 'export const x = () => fetch("/geo/globe-boundaries.json");' }), []);
    assert.notDeepEqual(flagged({ "src/features/globe/layer-client.ts": client("/geo/globe-boundaries.json", 'const OTHER = "/x"; fetch(OTHER);') }), []);
  });
});
