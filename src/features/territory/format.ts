/**
 * Plain-language wording for states, links and conflicts. Kept apart from the
 * components so the same sentences appear on every screen and can be tested.
 */

import type { Conflict, CoverageDepth, EffectiveLinkStatus } from "./state.ts";
import type { AllocationState, MatchTier, StaffRole } from "./types.ts";

export const STATE_MEANING: Readonly<Record<AllocationState, string>> = {
  allocated: "At least one named person is listed for this area.",
  confirmed_unallocated:
    "Someone recorded, with evidence, that nobody covers this area. This is never inferred from missing data.",
  missing:
    "Nothing usable is known: no one is listed, or no workbook row can be linked to this official unit. This is not the same as unallocated.",
  conflicting:
    "Records disagree and none has been chosen. Resolve it in the review form, or fix the source.",
};

export const COVERAGE_LABEL: Readonly<Record<CoverageDepth, string>> = {
  full: "Primary and secondary listed",
  partial: "Partly covered (primary, secondary or DSO, not both primary and secondary)",
  "asm-only": "ASM only",
  none: "No named person",
};

export const LINK_LABEL: Readonly<Record<EffectiveLinkStatus, string>> = {
  reviewed: "Reviewed link",
  provisional: "Provisional link",
  ambiguous: "Ambiguous label",
  weak: "Spelling variant only",
  none: "No candidate",
  excluded: "Excluded by reviewer",
};

export const LINK_MEANING: Readonly<Record<EffectiveLinkStatus, string>> = {
  reviewed: "A named reviewer confirmed which official unit this row refers to.",
  provisional:
    "Exactly one official block has this name. The link rests on the name alone and has not been reviewed.",
  ambiguous: "More than one official unit has this name. No boundary is assigned until a reviewer chooses.",
  weak: "No official unit has this exact name. Only spelling or numbering variants exist, so no boundary is assigned.",
  none: "No official block or district is a plausible match, so there is no boundary to show.",
  excluded: "A reviewer excluded this row from geography. It keeps its allocation data but has no boundary.",
};

export const TIER_LABEL: Readonly<Record<MatchTier, string>> = {
  T1: "exact name",
  T2: "same name, spacing or punctuation differs",
  T3: "partial or renumbered name",
  T4: "spelling variant",
};

export const ROLE_TITLE: Readonly<Record<StaffRole, string>> = {
  ASM: "ASM",
  PRIMARY: "Primary",
  SECONDARY: "Secondary",
  DSO: "DSO",
};

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
}

export function shortHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}

export function describeConflict(
  conflict: Conflict,
  labelOf: (unitId: string) => string,
  featureName: (featureId: string) => string,
): string {
  if (conflict.kind === "confirmation-with-staff") {
    return "A confirmed-unallocated record exists, but named staff are also listed for this row.";
  }
  const others = conflict.otherUnitIds.map(labelOf).join(", ");
  return `${featureName(conflict.featureId)} is also listed by ${others}. The double-counting rule is undecided, so neither listing is chosen.`;
}

/** Number formatting used on every screen (Indian digit grouping). */
export const formatCount = (n: number): string => n.toLocaleString("en-IN");
