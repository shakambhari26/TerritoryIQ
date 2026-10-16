/**
 * The map's geographic level and what moves between levels. Pure functions, no
 * React, so the rules are tested directly.
 *
 *   state     West Bengal: the 23 district outlines and their names
 *   district  one district chosen: its blocks are drawn and can be selected
 *   block     one official block chosen, inside its district
 *
 * The level is derived from the selection, and the selection lives in the URL
 * hash, so the level is shared and restored with it. Going down a level is a
 * selection (click a district, then a block). Zooming is not: wheel and button
 * zoom only scale the view. A row that is not linked to an official block
 * (ambiguous, spelling variant only, no candidate) gives no district, and the
 * map stays at state level for it rather than guessing one from a name.
 *
 * The parent of a block is the district code the Local Government Directory
 * prints for it (`GeoFeature.districtId`), an explicit identifier. It is never
 * derived from a sales-territory label or a name.
 */

import { selectionForFeature } from "./selection.ts";
import type { TerritoryModel } from "./model.ts";
import type { Selection } from "./types.ts";

export type MapLevel = "state" | "district" | "block";

export const STATE_NAME = "West Bengal";

export const LEVEL_LABEL: Readonly<Record<MapLevel, string>> = {
  state: "State overview",
  district: "District view",
  block: "Block view",
};

export interface MapContext {
  level: MapLevel;
  /** The district the map is focused on; null at state level. */
  districtId: string | null;
  /** The selected official block at block level; otherwise null. */
  blockId: string | null;
}

export const STATE_CONTEXT: MapContext = { level: "state", districtId: null, blockId: null };

export type Lookup = Pick<TerritoryModel, "featureById" | "links" | "unitById" | "territoryById" | "claimants" | "featureAllocation">;

/** The map level a selection implies. */
export function mapContext(model: Pick<Lookup, "featureById" | "links">, selection: Selection): MapContext {
  if (!selection) return STATE_CONTEXT;
  let featureId: string | null = null;
  if (selection.kind === "feature") featureId = selection.id;
  else if (selection.kind === "unit") featureId = model.links.get(selection.id)?.featureId ?? null;
  if (!featureId) return STATE_CONTEXT;
  const feature = model.featureById.get(featureId);
  if (!feature) return STATE_CONTEXT;
  if (feature.kind === "district") return { level: "district", districtId: feature.id, blockId: null };
  // A block whose parent district is unknown cannot be placed in a district, so it is not.
  if (!feature.districtId || !model.featureById.has(feature.districtId)) return STATE_CONTEXT;
  return { level: "block", districtId: feature.districtId, blockId: feature.id };
}

export interface Crumb {
  key: string;
  label: string;
  level: MapLevel;
  /** What to select to go there. */
  selection: Selection;
  current: boolean;
}

/** West Bengal, then the district, then the block, each one a way back up. */
export function breadcrumbs(model: Pick<Lookup, "featureById">, context: MapContext): Crumb[] {
  const crumbs: Crumb[] = [
    { key: "state", label: STATE_NAME, level: "state", selection: null, current: context.level === "state" },
  ];
  if (context.districtId) {
    const district = model.featureById.get(context.districtId);
    if (district) {
      crumbs.push({
        key: district.id,
        label: district.name,
        level: "district",
        selection: { kind: "feature", id: district.id },
        current: context.level === "district",
      });
    }
  }
  if (context.blockId) {
    const block = model.featureById.get(context.blockId);
    if (block) {
      crumbs.push({
        key: block.id,
        label: block.name,
        level: "block",
        selection: { kind: "feature", id: block.id },
        current: true,
      });
    }
  }
  return crumbs;
}

/** What "back" selects: the district from a block, the whole state from a district. */
export function parentSelection(context: MapContext): Selection {
  if (context.level === "block" && context.districtId) return { kind: "feature", id: context.districtId };
  return null;
}

/**
 * Which block outlines are drawn.
 *
 * At district and block level, the blocks of the focused district. At state
 * level none, except that a layer other than plain boundaries shades every
 * block (drawn, but not clickable: a click at state level opens the district).
 * Whatever else is highlighted, such as a sales territory's blocks, is always
 * drawn so the selection stays visible.
 */
export function visibleBlockIds(
  model: Pick<Lookup, "featureById">,
  context: MapContext,
  blockShapeIds: Iterable<string>,
  highlighted: ReadonlySet<string>,
  shadeAll: boolean,
): Set<string> {
  const out = new Set<string>();
  for (const id of blockShapeIds) {
    const feature = model.featureById.get(id);
    if (!feature || feature.kind !== "block") continue;
    if (highlighted.has(id)) out.add(id);
    else if (context.districtId !== null && feature.districtId === context.districtId) out.add(id);
    else if (context.level === "state" && shadeAll) out.add(id);
  }
  return out;
}

/** Only the focused district's blocks can be clicked. */
export function isBlockInteractive(model: Pick<Lookup, "featureById">, context: MapContext, blockId: string): boolean {
  if (context.districtId === null) return false;
  return model.featureById.get(blockId)?.districtId === context.districtId;
}

export type MapAction =
  | { type: "none" }
  | { type: "select"; selection: Selection; /** Fit the map to the new selection (a change of geographic context). */ reveal: boolean };

/**
 * A click on an outline. A district always opens (selects and fits): that is the
 * drill-down. A block of the focused district is selected without moving the
 * view. A block outside the focus cannot be clicked; if one arrives anyway it
 * opens its district instead of being selected out of context.
 */
export function actionForFeatureClick(model: Lookup, context: MapContext, featureId: string): MapAction {
  const feature = model.featureById.get(featureId);
  if (!feature) return { type: "none" };
  if (feature.kind === "district") {
    if (context.districtId === feature.id) {
      // The focused district's own area: from a block, step back up; at district level nothing changes.
      return context.level === "block" ? { type: "select", selection: { kind: "feature", id: feature.id }, reveal: false } : { type: "none" };
    }
    return { type: "select", selection: { kind: "feature", id: feature.id }, reveal: true };
  }
  if (!isBlockInteractive(model, context, featureId)) {
    if (feature.districtId && model.featureById.has(feature.districtId)) {
      return { type: "select", selection: { kind: "feature", id: feature.districtId }, reveal: true };
    }
    return { type: "none" };
  }
  return { type: "select", selection: selectionForFeature(model, featureId), reveal: false };
}

/** A click on empty map: clears at state level, steps up from a block, does nothing inside a district. */
export function actionForBackgroundClick(context: MapContext, hasSelection: boolean): MapAction {
  if (context.level === "block") return { type: "select", selection: parentSelection(context), reveal: false };
  if (context.level === "state" && hasSelection) return { type: "select", selection: null, reveal: false };
  return { type: "none" };
}

/** Escape: one step up, fitting the map to where it lands. */
export function actionForEscape(context: MapContext, hasSelection: boolean): MapAction {
  if (context.level === "block") return { type: "select", selection: parentSelection(context), reveal: true };
  if (context.level === "district") return { type: "select", selection: null, reveal: true };
  return hasSelection ? { type: "select", selection: null, reveal: false } : { type: "none" };
}
