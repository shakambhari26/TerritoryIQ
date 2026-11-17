import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyTeamChange, teamDirectory } from "../../src/features/globe/roster/team-change.server.ts";
import { parseTeamChange, REASONS, type TeamChangeRequest } from "../../src/features/globe/team-change.ts";
import type { ServerRecord } from "../../src/features/globe/server-types.ts";

/**
 * "Make a team change": a joiner, an exit, an area change or a role change, each with reasons, a date and who recorded
 * it. Nothing is guessed: the person must exist (except a joiner), places must exist, a handover goes to a real colleague.
 */

const base = { blocks: [{ id: "GB-1", name: "Saltora" }, { id: "GB-2", name: "Mejia" }, { id: "GB-3", name: "Ilambazar" }] } as never;
const row = (people: Array<[string, string | null]>): ServerRecord => ({
  unitId: "TU-001",
  blockLabel: "",
  territory: "",
  namedPeople: 0,
  people: people.map(([role, name], i) => ({ role, slot: i + 1, name, vacant: name === null })),
});
const roster = () => ({
  "GB-1": [row([["ASM", "Amit Jana"], ["PRIMARY", "Rakesh Sarkar"], ["SECONDARY", null]])],
  "GB-2": [row([["ASM", "Amit Jana"], ["PRIMARY", "Rakesh Sarkar"]])],
  "GB-3": [row([["PRIMARY", "Subir Chatterjee"]])],
});
const req = (over: Partial<TeamChangeRequest>): TeamChangeRequest => ({
  kind: "join",
  name: "Ravi Das",
  role: "SECONDARY",
  newRole: null,
  addPlaces: [],
  dropPlaces: [],
  cover: "none",
  handoverTo: null,
  reasons: ["new_hire"],
  note: "",
  effectiveDate: "2026-11-20",
  by: "Sales Ops",
  dryRun: true,
  ...over,
});
const at = (r: Record<string, ServerRecord[]>, id: string) => r[id].flatMap((x) => x.people).map((p) => `${p.role}:${p.vacant ? "VACANT" : p.name}`);

