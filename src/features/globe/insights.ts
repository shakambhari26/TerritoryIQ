/**
 * The numbers the Globe's insights panel shows, derived from the same model as the Territory Overview.
 *
 * `buildGlobeInsights` runs on the server over the Overview's own `OverviewData` (row structure with opaque person
 * keys, never a name) and hands the page only counts, keyed by the feature IDs the globe already uses. It does not
 * change a calculation: every figure is read from `buildModel`, so the Globe agrees with the Overview. The figures are the
 * workbook as loaded; the reviewer's local changes (kept only in the browser) are applied on the Overview and the
 * Workspace, and the panel says so.
 *
 * Four things are kept apart, as everywhere else in the app:
 *   workbook rows          the company's own rows, by allocation state
 *   reference blocks       the Local Government Directory blocks, by allocation state, and which have a provisional outline
 *   staff slots            named slots and Vacant markers, counted per slot and never mixed into the geography
 *   provisional links      the globe's colours (types.ts); they are not an allocation state
 *
 * Pure: no I/O, so the tests run it on synthetic data.
 */

import { buildModel, emptyStateCounts, type StateCounts } from "../territory/model.ts";
import { overviewModelInput, type OverviewData } from "../territory/overview-data.ts";
import type { AllocationState } from "../territory/types.ts";

export interface StaffSlotCounts {
  named: number;
  vacant: number;
}

export interface DistrictInsight {
  /** Reference blocks of this district, by allocation state. */
  blocks: { total: number; byState: StateCounts };
  /** Workbook rows whose link reaches this district or one of its blocks, by allocation state. Rows with no link are in no district. */
  rows: { linked: number; byState: StateCounts };
  staff: StaffSlotCounts;
}

export interface BlockInsight {
  state: AllocationState;
  /** Slots of the rows linked to this block. */
  staff: StaffSlotCounts;
}

export interface GlobeInsights {
  state: {
    rows: { total: number; byState: StateCounts };
    blocks: { total: number; byState: StateCounts };
    staff: StaffSlotCounts;
    salesTerritories: number;
  };
  districts: Record<string, DistrictInsight>;
  blocks: Record<string, BlockInsight>;
}

const copy = (counts: StateCounts): StateCounts => ({ ...counts });

export function buildGlobeInsights(data: OverviewData): GlobeInsights {
  const model = buildModel(overviewModelInput(data));
  const { summary } = model;

  const districts: Record<string, DistrictInsight> = {};
  for (const [id, rollup] of model.districtRollup) {
    districts[id] = {
      blocks: { total: rollup.blocks, byState: copy(rollup.byState) },
      rows: { linked: 0, byState: emptyStateCounts() },
      staff: { named: 0, vacant: 0 },
    };
  }

  const blocks: Record<string, BlockInsight> = {};
  for (const [id, allocation] of model.featureAllocation) {
    const staff = { named: 0, vacant: 0 };
    for (const unitId of allocation.claimants) {
      const unit = model.unitAllocation.get(unitId);
      if (!unit) continue;
      staff.named += unit.namedSlots;
      staff.vacant += unit.vacantSlots;
    }
    blocks[id] = { state: allocation.state, staff };
  }

  // A row belongs to a district through its link: to the district itself, or to one of its blocks.
  for (const unit of model.dataset.units) {
    const featureId = model.links.get(unit.id)?.featureId;
    const feature = featureId ? model.featureById.get(featureId) : undefined;
    if (!feature) continue;
    const districtId = feature.kind === "district" ? feature.id : feature.districtId;
    const district = districtId ? districts[districtId] : undefined;
    const allocation = model.unitAllocation.get(unit.id);
    if (!district || !allocation) continue;
    district.rows.linked++;
    district.rows.byState[allocation.state]++;
    district.staff.named += allocation.namedSlots;
    district.staff.vacant += allocation.vacantSlots;
  }

  return {
    state: {
      rows: { total: summary.units.total, byState: copy(summary.units.byState) },
      blocks: { total: summary.blocks.total, byState: copy(summary.blocks.byState) },
      staff: { named: summary.staffing.namedSlots, vacant: summary.staffing.vacantSlots },
      salesTerritories: data.territories.length,
    },
    districts,
    blocks,
  };
}
