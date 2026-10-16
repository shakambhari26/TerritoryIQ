import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { STATE_CONTEXT, mapContext } from "../../src/features/territory/map-level.ts";
import { buildModel } from "../../src/features/territory/model.ts";
import {
  NAME_NOTICE,
  PROVISIONAL_NOTICE,
  blockPins,
  clusterPins,
  type MarkerGeometry,
  type PinCluster,
  pinSetFor,
  pinsFor,
  slotLabel,
  territoryPins,
  type PinAnchor,
  type RepresentativePin,
} from "../../src/features/territory/representatives.ts";
import type { BoundaryLayer, TerritoryDataset } from "../../src/features/territory/types.ts";
import { ROOT } from "../../scripts/lib/sources.ts";

const layerPath = path.join(ROOT, "data", "generated", "boundaries.json");
const datasetPath = path.join(ROOT, "data", "generated", "dataset.json");
const built = existsSync(layerPath) && existsSync(datasetPath);

describe("representative pins on the real build", { skip: built ? false : "data not built: run `npm run data:build`" }, () => {
  const data = built ? (JSON.parse(readFileSync(datasetPath, "utf8")) as TerritoryDataset) : (null as never);
  const layer = built ? (JSON.parse(readFileSync(layerPath, "utf8")) as BoundaryLayer) : (null as never);
  const model = built ? buildModel(data, []) : (null as never);
  const anchors = built ? new Map<string, PinAnchor>(layer.shapes.filter((s) => s.anchor).map((s) => [s.featureId, s.anchor!])) : (null as never);
  const blockShapes = new Set(layer?.shapes.filter((s) => !s.featureId.startsWith("GD-")).map((s) => s.featureId));

  it("slot labels follow the workbook layout", () => {
    assert.equal(slotLabel("ASM", 1), "ASM");
    assert.equal(slotLabel("PRIMARY", 2), "Primary 2");
    assert.equal(slotLabel("SECONDARY", 5), "Secondary 5");
    assert.equal(slotLabel("DSO", 1), "DSO 1");
  });

  it("every pin sits exactly on a verified block anchor, never on a position of its own", () => {
    const pins = [...territoryPins(model, anchors), ...blockPins(model, anchors, () => true)];
    assert.ok(pins.length > 0);
    for (const pin of pins) {
      const anchor = anchors.get(pin.anchorFeatureId);
      assert.ok(anchor, `${pin.id} has an anchor`);
      assert.deepEqual([...pin.at], [anchor![0], anchor![1]]);
      assert.ok(blockShapes.has(pin.anchorFeatureId), `${pin.id} sits in a drawn block`);
      assert.equal(model.featureById.get(pin.anchorFeatureId)!.kind, "block");
    }
  });

  it("the state overview has one ASM pin per sales territory the source data supports", () => {
    const pins = territoryPins(model, anchors);
    assert.equal(new Set(pins.map((p) => p.id)).size, pins.length, "no duplicate pins");
    assert.equal(pins.length, data.salesTerritories.length, "all 21 territories have a matched, drawn block and a named ASM");
    for (const pin of pins) {
      assert.equal(pin.kind, "territory");
      assert.equal(pin.territoryIds.length, 1);
      assert.ok(pin.records.length >= 1);
      assert.ok(pin.records.every((r) => r.people.every((p) => p.role === "ASM" && !p.vacant && p.name)));
      assert.ok(pin.notices.includes(PROVISIONAL_NOTICE), "the provisional warning is on every pin");
      assert.ok(pin.notices.includes(NAME_NOTICE), "a name match is never presented as a verified person");
      assert.ok(pin.notices.some((n) => n.startsWith("Implied:")), "implied information is marked");
      assert.ok(pin.coverage && pin.coverage.matchedRows <= pin.coverage.totalRows);
    }
    // The pin sits in a block of its own territory, found through an effective link.
    for (const pin of pins) {
      const territory = model.territoryById.get(pin.territoryIds[0])!;
      assert.ok(territory.unitIds.some((id) => model.links.get(id)!.featureId === pin.anchorFeatureId));
    }
  });

  it("a territory with two ASM names is flagged as contested and shows both", () => {
    const pins = territoryPins(model, anchors);
    const multi = pins.filter((p) => p.records.length > 1);
    assert.ok(multi.length > 0, "the real data has territories listing two ASM names");
    for (const pin of multi) {
      assert.equal(pin.contested, true);
      assert.ok(pin.notices.some((n) => /different ASM names/.test(n)));
    }
    for (const pin of pins.filter((p) => p.records.length === 1)) assert.equal(pin.contested, false);
  });

  it("block pins exist only for a block that one or more matched rows link to and that has a named person", () => {
    const pins = blockPins(model, anchors, () => true);
    for (const pin of pins) {
      assert.equal(pin.kind, "block");
      assert.ok(pin.records.length >= 1);
      for (const record of pin.records) {
        assert.equal(model.links.get(record.unitId)!.featureId, pin.anchorFeatureId);
        assert.ok(["provisional", "reviewed"].includes(model.links.get(record.unitId)!.status));
        assert.ok(record.people.some((p) => !p.vacant && p.name), "a pin never stands for vacant markers only");
      }
    }
  });

  it("never pins unmatched, weakly matched, ambiguous or excluded rows, or a block with no outline", () => {
    const pinnedUnits = new Set(blockPins(model, anchors, () => true).flatMap((p) => p.records.map((r) => r.unitId)));
    for (const unit of data.units) {
      const status = model.links.get(unit.id)!.status;
      if (status === "weak" || status === "ambiguous" || status === "none" || status === "excluded") {
        assert.equal(pinnedUnits.has(unit.id), false, `${unit.id} (${status}) is not pinned`);
      }
      const featureId = model.links.get(unit.id)!.featureId;
      if (featureId && !anchors.has(featureId)) assert.equal(pinnedUnits.has(unit.id), false, `${unit.id} has no drawn block`);
    }
    assert.ok(data.units.some((u) => ["weak", "ambiguous", "none"].includes(model.links.get(u.id)!.status)), "the real data has unmatched rows to test against");
    // And with no anchors at all, nothing is pinned: there is no fallback position.
    assert.deepEqual(blockPins(model, new Map(), () => true), []);
    assert.deepEqual(territoryPins(model, new Map()), []);
  });

  it("rows that share one block are grouped into one pin, flagged, and not merged", () => {
    const pins = blockPins(model, anchors, () => true);
    const shared = pins.filter((p) => p.records.length > 1);
    assert.ok(shared.length > 0, "the real data has blocks claimed by several rows");
    for (const pin of shared) {
      assert.equal(pin.contested, true);
      assert.equal(new Set(pin.records.map((r) => r.unitId)).size, pin.records.length);
      assert.ok(pin.notices.some((n) => /not merged/.test(n)));
    }
    assert.equal(new Set(pins.map((p) => p.anchorFeatureId)).size, pins.length, "one pin per block");
  });

  it("a Vacant marker is shown as vacant, never as a name", () => {
    const pins = blockPins(model, anchors, () => true);
    const people = pins.flatMap((p) => p.records.flatMap((r) => r.people));
    for (const person of people) {
      if (person.vacant) assert.equal(person.name, null);
      else assert.ok(person.name && !/^vacant$/i.test(person.name));
    }
  });

  it("what a view shows: territory pins at state level, a district's block pins in a district, a territory's own blocks when selected", () => {
    assert.deepEqual(pinSetFor(STATE_CONTEXT, null), { mode: "territory" });
    const district = data.features.find((f) => f.kind === "district" && model.districtRollup.get(f.id)!.blocks > 0)!;
    const ctx = mapContext(model, { kind: "feature", id: district.id });
    const inDistrict = pinsFor(model, anchors, pinSetFor(ctx, null));
    assert.ok(inDistrict.every((p) => p.kind === "block" && model.featureById.get(p.anchorFeatureId)!.districtId === district.id));

    const territory = data.salesTerritories[0];
    const own = new Set(territory.unitIds.map((id) => model.links.get(id)!.featureId).filter((id): id is string => !!id));
    const forTerritory = pinsFor(model, anchors, pinSetFor(STATE_CONTEXT, own));
    assert.ok(forTerritory.length > 0);
    assert.ok(forTerritory.every((p) => own.has(p.anchorFeatureId)));
  });

  it("a local change that clears the only ASM and every name removes the pin: pins follow the effective data", () => {
    const territory = data.salesTerritories[0];
    const before = territoryPins(model, anchors).find((p) => p.territoryIds[0] === territory.id)!;
    assert.ok(before);
    const changes = territory.unitIds.flatMap((unitId) =>
      data.units
        .find((u) => u.id === unitId)!
        .slots.filter((s) => s.role === "ASM")
        .map((s, i) => ({
          kind: "clear-slot" as const,
          id: `c-${unitId}-${i}`,
          at: "2026-10-16T00:00:00.000Z",
          recordedBy: "test",
          unitId,
          reason: "test",
          role: s.role,
          slot: s.slot,
        })),
    );
    const cleared = buildModel(data, changes);
    assert.equal(territoryPins(cleared, anchors).some((p) => p.territoryIds[0] === territory.id), false);
  });

  it("every pin's text holds a staff name only through the model, so a names scan of the static output stays clean", () => {
    // The pin module imports no dataset file and embeds no literal name; names arrive from the model at run time.
    const source = readFileSync(path.join(ROOT, "src", "features", "territory", "representatives.ts"), "utf8");
    assert.equal(/dataset\.server|data\/generated|readFileSync|fetch\(/.test(source), false);
  });
});

describe("clusterPins", () => {
  const pin = (id: string, x: number, y: number): RepresentativePin => ({
    id,
    kind: "block",
    at: [x, y],
    anchorFeatureId: id,
    title: id,
    territoryIds: [],
    records: [],
    notices: [],
    contested: false,
  });
  const identity = (x: number, y: number) => ({ x, y });
  /** 20 by 20 markers, tip at the anchor; a group badge 24 by 24, centred on it. */
  const marker: MarkerGeometry = { pin: () => ({ width: 20, height: 20 }), group: { width: 24, height: 24 }, gap: 0 };
  const rectOf = (c: PinCluster) =>
    c.pins.length > 1
      ? { x: c.screen.x - 12, y: c.screen.y - 12, width: 24, height: 24 }
      : { x: c.screen.x - 10, y: c.screen.y - 20, width: 20, height: 20 };
  const touching = (a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it("keeps distant pins apart and groups overlapping ones, at a member's own anchor", () => {
    const clusters = clusterPins([pin("RP-A", 0, 0), pin("RP-B", 10, 0), pin("RP-C", 12, 3), pin("RP-D", 500, 500)], identity, marker);
    assert.equal(clusters.length, 2);
    const group = clusters.find((c) => c.pins.length === 3)!;
    assert.deepEqual(group.pins.map((p) => p.id), ["RP-A", "RP-B", "RP-C"]);
    assert.ok(group.pins.some((p) => p.at[0] === group.at[0] && p.at[1] === group.at[1]), "drawn at a real anchor, not an average");
    assert.equal(clusters.find((c) => c.pins.length === 1)!.id, "RP-D");
  });

  it("groups by the markers' rectangles, not by the distance between anchors", () => {
    // 15 px apart sideways: the 20 px wide markers overlap. 25 px apart: they do not, even though the anchors are close.
    assert.equal(clusterPins([pin("RP-A", 0, 0), pin("RP-B", 15, 0)], identity, marker).length, 1);
    assert.equal(clusterPins([pin("RP-A", 0, 0), pin("RP-B", 25, 0)], identity, marker).length, 2);
    // Straight above one another the marker is 20 px tall, so 25 px clears and 15 px does not.
    assert.equal(clusterPins([pin("RP-A", 0, 0), pin("RP-B", 0, 25)], identity, marker).length, 2);
    assert.equal(clusterPins([pin("RP-A", 0, 0), pin("RP-B", 0, 15)], identity, marker).length, 1);
    // A wide marker overlaps further out than a narrow one.
    const wide: MarkerGeometry = { ...marker, pin: () => ({ width: 40, height: 20 }) };
    assert.equal(clusterPins([pin("RP-A", 0, 0), pin("RP-B", 35, 0)], identity, wide).length, 1);
    assert.equal(clusterPins([pin("RP-A", 0, 0), pin("RP-B", 35, 0)], identity, marker).length, 2);
  });

  it("leaves no two markers overlapping, even when a group's badge reaches a third pin", () => {
    // 40 scattered pins: groups form, and a group's badge can reach a pin that touched none of its members alone.
    const crowd = Array.from({ length: 40 }, (_, i) => pin(`RP-${String(i).padStart(2, "0")}`, (i * 37) % 200, (i * 53) % 120));
    const clusters = clusterPins(crowd, identity, marker);
    assert.equal(clusters.reduce((n, c) => n + c.pins.length, 0), 40, "every pin is in exactly one marker");
    for (const [i, a] of clusters.entries()) {
      for (const b of clusters.slice(i + 1)) assert.ok(!touching(rectOf(a), rectOf(b)), `${a.id} overlaps ${b.id}`);
    }
  });

  it("is deterministic whatever order the pins arrive in", () => {
    const pins = [pin("RP-A", 0, 0), pin("RP-B", 10, 0), pin("RP-C", 400, 0)];
    assert.deepEqual(clusterPins(pins, identity, marker).map((c) => c.id), clusterPins([...pins].reverse(), identity, marker).map((c) => c.id));
    const crowd = Array.from({ length: 40 }, (_, i) => pin(`RP-${i}`, (i * 37) % 200, (i * 53) % 120));
    assert.deepEqual(clusterPins(crowd, identity, marker).map((c) => c.id), clusterPins([...crowd].reverse(), identity, marker).map((c) => c.id));
  });

  it("splits as the map zooms in, and ignores a pin that projects to a non-finite point", () => {
    const pins = [pin("RP-A", 0, 0), pin("RP-B", 10, 0)];
    assert.equal(clusterPins(pins, (x, y) => ({ x: x * 1, y }), marker).length, 1);
    assert.equal(clusterPins(pins, (x, y) => ({ x: x * 10, y }), marker).length, 2);
    assert.equal(clusterPins(pins, (x, y) => (x === 0 ? { x: NaN, y } : { x, y }), marker).length, 1);
  });
});
