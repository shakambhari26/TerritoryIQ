import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { staffNames } from "../../scripts/verify-public-assets.mjs";
import type { Change } from "../../src/features/allocation/overlay.ts";
import { buildModel } from "../../src/features/territory/model.ts";
import { buildOverviewData, overviewModelInput, type OverviewData } from "../../src/features/territory/overview-data.ts";
import type { CrosswalkEntry, GeoFeature, StaffSlot, TerritoryDataset, TerritoryUnit } from "../../src/features/territory/types.ts";
import { leakedNames } from "./helpers/leaked-names.mts";

/**
 * The Overview's server-to-client data boundary. The page hands `OverviewDashboard` an `OverviewData`: structure
 * and opaque person keys, never a staff name. These tests use synthetic names only, and the check against the real
 * build reports counts, never the names it looked for.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (file: string) => readFileSync(resolve(ROOT, file), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---- synthetic dataset: not real geography, not real people -----------------

const SYNTHETIC_NAMES = [
  "Zephyrine Quillfeather",
  "Obadiah Thistlewick",
  "Marigold Fenwhistle",
  "Quentin O'Brambleby",
  "Wilhelmina Ashgrove-Penhallow",
  "Tobias  Wren",
  "Ignatius Crumpet & Sons",
];

const feature = (id: string, kind: "district" | "block", boundary: boolean, districtId: string | null = "GD-1"): GeoFeature => ({
  id,
  kind,
  lgdCode: Number(id.slice(3)),
  name: `Test ${id}`,
  districtId: kind === "block" ? districtId : null,
  villageRows: kind === "block" ? 10 : null,
  boundary: boundary
    ? { source: "osm", relationId: 1, sourceName: `Source ${id}`, basis: kind === "district" ? "lgd-district-code" : "name-and-district-containment" }
    : null,
  boundaryGap: boundary ? null : "test gap",
});
const named = (role: StaffSlot["role"], slot: number, ...names: string[]): StaffSlot => ({ role, slot, status: "named", names });
const vacant = (role: StaffSlot["role"], slot: number): StaffSlot => ({ role, slot, status: "vacant", names: [] });
const unit = (n: number, territory: string, slots: StaffSlot[]): TerritoryUnit => ({
  id: `TU-00${n}`,
  sourceRow: n + 1,
  salesTerritoryId: territory,
  blockLabel: `Block label ${n}`,
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
  features: [
    feature("GD-1", "district", true),
    feature("GD-2", "district", false),
    feature("GB-10", "block", true),
    feature("GB-11", "block", true),
    feature("GB-12", "block", false),
    feature("GB-13", "block", true),
    feature("GB-14", "block", true),
    feature("GB-15", "block", true),
  ],
  units: [
    // The same person under two spellings (case, spacing) in two rows, and an ASM cell naming two people.
    unit(1, "ST-01", [named("ASM", 1, SYNTHETIC_NAMES[0]), named("PRIMARY", 1, SYNTHETIC_NAMES[1]), named("SECONDARY", 1, "tobias wren")]),
    unit(2, "ST-01", [named("ASM", 1, SYNTHETIC_NAMES[2], SYNTHETIC_NAMES[3])]),
    unit(3, "ST-01", [named("ASM", 1, SYNTHETIC_NAMES[5]), named("DSO", 1, SYNTHETIC_NAMES[1])]),
    unit(4, "ST-01", [named("ASM", 1, SYNTHETIC_NAMES[4])]),
    unit(5, "ST-02", [named("ASM", 1, SYNTHETIC_NAMES[6])]),
    unit(6, "ST-02", [named("ASM", 1, SYNTHETIC_NAMES[0])]),
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

const at = "2026-10-15T10:00:00.000Z";
let counter = 0;
const change = <T extends Omit<Change, "id" | "at" | "recordedBy" | "reason">>(c: T): Change =>
  ({ id: `c${++counter}`, at, recordedBy: "Test reviewer", reason: "because", ...c }) as Change;

/** Every figure the Overview reads, plus the per-row and per-block states behind them. */
const figures = (model: ReturnType<typeof buildModel>) => ({
  summary: model.summary,
  rejected: model.rejectedChanges,
  units: [...model.unitAllocation].map(([id, a]) => [id, a.state, a.namedSlots, a.vacantSlots, a.coverage]),
  blocks: [...model.featureAllocation].map(([id, a]) => [id, a.state]),
});

