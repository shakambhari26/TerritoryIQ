import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { nothingChanged, peopleChanges } from "../../src/features/globe/roster/people-diff.server.ts";
import type { ServerRecord } from "../../src/features/globe/server-types.ts";

/**
 * When someone uploads an updated sheet, everyone sees what changed: who joined, who left, whose role changed and who
 * now covers different places. And the page always says where its data came from and when.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const base = {
  districts: [
    { id: "D1", name: "Bankura" },
    { id: "D2", name: "Birbhum" },
  ],
  blocks: [
    { id: "GB-1", name: "Saltora", districtId: "D1" },
    { id: "GB-2", name: "Mejia", districtId: "D1" },
    { id: "GB-3", name: "Ilambazar", districtId: "D2" },
  ],
} as never;

const row = (people: Array<[string, string | null]>): ServerRecord => ({
  unitId: "TU-001",
  blockLabel: "",
  territory: "",
  namedPeople: people.filter(([, n]) => n).length,
  people: people.map(([role, name], i) => ({ role, slot: i + 1, name, vacant: name === null })),
});

describe("what an updated sheet changed, person by person", () => {
  const before = {
    "GB-1": [row([["ASM", "Amit Jana"], ["PRIMARY", "Rakesh Sarkar"], ["SECONDARY", null]])],
    "GB-2": [row([["ASM", "Amit Jana"], ["SECONDARY", "Mohan Rudra"]])],
    "GB-3": [row([["PRIMARY", "Subir Chatterjee"]])],
  };
  const after = {
    "GB-1": [row([["ASM", "Amit Jana"], ["SECONDARY", "Rakesh Sarkar"], ["SECONDARY", "Ravi Das"]])],
    "GB-2": [row([["ASM", "Amit Jana"], ["SECONDARY", "Mohan  Rudra"]])],
    "GB-3": [row([["PRIMARY", "Mohan Rudra"], ["DSO", null]])],
  };
  const c = peopleChanges(base, before, after);

  it("a new name is a joiner, a missing name a leaver, with their roles and places", () => {
    assert.deepEqual(c.joined, [{ name: "Ravi Das", roles: ["SECONDARY"], places: [{ blockId: "GB-1", place: "Saltora", district: "Bankura" }] }]);
    assert.deepEqual(c.left, [{ name: "Subir Chatterjee", roles: ["PRIMARY"], places: [{ blockId: "GB-3", place: "Ilambazar", district: "Birbhum" }] }]);
  });

  it("the same name in a new role is a role change, not one person leaving and another joining", () => {
    assert.deepEqual(c.roleChanged, [
      { name: "Mohan Rudra", from: ["SECONDARY"], to: ["PRIMARY", "SECONDARY"], places: [{ blockId: "GB-2", place: "Mejia", district: "Bankura" }, { blockId: "GB-3", place: "Ilambazar", district: "Birbhum" }] },
      { name: "Rakesh Sarkar", from: ["PRIMARY"], to: ["SECONDARY"], places: [{ blockId: "GB-1", place: "Saltora", district: "Bankura" }] },
    ]);
  });

  it("someone who now covers other places is listed with the places added and dropped; extra spaces do not count", () => {
    assert.deepEqual(c.moved, [{ name: "Mohan Rudra", roles: ["PRIMARY", "SECONDARY"], added: [{ blockId: "GB-3", place: "Ilambazar", district: "Birbhum" }], removed: [] }]);
    assert.equal(c.moved.some((m) => m.name === "Amit Jana"), false);
  });

  it("vacant posts are counted before and after", () => {
    assert.deepEqual(c.vacancies, { before: 1, after: 1 });
  });

  it("the same team twice is no change", () => {
    assert.equal(nothingChanged(peopleChanges(base, before, before)), true);
    assert.equal(nothingChanged(c), false);
  });
});

describe("everyone sees an update, and where the data came from", () => {
  it("an upload must say who uploaded it and which file, and both are saved with the version", () => {
    const admin = read("src/features/globe/team-admin.server.ts");
    assert.match(admin, /Object\.keys\(v\)\.sort\(\)\.join\(","\) !== "by,file,fileName"/);
    assert.match(admin, /save\("upload", summary, prepared\.data\.roster, \{ by, fileName, changes: people \}\)/);
    assert.match(read("src/features/globe/team-store.server.ts"), /add column if not exists saved_by text, add column if not exists file_name text, add column if not exists changes jsonb/);
  });

  it("the latest-update route needs a signed-in user and the page checks it every 30 seconds", () => {
    assert.match(read("src/app/api/globe/team/latest/route.ts"), /if \(!isRequestAuthorized\(request\.headers\)\) return askFail\(401/);
    const ui = read("src/features/globe/components/TeamUpdates.tsx");
    assert.match(ui, /const CHECK_EVERY_MS = 30_000;/);
    assert.match(ui, /router\.refresh\(\)/);
  });

  it("the uploader's name never goes into the page data, only to signed-in requests", () => {
    assert.doesNotMatch(read("src/features/globe/overlay.server.ts"), /dataSources|sources/);
    assert.match(read("src/features/globe/team-admin.server.ts"), /dataSources\(team\.server, version\)/);
  });

  it("a layer fetched from an API says so and says how to check it", () => {
    const sources = read("src/features/globe/sources.server.ts");
    assert.match(sources, /kind: "api" \| "upload", from: "<plain words>", at: "<ISO time>"/);
    assert.match(read("src/features/globe/components/TeamUpdates.tsx"), /api: \{ text: "Live from API"/);
  });
});
