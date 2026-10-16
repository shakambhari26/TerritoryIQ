import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fitBounds,
  isUsableBounds,
  padBounds,
  panBy,
  toScreen,
  toWorld,
  unionBounds,
  zoomAt,
  zoomLimits,
  type Bounds,
} from "../../src/features/geo/viewport.ts";
import type { Rect } from "../../src/features/geo/labels.ts";
import { GRAZE, controlObstacles, fitClear, fitPadding, furniture } from "../../src/features/territory/map-layout.ts";

const size = { width: 800, height: 600 };

describe("fitBounds", () => {
  it("fits the bounds inside the screen with padding and centres them", () => {
    const viewport = fitBounds([0, 0, 1000, 500], size, 20);
    const topLeft = toScreen(viewport, 0, 0);
    const bottomRight = toScreen(viewport, 1000, 500);
    assert.ok(topLeft.x >= 20 - 1e-6 && bottomRight.x <= size.width - 20 + 1e-6);
    assert.ok(topLeft.y >= 0 && bottomRight.y <= size.height);
    assert.ok(Math.abs((topLeft.x + bottomRight.x) / 2 - size.width / 2) < 1e-6);
    assert.ok(Math.abs((topLeft.y + bottomRight.y) / 2 - size.height / 2) < 1e-6);
  });

  it("copes with a zero-size bounds", () => {
    const viewport = fitBounds([5, 5, 5, 5], size);
    assert.ok(Number.isFinite(viewport.scale) && Number.isFinite(viewport.tx));
  });
});

describe("isUsableBounds", () => {
  it("rejects missing, non-finite, inverted and empty bounds", () => {
    assert.equal(isUsableBounds(null), false);
    assert.equal(isUsableBounds([0, 0, Number.NaN, 1]), false);
    assert.equal(isUsableBounds([2, 0, 1, 1]), false);
    assert.equal(isUsableBounds([1, 1, 1, 1]), false);
    assert.equal(isUsableBounds([0, 0, 1, 0]), true);
  });
});

describe("zoomAt", () => {
  it("keeps the world point under the pointer fixed", () => {
    const start = fitBounds([0, 0, 1000, 500], size);
    const limits = zoomLimits(start.scale);
    const anchor = { x: 300, y: 200 };
    const before = toWorld(start, anchor.x, anchor.y);
    const zoomed = zoomAt(start, anchor, 2, limits);
    const after = toWorld(zoomed, anchor.x, anchor.y);
    assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.y - after.y) < 1e-6);
    assert.ok(zoomed.scale > start.scale);
  });

  it("clamps to the zoom limits", () => {
    const start = fitBounds([0, 0, 1000, 500], size);
    const limits = zoomLimits(start.scale);
    assert.equal(zoomAt(start, { x: 0, y: 0 }, 1e9, limits).scale, limits.max);
    assert.equal(zoomAt(start, { x: 0, y: 0 }, 1e-9, limits).scale, limits.min);
  });
});

