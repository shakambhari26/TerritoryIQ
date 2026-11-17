/**
 * A team change as a sales-operations desk records it: WHAT happened (someone joined, left, moved area or changed role),
 * WHO, WHERE, WHY (one or more reasons from a fixed list a TMT-bar sales team actually meets), WHEN it takes effect and
 * WHO is recording it. Shared by the browser (the "Make a team change" wizard) and the server (which checks and applies
 * it). No data, no names.
 */

export type ChangeKind = "join" | "exit" | "move" | "role";
export type ChangeRole = "ASM" | "PRIMARY" | "SECONDARY" | "DSO";
export const CHANGE_ROLES: readonly ChangeRole[] = ["ASM", "PRIMARY", "SECONDARY", "DSO"];

/** What happens to the places someone stops covering. */
export type Cover = "vacant" | "handover" | "none";

export interface TeamChangeRequest {
  kind: ChangeKind;
  /** The person: a new name (join) or someone already in the team. */
  name: string;
  /** join: their role. exit: ignored (they leave every role). move/role: the role concerned. */
  role: ChangeRole;
  /** role: the new role. */
  newRole: ChangeRole | null;
  /** join/move: places (block ids) they start covering. */
  addPlaces: string[];
  /** move: places they stop covering. exit: ignored (all of them). */
  dropPlaces: string[];
  /** exit/move: what happens to the places they stop covering. */
  cover: Cover;
  /** cover = handover: who takes them over (someone already in the team). */
  handoverTo: string | null;
  /** Reason ids from REASONS[kind]; at least one. */
  reasons: string[];
  note: string;
  /** YYYY-MM-DD */
  effectiveDate: string;
  /** Who is recording the change. */
  by: string;
  /** true: check it and show what it would change, save nothing. */
  dryRun: boolean;
}

export interface Reason {
  id: string;
  label: string;
}

export const KIND_INFO: Record<ChangeKind, { title: string; short: string; help: string; verb: string }> = {
  join: { title: "New joiner", short: "Joined", help: "A new hire, a replacement, a transfer in, or someone missing from the sheet.", verb: "joined" },
  exit: { title: "Someone left", short: "Left", help: "Resigned, let go, transferred out, or listed by mistake. Their places can stay open for hiring or be handed over.", verb: "left" },
  move: { title: "Change area", short: "Area changed", help: "Give someone new places, take places away, or move them to another territory.", verb: "changed area" },
  role: { title: "Change role", short: "Role changed", help: "Promotion, new designation, acting charge or a wrong role in the sheet.", verb: "changed role" },
};

/** Reasons, per kind, in the order a sales manager would look for them. "other" always needs a note. */
export const REASONS: Record<ChangeKind, Reason[]> = {
  join: [
    { id: "new_hire", label: "New hire" },
    { id: "replacement", label: "Replacement for someone who left" },
    { id: "vacancy", label: "Filling a vacant post" },
    { id: "transfer_in", label: "Transferred in from another territory or state" },
    { id: "rejoin", label: "Rejoined the company" },
    { id: "expansion", label: "Market expansion: new dealers or distributors" },
    { id: "launch", label: "New product or brand launch support" },
    { id: "season", label: "Construction-season demand (temporary)" },
    { id: "missing", label: "Was missing from the sheet (correction)" },
    { id: "other", label: "Other reason" },
  ],
  exit: [
    { id: "resigned", label: "Resigned" },
    { id: "competitor", label: "Joined a competitor brand" },
    { id: "performance", label: "Let go: targets or performance" },
    { id: "conduct", label: "Let go: conduct, credit or compliance issue" },
    { id: "absconding", label: "Not reporting / absconding" },
    { id: "transfer_out", label: "Transferred out of West Bengal" },
    { id: "non_field", label: "Moved to a non-field role" },
    { id: "contract", label: "Contract or probation ended" },
    { id: "retired", label: "Retired" },
    { id: "leave", label: "Long leave (medical, maternity)" },
    { id: "personal", label: "Health or personal reasons" },
    { id: "mistake", label: "Listed by mistake (correction)" },
    { id: "duplicate", label: "Duplicate entry" },
    { id: "other", label: "Other reason" },
  ],
  move: [
    { id: "realignment", label: "Territory realignment" },
    { id: "workload", label: "Workload balancing (too many or too few places)" },
    { id: "relocation", label: "Relocated: new base town or residence" },
    { id: "network", label: "Dealer or distributor network change" },
    { id: "new_market", label: "Opening a new market" },
    { id: "cover", label: "Covering a vacant area (temporary)" },
    { id: "performance", label: "Performance-based reassignment" },
    { id: "travel", label: "Shorter travel / better route" },
    { id: "competition", label: "Competitor pressure in the area" },
    { id: "request", label: "Employee's own request" },
    { id: "mistake", label: "Wrong places in the sheet (correction)" },
    { id: "other", label: "Other reason" },
  ],
  role: [
    { id: "promotion", label: "Promotion" },
    { id: "redesignation", label: "New designation" },
    { id: "acting", label: "Acting or temporary charge" },
    { id: "lower", label: "Moved to a lower role" },
    { id: "restructure", label: "Team restructuring" },
    { id: "mistake", label: "Wrong role in the sheet (correction)" },
    { id: "other", label: "Other reason" },
  ],
};

