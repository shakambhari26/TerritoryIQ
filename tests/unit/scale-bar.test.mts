import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LAYER_SCALE } from "../../src/features/geo/layer.ts";
import { formatDistance, scaleBar } from "../../src/features/geo/scale-bar.ts";

const size = { width: 1000, height: 800 };
/** Layer y of a latitude: y = -(Mercator ordinate in degrees) * LAYER_SCALE. */
const layerY = (lat: number) => -(180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * LAYER_SCALE;
/** A view centred on a latitude at `scale` screen pixels per layer unit. */
const viewAt = (lat: number, scale: number) => ({ scale, tx: 0, ty: size.height / 2 - layerY(lat) * scale });

describe("scale bar", () => {
  it("measures real ground distance: one degree of longitude at 24.5 N is about 101 km", () => {
    // 1 degree of longitude is LAYER_SCALE layer units. Pick a zoom where that spans 400 px.
    const scale = 400 / LAYER_SCALE;
    const bar = scaleBar(viewAt(24.5, scale), size, LAYER_SCALE, 110)!;
    const metresPerPixel = bar.metres / bar.pixels;
    // 111.32 km * cos(24.5 deg) = 101.4 km per degree, over 400 px.
    assert.ok(Math.abs(metresPerPixel * 400 - 101_400) < 400, `${metresPerPixel * 400} m per degree`);
  });

  it("picks the longest round length that fits, and never exceeds the width asked for", () => {
    for (const px of [60, 110, 200]) {
      for (const scale of [0.0004, 0.001, 0.004, 0.02]) {
        const bar = scaleBar(viewAt(24.5, scale), size, LAYER_SCALE, px);
        if (!bar) continue;
        assert.ok(bar.pixels <= px + 1e-9, `${bar.label} is ${bar.pixels} px, limit ${px}`);
        assert.match(bar.label, /^\d+ (m|km)$/);
        assert.match(String(bar.metres), /^[125]0*$/, "a round 1, 2 or 5 length");
      }
    }
  });

  it("grows as the map zooms out and shrinks as it zooms in", () => {
    const out = scaleBar(viewAt(24.5, 0.0004), size, LAYER_SCALE)!;
    const near = scaleBar(viewAt(24.5, 0.02), size, LAYER_SCALE)!;
    assert.ok(out.metres > near.metres);
  });

  it("a given pixel width stands for less ground nearer the pole (Mercator)", () => {
    const equator = scaleBar(viewAt(0, 0.002), size, LAYER_SCALE, 100000)!;
    const north = scaleBar(viewAt(60, 0.002), size, LAYER_SCALE, 100000)!;
    assert.ok(north.metres / north.pixels < equator.metres / equator.pixels);
  });

  it("returns null for a view it cannot measure instead of drawing a wrong bar", () => {
    assert.equal(scaleBar({ scale: 0, tx: 0, ty: 0 }, size, LAYER_SCALE), null);
    assert.equal(scaleBar({ scale: NaN, tx: 0, ty: 0 }, size, LAYER_SCALE), null);
    assert.equal(scaleBar(viewAt(24.5, 0.001), { width: 100, height: 0 }, LAYER_SCALE), null);
    assert.equal(scaleBar(viewAt(24.5, 0.001), size, 0), null);
    // So far zoomed in that even the shortest round length (100 m) is wider than the width asked for.
    assert.equal(scaleBar(viewAt(24.5, 100), size, LAYER_SCALE, 40), null);
  });

  it("formats metres and kilometres", () => {
    assert.equal(formatDistance(500), "500 m");
    assert.equal(formatDistance(1000), "1 km");
    assert.equal(formatDistance(20_000), "20 km");
  });
});
