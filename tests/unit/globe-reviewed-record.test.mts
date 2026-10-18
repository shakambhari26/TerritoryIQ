import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { confirmationProblem, hasReviewedConfirmation, neutraliseUnreviewed } from "../../src/features/globe/classification.ts";
import { BLOCK_STYLE, DISTRICT_STYLE, NEUTRAL, ORANGE, ROYAL_BLUE } from "../../src/features/globe/styles.ts";
import type { Confirmation, GlobeManifest, ManifestBlock } from "../../src/features/globe/types.ts";

/**
 * The reviewed no-representative record (proposed schema, docs/no-representative-record.md) and the white rule.
 * No record exists: every record here is a synthetic fixture built in this file for a synthetic unit, used only to
 * show what the rule accepts and refuses, and never written anywhere. White needs an approved, in-force record for
 * the very unit; nothing is white today, and unresolved units stay neutral grey.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const rel = (path: string) => relative(ROOT, path).split("\\").join("/");
function* files(directory: string): Generator<string> {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

const AS_OF = "2026-11-01";
const UNIT = { id: "GB-SYNTHETIC-1", lgdCode: 900001 };
/** A complete, approved, in-force record for the synthetic unit above. SYNTHETIC: it describes no real place. */
const record = (overrides: Record<string, unknown> = {}): Confirmation =>
  ({
    schemaVersion: 1,
    recordId: "SYNTHETIC-RECORD-1",
    unit: { type: "block", id: UNIT.id, lgdCode: UNIT.lgdCode },
    assertion: "no-representative-associated",
    source: { kind: "synthetic test source", reference: "synthetic reference", location: "synthetic row", retrievedAt: "2026-10-30" },
    provenance: { recordedBy: "synthetic recorder", recordedAt: "2026-10-30T09:00:00Z" },
    effectiveDate: "2026-01-01",
    review: { status: "approved", reviewedBy: "synthetic reviewer", reviewedAt: "2026-10-31T10:00:00Z" },
    ...overrides,
  }) as unknown as Confirmation;

describe("the proposed record schema", () => {
  const schema = JSON.parse(read("docs/schemas/no-representative-record.schema.json")) as {
    required: string[];
    properties: Record<string, { const?: unknown; enum?: string[]; required?: string[]; properties?: Record<string, { enum?: string[] }> }>;
  };

  it("requires the five things asked of it: a stable unit identifier and type, an explicit assertion, source and provenance, an effective date, a review status", () => {
    for (const field of ["unit", "assertion", "source", "provenance", "effectiveDate", "review", "recordId", "schemaVersion"]) assert.ok(schema.required.includes(field), field);
    assert.deepEqual(schema.properties.unit.required, ["type", "id", "lgdCode"]);
    assert.deepEqual(schema.properties.unit.properties!.type.enum, ["district", "block"]);
    assert.equal(schema.properties.assertion.const, "no-representative-associated");
    assert.deepEqual(schema.properties.review.properties!.status.enum, ["pending", "approved", "rejected", "superseded"]);
    assert.deepEqual(schema.properties.source.required, ["kind", "reference", "location", "retrievedAt"]);
    assert.deepEqual(schema.properties.provenance.required, ["recordedBy", "recordedAt"]);
  });

  it("agrees with the TypeScript check: a record with every required field passes, and dropping any one fails", () => {
    assert.equal(confirmationProblem(record(), UNIT, "block", AS_OF), null);
    for (const field of ["schemaVersion", "recordId", "unit", "assertion", "source", "provenance", "effectiveDate", "review"]) {
      assert.notEqual(confirmationProblem(record({ [field]: undefined }), UNIT, "block", AS_OF), null, `without ${field}`);
    }
  });

  it("is documented, and the document says no record exists and nothing is white", () => {
    const doc = read("docs/no-representative-record.md");
    assert.match(doc, /PROPOSED/);
    assert.match(doc, /No record exists/i);
    assert.match(doc, /no white polygon/i);
    assert.match(doc, /local (?:change )?log/i);
  });
});