export const reasonLabel = (kind: ChangeKind, id: string) => REASONS[kind].find((r) => r.id === id)?.label ?? id;

/** What is kept with the saved version, so everyone can see why a change was made. */
export interface ChangeRecord {
  kind: ChangeKind;
  reasons: string[];
  note?: string;
  effectiveDate: string;
}

const oneLine = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const isRole = (v: unknown): v is ChangeRole => typeof v === "string" && (CHANGE_ROLES as readonly string[]).includes(v);
const placeIds = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length <= 200 && v.every((x) => typeof x === "string" && /^G[BU]-[0-9]{1,9}$/.test(x)) ? [...new Set(v as string[])] : null;

const KEYS = "addPlaces,by,cover,dropPlaces,dryRun,effectiveDate,handoverTo,kind,name,newRole,note,reasons,role";

/** Shape check of a request from the browser. Returns the clean request, or a message saying what is missing. */
export function parseTeamChange(value: unknown, today = new Date()): TeamChangeRequest | string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "The change could not be read.";
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== KEYS) return "The change could not be read.";
  if (v.kind !== "join" && v.kind !== "exit" && v.kind !== "move" && v.kind !== "role") return "Choose what happened.";
  const kind = v.kind;
  const name = oneLine(v.name, 80);
  if (name.length < 2) return "Write or choose the person's name.";
  if (!isRole(v.role)) return "Choose a role.";
  const newRole = v.newRole === null ? null : isRole(v.newRole) ? v.newRole : undefined;
  if (newRole === undefined) return "Choose a role.";
  const addPlaces = placeIds(v.addPlaces);
  const dropPlaces = placeIds(v.dropPlaces);
  if (!addPlaces || !dropPlaces) return "The places could not be read.";
  if (v.cover !== "vacant" && v.cover !== "handover" && v.cover !== "none") return "Say what happens to the places they leave.";
  const handoverTo = v.handoverTo === null ? null : oneLine(v.handoverTo, 80) || null;
  if (!Array.isArray(v.reasons) || !v.reasons.every((r) => typeof r === "string")) return "Choose at least one reason.";
  const known = new Set(REASONS[kind].map((r) => r.id));
  const reasons = [...new Set(v.reasons as string[])].filter((r) => known.has(r));
  if (!reasons.length || reasons.length !== new Set(v.reasons as string[]).size) return "Choose at least one reason from the list.";
  const note = oneLine(v.note, 500);
  if (reasons.includes("other") && note.length < 3) return "Write a short note for “Other reason”.";
  if (typeof v.effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.effectiveDate) || Number.isNaN(Date.parse(`${v.effectiveDate}T00:00:00Z`))) return "Choose the date it takes effect.";
  const days = (Date.parse(`${v.effectiveDate}T00:00:00Z`) - today.getTime()) / 86_400_000;
  if (days < -366 || days > 366) return "The date must be within a year of today.";
  const by = oneLine(v.by, 60);
  if (by.length < 2) return "Write your name, so everyone knows who recorded this.";
  if (typeof v.dryRun !== "boolean") return "The change could not be read.";

  if (kind === "join" && !addPlaces.length) return "Choose at least one place they will cover.";
  if (kind === "move" && !addPlaces.length && !dropPlaces.length) return "Choose places to add or to take away.";
  if (kind === "role" && (!newRole || newRole === v.role)) return "Choose the new role (different from the current one).";
  if (v.cover === "handover" && (!handoverTo || handoverTo.toLowerCase() === name.toLowerCase())) return "Choose who takes over their places.";

  return { kind, name, role: v.role, newRole, addPlaces, dropPlaces, cover: v.cover, handoverTo: v.cover === "handover" ? handoverTo : null, reasons, note, effectiveDate: v.effectiveDate, by, dryRun: v.dryRun };
}
