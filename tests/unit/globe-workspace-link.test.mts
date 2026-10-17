import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { targetForSelection, workspaceHref, WORKSPACE_PATH, type WorkspaceLookup } from "../../src/features/globe/workspace-link.ts";
import type { GlobeManifest, ManifestBlock, ManifestDistrict } from "../../src/features/globe/types.ts";
import { mapContext } from "../../src/features/territory/map-level.ts";
import { buildModel } from "../../src/features/territory/model.ts";
import { parseSelectionHash } from "../../src/features/territory/selection.ts";
import type { TerritoryDataset } from "../../src/features/territory/types.ts";

/**
 * The globe-to-workspace hand-off: the URL built from a validated globe record is exactly the hash the workspace's
 * own parser (features/territory/selection.ts) accepts, and the map level it derives (map-level.ts) is the one the
 * globe's selection stands for. Synthetic records cover the rules and the refusals; the real build is cross-checked
 * against the workspace's real model.
 */
const district = (id: string) => ({ id }) as ManifestDistrict;
const block = (id: string, districtId: string | null, rowIds: string[] = []) =>
  ({ id, districtId, records: rowIds.map((unitId) => ({ unitId })) }) as unknown as ManifestBlock;

const lookup: WorkspaceLookup = {
  districts: [district("GD-1"), district("GD-2")],
  blocks: [block("GB-10", "GD-1", ["TU-001"]), block("GB-11", "GD-1", ["TU-002", "TU-003"]), block("GB-20", "GD-2"), block("GB 30/é#?", "GD-2", ["TU 9/é#?"])],
};

describe("workspaceHref", () => {
  it("a state target opens the workspace with no hash, so the map starts at the state overview", () => {
    assert.equal(workspaceHref(lookup, { kind: "state" }), "/workspace");
    assert.equal(WORKSPACE_PATH, "/workspace");
  });

  it("a district is a feature hash for its validated district ID", () => {
    assert.equal(workspaceHref(lookup, { kind: "district", id: "GD-2" }), "/workspace#feature=GD-2");
  });

  it("a block is a feature hash for its validated block ID", () => {
    assert.equal(workspaceHref(lookup, { kind: "block", id: "GB-11" }), "/workspace#feature=GB-11");
    assert.equal(workspaceHref(lookup, { kind: "block", id: "GB-20" }), "/workspace#feature=GB-20", "a block with no workbook row still opens");
  });

  it("a workbook row is a unit hash for the row ID the overlay links to a block", () => {
    assert.equal(workspaceHref(lookup, { kind: "row", id: "TU-001" }), "/workspace#unit=TU-001");
    assert.equal(workspaceHref(lookup, { kind: "row", id: "TU-003" }), "/workspace#unit=TU-003");
  });

  it("encodes the ID in the URL the way the workspace decodes it", () => {
    assert.equal(workspaceHref(lookup, { kind: "block", id: "GB 30/é#?" }), "/workspace#feature=GB%2030%2F%C3%A9%23%3F");
    assert.equal(workspaceHref(lookup, { kind: "row", id: "TU 9/é#?" }), "/workspace#unit=TU%209%2F%C3%A9%23%3F");
  });

  it("an unknown, empty or wrongly typed ID gives null, never a guessed link", () => {
    for (const kind of ["district", "block", "row"] as const) {
      for (const id of ["GD-999", "GB-999", "TU-999", "", " ", "gb-10", "GB-10 ", "Murshidabad", "__proto__"]) {
        assert.equal(workspaceHref(lookup, { kind, id }), null, `${kind} ${JSON.stringify(id)}`);
      }
      assert.equal(workspaceHref(lookup, { kind, id: undefined as unknown as string }), null);
      assert.equal(workspaceHref(lookup, { kind, id: 7 as unknown as string }), null);
    }
  });

  it("an ID of one kind is not accepted as another: a block ID is not a district, a row ID is not a block", () => {
    assert.equal(workspaceHref(lookup, { kind: "district", id: "GB-10" }), null);
    assert.equal(workspaceHref(lookup, { kind: "block", id: "GD-1" }), null);
    assert.equal(workspaceHref(lookup, { kind: "block", id: "TU-001" }), null);
    assert.equal(workspaceHref(lookup, { kind: "row", id: "GB-10" }), null);
  });

  it("an unknown target kind gives null", () => {
    assert.equal(workspaceHref(lookup, { kind: "territory", id: "ST-01" } as never), null);
  });

  it("an empty overlay links only the state", () => {
    const empty: WorkspaceLookup = { districts: [], blocks: [] };
    assert.equal(workspaceHref(empty, { kind: "state" }), "/workspace");
    assert.equal(workspaceHref(empty, { kind: "district", id: "GD-1" }), null);
  });
});

