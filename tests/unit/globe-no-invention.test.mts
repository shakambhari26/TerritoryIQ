import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ALIASES, AREAS_WITHOUT_OUTLINE, MOVED_BY_OUTLINE, TERRITORY_DISTRICT } from "../../src/features/globe/area-mapping.config.ts";
import { unknownNames, verifyNote, wrongCounts } from "../../src/features/globe/ask-verify.ts";

/**
 * GUARDRAILS: the globe shows what AREA MAPPING.xlsx says and nothing else.
 *
 *   1. An independent audit (scripts/globe/audit_sheet.py, which shares no code with the app and reads the .xlsx itself)
 *      passes: every row, person, role, vacancy, district and headcount matches the sheet.
 *   2. No row changes district without map evidence, and the reviewed exceptions are exactly these seven.
 *   3. An uploaded sheet is never placed in a district its rows do not name.
 *   4. A name in an AI answer that is not in the sheet is caught.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sheet = join(ROOT, "data-source", "AREA MAPPING.xlsx");
const overlay = join(ROOT, "data", "generated", "globe-overlay.json");
const python = spawnSync("python3", ["--version"]).status === 0;

describe("no invented or mismatched data", () => {
  it("the independent audit of the globe against the sheet passes", { skip: existsSync(sheet) && existsSync(overlay) && python ? false : "needs the sheet, the built globe data and python3" }, () => {
    const run = spawnSync("python3", ["-I", join(ROOT, "scripts", "globe", "audit_sheet.py"), sheet, overlay], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /PASS: the globe matches the sheet exactly/);
    assert.match(run.stdout, /358 rows\. Globe: 357 rows placed/);
  });

  it("a place without an outline always stays in the district its sheet row names", () => {
    for (const [key, area] of Object.entries(AREAS_WITHOUT_OUTLINE)) {
      assert.equal(area.district, TERRITORY_DISTRICT[key.split("|")[0]], `${key} is shown in ${area.district}`);
    }
  });

  it("only the seven reviewed rows, each a block with a real outline elsewhere, are shown in another district", () => {
    const moved = Object.entries(ALIASES)
      .filter(([key, alias]) => alias.district !== TERRITORY_DISTRICT[key.split("|")[0]])
      .map(([key]) => key)
      .sort();
    assert.deepEqual(moved, [...MOVED_BY_OUTLINE].sort());
    assert.deepEqual([...MOVED_BY_OUTLINE].sort(), [
      "Howrah|Jangipara",
      "Howrah|Khanakul-I",
      "Howrah|Khanakul-II",
      "WEST BURDWAN|Ausgram-II",
      "WEST BURDWAN|Galsi-W",
      "WEST MIDNAPORE|Binpur-I",
      "WEST MIDNAPORE|Binpur-II",
    ]);
  });

  it("there is no Kolkata team: the sheet lists none, so the district is not coloured", { skip: existsSync(overlay) ? false : "build the globe data first" }, () => {
    const data = JSON.parse(readFileSync(overlay, "utf8"));
    const kolkata = data.districts.find((d: { name: string }) => d.name === "Kolkata");
    assert.deepEqual([kolkata.staff, kolkata.blockCount], [0, 0]);
    const boroughs = data.blocks.filter((b: { name: string }) => /Borough|Behala/.test(b.name));
    const s24 = data.districts.find((d: { name: string }) => d.name === "South 24 Parganas").id;
    assert.equal(boroughs.length, 5);
    for (const b of boroughs) assert.equal(b.districtId, s24, `${b.name} stays in South 24 Parganas, as the sheet says`);
  });

  it("an uploaded sheet is matched only inside the district its rows name, never searched state-wide", () => {
    const source = readFileSync(join(ROOT, "src", "features", "globe", "roster", "sheet-import.server.ts"), "utf8");
    assert.doesNotMatch(source, /found in another district/);
    assert.doesNotMatch(source, /blocksIn\(undefined\)/);
    assert.match(source, /districtId \? base\.blocks\.filter\(\(b\) => b\.districtId === districtId\) : \[\]/);
  });

  it("an AI answer naming someone or somewhere not in the sheet is caught; real names pass", () => {
    const known = { people: ["Amit Jana", "Rakesh Sarkar", "Subir Chatterjee"], places: ["Saltora", "Mejia", "Kolkata Borough 7"], districts: ["Bankura", "South 24 Parganas"] };
    assert.deepEqual(unknownNames("**Amit Jana** covers **Saltora** and **Mejia** in Bankura District. Hire a **Primary Sales Officer**.", known), []);
    assert.deepEqual(unknownNames("South 24 Parganas has **Subir Chatterjee** as Area Sales Manager in Kolkata Borough 7.", known), []);
    assert.deepEqual(unknownNames("**Ravi Kumar** works in **Saltora**.", known), ["Ravi Kumar"]);
    assert.deepEqual(unknownNames("Amit Sarkar covers Bankura.", known), ["Amit Sarkar"], "two real halves do not make a real person");
    assert.deepEqual(unknownNames("Hire in **Gangarampur**.", known), ["Gangarampur"]);
    assert.deepEqual(unknownNames("Vacant positions: **none**. Team: **people assigned:** 2.", known), [], "lower-case highlights are not names");
  });

  it("a wrong count of someone's places in an AI answer is corrected from the sheet", () => {
    const known = { people: ["Arpan Ghosh", "Santanu Soam", "Mohan Rudra", "Amit Jana"], places: [], districts: ["Purba Bardhaman", "Bankura"], placesPerPerson: { "Arpan Ghosh": 11, "Santanu Soam": 8, "Mohan Rudra": 7, "Amit Jana": 22 } };
    assert.deepEqual(wrongCounts("* **Arpan Ghosh** (Secondary Sales Officer) covers **12 places** across Purba Bardhaman.", known), ["Arpan Ghosh covers 11 places, not 12"]);
    assert.deepEqual(wrongCounts("* **Arpan Ghosh** covers **11 places**.", known), []);
    assert.deepEqual(wrongCounts("* **Santanu Soam** and **Mohan Rudra** each cover **7 places**.", known), ["Santanu Soam covers 8 places, not 7"]);
    assert.deepEqual(wrongCounts("**Amit Jana** manages Bankura, which has **3 places** with no field staff.", known), [], "a district's count is not the person's");
    assert.match(verifyNote("**Arpan Ghosh** covers 12 places.", known), /Arpan Ghosh covers 11 places, not 12/);
    assert.equal(verifyNote("**Arpan Ghosh** covers 11 places.", known), "");
  });
});
