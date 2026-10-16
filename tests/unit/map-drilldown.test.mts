import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fitBounds, unionBounds, type Bounds } from "../../src/features/geo/viewport.ts";
import { controlObstacles } from "../../src/features/territory/map-layout.ts";
import { planLabels, type LabelAnchor } from "../../src/features/territory/map-labels.ts";
import {
  STATE_CONTEXT,
  actionForBackgroundClick,
  actionForEscape,
  actionForFeatureClick,
  breadcrumbs,
  isBlockInteractive,
  mapContext,
  parentSelection,
  visibleBlockIds,
} from "../../src/features/territory/map-level.ts";
import { buildModel } from "../../src/features/territory/model.ts";
import { blockQuality, districtQuality } from "../../src/features/territory/quality.ts";
import { buildSearchIndex, searchFeatures } from "../../src/features/territory/search.ts";
import type { BoundaryLayer, TerritoryDataset } from "../../src/features/territory/types.ts";
import { ROOT } from "../../scripts/lib/sources.ts";

const layerPath = path.join(ROOT, "data", "generated", "boundaries.json");
const datasetPath = path.join(ROOT, "data", "generated", "dataset.json");
const built = existsSync(layerPath) && existsSync(datasetPath);

describe("district-to-block drill-down on the real build", { skip: built ? false : "data not built: run `npm run data:build`" }, () => {
  const data = built ? (JSON.parse(readFileSync(datasetPath, "utf8")) as TerritoryDataset) : (null as never);
  const layer = built ? (JSON.parse(readFileSync(layerPath, "utf8")) as BoundaryLayer) : (null as never);
  const model = built ? buildModel(data, []) : (null as never);
  const shapeIds = new Set(layer?.shapes.map((s) => s.featureId));
  const district = (name: string) => data.features.find((f) => f.kind === "district" && f.name === name)!;
  const blocksOf = (districtId: string) => data.features.filter((f) => f.kind === "block" && f.districtId === districtId);
  const anchorsOf = () => new Map<string, LabelAnchor>(layer.shapes.filter((s) => s.anchor).map((s) => [s.featureId, s.anchor!]));
  const districtShapeIds = () => layer.shapes.filter((s) => s.featureId.startsWith("GD-")).map((s) => s.featureId);

  it("the level follows the selection, and a block's parent is its LGD district code", () => {
    assert.deepEqual(mapContext(model, null), STATE_CONTEXT);
    const bankura = district("Bankura");
    assert.deepEqual(mapContext(model, { kind: "feature", id: bankura.id }), { level: "district", districtId: bankura.id, blockId: null });
    const block = blocksOf(bankura.id)[0];
    assert.equal(block.districtId, bankura.id, "an explicit LGD code, not a name");
    assert.deepEqual(mapContext(model, { kind: "feature", id: block.id }), { level: "block", districtId: bankura.id, blockId: block.id });
    // A territory selection is a company grouping and never places the map in a district.
    assert.deepEqual(mapContext(model, { kind: "territory", id: data.salesTerritories[0].id }), STATE_CONTEXT);
  });

  it("a row with no justified link gives no district: the map stays at state level instead of guessing from a name", () => {
    const unlinked = data.units.find((u) => model.links.get(u.id)!.featureId === null)!;
    assert.ok(unlinked, "the real data has rows with no link");
    assert.deepEqual(mapContext(model, { kind: "unit", id: unlinked.id }), STATE_CONTEXT);
    const linked = data.units.find((u) => model.links.get(u.id)!.featureId !== null)!;
    const ctx = mapContext(model, { kind: "unit", id: linked.id });
    assert.equal(ctx.level, "block");
    assert.equal(ctx.districtId, model.featureById.get(ctx.blockId!)!.districtId);
  });

  it("a click on a district opens it (select and fit); a click on a block of the focused district only selects", () => {
    const bankura = district("Bankura");
    const open = actionForFeatureClick(model, STATE_CONTEXT, bankura.id);
    assert.deepEqual(open, { type: "select", selection: { kind: "feature", id: bankura.id }, reveal: true });

    const focused = mapContext(model, open.type === "select" ? open.selection : null);
    const block = blocksOf(bankura.id).find((b) => shapeIds.has(b.id))!;
    const pick = actionForFeatureClick(model, focused, block.id);
    assert.equal(pick.type, "select");
    assert.equal(pick.type === "select" && pick.reveal, false, "choosing a block does not move the view");

    // A block of another district cannot be selected out of context: it opens its own district.
    const other = blocksOf(district("Howrah").id).find((b) => shapeIds.has(b.id))!;
    assert.equal(isBlockInteractive(model, focused, other.id), false);
    assert.deepEqual(actionForFeatureClick(model, focused, other.id), { type: "select", selection: { kind: "feature", id: other.districtId! }, reveal: true });
    // From state level a block is not clickable either: the click opens its district.
    assert.deepEqual(actionForFeatureClick(model, STATE_CONTEXT, block.id), { type: "select", selection: { kind: "feature", id: bankura.id }, reveal: true });
  });

  it("breadcrumbs, back and Escape move up one level at a time", () => {
    const bankura = district("Bankura");
    const block = blocksOf(bankura.id)[0];
    const ctx = mapContext(model, { kind: "feature", id: block.id });
    assert.deepEqual(breadcrumbs(model, ctx).map((c) => [c.label, c.current]), [["West Bengal", false], ["Bankura", false], [block.name, true]]);
    assert.deepEqual(parentSelection(ctx), { kind: "feature", id: bankura.id });
    assert.deepEqual(actionForEscape(ctx, true), { type: "select", selection: { kind: "feature", id: bankura.id }, reveal: true });
    const districtCtx = mapContext(model, { kind: "feature", id: bankura.id });
    assert.deepEqual(actionForEscape(districtCtx, true), { type: "select", selection: null, reveal: true });
    assert.deepEqual(actionForBackgroundClick(districtCtx, true), { type: "none" }, "a stray click inside a district does not lose it");
    assert.deepEqual(actionForBackgroundClick(STATE_CONTEXT, true), { type: "select", selection: null, reveal: false });
  });

  it("only the focused district's blocks are drawn at district level; none at state level unless a layer shades them", () => {
    const blockShapes = layer.shapes.filter((s) => s.featureId.startsWith("GB-")).map((s) => s.featureId);
    assert.equal(visibleBlockIds(model, STATE_CONTEXT, blockShapes, new Set(), false).size, 0);
    assert.equal(visibleBlockIds(model, STATE_CONTEXT, blockShapes, new Set(), true).size, blockShapes.length);
    const bankura = district("Bankura");
    const visible = visibleBlockIds(model, mapContext(model, { kind: "feature", id: bankura.id }), blockShapes, new Set(), false);
    assert.ok(visible.size > 0);
    for (const id of visible) assert.equal(model.featureById.get(id)!.districtId, bankura.id);
    assert.equal(visible.size, blocksOf(bankura.id).filter((b) => shapeIds.has(b.id)).length);
    // A highlighted block (a sales territory's, a candidate) stays drawn wherever it is.
    const away = blocksOf(district("Howrah").id).find((b) => shapeIds.has(b.id))!;
    assert.ok(visibleBlockIds(model, STATE_CONTEXT, blockShapes, new Set([away.id]), false).has(away.id));
  });

  it("two blocks with one name are two search results, told apart by district and selected by ID", () => {
    const index = buildSearchIndex(data.features, shapeIds);
    const sankrail = data.features.filter((f) => f.kind === "block" && f.name === "Sankrail");
    assert.equal(sankrail.length, 2, "the real data has one Sankrail under Howrah and one under Jhargram");
    const hits = searchFeatures(index, "sankrail", { districtId: null, onlyDistrict: false });
    assert.deepEqual(hits.map((h) => h.id).sort(), sankrail.map((f) => f.id).sort());
    assert.deepEqual(hits.map((h) => h.districtName).sort(), ["Howrah", "Jhargram"]);
    const inHowrah = searchFeatures(index, "sankrail", { districtId: district("Howrah").id, onlyDistrict: true });
    assert.equal(inHowrah.length, 1);
    assert.equal(model.featureById.get(inHowrah[0].id)!.districtId, district("Howrah").id);
    // A search scoped to a district never returns a district or another district's block.
    const scoped = searchFeatures(index, "a", { districtId: district("Bankura").id, onlyDistrict: true }, 50);
    assert.ok(scoped.length > 0);
    assert.ok(scoped.every((h) => h.kind === "block" && h.districtId === district("Bankura").id));
  });

  it("geographic confidence is kept apart from allocation, and a block without a row is unlisted, not unallocated", () => {
    const bankura = district("Bankura");
    const q = districtQuality(model, bankura.id, (id) => shapeIds.has(id));
    assert.equal(q.blocks, blocksOf(bankura.id).length);
    assert.equal(Object.values(q.counts).reduce((a, b) => a + b, 0), q.blocks);
    assert.equal(q.outlined + q.withoutOutline.length, q.blocks);
    const unlisted = data.features.find((f) => f.kind === "block" && blockQuality(model, f.id) === "unlisted")!;
    assert.equal(model.featureAllocation.get(unlisted.id)!.state, "missing");
  });

  it("names every district from its LGD code at state level, and only such a district", () => {
    const size = { width: 1000, height: 640 };
    const bounds = unionBounds(layer.shapes.filter((s) => s.featureId.startsWith("GD-")).map((s) => s.bbox as Bounds))!;
    const viewport = fitBounds(bounds, size, 56);
    const anchors = anchorsOf();
    const districtIds = districtShapeIds();
    const input = { model, anchors, context: STATE_CONTEXT, viewport, size, districtIds, blockIds: new Set<string>(), selectedBlockId: null, obstacles: controlObstacles(size), zoomRatio: 1 };
    const plan = planLabels(input);
    assert.equal(plan.labels.length + plan.hidden.length, 23);
    assert.equal(plan.hidden.length, 0, `all 23 names fit at a desktop map size (hidden: ${plan.hidden.map((h) => h.name).join(", ")})`);
    for (const label of plan.labels) {
      const feature = model.featureById.get(label.id)!;
      assert.equal(feature.kind, "district");
      assert.equal(label.lines.join(" "), feature.name, "the label is the LGD name");
      assert.equal(feature.boundary?.basis, "lgd-district-code");
    }
    // A district whose outline is not tied by the LGD code is not named, even though it has an anchor.
    const first = districtIds[0];
    const featureById = new Map(model.featureById);
    featureById.set(first, { ...model.featureById.get(first)!, boundary: { source: "osm", relationId: 1, sourceName: "x", basis: "name-and-district-containment" } });
    const plan2 = planLabels({ ...input, model: { featureById } });
    assert.equal(plan2.labels.some((l) => l.id === first) || plan2.hidden.some((h) => h.id === first), false);
  });

  it("inside a district only that district's blocks are named, more of them as the map zooms in, and never on top of each other", () => {
    const bankura = district("Bankura");
    const ctx = mapContext(model, { kind: "feature", id: bankura.id });
    const size = { width: 900, height: 620 };
    const box = layer.shapes.find((s) => s.featureId === bankura.id)!.bbox as Bounds;
    const anchors = anchorsOf();
    const districtIds = districtShapeIds();
    const blockIds = new Set(blocksOf(bankura.id).map((b) => b.id).filter((id) => shapeIds.has(id)));
    const fitted = fitBounds(box, size, 56);
    const named = (zoom: number) => {
      const scale = fitted.scale * zoom;
      const viewport = { scale, tx: size.width / 2 - ((box[0] + box[2]) / 2) * scale, ty: size.height / 2 - ((box[1] + box[3]) / 2) * scale };
      const plan = planLabels({ model, anchors, context: ctx, viewport, size, districtIds, blockIds, selectedBlockId: null, obstacles: [], zoomRatio: zoom });
      const blockLabels = plan.labels.filter((l) => l.kind === "block");
      for (const l of blockLabels) assert.ok(blockIds.has(l.id), "a block label belongs to the focused district");
      assert.ok(!plan.labels.some((l) => l.id === bankura.id), "the focused district's name is in the heading, not on the map");
      for (const [i, a] of plan.labels.entries()) {
        for (const b of plan.labels.slice(i + 1)) {
          const overlap = a.box.x < b.box.x + b.box.width && b.box.x < a.box.x + a.box.width && a.box.y < b.box.y + b.box.height && b.box.y < a.box.y + a.box.height;
          assert.ok(!overlap, `${a.id} overlaps ${b.id}`);
        }
      }
      // Zooming in crops the district, so compare the share of the blocks still on screen that get a name.
      const onScreen = [...blockIds].filter((id) => {
        const a = anchors.get(id)!;
        const x = a[0] * scale + viewport.tx;
        const y = a[1] * scale + viewport.ty;
        return x >= 0 && x <= size.width && y >= 0 && y <= size.height;
      }).length;
      return { named: blockLabels.length, share: blockLabels.length / Math.max(onScreen, 1) };
    };
    const atFit = named(1);
    const zoomed = named(3);
    assert.ok(atFit.named > 0, "some block names show at the fitted view");
    assert.ok(zoomed.share >= atFit.share, `zooming in names a larger share of the blocks in view (${atFit.share.toFixed(2)} -> ${zoomed.share.toFixed(2)})`);
  });
});
