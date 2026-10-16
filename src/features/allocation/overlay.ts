/**
 * Local, append-only change log layered over the workbook data.
 *
 * The workbook-derived units are never modified. A change is a dated record
 * with a recorded-by value and a reason; the effective view of a unit is the
 * base unit with the changes replayed in order. Removing the log restores the
 * workbook exactly. A blank slot is never turned into a vacancy and a missing
 * record is never turned into "confirmed unallocated": only an explicit change
 * can do either.
 */

import {
  ROLE_CAPACITY,
  STAFF_ROLES,
  type CrosswalkEntry,
  type ReviewStatus,
  type StaffRole,
  type StaffSlot,
  type TerritoryUnit,
} from "../territory/types.ts";

export interface ReviewRecord {
  status: ReviewStatus;
  /** The official feature the reviewer confirmed; null unless `confirmed`. */
  featureId: string | null;
  reviewer?: string;
  note?: string;
  at?: string;
}

export interface Confirmation {
  confirmedBy: string;
  evidence: string;
  at: string;
}

interface ChangeBase {
  id: string;
  /** ISO 8601 timestamp. */
  at: string;
  /** Name or role of the person recording the change. Stored only in this browser. */
  recordedBy: string;
  unitId: string;
  /** Why the change was made. Required. */
  reason: string;
}

export type Change = ChangeBase &
  (
    | { kind: "set-slot"; role: StaffRole; slot: number; names: string[] }
    | { kind: "mark-slot-vacant"; role: StaffRole; slot: number }
    | { kind: "clear-slot"; role: StaffRole; slot: number }
    | { kind: "confirm-unallocated"; evidence: string }
    | { kind: "withdraw-confirmation" }
    | { kind: "review-link"; decision: ReviewStatus; featureId: string | null }
  );

export type ChangeKind = Change["kind"];

export interface EffectiveUnit {
  unit: TerritoryUnit;
  /** Non-blank slots after changes, ordered by role then slot. */
  slots: StaffSlot[];
  confirmation: Confirmation | null;
  review: ReviewRecord;
  changeCount: number;
}

const ROLE_ORDER = new Map(STAFF_ROLES.map((role, index) => [role, index]));

export function compareSlots(a: StaffSlot, b: StaffSlot): number {
  return (ROLE_ORDER.get(a.role)! - ROLE_ORDER.get(b.role)!) || a.slot - b.slot;
}

const MAX_NAME_LENGTH = 120;
const MAX_TEXT_LENGTH = 500;

export interface ValidationContext {
  unitIds: ReadonlySet<string>;
  crosswalk: ReadonlyMap<string, CrosswalkEntry>;
}

/** Problems with a change, in plain language. Empty means it can be applied. */
export function validateChange(change: Change, context: ValidationContext): string[] {
  const problems: string[] = [];
  const text = (value: unknown, label: string, max = MAX_TEXT_LENGTH) => {
    if (typeof value !== "string" || value.trim().length === 0) problems.push(`${label} is required.`);
    else if (value.length > max) problems.push(`${label} is too long (limit ${max} characters).`);
  };

  if (!context.unitIds.has(change.unitId)) problems.push("The unit does not exist.");
  text(change.recordedBy, "Recorded by", MAX_NAME_LENGTH);
  text(change.reason, "Reason");
  if (typeof change.at !== "string" || Number.isNaN(Date.parse(change.at))) problems.push("The timestamp is not valid.");

  const slotProblems = (role: unknown, slot: unknown) => {
    if (!STAFF_ROLES.includes(role as StaffRole)) {
      problems.push("The role is not recognised.");
      return;
    }
    const capacity = ROLE_CAPACITY[role as StaffRole];
    if (!Number.isInteger(slot) || (slot as number) < 1 || (slot as number) > capacity) {
      problems.push(`${role} has slots 1 to ${capacity}.`);
    }
  };

  switch (change.kind) {
    case "set-slot":
      slotProblems(change.role, change.slot);
      if (!Array.isArray(change.names) || change.names.length === 0) problems.push("At least one name is required.");
      else {
        if (change.names.length > (change.role === "ASM" ? 2 : 1)) problems.push("Too many names for this slot.");
        change.names.forEach((name) => text(name, "Name", MAX_NAME_LENGTH));
        if (change.names.some((name) => /^vacant$/i.test(name.trim()))) {
          problems.push('Use "Mark vacant" to record a vacancy, not a name.');
        }
      }
      break;
    case "mark-slot-vacant":
    case "clear-slot":
      slotProblems(change.role, change.slot);
      break;
    case "confirm-unallocated":
      text(change.evidence, "Evidence");
      break;
    case "withdraw-confirmation":
      break;
    case "review-link": {
      if (!["confirmed", "held", "excluded"].includes(change.decision)) problems.push("The review decision is not recognised.");
      const entry = context.crosswalk.get(change.unitId);
      if (change.decision === "confirmed") {
        if (!change.featureId) problems.push("Choose the official unit that the row refers to.");
        else if (entry && !entry.candidates.some((c) => c.featureId === change.featureId)) {
          problems.push("The chosen unit is not one of this row's candidates.");
        }
      } else if (change.featureId !== null) {
        problems.push("Only a confirmation names an official unit.");
      }
      break;
    }
    default:
      problems.push("The kind of change is not recognised.");
  }
  return problems;
}

