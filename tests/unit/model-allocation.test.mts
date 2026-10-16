import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOverlay, serialiseOverlay, type Change } from "../../src/features/allocation/overlay.ts";
import { buildModel } from "../../src/features/territory/model.ts";
import type {
  CrosswalkEntry,
  GeoFeature,
  StaffSlot,
  TerritoryDataset,
  TerritoryUnit,
} from "../../src/features/territory/types.ts";

// ---- synthetic dataset: not real geography, not real people -----------------

const feature = (id: string, kind: "district" | "block", boundary: boolean, districtId: string | null = "GD-1"): GeoFeature => ({
  id,
  kind,
  lgdCode: Number(id.slice(3)),
  name: `Test ${id}`,
  districtId: kind === "block" ? districtId : null,
  villageRows: kind === "block" ? 10 : null,
  boundary: boundary
    ? { source: "osm", relationId: 1, sourceName: id, basis: kind === "district" ? "lgd-district-code" : "name-and-district-containment" }
    : null,
  boundaryGap: boundary ? null : "test gap",
});

const named = (role: StaffSlot["role"], slot: number, name: string): StaffSlot => ({ role, slot, status: "named", names: [name] });
const vacant = (role: StaffSlot["role"], slot: number): StaffSlot => ({ role, slot, status: "vacant", names: [] });
const unit = (n: number, territory: string, slots: StaffSlot[]): TerritoryUnit => ({
  id: `TU-00${n}`,
  sourceRow: n + 1,
  salesTerritoryId: territory,
  blockLabel: `Label ${n}`,
  slots,
  flags: [],
});
const link = (unitId: string, status: CrosswalkEntry["status"], featureId: string | null, candidates: CrosswalkEntry["candidates"] = []): CrosswalkEntry => ({
  unitId,
  status,
  featureId,
  candidates: candidates.length || !featureId ? candidates : [{ featureId, tier: "T1", score: null }],
  reason: "test",
});

const dataset: TerritoryDataset = {
  meta: {} as TerritoryDataset["meta"],
  salesTerritories: [
    { id: "ST-01", label: "Alpha", unitIds: ["TU-001", "TU-002", "TU-003", "TU-004"] },
    { id: "ST-02", label: "Beta", unitIds: ["TU-005", "TU-006", "TU-007"] },
  ],
  features: [
    feature("GD-1", "district", true),
    feature("GB-10", "block", true),
    feature("GB-11", "block", true),
    feature("GB-12", "block", false),
    feature("GB-13", "block", true),
    feature("GB-14", "block", true),
  ],
  units: [
    unit(1, "ST-01", [named("ASM", 1, "Asm One"), named("PRIMARY", 1, "Pri One"), named("SECONDARY", 1, "Sec One")]),
    unit(2, "ST-01", [named("ASM", 1, "Asm Two")]),
    unit(3, "ST-01", [named("ASM", 1, "Asm Three"), named("DSO", 1, "Dso Three")]),
    unit(4, "ST-01", [named("ASM", 1, "Asm Four")]),
    unit(5, "ST-02", [named("ASM", 1, "Asm Five")]),
    unit(6, "ST-02", [named("ASM", 1, "Asm Six")]),
    unit(7, "ST-02", [vacant("PRIMARY", 1)]),
  ],
  crosswalk: [
    link("TU-001", "provisional", "GB-10"),
    link("TU-002", "provisional", "GB-11"),
    link("TU-003", "provisional", "GB-11"),
    link("TU-004", "ambiguous", null, [
      { featureId: "GB-12", tier: "T1", score: null },
      { featureId: "GB-13", tier: "T1", score: null },
    ]),
    link("TU-005", "weak", null, [{ featureId: "GB-14", tier: "T4", score: 0.9 }]),
    link("TU-006", "none", null),
    link("TU-007", "provisional", "GB-12"),
  ],
};

const base = () => buildModel(dataset, []);
const at = "2026-10-15T10:00:00.000Z";
let counter = 0;
const change = <T extends Omit<Change, "id" | "at" | "recordedBy" | "reason">>(c: T, overrides: Partial<Change> = {}): Change =>
  ({ id: `c${++counter}`, at, recordedBy: "Test reviewer", reason: "because", ...c, ...overrides }) as Change;

