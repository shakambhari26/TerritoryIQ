/**
 * Geographic data quality of an official block: how well the company's workbook
 * rows are tied to it. This is a different question from the allocation state
 * (who covers the block), and the two are never merged. A block can have named
 * staff and a doubtful link, or a solid link and nobody listed.
 *
 *   reviewed     one row, and a named reviewer confirmed which unit it means
 *   provisional  one row, linked by exact name alone and not reviewed
 *   contested    two or more rows claim it, or an ambiguous label could mean it
 *   variant      no row is linked; only spelling or numbering variants resemble it
 *   unlisted     no workbook row mentions it at all
 *
 * Whether an outline exists is separate again (`shapeIds`): a block can be any
 * of these with or without a drawn boundary.
 */

import type { TerritoryModel } from "./model.ts";

export type GeoQuality = "reviewed" | "provisional" | "contested" | "variant" | "unlisted";

export const GEO_QUALITIES: readonly GeoQuality[] = ["reviewed", "provisional", "contested", "variant", "unlisted"];

export const GEO_QUALITY_LABEL: Readonly<Record<GeoQuality, string>> = {
  reviewed: "Reviewed link",
  provisional: "Provisional name link",
  contested: "Contested or ambiguous",
  variant: "Spelling variant only",
  unlisted: "No workbook row",
};

export const GEO_QUALITY_MEANING: Readonly<Record<GeoQuality, string>> = {
  reviewed: "One workbook row is tied to this block and a named reviewer confirmed the link.",
  provisional: "One workbook row has exactly this block's name. The link rests on the name alone and has not been reviewed.",
  contested: "More than one workbook row claims this block, or an ambiguous label could mean it. No row is chosen over another.",
  variant: "No row is linked. Only a spelling or numbering variant of the name appears in the workbook, so nothing is assumed.",
  unlisted: "No workbook row mentions this block. Its allocation is not known; that is not the same as unallocated.",
};

type Source = Pick<TerritoryModel, "featureAllocation" | "links">;

export function blockQuality(model: Source, featureId: string): GeoQuality {
  const allocation = model.featureAllocation.get(featureId);
  if (!allocation) return "unlisted";
  const distinct = new Set([...allocation.claimants, ...allocation.contestedBy]);
  if (distinct.size >= 2 || allocation.contestedBy.length > 0) return "contested";
  if (allocation.claimants.length === 1) {
    return model.links.get(allocation.claimants[0])?.status === "reviewed" ? "reviewed" : "provisional";
  }
  return allocation.possibleRows.length > 0 ? "variant" : "unlisted";
}

export type QualityCounts = Record<GeoQuality, number>;

export const emptyQualityCounts = (): QualityCounts => ({ reviewed: 0, provisional: 0, contested: 0, variant: 0, unlisted: 0 });

/** Counts for the blocks of one district, by official parent (the LGD district code). */
export function districtQuality(
  model: Source & Pick<TerritoryModel, "dataset">,
  districtId: string,
  hasOutline: (featureId: string) => boolean,
): { counts: QualityCounts; blocks: number; outlined: number; withoutOutline: string[] } {
  const counts = emptyQualityCounts();
  const withoutOutline: string[] = [];
  let blocks = 0;
  for (const feature of model.dataset.features) {
    if (feature.kind !== "block" || feature.districtId !== districtId) continue;
    blocks++;
    counts[blockQuality(model, feature.id)]++;
    if (!hasOutline(feature.id)) withoutOutline.push(feature.id);
  }
  return { counts, blocks, outlined: blocks - withoutOutline.length, withoutOutline };
}
