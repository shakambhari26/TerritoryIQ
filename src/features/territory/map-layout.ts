/**
 * Fixed geometry of the map's on-screen controls, in pixels from the map's own edges, and the label sizes the
 * map uses. The controls and the label placer both read it, so a label can never be placed underneath a button.
 */

import type { Rect } from "../geo/labels.ts";

export const CONTROL_INSET = 12;
export const BUTTON = 36;
/** Below this map width the controls use their compact size. */
export const COMPACT_WIDTH = 560;
const COMPACT_BUTTON = 32;
const PAN_GAP = 4;
/** Zoom in and out, fit state, fit district, fit block, reset, coordinate grid. */
const ZOOM_BUTTONS = 7;
/** Padding and the three dividers of the zoom column. */
const ZOOM_CHROME = 21;

const buttonSize = (width: number) => (width < COMPACT_WIDTH ? COMPACT_BUTTON : BUTTON);

export function zoomColumn(width: number): { width: number; height: number } {
  const b = buttonSize(width);
  return { width: b + 6, height: ZOOM_BUTTONS * b + ZOOM_CHROME };
}

/**
 * The pan buttons. A cross of four buttons on a 3 by 3 grid, or on a small map a single row of four, which
 * covers a third of the height and so leaves the south-west of a fitted state clear.
 */
export function panPad(width: number): { width: number; height: number } {
  const b = buttonSize(width);
  if (width < COMPACT_WIDTH) return { width: 4 * b + 3 * PAN_GAP, height: b };
  return { width: 3 * b + 2 * PAN_GAP, height: 3 * b + 2 * PAN_GAP };
}

/** The rectangles the zoom column (top right) and the pan pad (bottom left) occupy, with a little breathing room. */
export function controlObstacles(size: { width: number; height: number }, margin = 6): Rect[] {
  const zoom = zoomColumn(size.width);
  const pan = panPad(size.width);
  return [
    {
      x: size.width - CONTROL_INSET - zoom.width - margin,
      y: CONTROL_INSET - margin,
      width: zoom.width + 2 * margin,
      height: zoom.height + 2 * margin,
    },
    {
      x: CONTROL_INSET - margin,
      y: size.height - CONTROL_INSET - pan.height - margin,
      width: pan.width + 2 * margin,
      height: pan.height + 2 * margin,
    },
  ];
}

/** Text size for district names at the state overview: smaller on a narrow map so more of them fit. */
export function districtFontSize(width: number): number {
  if (width < COMPACT_WIDTH) return 9.5;
  if (width < 900) return 10.5;
  return 11.5;
}

/** Text size for block names inside a district. It grows a little as the map is zoomed in. */
export function blockFontSize(width: number, zoomRatio: number): number {
  const base = width < COMPACT_WIDTH ? 9.5 : 10.5;
  return Math.min(base + 2, base + Math.max(0, Math.log2(Math.max(zoomRatio, 1))) * 0.9);
}
