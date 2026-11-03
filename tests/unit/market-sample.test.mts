import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildMarketSample,
  LEAD_STATUSES,
  PARTNER_TYPES,
  PERIODS,
  summarise,
  TARGET_STATE,
  VISIT_TYPES,
  type BlockRef,
  type PlaceRef,
} from "../../src/features/market/sample-data.ts";

/**
 * Sample market data for the head-office dashboard (src/features/market/sample-data.ts): stable across reloads,
 * adding up from block to district to state, near the agreed state totals, and using no real person's name.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// A synthetic map: 6 districts of 10 to 20 blocks, 90 blocks in all.
const districts: PlaceRef[] = Array.from({ length: 6 }, (_, i) => ({ id: `GD-${i}`, name: `District ${String.fromCharCode(65 + i)}` }));
const blocks: BlockRef[] = districts.flatMap((d, i) => Array.from({ length: 10 + (i % 3) * 5 }, (_, j) => ({ id: `GB-${i}-${j}`, name: `Block ${i}-${j}`, districtId: d.id })));

describe("market sample data", () => {
  const market = buildMarketSample(blocks, districts);

  it("is the same on every build", () => {
    const again = buildMarketSample(blocks, districts);
    for (const days of PERIODS) assert.deepEqual(summarise(again, { level: "state" }, days), summarise(market, { level: "state" }, days));
    assert.deepEqual(again.people.map((p) => p.name), market.people.map((p) => p.name));
  });

  it("adds up: West Bengal is the sum of its districts, and a district the sum of its blocks", () => {
    for (const days of PERIODS) {
      const state = summarise(market, { level: "state" }, days);
      const parts = districts.map((d) => summarise(market, { level: "district", districtId: d.id }, days));
      for (const t of VISIT_TYPES) assert.equal(parts.reduce((a, p) => a + p.visits[t], 0), state.visits[t]);
      for (const s of LEAD_STATUSES) assert.equal(parts.reduce((a, p) => a + p.leads[s], 0), state.leads[s]);
      for (const t of PARTNER_TYPES) assert.equal(parts.reduce((a, p) => a + p.partners[t], 0), state.partners[t]);
      const d0 = summarise(market, { level: "district", districtId: "GD-0" }, days);
      const own = blocks.filter((b) => b.districtId === "GD-0").map((b) => summarise(market, { level: "block", blockId: b.id }, days));
      assert.equal(own.reduce((a, b) => a + b.visits.ihb, 0), d0.visits.ihb);
    }
  });

  it("is near the agreed state totals for the last 7 days, and longer periods have more", () => {
    const real = buildMarketSample(
      Array.from({ length: 345 }, (_, i) => ({ id: `GB-${i}`, name: `B${i}`, districtId: `GD-${i % 23}` })),
      Array.from({ length: 23 }, (_, i) => ({ id: `GD-${i}`, name: `D${i}` })),
    );
    const week = summarise(real, { level: "state" }, 7);
    // Within 10%, or three standard deviations of a count that size for the small ones (contractor visits are about 58).
    const near = (got: number, want: number) => assert.ok(Math.abs(got - want) <= Math.max(3 * Math.sqrt(want), want * 0.1), `${got} is not near ${want}`);
    for (const t of PARTNER_TYPES) near(week.partners[t], TARGET_STATE.partners[t]);
    for (const t of VISIT_TYPES) near(week.visits[t], TARGET_STATE.visits7[t]);
    for (const s of LEAD_STATUSES) near(week.leads[s], TARGET_STATE.leads7[s]);
    const month = summarise(real, { level: "state" }, 30);
    const quarter = summarise(real, { level: "state" }, 90);
    for (const t of VISIT_TYPES) assert.ok(week.visits[t] <= month.visits[t] && month.visits[t] <= quarter.visits[t], t);
  });

  it("gives every block one sales officer and every district one ASM, and officers' visits add up to the place", () => {
    const officers = market.people.filter((p) => p.role === "Sales Officer");
    assert.deepEqual(officers.flatMap((p) => p.blockIds).sort(), blocks.map((b) => b.id).sort());
    assert.equal(market.people.filter((p) => p.role === "ASM").length, districts.length);
    for (const scope of [{ level: "state" } as const, { level: "district", districtId: "GD-2" } as const, { level: "block", blockId: "GB-2-3" } as const]) {
      const s = summarise(market, scope, 30);
      const officerVisits = s.team.filter((r) => r.person.role === "Sales Officer").reduce((a, r) => a + r.visits, 0);
      assert.equal(officerVisits, Object.values(s.visits).reduce((a, b) => a + b, 0));
    }
    const block = summarise(market, { level: "block", blockId: "GB-2-3" }, 7);
    assert.deepEqual(block.team.map((r) => r.person.role), ["ASM", "Sales Officer"]);
  });

  it("uses no name of anyone in the area-mapping workbook", { skip: !existsSync(join(ROOT, "data/generated/dataset.json")) }, () => {
    const dataset = JSON.parse(readFileSync(join(ROOT, "data/generated/dataset.json"), "utf8")) as { units: { slots: { names: string[] }[] }[]; features: { id: string; kind: string; name: string; districtId: string | null }[] };
    const staff = dataset.units.flatMap((u) => u.slots.flatMap((s) => s.names.map((n) => n.toLowerCase().split(/\s+/))));
    const sample = buildMarketSample(
      dataset.features.filter((f) => f.kind === "block").map((f) => ({ id: f.id, name: f.name, districtId: f.districtId })),
      dataset.features.filter((f) => f.kind === "district").map((f) => ({ id: f.id, name: f.name })),
    );
    const clashes = sample.people.filter((p) => {
      const [first, last] = p.name.toLowerCase().split(" ");
      return staff.some((n) => n.includes(first) && n.includes(last));
    });
    assert.deepEqual(clashes.map((p) => p.name), []);
  });

  it("is pure: no network, storage or React in the data module", () => {
    const source = readFileSync(join(ROOT, "src/features/market/sample-data.ts"), "utf8");
    assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|localStorage|from "react"/);
  });
});
