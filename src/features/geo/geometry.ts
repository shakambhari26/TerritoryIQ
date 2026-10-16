/**
 * Pure planar and geographic geometry helpers used to turn OpenStreetMap
 * relation members into drawable shapes. Coordinates are [x, y] pairs
 * ([lon, lat] for geographic rings).
 */

export type Point = readonly [number, number];
export type Ring = Point[];

export interface Polygon {
  outer: Ring;
  holes: Ring[];
}

export interface WayPiece {
  role: string;
  points: Point[];
}

const keyOf = (p: Point): string => `${p[0]},${p[1]}`;

/**
 * Joins way pieces that share end points into closed rings. Pieces that cannot
 * be closed are returned in `open` rather than being forced shut, so a caller
 * can report a failed geometry instead of drawing an invented edge.
 */
export function stitchRings(pieces: readonly Point[][]): { closed: Ring[]; open: Point[][] } {
  const remaining = pieces.filter((p) => p.length >= 2).map((p) => p.slice());
  const closed: Ring[] = [];
  const open: Point[][] = [];

  const endpointIndex = new Map<string, number[]>();
  const alive = new Set<number>();
  const register = (index: number) => {
    const piece = remaining[index];
    for (const end of [piece[0], piece[piece.length - 1]]) {
      const key = keyOf(end);
      const list = endpointIndex.get(key);
      if (list) {
        if (!list.includes(index)) list.push(index);
      } else {
        endpointIndex.set(key, [index]);
      }
    }
  };
  remaining.forEach((_, index) => {
    alive.add(index);
    register(index);
  });

  const take = (key: string, notIndex: number): number | null => {
    for (const candidate of endpointIndex.get(key) ?? []) {
      if (candidate !== notIndex && alive.has(candidate)) return candidate;
    }
    return null;
  };

  for (let start = 0; start < remaining.length; start++) {
    if (!alive.has(start)) continue;
    alive.delete(start);
    let chain = remaining[start].slice();

    for (;;) {
      if (keyOf(chain[0]) === keyOf(chain[chain.length - 1]) && chain.length >= 4) break;
      const tail = keyOf(chain[chain.length - 1]);
      let next = take(tail, -1);
      if (next !== null) {
        alive.delete(next);
        const piece = remaining[next];
        const forward = keyOf(piece[0]) === tail;
        chain = chain.concat(forward ? piece.slice(1) : piece.slice().reverse().slice(1));
        continue;
      }
      const head = keyOf(chain[0]);
      next = take(head, -1);
      if (next !== null) {
        alive.delete(next);
        const piece = remaining[next];
        const forward = keyOf(piece[piece.length - 1]) === head;
        chain = (forward ? piece.slice(0, -1) : piece.slice().reverse().slice(0, -1)).concat(chain);
        continue;
      }
      break;
    }

    if (chain.length >= 4 && keyOf(chain[0]) === keyOf(chain[chain.length - 1])) closed.push(chain);
    else open.push(chain);
  }
  return { closed, open };
}

/** Signed area by the shoelace formula (positive for counter-clockwise in x-right, y-up). */
export function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return sum / 2;
}

/** Even-odd point-in-ring test. Points exactly on an edge may fall either way. */
export function pointInRing(point: Point, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  return pointInRing(point, polygon.outer) && !polygon.holes.some((hole) => pointInRing(point, hole));
}

export function pointInPolygons(point: Point, polygons: readonly Polygon[]): boolean {
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

/**
 * A point guaranteed to lie inside the polygon (outside its holes): the
 * midpoint of the widest horizontal span along a scan line through the
 * centre of the outer ring's bounding box, trying several heights. Unlike a
 * boundary vertex, it is never on an edge shared with a neighbour.
 */
export function interiorPoint(polygon: Polygon): Point | null {
  const [, minY, , maxY] = boundsOf([polygon.outer]);
  const rings = [polygon.outer, ...polygon.holes];
  for (const fraction of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9]) {
    const y = minY + (maxY - minY) * fraction;
    const crossings: number[] = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y) crossings.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
      }
    }
    crossings.sort((a, b) => a - b);
    let best: { width: number; mid: number } | null = null;
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const width = crossings[i + 1] - crossings[i];
      if (width > 0 && (!best || width > best.width)) best = { width, mid: (crossings[i] + crossings[i + 1]) / 2 };
    }
    if (best) {
      const candidate: Point = [best.mid, y];
      if (pointInPolygon(candidate, polygon)) return candidate;
    }
  }
  return null;
}

export interface AssembledGeometry {
  polygons: Polygon[];
  /** Pieces that could not be closed into rings. Non-empty means the geometry is incomplete. */
  openPieces: number;
  /** Inner rings with no containing outer ring. */
  orphanHoles: number;
}