describe("recording a team change", () => {
  it("a joiner fills a vacant post of their role first, then is added where there is none", () => {
    const out = applyTeamChange(base, roster(), req({ name: "ravi das", addPlaces: ["GB-1", "GB-2"] }));
    assert.ok(out.ok);
    assert.deepEqual(at(out.roster, "GB-1"), ["ASM:Amit Jana", "PRIMARY:Rakesh Sarkar", "SECONDARY:Ravi Das"]);
    assert.deepEqual(at(out.roster, "GB-2"), ["ASM:Amit Jana", "PRIMARY:Rakesh Sarkar", "SECONDARY:Ravi Das"]);
    assert.match(out.summary, /^New joiner: Ravi Das joined as Secondary Sales Officer in Saltora, Mejia \(1 vacant post filled\)\. Why: New hire\. From 20 Nov 2026\.$/);
  });

  it("someone already in the team cannot 'join' again", () => {
    const out = applyTeamChange(base, roster(), req({ name: "Rakesh Sarkar", addPlaces: ["GB-3"] }));
    assert.equal(out.ok, false);
  });

  it("an exit leaves each post vacant (a hiring need), or hands it to a real colleague", () => {
    const vacant = applyTeamChange(base, roster(), req({ kind: "exit", name: "Rakesh Sarkar", role: "PRIMARY", cover: "vacant", reasons: ["resigned", "competitor"] }));
    assert.ok(vacant.ok);
    assert.deepEqual(at(vacant.roster, "GB-2"), ["ASM:Amit Jana", "PRIMARY:VACANT"]);
    assert.equal(teamDirectory(vacant.roster).has("rakesh sarkar"), false);
    assert.match(vacant.summary, /Rakesh Sarkar left \(Primary Sales Officer\); 2 places left vacant\. Why: Resigned, Joined a competitor brand\./);

    const handed = applyTeamChange(base, roster(), req({ kind: "exit", name: "Rakesh Sarkar", role: "PRIMARY", cover: "handover", handoverTo: "Subir Chatterjee", reasons: ["transfer_out"] }));
    assert.ok(handed.ok);
    assert.deepEqual(at(handed.roster, "GB-1"), ["ASM:Amit Jana", "SECONDARY:VACANT", "PRIMARY:Subir Chatterjee"]);
    assert.deepEqual([...teamDirectory(handed.roster).get("subir chatterjee")!.places].sort(), ["GB-1", "GB-2", "GB-3"]);

    const nobody = applyTeamChange(base, roster(), req({ kind: "exit", name: "Rakesh Sarkar", cover: "handover", handoverTo: "Ravi Kumar", reasons: ["resigned"] }));
    assert.equal(nobody.ok, false, "a handover to someone not in the team is refused");
  });

  it("an area change adds and drops places in one role, and only places they really cover", () => {
    const out = applyTeamChange(base, roster(), req({ kind: "move", name: "Rakesh Sarkar", role: "PRIMARY", addPlaces: ["GB-3"], dropPlaces: ["GB-2"], cover: "vacant", reasons: ["realignment"] }));
    assert.ok(out.ok);
    assert.deepEqual([...teamDirectory(out.roster).get("rakesh sarkar")!.places].sort(), ["GB-1", "GB-3"]);
    assert.deepEqual(at(out.roster, "GB-2"), ["ASM:Amit Jana", "PRIMARY:VACANT"]);
    const wrong = applyTeamChange(base, roster(), req({ kind: "move", name: "Rakesh Sarkar", role: "PRIMARY", dropPlaces: ["GB-3"], reasons: ["realignment"] }));
    assert.equal(wrong.ok, false);
  });

  it("a role change keeps the places and changes only the role", () => {
    const out = applyTeamChange(base, roster(), req({ kind: "role", name: "Rakesh Sarkar", role: "PRIMARY", newRole: "ASM", reasons: ["promotion"] }));
    assert.ok(out.ok);
    assert.deepEqual(at(out.roster, "GB-1"), ["ASM:Amit Jana", "ASM:Rakesh Sarkar", "SECONDARY:VACANT"]);
    assert.match(out.summary, /Rakesh Sarkar: Primary Sales Officer → Area Sales Manager in 2 places\. Why: Promotion\./);
  });

  it("the team as it was is never changed in place", () => {
    const before = roster();
    const copy = JSON.stringify(before);
    applyTeamChange(base, before, req({ kind: "exit", name: "Rakesh Sarkar", cover: "vacant", reasons: ["resigned"] }));
    assert.equal(JSON.stringify(before), copy);
  });
});

describe("what the browser may send", () => {
  const today = new Date("2026-11-17T00:00:00Z");
  it("a complete change passes", () => {
    const ok = parseTeamChange(req({ addPlaces: ["GB-1"] }), today);
    assert.equal(typeof ok, "object");
  });
  it("every change needs a reason from the list, a date within a year and who recorded it", () => {
    assert.match(parseTeamChange(req({ addPlaces: ["GB-1"], reasons: [] }), today) as string, /reason/);
    assert.match(parseTeamChange(req({ addPlaces: ["GB-1"], reasons: ["made_up"] }), today) as string, /reason/);
    assert.match(parseTeamChange(req({ addPlaces: ["GB-1"], reasons: ["other"] }), today) as string, /note/);
    assert.match(parseTeamChange(req({ addPlaces: ["GB-1"], effectiveDate: "2030-01-01" }), today) as string, /within a year/);
    assert.match(parseTeamChange(req({ addPlaces: ["GB-1"], by: " " }), today) as string, /your name/);
    assert.match(parseTeamChange({ ...req({ addPlaces: ["GB-1"] }), extra: 1 }, today) as string, /could not be read/);
  });
  it("reasons cover what a TMT-bar sales team meets, and every list ends with Other", () => {
    for (const list of Object.values(REASONS)) assert.equal(list.at(-1)!.id, "other");
    assert.ok(REASONS.exit.some((r) => r.id === "competitor") && REASONS.exit.some((r) => r.id === "conduct") && REASONS.exit.some((r) => r.id === "mistake"));
    assert.ok(REASONS.move.some((r) => r.id === "network") && REASONS.join.some((r) => r.id === "expansion"));
  });
});
