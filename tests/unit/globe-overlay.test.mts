import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { mergeLayer } from "../../src/features/globe/layer-merge.ts";
import { decodeGeometry, pointInPolygons } from "../../src/features/globe/shapes.ts";
import { projectManifest } from "../../src/features/globe/overlay-projection.server.ts";
import type { ServerManifest } from "../../src/features/globe/server-types.ts";
import type { GlobeOverlay } from "../../src/features/globe/types.ts";
import type { TerritoryDataset } from "../../src/features/territory/types.ts";

/**
 * Checks the globe build (scripts/globe/build-area-map.mts) against the area-mapping sheet as the workspace build read it
 * (data/generated/dataset.json, `units`): every sheet row is on the map exactly once (or reported as outside the state),
 * every person in a row is shown for that row's place, and every outline lies inside its district. Needs
 * `npm run data:build` and `npm run data:build-globe`.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const overlayPath = join(ROOT, "data", "generated", "globe-overlay.json");
const datasetPath = join(ROOT, "data", "generated", "dataset.json");
const layerPath = join(ROOT, "data", "generated", "globe-boundaries.json");
const ready = existsSync(overlayPath) && existsSync(datasetPath) && existsSync(layerPath);

describe("globe overlay manifest", { skip: ready ? false : "run npm run data:build and npm run data:build-globe first" }, () => {
  const manifest = ready ? projectManifest(JSON.parse(readFileSync(overlayPath, "utf8")) as ServerManifest) : (null as never);
  const layerData = ready ? (JSON.parse(readFileSync(layerPath, "utf8")) as unknown) : (null as never);
  const dataset = ready ? (JSON.parse(readFileSync(datasetPath, "utf8")) as TerritoryDataset) : (null as never);
  // What the app draws: the manifest joined to the path data the globe's route handler serves (src/features/globe/layer-merge.ts).
  const merged = ready ? mergeLayer(manifest, layerData) : (null as never);
  const overlay: GlobeOverlay = merged.ok ? merged.overlay : (null as never);

  it("holds no outline path data (that is served by /geo/globe-boundaries.json), so the page payload stays small", () => {
    assert.ok(merged.ok, merged.ok ? "" : merged.reason);
    assert.ok(!JSON.stringify(manifest).includes('"d":'), "no path data in the manifest");
    assert.ok(readFileSync(overlayPath).length < 400_000, "the manifest is a fraction of the size of the outlines");
  });

  it("joins to the served layer with nothing refused: every validated outline matches its recorded summary", () => {
    assert.ok(merged.ok);
    assert.deepEqual(merged.refused, []);
    assert.equal(overlay.meta.counts.districtsDrawn, manifest.meta.counts.districtsDrawn);
    assert.equal(overlay.meta.counts.blocksDrawn, manifest.meta.counts.blocksDrawn);
    const summarised = new Map<string, boolean>([...manifest.districts, ...manifest.blocks].map((m) => [m.id, !!m.geometry]));
    for (const feature of [...overlay.districts, ...overlay.blocks]) assert.equal(!!feature.geometry, summarised.get(feature.id), feature.id);
  });

  it("is stamped provisional, attributed and licensed, and names the sheet as the only source of who works where", () => {
    assert.match(overlay.meta.status, /^Provisional/);
    assert.match(overlay.meta.status, /not official boundaries/);
    assert.match(overlay.meta.status, /only from the area-mapping sheet/);
    assert.equal(overlay.meta.licence, "Open Database Licence (ODbL) 1.0");
    assert.match(overlay.meta.attribution, /OpenStreetMap contributors/);
  });

  it("every shape passed validation: nothing was rejected, and no block lies outside its parent district", () => {
    assert.deepEqual(overlay.rejected, []);
    assert.equal(overlay.meta.counts.parentFailures, 0);
    assert.equal(overlay.meta.counts.duplicateShapes, 0);
  });

  it("every recorded outline summary matches the decoded path to the manifest's 5-decimal precision", () => {
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

  it("every block's label point lies inside its parent district's outline", () => {
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

  // ---- the sheet, row by row --------------------------------------------------------------------------------------------
  const server = ready ? (JSON.parse(readFileSync(overlayPath, "utf8")) as ServerManifest) : (null as never);
  const recordsByUnit = () => new Map(server.blocks.flatMap((b) => b.records.map((r) => [r.unitId, { block: b, record: r }] as const)));
  /**
   * The corrections the build makes to the hand-typed sheet, reviewed: one-letter spelling variants of one person in one
   * territory, and first names written alone that are the one full name in that territory starting with them.
   */
  const CORRECTED: Record<string, string> = {
    "shibom dutta": "shibam dutta",
    rakesh: "rakesh sarkar",
    dipankar: "dipankar paul",
    biman: "biman sanyal",
  };
  /** The build's display form: spacing collapsed, case folded, an accidentally doubled last word dropped, corrections. */
  const fold = (name: string) => {
    const words = name.replace(/\s+/g, " ").trim().toLowerCase().split(" ");
    if (words.length >= 3 && words.at(-1) === words.at(-2)) words.pop();
    const folded = words.join(" ");
    return CORRECTED[folded] ?? folded;
  };

  it("every sheet row is on the map exactly once, except the one row outside West Bengal", () => {
    const placed = server.blocks.flatMap((b) => b.records.map((r) => r.unitId));
    assert.equal(new Set(placed).size, placed.length, "no row is on two places");
    assert.equal(dataset.units.length, 358);
    const missing = dataset.units.filter((u) => !placed.includes(u.id)).map((u) => u.blockLabel);
    assert.deepEqual(missing, ["Jharkhand-W"], "only the Jharkhand row is not drawn");
    const meta = (server.meta as { sheet?: { rows: number; mappedRows: number } }).sheet;
    assert.deepEqual([meta?.rows, meta?.mappedRows], [358, 357]);
  });

  it("every person in every sheet row is shown, in their role, for that row's place, and nobody is added", () => {
    const byUnit = recordsByUnit();
    let people = 0;
    for (const unit of dataset.units) {
      const found = byUnit.get(unit.id);
      if (!found) continue;
      const expected = unit.slots
        .flatMap((slot) => (slot.status === "vacant" ? [`${slot.role}:vacant`] : slot.names.filter((n) => n.trim()).map((n) => `${slot.role}:${fold(n)}`)))
        .sort();
      const actual = found.record.people.map((p) => (p.vacant ? `${p.role}:vacant` : `${p.role}:${fold(p.name!)}`)).sort();
      assert.deepEqual(actual, expected, `row ${unit.sourceRow} ${unit.blockLabel}`);
      people += actual.length;
    }
    assert.ok(people > 900, `${people} role entries checked`);
  });

  it("every sheet row has its ASM, and every place is coloured as having a team", () => {
    for (const block of server.blocks) {
      assert.equal(block.state, "represented", block.name);
      for (const record of block.records) assert.ok(record.people.some((p) => p.role === "ASM" && p.name), `${block.name}: row ${record.unitId} has an ASM`);
    }
  });

  it("a district is coloured only when the sheet lists a place in it; Kalimpong and Kolkata, which the sheet does not list, are not", () => {
    for (const district of overlay.districts) {
      const places = overlay.blocks.filter((b) => b.districtId === district.id).length;
      assert.equal(district.state, places > 0 ? "represented" : "unresolved", district.name);
      assert.equal(district.blockCount, places, district.name);
    }
    assert.deepEqual(overlay.districts.filter((d) => d.state !== "represented").map((d) => d.name), ["Kalimpong", "Kolkata"]);
  });

  it("a place several sheet rows list keeps each row as its own team, never merged", () => {
    const multi = new Map(server.blocks.filter((b) => b.records.length > 1).map((b) => [b.name, b.records.map((r) => r.territory).sort()]));
    assert.deepEqual(multi.get("Jangipara"), ["Hooghly", "Howrah"]);
    assert.deepEqual(multi.get("Khanakul-I"), ["Hooghly", "Howrah"]);
    assert.ok(multi.has("Asansol & Kulti"));
    for (const block of server.blocks) assert.equal(block.contested, false, block.name);
  });

  it("a place without an outline says why and is still listed in its district; no shape is invented for it", () => {
    const without = overlay.blocks.filter((b) => !b.geometry);
    assert.equal(without.length, 11);
    for (const block of without) {
      assert.match(block.id, /^GU-\d+$/, block.name);
      assert.match(block.noGeometryReason ?? "", /^No outline: /, block.name);
      assert.ok(block.districtId, block.name);
    }
    assert.deepEqual(
      // The sheet lists the Kolkata boroughs and Behala under South 24 PGS; with no outline, they stay there.
      without.filter((b) => b.districtId === overlay.districts.find((d) => d.name === "South 24 Parganas")!.id).map((b) => b.name).sort(),
      ["Behala", "Kolkata Borough 10", "Kolkata Borough 11", "Kolkata Borough 12", "Kolkata Borough 7"],
    );
  });
});