const slotKey = (role: StaffRole, slot: number) => `${role}:${slot}`;

/**
 * Replays the changes over the units. Changes that fail validation are
 * skipped and returned, so a damaged log cannot corrupt the view.
 */
export function applyChanges(
  units: readonly TerritoryUnit[],
  changes: readonly Change[],
  context: ValidationContext,
): { effective: Map<string, EffectiveUnit>; rejected: Array<{ change: Change; problems: string[] }> } {
  const slotMaps = new Map<string, Map<string, StaffSlot>>();
  const effective = new Map<string, EffectiveUnit>();
  for (const unit of units) {
    slotMaps.set(unit.id, new Map(unit.slots.map((s) => [slotKey(s.role, s.slot), { ...s, names: [...s.names] }])));
    effective.set(unit.id, {
      unit,
      slots: [],
      confirmation: null,
      review: { status: "open", featureId: null },
      changeCount: 0,
    });
  }

  const rejected: Array<{ change: Change; problems: string[] }> = [];
  for (const change of changes) {
    const problems = validateChange(change, context);
    if (problems.length > 0) {
      rejected.push({ change, problems });
      continue;
    }
    const state = effective.get(change.unitId)!;
    const slots = slotMaps.get(change.unitId)!;
    state.changeCount++;
    switch (change.kind) {
      case "set-slot":
        slots.set(slotKey(change.role, change.slot), {
          role: change.role,
          slot: change.slot,
          status: "named",
          names: change.names.map((n) => n.trim().replace(/\s+/g, " ")),
        });
        break;
      case "mark-slot-vacant":
        slots.set(slotKey(change.role, change.slot), { role: change.role, slot: change.slot, status: "vacant", names: [] });
        break;
      case "clear-slot":
        slots.delete(slotKey(change.role, change.slot));
        break;
      case "confirm-unallocated":
        state.confirmation = { confirmedBy: change.recordedBy.trim(), evidence: change.evidence.trim(), at: change.at };
        break;
      case "withdraw-confirmation":
        state.confirmation = null;
        break;
      case "review-link":
        state.review = {
          status: change.decision,
          featureId: change.decision === "confirmed" ? change.featureId : null,
          reviewer: change.recordedBy.trim(),
          note: change.reason.trim(),
          at: change.at,
        };
        break;
    }
  }

  for (const [unitId, state] of effective) {
    state.slots = [...slotMaps.get(unitId)!.values()].sort(compareSlots);
  }
  return { effective, rejected };
}

// ---------------------------------------------------------------- storage --

export const OVERLAY_VERSION = 1;

export interface OverlayFile {
  version: typeof OVERLAY_VERSION;
  changes: Change[];
}

/** Parses stored or imported JSON. Anything malformed yields an empty log and a message. */
export function parseOverlay(text: string | null): { changes: Change[]; problem: string | null } {
  if (text === null || text.trim() === "") return { changes: [], problem: null };
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as OverlayFile).version !== OVERLAY_VERSION ||
      !Array.isArray((parsed as OverlayFile).changes)
    ) {
      return { changes: [], problem: "The saved changes use an unknown format and were ignored." };
    }
    const changes = (parsed as OverlayFile).changes.filter(
      (c): c is Change => typeof c === "object" && c !== null && typeof (c as Change).id === "string" && typeof (c as Change).kind === "string",
    );
    return { changes, problem: null };
  } catch {
    return { changes: [], problem: "The saved changes could not be read and were ignored." };
  }
}

export function serialiseOverlay(changes: readonly Change[]): string {
  const file: OverlayFile = { version: OVERLAY_VERSION, changes: [...changes] };
  return JSON.stringify(file);
}
