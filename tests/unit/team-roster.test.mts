import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// The modules under test are marked `import "server-only"`, which only Next resolves; outside Next it is an empty module.
register(
  "data:text/javascript," +
    encodeURIComponent('export async function resolve(s, c, n) { return s === "server-only" ? { url: "data:text/javascript,export {}", shortCircuit: true } : n(s, c); }'),
);

/**
 * Changing the team (src/features/globe/roster, team-admin.server.ts) must never change anything by accident: the
 * recomputed numbers must equal the build's, re-uploading the original sheet must change nobody, and edits must do
 * exactly what they say. Needs `npm run data:build-globe`.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const overlayPath = join(ROOT, "data", "generated", "globe-overlay.json");
const sheetPath = join(ROOT, "data-source", "AREA MAPPING.xlsx");
const ready = existsSync(overlayPath) && existsSync(sheetPath);

describe("the team list", { skip: ready ? false : "run npm run data:build-globe first" }, async () => {
  const { applyRoster, rosterOf, addPerson, removePerson, diffRosters } = await import("../../src/features/globe/roster/roster.server.ts");
  const { importSheet } = await import("../../src/features/globe/roster/sheet-import.server.ts");
  const base = JSON.parse(readFileSync(overlayPath, "utf8"));
  const pick = (b: { staff: number; fieldStaff: number; roleCounts: unknown; vacancies: number; state: string }) => JSON.stringify([b.staff, b.fieldStaff, b.roleCounts, b.vacancies, b.state]);

  it("recomputing from the base roster gives exactly the build's numbers", () => {
    const again = applyRoster(base, rosterOf(base));
    base.blocks.forEach((b: Parameters<typeof pick>[0] & { id: string }, i: number) => assert.equal(pick(again.blocks[i]), pick(b), b.id));
    base.districts.forEach((d: { id: string; staff: number; vacancies: number }, i: number) => assert.deepEqual([again.districts[i].staff, again.districts[i].vacancies], [d.staff, d.vacancies], d.id));
    assert.equal(again.meta.sheet?.staff, base.meta.sheet.staff);
    assert.deepEqual(again.meta.sheet?.spread, base.meta.sheet.spread);
  });

  it("uploading the original sheet again places every row and changes nobody", () => {
    const result = importSheet(readFileSync(sheetPath), base);
    assert.ok(result.ok);
    assert.equal(result.report.placed, 357);
    assert.deepEqual(result.report.unplaced, []);
    assert.deepEqual(result.report.guessed, []);
    assert.deepEqual(result.report.outside.map((o: { label: string }) => o.label), ["Jharkhand-W"]);
    assert.deepEqual(diffRosters(base, rosterOf(base), result.roster), []);
  });

  it("a file that is not the sheet is refused with a reason", () => {
    const result = importSheet(Buffer.from("not a spreadsheet"), base);
    assert.equal(result.ok, false);
  });

  it("adding and removing a person changes that place only, and refuses duplicates and unknown people", () => {
    const mejia = base.blocks.find((b: { name: string }) => b.name === "Mejia");
    const added = addPerson(rosterOf(base), mejia.id, "PRIMARY", "new person");
    assert.equal(typeof added, "object");
    const after = applyRoster(base, added as never);
    assert.equal(after.blocks.find((b: { id: string }) => b.id === mejia.id)!.staff, mejia.staff + 1);
    const changes = diffRosters(base, rosterOf(base), added as never);
    assert.deepEqual(changes.map((c: { place: string; added: unknown[]; removed: unknown[] }) => [c.place, c.added, c.removed]), [["Mejia", [{ role: "PRIMARY", name: "New Person" }], []]]);
    assert.equal(typeof addPerson(added as never, mejia.id, "PRIMARY", "NEW PERSON"), "string", "a duplicate is refused");
    const removed = removePerson(added as never, mejia.id, "PRIMARY", "New Person");
    assert.deepEqual(diffRosters(base, rosterOf(base), removed as never), []);
    assert.equal(typeof removePerson(rosterOf(base), mejia.id, "DSO", "Nobody Here"), "string", "removing someone not listed is refused");
  });
});