describe("zoomAt edge cases", () => {
  const start = fitBounds([0, 0, 1000, 500], size);
  const limits = zoomLimits(start.scale);

  it("ignores a zero, negative or non-finite factor instead of corrupting the view", () => {
    for (const factor of [0, -2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = zoomAt(start, { x: 100, y: 100 }, factor, limits);
      assert.deepEqual(result, start, `factor ${factor}`);
    }
  });

  it("leaves the viewport unchanged when already at a limit and pushed further", () => {
    const atMax = zoomAt(start, { x: 0, y: 0 }, 1e9, limits);
    assert.deepEqual(zoomAt(atMax, { x: 50, y: 50 }, 2, limits), atMax);
    const atMin = zoomAt(start, { x: 0, y: 0 }, 1e-9, limits);
    assert.deepEqual(zoomAt(atMin, { x: 50, y: 50 }, 0.5, limits), atMin);
  });

  it("zooming in then out by the same factor returns to the start", () => {
    const anchor = { x: 321, y: 123 };
    const back = zoomAt(zoomAt(start, anchor, 2, limits), anchor, 0.5, limits);
    assert.ok(Math.abs(back.scale - start.scale) < 1e-9);
    assert.ok(Math.abs(back.tx - start.tx) < 1e-6 && Math.abs(back.ty - start.ty) < 1e-6);
  });

  it("limits are fixed multiples of the fit scale", () => {
    assert.equal(limits.min, start.scale * 0.5);
    assert.equal(limits.max, start.scale * 200);
  });
});

describe("fitBounds with an unusable container", () => {
  it("never returns a non-positive or non-finite scale for a zero or tiny container", () => {
    for (const container of [{ width: 0, height: 0 }, { width: 10, height: 10 }, { width: 1, height: 800 }]) {
      const viewport = fitBounds([0, 0, 1000, 500], container);
      assert.ok(Number.isFinite(viewport.scale) && viewport.scale > 0, JSON.stringify(container));
      assert.ok(Number.isFinite(viewport.tx) && Number.isFinite(viewport.ty), JSON.stringify(container));
    }
  });
});

describe("panBy, unionBounds, padBounds", () => {
  it("pans by a screen offset", () => {
    const moved = panBy({ scale: 2, tx: 10, ty: 20 }, 5, -5);
    assert.deepEqual(moved, { scale: 2, tx: 15, ty: 15 });
  });

  it("unions boxes and returns null for none", () => {
    assert.deepEqual(unionBounds([[0, 0, 1, 1], [5, -2, 6, 3]]), [0, -2, 6, 3]);
    assert.equal(unionBounds([]), null);
  });

  it("pads a tiny box to a minimum span without changing a large one", () => {
    assert.deepEqual(padBounds([10, 10, 11, 11], 100), [-39.5, -39.5, 60.5, 60.5]);
    assert.deepEqual(padBounds([0, 0, 500, 500], 100), [0, 0, 500, 500]);
  });
});

describe("fitClear (the map's fit, clear of its own controls)", () => {
  // A state-shaped extent: taller than wide, the aspect of West Bengal on the layer (about 0.65).
  const state: [number, number, number, number] = [0, 0, 650, 1000];
  const wideOnes: Array<[string, number, number]> = [
    ["desktop with the details panel open", 870, 560],
    ["laptop with the details panel open", 710, 368],
    ["wide desktop", 1300, 640],
    ["tablet", 770, 826],
  ];
  const sizes: Array<[string, number, number]> = [...wideOnes, ["phone", 356, 590]];
  // The extent's bounding box may graze a control's corner (it is bigger than the shape there) but not reach into it.
  const hit = (a: Rect, b: Rect) =>
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > GRAZE && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > GRAZE;
  const boxOf = (view: { scale: number; tx: number; ty: number }, b: Bounds): Rect => ({
    x: b[0] * view.scale + view.tx,
    y: b[1] * view.scale + view.ty,
    width: (b[2] - b[0]) * view.scale,
    height: (b[3] - b[1]) * view.scale,
  });

  for (const [name, width, height] of sizes) {
    it(`at the ${name} size (${width} x ${height}) keeps the whole extent on the map and clear of every control and notice`, () => {
      const view = fitClear(state, { width, height });
      const box = boxOf(view, state);
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, "inside the map");
      for (const f of furniture({ width, height }, 0).filter((f) => f.clearOfFit)) assert.ok(!hit(box, f.rect), `clear of the ${f.id}`);
      // One scale for both axes: the shape is never stretched.
      assert.ok(Math.abs(box.width / box.height - 650 / 1000) < 1e-9);
    });
  }

  it("fills the height of a wide map: the state is as tall as the map allows, with little to spare", () => {
    for (const [name, width, height] of wideOnes.slice(0, 3)) {
      const box = boxOf(fitClear(state, { width, height }), state);
      assert.ok(box.height >= height - 2 * fitPadding(width) - 1, `${name}: ${box.height.toFixed(0)} of ${height}`);
    }
  });

  it("gives up part of the width on a phone for the zoom column, and nothing on a wide map", () => {
    const phone = boxOf(fitClear(state, { width: 356, height: 590 }), state);
    const zoom = furniture({ width: 356, height: 590 }, 0).find((f) => f.id === "zoom")!;
    assert.ok(phone.x + phone.width <= zoom.rect.x, "ends before the zoom column");
    const desktop = fitClear(state, { width: 870, height: 560 });
    assert.ok(Math.abs(boxOf(desktop, state).x + boxOf(desktop, state).width / 2 - 435) < 1e-6, "centred on a wide map");
  });

  it("clears a wide extent too, as a district fills the map, and respects the zoom limits", () => {
    const district: [number, number, number, number] = [0, 0, 1000, 700];
    const view = fitClear(district, { width: 870, height: 560 });
    const box = boxOf(view, district);
    for (const f of furniture({ width: 870, height: 560 }, 0).filter((f) => f.clearOfFit)) assert.ok(!hit(box, f.rect), `clear of the ${f.id}`);
    const clamped = fitClear(district, { width: 870, height: 560 }, { min: 0.1, max: 0.2 });
    assert.equal(clamped.scale, 0.2);
  });

  it("takes the scale bar off the fit but not off the label placer", () => {
    const flags = Object.fromEntries(furniture({ width: 870, height: 560 }).map((f) => [f.id, f.clearOfFit]));
    assert.deepEqual(flags, { zoom: true, pan: true, chip: true, scale: false });
    assert.ok(controlObstacles({ width: 870, height: 560 }).length === 4, "all four are obstacles for labels and markers");
    assert.ok(furniture({ width: 356, height: 590 }).some((f) => f.id === "details"), "a phone also keeps the details button clear");
  });
});