describe("allocation states from the workbook data", () => {
  const model = base();
  const state = (id: string) => model.unitAllocation.get(id)!.state;

  it("marks rows with a named person as allocated and others as missing", () => {
    assert.equal(state("TU-001"), "allocated");
    assert.equal(state("TU-006"), "allocated");
    assert.equal(state("TU-007"), "missing", "a row with only a Vacant marker has no named person");
  });

  it("marks two rows linked to the same official unit as conflicting, and neither wins", () => {
    assert.equal(state("TU-002"), "conflicting");
    assert.equal(state("TU-003"), "conflicting");
    assert.deepEqual(model.unitAllocation.get("TU-002")!.conflicts, [
      { kind: "shared-unit", featureId: "GB-11", otherUnitIds: ["TU-003"] },
    ]);
  });

  it("never reports confirmed unallocated without a stored confirmation", () => {
    for (const s of model.unitAllocation.values()) assert.notEqual(s.state, "confirmed_unallocated");
    assert.equal(model.summary.units.byState.confirmed_unallocated, 0);
    assert.equal(model.summary.blocks.byState.confirmed_unallocated, 0);
  });

  it("describes how deep cover is, so an ASM-only row is not shown as fully covered", () => {
    assert.equal(model.unitAllocation.get("TU-001")!.coverage, "full");
    assert.equal(model.unitAllocation.get("TU-002")!.coverage, "asm-only");
    assert.equal(model.unitAllocation.get("TU-003")!.coverage, "partial");
    assert.equal(model.unitAllocation.get("TU-007")!.coverage, "none");
  });
});

describe("states of official units", () => {
  const model = base();
  const state = (id: string) => model.featureAllocation.get(id)!;

  it("takes the state of the single row that claims it", () => {
    assert.equal(state("GB-10").state, "allocated");
  });

  it("is conflicting when two rows claim it", () => {
    assert.equal(state("GB-11").state, "conflicting");
  });

  it("is conflicting when a claim and an ambiguous row both point at it", () => {
    assert.deepEqual(state("GB-12").claimants, ["TU-007"]);
    assert.deepEqual(state("GB-12").contestedBy, ["TU-004"]);
    assert.equal(state("GB-12").state, "conflicting");
  });

  it("is missing / unverified when only one ambiguous row or only a weak variant points at it", () => {
    assert.equal(state("GB-13").state, "missing");
    assert.deepEqual(state("GB-13").contestedBy, ["TU-004"]);
    assert.equal(state("GB-14").state, "missing");
    assert.deepEqual(state("GB-14").possibleRows, ["TU-005"]);
    assert.deepEqual(state("GB-14").claimants, [], "a weak variant is not a claim");
  });
});

