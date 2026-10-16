import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { estimateWidth, leaderEnd, placeLabels, wrapLabel, type LabelRequest, type PlacedLabel, type Rect } from "../../src/features/geo/labels.ts";
import { fitBounds, toScreen, unionBounds, type Bounds } from "../../src/features/geo/viewport.ts";
import { controlObstacles, districtFontSize } from "../../src/features/territory/map-layout.ts";
import type { BoundaryLayer, TerritoryDataset } from "../../src/features/territory/types.ts";
import { ROOT } from "../../scripts/lib/sources.ts";

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const area = { width: 400, height: 300 };
const request = (id: string, x: number, y: number, text = id, r = 20, priority = r): LabelRequest => ({ id, text, x, y, r, priority });

function assertTidy(placed: readonly PlacedLabel[], size: { width: number; height: number }, obstacles: readonly Rect[] = []) {
  for (const [i, a] of placed.entries()) {
    assert.ok(a.box.x >= 0 && a.box.y >= 0 && a.box.x + a.box.width <= size.width && a.box.y + a.box.height <= size.height, `${a.id} is inside the map`);
    for (const o of obstacles) assert.ok(!overlap(a.box, o), `${a.id} covers a control`);
    for (const b of placed.slice(i + 1)) assert.ok(!overlap(a.box, b.box), `${a.id} overlaps ${b.id}`);
  }
}

describe("wrapLabel", () => {
  it("keeps a short name or a single word on one line", () => {
    assert.deepEqual(wrapLabel("Howrah", 11), ["Howrah"]);
    assert.deepEqual(wrapLabel("Alipurduar", 11), ["Alipurduar"]);
    assert.deepEqual(wrapLabel("Nadia", 11), ["Nadia"]);
  });

  it("wraps a long name at a space, balancing the lines, and never splits a word", () => {
    assert.deepEqual(wrapLabel("Paschim Medinipur", 11), ["Paschim", "Medinipur"]);
    assert.deepEqual(wrapLabel("North 24 Parganas", 11), ["North 24", "Parganas"]);
    assert.deepEqual(wrapLabel("Dakshin Dinajpur", 11), ["Dakshin", "Dinajpur"]);
  });

  it("does not wrap when only one line is allowed", () => {
    assert.deepEqual(wrapLabel("Paschim Medinipur", 11, 1), ["Paschim Medinipur"]);
  });
});

describe("estimateWidth", () => {
  it("grows with the text and the font size, and treats narrow and wide letters differently", () => {
    assert.ok(estimateWidth("Kolkata", 12) > estimateWidth("Kolkata", 10));
    assert.ok(estimateWidth("Howrah Howrah", 11) > estimateWidth("Howrah", 11));
    assert.ok(estimateWidth("mmmm", 11) > estimateWidth("illi", 11));
  });
});

describe("placeLabels (free)", () => {
  it("centres a lone label on its anchor with no leader", () => {
    const { placed, omitted } = placeLabels([request("A", 200, 150)], { area, fontSize: 11, mode: "free" });
    assert.equal(omitted.length, 0);
    assert.equal(placed.length, 1);
    assert.equal(placed[0].leader, false);
    assert.ok(Math.abs(placed[0].box.x + placed[0].box.width / 2 - 200) < 1e-6);
    assert.ok(Math.abs(placed[0].box.y + placed[0].box.height / 2 - 150) < 1e-6);
  });

  it("never buries another area's anchor: the two names are placed apart and the one that moved gets a leader line", () => {
    const small = request("Small", 200, 150, "Small", 5);
    const large = request("Large", 204, 152, "Large", 60);
    const { placed, omitted } = placeLabels([small, large], { area, fontSize: 11, mode: "free" });
    assert.deepEqual(omitted, []);
    assert.equal(placed.length, 2);
    const [pl, ps] = [placed.find((p) => p.id === "Large")!, placed.find((p) => p.id === "Small")!];
    assert.ok(!overlap(pl.box, ps.box));
    const covers = (box: Rect, x: number, y: number) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
    assert.ok(!covers(pl.box, small.x, small.y), "the large name does not sit on the small area's anchor");
    assert.ok(!covers(ps.box, large.x, large.y), "the small name does not sit on the large area's anchor");
    assert.ok(pl.leader || ps.leader, "a name that is not on its anchor says which anchor it belongs to");
    for (const p of placed.filter((q) => q.leader)) {
      const end = leaderEnd(p);
      assert.ok(end.x >= p.box.x && end.x <= p.box.x + p.box.width, "the leader ends on the label box");
    }
  });

  it("fans a crowd of labels around a point without any overlap", () => {
    const crowd = Array.from({ length: 8 }, (_, i) => request(`D${i}`, 200 + i * 12, 150 + (i % 2) * 14, `District ${i}`, 10 + i));
    const { placed, omitted } = placeLabels(crowd, { area, fontSize: 11, mode: "free" });
    assert.equal(omitted.length, 0);
    assert.equal(placed.length, 8);
    assertTidy(placed, area);
  });

  it("with anchors stacked within a few pixels, every name is placed tidily or reported, never drawn over another", () => {
    const stack = Array.from({ length: 8 }, (_, i) => request(`D${i}`, 200 + i, 150 + i, `District ${i}`, 10 + i));
    const { placed, omitted } = placeLabels(stack, { area, fontSize: 11, mode: "free" });
    assert.equal(placed.length + omitted.length, 8, "each name is placed or reported as omitted");
    assert.ok(placed.length >= 3);
    assertTidy(placed, area);
  });

  it("keeps clear of obstacles and of the map edge", () => {
    const obstacles: Rect[] = [{ x: 180, y: 130, width: 40, height: 40 }];
    const { placed } = placeLabels([request("A", 200, 150), request("Edge", 2, 2)], { area, fontSize: 11, mode: "free", obstacles });
    assertTidy(placed, area, obstacles);
    assert.ok(placed.find((p) => p.id === "Edge"), "an anchor at the very corner still gets a label, slid inside the map");
  });

  it("skips an anchor that is off screen and reports a label that cannot be placed at all", () => {
    const offscreen = placeLabels([request("Gone", 900, 900)], { area, fontSize: 11, mode: "free" });
    assert.deepEqual([offscreen.placed.length, offscreen.omitted.length], [0, 0]);
    const tiny = { width: 30, height: 20 };
    const crowded = placeLabels([request("Long name here", 15, 10, "Long name here")], { area: tiny, fontSize: 11, mode: "free" });
    assert.deepEqual(crowded.omitted, ["Long name here"]);
  });

  it("is deterministic and does not depend on input order", () => {
    const items = [request("B", 100, 100, "B", 30), request("A", 100, 100, "A", 30), request("C", 102, 101, "C", 5)];
    const one = placeLabels(items, { area, fontSize: 11, mode: "free" });
    const two = placeLabels([...items].reverse(), { area, fontSize: 11, mode: "free" });
    assert.deepEqual(one, two);
  });
});

