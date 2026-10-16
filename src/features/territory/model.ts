/**
 * Builds the derived view of the dataset: effective units (workbook plus local
 * changes), links, allocation states and the summary counts the dashboard and
 * map show. One pure function, used identically on the server and in the
 * browser so every screen agrees.
 */

import {
  applyChanges,
  type Change,
  type EffectiveUnit,
  type ValidationContext,
} from "../allocation/overlay.ts";
import {
  effectiveLink,
  featureAllocation,
  unitAllocation,
  type CoverageDepth,
  type EffectiveLink,
  type EffectiveLinkStatus,
  type FeatureAllocation,
  type UnitAllocation,
} from "./state.ts";
import {
  ALLOCATION_STATES,
  type AllocationState,
  type CrosswalkEntry,
  type GeoFeature,
  type SalesTerritory,
  type TerritoryDataset,
  type TerritoryUnit,
} from "./types.ts";

export type StateCounts = Record<AllocationState, number>;

export const emptyStateCounts = (): StateCounts =>
  Object.fromEntries(ALLOCATION_STATES.map((s) => [s, 0])) as StateCounts;

export interface TerritorySummaryRow {
  territoryId: string;
  label: string;
  units: number;
  byState: StateCounts;
  /** Rows whose linked official unit has a boundary on the map. */
  withBoundary: number;
}

export interface Summary {
  units: { total: number; byState: StateCounts; coverage: Record<CoverageDepth, number> };
  blocks: { total: number; byState: StateCounts; withBoundary: number; withoutBoundary: number };
  districts: { total: number; withBoundary: number };
  links: { byStatus: Record<EffectiveLinkStatus, number>; rowsWithBoundary: number; rowsWithoutBoundary: number };
  staffing: { namedSlots: number; vacantSlots: number; distinctNames: number };
  byTerritory: TerritorySummaryRow[];
}

export interface DistrictRollup {
  blocks: number;
  byState: StateCounts;
  withBoundary: number;
}

export interface TerritoryModel {
  dataset: TerritoryDataset;
  unitById: ReadonlyMap<string, TerritoryUnit>;
  featureById: ReadonlyMap<string, GeoFeature>;
  territoryById: ReadonlyMap<string, SalesTerritory>;
  crosswalkByUnit: ReadonlyMap<string, CrosswalkEntry>;
  effective: ReadonlyMap<string, EffectiveUnit>;
  links: ReadonlyMap<string, EffectiveLink>;
  unitAllocation: ReadonlyMap<string, UnitAllocation>;
  /** Official blocks only. */
  featureAllocation: ReadonlyMap<string, FeatureAllocation>;
  districtRollup: ReadonlyMap<string, DistrictRollup>;
  /** Rows linked to each official unit (provisional or reviewed). */
  claimants: ReadonlyMap<string, readonly string[]>;
  /** What a change must satisfy to be accepted (used by the forms). */
  validation: ValidationContext;
  rejectedChanges: number;
  summary: Summary;
}

const push = (map: Map<string, string[]>, key: string, value: string) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

