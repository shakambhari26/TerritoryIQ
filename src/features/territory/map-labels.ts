/**
 * Which names the map prints, and where. Built on `geo/labels.ts` (collision and placement), this adds the map's
 * own rules:
 *
 *   - A district is named only if its outline was tied to the official district by the LGD district code
 *     (`basis: "lgd-district-code"`). The name is the LGD name. No label is made from a sales-territory label.
 *   - Every label sits at the shape's stored anchor: the pole of inaccessibility of its largest part, a point
 *     inside the drawn outline (see `geo/geometry.ts`). It is never an average of coordinates. A shape without
 *     an anchor gets no label rather than a guessed one.
 *   - At state level every such district is a candidate. A name that fits goes at its anchor; a crowded one is
 *     moved to free space with a leader line; one with no room is reported in `hidden` so the map can mark it
 *     with a dot and name it on hover.
 *   - Inside a district, the selected block is named first (with a leader if it is small), then the other
 *     blocks, each only where its name fits inside its own outline, so more appear as the map is zoomed in.
 *     Neighbouring districts keep a quiet name.
 *
 * Pure: the caller memoises on the viewport, so panning the pointer or hovering never recomputes it.
 */

import { placeLabels, type PlacedLabel, type Rect } from "../geo/labels.ts";
import type { Size, Viewport } from "../geo/viewport.ts";
import { blockFontSize, districtFontSize } from "./map-layout.ts";
import type { MapContext } from "./map-level.ts";
import type { TerritoryModel } from "./model.ts";

export type LabelAnchor = readonly [x: number, y: number, radius: number];

export interface PlannedLabel extends PlacedLabel {
  kind: "district" | "block";
  /** `primary` names what the user is working in; `quiet` is context. */
  tone: "primary" | "quiet";
  fontSize: number;
}

export interface HiddenLabel {
  id: string;
  name: string;
  /** Screen position of the shape's anchor. */
  at: { x: number; y: number };
}

export interface LabelPlan {
  labels: PlannedLabel[];
  /** Districts whose name found no room at state level. */
  hidden: HiddenLabel[];
}

export interface LabelPlanInput {
  model: Pick<TerritoryModel, "featureById">;
  /** Label anchor [x, y, r] in layer units, by feature ID, for every drawn shape that has one. */
  anchors: ReadonlyMap<string, LabelAnchor>;
  context: MapContext;
  viewport: Viewport;
  size: Size;
  /** Districts with a drawn outline. */
  districtIds: readonly string[];
  /** Blocks whose outline is drawn and can be clicked (the focused district's). */
  blockIds: ReadonlySet<string>;
  selectedBlockId: string | null;
  /** Screen areas the controls cover; labels keep out of them. */
  obstacles: readonly Rect[];
  /** Current scale over the scale that fits the focused extent. 1 when the view is as fitted. */
  zoomRatio: number;
}

const MIN_BLOCK_RADIUS_PX = 4;

export function planLabels(input: LabelPlanInput): LabelPlan {
  const { model, anchors, context, viewport, size } = input;
  if (!(size.width > 0) || !(size.height > 0) || !(viewport.scale > 0)) return { labels: [], hidden: [] };

  const at = (id: string) => {
    const a = anchors.get(id);
    if (!a) return null;
    return { x: a[0] * viewport.scale + viewport.tx, y: a[1] * viewport.scale + viewport.ty, r: a[2] * viewport.scale, layerR: a[2] };
  };
  const request = (id: string, text: string, priority: number) => {
    const p = at(id);
    return p ? { id, text, x: p.x, y: p.y, r: p.r, priority } : null;
  };

  const labels: PlannedLabel[] = [];
  const hidden: HiddenLabel[] = [];
  const obstacles: Rect[] = [...input.obstacles];
  const area = { width: size.width, height: size.height };
  const kindOf = (id: string): "district" | "block" => (id.startsWith("GD-") ? "district" : "block");

  const run = (
    requests: ReturnType<typeof request>[],
    mode: "free" | "inside",
    fontSize: number,
    tone: "primary" | "quiet",
  ): string[] => {
    const list = requests.filter((r): r is NonNullable<typeof r> => r !== null);
    if (list.length === 0) return [];
    const result = placeLabels(list, { area, fontSize, mode, obstacles });
    for (const placed of result.placed) {
      labels.push({ ...placed, kind: kindOf(placed.id), tone, fontSize });
      obstacles.push(placed.box);
    }
    return result.omitted;
  };

  // A district is named only when its outline is tied to it by the LGD district code.
  const namedDistricts = input.districtIds.filter((id) => {
    const feature = model.featureById.get(id);
    return feature?.kind === "district" && feature.boundary?.basis === "lgd-district-code";
  });
  const nameOf = (id: string) => model.featureById.get(id)?.name ?? id;

  if (context.districtId === null) {
    // Larger areas first: they get the best position, and small ones move around them. A small area that still finds
    // no room is then promoted ahead of the rest and the whole set is placed again, so a crowded corner such as
    // Kolkata is named before a large neighbour takes the free space beside it.
    const boost = new Map<string, number>();
    let omitted: string[] = [];
    let best: { labels: PlannedLabel[]; omitted: string[] } | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = labels.length;
      const obstacleCount = obstacles.length;
      const requests = namedDistricts.map((id) => {
        const p = at(id);
        return request(id, nameOf(id), (p ? p.layerR : 0) + (boost.get(id) ?? 0));
      });
      omitted = run(requests, "free", districtFontSize(size.width), "primary");
      const attemptLabels = labels.splice(before);
      obstacles.length = obstacleCount;
      if (!best || omitted.length < best.omitted.length) best = { labels: attemptLabels, omitted };
      if (omitted.length === 0) break;
      omitted.forEach((id, i) => boost.set(id, 1e6 + i));
    }
    labels.push(...best!.labels);
    for (const id of best!.omitted) {
      const p = at(id);
      if (p) hidden.push({ id, name: nameOf(id), at: { x: p.x, y: p.y } });
    }
    return { labels, hidden };
  }

  const blockFont = blockFontSize(size.width, input.zoomRatio);
  const selected = input.selectedBlockId && input.blockIds.has(input.selectedBlockId) ? input.selectedBlockId : null;
  if (selected) run([request(selected, nameOf(selected), 1)], "free", blockFont + 0.5, "primary");

  const blocks = [...input.blockIds]
    .filter((id) => id !== selected)
    .map((id) => {
      const p = at(id);
      return p && p.r >= MIN_BLOCK_RADIUS_PX ? request(id, nameOf(id), p.layerR) : null;
    });
  run(blocks, "inside", blockFont, "primary");

  const neighbours = namedDistricts
    .filter((id) => id !== context.districtId)
    .map((id) => request(id, nameOf(id), at(id)?.layerR ?? 0));
  run(neighbours, "inside", Math.max(9, districtFontSize(size.width) - 1.5), "quiet");

  return { labels, hidden };
}
