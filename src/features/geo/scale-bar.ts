/**
 * A map scale bar for the current view. The layer is spherical Mercator with `layerScale` units per degree, so
 * the ground distance of one screen pixel follows from the zoom and the latitude at the middle of the view:
 *
 *   metres per pixel = 111319.49 * cos(latitude) / (layerScale * viewport.scale)
 *
 * Mercator stretches distances away from the equator, so a single bar is true only near the latitude it is
 * measured at. At West Bengal's height (21.5 to 27.2 degrees N) that is a few percent either way, which is why
 * the bar is described as approximate. It is derived from the view alone and says nothing about the data.
 * Pure function: no DOM.
 */

import type { Size, Viewport } from "./viewport.ts";

const METRES_PER_DEGREE = 111_319.49;
const DEG = Math.PI / 180;
/** Round lengths a bar may take, in metres, ascending. */
const NICE = [100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000];

export interface ScaleBar {
  /** Length of the bar on screen, in pixels. */
  pixels: number;
  /** Ground length the bar stands for, in metres. */
  metres: number;
  /** `500 m`, `20 km`. */
  label: string;
}

const latitudeOfLayerY = (y: number, layerScale: number): number => ((2 * Math.atan(Math.exp((-y / layerScale) * DEG)) - Math.PI / 2) / DEG);

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
}

/** The longest round-number bar that fits in `maxPixels`, or null when the view cannot be measured. */
export function scaleBar(viewport: Viewport, size: Size, layerScale: number, maxPixels = 110): ScaleBar | null {
  if (!(viewport.scale > 0) || !(layerScale > 0) || !(size.height > 0) || !(maxPixels > 0)) return null;
  const centreY = (size.height / 2 - viewport.ty) / viewport.scale;
  const latitude = latitudeOfLayerY(centreY, layerScale);
  if (!Number.isFinite(latitude) || Math.abs(latitude) >= 85) return null;
  const metresPerPixel = (METRES_PER_DEGREE * Math.cos(latitude * DEG)) / (layerScale * viewport.scale);
  if (!(metresPerPixel > 0) || !Number.isFinite(metresPerPixel)) return null;
  let metres: number | null = null;
  for (const length of NICE) {
    if (length / metresPerPixel <= maxPixels) metres = length;
  }
  if (metres === null) return null;
  return { pixels: metres / metresPerPixel, metres, label: formatDistance(metres) };
}