describe("overview data: no staff name crosses to the client", () => {
  const data = buildOverviewData(dataset);
  const serialised = JSON.stringify(data);

  it("the serialised props contain none of the synthetic names, however they are cased or escaped", () => {
    assert.equal(leakedNames(serialised, SYNTHETIC_NAMES), 0);
  });

  it("the leak check itself works: the full dataset, as the page used to pass it, trips it for every name", () => {
    assert.equal(leakedNames(JSON.stringify(dataset), SYNTHETIC_NAMES), SYNTHETIC_NAMES.length);
    assert.equal(leakedNames(JSON.stringify(dataset).toUpperCase(), SYNTHETIC_NAMES), SYNTHETIC_NAMES.length, "case-insensitive");
    assert.equal(leakedNames(JSON.stringify({ n: SYNTHETIC_NAMES[3] }), [SYNTHETIC_NAMES[3]]), 1, "JSON-escaped");
    assert.equal(leakedNames(`<p>${SYNTHETIC_NAMES[6].replace(/&/g, "&amp;")}</p>`, [SYNTHETIC_NAMES[6]]), 1, "HTML-escaped");
  });

  it("carries exactly the explicit fields and no others: no names, source rows, block labels, flags, reasons or relation IDs", () => {
    const keys = new Set<string>();
    const collect = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
          keys.add(key);
          collect(inner);
        }
      }
    };
    collect(data);
    assert.deepEqual(
      [...keys].sort(),
      [
        "candidates", "crosswalk", "crosswalkProtocol", "dataRows", "districtId", "featureId", "features", "file", "hasBoundary", "id", "kind",
        "label", "lgdBlocks", "lgdDistricts", "name", "people", "provenance", "reportGenerated", "role", "sha256", "slot", "slots", "status",
        "territories", "territoryId", "tier", "unitId", "units", "workbook",
      ],
    );
  });

  it("represents each person by a bare integer key, shared exactly where the model counts one name", () => {
    const all = data.units.flatMap((u) => u.slots.flatMap((s) => s.people));
    assert.ok(all.length > 0 && all.every((k) => Number.isInteger(k) && k >= 0));
    // 10 people are listed, but repeats and the two spellings of one person share keys: 7 distinct.
    assert.equal(all.length, 10);
    assert.equal(new Set(all).size, 7);
    assert.deepEqual(data.units[0].slots.map((s) => s.people.length), [1, 1, 1]);
    assert.equal(data.units[0].slots[2].people[0], data.units[2].slots[0].people[0], "'tobias wren' and 'Tobias  Wren' are one person");
    assert.equal(data.units[1].slots[0].people.length, 2, "an ASM cell with two people keeps two keys");
    assert.deepEqual(data.units[6].slots[0], { role: "PRIMARY", slot: 1, status: "vacant", people: [] });
  });

  it("keys are not derived from the name: the same names in another order get keys by first appearance", () => {
    const reversed = buildOverviewData({ ...dataset, units: [...dataset.units].reverse() });
    const firstKey = reversed.units.flatMap((u) => u.slots.flatMap((s) => s.people))[0];
    assert.equal(firstKey, 0, "the first person seen is key 0, whoever they are");
  });

  it("the model input rebuilt for the browser holds no synthetic name either", () => {
    assert.equal(leakedNames(JSON.stringify(overviewModelInput(data)), SYNTHETIC_NAMES), 0);
  });
});

