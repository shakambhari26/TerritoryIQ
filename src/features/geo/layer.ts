/**
 * Encodes polygons (lon/lat) as compact SVG path data in a planar layer
 * coordinate system: spherical Mercator, scaled to integers, y pointing down.
 * Output coordinates are integers so a state-wide layer stays small.
 */

import { boundsOf, mercator, poleOfInaccessibility, ringArea, simplifyRing, type Point, type Polygon, type Ring } from "./geometry.ts";

/** Layer units per degree of Mercator ordinate (1e4 is about 11 m at this latitude). */
export const LAYER_SCALE = 10_000;

export interface EncodedShape {
  d: string;
  bbox: [number, number, number, number];
  vertices: number;
  /**
   * Where a label for this shape belongs: [x, y, r] in layer units, with r the radius of the largest circle
   * around the point that fits inside the drawn shape. Computed on the projected, simplified geometry of the
   * largest part, so it lies inside what is drawn. It positions text only and says nothing about geography.
   */
  anchor: [number, number, number];
}

/** Layer units: the anchor is stored to one decimal, enough for a tiny shape and still compact. */
const ANCHOR_PRECISION = 2;
const tenth = (n: number) => Math.round(n * 10) / 10;

function toLayerRing(ring: Ring): Point[] {
  const out: Point[] = [];
  for (const point of ring) {
    const [x, y] = mercator(point);
    const q: Point = [Math.round(x * LAYER_SCALE), Math.round(-y * LAYER_SCALE)];
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  // Drop the closing duplicate: the path closes with z.
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out;
}

function ringPath(points: Point[]): string {
  let d = `M${points[0][0]} ${points[0][1]}l`;
  const deltas: string[] = [];
  for (let i = 1; i < points.length; i++) {
    deltas.push(`${points[i][0] - points[i - 1][0]} ${points[i][1] - points[i - 1][1]}`);
  }
  d += deltas.join(" ");
  return `${d}z`;
}

/**
 * Simplifies (tolerance in degrees), projects and encodes polygons. Rings that
 * collapse below three distinct points are dropped; returns null if nothing is
 * left to draw.
 */
export function encodeShape(polygons: readonly Polygon[], toleranceDegrees: number): EncodedShape | null {
  const parts: string[] = [];
  const kept: Point[][] = [];
  const drawn: Polygon[] = [];
  let vertices = 0;

  for (const polygon of polygons) {
    const outer = simplifyRing(polygon.outer, toleranceDegrees);
    if (!outer) continue;
    const outerLayer = toLayerRing(outer);
    if (outerLayer.length < 3) continue;
    parts.push(ringPath(outerLayer));
    kept.push(outerLayer);
    vertices += outerLayer.length;
    const holes: Ring[] = [];
    for (const hole of polygon.holes) {
      const simplified = simplifyRing(hole, toleranceDegrees);
      if (!simplified) continue;
      const holeLayer = toLayerRing(simplified);
      if (holeLayer.length < 3) continue;
      parts.push(ringPath(holeLayer));
      holes.push(holeLayer);
      vertices += holeLayer.length;
    }
    drawn.push({ outer: outerLayer, holes });
  }
  if (parts.length === 0) return null;

  // Label anchor: inside the largest drawn part, so a label never lands on an island or in a hole.
  const largest = drawn.reduce((a, b) => (Math.abs(ringArea(b.outer)) > Math.abs(ringArea(a.outer)) ? b : a));
  const pole = poleOfInaccessibility(largest, ANCHOR_PRECISION);
  const bbox = boundsOf(kept);
  const anchor: [number, number, number] = pole
    ? [tenth(pole.x), tenth(pole.y), tenth(pole.r)]
    : [tenth((bbox[0] + bbox[2]) / 2), tenth((bbox[1] + bbox[3]) / 2), 0];
  return { d: parts.join(""), bbox, vertices, anchor };
}

/**
 * Decodes the path data written by `encodeShape` back into rings of layer coordinates, one per `M...z`
 * sub-path. The first ring of a part is its outline and the rest are holes, so a caller that needs polygons
 * pairs them up itself; for the even-odd rule the shape draws with, the order does not matter.
 */
export function decodePath(d: string): Point[][] {
  const rings: Point[][] = [];
  const pattern = /M(-?\d+) (-?\d+)l([^z]*)z/g;
  for (const match of d.matchAll(pattern)) {
    let x = Number(match[1]);
    let y = Number(match[2]);
    const ring: Point[] = [[x, y]];
    const deltas = match[3].trim().split(" ").map(Number);
    for (let i = 0; i + 1 < deltas.length; i += 2) {
      x += deltas[i];
      y += deltas[i + 1];
      ring.push([x, y]);
    }
    rings.push(ring);
  }
  return rings;
}

/** Union of bounding boxes, as [minX, minY, width, height]. */
export function unionViewBox(boxes: ReadonlyArray<[number, number, number, number]>): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x0, y0, x1, y1] of boxes) {
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  }
  return [minX, minY, maxX - minX, maxY - minY];
}
