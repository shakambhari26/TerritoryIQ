import "server-only";
import { addPerson, applyRoster, diffRosters, removePerson, rosterOf, ROLES, type Roster } from "./roster/roster.server";
import { importSheet } from "./roster/sheet-import.server";
import { ROLE_NAME } from "./staffing";
import { baseTeam, currentTeam, reloadTeam } from "./team-data.server";
import { teamStore } from "./team-store.server";
import type { TeamChange, UploadPreview, VersionMeta } from "./team-types";

/**
 * Changing the team: preview and apply an uploaded sheet, add or remove one person, list the saved versions, restore
 * one. Every change is saved as a new version (team-store.server.ts) and shows everywhere at once (reloadTeam).
 * Inputs are validated here; the routes only parse the request.
 */

export const MAX_SHEET_BYTES = 5_000_000;

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
const fail = <T>(status: number, error: string): Result<T> => ({ ok: false, status, error });

async function prepareUpload(base64: string): Promise<Result<{ preview: UploadPreview; roster: Roster }>> {
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) return fail(400, "The file could not be read.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > MAX_SHEET_BYTES) return fail(413, "The file is too large (5 MB at most).");
  const team = await currentTeam();
  if (!team) return fail(503, "The globe data has not been built.");
  const result = importSheet(bytes, team.server);
  if (!result.ok) return fail(400, result.error);
  const after = applyRoster(team.server, result.roster);
  return {
    ok: true,
    data: {
      roster: result.roster,
      preview: {
        report: result.report,
        changes: diffRosters(team.server, rosterOf(team.server), result.roster),
        before: { people: team.server.meta.sheet?.staff ?? 0, places: team.server.blocks.filter((b) => b.staff > 0).length },
        after: { people: after.meta.sheet?.staff ?? 0, placesWithPeople: after.blocks.filter((b) => b.staff > 0).length },
      },
    },
  };
}

export async function previewUpload(base64: string): Promise<Result<UploadPreview>> {
  const prepared = await prepareUpload(base64);
  return prepared.ok ? { ok: true, data: prepared.data.preview } : prepared;
}

export async function applyUpload(base64: string): Promise<Result<VersionMeta>> {
  const prepared = await prepareUpload(base64);
  if (!prepared.ok) return prepared;
  const { changes, report } = prepared.data.preview;
  const added = changes.reduce((n, c) => n + c.added.length, 0);
  const removed = changes.reduce((n, c) => n + c.removed.length, 0);
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const summary = `Uploaded a new sheet: ${n(report.placed, "row", "rows")} placed; ${n(added, "person", "people")} added and ${removed} removed across ${n(changes.length, "place", "places")}${report.unplaced.length ? `; ${n(report.unplaced.length, "row", "rows")} not placed` : ""}.`;
  const version = await teamStore().save("upload", summary, prepared.data.roster);
  await reloadTeam();
  return { ok: true, data: version };
}

export function parseChange(value: unknown): TeamChange | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== "action,blockId,name,role") return null;
  if (v.action !== "add" && v.action !== "remove") return null;
  if (typeof v.blockId !== "string" || !/^G[BU]-[0-9]{1,9}$/.test(v.blockId)) return null;
  if (typeof v.role !== "string" || !(ROLES as readonly string[]).includes(v.role)) return null;
  if (typeof v.name !== "string" || v.name.trim().length < 2 || v.name.length > 80) return null;
  return { action: v.action, blockId: v.blockId, role: v.role as TeamChange["role"], name: v.name };
}

export async function editTeam(change: TeamChange): Promise<Result<VersionMeta>> {
  const team = await currentTeam();
  if (!team) return fail(503, "The globe data has not been built.");
  const block = team.server.blocks.find((b) => b.id === change.blockId);
  if (!block) return fail(404, "No such place.");
  const district = team.server.districts.find((d) => d.id === block.districtId)?.name ?? "";
  const roster = rosterOf(team.server);
  const next = change.action === "add" ? addPerson(roster, change.blockId, change.role, change.name) : removePerson(roster, change.blockId, change.role, change.name);
  if (typeof next === "string") return fail(400, next);
  const name = change.action === "add" ? (next[change.blockId].flatMap((r) => r.people).filter((p) => p.role === change.role).at(-1)?.name ?? change.name) : change.name.trim();
  const summary = change.action === "add" ? `Added ${name} as ${ROLE_NAME[change.role]} in ${block.name} (${district}).` : `Removed ${name} (${ROLE_NAME[change.role]}) from ${block.name} (${district}).`;
  const version = await teamStore().save(change.action, summary, next);
  await reloadTeam();
  return { ok: true, data: version };
}

export async function teamHistory(): Promise<Result<{ versions: VersionMeta[]; currentId: number }>> {
  const team = await currentTeam();
  const versions = await teamStore().history(30);
  return { ok: true, data: { versions, currentId: team?.versionId ?? 0 } };
}

/** Restores a saved version, or (versionId 0) the team as built from the original area-mapping sheet. */
export async function restoreVersion(versionId: number): Promise<Result<VersionMeta>> {
  if (!Number.isInteger(versionId) || versionId < 0) return fail(400, "Unknown version.");
  let roster: Roster | null;
  let what: string;
  if (versionId === 0) {
    roster = (await baseTeam())?.roster ?? null;
    what = "the original area-mapping sheet";
  } else {
    roster = await teamStore().roster(versionId);
    what = `version ${versionId}`;
  }
  if (!roster) return fail(404, "Unknown version.");
  const version = await teamStore().save("restore", `Restored ${what}.`, roster);
  await reloadTeam();
  return { ok: true, data: version };
}
