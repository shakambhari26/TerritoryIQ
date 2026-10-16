import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { matchLabel, toOfficialUnit } from "../../src/features/geo/crosswalk.ts";
import { pointInRing } from "../../src/features/geo/geometry.ts";
import { decodePath } from "../../src/features/geo/layer.ts";
import { buildModel } from "../../src/features/territory/model.ts";
import type { BoundaryLayer, TerritoryDataset } from "../../src/features/territory/types.ts";
import { checkSources, ROOT } from "../../scripts/lib/sources.ts";

/**
 * Checks on the generated build (`npm run data:build`). They are skipped, not
 * failed, when the build has not been run, so a fresh checkout can still run
 * the other tests.
 */
const datasetPath = path.join(ROOT, "data", "generated", "dataset.json");
const layerPath = path.join(ROOT, "data", "generated", "boundaries.json");
const built = existsSync(datasetPath) && existsSync(layerPath);
const skip = built ? false : "data not built: run `npm run data:build`";

const load = async <T,>(file: string) => JSON.parse(await readFile(file, "utf8")) as T;

describe("source files", { skip: existsSync(path.join(ROOT, "data-source")) ? false : "data-source/ not present" }, () => {
  it("still match the SHA-256 values recorded in the audit documents", async () => {
    const results = await checkSources();
    for (const r of results) assert.ok(r.ok, `${r.spec.file}: expected ${r.spec.sha256}, got ${r.actual}`);
  });
});

describe("generated dataset", { skip }, () => {
  it("accounts for every workbook row, sales territory and official unit", async () => {
    const d = await load<TerritoryDataset>(datasetPath);
    assert.equal(d.units.length, 358);
    assert.equal(d.salesTerritories.length, 21);
    assert.equal(d.crosswalk.length, 358);
    assert.equal(d.features.filter((f) => f.kind === "district").length, 23);
    assert.equal(d.features.filter((f) => f.kind === "block").length, 345);
    assert.equal(new Set(d.units.map((u) => u.id)).size, 358, "unit IDs are unique");
    assert.equal(new Set(d.features.map((f) => f.id)).size, d.features.length, "feature IDs are unique");
    assert.deepEqual(d.units.map((u) => u.sourceRow), Array.from({ length: 358 }, (_, i) => i + 2), "every workbook row once, in order");
    assert.equal(d.salesTerritories.reduce((n, t) => n + t.unitIds.length, 0), 358);
  });

  it("reproduces the Phase 0E crosswalk counts for exact-name candidates", async () => {
    const d = await load<TerritoryDataset>(datasetPath);
    assert.equal(d.meta.matching.exactTierRows, 301);
    assert.equal(d.meta.matching.provisionalRows, 298);
    assert.equal(d.meta.matching.ambiguousRows, 3);
    assert.equal(d.meta.matching.weakRows, 43);
    assert.equal(d.meta.matching.noneRows, 14);
    // The audit names the 14 rows with no candidate at any tier.
    const none = d.crosswalk.filter((c) => c.status === "none").map((c) => d.units.find((u) => u.id === c.unitId)!.sourceRow);
    assert.deepEqual(none, [29, 64, 67, 68, 69, 156, 204, 205, 206, 207, 208, 245, 258, 318]);
  });

  it("links a row to a block only through a single exact-name candidate", async () => {
    const d = await load<TerritoryDataset>(datasetPath);
    const kind = new Map(d.features.map((f) => [f.id, f.kind]));
    for (const entry of d.crosswalk) {
      if (entry.status === "provisional") {
        assert.ok(entry.featureId, entry.unitId);
        assert.equal(kind.get(entry.featureId), "block");
        const exact = entry.candidates.filter((c) => c.tier === "T1" || c.tier === "T2");
        assert.equal(exact.length, 1, `${entry.unitId} must have exactly one exact candidate`);
        assert.equal(exact[0].featureId, entry.featureId);
      } else {
        assert.equal(entry.featureId, null, `${entry.unitId} (${entry.status}) must not name a unit`);
      }
    }
  });

  it("does not use the DISTRICT sales-territory label to choose candidates", async () => {
    const d = await load<TerritoryDataset>(datasetPath);
    const pool = d.features.map((f) => toOfficialUnit(f.id, f.kind, f.name));
    const entryByUnit = new Map(d.crosswalk.map((c) => [c.unitId, c]));
    const byLabel = new Map<string, string>();
    for (const unit of d.units) {
      const recomputed = matchLabel(unit.blockLabel, pool);
      assert.deepEqual(entryByUnit.get(unit.id)!.candidates, recomputed, `${unit.id} candidates must depend on the block label alone`);
      const signature = JSON.stringify(recomputed);
      const key = unit.blockLabel.trim().toLowerCase();
      // The same block label listed under two sales territories gets the same candidates.
      if (byLabel.has(key)) assert.equal(byLabel.get(key), signature, `label "${unit.blockLabel}"`);
      else byLabel.set(key, signature);
    }
  });

  it("keeps the two same-named Sankrail rows ambiguous rather than guessing a block", async () => {
    const d = await load<TerritoryDataset>(datasetPath);
    const rows = d.units.filter((u) => u.blockLabel.trim() === "Sankrail");
    assert.equal(rows.length, 2);
    for (const row of rows) {
      const entry = d.crosswalk.find((c) => c.unitId === row.id)!;
      assert.equal(entry.status, "ambiguous");
      assert.equal(entry.candidates.length, 2);
    }
  });

  it("preserves the workbook's allocation data as written", async () => {
    const d = await load<TerritoryDataset>(datasetPath);
    const slots = d.units.flatMap((u) => u.slots);
    assert.equal(slots.filter((s) => s.role === "ASM").length, 358);
    assert.equal(slots.filter((s) => s.status === "vacant").length, 30, "Vacant is stored only where the workbook says so");
    assert.equal(slots.filter((s) => s.status === "named").length, 1256);
    assert.equal(d.units.filter((u) => u.flags.includes("asm-two-names")).length, 37);
  });

  it("contains no email addresses or salary-like fields", async () => {
    const text = await readFile(datasetPath, "utf8");
    assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[\w.]+/);
    assert.doesNotMatch(text, /salary|ctc|payroll/i);
  });

  it("starts with no confirmed-unallocated area: absence of data is never confirmation", async () => {
    const d = await load<TerritoryDataset>(datasetPath);
    const model = buildModel(d, []);
    assert.equal(model.summary.units.byState.confirmed_unallocated, 0);
    assert.equal(model.summary.blocks.byState.confirmed_unallocated, 0);
    assert.ok(model.summary.blocks.byState.missing > 0, "official blocks nobody lists are missing / unverified");
    assert.ok(model.summary.units.byState.conflicting > 0, "shared blocks are shown as conflicting");
    const kalimpong = d.features.filter((f) => f.kind === "block" && f.districtId === "GD-702");
    assert.equal(kalimpong.length, 4);
    for (const block of kalimpong) {
      assert.equal(model.featureAllocation.get(block.id)!.state, "missing", `${block.name}: not listed in the workbook is not unallocated`);
    }
  });
});