describe("local changes", () => {
  it("leave the workbook-derived data untouched", () => {
    const snapshot = JSON.stringify(dataset);
    buildModel(dataset, [change({ kind: "set-slot", unitId: "TU-007", role: "PRIMARY", slot: 1, names: ["New Person"] })]);
    assert.equal(JSON.stringify(dataset), snapshot);
  });

  it("assign, vacate and clear are distinct: blank is never vacant", () => {
    const model = buildModel(dataset, [
      change({ kind: "set-slot", unitId: "TU-007", role: "SECONDARY", slot: 2, names: ["  Some   Person "] }),
      change({ kind: "mark-slot-vacant", unitId: "TU-001", role: "PRIMARY", slot: 1 }),
      change({ kind: "clear-slot", unitId: "TU-001", role: "SECONDARY", slot: 1 }),
    ]);
    const seven = model.effective.get("TU-007")!;
    assert.deepEqual(seven.slots.map((s) => [s.role, s.slot, s.status, s.names]), [
      ["PRIMARY", 1, "vacant", []],
      ["SECONDARY", 2, "named", ["Some Person"]],
    ]);
    assert.equal(model.unitAllocation.get("TU-007")!.state, "allocated");
    const one = model.effective.get("TU-001")!;
    assert.deepEqual(one.slots.map((s) => [s.role, s.status]), [["ASM", "named"], ["PRIMARY", "vacant"]]);
    assert.equal(model.unitAllocation.get("TU-001")!.vacantSlots, 1);
  });

  it("confirming unallocated on a row with no named staff gives the confirmed state", () => {
    const model = buildModel(dataset, [change({ kind: "confirm-unallocated", unitId: "TU-007", evidence: "Visited, no coverage" })]);
    const allocation = model.unitAllocation.get("TU-007")!;
    assert.equal(allocation.state, "confirmed_unallocated");
    assert.equal(allocation.confirmation?.confirmedBy, "Test reviewer");
    assert.equal(model.summary.units.byState.confirmed_unallocated, 1);
  });

  it("confirming unallocated on a row that lists staff is a conflict, not a win for either", () => {
    const model = buildModel(dataset, [change({ kind: "confirm-unallocated", unitId: "TU-006", evidence: "Said to be uncovered" })]);
    assert.equal(model.unitAllocation.get("TU-006")!.state, "conflicting");
    assert.deepEqual(model.unitAllocation.get("TU-006")!.conflicts, [{ kind: "confirmation-with-staff" }]);
  });

  it("withdrawing a confirmation returns the row to what the data says", () => {
    const model = buildModel(dataset, [
      change({ kind: "confirm-unallocated", unitId: "TU-007", evidence: "x" }),
      change({ kind: "withdraw-confirmation", unitId: "TU-007" }),
    ]);
    assert.equal(model.unitAllocation.get("TU-007")!.state, "missing");
  });

  it("a reviewer can resolve an ambiguous row by confirming one of its candidates", () => {
    const model = buildModel(dataset, [change({ kind: "review-link", unitId: "TU-004", decision: "confirmed", featureId: "GB-13" })]);
    assert.equal(model.links.get("TU-004")!.status, "reviewed");
    assert.equal(model.featureAllocation.get("GB-13")!.state, "allocated");
    assert.deepEqual(model.featureAllocation.get("GB-12")!.contestedBy, []);
    assert.equal(model.featureAllocation.get("GB-12")!.state, "missing", "GB-12 is now claimed only by the row with no named person");
  });

  it("excluding one of two rows that share a unit ends the conflict", () => {
    const model = buildModel(dataset, [change({ kind: "review-link", unitId: "TU-002", decision: "excluded", featureId: null })]);
    assert.equal(model.links.get("TU-002")!.status, "excluded");
    assert.equal(model.unitAllocation.get("TU-003")!.state, "allocated");
    assert.equal(model.featureAllocation.get("GB-11")!.state, "allocated");
  });

  it("holding a link keeps it as it was", () => {
    const model = buildModel(dataset, [change({ kind: "review-link", unitId: "TU-001", decision: "held", featureId: null })]);
    assert.equal(model.links.get("TU-001")!.status, "provisional");
    assert.equal(model.links.get("TU-001")!.held, true);
  });

  it("rejects invalid changes and keeps the view intact", () => {
    const bad: Change[] = [
      change({ kind: "set-slot", unitId: "TU-999", role: "ASM", slot: 1, names: ["X"] }),
      change({ kind: "set-slot", unitId: "TU-001", role: "ASM", slot: 1, names: ["X"] }, { reason: "  " }),
      change({ kind: "set-slot", unitId: "TU-001", role: "PRIMARY", slot: 9, names: ["X"] }),
      change({ kind: "set-slot", unitId: "TU-001", role: "PRIMARY", slot: 2, names: ["Vacant"] }),
      change({ kind: "confirm-unallocated", unitId: "TU-007", evidence: "" }),
      change({ kind: "review-link", unitId: "TU-004", decision: "confirmed", featureId: "GB-10" }),
      change({ kind: "review-link", unitId: "TU-004", decision: "confirmed", featureId: null }),
    ];
    const model = buildModel(dataset, bad);
    assert.equal(model.rejectedChanges, bad.length);
    assert.deepEqual(model.summary.units.byState, base().summary.units.byState);
  });
});

describe("summary", () => {
  it("accounts for every row and every block exactly once", () => {
    const { summary } = base();
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    assert.equal(sum(summary.units.byState), dataset.units.length);
    assert.equal(sum(summary.units.coverage), dataset.units.length);
    assert.equal(sum(summary.links.byStatus), dataset.units.length);
    assert.equal(sum(summary.blocks.byState), 5);
    assert.equal(summary.blocks.withBoundary + summary.blocks.withoutBoundary, 5);
    assert.equal(summary.byTerritory.reduce((n, t) => n + t.units, 0), dataset.units.length);
  });

  it("counts staffing from named and vacant slots and counts a name once", () => {
    const model = buildModel(dataset, [change({ kind: "set-slot", unitId: "TU-007", role: "PRIMARY", slot: 2, names: ["asm   one"] })]);
    assert.equal(model.summary.staffing.vacantSlots, 1);
    // Nine distinct people in the fixture; "asm   one" repeats "Asm One" apart from case and spacing.
    assert.equal(model.summary.staffing.distinctNames, 9);
  });

  it("rolls blocks up to their official district", () => {
    const roll = base().districtRollup.get("GD-1")!;
    assert.equal(roll.blocks, 5);
    assert.equal(roll.withBoundary, 4);
  });
});

describe("stored change log", () => {
  it("round-trips and ignores damaged data instead of failing", () => {
    const log = [change({ kind: "withdraw-confirmation", unitId: "TU-001" })];
    assert.deepEqual(parseOverlay(serialiseOverlay(log)), { changes: log, problem: null });
    assert.equal(parseOverlay("{not json").changes.length, 0);
    assert.ok(parseOverlay("{not json").problem);
    assert.ok(parseOverlay('{"version":99,"changes":[]}').problem);
    assert.deepEqual(parseOverlay(null), { changes: [], problem: null });
  });
});
