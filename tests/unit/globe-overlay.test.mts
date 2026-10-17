import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { mergeLayer } from "../../src/features/globe/layer-merge.ts";
import { decodeGeometry, pointInPolygons } from "../../src/features/globe/shapes.ts";
import { DISTRICT_STYLE, NEUTRAL, ROYAL_BLUE } from "../../src/features/globe/styles.ts";
import type { GlobeManifest, GlobeOverlay } from "../../src/features/globe/types.ts";
import type { TerritoryDataset } from "../../src/features/territory/types.ts";

/**
 * Cross-checks the Python overlay builder (scripts/globe/build_overlay.py) against the TypeScript the app uses:
 * the coordinate conversion, the parent-district relationship and the colour classification are each computed a
 * second way here, from the generated dataset, and must agree. Needs `npm run data:build` and
 * `python -I scripts/globe/build_overlay.py`.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const overlayPath = join(ROOT, "data", "generated", "globe-overlay.json");
const datasetPath = join(ROOT, "data", "generated", "dataset.json");
const layerPath = join(ROOT, "data", "generated", "globe-boundaries.json");
const ready = existsSync(overlayPath) && existsSync(datasetPath) && existsSync(layerPath);

describe("globe overlay manifest", { skip: ready ? false : "run npm run data:build and python -I scripts/globe/build_overlay.py first" }, () => {
  const manifest = ready ? (JSON.parse(readFileSync(overlayPath, "utf8")) as GlobeManifest) : (null as never);
  const layerData = ready ? (JSON.parse(readFileSync(layerPath, "utf8")) as unknown) : (null as never);
  const dataset = ready ? (JSON.parse(readFileSync(datasetPath, "utf8")) as TerritoryDataset) : (null as never);
  // What the app draws: the manifest joined to the path data the globe's route handler serves (src/features/globe/layer-merge.ts).
  const merged = ready ? mergeLayer(manifest, layerData) : (null as never);
  const overlay: GlobeOverlay = merged.ok ? merged.overlay : (null as never);

  it("holds no outline path data (that is served by /geo/globe-boundaries.json), so the page payload stays small", () => {
    assert.ok(merged.ok, merged.ok ? "" : merged.reason);
    assert.ok(!JSON.stringify(manifest).includes('"d":'), "no path data in the manifest");
    assert.ok(readFileSync(overlayPath).length < 400_000, "the manifest is a fraction of the 0.78 MB it was with the outlines");
  });

  it("joins to the served layer with nothing refused: every validated outline matches its recorded summary", () => {
    assert.ok(merged.ok);
    assert.deepEqual(merged.refused, []);
    assert.equal(overlay.meta.counts.districtsDrawn, manifest.meta.counts.districtsDrawn);
    assert.equal(overlay.meta.counts.blocksDrawn, manifest.meta.counts.blocksDrawn);
    const summarised = new Map<string, boolean>([...manifest.districts, ...manifest.blocks].map((m) => [m.id, !!m.geometry]));
    for (const feature of [...overlay.districts, ...overlay.blocks]) assert.equal(!!feature.geometry, summarised.get(feature.id), feature.id);
  });

  it("is stamped provisional, attributed and licensed", () => {
    assert.match(overlay.meta.status, /^Provisional\./);
    assert.match(overlay.meta.status, /not an official boundary/);
    assert.match(overlay.meta.status, /not that the area is covered, verified or officially approved/);
    assert.equal(overlay.meta.licence, "Open Database Licence (ODbL) 1.0");
    assert.match(overlay.meta.attribution, /OpenStreetMap contributors/);
  });

  it("every shape passed validation: nothing was rejected, and no block lies outside its parent district", () => {
    assert.deepEqual(overlay.rejected, []);
    assert.equal(overlay.meta.counts.parentFailures, 0);
    assert.equal(overlay.meta.counts.duplicateShapes, 0);
  });

  it("the Python and TypeScript coordinate conversions agree to the manifest's 5-decimal precision", () => {
    for (const feature of [...overlay.districts, ...overlay.blocks]) {
      if (!feature.geometry) continue;
      const polygons = decodeGeometry(feature.geometry);
      const lngs = polygons.flatMap((p) => p.outer.map((c) => c[0]));
      const lats = polygons.flatMap((p) => p.outer.map((c) => c[1]));
      const [west, south, east, north] = feature.geometry.bbox;
      assert.ok(Math.abs(Math.min(...lngs) - west) < 2e-5, `${feature.id} west`);
      assert.ok(Math.abs(Math.min(...lats) - south) < 2e-5, `${feature.id} south`);
      assert.ok(Math.abs(Math.max(...lngs) - east) < 2e-5, `${feature.id} east`);
      assert.ok(Math.abs(Math.max(...lats) - north) < 2e-5, `${feature.id} north`);
    }
  });

  it("every block's label point lies inside its parent district's outline (checked in TypeScript, independent of Python)", () => {
    const districts = new Map(overlay.districts.map((d) => [d.id, d]));
    let checked = 0;
    for (const block of overlay.blocks) {
      if (!block.geometry) continue;
      const parent = block.districtId ? districts.get(block.districtId) : undefined;
      assert.ok(parent?.geometry, `${block.id} has a drawn parent`);
      const anchor = block.geometry.anchor;
      assert.ok(anchor, `${block.id} has an anchor`);
      assert.ok(pointInPolygons(anchor[0], anchor[1], decodeGeometry(parent.geometry)), `${block.id} anchor inside ${parent.id}`);
      checked++;
    }
    assert.equal(checked, overlay.meta.counts.blocksDrawn);
  });

  it("the West Bengal target is the union of the district outlines and lies where West Bengal is", () => {
    const [west, south, east, north] = overlay.state.bbox!;
    assert.ok(west > 85.5 && east < 90.1 && south > 21.3 && north < 27.4, "inside the search envelope");
    assert.ok(west < 86.2 && east > 89.5, "spans the state east to west");
    assert.equal(overlay.districts.filter((d) => d.geometry).length, 23);
    const [cx, cy] = overlay.state.centre!;
    assert.ok(Math.abs(cx - (west + east) / 2) < 1e-4 && Math.abs(cy - (south + north) / 2) < 1e-4);
  });

  it("colour classes follow the rule, recomputed from the dataset: provisional link plus a named person", () => {
    const named = (unitId: string) =>
      dataset.units.find((u) => u.id === unitId)!.slots.some((s) => s.status === "named" && s.names.some((n) => n.trim() !== ""));
    const representedBlocks = new Set<string>();
    for (const entry of dataset.crosswalk) {
      if (entry.status === "provisional" && entry.featureId && named(entry.unitId)) representedBlocks.add(entry.featureId);
    }
    const fromOverlay = new Set(overlay.blocks.filter((b) => b.state === "represented").map((b) => b.id));
    assert.deepEqual([...fromOverlay].sort(), [...representedBlocks].sort());

    const districtsWithRepresented = new Set<string>();
    for (const feature of dataset.features) {
      if (feature.kind === "block" && feature.districtId && representedBlocks.has(feature.id)) districtsWithRepresented.add(feature.districtId);
    }
    assert.deepEqual(
      overlay.districts.filter((d) => d.state === "represented").map((d) => d.id).sort(),
      [...districtsWithRepresented].sort(),
    );
  });

  it("a district is royal blue only for a representative-linked block, never merely because its outline exists", () => {
    const linked = (districtId: string) => overlay.blocks.filter((b) => b.districtId === districtId && b.state === "represented").length;
    for (const d of overlay.districts) {
      assert.equal(d.state === "represented", linked(d.id) > 0, `${d.name}: royal blue exactly when at least one of its blocks has a provisional representative link`);
      assert.equal(d.representedBlockCount, linked(d.id), `${d.name}: the stored count matches the blocks`);
    }
    const blue = overlay.districts.filter((d) => d.state === "represented");
    const grey = overlay.districts.filter((d) => d.state === "unresolved");
    assert.equal(blue.length, 21);
    assert.deepEqual(grey.map((d) => d.name).sort(), ["Kalimpong", "Kolkata"]);
    assert.ok(overlay.districts.every((d) => d.geometry), "all 23 districts have a drawn outline, so an outline alone cannot decide the colour");
    assert.equal(DISTRICT_STYLE.represented.fill, ROYAL_BLUE);
    assert.equal(DISTRICT_STYLE.unresolved.fill, NEUTRAL);
    assert.notEqual(DISTRICT_STYLE.represented.fill, DISTRICT_STYLE.unresolved.fill);
  });

  it("never infers white (confirmed no representative) from missing data or vacant markers", () => {
    assert.equal(overlay.meta.counts.blocksNoRepresentativeConfirmed, 0);
    assert.ok(!overlay.blocks.some((b) => b.state === "no-representative"));
    assert.ok(!overlay.districts.some((d) => d.state === "no-representative"));
  });

  it("a block that is not drawn says why, and a represented block without an outline is still counted", () => {
    const undrawn = overlay.blocks.filter((b) => !b.geometry);
    assert.equal(undrawn.length, overlay.meta.counts.blocks - overlay.meta.counts.blocksDrawn);
    assert.ok(undrawn.every((b) => typeof b.noGeometryReason === "string" && b.noGeometryReason.length > 0));
    assert.ok(overlay.meta.counts.blocksRepresented > overlay.meta.counts.blocksRepresentedAndDrawn);
  });

  it("a block linked by several rows is flagged as contested, never merged", () => {
    const multi = new Map<string, number>();
    for (const entry of dataset.crosswalk) if (entry.status === "provisional" && entry.featureId) multi.set(entry.featureId, (multi.get(entry.featureId) ?? 0) + 1);
    const expected = [...multi.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort();
    assert.deepEqual(overlay.blocks.filter((b) => b.contested).map((b) => b.id).sort(), expected);
  });
});
