import "server-only";
import { peopleChanges } from "./roster/people-diff.server";
import { applyTeamChange, teamDirectory } from "./roster/team-change.server";
import { parseTeamChange } from "./team-change";
import { addPerson, applyRoster, diffRosters, removePerson, rosterOf, ROLES, type Roster } from "./roster/roster.server";
import { importSheet } from "./roster/sheet-import.server";
import { ROLE_NAME } from "./staffing";
import { baseTeam, currentTeam, reloadTeam } from "./team-data.server";
import { dataSources } from "./sources.server";
import { teamStore } from "./team-store.server";
import type { ChangeOutcome, LatestUpdate, PlaceRef, TeamChange, TeamPerson, UploadPreview, VersionMeta } from "./team-types";

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

/** An upload as the browser sends it: the file, its name, and the name of the person uploading. */
export interface UploadRequest {
  file: string;
  fileName: string;
  by: string;
}

/** Plain text, one line, at most `max` characters; "" when nothing usable is left. */
const oneLine = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

export function parseUpload(value: unknown): UploadRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== "by,file,fileName") return null;
  if (typeof v.file !== "string" || !v.file) return null;
  const by = oneLine(v.by, 60);
  const fileName = oneLine(v.fileName, 120);
  if (by.length < 2 || !/\.xlsx$/i.test(fileName)) return null;
  return { file: v.file, fileName, by };
}

export async function applyUpload({ file: base64, fileName, by }: UploadRequest): Promise<Result<VersionMeta>> {
  const prepared = await prepareUpload(base64);
  if (!prepared.ok) return prepared;
  const team = await currentTeam();
  const people = team ? peopleChanges(team.server, rosterOf(team.server), prepared.data.roster) : undefined;
  const { changes, report } = prepared.data.preview;
  const added = changes.reduce((n, c) => n + c.added.length, 0);
  const removed = changes.reduce((n, c) => n + c.removed.length, 0);
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const summary = `Uploaded a new sheet: ${n(report.placed, "row", "rows")} placed; ${n(added, "person", "people")} added and ${removed} removed across ${n(changes.length, "place", "places")}${report.unplaced.length ? `; ${n(report.unplaced.length, "row", "rows")} not placed` : ""}.`;
  const version = await teamStore().save("upload", summary, prepared.data.roster, { by, fileName, changes: people });
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
  const version = await teamStore().save(change.action, summary, next, { changes: peopleChanges(team.server, roster, next) });
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
  const team = await currentTeam();
  const changes = team ? peopleChanges(team.server, rosterOf(team.server), roster) : undefined;
  const version = await teamStore().save("restore", `Restored ${what}.`, roster, { changes });
  await reloadTeam();
  return { ok: true, data: version };
}

/** The newest saved version and what it changed: what the "Team updated" popup shows. */
export async function latestUpdate(): Promise<Result<LatestUpdate>> {
  try {
    const version = await teamStore().latest();
    const changes = version ? await teamStore().changes(version.id) : null;
    const team = await currentTeam();
    const sources = team ? await dataSources(team.server, version) : [];
    return { ok: true, data: { version, changes, sources } };
  } catch {
    return fail(503, "The saved team versions could not be read just now.");
  }
}

/** Everyone in the team now, with roles and places: for the change wizard's person picker. Signed-in only. */
export async function teamPeople(): Promise<Result<{ people: TeamPerson[] }>> {
  const team = await currentTeam();
  if (!team) return fail(503, "The globe data has not been built.");
  const districtName = new Map(team.server.districts.map((d) => [d.id, d.name]));
  const blocks = new Map(team.server.blocks.map((b) => [b.id, b]));
  const ref = (id: string): PlaceRef => ({ blockId: id, place: blocks.get(id)?.name ?? id, district: districtName.get(blocks.get(id)?.districtId ?? "") ?? "" });
  const order = ["ASM", "PRIMARY", "SECONDARY", "DSO"];
  const roster = rosterOf(team.server);
  const rolesAt = new Map<string, Record<string, string[]>>();
  for (const [blockId, rows] of Object.entries(roster)) {
    for (const p of rows.flatMap((r) => r.people)) {
      if (!p.name || p.vacant) continue;
      const k = p.name.replace(/\s+/g, " ").trim().toLowerCase();
      const at = rolesAt.get(k) ?? {};
      at[blockId] = [...new Set([...(at[blockId] ?? []), p.role])];
      rolesAt.set(k, at);
    }
  }
  const people = [...teamDirectory(roster).values()]
    .map((p) => ({
      name: p.name,
      rolesAt: rolesAt.get(p.name.toLowerCase()) ?? {},
      roles: [...p.roles].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
      places: [...p.places].map(ref).sort((a, b) => a.district.localeCompare(b.district) || a.place.localeCompare(b.place)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, data: { people } };
}

/**
 * A team change recorded through the wizard: checked, applied to the team as it is now, and (unless it is a dry run)
 * saved as a new version with who recorded it, why, and from when. Shows everywhere at once.
 */
export async function recordTeamChange(value: unknown): Promise<Result<ChangeOutcome>> {
  const change = parseTeamChange(value);
  if (typeof change === "string") return fail(400, change);
  const team = await currentTeam();
  if (!team) return fail(503, "The globe data has not been built.");
  const before = rosterOf(team.server);
  const applied = applyTeamChange(team.server, before, change);
  if (!applied.ok) return fail(400, applied.error);
  const changes = peopleChanges(team.server, before, applied.roster);
  if (change.dryRun) return { ok: true, data: { summary: applied.summary, changes, version: null } };
  const reason = { kind: change.kind, reasons: change.reasons, ...(change.note ? { note: change.note } : {}), effectiveDate: change.effectiveDate };
  const version = await teamStore().save("change", applied.summary, applied.roster, { by: change.by, changes, reason });
  await reloadTeam();
  return { ok: true, data: { summary: applied.summary, changes, version } };
}
