import "server-only";

/**
 * The team list ("roster"): for every place, its sheet rows with their people. The globe's base data (built from the
 * area-mapping sheet) carries one; later versions (an uploaded sheet, a person added or removed) replace it. Everything
 * the globe shows about people — headcounts, colours, charts, the chat's facts — is recomputed here from the roster in
 * force, so a change shows everywhere at once. Pure.
 */

import type { ServerManifest, ServerRecord } from "../server-types.ts";
import type { PlaceChange } from "../team-types.ts";

export type { PlaceChange };

/** Place (block) ID → its rows. */
export type Roster = Record<string, ServerRecord[]>;

export const ROLES = ["ASM", "PRIMARY", "SECONDARY", "DSO"] as const;
export type Role = (typeof ROLES)[number];

export function rosterOf(server: ServerManifest): Roster {
  return Object.fromEntries(server.blocks.map((b) => [b.id, b.records]));
}

const distinct = (rows: ServerRecord[], keep: (role: string) => boolean) =>
  new Set(rows.flatMap((r) => r.people.filter((p) => p.name && !p.vacant && keep(p.role)).map((p) => p.name!.toLowerCase())));

/** The base data with `roster` in force: rows, headcounts, states and every count derived from them. */
export function applyRoster(base: ServerManifest, roster: Roster): ServerManifest {
  const blocks = base.blocks.map((b) => {
    const records = (roster[b.id] ?? []).map((r) => ({ ...r, namedPeople: r.people.filter((p) => p.name && !p.vacant).length }));
    const staff = distinct(records, () => true).size;
    return {
      ...b,
      records,
      state: staff > 0 ? ("represented" as const) : ("unresolved" as const),
      staff,
      fieldStaff: distinct(records, (role) => role !== "ASM").size,
      roleCounts: {
        ASM: distinct(records, (role) => role === "ASM").size,
        PRIMARY: distinct(records, (role) => role === "PRIMARY").size,
        SECONDARY: distinct(records, (role) => role === "SECONDARY").size,
        DSO: distinct(records, (role) => role === "DSO").size,
      },
      vacancies: records.reduce((n, r) => n + r.people.filter((p) => p.vacant).length, 0),
    };
  });
  const districts = base.districts.map((d) => {
    const mine = blocks.filter((b) => b.districtId === d.id);
    const rows = mine.flatMap((b) => b.records);
    const represented = mine.filter((b) => b.state === "represented").length;
    return {
      ...d,
      state: represented > 0 ? ("represented" as const) : ("unresolved" as const),
      staff: distinct(rows, () => true).size,
      vacancies: rows.reduce((n, r) => n + r.people.filter((p) => p.vacant).length, 0),
      representedBlockCount: represented,
    };
  });
  // Field staff by how many places each covers (index = places, value = people).
  const places = new Map<string, number>();
  for (const b of blocks) for (const name of distinct(b.records, (role) => role !== "ASM")) places.set(name, (places.get(name) ?? 0) + 1);
  const spread: number[] = [];
  for (const n of places.values()) spread[n] = (spread[n] ?? 0) + 1;
  const allRows = blocks.flatMap((b) => b.records);
  const sheet = base.meta.sheet;
  return {
    ...base,
    blocks,
    districts,
    meta: {
      ...base.meta,
      counts: {
        ...base.meta.counts,
        districtsRepresented: districts.filter((d) => d.state === "represented").length,
        blocksRepresented: blocks.filter((b) => b.state === "represented").length,
        blocksRepresentedAndDrawn: blocks.filter((b) => b.state === "represented" && b.geometry).length,
        blocksUnresolved: blocks.filter((b) => b.state === "unresolved").length,
      },
      sheet: {
        rows: sheet?.rows ?? allRows.length,
        mappedRows: allRows.length,
        staff: distinct(allRows, () => true).size,
        spread: Array.from(spread, (v) => v ?? 0),
      },
    },
  };
}

/** Who is added to and removed from each place going from `before` to `after` (by role and name; vacancies ignored). */
export function diffRosters(base: ServerManifest, before: Roster, after: Roster): PlaceChange[] {
  const districtName = new Map(base.districts.map((d) => [d.id, d.name]));
  const people = (rows: ServerRecord[] | undefined) => new Map((rows ?? []).flatMap((r) => r.people.filter((p) => p.name && !p.vacant).map((p) => [`${p.role}|${p.name!.toLowerCase()}`, { role: p.role, name: p.name! }] as const)));
  const changes: PlaceChange[] = [];
  for (const b of base.blocks) {
    const was = people(before[b.id]);
    const now = people(after[b.id]);
    const added = [...now].filter(([k]) => !was.has(k)).map(([, v]) => v);
    const removed = [...was].filter(([k]) => !now.has(k)).map(([, v]) => v);
    if (added.length || removed.length) changes.push({ blockId: b.id, place: b.name, district: districtName.get(b.districtId ?? "") ?? "", added, removed });
  }
  return changes.sort((a, b) => a.district.localeCompare(b.district) || a.place.localeCompare(b.place));
}

/** Adds a person to a place (to its first row, or a new row if it has none). Returns the new roster, or an error. */
export function addPerson(roster: Roster, blockId: string, role: Role, name: string): Roster | string {
  const rows = roster[blockId];
  if (!rows) return "No such place.";
  let clean = name.replace(/\s+/g, " ").trim();
  // Written all in lower or upper case: give it the same Title Case as the names from the sheet.
  if (clean === clean.toLowerCase() || clean === clean.toUpperCase()) clean = clean.toLowerCase().replace(/(^|[\s.\-'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  if (clean.length < 2 || clean.length > 80) return "Write the person's full name (2 to 80 characters).";
  if (rows.some((r) => r.people.some((p) => p.role === role && p.name?.toLowerCase() === clean.toLowerCase()))) return `${clean} is already listed here in that role.`;
  const first: ServerRecord = rows[0] ?? { unitId: `TU-M-${blockId}`, blockLabel: "", territory: "Added in TerritoryIQ", people: [], namedPeople: 0 };
  const slot = first.people.filter((p) => p.role === role).reduce((n, p) => Math.max(n, p.slot), 0) + 1;
  const updated: ServerRecord = { ...first, people: [...first.people, { role, slot, name: clean, vacant: false }] };
  return { ...roster, [blockId]: [updated, ...rows.slice(1)] };
}

/** Removes a person (by role and name) from a place, in every row of it. Returns the new roster, or an error. */
export function removePerson(roster: Roster, blockId: string, role: Role, name: string): Roster | string {
  const rows = roster[blockId];
  if (!rows) return "No such place.";
  const key = name.replace(/\s+/g, " ").trim().toLowerCase();
  let found = false;
  const next = rows.map((r) => ({
    ...r,
    people: r.people.filter((p) => {
      const hit = p.role === role && p.name?.toLowerCase() === key;
      if (hit) found = true;
      return !hit;
    }),
  }));
  return found ? { ...roster, [blockId]: next } : `${name} is not listed here in that role.`;
}
