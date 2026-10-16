/**
 * Pan and zoom maths for the territory map. A viewport maps layer ("world")
 * coordinates to screen pixels: screen = world * scale + (tx, ty).
 * Pure functions; the map component owns the state and the DOM.
 */

export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export interface Size {
  width: number;
  height: number;
}

/** [minX, minY, maxX, maxY] in world coordinates. */
export type Bounds = readonly [number, number, number, number];

export const MAX_ZOOM_FACTOR = 200;

export function isUsableBounds(bounds: Bounds | null | undefined): bounds is Bounds {
  return (
    !!bounds &&
    bounds.every(Number.isFinite) &&
    bounds[2] >= bounds[0] &&
    bounds[3] >= bounds[1] &&
    (bounds[2] > bounds[0] || bounds[3] > bounds[1])
  );
}

/** Viewport that fits the bounds in the screen with padding, centred. */
export function fitBounds(bounds: Bounds, size: Size, padding = 24): Viewport {
  const width = Math.max(bounds[2] - bounds[0], 1e-9);
  const height = Math.max(bounds[3] - bounds[1], 1e-9);
  const availableWidth = Math.max(size.width - padding * 2, 1);
  const availableHeight = Math.max(size.height - padding * 2, 1);
  const scale = Math.min(availableWidth / width, availableHeight / height);
  const centreX = (bounds[0] + bounds[2]) / 2;
  const centreY = (bounds[1] + bounds[3]) / 2;
  return { scale, tx: size.width / 2 - centreX * scale, ty: size.height / 2 - centreY * scale };
}

/** Zoom limits relative to the "fit everything" scale. */
export function zoomLimits(fitScale: number): { min: number; max: number } {
  return { min: fitScale * 0.5, max: fitScale * MAX_ZOOM_FACTOR };
}

/**
 * Zooms by `factor` keeping the world point under `anchor` (screen px) fixed.
 * A zero, negative or non-finite factor is ignored: it would otherwise give a
 * NaN or non-positive scale and lose the map.
 */
export function zoomAt(
  viewport: Viewport,
  anchor: { x: number; y: number },
  factor: number,
  limits: { min: number; max: number },
): Viewport {
  if (!Number.isFinite(factor) || factor <= 0) return viewport;
  // A broken viewport or anchor is ignored rather than spread into every later view.
  if (!isUsableViewport(viewport) || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return viewport;
  const scale = Math.min(limits.max, Math.max(limits.min, viewport.scale * factor));
  const ratio = scale / viewport.scale;
  return {
    scale,
    tx: anchor.x - (anchor.x - viewport.tx) * ratio,
    ty: anchor.y - (anchor.y - viewport.ty) * ratio,
  };
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return viewport;
  return { ...viewport, tx: viewport.tx + dx, ty: viewport.ty + dy };
}

/** A view the map can safely draw: a finite, strictly positive scale and finite offsets. */
export function isUsableViewport(viewport: Viewport | null | undefined): viewport is Viewport {
  return (
    !!viewport &&
    Number.isFinite(viewport.scale) &&
    viewport.scale > 0 &&
    Number.isFinite(viewport.tx) &&
    Number.isFinite(viewport.ty)
  );
}

/** Keeps the scale inside the limits, scaling about the centre of the screen so the view does not jump. */
export function clampViewport(viewport: Viewport, size: Size, limits: { min: number; max: number }): Viewport {
  if (!isUsableViewport(viewport)) return viewport;
  const scale = Math.min(limits.max, Math.max(limits.min, viewport.scale));
  if (scale === viewport.scale) return viewport;
  return zoomAt(viewport, { x: size.width / 2, y: size.height / 2 }, scale / viewport.scale, { min: scale, max: scale });
}

/** `fitBounds`, with the scale held inside the limits so a tiny unit is not zoomed past the maximum. */
export function fitBoundsWithin(bounds: Bounds, size: Size, padding: number, limits: { min: number; max: number }): Viewport {
  return clampViewport(fitBounds(bounds, size, padding), size, limits);
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * `fitBounds` into the part of the screen that is not under toolbars and
 * controls, so a fitted shape is never hidden behind them. The scale is held
 * inside the limits when they are given.
 */
export function fitBoundsInset(
  bounds: Bounds,
  size: Size,
  insets: Insets,
  padding = 24,
  limits?: { min: number; max: number },
): Viewport {
  const inner = {
    width: Math.max(size.width - insets.left - insets.right, 1),
    height: Math.max(size.height - insets.top - insets.bottom, 1),
  };
  const fitted = fitBounds(bounds, inner, padding);
  const view = { scale: fitted.scale, tx: fitted.tx + insets.left, ty: fitted.ty + insets.top };
  return limits ? clampViewport(view, size, limits) : view;
}

/** The world point at the centre of the screen. */
export function viewportCentre(viewport: Viewport, size: Size): { x: number; y: number } {
  return toWorld(viewport, size.width / 2, size.height / 2);
}

/**
 * A view part-way between two: the scale moves geometrically and the world
 * point at the centre of the screen moves in a straight line, which reads as one
 * smooth fly-to instead of a drift. `t` is clamped to 0..1.
 */
export function interpolateViewport(from: Viewport, to: Viewport, size: Size, t: number): Viewport {
  if (!isUsableViewport(from) || !isUsableViewport(to)) return isUsableViewport(to) ? to : from;
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 1));
  if (k === 0) return from;
  if (k === 1) return to;
  const scale = from.scale * (to.scale / from.scale) ** k;
  const a = viewportCentre(from, size);
  const b = viewportCentre(to, size);
  const cx = a.x + (b.x - a.x) * k;
  const cy = a.y + (b.y - a.y) * k;
  return { scale, tx: size.width / 2 - cx * scale, ty: size.height / 2 - cy * scale };
}

/** The part of the world currently on screen, as bounds in world coordinates. */
export function visibleWorld(viewport: Viewport, size: Size): Bounds {
  const topLeft = toWorld(viewport, 0, 0);
  const bottomRight = toWorld(viewport, size.width, size.height);
  return [topLeft.x, topLeft.y, bottomRight.x, bottomRight.y];
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Smooth ease-in-out for fly-to animation. */
export const easeInOut = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
};

export function toScreen(viewport: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: x * viewport.scale + viewport.tx, y: y * viewport.scale + viewport.ty };
}

export function toWorld(viewport: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: (x - viewport.tx) / viewport.scale, y: (y - viewport.ty) / viewport.scale };
}

export function unionBounds(boxes: readonly Bounds[]): Bounds | null {
  if (boxes.length === 0) return null;
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
  return [minX, minY, maxX, maxY];
}

/** Pads a (possibly tiny) bounds so a single small unit is not zoomed to the limit. */
export function padBounds(bounds: Bounds, minSpan: number): Bounds {
  const width = bounds[2] - bounds[0];
  const height = bounds[3] - bounds[1];
  const extraX = Math.max(0, (minSpan - width) / 2);
  const extraY = Math.max(0, (minSpan - height) / 2);
  return [bounds[0] - extraX, bounds[1] - extraY, bounds[2] + extraX, bounds[3] + extraY];
}
