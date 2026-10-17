import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { districtRowSummary, districtRows } from "../../src/features/territory/district-nav.ts";
import { buildModel } from "../../src/features/territory/model.ts";
import { ALLOCATION_STATES, type TerritoryDataset } from "../../src/features/territory/types.ts";
import { ROOT } from "../../scripts/lib/sources.ts";

const datasetPath = path.join(ROOT, "data", "generated", "dataset.json");
const built = existsSync(datasetPath);

describe("the district navigator's rows", { skip: built ? false : "data not built: run `npm run data:build`" }, () => {
  const model = built ? buildModel(JSON.parse(readFileSync(datasetPath, "utf8")) as TerritoryDataset, []) : (null as never);

  it("lists every district once, A to Z", () => {
    const rows = districtRows(model);
    assert.equal(rows.length, 23);
    assert.equal(new Set(rows.map((r) => r.id)).size, 23);
    assert.deepEqual(rows.map((r) => r.name), [...rows.map((r) => r.name)].sort((a, b) => a.localeCompare(b)));
  });

  it("reads the model's own roll-up, so the list agrees with the details panel and the summary", () => {
    const rows = districtRows(model);
    for (const row of rows) {
      const rollup = model.districtRollup.get(row.id)!;
      assert.equal(row.blocks, rollup.blocks);
      assert.equal(row.outlined, rollup.withBoundary);
      assert.equal(ALLOCATION_STATES.reduce((n, s) => n + row.byState[s], 0), row.blocks, `${row.name}: the four states add up to its blocks`);
      assert.ok(row.outlined <= row.blocks);
    }
    assert.equal(rows.reduce((n, r) => n + r.blocks, 0), model.summary.blocks.total);
    assert.equal(rows.reduce((n, r) => n + r.outlined, 0), model.summary.blocks.withBoundary);
  });

  it("says in words what a row shows, and never calls the block total official", () => {
    const rows = districtRows(model);
    const full = rows.find((r) => r.blocks > 0)!;
    assert.equal(districtRowSummary(full), `${full.name}: ${full.outlined} of ${full.blocks} ${full.blocks === 1 ? "block" : "blocks"} outlined`);
    assert.equal(districtRowSummary({ ...full, blocks: 0, outlined: 0 }), `${full.name}: no blocks in the reference list`);
    assert.ok(!rows.some((r) => /official/i.test(districtRowSummary(r))));
  });
});
