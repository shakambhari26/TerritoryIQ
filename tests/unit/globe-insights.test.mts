import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildGlobeInsights } from "../../src/features/globe/insights.ts";
import { buildModel } from "../../src/features/territory/model.ts";
import { buildOverviewData, overviewModelInput } from "../../src/features/territory/overview-data.ts";
import type { CrosswalkEntry, GeoFeature, StaffSlot, TerritoryDataset, TerritoryUnit } from "../../src/features/territory/types.ts";
import { leakedNames } from "./helpers/leaked-names.mts";

/**
 * The Globe's insight figures (features/globe/insights.ts). They are computed from the Overview's own name-free data, so
 * these tests check three things on a synthetic dataset (invented geography and people, never the workbook): the figures
 * are the model's figures, vacancy stays a count of its own and never an allocation state, and no name reaches the result.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (file: string) => readFileSync(resolve(ROOT, file), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const NAMES = ["Zephyrine Quillfeather", "Obadiah Thistlewick", "Marigold Fenwhistle", "Quentin Brambleby", "Wilhelmina Ashgrove", "Tobias Wren", "Ignatius Crumpet"];

const feature = (id: string, kind: "district" | "block", districtId: string | null = "GD-1"): GeoFeature => ({
  id,
  kind,
  lgdCode: Number(id.slice(3)),
  name: `Test ${id}`,
  districtId: kind === "block" ? districtId : null,
  villageRows: kind === "block" ? 10 : null,
  boundary: { source: "osm", relationId: 1, sourceName: `Source ${id}`, basis: kind === "district" ? "lgd-district-code" : "name-and-district-containment" },
  boundaryGap: null,
});
const named = (role: StaffSlot["role"], slot: number, ...names: string[]): StaffSlot => ({ role, slot, status: "named", names });
const vacant = (role: StaffSlot["role"], slot: number): StaffSlot => ({ role, slot, status: "vacant", names: [] });
const unit = (n: number, territory: string, slots: StaffSlot[]): TerritoryUnit => ({ id: `TU-00${n}`, sourceRow: n + 1, salesTerritoryId: territory, blockLabel: `Block label ${n}`, slots, flags: [] });
const link = (unitId: string, status: CrosswalkEntry["status"], featureId: string | null, candidates: CrosswalkEntry["candidates"] = []): CrosswalkEntry => ({
  unitId,
  status,
  featureId,
  candidates: candidates.length || !featureId ? candidates : [{ featureId, tier: "T1", score: null }],
  reason: "test",
});

const dataset: TerritoryDataset = {
  meta: {
    generatedAt: "2026-10-15T00:00:00.000Z",
    workbook: { file: "workbook.xlsx", sha256: "a".repeat(64), bytes: 10, dataRows: 7 },
    lgdDistricts: { file: "districts.xls", sha256: "b".repeat(64), bytes: 20, reportGenerated: "2026-10-15" },
    lgdBlocks: { file: "blocks.xls", sha256: "c".repeat(64), bytes: 30, reportGenerated: "2026-10-15", villageRows: 5 },
    matching: { protocol: "Synthetic protocol text.", exactTierRows: 1, provisionalRows: 4, ambiguousRows: 1, weakRows: 1, noneRows: 1 },
  },
  salesTerritories: [
    { id: "ST-01", label: "Alpha", unitIds: ["TU-001", "TU-002", "TU-003", "TU-004"] },
    { id: "ST-02", label: "Beta", unitIds: ["TU-005", "TU-006", "TU-007"] },
  ],
  features: [feature("GD-1", "district"), feature("GD-2", "district"), ...["GB-10", "GB-11", "GB-12", "GB-13", "GB-14", "GB-15"].map((id) => feature(id, "block"))],
  units: [
    unit(1, "ST-01", [named("ASM", 1, NAMES[0]), named("PRIMARY", 1, NAMES[1]), named("SECONDARY", 1, NAMES[5])]),
    unit(2, "ST-01", [named("ASM", 1, NAMES[2], NAMES[3])]),
    unit(3, "ST-01", [named("ASM", 1, NAMES[5]), named("DSO", 1, NAMES[1])]),
    unit(4, "ST-01", [named("ASM", 1, NAMES[4])]),
    unit(5, "ST-02", [named("ASM", 1, NAMES[6])]),
    unit(6, "ST-02", [named("ASM", 1, NAMES[0])]),
    unit(7, "ST-02", [vacant("PRIMARY", 1)]),
  ],
  crosswalk: [
    link("TU-001", "provisional", "GB-10"),
    link("TU-002", "provisional", "GB-11"),
    link("TU-003", "provisional", "GB-11"),
    link("TU-004", "ambiguous", null, [
      { featureId: "GB-12", tier: "T1", score: null },
      { featureId: "GB-13", tier: "T2", score: null },
    ]),
    link("TU-005", "weak", null, [{ featureId: "GB-14", tier: "T4", score: 0.9 }]),
    link("TU-006", "none", null),
    link("TU-007", "provisional", "GB-12"),
  ],
};

const data = buildOverviewData(dataset);
const insights = buildGlobeInsights(data);
const model = buildModel(overviewModelInput(data));

describe("globe insights: the figures are the Overview's figures", () => {
  it("the state totals are the model's summary, unchanged", () => {
    const { summary } = model;
    assert.deepEqual(insights.state.rows, { total: summary.units.total, byState: summary.units.byState });
    assert.deepEqual(insights.state.blocks, { total: summary.blocks.total, byState: summary.blocks.byState });
    assert.deepEqual(insights.state.staff, { named: summary.staffing.namedSlots, vacant: summary.staffing.vacantSlots });
    assert.equal(insights.state.salesTerritories, 2);
  });

  it("the synthetic dataset gives the hand-counted figures", () => {
    assert.deepEqual(insights.state.rows.byState, { allocated: 4, confirmed_unallocated: 0, missing: 1, conflicting: 2 });
    assert.deepEqual(insights.state.blocks.byState, { allocated: 1, confirmed_unallocated: 0, missing: 3, conflicting: 2 });
    assert.deepEqual(insights.state.staff, { named: 9, vacant: 1 });
  });

  it("a district counts its blocks by state, and the rows whose link reaches it", () => {
    const d1 = insights.districts["GD-1"];
    assert.deepEqual(d1.blocks, { total: 6, byState: { allocated: 1, confirmed_unallocated: 0, missing: 3, conflicting: 2 } });
    assert.deepEqual(d1.rows, { linked: 4, byState: { allocated: 1, confirmed_unallocated: 0, missing: 1, conflicting: 2 } });
    assert.deepEqual(d1.staff, { named: 6, vacant: 1 });
    assert.deepEqual(insights.districts["GD-2"], { blocks: { total: 0, byState: { allocated: 0, confirmed_unallocated: 0, missing: 0, conflicting: 0 } }, rows: { linked: 0, byState: { allocated: 0, confirmed_unallocated: 0, missing: 0, conflicting: 0 } }, staff: { named: 0, vacant: 0 } });
  });

  it("a block carries the model's state for it, and the slots of the rows linked to it", () => {
    for (const [id, allocation] of model.featureAllocation) assert.equal(insights.blocks[id].state, allocation.state, id);
    assert.deepEqual(insights.blocks["GB-10"], { state: "allocated", staff: { named: 3, vacant: 0 } });
    assert.deepEqual(insights.blocks["GB-11"], { state: "conflicting", staff: { named: 3, vacant: 0 } });
    assert.deepEqual(insights.blocks["GB-12"], { state: "conflicting", staff: { named: 0, vacant: 1 } });
    assert.deepEqual(insights.blocks["GB-13"], { state: "missing", staff: { named: 0, vacant: 0 } });
    assert.equal(Object.keys(insights.blocks).length, 6, "blocks only: a district has no block insight");
  });

  it("a block no row is linked to is missing / unverified, never confirmed unallocated", () => {
    for (const id of ["GB-13", "GB-14", "GB-15"]) assert.equal(insights.blocks[id].state, "missing", id);
    assert.equal(insights.state.blocks.byState.confirmed_unallocated, 0);
  });
});

describe("globe insights: vacancy is a count of its own", () => {
  it("every state key is one of the four allocation states, and vacancy is never one of them", () => {
    const states = ["allocated", "confirmed_unallocated", "missing", "conflicting"];
    const all = [insights.state.rows.byState, insights.state.blocks.byState, ...Object.values(insights.districts).flatMap((d) => [d.blocks.byState, d.rows.byState])];
    for (const counts of all) assert.deepEqual(Object.keys(counts).sort(), [...states].sort());
    for (const block of Object.values(insights.blocks)) assert.ok(states.includes(block.state));
  });

  it("a Vacant-only row is counted as a vacant slot and as an allocation state of 'missing', and nothing else", () => {
    const vacantOnly = insights.blocks["GB-12"];
    assert.equal(vacantOnly.staff.vacant, 1);
    assert.equal(model.unitAllocation.get("TU-007")?.state, "missing");
  });
});

describe("globe insights: no name crosses to the page", () => {
  const serialised = JSON.stringify(insights);

  it("the serialised insights hold none of the synthetic names", () => {
    assert.equal(leakedNames(serialised, NAMES), 0);
    assert.equal(leakedNames(JSON.stringify(dataset), NAMES), NAMES.length, "the check does trip on the full dataset");
  });

  it("the keys are counts and IDs only, and avoid the field names the privacy checks look for in the page", () => {
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
          keys.add(key);
          walk(inner);
        }
      }
    };
    walk({ ...insights, districts: Object.values(insights.districts), blocks: Object.values(insights.blocks) });
    assert.deepEqual([...keys].sort(), ["blocks", "byState", "districts", "conflicting", "confirmed_unallocated", "allocated", "linked", "missing", "named", "rows", "salesTerritories", "staff", "state", "total", "vacant"].sort());
    for (const forbidden of ["slots", "people", "records", "territory", "blockLabel", "names"]) assert.ok(!keys.has(forbidden), forbidden);
  });

  it("the module is pure: no I/O, no clock, no network, and it never reads the dataset itself", () => {
    const code = strip(read("src/features/globe/insights.ts"));
    assert.doesNotMatch(code, /server-only|\bfetch\s*\(|node:fs|readFile|process\.cwd|Date\.now|new Date|data\/generated|dataset\.server/);
  });
});

describe("globe insights panel: wording", () => {
  const panel = strip(read("src/features/globe/components/InsightsPanel.tsx"));

  it("says what the figures are, keeps the four dimensions apart, and invents no trend or percentage", () => {
    assert.match(panel, /Region overview/);
    assert.match(panel, /Allocation overview/);
    assert.match(panel, /Quick insights/);
    assert.match(panel, /Staff slots, counted apart from geography/);
    assert.match(panel, /not an allocation state/);
    assert.match(panel, /An outline shows where a block is, not who covers it/);
    assert.match(panel, /missing \/ unverified, not unallocated/);
    assert.doesNotMatch(panel, /%|percent|trend|forecast|since last|vs\.? last|growth/i);
    assert.doesNotMatch(panel, /\b(?:verified|confirmed)\s+(?:link|match|boundary|outline|association)/i);
  });

  it("labels the figures as the workbook baseline, flags local changes it leaves out, and says what 'missing' includes", () => {
    assert.match(panel, /Workbook baseline/);
    assert.match(panel, /useLocalChanges\(\)\.changes\.length/, "it reads the browser's change log, only to say how many changes the figures leave out");
    assert.match(panel, /recorded in this browser[\s\S]*not included here/);
    assert.match(panel, /whose row lists no one, is missing \/ unverified, not unallocated/);
    assert.match(panel, /no row linked, or no one listed/);
    assert.doesNotMatch(panel, /blocks no row is linked to/, "a Vacant-only row also makes a block missing, so 'no row linked' alone would be wrong");
  });

  it("is fed by counts the app already computes, and never reads a name or a row", () => {
    assert.doesNotMatch(panel, /\.records\b|\brecords\s*:|block-rows|fetch\s*\(/);
  });
});
