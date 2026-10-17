import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import nextConfig from "../../next.config.ts";

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