describe("placeLabels (inside)", () => {
  it("labels only the shapes large enough to hold their name, centred, with no leader", () => {
    const { placed } = placeLabels([request("Big", 100, 100, "Amdanga", 40), request("Tiny", 200, 100, "Amdanga", 6)], { area, fontSize: 11, mode: "inside" });
    assert.deepEqual(placed.map((p) => p.id), ["Big"]);
    assert.equal(placed[0].leader, false);
  });

  it("drops a label that would overlap one already placed", () => {
    const { placed } = placeLabels([request("A", 100, 100, "Amdanga", 60), request("B", 110, 104, "Barasat", 59)], { area, fontSize: 11, mode: "inside" });
    assert.deepEqual(placed.map((p) => p.id), ["A"]);
  });
});

/** The statewide overview of the real layer, at the real map sizes: every district gets a legible, unobstructed name. */
const layerPath = path.join(ROOT, "data", "generated", "boundaries.json");
const datasetPath = path.join(ROOT, "data", "generated", "dataset.json");
const built = existsSync(layerPath) && existsSync(datasetPath);

describe("district labels on the real statewide overview", { skip: built ? false : "data not built: run `npm run data:build`" }, () => {
  // Map canvases the workspace produces: details panel open, details panel closed, tablet, phone.
  const sizes: Array<[string, number, number, number]> = [
    ["desktop map", 870, 600, 23],
    ["wide desktop map", 1300, 640, 23],
    ["tablet map", 700, 520, 23],
    // On a phone the names that cannot fit are reported (the map marks them with a dot and names them on hover or tap).
    ["phone map", 356, 460, 15],
  ];
  for (const [name, width, height, atLeast] of sizes) {
    it(`places at least ${atLeast} of 23 names without overlap at the ${name} size (${width} x ${height})`, async () => {
      const layer = JSON.parse(await readFile(layerPath, "utf8")) as BoundaryLayer;
      const data = JSON.parse(await readFile(datasetPath, "utf8")) as TerritoryDataset;
      const nameOf = new Map(data.features.map((f) => [f.id, f.name]));
      const districts = layer.shapes.filter((s) => s.featureId.startsWith("GD-"));
      assert.equal(districts.length, 23);
      const bounds = unionBounds(districts.map((s) => s.bbox as Bounds))!;
      const viewport = fitBounds(bounds, { width, height });
      const requests = districts.map((s) => {
        const p = toScreen(viewport, s.anchor![0], s.anchor![1]);
        return { id: s.featureId, text: nameOf.get(s.featureId)!, x: p.x, y: p.y, r: s.anchor![2] * viewport.scale, priority: s.anchor![2] };
      });
      const obstacles = controlObstacles({ width, height });
      const fontSize = districtFontSize(width);
      const { placed, omitted } = placeLabels(requests, { area: { width, height }, fontSize, mode: "free", obstacles });
      assert.equal(placed.length + omitted.length, 23, "every district is placed or reported, none is dropped silently");
      assert.ok(placed.length >= atLeast, `${placed.length} placed, ${omitted.join(", ")} omitted`);
      if (atLeast === 23) assert.deepEqual(omitted, [], "every district name has a place");
      assertTidy(placed, { width, height }, obstacles);
      // Each name is complete: the lines, joined, spell the official name.
      for (const label of placed) assert.equal(label.lines.join(" "), nameOf.get(label.id));
    });
  }
});
