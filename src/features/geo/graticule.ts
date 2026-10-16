/**
 * A latitude and longitude grid for the map's current view, as screen-pixel
 * line positions. It is derived from the view alone (the layer's projection is
 * spherical Mercator with `LAYER_SCALE` units per degree), and says nothing
 * about the data: it is an orientation aid, drawn faintly behind the outlines.
 */

import type { Size, Viewport } from "./viewport.ts";

export interface GraticuleLine {
  orientation: "meridian" | "parallel";
  /** Degrees of longitude (meridian) or latitude (parallel). */
  degrees: number;
  /** Screen x for a meridian, screen y for a parallel. */
  position: number;
  label: string;
}

export interface Graticule {
  stepDegrees: number;
  lines: GraticuleLine[];
}

const STEPS = [5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.025, 0.01, 0.005, 0.0025, 0.001];
/** The widest gap, in pixels, between neighbouring lines. */
const MAX_GAP_PX = 170;
const MAX_LINES = 36;

function decimalsFor(step: number): number {
  for (let d = 0; d <= 5; d++) {
    if (Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) < 1e-9) return d;
  }
  return 5;
}

const latitudeOfMercator = (y: number): number => ((2 * Math.atan(Math.exp((y * Math.PI) / 180)) - Math.PI / 2) * 180) / Math.PI;
const mercatorOfLatitude = (lat: number): number => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));

export function graticule(viewport: Viewport, size: Size, layerScale: number): Graticule {
  const empty: Graticule = { stepDegrees: 0, lines: [] };
  if (!(viewport.scale > 0) || !(size.width > 0) || !(size.height > 0) || !(layerScale > 0)) return empty;
  const pxPerDegree = viewport.scale * layerScale;
  const step = STEPS.find((s) => s * pxPerDegree <= MAX_GAP_PX) ?? STEPS[STEPS.length - 1];

  // Visible extent in degrees. y is Mercator-down in layer units.
  const west = (0 - viewport.tx) / viewport.scale / layerScale;
  const east = (size.width - viewport.tx) / viewport.scale / layerScale;
  const northMercator = -((0 - viewport.ty) / viewport.scale) / layerScale;
  const southMercator = -((size.height - viewport.ty) / viewport.scale) / layerScale;
  const north = latitudeOfMercator(northMercator);
  const south = latitudeOfMercator(southMercator);
  if (![west, east, north, south].every(Number.isFinite)) return empty;

  const decimals = decimalsFor(step);
  const lines: GraticuleLine[] = [];
  for (let k = Math.ceil(west / step); k * step <= east && lines.length < MAX_LINES; k++) {
    const degrees = Number((k * step).toFixed(6));
    lines.push({
      orientation: "meridian",
      degrees,
      position: degrees * layerScale * viewport.scale + viewport.tx,
      label: `${Math.abs(degrees).toFixed(decimals)}°${degrees < 0 ? "W" : "E"}`,
    });
  }
  for (let k = Math.ceil(south / step); k * step <= north && lines.length < MAX_LINES * 2; k++) {
    const degrees = Number((k * step).toFixed(6));
    lines.push({
      orientation: "parallel",
      degrees,
      position: -mercatorOfLatitude(degrees) * layerScale * viewport.scale + viewport.ty,
      label: `${Math.abs(degrees).toFixed(decimals)}°${degrees < 0 ? "S" : "N"}`,
    });
  }
  return { stepDegrees: step, lines };
}
