import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyRoster, rosterOf, type Roster } from "./roster/roster.server";
import type { ServerManifest } from "./server-types";
import { teamStore, type VersionMeta } from "./team-store.server";

/**
 * The team as it is now: the globe data built from the area-mapping sheet, with the newest saved version of the team
 * list (team-store.server.ts) applied. Every server reader of people — the page, the team lookups, the assistant — goes
 * through here, so a change shows everywhere at once. The newest version's ID is looked up on every request; the
 * recomputed data is cached per version.
 */

/**
 * How long a version check is trusted. Next bundles pages and route handlers separately, each with its own copy of this
 * module, so a change saved through a route must be seen by the page on its very next render: check every time (one
 * tiny query: the newest version's ID). Concurrent requests share one check.
 */
const CHECK_EVERY_MS = 0;

let base: Promise<ServerManifest | null> | null = null;
const loadBase = () =>
  (base ??= readFile(path.join(process.cwd(), "data", "generated", "globe-overlay.json"), "utf8")
    .then((text) => JSON.parse(text) as ServerManifest)
    .catch(() => null));

let current: { versionId: number; server: ServerManifest; version: VersionMeta | null } | null = null;
let checkedAt = 0;
let inflight: Promise<void> | null = null;

async function refresh(force: boolean): Promise<void> {
  const b = await loadBase();
  if (!b) return;
  let version: VersionMeta | null = null;
  try {
    version = await teamStore().latest();
  } catch (error) {
    // The store is unreachable: keep what is already shown (or the base data), and say so in the server log.
    console.error("TerritoryIQ team store unavailable:", error instanceof Error ? error.message : error);
    if (current) return;
  }
  const versionId = version?.id ?? 0;
  if (!force && current && current.versionId === versionId) return;
  let roster: Roster | null = null;
  if (version) {
    try {
      roster = await teamStore().roster(version.id);
    } catch {
      roster = null;
    }
  }
  current = { versionId, server: roster ? applyRoster(b, roster) : b, version: roster ? version : null };
  checkedAt = Date.now();
}

/** The team as it is now, or null when the globe data has not been built. */
export async function currentTeam(): Promise<{ server: ServerManifest; version: VersionMeta | null; versionId: number } | null> {
  if (!current || Date.now() - checkedAt >= CHECK_EVERY_MS) {
    inflight ??= refresh(false).finally(() => (inflight = null));
    await inflight;
    checkedAt = Date.now();
  }
  return current;
}

/** After a change is saved: show it at once instead of waiting for the next check. */
export async function reloadTeam(): Promise<void> {
  await refresh(true);
}

/** The base data (built from the area-mapping sheet), and its roster: what "restore the original sheet" goes back to. */
export async function baseTeam(): Promise<{ server: ServerManifest; roster: Roster } | null> {
  const b = await loadBase();
  return b ? { server: b, roster: rosterOf(b) } : null;
}

export function teamDataAvailable(): Promise<boolean> {
  return loadBase().then((b) => b !== null);
}
