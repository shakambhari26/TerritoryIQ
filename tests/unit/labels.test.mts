import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { ANCHOR_CLEAR, LEADER_CLEAR, LEADER_MIN, estimateWidth, leaderEnd, outlineRects, parseOutline, placeLabels, wrapLabel, type LabelRequest, type PlacedLabel, type Point2, type Rect } from "../../src/features/geo/labels.ts";
import { toScreen, unionBounds, type Bounds } from "../../src/features/geo/viewport.ts";
import { LEADER_MAX, controlObstacles, districtFontSize, fitClear } from "../../src/features/territory/map-layout.ts";
import type { BoundaryLayer, TerritoryDataset } from "../../src/features/territory/types.ts";
import { ROOT } from "../../scripts/lib/sources.ts";

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const area = { width: 400, height: 300 };
const request = (id: string, x: number, y: number, text = id, r = 20, priority = r): LabelRequest => ({ id, text, x, y, r, priority });

/** No leader line passes within `ANCHOR_CLEAR` of any other area's anchor dot. */
function assertNoLineThroughDot(placed: readonly PlacedLabel[], requests: readonly LabelRequest[]) {
  for (const p of placed.filter((q) => q.leader)) {
    for (const other of requests.filter((r) => r.id !== p.id)) assert.ok(distanceToSegment(other, p.anchor, leaderEnd(p)) >= ANCHOR_CLEAR - 1e-6, `${p.id}'s line passes through ${other.id}'s dot`);
  }
}

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

  it("fans a crowd of labels around a point without any overlap, and reports the name it has no clean place for", () => {
    const crowd = Array.from({ length: 8 }, (_, i) => request(`D${i}`, 200 + i * 12, 150 + (i % 2) * 14, `District ${i}`, 10 + i));
    const { placed, omitted } = placeLabels(crowd, { area, fontSize: 11, mode: "free" });
    assert.equal(placed.length + omitted.length, 8, "each name is placed or reported as omitted");
    // Seven of eight. The eighth name used to be placed too, but only by running a line straight through other districts'
    // dots (four of the eight lines did); with that ruled out it has no place, and is reported rather than drawn badly.
    assert.ok(placed.length >= 7, `${placed.length} placed`);
    assertTidy(placed, area);
    assertNoLineThroughDot(placed, crowd);
  });

  it("with anchors a few pixels apart, most names are still placed, tidily and without a line through another's dot", () => {
    for (const gap of [3, 4, 6, 8]) {
      const stack = Array.from({ length: 8 }, (_, i) => request(`D${i}`, 200 + i * gap, 150 + i * gap, `District ${i}`, 10 + i));
      const { placed, omitted } = placeLabels(stack, { area, fontSize: 11, mode: "free" });
      assert.equal(placed.length + omitted.length, 8, `${gap} px apart: each name is placed or reported as omitted`);
      assert.ok(placed.length >= 3, `${gap} px apart: ${placed.length} placed`);
      assert.ok(placed.some((p) => p.leader), `${gap} px apart: the check below has lines to look at`);
      assertTidy(placed, area);
      assertNoLineThroughDot(placed, stack);
    }
  });

  it("with anchors closer together than a dot is wide, no line can avoid the other dots, so the names are reported and never drawn wrongly", () => {
    // Anchors 1.4 px apart are one blob on the map: every leader line would start inside the neighbours' dots. The names are
    // reported (the map draws a dot and names the district on hover) instead of being given a line to the wrong dot.
    const stack = Array.from({ length: 8 }, (_, i) => request(`D${i}`, 200 + i, 150 + i, `District ${i}`, 10 + i));
    const { placed, omitted } = placeLabels(stack, { area, fontSize: 11, mode: "free" });
    assert.equal(placed.length + omitted.length, 8, "each name is placed or reported as omitted");
    assertTidy(placed, area);
    assertNoLineThroughDot(placed, stack);
    assert.deepEqual([...omitted].sort(), stack.map((r) => r.id).sort(), "all are reported: none is placed on a line through a neighbour's dot");
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

const near = (box: Rect, p: Point2) => Math.hypot(p.x - Math.min(Math.max(p.x, box.x), box.x + box.width), p.y - Math.min(Math.max(p.y, box.y), box.y + box.height));

/** Whether the segment a-b passes through the rectangle: sampled finely, which is plenty for pixel-sized boxes. */
function segmentTouches(a: Point2, b: Point2, rect: Rect) {
  for (let i = 0; i <= 200; i++) {
    const x = a.x + ((b.x - a.x) * i) / 200;
    const y = a.y + ((b.y - a.y) * i) / 200;
    if (x > rect.x && x < rect.x + rect.width && y > rect.y && y < rect.y + rect.height) return true;
  }
  return false;
}

function distanceToSegment(p: Point2, a: Point2, b: Point2) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function segmentsCross(a: Point2, b: Point2, c: Point2, d: Point2) {
  const side = (p: Point2, q: Point2, r: Point2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

describe("leader lines", () => {
  const crowd = Array.from({ length: 14 }, (_, i) => request(`D${i}`, 150 + ((i * 29) % 110), 100 + ((i * 41) % 110), `District ${i}`, 8 + i));
  const obstacles: Rect[] = [{ x: 170, y: 120, width: 50, height: 40 }];
  const options = { area: { width: 400, height: 300 }, fontSize: 11, mode: "free" as const, obstacles };

  it("draws a leader only for a name that moved away from its anchor, or sits where another anchor makes it unclear", () => {
    const { placed } = placeLabels(crowd, options);
    assert.ok(placed.length > 0);
    for (const p of placed) {
      const away = near(p.box, p.anchor);
      if (p.leader) assert.ok(away > 0, `${p.id} has a leader but sits on its anchor`);
      else {
        // Without a line the name is on its anchor or right beside it, and nothing else is near enough to confuse.
        assert.ok(away <= LEADER_MIN, `${p.id} is ${away.toFixed(1)} px from its anchor with no leader`);
        if (away > 0) for (const q of placed) if (q.id !== p.id) assert.ok(Math.hypot(q.anchor.x - p.anchor.x, q.anchor.y - p.anchor.y) >= 2 * LEADER_MIN, `${p.id} is unclear next to ${q.id}`);
      }
    }
  });

  it("never lets a leader cross another leader, run through another name or a control, or lie under a name", () => {
    const { placed } = placeLabels(crowd, options);
    const lines = placed.filter((p) => p.leader).map((p) => ({ id: p.id, a: p.anchor, b: leaderEnd(p) }));
    assert.ok(lines.length > 0, "the crowd needs at least one leader for this test to mean anything");
    for (const [i, l] of lines.entries()) {
      for (const m of lines.slice(i + 1)) assert.ok(!segmentsCross(l.a, l.b, m.a, m.b), `${l.id} crosses ${m.id}`);
      for (const p of placed.filter((q) => q.id !== l.id)) assert.ok(!segmentTouches(l.a, l.b, p.box), `${l.id} runs through ${p.id}`);
      for (const o of obstacles) if (!(l.a.x >= o.x && l.a.x <= o.x + o.width && l.a.y >= o.y && l.a.y <= o.y + o.height)) assert.ok(!segmentTouches(l.a, l.b, o), `${l.id} runs through a control`);
    }
  });

  it("omits a name that would need a leader longer than the limit, and draws it when the limit allows", () => {
    const wall: Rect[] = [{ x: 100, y: 50, width: 200, height: 200 }];
    const lone = [request("Boxed", 200, 150, "Boxed in", 30)];
    const loose = placeLabels(lone, { area, fontSize: 11, mode: "free", obstacles: wall });
    assert.equal(loose.placed.length, 1, "free to go as far as it needs");
    assert.ok(near(loose.placed[0].box, loose.placed[0].anchor) > 40);
    const capped = placeLabels(lone, { area, fontSize: 11, mode: "free", obstacles: wall, maxLeader: 40 });
    assert.deepEqual([capped.placed.length, capped.omitted], [0, ["Boxed"]]);
  });

  it("keeps a name off an area to avoid, while its leader may cross it", () => {
    const outline: Rect[] = [{ x: 150, y: 120, width: 100, height: 60 }];
    const { placed, omitted } = placeLabels([request("Under", 200, 150, "Under the line", 30)], { area, fontSize: 11, mode: "free", avoid: outline });
    assert.deepEqual(omitted, []);
    assert.ok(!overlap(placed[0].box, outline[0]), "the name is not on the avoided area");
    assert.equal(placed[0].leader, true, "it moved clear of it, with a line back to its anchor");
    assert.ok(segmentTouches(placed[0].anchor, leaderEnd(placed[0]), outline[0]), "and the line is allowed to cross it");
  });
});

describe("districtFontSize", () => {
  it("shrinks with the map, and by a point when the whole state is drawn small, but never below 9", () => {
    assert.ok(districtFontSize(1300) > districtFontSize(700) && districtFontSize(700) > districtFontSize(356));
    assert.equal(districtFontSize(700, 279), districtFontSize(700) - 1);
    assert.equal(districtFontSize(700, 600), districtFontSize(700), "a state drawn large keeps the full size");
    assert.equal(districtFontSize(356, 200), 9);
  });
});

describe("outline sampling", () => {
  it("reads the layer's own path data into absolute rings", () => {
    assert.deepEqual(parseOutline("M10 10l5 0 0 5-5 0z"), [[[10, 10], [15, 10], [15, 15], [10, 15]]]);
    assert.deepEqual(parseOutline("M0 0l4 0 0 4zM100 100l-3 0 0 -3z"), [[[0, 0], [4, 0], [4, 4]], [[100, 100], [97, 100], [97, 97]]]);
    assert.deepEqual(parseOutline(""), []);
  });

  it("covers every stretch of the outline, only inside the map, and is the same each time", () => {
    const square = parseOutline("M20 20l60 0 0 60-60 0z");
    const view = { scale: 1, tx: 0, ty: 0 };
    const rects = outlineRects([square], view, { width: 200, height: 200 }, 10);
    const inside = (x: number, y: number) => rects.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
    for (let t = 0; t <= 60; t += 3) for (const [x, y] of [[20 + t, 20], [80, 20 + t], [80 - t, 80], [20, 80 - t]]) assert.ok(inside(x, y), `${x},${y} is covered`);
    assert.ok(!inside(50, 50), "the inside of the shape is not an obstacle");
    assert.deepEqual(outlineRects([square], view, { width: 200, height: 200 }, 10), rects);
    assert.deepEqual(outlineRects([square], { scale: 1, tx: 1000, ty: 1000 }, { width: 200, height: 200 }, 10), [], "an outline that is off screen costs nothing");
    assert.equal(outlineRects([square], view, { width: 200, height: 200 }, 10, 5).length, 5, "capped");
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
    // The map a portrait tablet (820 x 1180) really gets. Every name has a place there.
    ["portrait tablet map", 770, 826, 23],
    // A small, wide-ish canvas: Howrah has a place only on a line longer than the map allows (see the test below).
    ["tablet map", 700, 520, 22],
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
      const viewport = fitClear(bounds, { width, height });
      const requests = districts.map((s) => {
        const p = toScreen(viewport, s.anchor![0], s.anchor![1]);
        return { id: s.featureId, text: nameOf.get(s.featureId)!, x: p.x, y: p.y, r: s.anchor![2] * viewport.scale, priority: s.anchor![2] };
      });
      const obstacles = controlObstacles({ width, height });
      const fontSize = districtFontSize(width);
      const { placed, omitted } = placeLabels(requests, { area: { width, height }, fontSize, mode: "free", obstacles, maxLeader: LEADER_MAX });
      assert.equal(placed.length + omitted.length, 23, "every district is placed or reported, none is dropped silently");
      assert.ok(placed.length >= atLeast, `${placed.length} placed, ${omitted.join(", ")} omitted`);
      if (atLeast === 23) assert.deepEqual(omitted, [], "every district name has a place");
      assertTidy(placed, { width, height }, obstacles);
      // Each name is complete: the lines, joined, spell the official name.
      for (const label of placed) assert.equal(label.lines.join(" "), nameOf.get(label.id));
    });
  }

  // The one name the 700 x 520 canvas leaves out is Howrah, and the reason is the length cap, not overlap: with no cap it is
  // placed on a line longer than LEADER_MAX, which reads as belonging to some other district. (The map draws a dot for it and
  // names it on hover; at a portrait tablet's real map size it has a place.)
  it("leaves Howrah out at 700 x 520 only because its line would be longer than the cap", async () => {
    const layer = JSON.parse(await readFile(layerPath, "utf8")) as BoundaryLayer;
    const data = JSON.parse(await readFile(datasetPath, "utf8")) as TerritoryDataset;
    const nameOf = new Map(data.features.map((f) => [f.id, f.name]));
    const [width, height] = [700, 520];
    const districts = layer.shapes.filter((s) => s.featureId.startsWith("GD-"));
    const viewport = fitClear(unionBounds(districts.map((s) => s.bbox as Bounds))!, { width, height });
    const requests = districts.map((s) => {
      const p = toScreen(viewport, s.anchor![0], s.anchor![1]);
      return { id: s.featureId, text: nameOf.get(s.featureId)!, x: p.x, y: p.y, r: s.anchor![2] * viewport.scale, priority: s.anchor![2] };
    });
    const options = { area: { width, height }, fontSize: districtFontSize(width), mode: "free" as const, obstacles: controlObstacles({ width, height }) };
    const capped = placeLabels(requests, { ...options, maxLeader: LEADER_MAX });
    assert.deepEqual(capped.omitted.map((id) => nameOf.get(id)), ["Howrah"]);
    const uncapped = placeLabels(requests, options);
    assert.deepEqual(uncapped.omitted, [], "without the cap every name has a place");
    const howrah = uncapped.placed.find((p) => nameOf.get(p.id) === "Howrah")!;
    const end = leaderEnd(howrah);
    assert.ok(Math.hypot(howrah.anchor.x - end.x, howrah.anchor.y - end.y) > LEADER_MAX, "and Howrah's line is longer than the cap");
  });

  // The lines themselves: none crosses another, none runs through another district's dot or another name, and the few
  // that exist are short, at every size the workspace produces.
  for (const [name, width, height] of sizes) {
    it(`draws no crossing, hugging or long leader line at the ${name} size (${width} x ${height})`, async () => {
      const layer = JSON.parse(await readFile(layerPath, "utf8")) as BoundaryLayer;
      const data = JSON.parse(await readFile(datasetPath, "utf8")) as TerritoryDataset;
      const nameOf = new Map(data.features.map((f) => [f.id, f.name]));
      const districts = layer.shapes.filter((s) => s.featureId.startsWith("GD-"));
      const bounds = unionBounds(districts.map((s) => s.bbox as Bounds))!;
      const viewport = fitClear(bounds, { width, height });
      const requests = districts.map((s) => {
        const p = toScreen(viewport, s.anchor![0], s.anchor![1]);
        return { id: s.featureId, text: nameOf.get(s.featureId)!, x: p.x, y: p.y, r: s.anchor![2] * viewport.scale, priority: s.anchor![2] };
      });
      const obstacles = controlObstacles({ width, height });
      const { placed } = placeLabels(requests, { area: { width, height }, fontSize: districtFontSize(width), mode: "free", obstacles, maxLeader: LEADER_MAX });
      const lines = placed.filter((p) => p.leader).map((p) => ({ id: p.id, a: p.anchor, b: leaderEnd(p) }));
      for (const [i, l] of lines.entries()) {
        assert.ok(Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y) <= LEADER_MAX + 1, `${l.id}'s line is long`);
        for (const m of lines.slice(i + 1)) assert.ok(!segmentsCross(l.a, l.b, m.a, m.b), `${l.id} crosses ${m.id}`);
        for (const r of requests.filter((q) => q.id !== l.id)) assert.ok(distanceToSegment(r, l.a, l.b) >= ANCHOR_CLEAR - 1e-6, `${l.id}'s line passes through the dot of ${r.id}`);
        for (const p of placed.filter((q) => q.id !== l.id)) assert.ok(!segmentTouches(l.a, l.b, p.box), `${l.id} runs through ${p.id}`);
      }
      // At the sizes with room, the lines are also kept their full clear distance apart.
      if (width >= 800) {
        for (const [i, l] of lines.entries()) for (const m of lines.slice(i + 1)) assert.ok(Math.min(distanceToSegment(l.a, m.a, m.b), distanceToSegment(l.b, m.a, m.b), distanceToSegment(m.a, l.a, l.b), distanceToSegment(m.b, l.a, l.b)) >= LEADER_CLEAR - 1e-6, `${l.id} and ${m.id} are too close`);
      }
    });
  }
});