describe("targetForSelection", () => {
  it("maps what the details panel shows to a target, and nothing at the whole-globe level", () => {
    assert.equal(targetForSelection("globe", null, null), null);
    assert.deepEqual(targetForSelection("state", null, null), { kind: "state" });
    assert.deepEqual(targetForSelection("district", district("GD-1"), null), { kind: "district", id: "GD-1" });
    assert.deepEqual(targetForSelection("block", district("GD-1"), block("GB-10", "GD-1")), { kind: "block", id: "GB-10" });
  });

  it("a level whose record is unknown gives no target", () => {
    assert.equal(targetForSelection("district", null, null), null);
    assert.equal(targetForSelection("block", district("GD-1"), null), null);
  });
});

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const overlayPath = join(ROOT, "data", "generated", "globe-overlay.json");
const datasetPath = join(ROOT, "data", "generated", "dataset.json");
const ready = existsSync(overlayPath) && existsSync(datasetPath);

describe("workspaceHref against the real build", { skip: ready ? false : "run npm run data:build and python -I scripts/globe/build_overlay.py first" }, () => {
  const manifest = ready ? (JSON.parse(readFileSync(overlayPath, "utf8")) as GlobeManifest) : (null as never);
  const model = ready ? buildModel(JSON.parse(readFileSync(datasetPath, "utf8")) as TerritoryDataset, []) : (null as never);
  const hashOf = (href: string | null) => {
    assert.ok(href, "a link was built");
    assert.ok(href.startsWith("/workspace#"), href);
    return href.slice("/workspace".length);
  };

  it("every district opens at district level on that district", () => {
    assert.ok(manifest.districts.length > 0);
    for (const d of manifest.districts) {
      const selection = parseSelectionHash(hashOf(workspaceHref(manifest, { kind: "district", id: d.id })), model);
      assert.deepEqual(selection, { kind: "feature", id: d.id }, d.id);
      assert.deepEqual(mapContext(model, selection), { level: "district", districtId: d.id, blockId: null }, d.id);
    }
  });

  it("every block opens at block level on that block, inside the district the overlay and the workspace both record", () => {
    assert.ok(manifest.blocks.length > 0);
    for (const b of manifest.blocks) {
      const selection = parseSelectionHash(hashOf(workspaceHref(manifest, { kind: "block", id: b.id })), model);
      assert.deepEqual(selection, { kind: "feature", id: b.id }, b.id);
      const context = mapContext(model, selection);
      assert.equal(context.blockId, b.id, b.id);
      assert.equal(context.level, "block", b.id);
      assert.equal(context.districtId, b.districtId, `${b.id}: the globe's parent district is the workspace's`);
    }
  });

  it("every workbook row the globe lists opens that row, at the block the workspace links it to", () => {
    let rows = 0;
    for (const b of manifest.blocks) {
      for (const r of b.records) {
        rows++;
        const selection = parseSelectionHash(hashOf(workspaceHref(manifest, { kind: "row", id: r.unitId })), model);
        assert.deepEqual(selection, { kind: "unit", id: r.unitId }, r.unitId);
        assert.equal(mapContext(model, selection).blockId, b.id, `${r.unitId}: the row is at the block the globe lists it under`);
      }
    }
    assert.ok(rows > 0);
  });

  it("the state target is the workspace's own state context", () => {
    assert.equal(workspaceHref(manifest, { kind: "state" }), "/workspace");
    assert.deepEqual(parseSelectionHash("", model), null);
    assert.equal(mapContext(model, null).level, "state");
  });

  it("an ID the workspace does not know is not linked", () => {
    assert.equal(workspaceHref(manifest, { kind: "block", id: "GB-0" }), null);
    assert.equal(parseSelectionHash("#feature=GB-0", model), null);
  });
});
