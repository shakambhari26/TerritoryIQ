import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assemblePolygons,
  interiorPoint,
  mercator,
  pointInPolygon,
  poleOfInaccessibility,
  ringArea,
  simplifyRing,
  stitchRings,
  type Point,
  type Ring,
} from "../../src/features/geo/geometry.ts";
import { decodePath, encodeShape, LAYER_SCALE } from "../../src/features/geo/layer.ts";
import { districtOfBlock, linkBlocks, relationToGeometry } from "../../src/features/geo/osm.ts";

const square = (x: number, y: number, size: number): Ring => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];

describe("stitchRings", () => {
  it("joins pieces end to end, in either direction, into one closed ring", () => {
    const pieces: Point[][] = [
      [[0, 0], [1, 0], [2, 0]],
      [[2, 2], [2, 1], [2, 0]], // reversed
      [[2, 2], [1, 2], [0, 2]],
      [[0, 2], [0, 1], [0, 0]],
    ];
    const { closed, open } = stitchRings(pieces);
    assert.equal(open.length, 0);
    assert.equal(closed.length, 1);
    assert.equal(Math.abs(ringArea(closed[0])), 4);
  });

  it("reports an unclosable chain instead of forcing it shut", () => {
    const { closed, open } = stitchRings([[[0, 0], [1, 0], [1, 1]]]);
    assert.equal(closed.length, 0);
    assert.equal(open.length, 1);
  });
});

describe("assemblePolygons", () => {
  it("places an inner ring as a hole of the outer ring that contains it", () => {
    const result = assemblePolygons([
      { role: "outer", points: square(0, 0, 10) },
      { role: "inner", points: square(4, 4, 2) },
      { role: "outer", points: square(20, 0, 3) },
    ]);
    assert.equal(result.polygons.length, 2);
    assert.equal(result.openPieces, 0);
    assert.equal(result.orphanHoles, 0);
    const big = result.polygons.find((p) => Math.abs(ringArea(p.outer)) === 100)!;
    assert.equal(big.holes.length, 1);
    assert.equal(pointInPolygon([5, 5], big), false);
    assert.equal(pointInPolygon([1, 1], big), true);
  });

  it("counts open pieces so incomplete geometry is not drawn silently", () => {
    const result = assemblePolygons([{ role: "outer", points: [[0, 0], [1, 1]] }]);
    assert.equal(result.polygons.length, 0);
    assert.equal(result.openPieces, 1);
  });
});

describe("simplifyRing", () => {
  it("drops collinear detail but keeps the shape", () => {
    const ring: Ring = [[0, 0], [5, 0.0001], [10, 0], [10, 10], [0, 10], [0, 0]];
    const out = simplifyRing(ring, 0.01)!;
    assert.ok(out.length < ring.length);
    assert.equal(Math.abs(ringArea(out)).toFixed(2), "100.00");
    assert.deepEqual(out[0], out[out.length - 1]);
  });

  it("returns null when a ring collapses", () => {
    assert.equal(simplifyRing([[0, 0], [1, 0], [2, 0], [0, 0]], 0.1), null);
  });
});

describe("interiorPoint", () => {
  it("returns a point inside a concave polygon whose bounding-box centre is outside it", () => {
    // A "C" shape: the centre of its bounding box lies in the notch.
    const outer: Ring = [[0, 0], [10, 0], [10, 3], [3, 3], [3, 7], [10, 7], [10, 10], [0, 10], [0, 0]];
    const polygon = { outer, holes: [] };
    assert.equal(pointInPolygon([5, 5], polygon), false);
    const point = interiorPoint(polygon)!;
    assert.ok(pointInPolygon(point, polygon));
  });

  it("avoids a hole", () => {
    const polygon = { outer: square(0, 0, 10), holes: [square(3, 3, 4)] };
    assert.ok(pointInPolygon(interiorPoint(polygon)!, polygon));
  });
});

describe("encodeShape", () => {
  it("produces integer path data, a bounding box in layer units and y pointing down", () => {
    const shape = encodeShape([{ outer: square(88, 22, 1), holes: [] }], 0.0001)!;
    assert.match(shape.d, /^M-?\d+ -?\d+l(-?\d+ -?\d+ ?)+z$/);
    const [minX, minY, maxX, maxY] = shape.bbox;
    assert.equal(minX, 88 * LAYER_SCALE);
    assert.equal(maxX, 89 * LAYER_SCALE);
    assert.ok(minY < maxY);
    // Higher latitude is drawn higher (smaller y).
    assert.equal(minY, Math.round(-mercator([88, 23])[1] * LAYER_SCALE));
  });

  it("returns null for nothing drawable", () => {
    assert.equal(encodeShape([], 0.001), null);
  });
});

