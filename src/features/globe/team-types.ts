/**
 * The shapes the team-management routes send and receive, shared by the server (team-admin.server.ts and friends) and
 * the browser (team-clients/, components/TeamManager.tsx). Types only: no data, no names.
 */

export type VersionKind = "upload" | "add" | "remove" | "restore";

export interface VersionMeta {
  id: number;
  createdAt: string;
  kind: VersionKind;
  summary: string;
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
  /** Rows placed by a close spelling or in another district: shown so a person can check them. */
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
