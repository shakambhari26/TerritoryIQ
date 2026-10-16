import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LAYER_SCALE } from "../../src/features/geo/layer.ts";
import {
  growLatLngBounds,
  layerBoundsToLatLng,
  layerToLngLat,
  lngLatToLayer,
  pixelsPerLayerUnit,
  zoomForPixelsPerLayerUnit,
} from "../../src/features/geo/projection.ts";

describe("layer <-> longitude/latitude", () => {
  it("puts the origin at lon 0, lat 0 and keeps x as longitude", () => {
    const origin = layerToLngLat(0, 0);
    assert.ok(Math.abs(origin.lng) < 1e-9 && Math.abs(origin.lat) < 1e-9);
    assert.ok(Math.abs(layerToLngLat(88 * LAYER_SCALE, 0).lng - 88) < 1e-9);
  });

  it("points y downwards: a larger y is further south", () => {
    assert.ok(layerToLngLat(0, 100_000).lat < layerToLngLat(0, 0).lat);
  });

  it("round-trips Kolkata to within one layer unit (about 11 m)", () => {
    const [x, y] = lngLatToLayer(88.3639, 22.5726);
    const back = layerToLngLat(x, y);
    assert.ok(Math.abs(back.lng - 88.3639) < 1 / LAYER_SCALE);
    assert.ok(Math.abs(back.lat - 22.5726) < 2 / LAYER_SCALE);
  });

  it("holds latitude to +-85 degrees, as the layer does", () => {
    assert.ok(Math.abs(layerToLngLat(...lngLatToLayer(0, 89)).lat - 85) < 1e-3);
  });
});

describe("layer scale on a Web Mercator basemap", () => {
  it("is 256 * 2^zoom pixels per 360 degrees", () => {
    assert.ok(Math.abs(pixelsPerLayerUnit(0) * 360 * LAYER_SCALE - 256) < 1e-9);
    assert.ok(Math.abs(pixelsPerLayerUnit(7) / pixelsPerLayerUnit(6) - 2) < 1e-12);
  });

  it("inverts exactly", () => {
    for (const zoom of [3, 6.5, 12, 16]) assert.ok(Math.abs(zoomForPixelsPerLayerUnit(pixelsPerLayerUnit(zoom)) - zoom) < 1e-9);
  });

  it("agrees with the standard tile maths for a real point", () => {
    // Google world pixel x for a longitude at zoom z: (lng + 180) / 360 * 256 * 2^z; the layer origin is the world centre.
    const zoom = 8;
    const [x] = lngLatToLayer(88.3639, 22.5726);
    const fromLayer = 128 * 2 ** zoom + x * pixelsPerLayerUnit(zoom);
    const standard = ((88.3639 + 180) / 360) * 256 * 2 ** zoom;
    assert.ok(Math.abs(fromLayer - standard) < 0.1, `${fromLayer} vs ${standard}`);
    // y: Google world pixel y = (1 - ln(tan(phi) + sec(phi)) / pi) / 2 * 256 * 2^z.
    const [, y] = lngLatToLayer(88.3639, 22.5726);
    const phi = (22.5726 * Math.PI) / 180;
    const standardY = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * 256 * 2 ** zoom;
    assert.ok(Math.abs(128 * 2 ** zoom + y * pixelsPerLayerUnit(zoom) - standardY) < 0.1);
  });
});

describe("bounds", () => {
  it("converts a layer box to a geographic box with north above south", () => {
    const [minX, minY] = lngLatToLayer(86.5, 27.2);
    const [maxX, maxY] = lngLatToLayer(89.9, 21.5);
    const box = layerBoundsToLatLng([minX, minY, maxX, maxY]);
    assert.ok(Math.abs(box.west - 86.5) < 1e-3 && Math.abs(box.east - 89.9) < 1e-3);
    assert.ok(Math.abs(box.north - 27.2) < 1e-3 && Math.abs(box.south - 21.5) < 1e-3);
  });

  it("grows a box on every side and stays within the Mercator limits", () => {
    const grown = growLatLngBounds({ west: 80, south: 20, east: 90, north: 30 }, 0.1);
    assert.deepEqual(grown, { west: 79, south: 19, east: 91, north: 31 });
    const clamped = growLatLngBounds({ west: -179, south: -84, east: 179, north: 84 }, 0.5);
    assert.deepEqual(clamped, { west: -180, south: -85, east: 180, north: 85 });
  });
});
