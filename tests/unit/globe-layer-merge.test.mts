import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { mergeLayer } from "../../src/features/globe/layer-merge.ts";
import type { GlobeManifest } from "../../src/features/globe/types.ts";
import type { BoundaryLayer } from "../../src/features/territory/types.ts";

/**
 * The outlines travel by the same-origin /geo/globe-boundaries.json route handler (the globe's own validated file,
 * not the workspace's layer) instead of in the page, so the join to the validated manifest is where the geographic
 * validation is kept in the browser. These tests tamper with the served file and the manifest and check that
 * nothing unvalidated is drawn. (The server-side checks are in globe-layer-integrity.test.mts; the white rule is
 * in globe-reviewed-record.test.mts.) Needs `npm run data:build` and `python -I scripts/globe/build_overlay.py`.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const overlayPath = join(ROOT, "data", "generated", "globe-overlay.json");
const layerPath = join(ROOT, "data", "generated", "globe-boundaries.json");
const ready = existsSync(overlayPath) && existsSync(layerPath);

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("joining the served outlines to the validated manifest", { skip: ready ? false : "run npm run data:build and python -I scripts/globe/build_overlay.py first" }, () => {
  const manifest = ready ? (JSON.parse(readFileSync(overlayPath, "utf8")) as GlobeManifest) : (null as never);
  const layer = ready ? (JSON.parse(readFileSync(layerPath, "utf8")) as BoundaryLayer) : (null as never);
  const drawnBlocks = () => manifest.blocks.filter((b) => b.geometry);

  it("draws every validated outline and refuses nothing for the file the build produced", () => {
    const result = mergeLayer(manifest, layer);
    assert.ok(result.ok);
    assert.deepEqual(result.refused, []);
    assert.equal(result.overlay.districts.filter((d) => d.geometry).length, 23);
    assert.equal(result.overlay.blocks.filter((b) => b.geometry).length, 309);
    assert.ok(result.overlay.blocks.every((b) => !b.geometry || b.geometry.d.startsWith("M")));
  });

  it("refuses a file that is not a provisional, attributed layer (the workspace's own structural check)", () => {
    const noStatus = clone(layer);
    noStatus.meta.status = "Final. Official boundaries.";
    const result = mergeLayer(manifest, noStatus);
    assert.ok(!result.ok);
    assert.match(result.reason, /Provisional/);
    assert.ok(!mergeLayer(manifest, { shapes: [] }).ok);
    assert.ok(!mergeLayer(manifest, "not an object").ok);
    assert.ok(!mergeLayer(manifest, null).ok);
  });

  it("refuses a file built from another dataset, or with other provenance, than the manifest was validated against", () => {
    const otherDataset = clone(layer);
    otherDataset.meta.datasetId = "osm-somewhere-else";
    const a = mergeLayer(manifest, otherDataset);
    assert.ok(!a.ok);
    assert.match(a.reason, /not the one this overlay was validated against/);
    const otherLicence = clone(layer);
    otherLicence.meta.licence = "Public domain";
    assert.ok(!mergeLayer(manifest, otherLicence).ok);
  });

  it("refuses a file with a unit the manifest does not know, or a repeated unit", () => {
    const unknown = clone(layer);
    unknown.shapes.push({ ...unknown.shapes[0], featureId: "GB-NOT-A-UNIT" });
    const a = mergeLayer(manifest, unknown);
    assert.ok(!a.ok);
    assert.match(a.reason, /does not belong to any official unit/);
    const repeated = clone(layer);
    repeated.shapes.push(clone(repeated.shapes[0]));
    const b = mergeLayer(manifest, repeated);
    assert.ok(!b.ok);
    assert.match(b.reason, /repeats unit/);
  });

  it("does not draw an outline whose path no longer matches its validated extent: swapped shapes are both refused", () => {
    const swapped = clone(layer);
    const [first, second] = swapped.shapes.filter((s) => manifest.districts.some((d) => d.id === s.featureId && d.geometry));
    [first.d, second.d] = [second.d, first.d];
    const result = mergeLayer(manifest, swapped);
    assert.ok(result.ok, "the file is well formed; the two outlines are wrong");
    assert.deepEqual(result.refused.map((r) => r.id).filter((id) => id === first.featureId || id === second.featureId).sort(), [first.featureId, second.featureId].sort());
    const district = result.overlay.districts.find((d) => d.id === first.featureId)!;
    assert.equal(district.geometry, null);
    assert.match(district.noGeometryReason ?? "", /^Outline not drawn: its extent differs from the validated outline\.$/);
    assert.equal(result.overlay.meta.counts.districtsDrawn, 21);
  });

  it("does not draw an outline that lost a vertex, or one that the file no longer holds", () => {
    const edited = clone(layer);
    const target = drawnBlocks()[0];
    const shape = edited.shapes.find((s) => s.featureId === target.id)!;
    // Drop the last vertex of the first ring but keep it closed. The extent is unchanged; the vertex count is not.
    const before = shape.d;
    shape.d = shape.d.replace(/ -?\d+ -?\d+z/, "z");
    assert.notEqual(shape.d, before);
    const missing = drawnBlocks()[1];
    edited.shapes = edited.shapes.filter((s) => s.featureId !== missing.id);
    const result = mergeLayer(manifest, edited);
    assert.ok(result.ok);
    const byId = new Map(result.refused.map((r) => [r.id, r.reason]));
    assert.match(byId.get(missing.id) ?? "", /no outline for it/);
    assert.equal(result.overlay.blocks.find((b) => b.id === missing.id)!.geometry, null);
    assert.equal(result.overlay.blocks.find((b) => b.id === target.id)!.geometry, null, "the vertex count no longer matches, so it is not drawn");
    assert.ok(byId.has(target.id));
  });

  it("never draws a shape the manifest rejected, even though the served file holds it", () => {
    const edited = clone(manifest);
    const victim = edited.districts[0];
    victim.geometry = null;
    victim.noGeometryReason = "a ring has zero area";
    edited.rejected.push({ id: victim.id, reason: "a ring has zero area" });
    assert.ok(layer.shapes.some((s) => s.featureId === victim.id), "the file still holds that outline");
    const result = mergeLayer(edited, layer);
    assert.ok(result.ok);
    const district = result.overlay.districts.find((d) => d.id === victim.id)!;
    assert.equal(district.geometry, null);
    assert.equal(district.noGeometryReason, "a ring has zero area");
    // Its blocks are checked against a parent that has no outline, so they are not drawn either.
    const children = result.overlay.blocks.filter((b) => b.districtId === victim.id);
    assert.ok(children.length > 0 && children.every((b) => b.geometry === null));
    assert.equal(district.drawnBlockCount, 0);
  });

  it("does not draw a block whose label point lies outside its parent district (checked again in the browser)", () => {
    const edited = clone(manifest);
    const block = edited.blocks.find((b) => b.geometry && b.districtId)!;
    const other = edited.districts.find((d) => d.id !== block.districtId && d.geometry)!;
    block.districtId = other.id;
    const result = mergeLayer(edited, layer);
    assert.ok(result.ok);
    assert.equal(result.overlay.blocks.find((b) => b.id === block.id)!.geometry, null);
    assert.match(result.refused.find((r) => r.id === block.id)!.reason, /label point lies outside its parent district/);
  });

  it("a represented block that loses its outline keeps its orange state and says no outline is drawn", () => {
    const edited = clone(layer);
    const target = drawnBlocks().find((b) => b.state === "represented")!;
    edited.shapes = edited.shapes.filter((s) => s.featureId !== target.id);
    const result = mergeLayer(manifest, edited);
    assert.ok(result.ok);
    const block = result.overlay.blocks.find((b) => b.id === target.id)!;
    assert.equal(block.state, "represented");
    assert.equal(block.geometry, null);
    assert.match(block.reason, /No outline is drawn: the boundary file has no outline for it\.$/);
    assert.equal(result.overlay.meta.counts.blocksRepresentedAndDrawn, manifest.meta.counts.blocksRepresentedAndDrawn - 1);
  });
});
