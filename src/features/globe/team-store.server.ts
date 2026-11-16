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

import type { VersionKind, VersionMeta } from "./team-types";

export type { VersionKind, VersionMeta };

/** The table; TERRITORYIQ_TEAM_TABLE overrides it (for a self-test against a scratch table). Lower-case letters and _ only. */
const TABLE = /^[a-z_]{3,60}$/.test(process.env.TERRITORYIQ_TEAM_TABLE ?? "") ? process.env.TERRITORYIQ_TEAM_TABLE! : "territoryiq_team_versions";

interface Store {
  latest(): Promise<VersionMeta | null>;
  roster(id: number): Promise<Roster | null>;
  history(limit: number): Promise<VersionMeta[]>;
  save(kind: VersionKind, summary: string, roster: Roster): Promise<VersionMeta>;
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
    })().catch((error) => {
      ready = null;
      throw error;
    }));
  const meta = (row: { id: string | number; created_at: Date; kind: VersionKind; summary: string }): VersionMeta => ({
    id: Number(row.id),
    createdAt: new Date(row.created_at).toISOString(),
    kind: row.kind,
    summary: row.summary,
  });
  return {
    async latest() {
      await ensure();
      const rows = await sql<Array<{ id: string; created_at: Date; kind: VersionKind; summary: string }>>`select id, created_at, kind, summary from ${sql(TABLE)} order by id desc limit 1`;
      return rows[0] ? meta(rows[0]) : null;
    },
    async roster(id) {
      await ensure();
      const rows = await sql<Array<{ roster: Roster }>>`select roster from ${sql(TABLE)} where id = ${id}`;
      return rows[0]?.roster ?? null;
    },
    async history(limit) {
      await ensure();
      const rows = await sql<Array<{ id: string; created_at: Date; kind: VersionKind; summary: string }>>`select id, created_at, kind, summary from ${sql(TABLE)} order by id desc limit ${limit}`;
      return rows.map(meta);
    },
    async save(kind, summary, roster) {
      await ensure();
      const rows = await sql<Array<{ id: string; created_at: Date; kind: VersionKind; summary: string }>>`insert into ${sql(TABLE)} (kind, summary, roster) values (${kind}, ${summary}, ${sql.json(roster as never)}) returning id, created_at, kind, summary`;
      return meta(rows[0]);
    },
  };
}

// ---------------------------------------------------------------- local file --
interface FileVersion extends VersionMeta {
  roster: Roster;
}
function fileStore(file: string): Store {
  const load = async (): Promise<FileVersion[]> => {
    try {
      return JSON.parse(await readFile(file, "utf8")) as FileVersion[];
    } catch {
      return [];
    }
  };
  const strip = ({ roster: _roster, ...rest }: FileVersion): VersionMeta => (void _roster, rest);
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
    async save(kind, summary, roster) {
      const all = await load();
      const version: FileVersion = { id: (all.at(-1)?.id ?? 0) + 1, createdAt: new Date().toISOString(), kind, summary, roster };
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
