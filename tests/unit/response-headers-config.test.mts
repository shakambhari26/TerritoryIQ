import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import nextConfig from "../../next.config.ts";
import { globeLayerResponse, type GlobeLayerFault } from "../../src/features/globe/layer-integrity.ts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/**
 * The declared header rules, as a guard that reads the config. The proof that Next actually sends them (it sets its
 * own `s-maxage` on prerendered pages) is tests/e2e/response-headers.test.mts, which reads real responses.
 */
describe("next.config.ts response-header rules", async () => {
  const rules = (await nextConfig.headers?.()) ?? [];
  const valuesFor = (source: string, key: string) =>
    rules.filter((rule) => rule.source === source).flatMap((rule) => rule.headers).filter((h) => h.key === key).map((h) => h.value);

  it("marks the sensitive pages and the boundary routes private, no-store", () => {
    for (const source of ["/", "/workspace", "/globe", "/geo/:path*"]) {
      assert.deepEqual(valuesFor(source, "Cache-Control"), ["private, no-store"], source);
    }
  });

  it("every response the boundary route builds carries the same Cache-Control as the /geo rule", () => {
    // `next.config.ts` and the route can drift apart unnoticed (the route once said `no-store`, the rule `private,
    // no-store`). The route cannot be imported here (it reads the generated data), so this reads its source: each
    // `Cache-Control` it sets, literal or named constant, must equal the rule's value, and there must be one per response.
    const [policy] = valuesFor("/geo/:path*", "Cache-Control");
    assert.equal(policy, "private, no-store");
    const code = readFileSync(path.join(ROOT, "src", "app", "geo", "boundaries.json", "route.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const constants = new Map([...code.matchAll(/^const (\w+)\s*=\s*"([^"]*)"/gm)].map((m) => [m[1], m[2]] as const));
    const set = [...code.matchAll(/["']Cache-Control["']\s*:\s*(?:"([^"]*)"|(\w+))/g)].map((m) => m[1] ?? constants.get(m[2]));
    const responses = code.match(/\bnew Response\(|\bResponse\.json\(/g) ?? [];
    assert.ok(responses.length >= 2, `${responses.length} responses found (the layer and the "not built" answer)`);
    assert.equal(set.length, responses.length, "every response sets a Cache-Control");
    for (const value of set) assert.equal(value, policy);
  });

  it("every response the globe outline helper builds carries the /geo rule's Cache-Control, on success and on each refusal", async () => {
    // The helper behind /geo/globe-boundaries.json once said `no-store` while the rule said `private, no-store`. It
    // takes a plain result, so it is called here with a success and one refusal per fault (no generated data needed).
    const [policy] = valuesFor("/geo/:path*", "Cache-Control");
    const statuses: Record<GlobeLayerFault, number> = { unavailable: 404, missing: 404, identity: 500, tampered: 500, invalid: 500 };
    const ok = globeLayerResponse({ ok: true, text: "{}", sha256: "0" });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), policy, "success");
    assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
    assert.equal(await ok.text(), "{}");
    for (const [fault, status] of Object.entries(statuses) as Array<[GlobeLayerFault, number]>) {
      const refused = globeLayerResponse({ ok: false, fault, reason: "reason" });
      assert.equal(refused.status, status, fault);
      assert.equal(refused.headers.get("cache-control"), policy, fault);
      assert.equal(refused.headers.get("x-content-type-options"), "nosniff", fault);
      assert.deepEqual(await refused.json(), { code: fault, error: "reason" }, fault);
    }
  });

  it("the globe outline helper's source declares no other Cache-Control value", () => {
    const [policy] = valuesFor("/geo/:path*", "Cache-Control");
    const code = readFileSync(path.join(ROOT, "src", "features", "globe", "layer-integrity.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const constants = new Map([...code.matchAll(/^const (\w+)\s*=\s*"([^"]*)"/gm)].map((m) => [m[1], m[2]] as const));
    const set = [...code.matchAll(/["']Cache-Control["']\s*:\s*(?:"([^"]*)"|(\w+))/g)].map((m) => m[1] ?? constants.get(m[2]));
    assert.ok(set.length >= 1, "the helper sets a Cache-Control");
    for (const value of set) assert.equal(value, policy);
  });

  it("does not put a Cache-Control on the catch-all, so static assets keep Next's immutable policy", () => {
    assert.deepEqual(valuesFor("/:path*", "Cache-Control"), []);
  });

  it("sends the baseline on every path", () => {
    assert.deepEqual(valuesFor("/:path*", "X-Content-Type-Options"), ["nosniff"]);
    assert.deepEqual(valuesFor("/:path*", "Referrer-Policy"), ["no-referrer"]);
    assert.deepEqual(valuesFor("/:path*", "X-Frame-Options"), ["DENY"]);
    assert.match(valuesFor("/:path*", "Content-Security-Policy")[0] ?? "", /frame-ancestors 'none'/);
  });

  it("holds no script or style CSP directive yet", () => {
    // A restrictive script-src or style-src would break Next's inline bootstrap scripts and the inline styles; it needs
    // its own design and test (see the comment in next.config.ts).
    const csp = valuesFor("/:path*", "Content-Security-Policy")[0] ?? "";
    assert.doesNotMatch(csp, /\b(default-src|script-src|style-src|img-src|connect-src|worker-src|font-src)\b/);
  });

  it("every feature Permissions-Policy switches off is one the source never uses", () => {
    const used = /geolocation|getUserMedia|requestFullscreen|DeviceOrientation|DeviceMotion|navigator\.(?:bluetooth|usb|serial|hid|xr)|PaymentRequest|MIDIAccess|getDisplayMedia|\.requestPictureInPicture|\.play\(/;
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? sources(path.join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [path.join(dir, entry.name)] : [],
      );
    const files = sources(path.join(ROOT, "src"));
    assert.ok(files.length > 50, `${files.length} source files scanned`);
    for (const file of files) assert.doesNotMatch(readFileSync(file, "utf8"), used, path.relative(ROOT, file));
  });
});
