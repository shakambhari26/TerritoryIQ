/**
 * Fixed geometry of the map's on-screen furniture (buttons, the scale bar, the provisional chip), in pixels from
 * the map's own edges, and the label sizes the map uses. The controls, the label placer, the marker filter and the
 * fit all read it, so a label can never be placed under a button and a fitted state never lands under one.
 */

import type { Rect } from "../geo/labels.ts";
import { fitBoundsInset, type Bounds, type Insets, type Size, type Viewport } from "../geo/viewport.ts";

export const CONTROL_INSET = 12;
export const BUTTON = 36;
/** Below this map width the controls use their compact size. */
export const COMPACT_WIDTH = 560;
const COMPACT_BUTTON = 32;
const PAN_GAP = 4;
/** Zoom in and out, fit state, fit view, reset, coordinate grid. */
const ZOOM_BUTTONS = 6;
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

/** The permanent "Provisional boundaries" chip in the top-left corner (see Workspace). A little wider than it draws. */
const CHIP = { width: 136, height: 24 };
/** The scale bar: its line and its text, to the right of the pan buttons. A little larger than it draws. */
const SCALE = { width: 112, height: 26, gap: 14 };
/** The "Details" jump button a small map shows at the bottom right once something is selected. */
const DETAILS = { width: 88, height: 32 };

export interface Furniture {
  id: "zoom" | "pan" | "chip" | "scale" | "details";
  rect: Rect;
  /**
   * Whether the fit keeps the state clear of it. The scale bar is a hairline and a few characters in a corner that a
   * fitted state's bounding box only grazes, so it only keeps labels and markers off it; every control and notice does more.
   */
  clearOfFit: boolean;
}

/**
 * Everything drawn over the map that is not the map: the zoom column (top right), the pan buttons (bottom left),
 * the provisional chip (top left), the scale bar (beside the pan buttons) and, on a small map, the details button
 * (bottom right). Each rectangle has `margin` pixels of breathing room.
 */
export function furniture(size: Size, margin = 6): Furniture[] {
  const zoom = zoomColumn(size.width);
  const pan = panPad(size.width);
  const grow = (r: Rect): Rect => ({ x: r.x - margin, y: r.y - margin, width: r.width + 2 * margin, height: r.height + 2 * margin });
  const list: Furniture[] = [
    { id: "zoom", clearOfFit: true, rect: grow({ x: size.width - CONTROL_INSET - zoom.width, y: CONTROL_INSET, width: zoom.width, height: zoom.height }) },
    { id: "pan", clearOfFit: true, rect: grow({ x: CONTROL_INSET, y: size.height - CONTROL_INSET - pan.height, width: pan.width, height: pan.height }) },
    { id: "chip", clearOfFit: true, rect: grow({ x: CONTROL_INSET, y: CONTROL_INSET, width: CHIP.width, height: CHIP.height }) },
    { id: "scale", clearOfFit: false, rect: grow({ x: CONTROL_INSET + pan.width + SCALE.gap, y: size.height - SCALE.gap - SCALE.height, width: SCALE.width, height: SCALE.height }) },
  ];
  if (size.width < COMPACT_WIDTH) {
    list.push({ id: "details", clearOfFit: true, rect: grow({ x: size.width - CONTROL_INSET - DETAILS.width, y: size.height - CONTROL_INSET - DETAILS.height, width: DETAILS.width, height: DETAILS.height }) });
  }
  return list;
}

/** The rectangles the furniture occupies, for the label placer and the marker filter. */
export function controlObstacles(size: Size, margin = 6): Rect[] {
  return furniture(size, margin).map((f) => f.rect);
}

/** Space kept clear around a fitted extent: tight, so the state fills the frame; a phone gets less. */
export const fitPadding = (width: number) => (width < COMPACT_WIDTH ? 12 : 22);

/**
 * How far a fitted extent's bounding box may reach into a control's rectangle before the fit gives way. A bounding box
 * is bigger than the shape in its corners, so a graze of a few pixels is the empty corner, not the state.
 */
export const GRAZE = 10;
const reaches = (box: Rect, f: Rect) =>
  Math.min(box.x + box.width, f.x + f.width) - Math.max(box.x, f.x) > GRAZE && Math.min(box.y + box.height, f.y + f.height) - Math.max(box.y, f.y) > GRAZE;

/** Where the world rectangle `bounds` lands on screen under `view`. */
function screenBox(bounds: Bounds, view: Viewport): Rect {
  return {
    x: bounds[0] * view.scale + view.tx,
    y: bounds[1] * view.scale + view.ty,
    width: (bounds[2] - bounds[0]) * view.scale,
    height: (bounds[3] - bounds[1]) * view.scale,
  };
}

/**
 * Fits `bounds` in the map, centred, at the largest scale that keeps the extent clear of the furniture. The scale is
 * uniform (the aspect ratio is never changed). It first tries the whole frame; where the fitted extent would sit under
 * a control, the frame is reduced on the cheapest side for that control (the side it is nearest to), and the extent
 * is fitted again. On a wide map the state is narrower than the room beside it, so nothing is given up; on a phone
 * the zoom column takes a strip down the right.
 */
export function fitClear(bounds: Bounds, size: Size, limits?: { min: number; max: number }): Viewport {
  const padding = fitPadding(size.width);
  const rects = furniture(size, 4).filter((f) => f.clearOfFit);
  let insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  let view = fitBoundsInset(bounds, size, insets, padding, limits);
  for (let pass = 0; pass < 4; pass++) {
    const box = screenBox(bounds, view);
    const hit = rects.filter((f) => reaches(box, f.rect));
    if (hit.length === 0) break;
    const next = { ...insets };
    for (const { rect } of hit) {
      const cost: Array<[keyof Insets, number]> = [
        ["bottom", size.height - rect.y],
        ["right", size.width - rect.x],
        ["top", rect.y + rect.height],
        ["left", rect.x + rect.width],
      ];
      const [side, amount] = cost.reduce((best, c) => (c[1] < best[1] ? c : best));
      next[side] = Math.max(next[side], amount);
    }
    if (next.top === insets.top && next.right === insets.right && next.bottom === insets.bottom && next.left === insets.left) break;
    insets = next;
    view = fitBoundsInset(bounds, size, insets, padding, limits);
  }
  return view;
}

/** The longest leader line a district name may have. A name that would need a longer one is marked with a dot and named on hover. */
export const LEADER_MAX = 60;

/**
 * Text size for district names at the state overview: smaller on a narrow map so more of them fit, and a point smaller
 * again when the whole state is drawn small (`overviewHeight`, its height on screen in pixels), where 23 names have
 * little room.
 */
export function districtFontSize(width: number, overviewHeight = Infinity): number {
  const base = width < COMPACT_WIDTH ? 9.5 : width < 900 ? 10.5 : 11.5;
  return overviewHeight < SMALL_OVERVIEW ? Math.max(9, base - 1) : base;
}

/** Below this on-screen height of the whole state, district names are set a point smaller. */
const SMALL_OVERVIEW = 340;

/** Text size for block names inside a district. It grows a little as the map is zoomed in. */
export function blockFontSize(width: number, zoomRatio: number): number {
  const base = width < COMPACT_WIDTH ? 9.5 : 10.5;
  return Math.min(base + 2, base + Math.max(0, Math.log2(Math.max(zoomRatio, 1))) * 0.9);
}
