/**
 * The shapes the team-management routes send and receive, shared by the server (team-admin.server.ts and friends) and
 * the browser (team-clients/, components/TeamManager.tsx). Types only: no data, no names.
 */

import type { ChangeRecord } from "./team-change";
import type { DataSource } from "./types";

export type VersionKind = "upload" | "add" | "remove" | "restore" | "change";

export interface VersionMeta {
  id: number;
  createdAt: string;
  kind: VersionKind;
  summary: string;
  /** Who saved it, as they typed their name when uploading (absent for older versions and single edits). */
  by?: string;
  /** The uploaded file's name (uploads only). */
  fileName?: string;
  /** For a recorded team change: what kind, why (reason ids), a note and the date it takes effect. */
  reason?: ChangeRecord;
}

/** Someone in the team, for the change wizard's person picker. */
export interface TeamPerson {
  name: string;
  roles: string[];
  places: PlaceRef[];
  /** Place id → the roles they hold there. */
  rolesAt: Record<string, string[]>;
}

/** What a recorded team change would do (dry run) or did (saved). */
export interface ChangeOutcome {
  summary: string;
  changes: PeopleChanges;
  version: VersionMeta | null;
}

/** A place a person works in, for the "what changed" list (and to fly the map there). */
export interface PlaceRef {
  blockId: string;
  place: string;
  district: string;
}

/**
 * What one saved version changed, person by person: who joined, who left, whose role changed and who now covers
 * different places. A person is the same person when their name is the same (the sheet import already tidies spelling).
 */
export interface PeopleChanges {
  joined: Array<{ name: string; roles: string[]; places: PlaceRef[] }>;
  left: Array<{ name: string; roles: string[]; places: PlaceRef[] }>;
  roleChanged: Array<{ name: string; from: string[]; to: string[]; places: PlaceRef[] }>;
  moved: Array<{ name: string; roles: string[]; added: PlaceRef[]; removed: PlaceRef[] }>;
  vacancies: { before: number; after: number };
}

/** The newest saved version and what it changed, for the "Team updated" popup. id 0 = nothing saved yet. */
export interface LatestUpdate {
  version: VersionMeta | null;
  changes: PeopleChanges | null;
  /** Where each layer's data comes from: the "Data sources" card. */
  sources: DataSource[];
}

export type TeamRole = "ASM" | "PRIMARY" | "SECONDARY" | "DSO";

export interface TeamChange {
  action: "add" | "remove";
  blockId: string;
  role: TeamRole;
  name: string;
}

export interface PlaceChange {
  blockId: string;
  place: string;
  district: string;
  added: Array<{ role: string; name: string }>;
  removed: Array<{ role: string; name: string }>;
}

export interface ImportReport {
  rows: number;
  placed: number;
  outside: Array<{ row: number; territory: string; label: string; note: string }>;
  unplaced: Array<{ row: number; territory: string; label: string; reason: string }>;
  /** Rows placed by a close spelling inside their own district: shown so a person can check them. */
  guessed: Array<{ row: number; label: string; place: string; district: string; how: string }>;
  corrections: Array<{ from: string; to: string }>;
}

export interface UploadPreview {
  report: ImportReport;
  changes: PlaceChange[];
  before: { people: number; places: number };
  after: { people: number; placesWithPeople: number };
}

export interface TeamHistory {
  versions: VersionMeta[];
  /** The version in force; 0 = the team as built from the original sheet. */
  currentId: number;
}