describe("what makes a unit white", () => {
  it("accepts one approved, in-force record that names this unit, asserts exactly 'no-representative-associated' and cites a source", () => {
    assert.equal(confirmationProblem(record(), UNIT, "block", AS_OF), null);
    assert.ok(hasReviewedConfirmation({ ...UNIT, confirmation: record() }, "block", AS_OF));
  });

  const refused: Array<[string, Record<string, unknown>, RegExp]> = [
    ["pending review", { review: { status: "pending", reviewedBy: null, reviewedAt: null } }, /"pending", not "approved"/],
    ["rejected review", { review: { status: "rejected", reviewedBy: "synthetic reviewer", reviewedAt: "2026-10-31" } }, /"rejected"/],
    ["superseded record", { review: { status: "superseded", reviewedBy: "synthetic reviewer", reviewedAt: "2026-10-31" } }, /"superseded"/],
    ["approval with no reviewer", { review: { status: "approved", reviewedBy: " ", reviewedAt: "2026-10-31" } }, /names no reviewer/],
    ["approval with no review date", { review: { status: "approved", reviewedBy: "synthetic reviewer", reviewedAt: null } }, /review date/],
    ["unknown review status", { review: { status: "ok", reviewedBy: "x", reviewedAt: "2026-10-31" } }, /no review status/],
    ["effective date in the future", { effectiveDate: "2026-12-01" }, /not in force until 2026-12-01/],
    ["malformed effective date", { effectiveDate: "31/10/2026" }, /effective date/],
    ["another assertion (vacant, unallocated, unknown)", { assertion: "vacant" }, /no-representative-associated/],
    ["another unit id", { unit: { type: "block", id: "GB-OTHER", lgdCode: UNIT.lgdCode } }, /different unit/],
    ["another LGD code", { unit: { type: "block", id: UNIT.id, lgdCode: 1 } }, /different unit/],
    ["another unit type", { unit: { type: "district", id: UNIT.id, lgdCode: UNIT.lgdCode } }, /for a district, not a block/],
    ["no source reference", { source: { kind: "register", reference: "", location: "row 1", retrievedAt: "2026-10-30" } }, /cites no source/],
    ["no source location", { source: { kind: "register", reference: "r", location: " ", retrievedAt: "2026-10-30" } }, /cites no source/],
    ["no source date", { source: { kind: "register", reference: "r", location: "row 1" } }, /retrieval date/],
    ["a source hash that is not a SHA-256", { source: { kind: "register", reference: "r", location: "row 1", retrievedAt: "2026-10-30", sha256: "abc" } }, /SHA-256/],
    ["no provenance", { provenance: { recordedBy: "", recordedAt: "2026-10-30" } }, /no provenance/],
    ["another schema version", { schemaVersion: 2 }, /schema version 1/],
    ["no record ID", { recordId: "" }, /record ID/],
  ];
  for (const [name, overrides, message] of refused) {
    it(`refuses a record with ${name}`, () => {
      const problem = confirmationProblem(record(overrides), UNIT, "block", AS_OF);
      assert.ok(problem, name);
      assert.match(problem, message);
      assert.ok(!hasReviewedConfirmation({ ...UNIT, confirmation: record(overrides) }, "block", AS_OF));
    });
  }

  it("refuses anything that is not a record: nothing, null, a string, an array, the old two-field shape", () => {
    for (const value of [undefined, null, "reviewed", [], 1, { source: "reviewed.csv row 12", reviewedAt: "2026-10-30" }]) {
      assert.notEqual(confirmationProblem(value, UNIT, "block", AS_OF), null, JSON.stringify(value));
    }
  });
});

