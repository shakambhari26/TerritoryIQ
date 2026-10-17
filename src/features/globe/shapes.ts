/**
 * Turns an overlay outline into polygons in longitude / latitude, and answers "is this point inside it".
 *
 * The coordinate conversion is not re-implemented here: it is `decodePath` (features/geo/layer.ts) and
 * `layerToLngLat` (features/geo/projection.ts), the same reviewed and tested functions the 2D map uses. The
 * Python builder converts independently as a cross-check (tests/unit/globe-overlay.test.mts compares them).
 */

import { decodePath } from "../geo/layer.ts";
import { layerToLngLat } from "../geo/projection.ts";
import type { BBox, OverlayGeometry } from "./types.ts";

export type LngLat = readonly [number, number];
export interface Polygon {
  outer: LngLat[];
  holes: LngLat[][];
}

function inRing(x: number, y: number, ring: readonly LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Groups decoded rings into polygons. A ring nested inside an odd number of others is a hole of the smallest
 * ring that contains it; every other ring is an outline. This does not depend on winding order.
 */
export function toPolygons(rings: readonly (readonly LngLat[])[]): Polygon[] {
  const areas = rings.map((ring) => {
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % ring.length];
      sum += x0 * y1 - x1 * y0;
    }
    return Math.abs(sum / 2);
  });
  const containers = rings.map((ring, index) => {
    const [px, py] = ring[0];
    const inside: number[] = [];
    rings.forEach((other, otherIndex) => {
      if (otherIndex !== index && areas[otherIndex] > areas[index] && inRing(px, py, other)) inside.push(otherIndex);
    });
    return inside;
  });
  const polygons = new Map<number, Polygon>();
  rings.forEach((ring, index) => {
    if (containers[index].length % 2 === 0) polygons.set(index, { outer: [...ring], holes: [] });
  });
  rings.forEach((ring, index) => {
    if (containers[index].length % 2 === 1) {
      const parent = containers[index].reduce((a, b) => (areas[a] < areas[b] ? a : b));
      polygons.get(parent)?.holes.push([...ring]);
    }
  });
  return [...polygons.values()];
}

export function decodeGeometry(geometry: OverlayGeometry): Polygon[] {
  const rings = decodePath(geometry.d).map((ring) =>
    ring.map(([x, y]): LngLat => {
      const { lng, lat } = layerToLngLat(x, y);
      return [lng, lat];
    }),
  );
  return toPolygons(rings);
}

export function pointInPolygons(lng: number, lat: number, polygons: readonly Polygon[]): boolean {
  return polygons.some((p) => inRing(lng, lat, p.outer) && !p.holes.some((hole) => inRing(lng, lat, hole)));
}

export function inBox(lng: number, lat: number, box: BBox): boolean {
  return lng >= box[0] && lng <= box[2] && lat >= box[1] && lat <= box[3];
}
