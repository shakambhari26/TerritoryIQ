/**
 * Spherical maths shared by the camera, the overlay and picking. Pure, no three.js, so it is tested directly.
 *
 * Convention: a unit sphere with +Y north. Longitude 0 faces +X and longitude -90 faces +Z, which is exactly how
 * three.js's SphereGeometry lays out an equirectangular texture (u = 0 at longitude -180). The globe is rotated,
 * not the camera: `faceRotation` gives the Euler angles (order XYZ) that bring a longitude / latitude to +Z,
 * the direction of the camera.
 */

export const DEG = Math.PI / 180;

export type Vec3 = readonly [number, number, number];

export function lngLatToVector(lng: number, lat: number, radius = 1): Vec3 {
  const la = lat * DEG;
  const lo = lng * DEG;
  return [radius * Math.cos(la) * Math.cos(lo), radius * Math.sin(la), -radius * Math.cos(la) * Math.sin(lo)];
}

export function vectorToLngLat(x: number, y: number, z: number): { lng: number; lat: number } {
  const length = Math.hypot(x, y, z) || 1;
  return { lng: Math.atan2(-z, x) / DEG, lat: Math.asin(Math.max(-1, Math.min(1, y / length))) / DEG };
}

/** Euler angles (radians, order XYZ) that turn the point (lng, lat) to face +Z with north up. */
export function faceRotation(lng: number, lat: number): { x: number; y: number } {
  return { x: lat * DEG, y: (-90 - lng) * DEG };
}

/** Wraps a longitude to [-180, 180). */
export function wrapLng(lng: number): number {
  if (lng >= -180 && lng < 180) return lng;
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Signed shortest difference b - a in degrees, within (-180, 180]. */
export function lngDelta(a: number, b: number): number {
  const d = wrapLng(b - a);
  return d === -180 ? 180 : d;
}

/** Great-circle angle between two points, in degrees. */
export function angularDistance(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const a = lngLatToVector(aLng, aLat);
  const b = lngLatToVector(bLng, bLat);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) / DEG;
}

export const smootherstep = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export interface Pose {
  lng: number;
  lat: number;
  /** Camera distance from the globe's centre, in globe radii. */
  dist: number;
}

export const MIN_DIST = 1.06;
export const MAX_DIST = 9;

/**
 * The camera distance at which a longitude / latitude box fills `fill` of the shorter canvas side.
 * Treats the visible patch as flat, which is accurate for a region a few degrees across; the screenshots check it.
 */
export function distanceForBox(box: readonly [number, number, number, number], fovDeg: number, aspect: number, fill = 0.58): number {
  const [west, south, east, north] = box;
  const midLat = (south + north) / 2;
  const halfHeight = Math.sin(((north - south) / 2) * DEG);
  const halfWidth = Math.sin((((east - west) / 2) * DEG) * Math.cos(midLat * DEG));
  const needed = Math.max(halfHeight, halfWidth / Math.max(aspect, 0.2));
  const reach = Math.tan((fovDeg / 2) * DEG) * fill;
  return clamp(1 + needed / reach, MIN_DIST, MAX_DIST);
}

export function boxCentre(box: readonly [number, number, number, number]): { lng: number; lat: number } {
  return { lng: (box[0] + box[2]) / 2, lat: (box[1] + box[3]) / 2 };
}

/**
 * The distance at which the whole globe fills `fill` of the shorter canvas side, so it stays dominant without
 * touching the edge on a wide window or a phone held upright.
 */
export function homeDistance(fovDeg: number, aspect: number, fill = 0.8): number {
  const k = fill * Math.tan((fovDeg / 2) * DEG) * Math.min(1, aspect);
  return clamp(Math.sqrt(1 + k * k) / k, 2.2, MAX_DIST);
}