describe("a no-representative state is honoured only with such a record", () => {
  const unit = (state: ManifestBlock["state"], confirmation?: ManifestBlock["confirmation"]): ManifestBlock => ({
    id: UNIT.id, name: "Synthetic block", lgdCode: UNIT.lgdCode, districtId: "GD-SYNTHETIC", state, reason: "r", confirmation, contested: false, rowIds: [], geometry: null, noGeometryReason: "x",
  });
  const district = (confirmation?: Confirmation) => ({
    id: "GD-SYNTHETIC", name: "Synthetic district", lgdCode: 900000, state: "no-representative", reason: "r", confirmation, blockCount: 1, representedBlockCount: 0, drawnBlockCount: 0, geometry: null, noGeometryReason: null,
  });
  const base = (blocks: ManifestBlock[], districts = [district()]) =>
    ({ meta: { counts: { blocksNoRepresentativeConfirmed: 1, blocksUnresolved: 0 } }, districts, blocks }) as unknown as GlobeManifest;

  it("a no-representative state without a record becomes unresolved, with the reason on screen, for blocks and districts", () => {
    const result = neutraliseUnreviewed(base([unit("no-representative"), unit("no-representative", null)]));
    assert.deepEqual(result.blocks.map((b) => b.state), ["unresolved", "unresolved"]);
    assert.equal(result.districts[0].state, "unresolved");
    assert.match(result.blocks[0].reason, /without an approved, reviewed source record/);
    assert.equal(result.meta.counts.blocksNoRepresentativeConfirmed, 0);
    assert.equal(result.meta.counts.blocksUnresolved, 2);
  });

  it("a record that is pending, rejected, for another unit or not yet in force does not make a unit white", () => {
    // Today's date is the default `asOf`, so the future-dated record is built a year ahead.
    const future = `${new Date().getUTCFullYear() + 1}-01-01`;
    const records = [
      record({ review: { status: "pending", reviewedBy: null, reviewedAt: null } }),
      record({ review: { status: "rejected", reviewedBy: "synthetic reviewer", reviewedAt: "2026-10-31" } }),
      record({ unit: { type: "block", id: "GB-OTHER", lgdCode: 1 } }),
      record({ effectiveDate: future }),
    ];
    const result = neutraliseUnreviewed(base(records.map((r) => unit("no-representative", r))));
    assert.deepEqual(result.blocks.map((b) => b.state), ["unresolved", "unresolved", "unresolved", "unresolved"]);
  });

  it("an approved, in-force record for the very unit is honoured (the only way to white)", () => {
    const result = neutraliseUnreviewed(base([unit("no-representative", record())]));
    assert.equal(result.blocks[0].state, "no-representative");
    assert.equal(result.meta.counts.blocksNoRepresentativeConfirmed, 1);
  });

  it("a record for a block does not whiten a district with the same IDs, and the reverse", () => {
    const districtRecord = record({ unit: { type: "district", id: "GD-SYNTHETIC", lgdCode: 900000 } });
    const result = neutraliseUnreviewed(base([unit("no-representative", districtRecord)], [district(record())]));
    assert.equal(result.blocks[0].state, "unresolved");
    assert.equal(result.districts[0].state, "unresolved");
    const ok = neutraliseUnreviewed(base([unit("represented")], [district(districtRecord)]));
    assert.equal(ok.districts[0].state, "no-representative");
  });

  it("leaves every other state alone: orange stays orange and grey stays grey", () => {
    const result = neutraliseUnreviewed(base([unit("represented"), unit("unresolved")], []));
    assert.deepEqual(result.blocks.map((b) => b.state), ["represented", "unresolved"]);
  });
});

