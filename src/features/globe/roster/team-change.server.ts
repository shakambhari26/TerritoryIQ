import type { ServerManifest, ServerRecord } from "../server-types.ts";
import { KIND_INFO, reasonLabel, type TeamChangeRequest } from "../team-change.ts";

/**
 * Applies one recorded team change (team-change.ts) to the roster: place id → that place's sheet rows. Pure: returns
 * the new roster and a one-line summary, or an error a person can act on. Nothing is guessed: a person must already be
 * in the team to leave, move or change role; a place must exist; a handover goes to someone already in the team.
 *
 *   join   adds them to each chosen place in their role, filling a vacant post of that role there first
 *   exit   removes them from every place and role; each post they held is left vacant (shown as a hiring need),
 *          handed over to the named colleague, or simply removed
 *   move   adds them to new places and takes them out of dropped ones (in the chosen role), with the same choice
 *   role   changes their role wherever they hold the old one
 */

type Roster = Record<string, ServerRecord[]>;

const key = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();
const tidy = (name: string) => {
  const clean = name.replace(/\s+/g, " ").trim();
  return clean === clean.toLowerCase() || clean === clean.toUpperCase()
    ? clean.toLowerCase().replace(/(^|[\s.\-'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    : clean;
};

const ROLE_WORD: Record<string, string> = { ASM: "Area Sales Manager", PRIMARY: "Primary Sales Officer", SECONDARY: "Secondary Sales Officer", DSO: "Distributor Sales Officer" };

/** Everyone in the team: name (as written), roles and places. */
export function teamDirectory(roster: Roster): Map<string, { name: string; roles: Set<string>; places: Set<string> }> {
  const people = new Map<string, { name: string; roles: Set<string>; places: Set<string> }>();
  for (const [blockId, rows] of Object.entries(roster)) {
    for (const row of rows) {
      for (const p of row.people) {
        if (!p.name || p.vacant) continue;
        const entry = people.get(key(p.name)) ?? { name: p.name.replace(/\s+/g, " ").trim(), roles: new Set<string>(), places: new Set<string>() };
        entry.roles.add(p.role);
        entry.places.add(blockId);
        people.set(key(p.name), entry);
      }
    }
  }
  return people;
}

function nextSlot(rows: ServerRecord[], role: string) {
  return rows.flatMap((r) => r.people).filter((p) => p.role === role).reduce((n, p) => Math.max(n, p.slot), 0) + 1;
}

/** Puts `name` into a place in `role`: into a vacant post of that role if there is one, else as a new post. */
function place(roster: Roster, blockId: string, role: string, name: string): "filled" | "added" | "already" {
  const rows = roster[blockId];
  if (rows.some((r) => r.people.some((p) => p.role === role && p.name && key(p.name) === key(name)))) return "already";
  for (const row of rows) {
    const vacant = row.people.find((p) => p.role === role && p.vacant);
    if (vacant) {
      vacant.name = name;
      vacant.vacant = false;
      return "filled";
    }
  }
  if (!rows.length) rows.push({ unitId: `TU-M-${blockId}`, blockLabel: "", territory: "Added in TerritoryIQ", people: [], namedPeople: 0 });
  rows[0].people.push({ role, slot: nextSlot(rows, role), name, vacant: false });
  return "added";
}

/** Takes `name` out of a place (only `role`, or every role when null). Returns the roles of the posts removed. */
function takeOut(roster: Roster, blockId: string, name: string, role: string | null): string[] {
  const removed: string[] = [];
  for (const row of roster[blockId] ?? []) {
    row.people = row.people.filter((p) => {
      const hit = !!p.name && !p.vacant && key(p.name) === key(name) && (role === null || p.role === role);
      if (hit) removed.push(p.role);
      return !hit;
    });
  }
  return removed;
}

function vacate(roster: Roster, blockId: string, role: string) {
  const rows = roster[blockId];
  if (!rows.length) rows.push({ unitId: `TU-M-${blockId}`, blockLabel: "", territory: "Added in TerritoryIQ", people: [], namedPeople: 0 });
  rows[0].people.push({ role, slot: nextSlot(rows, role), name: null, vacant: true });
}

export function applyTeamChange(
  base: Pick<ServerManifest, "blocks">,
  current: Roster,
  change: TeamChangeRequest,
): { ok: true; roster: Roster; summary: string } | { ok: false; error: string } {
  const roster: Roster = structuredClone(current);
  const blockName = new Map(base.blocks.map((b) => [b.id, b.name]));
  for (const id of [...change.addPlaces, ...change.dropPlaces]) {
    if (!blockName.has(id) || !roster[id]) return { ok: false, error: "One of the chosen places is not on the map." };
  }
  const team = teamDirectory(roster);
  const person = team.get(key(change.name));
  const handover = change.cover === "handover" && change.handoverTo ? team.get(key(change.handoverTo)) : undefined;
  if (change.cover === "handover" && !handover) return { ok: false, error: `${change.handoverTo ?? "That person"} is not in the team, so cannot take over.` };

  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const names = (ids: string[]) => ids.map((id) => blockName.get(id)).join(", ");
  let what: string;

  if (change.kind === "join") {
    if (person) return { ok: false, error: `${person.name} is already in the team. Use “Change area” or “Change role” instead.` };
    const name = tidy(change.name);
    let filled = 0;
    for (const id of change.addPlaces) if (place(roster, id, change.role, name) === "filled") filled += 1;
    what = `${name} joined as ${ROLE_WORD[change.role]} in ${names(change.addPlaces)}${filled ? ` (${n(filled, "vacant post", "vacant posts")} filled)` : ""}`;
  } else {
    if (!person) return { ok: false, error: `${change.name} is not in the team as it is now.` };
    const name = person.name;
    // Who covers a post someone stops holding.
    const leaveBehind = (id: string, role: string) => {
      if (change.cover === "vacant") vacate(roster, id, role);
      else if (change.cover === "handover" && handover) place(roster, id, role, handover.name);
    };
    const coverWords = change.cover === "vacant" ? "left vacant" : change.cover === "handover" && handover ? `handed over to ${handover.name}` : "removed";

    if (change.kind === "exit") {
      const places = [...person.places];
      for (const id of places) for (const role of takeOut(roster, id, name, null)) leaveBehind(id, role);
      what = `${name} left (${[...person.roles].map((r) => ROLE_WORD[r] ?? r).join(" & ")}); ${n(places.length, "place", "places")} ${coverWords}`;
    } else if (change.kind === "move") {
      if (!person.roles.has(change.role)) return { ok: false, error: `${name} is not a ${ROLE_WORD[change.role]} now.` };
      const notThere = change.dropPlaces.filter((id) => !takeOut(roster, id, name, change.role).length);
      if (notThere.length) return { ok: false, error: `${name} does not cover ${names(notThere)} as ${ROLE_WORD[change.role]}.` };
      for (const id of change.dropPlaces) leaveBehind(id, change.role);
      const added = change.addPlaces.filter((id) => place(roster, id, change.role, name) !== "already");
      if (!added.length && !change.dropPlaces.length) return { ok: false, error: `${name} already covers those places.` };
      what = `${name} (${ROLE_WORD[change.role]})${added.length ? ` now also covers ${names(added)}` : ""}${added.length && change.dropPlaces.length ? ";" : ""}${change.dropPlaces.length ? ` no longer covers ${names(change.dropPlaces)} (${coverWords})` : ""}`;
    } else {
      if (!change.newRole || !person.roles.has(change.role)) return { ok: false, error: `${name} is not a ${ROLE_WORD[change.role]} now.` };
      let count = 0;
      for (const id of person.places) {
        for (const row of roster[id]) {
          for (const p of row.people) {
            if (p.name && !p.vacant && key(p.name) === key(name) && p.role === change.role) {
              p.role = change.newRole;
              p.slot = nextSlot(roster[id], change.newRole);
              count += 1;
            }
          }
        }
      }
      what = `${name}: ${ROLE_WORD[change.role]} → ${ROLE_WORD[change.newRole]} in ${n(count, "place", "places")}`;
    }
  }

  const why = change.reasons.map((r) => reasonLabel(change.kind, r)).join(", ");
  const date = new Date(`${change.effectiveDate}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return { ok: true, roster, summary: `${KIND_INFO[change.kind].title}: ${what}. Why: ${why}. From ${date}.` };
}
