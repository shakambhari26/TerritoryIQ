/**
 * Selection is always by internal ID (`TU-…` row, `ST-…` sales territory,
 * `GB-…` / `GD-…` official unit). A name or label is never a key: labels repeat
 * and are spelled inconsistently. The selection can be kept in the URL hash so
 * a view can be shared or reloaded.
 */

import type { TerritoryModel } from "./model.ts";
import type { Selection } from "./types.ts";

/** The parts of the model needed to check that an ID exists. */
export type Lookup = Pick<TerritoryModel, "unitById" | "featureById" | "territoryById">;

const KINDS = { unit: "unit", feature: "feature", territory: "territory" } as const;

export function selectionToHash(selection: Selection): string {
  return selection ? `#${selection.kind}=${encodeURIComponent(selection.id)}` : "";
}

/**
 * Parses a hash such as `#unit=TU-012`. Returns null unless it names an ID that
 * exists in the model, so a stale or invented ID selects nothing.
 */
export function parseSelectionHash(hash: string, model: Lookup): Selection {
  const match = /^#(unit|feature|territory)=(.+)$/.exec(hash);
  if (!match) return null;
  const kind = KINDS[match[1] as keyof typeof KINDS];
  let id: string;
  try {
    id = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  const exists =
    kind === "unit" ? model.unitById.has(id) : kind === "feature" ? model.featureById.has(id) : model.territoryById.has(id);
  return exists ? { kind, id } : null;
}

export const sameSelection = (a: Selection, b: Selection): boolean =>
  a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);

/**
 * What a click on a block outline selects: the row when exactly one row is
 * linked to it, otherwise the official unit itself (so shared, contested and
 * unlisted blocks are shown as such rather than as one row).
 */
export function selectionForFeature(
  model: Pick<TerritoryModel, "claimants" | "featureById" | "featureAllocation">,
  featureId: string,
): Selection {
  const claimants = model.claimants.get(featureId) ?? [];
  const feature = model.featureById.get(featureId);
  if (feature?.kind === "block" && claimants.length === 1) {
    const allocation = model.featureAllocation.get(featureId);
    if (allocation && allocation.contestedBy.length === 0) return { kind: "unit", id: claimants[0] };
  }
  return { kind: "feature", id: featureId };
}
