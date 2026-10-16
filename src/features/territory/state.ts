/**
 * Allocation-state and geography-link rules. Pure functions, no I/O.
 *
 * The four states are kept distinct and missing data never turns into
 * "confirmed unallocated":
 *
 *   conflicting            two records disagree and neither is chosen
 *   confirmed_unallocated  an explicit stored confirmation exists (who, when, evidence)
 *   allocated              at least one named person is listed
 *   missing                nothing usable is known (the default)
 *
 * PROVISIONAL RULE (business definition pending, B-12 / B-28): "named person"
 * counts any role including the ASM. `coverage` shows how deep the cover is so
 * an ASM-only block is never presented as fully covered.
 */

import type { Confirmation, EffectiveUnit, ReviewRecord } from "../allocation/overlay.ts";
import {
  STAFF_ROLES,
  type AllocationState,
  type CrosswalkEntry,
  type LinkStatus,
  type StaffRole,
} from "./types.ts";

// ---------------------------------------------------------------- links ----

export type EffectiveLinkStatus = LinkStatus | "reviewed" | "excluded";

export interface EffectiveLink {
  status: EffectiveLinkStatus;
  /** The one official unit this row is linked to, or null. */
  featureId: string | null;
  /** A reviewer asked for more evidence; the link stays as it was. */
  held: boolean;
}

/**
 * The link as it currently stands. A reviewer's confirmation is the only way a
 * row that is ambiguous or weak gets a unit; an exclusion removes a link.
 */
export function effectiveLink(entry: CrosswalkEntry, review: ReviewRecord): EffectiveLink {
  if (review.status === "confirmed" && review.featureId) {
    return { status: "reviewed", featureId: review.featureId, held: false };
  }
  if (review.status === "excluded") {
    return { status: "excluded", featureId: null, held: false };
  }
  return { status: entry.status, featureId: entry.featureId, held: review.status === "held" };
}

// ------------------------------------------------------------ allocation ---

export type Conflict =
  /** Another row is linked to the same official unit. */
  | { kind: "shared-unit"; featureId: string; otherUnitIds: string[] }
  /** A confirmed-unallocated record exists although staff are listed. */
  | { kind: "confirmation-with-staff" };

export type CoverageDepth = "full" | "partial" | "asm-only" | "none";

export interface UnitAllocation {
  state: AllocationState;
  conflicts: Conflict[];
  namedSlots: number;
  vacantSlots: number;
  roleNamed: Record<StaffRole, number>;
  coverage: CoverageDepth;
  confirmation: Confirmation | null;
}

export function countRoles(effective: EffectiveUnit): { roleNamed: Record<StaffRole, number>; named: number; vacant: number } {
  const roleNamed = Object.fromEntries(STAFF_ROLES.map((r) => [r, 0])) as Record<StaffRole, number>;
  let named = 0;
  let vacant = 0;
  for (const slot of effective.slots) {
    if (slot.status === "named") {
      roleNamed[slot.role]++;
      named++;
    } else {
      vacant++;
    }
  }
  return { roleNamed, named, vacant };
}

function coverageOf(roleNamed: Record<StaffRole, number>): CoverageDepth {
  if (roleNamed.PRIMARY > 0 && roleNamed.SECONDARY > 0) return "full";
  if (roleNamed.PRIMARY > 0 || roleNamed.SECONDARY > 0 || roleNamed.DSO > 0) return "partial";
  if (roleNamed.ASM > 0) return "asm-only";
  return "none";
}

/**
 * @param otherClaimants other rows linked to the same official unit as this row.
 */
export function unitAllocation(
  effective: EffectiveUnit,
  otherClaimants: readonly string[],
  featureId: string | null,
): UnitAllocation {
  const { roleNamed, named, vacant } = countRoles(effective);
  const conflicts: Conflict[] = [];
  if (effective.confirmation && named > 0) conflicts.push({ kind: "confirmation-with-staff" });
  if (featureId && otherClaimants.length > 0) {
    conflicts.push({ kind: "shared-unit", featureId, otherUnitIds: [...otherClaimants] });
  }

  let state: AllocationState;
  if (conflicts.length > 0) state = "conflicting";
  else if (effective.confirmation) state = "confirmed_unallocated";
  else if (named > 0) state = "allocated";
  else state = "missing";

  return {
    state,
    conflicts,
    namedSlots: named,
    vacantSlots: vacant,
    roleNamed,
    coverage: coverageOf(roleNamed),
    confirmation: effective.confirmation,
  };
}

export interface FeatureAllocation {
  state: AllocationState;
  /** Rows with a justified link (provisional or reviewed) to this unit. */
  claimants: string[];
  /** Rows whose ambiguous label could mean this unit. Not a link. */
  contestedBy: string[];
  /** Rows that list this unit only as a spelling or numbering variant. Not a link. */
  possibleRows: string[];
}

/**
 * State of an official unit. One justified claimant gives that row's state.
 * Two or more rows that claim, or could claim, the unit conflict. A unit that
 * no row claims is missing / unverified: the workbook does not say.
 */
export function featureAllocation(
  claimants: readonly string[],
  contestedBy: readonly string[],
  possibleRows: readonly string[],
  unitStates: ReadonlyMap<string, UnitAllocation>,
): FeatureAllocation {
  const distinct = new Set([...claimants, ...contestedBy]);
  let state: AllocationState;
  if (distinct.size >= 2) state = "conflicting";
  else if (claimants.length === 1) state = unitStates.get(claimants[0])?.state ?? "missing";
  else state = "missing";
  return { state, claimants: [...claimants], contestedBy: [...contestedBy], possibleRows: [...possibleRows] };
}