describe("poleOfInaccessibility", () => {
  it("finds the middle of a square, with the radius of the largest circle that fits", () => {
    const pole = poleOfInaccessibility({ outer: square(0, 0, 10), holes: [] }, 0.01)!;
    assert.ok(Math.abs(pole.x - 5) < 0.05 && Math.abs(pole.y - 5) < 0.05, JSON.stringify(pole));
    assert.ok(Math.abs(pole.r - 5) < 0.05);
  });

  it("lies inside a C shape whose bounding-box centre is in the notch, and is not on the notch", () => {
    const polygon = { outer: [[0, 0], [10, 0], [10, 3], [3, 3], [3, 7], [10, 7], [10, 10], [0, 10], [0, 0]] as Ring, holes: [] };
    assert.equal(pointInPolygon([5, 5], polygon), false);
    const pole = poleOfInaccessibility(polygon, 0.01)!;
    assert.ok(pointInPolygon([pole.x, pole.y], polygon));
    assert.ok(pole.r > 1.4, "the widest part of the C is its 3-wide arm and its 3-wide spine");
  });

  it("keeps clear of a hole", () => {
    const polygon = { outer: square(0, 0, 10), holes: [square(3, 3, 4)] };
    const pole = poleOfInaccessibility(polygon, 0.01)!;
    assert.ok(pointInPolygon([pole.x, pole.y], polygon));
    assert.ok(pole.r > 1 && pole.r <= 3, "the radius is measured to the hole as well as to the outline");
  });

  it("returns null for a degenerate polygon", () => {
    assert.equal(poleOfInaccessibility({ outer: [[0, 0], [5, 0], [10, 0], [0, 0]], holes: [] }), null);
  });

  it("is stable for a long thin shape", () => {
    const pole = poleOfInaccessibility({ outer: [[0, 0], [1000, 0], [1000, 4], [0, 4], [0, 0]], holes: [] }, 0.01)!;
    assert.ok(pole.y > 1.9 && pole.y < 2.1 && Math.abs(pole.r - 2) < 0.05);
  });
});

describe("encodeShape label anchors", () => {
  it("anchors a shape inside its largest part, not on a small island", () => {
    const big = { outer: square(88, 22, 1), holes: [] };
    const island = { outer: square(90, 22, 0.05), holes: [] };
    const shape = encodeShape([island, big], 0.0001)!;
    const [x, y, r] = shape.anchor;
    assert.ok(x > 88 * LAYER_SCALE && x < 89 * LAYER_SCALE, "x falls in the big part");
    assert.ok(r > 0.4 * LAYER_SCALE, "the radius is that of the big part");
    const rings = decodePath(shape.d);
    assert.equal(rings.length, 2);
    assert.ok(rings.some((ring) => pointInPolygon([x, y], { outer: ring, holes: [] })));
  });

  it("round-trips its path through decodePath", () => {
    const shape = encodeShape([{ outer: square(88, 22, 1), holes: [square(88.4, 22.4, 0.2)] }], 0.0001)!;
    const rings = decodePath(shape.d);
    assert.equal(rings.length, 2);
    const xs = rings.flat().map((point) => point[0]);
    assert.equal(Math.min(...xs), shape.bbox[0]);
    assert.equal(Math.max(...xs), shape.bbox[2]);
    // The anchor avoids the hole.
    const [x, y] = shape.anchor;
    assert.ok(pointInPolygon([x, y], { outer: rings[0], holes: [rings[1]] }));
  });
});

describe("OSM relations", () => {
  const way = (role: string, ring: Ring) => ({
    type: "way",
    ref: 1,
    role,
    geometry: ring.map(([lon, lat]) => ({ lat, lon })),
  });

  it("builds polygons from relation way members and ignores nodes", () => {
    const geometry = relationToGeometry({
      id: 1,
      members: [way("outer", square(0, 0, 2)), { type: "node", ref: 9, role: "admin_centre" }],
    });
    assert.equal(geometry.polygons.length, 1);
  });

  it("finds the district that contains a border block even when its outline lies on the border", () => {
    const district = { code: 1, polygons: [{ outer: square(0, 0, 10), holes: [] }] };
    const other = { code: 2, polygons: [{ outer: square(10, 0, 10), holes: [] }] };
    // Block shares the whole of its west and south edges with district 1's border.
    const block = [{ outer: square(0, 0, 4), holes: [] }];
    assert.equal(districtOfBlock(block, [other, district]), 1);
    assert.equal(districtOfBlock([{ outer: square(50, 50, 1), holes: [] }], [district, other]), null);
  });
});

describe("linkBlocks", () => {
  it("links by exact name inside the same district and tells same-named blocks apart", () => {
    const outcomes = linkBlocks(
      [
        { featureId: "GB-1", name: "Sankrail", districtCode: 313 },
        { featureId: "GB-2", name: "Sankrail", districtCode: 703 },
        { featureId: "GB-3", name: "Khatra-I", districtCode: 305 },
      ],
      [
        { relationId: 10, name: "Sankrail", districtCode: 313 },
        { relationId: 11, name: "Sankrail", districtCode: 703 },
        { relationId: 12, name: "Khatra I", districtCode: 305 },
      ],
    );
    assert.deepEqual(
      outcomes.map((o) => [o.featureId, o.status, o.status === "linked" ? o.relationId : null]),
      [["GB-1", "linked", 10], ["GB-2", "linked", 11], ["GB-3", "linked", 12]],
    );
  });

  it("does not link a name found only in another district", () => {
    const [outcome] = linkBlocks(
      [{ featureId: "GB-1", name: "Mohanpur", districtCode: 1 }],
      [{ relationId: 1, name: "Mohanpur", districtCode: 2 }],
    );
    assert.equal(outcome.status, "no-name-match");
  });

  it("marks a relation wanted by two blocks as ambiguous for both", () => {
    const outcomes = linkBlocks(
      [
        { featureId: "GB-1", name: "Raniganj", districtCode: 1 },
        { featureId: "GB-2", name: "Raniganj", districtCode: 1 },
      ],
      [{ relationId: 1, name: "Raniganj", districtCode: 1 }],
    );
    assert.deepEqual(outcomes.map((o) => o.status), ["ambiguous", "ambiguous"]);
  });

  it("offers a spelling variant as a suggestion without linking it", () => {
    const [outcome] = linkBlocks(
      [{ featureId: "GB-1", name: "Mahishadal", districtCode: 1 }],
      [{ relationId: 5, name: "Mahisadal", districtCode: 1 }],
    );
    assert.equal(outcome.status, "no-name-match");
    if (outcome.status === "no-name-match") {
      assert.equal(outcome.variants[0].relationId, 5);
    }
  });
});
