import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import type { Roster } from "./roster/roster.server";

/**
 * Saved versions of the team list. Every change (an uploaded sheet, a person added or removed, a restore) is a NEW
 * version; nothing is overwritten, so any earlier version can be restored. The newest version is the one in force; with
 * no version saved, the team is the one built from the area-mapping sheet.
 *
 *   DATABASE_URL set   Postgres (the project's Supabase database): table territoryiq_team_versions, created on first
 *                      use, with row-level security on so Supabase's public API cannot read it.
 *   otherwise          a local file, data/local/team-versions.json (never uploaded: see .railwayignore).
 */

import type { ChangeRecord } from "./team-change";
import type { PeopleChanges, VersionKind, VersionMeta } from "./team-types";

export type { VersionKind, VersionMeta };

/** Extra facts kept with a version: who saved it, the file, and what it changed person by person. All optional. */
export interface VersionExtra {
  by?: string;
  fileName?: string;
  changes?: PeopleChanges;
  reason?: ChangeRecord;
}

/** The table; TERRITORYIQ_TEAM_TABLE overrides it (for a self-test against a scratch table). Lower-case letters and _ only. */
const TABLE = /^[a-z_]{3,60}$/.test(process.env.TERRITORYIQ_TEAM_TABLE ?? "") ? process.env.TERRITORYIQ_TEAM_TABLE! : "territoryiq_team_versions";

interface Store {
  latest(): Promise<VersionMeta | null>;
  roster(id: number): Promise<Roster | null>;
  history(limit: number): Promise<VersionMeta[]>;
  save(kind: VersionKind, summary: string, roster: Roster, extra?: VersionExtra): Promise<VersionMeta>;
  /** What a version changed, person by person (null for versions saved before this was recorded). */
  changes(id: number): Promise<PeopleChanges | null>;
}

// ------------------------------------------------------------------ Postgres --
function postgresStore(url: string): Store {
  const sql = postgres(url, { ssl: "require", max: 3, idle_timeout: 20, connect_timeout: 15, prepare: false });
  let ready: Promise<void> | null = null;
  const ensure = () =>
    (ready ??= (async () => {
      await sql.unsafe(`create table if not exists public.${TABLE} (
        id bigserial primary key,
        created_at timestamptz not null default now(),
        kind text not null check (kind in ('upload', 'add', 'remove', 'restore')),
        summary text not null,
        roster jsonb not null
      )`);
      await sql.unsafe(`alter table public.${TABLE} enable row level security`);
      // Added later; older rows simply have none.
      await sql.unsafe(`alter table public.${TABLE} add column if not exists saved_by text, add column if not exists file_name text, add column if not exists changes jsonb, add column if not exists reason jsonb`);
      // The first version of the table allowed four kinds only; the app checks the kind itself.
      await sql.unsafe(`alter table public.${TABLE} drop constraint if exists ${TABLE}_kind_check`);
    })().catch((error) => {
      ready = null;
      throw error;
    }));
  type Row = { id: string | number; created_at: Date; kind: VersionKind; summary: string; saved_by: string | null; file_name: string | null; reason: ChangeRecord | null };
  const meta = (row: Row): VersionMeta => ({
    id: Number(row.id),
    createdAt: new Date(row.created_at).toISOString(),
    kind: row.kind,
    summary: row.summary,
    ...(row.saved_by ? { by: row.saved_by } : {}),
    ...(row.file_name ? { fileName: row.file_name } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
  });
  return {
    async latest() {
      await ensure();
      const rows = await sql<Row[]>`select id, created_at, kind, summary, saved_by, file_name, reason from ${sql(TABLE)} order by id desc limit 1`;
      return rows[0] ? meta(rows[0]) : null;
    },
    async roster(id) {
      await ensure();
      const rows = await sql<Array<{ roster: Roster }>>`select roster from ${sql(TABLE)} where id = ${id}`;
      return rows[0]?.roster ?? null;
    },
    async history(limit) {
      await ensure();
      const rows = await sql<Row[]>`select id, created_at, kind, summary, saved_by, file_name, reason from ${sql(TABLE)} order by id desc limit ${limit}`;
      return rows.map(meta);
    },
    async save(kind, summary, roster, extra = {}) {
      await ensure();
      const rows = await sql<Row[]>`insert into ${sql(TABLE)} (kind, summary, roster, saved_by, file_name, changes, reason)
        values (${kind}, ${summary}, ${sql.json(roster as never)}, ${extra.by ?? null}, ${extra.fileName ?? null}, ${extra.changes ? sql.json(extra.changes as never) : null}, ${extra.reason ? sql.json(extra.reason as never) : null})
        returning id, created_at, kind, summary, saved_by, file_name, reason`;
      return meta(rows[0]);
    },
    async changes(id) {
      await ensure();
      const rows = await sql<Array<{ changes: PeopleChanges | null }>>`select changes from ${sql(TABLE)} where id = ${id}`;
      return rows[0]?.changes ?? null;
    },
  };
}

// ---------------------------------------------------------------- local file --
interface FileVersion extends VersionMeta {
  roster: Roster;
  changes?: PeopleChanges;
}
function fileStore(file: string): Store {
  const load = async (): Promise<FileVersion[]> => {
    try {
      return JSON.parse(await readFile(file, "utf8")) as FileVersion[];
    } catch {
      return [];
    }
  };
  const strip = ({ roster: _roster, changes: _changes, ...rest }: FileVersion): VersionMeta => (void _roster, void _changes, rest);
  return {
    async latest() {
      const all = await load();
      return all.length ? strip(all[all.length - 1]) : null;
    },
    async roster(id) {
      return (await load()).find((v) => v.id === id)?.roster ?? null;
    },
    async history(limit) {
      return (await load()).slice(-limit).reverse().map(strip);
    },
    async changes(id) {
      return (await load()).find((v) => v.id === id)?.changes ?? null;
    },
    async save(kind, summary, roster, extra = {}) {
      const all = await load();
      const version: FileVersion = {
        id: (all.at(-1)?.id ?? 0) + 1,
        createdAt: new Date().toISOString(),
        kind,
        summary,
        ...(extra.by ? { by: extra.by } : {}),
        ...(extra.fileName ? { fileName: extra.fileName } : {}),
        ...(extra.reason ? { reason: extra.reason } : {}),
        roster,
        ...(extra.changes ? { changes: extra.changes } : {}),
      };
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify([...all, version]));
      return strip(version);
    },
  };
}

let store: Store | null = null;
export function teamStore(): Store {
  if (!store) {
    const url = process.env.DATABASE_URL?.trim();
    store = url ? postgresStore(url) : fileStore(path.join(process.cwd(), "data", "local", "team-versions.json"));
  }
  return store;
}

export const storageKind = () => (process.env.DATABASE_URL?.trim() ? "database" : "local file");