describe("overview data: every figure is unchanged", () => {
  const data: OverviewData = buildOverviewData(dataset);
  const rebuilt = overviewModelInput(data);

  it("gives the same summary, row states and block states as the full dataset with no local changes", () => {
    assert.deepEqual(figures(buildModel(rebuilt, [])), figures(buildModel(dataset, [])));
  });

  it("keeps the displayed distinct-name count", () => {
    assert.equal(buildModel(dataset, []).summary.staffing.distinctNames, 7);
    assert.equal(buildModel(rebuilt, []).summary.staffing.distinctNames, 7);
  });

  it("gives the same figures under every kind of local change, including names that stay or leave the count", () => {
    const cases: Array<[string, Change[]]> = [
      ["a new local name", [change({ kind: "set-slot", unitId: "TU-004", role: "SECONDARY", slot: 1, names: ["Synthetic Newcomer"] })]],
      ["the same new name typed twice", [
        change({ kind: "set-slot", unitId: "TU-004", role: "SECONDARY", slot: 1, names: ["Synthetic Newcomer"] }),
        change({ kind: "set-slot", unitId: "TU-006", role: "DSO", slot: 1, names: ["synthetic  newcomer"] }),
      ]],
      ["clearing a name another row also lists", [change({ kind: "clear-slot", unitId: "TU-006", role: "ASM", slot: 1 })]],
      ["clearing a name no other row lists", [change({ kind: "clear-slot", unitId: "TU-005", role: "ASM", slot: 1 })]],
      ["clearing one spelling of a person who has two", [change({ kind: "clear-slot", unitId: "TU-001", role: "SECONDARY", slot: 1 })]],
      ["overwriting a person's only slot", [change({ kind: "set-slot", unitId: "TU-004", role: "ASM", slot: 1, names: ["Synthetic Replacement"] })]],
      ["marking a named slot vacant", [change({ kind: "mark-slot-vacant", unitId: "TU-001", role: "PRIMARY", slot: 1 })]],
      ["filling a row that listed nobody", [change({ kind: "set-slot", unitId: "TU-007", role: "ASM", slot: 1, names: ["Synthetic Filler"] })]],
      ["confirming a row unallocated", [change({ kind: "confirm-unallocated", unitId: "TU-007", evidence: "synthetic evidence" })]],
      ["confirming unallocated on a row with staff, then withdrawing", [
        change({ kind: "confirm-unallocated", unitId: "TU-001", evidence: "synthetic evidence" }),
        change({ kind: "withdraw-confirmation", unitId: "TU-001" }),
      ]],
      ["confirming a link to a candidate block", [change({ kind: "review-link", unitId: "TU-004", decision: "confirmed", featureId: "GB-13" })]],
      ["excluding a row's link", [change({ kind: "review-link", unitId: "TU-002", decision: "excluded", featureId: null })]],
      ["holding a link", [change({ kind: "review-link", unitId: "TU-005", decision: "held", featureId: null })]],
      ["a change the model rejects", [change({ kind: "set-slot", unitId: "TU-999", role: "ASM", slot: 1, names: ["Nobody"] })]],
    ];
    for (const [label, changes] of cases) {
      assert.deepEqual(figures(buildModel(rebuilt, changes)), figures(buildModel(dataset, changes)), label);
    }
  });

  it("KNOWN LIMIT: a local name typed equal to a workbook name counts as a new distinct name", () => {
    // The browser has no workbook names to compare with. The Overview's local-changes figure for distinct names can
    // therefore be one higher than the model on the full dataset, in exactly this case. Documented in
    // docs/security-notes.md; every other figure is identical.
    const changes = [change({ kind: "set-slot", unitId: "TU-004", role: "SECONDARY", slot: 1, names: [SYNTHETIC_NAMES[2]] })];
    const full = buildModel(dataset, changes).summary.staffing;
    const minimised = buildModel(rebuilt, changes).summary.staffing;
    assert.equal(full.distinctNames, 7);
    assert.equal(minimised.distinctNames, 8);
    assert.equal(minimised.namedSlots, full.namedSlots);
    assert.equal(minimised.vacantSlots, full.vacantSlots);
  });
});

describe("overview data: the page and the dashboard use it", () => {
  const page = strip(read("src/app/page.tsx"));
  const dashboard = strip(read("src/features/territory/components/OverviewDashboard.tsx"));
  const server = strip(read("src/features/territory/dataset.server.ts"));

  it("the homepage passes the OverviewData, not the dataset, to the dashboard", () => {
    assert.match(page, /getOverviewData\(\)/);
    assert.doesNotMatch(page, /getDataset\b/, "the homepage does not read the full dataset");
    assert.match(page, /<OverviewDashboard data=\{overview\} layerMeta=\{getLayerMeta\(\)\} \/>/);
    assert.doesNotMatch(page, /dataset=\{/);
  });

  it("the dashboard takes OverviewData and no longer types its props as the full dataset", () => {
    assert.match(dashboard, /data: OverviewData/);
    assert.doesNotMatch(dashboard, /dataset: TerritoryDataset|\bTerritoryDataset\b/);
  });

  it("overview-data.ts is pure: no file, network or server-module import", () => {
    const source = strip(read("src/features/territory/overview-data.ts"));
    assert.doesNotMatch(source, /node:|\.server|\bfetch\b|process\./);
    assert.deepEqual([...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]), ["./types.ts"]);
  });

  it("the server module builds it once from the dataset", () => {
    assert.match(server, /buildOverviewData\(dataset\)/);
    assert.match(server, /export function getOverviewData\(\)/);
  });
});

const built = existsSync(resolve(ROOT, "data", "generated", "dataset.json"));
describe("overview data: the real build", { skip: built ? false : "data not built: run `npm run data:build`" }, () => {
  const real = built ? (JSON.parse(read("data/generated/dataset.json")) as TerritoryDataset) : (undefined as never);
  const data = built ? buildOverviewData(real) : (undefined as never);

  it("gives exactly the figures the full dataset gives, with no local changes", () => {
    assert.deepEqual(figures(buildModel(overviewModelInput(data), [])), figures(buildModel(real, [])));
  });

  it("serialises without any of the workbook's staff names (counts only are reported)", () => {
    const names = staffNames(real);
    assert.ok(names.length > 200, `the check needs the real names (${names.length})`);
    assert.equal(leakedNames(JSON.stringify(data), names), 0, "names found in the serialised Overview data");
    assert.equal(leakedNames(JSON.stringify(real), names) > 200, true, "and the same check does find them in the full dataset");
  });
});
