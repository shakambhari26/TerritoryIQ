/**
 * Maps between the boundary layer's planar coordinates and longitude / latitude, and between the layer
 * and a Web Mercator basemap (Google Maps, OpenStreetMap tiles).
 *
 * The layer is spherical Mercator with x = longitude and y = -(Mercator ordinate in degrees), both
 * multiplied by `LAYER_SCALE` (see layer.ts). A Web Mercator world is 256 * 2^zoom pixels wide for 360
 * degrees, so one layer unit is `256 * 2^zoom / (360 * LAYER_SCALE)` screen pixels on both axes and the
 * layer's origin (lon 0, lat 0) sits at the world's centre. The layer therefore lines up with the basemap
 * by scaling and shifting alone; nothing is re-projected and no shape is redrawn.
 *
 * Pure functions: no map library, no DOM.
 */

import { LAYER_SCALE } from "./layer.ts";

export interface LngLat {
  lng: number;
  lat: number;
}

export interface LatLngBoundsLiteral {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Edge length, in pixels, of the zoom-0 world in Web Mercator tile schemes. */
export const WORLD_TILE = 256;

const DEG = Math.PI / 180;

/** The longitude and latitude of a layer point. */
export function layerToLngLat(x: number, y: number): LngLat {
  const ordinate = -y / LAYER_SCALE;
  return { lng: x / LAYER_SCALE, lat: (2 * Math.atan(Math.exp(ordinate * DEG)) - Math.PI / 2) / DEG };
}

/** The layer point of a longitude and latitude. Latitude is held to +-85 degrees, as the layer itself is. */
export function lngLatToLayer(lng: number, lat: number): [number, number] {
  const phi = Math.max(-85, Math.min(85, lat)) * DEG;
  const ordinate = (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return [Math.round(lng * LAYER_SCALE), Math.round(-ordinate * LAYER_SCALE)];
}

/** Screen pixels per layer unit on a Web Mercator basemap at `zoom` (zoom may be fractional). */
export function pixelsPerLayerUnit(zoom: number): number {
  return (WORLD_TILE * 2 ** zoom) / (360 * LAYER_SCALE);
}

/** The zoom at which one layer unit is `scale` pixels. The inverse of `pixelsPerLayerUnit`. */
export function zoomForPixelsPerLayerUnit(scale: number): number {
  return Math.log2((scale * 360 * LAYER_SCALE) / WORLD_TILE);
}

/** A layer bounding box [minX, minY, maxX, maxY] as a geographic box. Mercator is monotonic, so the corners suffice. */
export function layerBoundsToLatLng(bounds: readonly [number, number, number, number]): LatLngBoundsLiteral {
  const southWest = layerToLngLat(bounds[0], bounds[3]);
  const northEast = layerToLngLat(bounds[2], bounds[1]);
  return { west: southWest.lng, south: southWest.lat, east: northEast.lng, north: northEast.lat };
}

/** A geographic box grown on every side by `fraction` of its own span, clamped to the Mercator limits. */
export function growLatLngBounds(box: LatLngBoundsLiteral, fraction: number): LatLngBoundsLiteral {
  const dx = (box.east - box.west) * fraction;
  const dy = (box.north - box.south) * fraction;
  return {
    west: Math.max(-180, box.west - dx),
    south: Math.max(-85, box.south - dy),
    east: Math.min(180, box.east + dx),
    north: Math.min(85, box.north + dy),
  };
}
