/**
 * Label placement for the territory map, in screen pixels.
 *
 * A label is drawn next to the point inside its area where it belongs (the shape's anchor). Where that spot
 * is taken, the label moves to the nearest free one and a short leader line ties it back to its anchor, so
 * every name stays legible even where small areas crowd together (Kolkata, Howrah and the 24 Parganas).
 * Labels never overlap each other or the map controls, and a label that cannot be placed without doing so is
 * left out and reported, never drawn on top of another. A leader line is drawn only for a label that has really
 * moved away from its anchor (more than `LEADER_MIN` pixels), and never runs through another label, a control, a
 * marker or another leader. A name is placed on a strict pass first, where its line also keeps `LEADER_CLEAR` pixels
 * from every other name, line and anchor dot; only a name with no such place is tried again on a plain pass (never
 * through another area's dot, `ANCHOR_CLEAR`), and one with none there is reported, so no line is ever drawn through
 * a district it does not belong to.
 *
 * Pure functions with no DOM: the text width is an estimate (see `estimateWidth`), deliberately a little
 * wide, and the browser tests check it against the rendered text.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point2 {
  x: number;
  y: number;
}

export interface LabelRequest {
  id: string;
  text: string;
  /** The anchor in screen pixels. */
  x: number;
  y: number;
  /** Radius in screen pixels of the largest circle around the anchor that fits inside the shape. */
  r: number;
  /** Larger values are placed first and so get the best position. */
  priority: number;
}

export interface LabelOptions {
  /** The visible map area: labels stay inside it. */
  area: { width: number; height: number };
  fontSize: number;
  /** Rectangles labels must not cover and leader lines must not cross, such as the map controls and the markers. */
  obstacles?: readonly Rect[];
  /** Rectangles labels must not cover but leader lines may cross, such as a selected outline. */
  avoid?: readonly Rect[];
  /**
   * "free": the label may move aside from its anchor, with a leader line. "inside": the label is centred
   * on its anchor and drawn only when it fits within its own shape.
   */
  mode: "free" | "inside";
  /** The most lines a name may be wrapped to. */
  maxLines?: number;
  /** The longest leader line a label may have, in pixels; a label that would need a longer one is reported as omitted. */
  maxLeader?: number;
}

export interface PlacedLabel {
  id: string;
  lines: string[];
  /** The label's box, including a little padding. */
  box: Rect;
  anchor: Point2;
  /** True when the box is not on the anchor, so a leader line is drawn from the anchor to the box. */
  leader: boolean;
}

export interface LabelResult {
  placed: PlacedLabel[];
  /** IDs of labels whose anchor is on screen but that found no free position. */
  omitted: string[];
}

const PAD_X = 4;
const PAD_Y = 2;
const GAP = 3;
const EDGE = 4;
/** A label whose box is closer than this to its anchor reads as attached to it without a line, if no other anchor is near. */
export const LEADER_MIN = 12;
/** Average advance as a fraction of the font size, for a semi-bold sans face. Slightly high on purpose. */
const EM = 0.6;
const NARROW = new Set("iIl1.,:;'|!jtf ()");
const WIDE = new Set("mwMW");

/** An estimate of the rendered width of one line of text, a little wider than the real thing. */
export function estimateWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) em += NARROW.has(ch) ? 0.34 : WIDE.has(ch) ? 0.9 : ch >= "A" && ch <= "Z" ? 0.68 : EM;
  return em * fontSize;
}

/**
 * Wraps a name onto at most `maxLines` lines at spaces, choosing the split that keeps the longest line
 * shortest. A single word is never split.
 */
export function wrapLabel(text: string, fontSize: number, maxLines = 2): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length < 2 || maxLines < 2) return [text.trim()];
  if (text.length <= 9) return [text.trim()];
  let best = [text.trim()];
  let bestWidth = estimateWidth(text, fontSize);
  for (let split = 1; split < words.length; split++) {
    const lines = [words.slice(0, split).join(" "), words.slice(split).join(" ")];
    const width = Math.max(...lines.map((line) => estimateWidth(line, fontSize)));
    if (width < bestWidth - 1e-9) {
      best = lines;
      bestWidth = width;
    }
  }
  return best;
}