export function buildModel(dataset: TerritoryDataset, changes: readonly Change[] = []): TerritoryModel {
  const unitById = new Map(dataset.units.map((u) => [u.id, u]));
  const featureById = new Map(dataset.features.map((f) => [f.id, f]));
  const territoryById = new Map(dataset.salesTerritories.map((t) => [t.id, t]));
  const crosswalkByUnit = new Map(dataset.crosswalk.map((c) => [c.unitId, c]));

  const context: ValidationContext = { unitIds: new Set(unitById.keys()), crosswalk: crosswalkByUnit };
  const { effective, rejected } = applyChanges(dataset.units, changes, context);

  // Effective links, then who claims, contests or only resembles each official unit.
  const links = new Map<string, EffectiveLink>();
  const claimantMap = new Map<string, string[]>();
  const contestedMap = new Map<string, string[]>();
  const possibleMap = new Map<string, string[]>();
  for (const unit of dataset.units) {
    const entry = crosswalkByUnit.get(unit.id)!;
    const link = effectiveLink(entry, effective.get(unit.id)!.review);
    links.set(unit.id, link);
    if (link.featureId) push(claimantMap, link.featureId, unit.id);
    else if (link.status === "ambiguous") {
      for (const c of entry.candidates) if (c.tier === "T1" || c.tier === "T2") push(contestedMap, c.featureId, unit.id);
    } else if (link.status === "weak") {
      for (const c of entry.candidates) push(possibleMap, c.featureId, unit.id);
    }
  }

  const unitStates = new Map<string, UnitAllocation>();
  for (const unit of dataset.units) {
    const link = links.get(unit.id)!;
    const others = link.featureId ? (claimantMap.get(link.featureId) ?? []).filter((id) => id !== unit.id) : [];
    unitStates.set(unit.id, unitAllocation(effective.get(unit.id)!, others, link.featureId));
  }

  const featureStates = new Map<string, FeatureAllocation>();
  for (const feature of dataset.features) {
    if (feature.kind !== "block") continue;
    featureStates.set(
      feature.id,
      featureAllocation(
        claimantMap.get(feature.id) ?? [],
        contestedMap.get(feature.id) ?? [],
        possibleMap.get(feature.id) ?? [],
        unitStates,
      ),
    );
  }

  const districtRollup = new Map<string, DistrictRollup>();
  for (const feature of dataset.features) {
    if (feature.kind !== "district") continue;
    districtRollup.set(feature.id, { blocks: 0, byState: emptyStateCounts(), withBoundary: 0 });
  }
  for (const feature of dataset.features) {
    if (feature.kind !== "block" || !feature.districtId) continue;
    const rollup = districtRollup.get(feature.districtId);
    if (!rollup) continue;
    rollup.blocks++;
    rollup.byState[featureStates.get(feature.id)!.state]++;
    if (feature.boundary) rollup.withBoundary++;
  }

  const hasBoundary = (featureId: string | null) => (featureId ? Boolean(featureById.get(featureId)?.boundary) : false);

  // Summary counts.
  const unitCounts = emptyStateCounts();
  const coverage: Record<CoverageDepth, number> = { full: 0, partial: 0, "asm-only": 0, none: 0 };
  const linkStatus: Record<EffectiveLinkStatus, number> = {
    reviewed: 0,
    provisional: 0,
    ambiguous: 0,
    weak: 0,
    none: 0,
    excluded: 0,
  };
  const names = new Set<string>();
  let namedSlots = 0;
  let vacantSlots = 0;
  let rowsWithBoundary = 0;
  const byTerritory = new Map<string, TerritorySummaryRow>(
    dataset.salesTerritories.map((t) => [
      t.id,
      { territoryId: t.id, label: t.label, units: 0, byState: emptyStateCounts(), withBoundary: 0 },
    ]),
  );
  for (const unit of dataset.units) {
    const allocation = unitStates.get(unit.id)!;
    const link = links.get(unit.id)!;
    unitCounts[allocation.state]++;
    coverage[allocation.coverage]++;
    linkStatus[link.status]++;
    namedSlots += allocation.namedSlots;
    vacantSlots += allocation.vacantSlots;
    for (const slot of effective.get(unit.id)!.slots) {
      if (slot.status === "named") for (const n of slot.names) names.add(n.replace(/\s+/g, " ").toLowerCase());
    }
    const drawn = hasBoundary(link.featureId);
    if (drawn) rowsWithBoundary++;
    const row = byTerritory.get(unit.salesTerritoryId)!;
    row.units++;
    row.byState[allocation.state]++;
    if (drawn) row.withBoundary++;
  }

  const blockCounts = emptyStateCounts();
  let blocksWithBoundary = 0;
  let blockTotal = 0;
  for (const feature of dataset.features) {
    if (feature.kind !== "block") continue;
    blockTotal++;
    blockCounts[featureStates.get(feature.id)!.state]++;
    if (feature.boundary) blocksWithBoundary++;
  }
  const districts = dataset.features.filter((f) => f.kind === "district");

  return {
    dataset,
    unitById,
    featureById,
    territoryById,
    crosswalkByUnit,
    effective,
    links,
    unitAllocation: unitStates,
    featureAllocation: featureStates,
    districtRollup,
    claimants: claimantMap,
    validation: context,
    rejectedChanges: rejected.length,
    summary: {
      units: { total: dataset.units.length, byState: unitCounts, coverage },
      blocks: {
        total: blockTotal,
        byState: blockCounts,
        withBoundary: blocksWithBoundary,
        withoutBoundary: blockTotal - blocksWithBoundary,
      },
      districts: { total: districts.length, withBoundary: districts.filter((d) => d.boundary).length },
      links: { byStatus: linkStatus, rowsWithBoundary, rowsWithoutBoundary: dataset.units.length - rowsWithBoundary },
      staffing: { namedSlots, vacantSlots, distinctNames: names.size },
      byTerritory: [...byTerritory.values()],
    },
  };
}
