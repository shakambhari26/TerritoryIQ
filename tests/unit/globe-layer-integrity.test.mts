import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { GLOBE_LAYER_FILE, GLOBE_LAYER_KIND } from "../../src/features/globe/layer-identity.ts";
import { globeLayerResponse, readGlobeLayerFile, verifyGlobeLayer } from "../../src/features/globe/layer-integrity.ts";
import { mergeLayer } from "../../src/features/globe/layer-merge.ts";
import type { GlobeManifest } from "../../src/features/globe/types.ts";

/**
 * The server side of /geo/globe-boundaries.json: it serves the validated globe dataset and nothing else. Success,
 * a missing file, a tampered file, another dataset, a structurally wrong file, and an unbuilt manifest, against the
 * real generated files and tampered copies of them. Needs `npm run data:build` and `python -I scripts/globe/build_overlay.py`.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GENERATED = join(ROOT, "data", "generated");
const ready = ["globe-overlay.json", GLOBE_LAYER_FILE, "boundaries.json"].every((name) => existsSync(join(GENERATED, name)));

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("the globe outline file is served only if it is the validated dataset", { skip: ready ? false : "run npm run data:build and python -I scripts/globe/build_overlay.py first" }, () => {
  const manifest = ready ? (JSON.parse(readFileSync(join(GENERATED, "globe-overlay.json"), "utf8")) as GlobeManifest) : (null as never);
  const bytes = ready ? readFileSync(join(GENERATED, GLOBE_LAYER_FILE)) : (null as never);
  const workspaceBytes = ready ? readFileSync(join(GENERATED, "boundaries.json")) : (null as never);
  const parsed = ready ? (JSON.parse(bytes.toString("utf8")) as { meta: Record<string, unknown>; shapes: Array<{ featureId: string; d: string }> }) : (null as never);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");
  /** A manifest whose record matches `file`, to reach the checks that come after the hash. */
  const withRecord = (file: Uint8Array, shapes?: number): GlobeManifest => {
    const copy = clone(manifest);
    copy.meta.inputs[GLOBE_LAYER_FILE] = { ...copy.meta.inputs[GLOBE_LAYER_FILE], sha256: sha(file), ...(shapes === undefined ? {} : { shapes }) };
    return copy;
  };

  describe("success", () => {
    it("serves the exact bytes the build validated, with its recorded SHA-256 and identity", () => {
      const result = verifyGlobeLayer(bytes, manifest);
      assert.ok(result.ok);
      assert.equal(result.sha256, manifest.meta.inputs[GLOBE_LAYER_FILE].sha256);
      assert.equal(Buffer.from(result.text, "utf8").equals(bytes), true, "the text served is the file, byte for byte");
      assert.equal(manifest.meta.inputs[GLOBE_LAYER_FILE].datasetId, "globe-osm-west-bengal-admin-5-6");
      assert.equal(manifest.meta.inputs[GLOBE_LAYER_FILE].kind, GLOBE_LAYER_KIND);
    });

    it("reads the real directory fresh and the response carries the file, uncached and not sniffable", async () => {
      const response = globeLayerResponse(await readGlobeLayerFile(GENERATED, manifest));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(sha(Buffer.from(await response.arrayBuffer())), manifest.meta.inputs[GLOBE_LAYER_FILE].sha256);
    });

    it("the served file is exactly the validated outlines: the same set of units, each once, none the manifest rejected", () => {
      const validated = [...manifest.districts, ...manifest.blocks].filter((u) => u.geometry).map((u) => u.id).sort();
      assert.deepEqual(parsed.shapes.map((s) => s.featureId).sort(), validated);
      assert.equal(parsed.shapes.length, 332);
      assert.equal(parsed.meta.kind, GLOBE_LAYER_KIND);
      assert.match(String(parsed.meta.status), /^Provisional/);
      assert.equal((parsed.meta.derivedFrom as { sha256: string }).sha256, sha(workspaceBytes), "records which workspace layer it was cut from");
      assert.equal(manifest.meta.inputs["boundaries.json"].sha256, sha(workspaceBytes));
    });

    it("joins to the manifest in the browser with nothing refused", () => {
      const merged = mergeLayer(manifest, JSON.parse(bytes.toString("utf8")));
      assert.ok(merged.ok);
      assert.deepEqual(merged.refused, []);
    });

    it("the geometry is in data/generated and never under public/", () => {
      const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
      const publicJson = walk(join(ROOT, "public")).filter((f) => /\.(json|geojson|topojson)$/i.test(f));
      assert.deepEqual(publicJson, []);
    });
  });

  describe("missing data", () => {
    it("no bytes: missing", () => {
      const result = verifyGlobeLayer(null, manifest);
      assert.ok(!result.ok);
      assert.equal(result.fault, "missing");
    });

    it("an empty directory: missing, and the response is a 404 with a code and no data", async () => {
      const dir = mkdtempSync(join(tmpdir(), "globe-layer-"));
      try {
        const result = await readGlobeLayerFile(dir, manifest);
        assert.ok(!result.ok);
        assert.equal(result.fault, "missing");
        const response = globeLayerResponse(result);
        assert.equal(response.status, 404);
        const body = (await response.json()) as Record<string, unknown>;
        assert.deepEqual(Object.keys(body).sort(), ["code", "error"]);
        assert.equal(body.code, "missing");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("no manifest, or a manifest that records no outline file: unavailable (404)", () => {
      for (const unbuilt of [null, (() => { const m = clone(manifest); delete m.meta.inputs[GLOBE_LAYER_FILE]; return m; })(), (() => { const m = clone(manifest); delete m.meta.inputs[GLOBE_LAYER_FILE].kind; return m; })()]) {
        const result = verifyGlobeLayer(bytes, unbuilt);
        assert.ok(!result.ok);
        assert.equal(result.fault, "unavailable");
        assert.equal(globeLayerResponse(result).status, 404);
      }
    });
  });

  describe("tampered data", () => {
    it("one changed digit in one outline: tampered", () => {
      const text = bytes.toString("utf8");
      const index = text.indexOf('"d":"M') + 6;
      const changed = Buffer.from(text.slice(0, index) + (text[index] === "1" ? "2" : "1") + text.slice(index + 1), "utf8");
      assert.notDeepEqual(changed, bytes);
      const result = verifyGlobeLayer(changed, manifest);
      assert.ok(!result.ok);
      assert.equal(result.fault, "tampered");
    });

    it("an appended space, a truncation, invalid JSON, or invalid UTF-8: tampered", () => {
      for (const altered of [Buffer.concat([bytes, Buffer.from(" ")]), bytes.subarray(0, bytes.length - 1), Buffer.from("not json"), Buffer.from([0xff, 0xfe, 0x7b, 0x7d])]) {
        const result = verifyGlobeLayer(altered, manifest);
        assert.ok(!result.ok);
        assert.equal(result.fault, "tampered");
      }
    });

    it("a file altered after it was read once is caught on the next read, and the response is a 500 with no outline data", async () => {
      const dir = mkdtempSync(join(tmpdir(), "globe-layer-"));
      try {
        writeFileSync(join(dir, GLOBE_LAYER_FILE), bytes);
        assert.ok((await readGlobeLayerFile(dir, manifest)).ok);
        writeFileSync(join(dir, GLOBE_LAYER_FILE), Buffer.concat([bytes, Buffer.from("\n")]));
        const result = await readGlobeLayerFile(dir, manifest);
        assert.ok(!result.ok);
        assert.equal(result.fault, "tampered");
        const response = globeLayerResponse(result);
        assert.equal(response.status, 500);
        const text = await response.text();
        assert.ok(!text.includes("shapes") && !text.includes('"d"'), "nothing of the file is in the refusal");
        assert.equal((JSON.parse(text) as { code: string }).code, "tampered");
        assert.equal(response.headers.get("cache-control"), "no-store");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("the browser also refuses what the server would not have sent: a changed path fails the join, outline by outline", () => {
      const edited = clone(parsed);
      const shape = edited.shapes.find((s) => manifest.districts.some((d) => d.id === s.featureId))!;
      shape.d = shape.d.replace(/^M(-?\d+)/, (_, n) => `M${Number(n) + 300}`);
      const merged = mergeLayer(manifest, edited);
      assert.ok(merged.ok);
      const refused = merged.refused.map((r) => r.id);
      assert.ok(refused.includes(shape.featureId), "the moved district is not drawn");
      // Its blocks are checked against that district and go with it; no other district is affected.
      const children = new Set(manifest.blocks.filter((b) => b.districtId === shape.featureId).map((b) => b.id));
      assert.deepEqual(refused.filter((id) => id !== shape.featureId && !children.has(id)), []);
    });
  });

  describe("invalid dataset identity", () => {
    it("the workspace's own layer is not the globe's dataset: identity, even though it is a well-formed layer", () => {
      const result = verifyGlobeLayer(workspaceBytes, manifest);
      assert.ok(!result.ok);
      assert.equal(result.fault, "identity");
      assert.equal(globeLayerResponse(result).status, 500);
      // The browser agrees: it refuses the workspace layer for the same reason.
      const merged = mergeLayer(manifest, JSON.parse(workspaceBytes.toString("utf8")));
      assert.ok(!merged.ok);
      assert.match(merged.reason, /not the one this overlay was validated against/);
    });

    it("another dataset ID, or no kind, or another kind: identity (checked before the hash)", () => {
      for (const meta of [{ datasetId: "osm-somewhere-else" }, { kind: undefined }, { kind: "workspace-layer" }]) {
        const edited = clone(parsed);
        Object.assign(edited.meta, meta);
        const result = verifyGlobeLayer(encode(edited), manifest);
        assert.ok(!result.ok, JSON.stringify(meta));
        assert.equal(result.fault, "identity", JSON.stringify(meta));
        const merged = mergeLayer(manifest, edited);
        assert.ok(!merged.ok, `the browser refuses it too: ${JSON.stringify(meta)}`);
      }
    });

    it("a file that matches its record but holds an outline the validation never passed: invalid", () => {
      const withExtra = clone(parsed);
      withExtra.shapes.push({ ...withExtra.shapes[0], featureId: "GB-NOT-A-VALIDATED-UNIT" });
      const result = verifyGlobeLayer(encode(withExtra), withRecord(encode(withExtra), withExtra.shapes.length));
      assert.ok(!result.ok);
      assert.equal(result.fault, "invalid");

      const rejected = clone(manifest);
      rejected.districts[0].geometry = null;
      const sameFile = verifyGlobeLayer(bytes, { ...rejected, meta: { ...rejected.meta, inputs: clone(manifest.meta.inputs) } });
      assert.ok(!sameFile.ok, "an outline the manifest rejected is not served, though the bytes match");
      assert.equal(sameFile.fault, "invalid");
    });

    it("a different number of outlines than were validated: invalid", () => {
      const fewer = clone(parsed);
      fewer.shapes.pop();
      const result = verifyGlobeLayer(encode(fewer), withRecord(encode(fewer), 332));
      assert.ok(!result.ok);
      assert.equal(result.fault, "invalid");
    });

    it("a file that stops calling itself provisional: invalid", () => {
      const edited = clone(parsed);
      edited.meta.status = "Final. Official boundaries.";
      const result = verifyGlobeLayer(encode(edited), withRecord(encode(edited)));
      assert.ok(!result.ok);
      assert.equal(result.fault, "invalid");
      assert.match(result.reason, /Provisional/);
    });
  });

  it("the workspace route handler and its file are untouched by this work", () => {
    const route = readFileSync(join(ROOT, "src", "app", "geo", "boundaries.json", "route.ts"), "utf8");
    assert.match(route, /getLayerText\(\)/);
    assert.doesNotMatch(route, /globe/i);
    assert.ok(!existsSync(join(ROOT, "src", "app", "geo", "boundaries.json", "globe")));
  });
});