const overlaps = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;

const contains = (rect: Rect, p: Point2, slack = 0) =>
  p.x >= rect.x - slack && p.x <= rect.x + rect.width + slack && p.y >= rect.y - slack && p.y <= rect.y + rect.height + slack;

/** The point of the box nearest to `p`. */
function nearestOnBox(box: Rect, p: Point2): Point2 {
  return {
    x: Math.min(Math.max(p.x, box.x), box.x + box.width),
    y: Math.min(Math.max(p.y, box.y), box.y + box.height),
  };
}

const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Clear space a leader line keeps from another label, another leader and another area's anchor dot, in pixels. */
export const LEADER_CLEAR = 5;
/** The least a leader line passes from another area's anchor dot, even on the plain pass: a line through a dot reads as that area's. */
export const ANCHOR_CLEAR = 3;

const inflate = (rect: Rect, by: number): Rect => ({ x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by });

/** The distance from the point `p` to the segment a-b. */
function pointSegmentDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return distance(p, a);
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Whether the open segments a-b and c-d cross each other (a shared end point does not count). */
function segmentsCross(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const side = (p: Point2, q: Point2, r: Point2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(a, b, c);
  const d2 = side(a, b, d);
  const d3 = side(c, d, a);
  const d4 = side(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** The least distance between the segments a-b and c-d: zero when they cross. */
function segmentDistance(a: Point2, b: Point2, c: Point2, d: Point2): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

/** Whether the segment a-b passes through the rectangle (Liang-Barsky). */
function segmentHitsRect(a: Point2, b: Point2, rect: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: Array<[number, number]> = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

// East and west first: a name is wide, so a sideways move frees the most room. Then north and south, then
// every 22.5 degrees in between.
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  ...[0, 8, 12, 4, 14, 10, 2, 6, 15, 1, 7, 9, 13, 11, 3, 5].map((i) => (i * Math.PI) / 8),
  // Then the angles between them, so a leader can slip between two close anchor dots instead of giving the name up.
  ...[1, 17, 25, 9, 29, 21, 5, 13, 31, 3, 15, 19, 27, 23, 7, 11].map((i) => (i * Math.PI) / 16),
].map((angle) => [Math.cos(angle), Math.sin(angle)] as const);

export function placeLabels(requests: readonly LabelRequest[], options: LabelOptions): LabelResult {
  const { area, fontSize, mode } = options;
  const obstacles = options.obstacles ?? [];
  const avoid = options.avoid ?? [];
  const lineHeight = fontSize * 1.18;
  const bounds: Rect = { x: EDGE, y: EDGE, width: Math.max(area.width - 2 * EDGE, 1), height: Math.max(area.height - 2 * EDGE, 1) };
  const ordered = [...requests].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const placed: PlacedLabel[] = [];
  const omitted: string[] = [];

  // Every on-screen anchor. A label never covers another area's anchor: that would bury a small area's marker
  // under a large area's name, and every leader line from it would have to start inside the larger label.
  const onScreen = (r: LabelRequest) => r.x >= -20 && r.y >= -20 && r.x <= area.width + 20 && r.y <= area.height + 20;
  const anchors = ordered.filter(onScreen).map((r) => ({ id: r.id, x: r.x, y: r.y }));

  const fits = (box: Rect) =>
    box.x >= bounds.x - 1e-6 &&
    box.y >= bounds.y - 1e-6 &&
    box.x + box.width <= bounds.x + bounds.width + 1e-6 &&
    box.y + box.height <= bounds.y + bounds.height + 1e-6;
  const free = (box: Rect) => !obstacles.some((o) => overlaps(box, o, 1)) && !avoid.some((o) => overlaps(box, o)) && !placed.some((p) => overlaps(box, p.box, GAP));

  // Places one name. `strict` is the first pass: a leader keeps `LEADER_CLEAR` pixels from every other label, leader and
  // anchor dot. A name that finds no such place is tried again on a second pass with the plain rule (a leader may not touch
  // another label, control, marker or leader), so a crowded corner is still named, and only where nothing else is left is a
  // name reported as omitted.
  const place = (request: LabelRequest, strict: boolean): "placed" | "failed" => {
    const anchor = { x: request.x, y: request.y };
    const clear = strict ? LEADER_CLEAR : 0;
    const othersAnchors = anchors.filter((a) => a.id !== request.id);
    const coversAnother = (box: Rect) => othersAnchors.some((a) => contains(box, a, 3));

    const lines = wrapLabel(request.text, fontSize, options.maxLines ?? 2);
    const width = Math.max(...lines.map((line) => estimateWidth(line, fontSize))) + 2 * PAD_X;
    const height = lines.length * lineHeight + 2 * PAD_Y;
    const centred: Rect = { x: anchor.x - width / 2, y: anchor.y - height / 2, width, height };

    if (mode === "inside") {
      // Fits if the box is inside the circle that fits the shape, with some allowance: shapes are usually
      // wider than their inscribed circle.
      const halfDiagonal = Math.hypot(width / 2, height / 2);
      if (halfDiagonal <= request.r * 1.3 && fits(centred) && free(centred)) {
        placed.push({ id: request.id, lines, box: centred, anchor, leader: false });
      }
      return "placed";
    }

    // The centred position, then every position around the anchor, nearest first. Along each direction the
    // box is moved just far enough to clear the anchor by `GAP`, then a further `k` steps.
    const step = Math.max(5, fontSize * 0.55);
    const ranked: Array<{ rect: Rect; reach: number; order: number }> = [{ rect: centred, reach: 0, order: -1 }];
    for (let k = 0; k < 30; k++) {
      DIRECTIONS.forEach(([dx, dy], order) => {
        const room = Math.min(width / 2 / Math.max(Math.abs(dx), 1e-9), height / 2 / Math.max(Math.abs(dy), 1e-9));
        const reach = room + GAP + k * step;
        ranked.push({ rect: { x: anchor.x + dx * reach - width / 2, y: anchor.y + dy * reach - height / 2, width, height }, reach, order });
      });
    }
    ranked.sort((x, y) => x.reach - y.reach || x.order - y.order);
    const candidates = ranked.map((c) => c.rect);

    // Leader lines already drawn: a new label may not sit on one, and a new leader may not cross one.
    const leaders = placed.filter((p) => p.leader).map((p) => ({ from: p.anchor, to: nearestOnBox(p.box, p.anchor) }));

    let chosen: { box: Rect; leader: boolean } | null = null;
    for (const raw of candidates) {
      // Slide a candidate that pokes past the edge back inside rather than discarding it.
      const box: Rect = {
        ...raw,
        x: Math.min(Math.max(raw.x, bounds.x), bounds.x + bounds.width - raw.width),
        y: Math.min(Math.max(raw.y, bounds.y), bounds.y + bounds.height - raw.height),
      };
      if (!fits(box) || !free(box) || coversAnother(box)) continue;
      if (leaders.some((l) => segmentHitsRect(l.from, l.to, clear ? inflate(box, 3) : box))) continue;
      const end = nearestOnBox(box, anchor);
      const away = distance(anchor, end);
      if (away > (options.maxLeader ?? Infinity)) continue;
      // A name beside its anchor needs no line, unless another area's anchor is close enough to leave it unclear whose it is.
      const leader = away > LEADER_MIN || (away > 0 && othersAnchors.some((a) => distance(a, anchor) < 2 * LEADER_MIN));
      if (leader) {
        // A leader line must not run through another label (on the strict pass, nor hug one), a control or a marker (one
        // that already holds the anchor itself is the area's own marker), and must not cross another leader. On the strict
        // pass it also keeps clear of every other leader and of every other area's anchor dot, so no line is ever read as
        // belonging to the wrong name.
        if (placed.some((p) => segmentHitsRect(anchor, end, clear ? inflate(p.box, clear - 1) : p.box))) continue;
        if (obstacles.some((o) => !contains(o, anchor) && segmentHitsRect(anchor, end, o))) continue;
        if (leaders.some((l) => (clear ? segmentDistance(anchor, end, l.from, l.to) < clear : segmentsCross(anchor, end, l.from, l.to)))) continue;
        if (othersAnchors.some((a) => pointSegmentDistance(a, anchor, end) < (clear ? clear - 1 : ANCHOR_CLEAR))) continue;
      }
      chosen = { box, leader };
      break;
    }

    if (!chosen) return "failed";
    placed.push({ id: request.id, lines, box: chosen.box, anchor, leader: chosen.leader });
    return "placed";
  };

  const failed: LabelRequest[] = [];
  // Off screen: nothing to label here.
  for (const request of ordered) if (onScreen(request) && place(request, true) === "failed") failed.push(request);
  for (const request of failed) if (place(request, false) === "failed") omitted.push(request.id);
  return { placed, omitted };
}

/** The end of a leader line: where it meets the label box. */
export function leaderEnd(label: PlacedLabel): Point2 {
  return nearestOnBox(label.box, label.anchor);
}

/**
 * The vertices of an outline drawn as layer path data (`M x y l dx dy …z`, the only commands the layer uses), as one
 * list of absolute points per ring. Parsed once per shape, so a view change only has to project the points.
 */
export function parseOutline(d: string): Array<Array<[number, number]>> {
  const rings: Array<Array<[number, number]>> = [];
  let ring: Array<[number, number]> = [];
  let x = 0;
  let y = 0;
  for (const [, command, args] of d.matchAll(/([MlLz])([^MlLz]*)/g)) {
    if (command === "z") {
      if (ring.length > 0) rings.push(ring);
      ring = [];
      continue;
    }
    const n = args.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    for (let i = 0; i + 1 < n.length; i += 2) {
      if (command === "M") {
        if (ring.length > 0) rings.push(ring);
        ring = [];
        x = n[i];
        y = n[i + 1];
      } else if (command === "l") {
        x += n[i];
        y += n[i + 1];
      } else {
        x = n[i];
        y = n[i + 1];
      }
      ring.push([x, y]);
    }
  }
  if (ring.length > 0) rings.push(ring);
  return rings;
}

/**
 * Small squares laid along the outlines, in screen pixels, for the label placer to keep names off an outline that
 * matters (the selected area's). Each square is `cell` pixels wide and the outline is sampled twice per cell, so no
 * stretch of it is missed. `limit` caps the squares so a very large selection stays cheap; the result is the same
 * for the same input.
 */
export function outlineRects(
  outlines: ReadonlyArray<ReadonlyArray<ReadonlyArray<[number, number]>>>,
  view: { scale: number; tx: number; ty: number },
  area: { width: number; height: number },
  cell = 10,
  limit = 2500,
): Rect[] {
  const seen = new Set<string>();
  const out: Rect[] = [];
  const add = (px: number, py: number) => {
    if (px < -cell || py < -cell || px > area.width + cell || py > area.height + cell) return;
    const cx = Math.floor(px / cell);
    const cy = Math.floor(py / cell);
    const key = `${cx},${cy}`;
    if (seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push({ x: cx * cell, y: cy * cell, width: cell, height: cell });
  };
  for (const shape of outlines) {
    for (const ring of shape) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[(i + 1) % ring.length];
        const x0 = ax * view.scale + view.tx;
        const y0 = ay * view.scale + view.ty;
        const x1 = bx * view.scale + view.tx;
        const y1 = by * view.scale + view.ty;
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (cell / 2)));
        for (let k = 0; k <= steps; k++) add(x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps);
      }
    }
  }
  return out;
}
