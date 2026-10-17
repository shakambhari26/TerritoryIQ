/**
 * The district navigator's rows: every district in the reference list, A to Z, with how many of its blocks have a drawn
 * outline and how those blocks are allocated. Pure, so the counts are tested against the model's own roll-up and the list
 * can never disagree with the map or the details panel.
 */

import type { StateCounts, TerritoryModel } from "./model.ts";

export interface DistrictRow {
  id: string;
  name: string;
  /** Blocks the reference list holds for this district. */
  blocks: number;
  /** Blocks with a provisional outline. */
  outlined: number;
  /** Allocation state of those blocks, as the map colours them. */
  byState: StateCounts;
  /** Whether the district itself has a drawn outline (a district without one cannot be shown on the map). */
  drawn: boolean;
}

export function districtRows(model: Pick<TerritoryModel, "dataset" | "districtRollup">): DistrictRow[] {
  const rows: DistrictRow[] = [];
  for (const feature of model.dataset.features) {
    if (feature.kind !== "district") continue;
    const rollup = model.districtRollup.get(feature.id);
    if (!rollup) continue;
    rows.push({
      id: feature.id,
      name: feature.name,
      blocks: rollup.blocks,
      outlined: rollup.withBoundary,
      byState: rollup.byState,
      drawn: Boolean(feature.boundary),
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** What a row says in words, for its accessible name and tooltip. */
export function districtRowSummary(row: DistrictRow): string {
  if (row.blocks === 0) return `${row.name}: no blocks in the reference list`;
  return `${row.name}: ${row.outlined} of ${row.blocks} ${row.blocks === 1 ? "block" : "blocks"} outlined`;
}
