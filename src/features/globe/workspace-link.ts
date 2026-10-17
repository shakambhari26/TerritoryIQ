/**
 * The link from a place on the globe to the same place in the 2D Territory Workspace. Pure.
 *
 * The workspace keeps its selection in the URL hash (`#feature=<official unit ID>` or `#unit=<workbook row ID>`, see
 * features/territory/selection.ts) and derives the map's geographic level from it, so a hash is all the hand-off
 * needs: no shared store, and nothing is written to the URL while the globe is used. IDs are never built from names.
 * A district or block ID is used only if the validated overlay lists it, and a row ID only if it is a record the
 * overlay links to a block; anything else gives null and the caller shows no link.
 *
 *   state               /workspace                  (the map starts at the state overview)
 *   district            /workspace#feature=GD-…     (district level)
 *   block               /workspace#feature=GB-…     (block level, inside its district)
 *   workbook row        /workspace#unit=TU-…        (the row itself; the map opens at its block)
 */

import { selectionToHash } from "../territory/selection.ts";
import type { GlobeManifest, Level, ManifestBlock, ManifestDistrict } from "./types.ts";

export const WORKSPACE_PATH = "/workspace";

export type WorkspaceTarget = { kind: "state" } | { kind: "district"; id: string } | { kind: "block"; id: string } | { kind: "row"; id: string };

/** What is needed to check an ID: the validated district and block records, rows included. */
export type WorkspaceLookup = Pick<GlobeManifest, "districts" | "blocks">;

const isId = (id: unknown): id is string => typeof id === "string" && id.length > 0;

/** The workspace URL for a target, or null when the target names a unit the validated records do not list. */
export function workspaceHref(lookup: WorkspaceLookup, target: WorkspaceTarget): string | null {
  switch (target.kind) {
    case "state":
      return WORKSPACE_PATH;
    case "district":
      return isId(target.id) && lookup.districts.some((d) => d.id === target.id) ? `${WORKSPACE_PATH}${selectionToHash({ kind: "feature", id: target.id })}` : null;
    case "block":
      return isId(target.id) && lookup.blocks.some((b) => b.id === target.id) ? `${WORKSPACE_PATH}${selectionToHash({ kind: "feature", id: target.id })}` : null;
    case "row":
      return isId(target.id) && lookup.blocks.some((b) => b.records.some((r) => r.unitId === target.id)) ? `${WORKSPACE_PATH}${selectionToHash({ kind: "unit", id: target.id })}` : null;
    default:
      return null;
  }
}

/** The target for what the globe's details panel is showing, or null at the whole-globe level (nothing is selected). */
export function targetForSelection(level: Level, district: Pick<ManifestDistrict, "id"> | null, block: Pick<ManifestBlock, "id"> | null): WorkspaceTarget | null {
  if (level === "state") return { kind: "state" };
  if (level === "district" && district) return { kind: "district", id: district.id };
  if (level === "block" && block) return { kind: "block", id: block.id };
  return null;
}