/** Builds polygons with holes from relation members. */
export function assemblePolygons(pieces: readonly WayPiece[]): AssembledGeometry {
  const outerPieces = pieces.filter((p) => p.role !== "inner").map((p) => p.points);
  const innerPieces = pieces.filter((p) => p.role === "inner").map((p) => p.points);
  const outers = stitchRings(outerPieces);
  const inners = stitchRings(innerPieces);

  const polygons: Polygon[] = outers.closed.map((outer) => ({ outer, holes: [] }));
  let orphanHoles = 0;
  for (const hole of inners.closed) {
    const probe = hole[0];
    const owner = polygons
      .filter((polygon) => pointInRing(probe, polygon.outer))
      .sort((a, b) => Math.abs(ringArea(a.outer)) - Math.abs(ringArea(b.outer)))[0];
    if (owner) owner.holes.push(hole);
    else orphanHoles++;
  }
  return { polygons, openPieces: outers.open.length + inners.open.length, orphanHoles };
}

/** Douglas-Peucker simplification of an open polyline (end points are kept). */
function simplifyLine(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const epsilonSquared = epsilon * epsilon;
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = points[i];
      let distanceSquared: number;
      if (lengthSquared === 0) {
        distanceSquared = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
        distanceSquared = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
      }
      if (distanceSquared > maxDistance) {
        maxDistance = distanceSquared;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > epsilonSquared) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/**
 * Simplifies a closed ring. The ring is split at its first and its farthest
 * vertex so that simplification cannot collapse it onto a single line. Returns
 * null when fewer than three distinct vertices survive.
 */
export function simplifyRing(ring: Ring, epsilon: number): Ring | null {
  const open = ring.slice(0, -1);
  if (open.length < 3) return null;
  let far = 1;
  let best = -1;
  for (let i = 1; i < open.length; i++) {
    const d = (open[i][0] - open[0][0]) ** 2 + (open[i][1] - open[0][1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const first = simplifyLine(open.slice(0, far + 1), epsilon);
  const second = simplifyLine(open.slice(far).concat([open[0]]), epsilon);
  const merged = first.concat(second.slice(1));
  // merged now starts and ends at open[0].
  if (merged.length < 4) return null;
  if (Math.abs(ringArea(merged)) === 0) return null;
  return merged;
}

export function boundsOf(rings: readonly Ring[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

/**
 * Spherical Mercator expressed in degree-like units, so that x equals the
 * longitude and y is the Mercator ordinate scaled by 180/pi. Equal scale on
 * both axes keeps shapes recognisable and matches common web-map layers.
 */
export function mercator([lon, lat]: Point): Point {
  const phi = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return [lon, (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + phi / 2))];
}

// ---------------------------------------------------------------- label anchors --

/** Squared distance from (px, py) to the segment a-b. */
function segmentDistanceSquared(px: number, py: number, a: Point, b: Point): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

/** Distance from a point to the nearest edge of the polygon: positive inside (outside its holes), negative outside. */
function signedDistance(x: number, y: number, polygon: Polygon): number {
  let nearest = Infinity;
  for (const ring of [polygon.outer, ...polygon.holes]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      nearest = Math.min(nearest, segmentDistanceSquared(x, y, ring[j], ring[i]));
    }
  }
  const distance = Math.sqrt(nearest);
  return pointInPolygon([x, y], polygon) ? distance : -distance;
}

export interface LabelAnchor {
  x: number;
  y: number;
  /** Distance from the anchor to the nearest edge: the radius of the largest circle around it that fits inside. */
  r: number;
}

interface Cell {
  x: number;
  y: number;
  /** Half the cell's side. */
  h: number;
  /** Signed distance from the cell centre to the polygon. */
  d: number;
  /** The best distance any point of the cell could have. */
  max: number;
}

/**
 * The pole of inaccessibility: the point inside the polygon that is farthest from every edge, found by
 * quadtree search to within `precision` (the same units as the coordinates). Unlike a bounding-box centre or
 * a centroid it always lies inside the shape, including crescents and shapes with holes, so a label placed
 * there stays on its own area. Returns null for a degenerate polygon.
 */
export function poleOfInaccessibility(polygon: Polygon, precision = 1): LabelAnchor | null {
  const [minX, minY, maxX, maxY] = boundsOf([polygon.outer]);
  const width = maxX - minX;
  const height = maxY - minY;
  const size = Math.min(width, height);
  if (!(size > 0) || !Number.isFinite(size)) return null;

  const makeCell = (x: number, y: number, h: number): Cell => {
    const d = signedDistance(x, y, polygon);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };

  // A max-heap on `max`.
  const heap: Cell[] = [];
  const push = (cell: Cell) => {
    heap.push(cell);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].max >= heap[i].max) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = (): Cell => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let largest = i;
        if (left < heap.length && heap[left].max > heap[largest].max) largest = left;
        if (right < heap.length && heap[right].max > heap[largest].max) largest = right;
        if (largest === i) break;
        [heap[largest], heap[i]] = [heap[i], heap[largest]];
        i = largest;
      }
    }
    return top;
  };

  let half = size / 2;
  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size) push(makeCell(x + half, y + half, half));
  }

  let best = makeCell(minX + width / 2, minY + height / 2, 0);
  while (heap.length > 0) {
    const cell = pop();
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    half = cell.h / 2;
    push(makeCell(cell.x - half, cell.y - half, half));
    push(makeCell(cell.x + half, cell.y - half, half));
    push(makeCell(cell.x - half, cell.y + half, half));
    push(makeCell(cell.x + half, cell.y + half, half));
  }
  return best.d > 0 ? { x: best.x, y: best.y, r: best.d } : null;
}