describe("the repository today: nothing is white, nothing is read from a local log, no record is fabricated", () => {
  const generated = join(ROOT, "data", "generated", "globe-overlay.json");

  it("the built manifest holds no no-representative unit and no confirmation", { skip: existsSync(generated) ? false : "run python -I scripts/globe/build_overlay.py first" }, () => {
    const manifest = JSON.parse(readFileSync(generated, "utf8")) as GlobeManifest;
    assert.equal(manifest.meta.counts.blocksNoRepresentativeConfirmed, 0);
    for (const unit of [...manifest.districts, ...manifest.blocks]) {
      assert.notEqual(unit.state, "no-representative", unit.id);
      assert.ok(!("confirmation" in unit) || !unit.confirmation, unit.id);
    }
  });

  it("no reviewed-record data file exists anywhere in the project (data/, public/, src/, scripts/)", () => {
    const found = ["data", "public", "src", "scripts"].flatMap((dir) => [...files(join(ROOT, dir))]).map(rel).filter((f) => /no-representative|norepresentative|confirmation-record/i.test(f) && extname(f) !== ".ts" && extname(f) !== ".tsx");
    assert.deepEqual(found, []);
    for (const file of files(join(ROOT, "data"))) {
      if (!/\.json$/.test(file) || file.includes(`${join("data", "raw")}`)) continue;
      assert.doesNotMatch(readFileSync(file, "utf8").slice(0, 2_000_000), /"assertion":\s*"no-representative-associated"/, rel(file));
    }
  });

  it("the builder and the app never read the reviewer's browser-local log or any browser storage, and the builder never emits the state", () => {
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(?:\/\/|#).*$/gm, "").replace(/"""[\s\S]*?"""/g, "");
    const globe = [...files(join(ROOT, "src", "features", "globe")), ...files(join(ROOT, "src", "app", "globe"))];
    for (const file of globe) assert.doesNotMatch(code(readFileSync(file, "utf8")), /\b(?:localStorage|sessionStorage|indexedDB)\b/, rel(file));
    const builder = code(read("scripts/globe/build_overlay.py"));
    assert.doesNotMatch(builder, /localStorage|sessionStorage|unallocated|change[ _-]?log/i);
    assert.doesNotMatch(builder, /return\s+"no-representative"|"state":\s*"no-representative"|state\s*=\s*"no-representative"/);
  });
});

describe("colours and wording that stay as approved", () => {
  it("royal blue for a district with a provisional representative-linked block, orange for such a block, grey for unresolved", () => {
    assert.equal(ROYAL_BLUE, "#4169e1");
    assert.equal(ORANGE, "#f5821f");
    assert.equal(NEUTRAL, "#8796b0");
    assert.equal(DISTRICT_STYLE.represented.fill, ROYAL_BLUE);
    assert.equal(BLOCK_STYLE.represented.fill, ORANGE);
    assert.equal(DISTRICT_STYLE.unresolved.fill, NEUTRAL);
    assert.equal(BLOCK_STYLE.unresolved.fill, NEUTRAL);
  });

  it("the royal-blue wording says it implies neither complete nor officially verified coverage", () => {
    assert.match(DISTRICT_STYLE.represented.description, /does not mean the district is completely covered/);
    assert.match(DISTRICT_STYLE.represented.description, /no link is officially verified/);
    assert.match(read("src/features/globe/components/GlobeExperience.tsx"), /Not complete or officially verified coverage/);
  });

  it("white stays in the legend only, with its reason; the state is never produced by the build", () => {
    const experience = read("src/features/globe/components/GlobeExperience.tsx");
    assert.match(experience, /Confirmed: no representative/);
    assert.match(experience, /none yet; needs a reviewed source record/);
    assert.match(read("src/features/globe/styles.ts"), /"no-representative": \{/);
  });

  it("colour never uses the allocation names, and unresolved is never worded as vacant or unallocated", () => {
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const file of ["styles.ts", "types.ts", "classification.ts", "outline-gate.ts"]) assert.doesNotMatch(code(read(`src/features/globe/${file}`)), /Assigned|Vacant|Unallocated|Data Missing/, file);
    for (const style of [DISTRICT_STYLE.unresolved, BLOCK_STYLE.unresolved]) {
      assert.match(style.description, /not the same as unrepresented/i);
      assert.doesNotMatch(`${style.label} ${style.description}`, /vacant|unallocated/i);
    }
  });
});
