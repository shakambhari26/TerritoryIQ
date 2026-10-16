import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layerProblem } from "../../src/features/territory/layer-validation.ts";
import { parseSelectionHash, selectionForFeature, selectionToHash, sameSelection } from "../../src/features/territory/selection.ts";
import { buildModel } from "../../src/features/territory/model.ts";
import { describeConflict, plural, shortHash } from "../../src/features/territory/format.ts";
import type { CrosswalkEntry, TerritoryDataset } from "../../src/features/territory/types.ts";

const feature = (id: string, kind: "district" | "block") => ({
  id,
  kind,
  lgdCode: 1,
  name: id,
  districtId: kind === "block" ? "GD-1" : null,
  villageRows: null,
  boundary: null,
  boundaryGap: "gap",
});
const dataset: TerritoryDataset = {
  meta: {} as TerritoryDataset["meta"],
  salesTerritories: [{ id: "ST-01", label: "Alpha", unitIds: ["TU-001", "TU-002", "TU-003"] }],
  features: [feature("GD-1", "district"), feature("GB-10", "block"), feature("GB-11", "block")],
  units: ["TU-001", "TU-002", "TU-003"].map((id, i) => ({
    id,
    sourceRow: i + 2,
    salesTerritoryId: "ST-01",
    blockLabel: `Label ${i}`,
    slots: [{ role: "ASM" as const, slot: 1, status: "named" as const, names: ["A"] }],
    flags: [],
  })),
  crosswalk: [
    { unitId: "TU-001", status: "provisional", featureId: "GB-10", candidates: [{ featureId: "GB-10", tier: "T1", score: null }], reason: "" },
    { unitId: "TU-002", status: "provisional", featureId: "GB-11", candidates: [{ featureId: "GB-11", tier: "T1", score: null }], reason: "" },
    { unitId: "TU-003", status: "provisional", featureId: "GB-11", candidates: [{ featureId: "GB-11", tier: "T1", score: null }], reason: "" },
  ] satisfies CrosswalkEntry[],
};
const model = buildModel(dataset, []);

describe("selection by internal ID", () => {
  it("round-trips through the URL hash", () => {
    for (const selection of [
      { kind: "unit", id: "TU-001" },
      { kind: "feature", id: "GB-10" },
      { kind: "territory", id: "ST-01" },
    ] as const) {
      assert.deepEqual(parseSelectionHash(selectionToHash(selection), model), selection);
    }
    assert.equal(selectionToHash(null), "");
  });

  it("selects nothing for an unknown ID, a name, a wrong kind or a malformed hash", () => {
    for (const hash of ["#unit=TU-999", "#unit=Label 0", "#feature=TU-001", "#territory=Alpha", "#unit=", "#unit=%E0%A4%A", "#other=TU-001", "unit=TU-001", ""]) {
      assert.equal(parseSelectionHash(hash, model), null, hash);
    }
  });

  it("a block outline selects its row when one row is linked, otherwise the official unit itself", () => {
    assert.deepEqual(selectionForFeature(model, "GB-10"), { kind: "unit", id: "TU-001" });
    assert.deepEqual(selectionForFeature(model, "GB-11"), { kind: "feature", id: "GB-11" }, "two rows share it");
    assert.deepEqual(selectionForFeature(model, "GD-1"), { kind: "feature", id: "GD-1" });
  });

  it("compares selections by kind and ID", () => {
    assert.equal(sameSelection({ kind: "unit", id: "a" }, { kind: "unit", id: "a" }), true);
    assert.equal(sameSelection({ kind: "unit", id: "a" }, { kind: "feature", id: "a" }), false);
    assert.equal(sameSelection(null, null), true);
  });
});

describe("layerProblem", () => {
  const good = {
    meta: {
      datasetId: "d",
      licence: "ODbL",
      attribution: "© OpenStreetMap contributors",
      source: "osm",
      retrievedAt: "2026-10-15T00:00:00Z",
      snapshots: ["2026-10-15T00:00:00Z"],
      status: "Provisional. Outlines are unofficial and unreviewed.",
    },
    viewBox: [0, 0, 10, 10],
    shapes: [{ featureId: "GB-10", d: "M0 0l1 1z", bbox: [0, 0, 1, 1] }],
  };

  it("accepts a well-formed layer whose shapes belong to known units", () => {
    assert.equal(layerProblem(good, new Set(["GB-10"])), null);
  });

  it("refuses missing provenance, shapes for unknown units, repeats and bad geometry", () => {
    assert.match(layerProblem(null)!, /not a JSON object/);
    assert.match(layerProblem({ ...good, meta: undefined })!, /provenance/);
    assert.match(layerProblem({ ...good, meta: { ...good.meta, licence: "" } })!, /licence/);
    assert.match(layerProblem({ ...good, meta: { ...good.meta, snapshots: [] } })!, /snapshot/);
    assert.match(layerProblem({ ...good, viewBox: [0, 0, 1] })!, /view box/);
    assert.match(layerProblem({ ...good, shapes: "x" })!, /no shapes/);
    assert.match(layerProblem(good, new Set(["GB-99"]))!, /does not belong/);
    assert.match(layerProblem({ ...good, shapes: [good.shapes[0], good.shapes[0]] })!, /repeats/);
    assert.match(layerProblem({ ...good, shapes: [{ ...good.shapes[0], d: "<script>" }] })!, /path data/);
    assert.match(layerProblem({ ...good, shapes: [{ ...good.shapes[0], bbox: [0, 0, Number.NaN, 1] }] })!, /bounding box/);
  });

  it("refuses a layer that does not declare itself provisional", () => {
    const withoutStatus: Record<string, unknown> = { ...good.meta };
    delete withoutStatus.status;
    assert.match(layerProblem({ ...good, meta: withoutStatus })!, /"status"/);
    assert.match(layerProblem({ ...good, meta: { ...good.meta, status: "  " } })!, /"status"/);
    assert.match(layerProblem({ ...good, meta: { ...good.meta, status: "Approved and verified." } })!, /Provisional/);
    assert.match(layerProblem({ ...good, meta: { ...good.meta, status: "Not provisional" } })!, /Provisional/);
  });
});

describe("wording helpers", () => {
  it("pluralises and shortens", () => {
    assert.equal(plural(1, "row"), "1 row");
    assert.equal(plural(1256, "slot"), "1,256 slots");
    assert.equal(plural(2, "vacancy", "vacancies"), "2 vacancies");
    assert.equal(shortHash("85c7f6a02370562d0e38286f592a71014a61a365e68e9cb05dc10eac22295fe3"), "85c7f6a0…295fe3");
  });

  it("describes a shared-block conflict without choosing a side", () => {
    const text = describeConflict(
      { kind: "shared-unit", featureId: "GB-11", otherUnitIds: ["TU-003"] },
      (id) => `row ${id}`,
      (id) => `Block ${id}`,
    );
    assert.match(text, /also listed by row TU-003/);
    assert.match(text, /neither listing is chosen/);
  });
});
