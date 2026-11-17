import type { ServerManifest, ServerRecord } from "../server-types.ts";
import type { PeopleChanges, PlaceRef } from "../team-types.ts";

/**
 * What a new version of the team changed, person by person (for the "Team updated" popup and the change history).
 * Pure: it compares two rosters (place id → that place's sheet rows) over the same base map, and adds nothing of its own.
 *
 *   joined        a name in the new team that was not in the old one
 *   left          a name in the old team that is not in the new one
 *   roleChanged   the same name with a different role (or set of roles)
 *   moved         the same name covering different places (places added and places dropped)
 *   vacancies     how many vacant posts the sheet lists, before and after
 */

type Roster = Record<string, ServerRecord[]>;

const key = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

interface Person {
  name: string;
  roles: Set<string>;
  places: Set<string>;
}

function peopleOf(roster: Roster): { people: Map<string, Person>; vacancies: number } {
  const people = new Map<string, Person>();
  let vacancies = 0;
  for (const [blockId, rows] of Object.entries(roster)) {
    for (const row of rows) {
      for (const p of row.people) {
        if (p.vacant || !p.name) {
          if (p.vacant) vacancies += 1;
          continue;
        }
        const k = key(p.name);
        const person = people.get(k) ?? { name: p.name.replace(/\s+/g, " ").trim(), roles: new Set<string>(), places: new Set<string>() };
        person.roles.add(p.role);
        person.places.add(blockId);
        people.set(k, person);
      }
    }
  }
  return { people, vacancies };
}

const ROLE_ORDER = ["ASM", "PRIMARY", "SECONDARY", "DSO"];
const sortedRoles = (roles: Set<string>) => [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b) || a.localeCompare(b));
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export function peopleChanges(base: Pick<ServerManifest, "blocks" | "districts">, before: Roster, after: Roster): PeopleChanges {
  const districtName = new Map(base.districts.map((d) => [d.id, d.name]));
  const blocks = new Map(base.blocks.map((b) => [b.id, b]));
  const ref = (blockId: string): PlaceRef => {
    const b = blocks.get(blockId);
    return { blockId, place: b?.name ?? blockId, district: districtName.get(b?.districtId ?? "") ?? "" };
  };
  const refs = (ids: Iterable<string>) => [...ids].map(ref).sort((a, b) => a.district.localeCompare(b.district) || a.place.localeCompare(b.place));

  const was = peopleOf(before);
  const now = peopleOf(after);
  const changes: PeopleChanges = { joined: [], left: [], roleChanged: [], moved: [], vacancies: { before: was.vacancies, after: now.vacancies } };

  for (const [k, p] of now.people) {
    const old = was.people.get(k);
    if (!old) {
      changes.joined.push({ name: p.name, roles: sortedRoles(p.roles), places: refs(p.places) });
      continue;
    }
    if (!sameSet(old.roles, p.roles)) changes.roleChanged.push({ name: p.name, from: sortedRoles(old.roles), to: sortedRoles(p.roles), places: refs(p.places) });
    if (!sameSet(old.places, p.places)) {
      changes.moved.push({
        name: p.name,
        roles: sortedRoles(p.roles),
        added: refs([...p.places].filter((id) => !old.places.has(id))),
        removed: refs([...old.places].filter((id) => !p.places.has(id))),
      });
    }
  }
  for (const [k, p] of was.people) if (!now.people.has(k)) changes.left.push({ name: p.name, roles: sortedRoles(p.roles), places: refs(p.places) });

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  changes.joined.sort(byName);
  changes.left.sort(byName);
  changes.roleChanged.sort(byName);
  changes.moved.sort(byName);
  return changes;
}

/** True when the version changed nobody (for example a restore of the version already in use). */
export const nothingChanged = (c: PeopleChanges) =>
  !c.joined.length && !c.left.length && !c.roleChanged.length && !c.moved.length && c.vacancies.before === c.vacancies.after;