describe("boundary layer", { skip }, () => {
  it("carries source, licence, attribution, snapshot and file hashes", async () => {
    const layer = await load<BoundaryLayer>(layerPath);
    assert.match(layer.meta.licence, /ODbL/);
    assert.match(layer.meta.attribution, /OpenStreetMap/);
    assert.ok(layer.meta.snapshots.length > 0);
    assert.ok(Object.keys(layer.meta.rawSha256).length > 0);
    for (const hash of Object.values(layer.meta.rawSha256)) assert.match(hash, /^[0-9a-f]{64}$/);
    assert.match(layer.meta.status, /Provisional/);
  });

  it("draws exactly the official units that were linked, and nothing invented", async () => {
    const d = await load<TerritoryDataset>(datasetPath);
    const layer = await load<BoundaryLayer>(layerPath);
    const withBoundary = new Set(d.features.filter((f) => f.boundary).map((f) => f.id));
    const drawn = layer.shapes.map((s) => s.featureId);
    assert.equal(new Set(drawn).size, drawn.length, "one shape per unit");
    assert.deepEqual(new Set(drawn), withBoundary);
    for (const f of d.features) {
      if (!f.boundary) assert.ok(f.boundaryGap, `${f.id} has no boundary, so it must say why`);
    }
    assert.equal(d.features.filter((f) => f.kind === "district" && f.boundary).length, 23);
  });

  it("holds well-formed shapes inside its own view box", async () => {
    const layer = await load<BoundaryLayer>(layerPath);
    const [vx, vy, vw, vh] = layer.viewBox;
    for (const s of layer.shapes) {
      assert.match(s.d, /^M-?\d+ -?\d+l/);
      assert.ok(s.bbox[0] >= vx - 1 && s.bbox[2] <= vx + vw + 1 && s.bbox[1] >= vy - 1 && s.bbox[3] <= vy + vh + 1, s.featureId);
    }
  });

it("gives every shape a label anchor that lies inside what is drawn", async () => {
    const layer = await load<BoundaryLayer>(layerPath);
    for (const s of layer.shapes) {
      assert.ok(s.anchor, s.featureId + " has no label anchor");
      const [x, y, r] = s.anchor;
      assert.ok(r > 0, s.featureId + " anchor radius");
      assert.ok(x >= s.bbox[0] && x <= s.bbox[2] && y >= s.bbox[1] && y <= s.bbox[3], s.featureId + " anchor is outside its box");
      // The shape fills with the even-odd rule, so a point is inside when it is inside an odd number of rings.
      const inside = decodePath(s.d).reduce((odd, ring) => (pointInRing([x, y], ring) ? !odd : odd), false);
      assert.ok(inside, s.featureId + " label anchor is not inside its own outline");
    }
  });

  it("anchors each block label inside the block's own official district outline", async () => {
    const d = await load<TerritoryDataset>(datasetPath);
    const layer = await load<BoundaryLayer>(layerPath);
    const shape = new Map(layer.shapes.map((s) => [s.featureId, s]));
    let checked = 0;
    for (const f of d.features) {
      if (f.kind !== "block" || !f.boundary) continue;
      const [x, y] = shape.get(f.id)!.anchor!;
      const district = shape.get(f.districtId!)!;
      const inside = decodePath(district.d).reduce((odd, ring) => (pointInRing([x, y], ring) ? !odd : odd), false);
      assert.ok(inside, f.name + " is labelled outside " + f.districtId);
      checked++;
    }
    assert.equal(checked, d.features.filter((f) => f.kind === "block" && f.boundary).length);
  });

  it("places every drawn block inside its own official district's bounding box", async () => {
    const d = await load<TerritoryDataset>(datasetPath);
    const layer = await load<BoundaryLayer>(layerPath);
    const box = new Map(layer.shapes.map((s) => [s.featureId, s.bbox]));
    for (const f of d.features) {
      if (f.kind !== "block" || !f.boundary) continue;
      const b = box.get(f.id)!;
      const dist = box.get(f.districtId!)!;
      const cx = (b[0] + b[2]) / 2;
      const cy = (b[1] + b[3]) / 2;
      assert.ok(cx >= dist[0] && cx <= dist[2] && cy >= dist[1] && cy <= dist[3], `${f.name} lies outside ${f.districtId}`);
    }
  });
});
