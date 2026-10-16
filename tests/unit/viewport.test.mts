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
} from "../../src/features/geo/viewport.ts";

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
