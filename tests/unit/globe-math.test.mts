import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CameraController, IDLE_DIST, IDLE_POSE_LAT } from "../../src/features/globe/camera.ts";
import {
  angularDistance,
  boxCentre,
  distanceForBox,
  faceRotation,
  lngDelta,
  lngLatToVector,
  MAX_DIST,
  MIN_DIST,
  vectorToLngLat,
  wrapLng,
} from "../../src/features/globe/geo-math.ts";
import { decodeGeometry, pointInPolygons, toPolygons } from "../../src/features/globe/shapes.ts";
import { buildTargets, searchTargets } from "../../src/features/globe/targets.ts";
import type { GlobeOverlay } from "../../src/features/globe/types.ts";

const near = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b}`);

describe("globe maths", () => {
  it("lays out longitude the way three.js lays out an equirectangular texture", () => {
    // SphereGeometry: u = 0.5 (longitude 0) faces +X, u = 0.25 (longitude -90) faces +Z, north is +Y.
    const [x0, y0, z0] = lngLatToVector(0, 0);
    near(x0, 1);
    near(y0, 0);
    near(z0, 0);
    const [x1, , z1] = lngLatToVector(-90, 0);
    near(x1, 0);
    near(z1, 1);
    near(lngLatToVector(0, 90)[1], 1);
  });

  it("round-trips a position through the vector form", () => {
    for (const [lng, lat] of [[88.4, 24.4], [-73.9, 40.7], [179.5, -33], [0, 0]]) {
      const [x, y, z] = lngLatToVector(lng, lat);
      const back = vectorToLngLat(x, y, z);
      near(back.lng, lng, 1e-9);
      near(back.lat, lat, 1e-9);
    }
  });

  it("faceRotation turns the chosen point to face the camera (+Z) with the Euler order XYZ", () => {
    for (const [lng, lat] of [[88.4, 24.4], [-120, -40], [10, 60]]) {
      const [x, y, z] = lngLatToVector(lng, lat);
      const { x: rx, y: ry } = faceRotation(lng, lat);
      // Euler XYZ: the vector is turned about Z (none), then Y, then X.
      const x1 = x * Math.cos(ry) + z * Math.sin(ry);
      const z1 = -x * Math.sin(ry) + z * Math.cos(ry);
      const y2 = y * Math.cos(rx) - z1 * Math.sin(rx);
      const z2 = y * Math.sin(rx) + z1 * Math.cos(rx);
      near(x1, 0, 1e-9);
      near(y2, 0, 1e-9);
      near(z2, 1, 1e-9);
    }
  });

  it("wraps longitudes and takes the short way round", () => {
    near(wrapLng(190), -170);
    near(wrapLng(-190), 170);
    near(lngDelta(170, -170), 20);
    near(lngDelta(-170, 170), -20);
    near(lngDelta(0, 180), 180);
  });

  it("measures a great-circle angle", () => {
    near(angularDistance(0, 0, 90, 0), 90, 1e-9);
    near(angularDistance(0, 0, 0, 0), 0, 1e-6);
    near(angularDistance(10, 0, -170, 0), 180, 1e-6);
  });

  it("fits a box: a wider or taller box needs a greater distance, never below the minimum", () => {
    const small = distanceForBox([88, 24, 88.2, 24.2], 32, 1.4);
    const state = distanceForBox([85.8, 21.5, 89.9, 27.2], 32, 1.4);
    assert.ok(state > small);
    assert.ok(small >= MIN_DIST);
    assert.ok(distanceForBox([-180, -80, 180, 80], 32, 1.4) <= MAX_DIST);
    const centre = boxCentre([85.8, 21.5, 89.9, 27.2]);
    near(centre.lng, 87.85);
    near(centre.lat, 24.35);
  });
});

describe("camera controller", () => {
  const start = { lng: 20, lat: IDLE_POSE_LAT, dist: IDLE_DIST };
  const run = (camera: CameraController, seconds: number, dt = 1 / 60) => {
    for (let t = 0; t < seconds; t += dt) camera.update(dt);
  };

  it("spins while idle, easing in, and always westward in longitude", () => {
    const camera = new CameraController(start, { reducedMotion: false });
    camera.update(1 / 60);
    const first = start.lng - camera.pose.lng;
    run(camera, 3);
    assert.ok(camera.pose.lng < start.lng);
    assert.ok(first < 0.01, "the first frame barely moves: speed eases in");
    assert.equal(camera.phase, "idle");
  });

  it("suspends the spin during a flight, arrives exactly on target, then holds still", () => {
    const camera = new CameraController(start, { reducedMotion: false });
    const arrivals: string[] = [];
    camera.onArrive = (kind) => arrivals.push(kind);
    run(camera, 2);
    const target = { lng: 87.85, lat: 24.35, dist: 1.5 };
    camera.flyTo(target);
    assert.equal(camera.phase, "flying");
    run(camera, 6);
    assert.equal(camera.phase, "arrived");
    assert.deepEqual(arrivals, ["select"]);
    assert.deepEqual(camera.pose, target);
    const held = { ...camera.pose };
    run(camera, 5);
    assert.deepEqual(camera.pose, held, "no drift after arrival");
    assert.equal(camera.moving, false);
  });

  it("never moves backwards or overshoots on a flight, and never turns more than half a circle", () => {
    const camera = new CameraController({ lng: 150, lat: 10, dist: 4.3 }, { reducedMotion: false });
    camera.flyTo({ lng: -150, lat: 24, dist: 1.5 });
    let previous = 0;
    let travelled = 0;
    let last = camera.pose.lng;
    for (let i = 0; i < 400 && camera.phase === "flying"; i++) {
      camera.update(1 / 60);
      const step = Math.abs(lngDelta(last, camera.pose.lng));
      travelled += step;
      last = camera.pose.lng;
      const progress = angularDistance(150, 10, camera.pose.lng, camera.pose.lat);
      assert.ok(progress >= previous - 1e-6, "monotonic along the way");
      previous = progress;
    }
    assert.ok(travelled <= 60 + 1e-6, "went the short way (60 degrees), not the long way round");
  });

  it("a second selection starts from the current pose, with no jump", () => {
    const camera = new CameraController(start, { reducedMotion: false });
    camera.flyTo({ lng: 87.85, lat: 24.35, dist: 1.5 });
    run(camera, 0.9);
    const before = { ...camera.pose };
    camera.flyTo({ lng: 88.5, lat: 26, dist: 1.2 });
    camera.update(1 / 60);
    assert.ok(Math.abs(lngDelta(before.lng, camera.pose.lng)) < 0.5);
    assert.ok(Math.abs(before.lat - camera.pose.lat) < 0.5);
    assert.ok(Math.abs(before.dist - camera.pose.dist) < 0.05);
  });

  it("returns home, then spins again", () => {
    const camera = new CameraController(start, { reducedMotion: false });
    camera.flyTo({ lng: 87.85, lat: 24.35, dist: 1.5 });
    run(camera, 6);
    camera.flyTo({ lng: camera.pose.lng, lat: IDLE_POSE_LAT, dist: IDLE_DIST }, "home");
    run(camera, 6);
    assert.equal(camera.phase, "idle");
    const settled = camera.pose.lng;
    run(camera, 3);
    assert.ok(camera.pose.lng !== settled);
  });

  it("with reduced motion: no idle spin, and a flight completes at once", () => {
    const camera = new CameraController(start, { reducedMotion: true });
    run(camera, 5);
    assert.deepEqual(camera.pose, start);
    camera.flyTo({ lng: 87.85, lat: 24.35, dist: 1.5 });
    assert.equal(camera.phase, "arrived");
    assert.deepEqual(camera.pose, { lng: 87.85, lat: 24.35, dist: 1.5 });
  });
});

describe("outline polygons", () => {
  const square = (x: number, y: number, size: number): Array<[number, number]> => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];

  it("groups a ring inside another as a hole, regardless of winding", () => {
    const polygons = toPolygons([square(0, 0, 10), square(2, 2, 3).reverse(), square(20, 20, 4)]);
    assert.equal(polygons.length, 2);
    assert.equal(polygons.find((p) => p.outer[0][0] === 0)?.holes.length, 1);
    assert.ok(pointInPolygons(8, 8, polygons));
    assert.ok(!pointInPolygons(3, 3, polygons), "inside the hole");
    assert.ok(pointInPolygons(21, 21, polygons), "second part");
    assert.ok(!pointInPolygons(15, 15, polygons));
  });

  it("an island inside a hole is its own outline again", () => {
    const polygons = toPolygons([square(0, 0, 20), square(2, 2, 16), square(5, 5, 4)]);
    assert.equal(polygons.length, 2);
    assert.ok(pointInPolygons(6, 6, polygons));
    assert.ok(!pointInPolygons(3, 3, polygons));
  });

  it("decodes layer path data to longitude / latitude with the 2D map's own conversion", () => {
    // Layer: x = lng * 1e4, y = -(Mercator ordinate) * 1e4. A 0.1 degree square at the equator, 88 E.
    const x = 88 * 10_000;
    const polygons = decodeGeometry({ d: `M${x} 0l1000 0 0 1000 -1000 0z`, bbox: [0, 0, 0, 0], anchor: null, vertices: 4 });
    assert.equal(polygons.length, 1);
    near(polygons[0].outer[0][0], 88);
    near(polygons[0].outer[1][0], 88.1);
    assert.ok(polygons[0].outer[2][1] < 0, "y grows downwards in the layer, so latitude falls");
  });
});

describe("search targets", () => {
  const overlay = {
    state: { id: "WB", name: "West Bengal", bbox: [85, 21, 90, 27], centre: [87, 24], basis: "" },
    districts: [{ id: "GD-1", name: "Bankura", state: "represented", geometry: {} }, { id: "GD-2", name: "North 24 Parganas", state: "unresolved", geometry: null }],
    blocks: [{ id: "GB-1", name: "Raipur-I", districtId: "GD-1", state: "unresolved", geometry: null }, { id: "GB-2", name: "Bankura-II", districtId: "GD-1", state: "represented", geometry: {} }],
  } as unknown as GlobeOverlay;
  const targets = buildTargets(overlay);

  it("lists the state, districts and blocks with whether an outline will be drawn", () => {
    assert.deepEqual(targets.map((t) => `${t.kind}:${t.id}:${t.drawn}`), ["state:WB:false", "district:GD-1:true", "district:GD-2:false", "block:GB-1:false", "block:GB-2:true"]);
  });

  it("ranks exact and prefix matches first and ignores case and punctuation", () => {
    // A block also matches the name of the district it sits in, ranked after names that match directly.
    assert.deepEqual(searchTargets(targets, "bankura").map((t) => t.id), ["GD-1", "GB-2", "GB-1"]);
    assert.deepEqual(searchTargets(targets, "RAIPUR I").map((t) => t.id), ["GB-1"]);
    assert.deepEqual(searchTargets(targets, "24").map((t) => t.id), ["GD-2"]);
    assert.deepEqual(searchTargets(targets, "  ").map((t) => t.id), []);
  });
});
