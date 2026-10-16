import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCrosswalkEntry, matchLabel, toOfficialUnit } from "../../src/features/geo/crosswalk.ts";
import { deriveKey } from "../../src/features/geo/names.ts";
import { similarityRatio } from "../../src/features/geo/similarity.ts";

const EN_DASH = String.fromCharCode(0x2013);
const NBSP = String.fromCharCode(0x00a0);

describe("deriveKey", () => {
  it("reads every numeral spelling as the same stem and number", () => {
    for (const label of ["Kalna-I", "Kalna I", "Kalna - I", "Kalna_I", "Kalna-1", "Kalna Ii".replace("Ii", "I")]) {
      const key = deriveKey(label);
      assert.equal(key.stem, "kalna", label);
      assert.equal(key.numeral, 1, label);
    }
    assert.equal(deriveKey("Ausgram-Ii").numeral, 2);
    assert.equal(deriveKey("Garbeta-Iii").numeral, 3);
  });

  it("treats en dashes and non-breaking spaces like their ASCII forms", () => {
    assert.deepEqual(
      { ...deriveKey(`Panskura${EN_DASH}I`), raw: "" },
      { ...deriveKey("Panskura-I"), raw: "" },
    );
    assert.equal(deriveKey(`Hili${NBSP}`).stem, "hili");
  });

  it("does not split a numeral off a name that merely ends in a letter i", () => {
    assert.equal(deriveKey("Hili").numeral, null);
    assert.equal(deriveKey("Kaliganj").numeral, null);
  });

  it("keeps the original text untouched", () => {
    assert.equal(deriveKey("Panskura" + EN_DASH + "I").raw, "Panskura" + EN_DASH + "I");
  });
});

describe("similarityRatio", () => {
  it("reproduces the difflib scores the Phase 0E review recorded", () => {
    assert.equal(Number(similarityRatio("mahisadal", "mahishadal").toFixed(2)), 0.95);
    assert.equal(Number(similarityRatio("joypur", "jaypur").toFixed(2)), 0.83);
    assert.equal(similarityRatio("abc", "abc"), 1);
    assert.equal(similarityRatio("abc", "xyz"), 0);
  });
});

const pool = [
  toOfficialUnit("GB-1", "block", "Panskura-I"),
  toOfficialUnit("GB-2", "block", "Faridpur - Durgapur"),
  toOfficialUnit("GB-3", "block", "Mahishadal"),
  toOfficialUnit("GB-4", "block", "Sankrail"),
  toOfficialUnit("GB-5", "block", "Sankrail"),
  toOfficialUnit("GB-6", "block", "Jhargram"),
  toOfficialUnit("GD-1", "district", "Jhargram"),
  toOfficialUnit("GB-7", "block", "Contai-I"),
  toOfficialUnit("GB-8", "block", "Contai-Iii"),
];
const kindOf = (id: string) => (id.startsWith("GD") ? "district" : "block");

describe("matchLabel", () => {
  it("finds an exact match across dash and case differences (T1)", () => {
    const found = matchLabel(`Panskura${EN_DASH}I`, pool);
    assert.deepEqual(found, [{ featureId: "GB-1", tier: "T1", score: null }]);
  });

  it("finds a spacing-only match as T2", () => {
    assert.deepEqual(matchLabel("Faridpur Durgapur", pool), [{ featureId: "GB-2", tier: "T2", score: null }]);
  });

  it("returns only exact candidates when any exist", () => {
    const found = matchLabel("Panskura-I", pool);
    assert.ok(found.every((c) => c.tier === "T1" || c.tier === "T2"));
  });

  it("offers a spelling variant as T4 with its score and never as exact", () => {
    const [candidate] = matchLabel("Mahisadal", pool);
    assert.equal(candidate.featureId, "GB-3");
    assert.equal(candidate.tier, "T4");
    assert.ok((candidate.score ?? 0) >= 0.8);
  });

  it("does not match a numbered label to a sibling numeral or to a district", () => {
    const found = matchLabel("Contai-II", pool);
    assert.ok(found.every((c) => c.tier === "T3"), JSON.stringify(found));
    assert.ok(!found.some((c) => c.featureId === "GD-1"));
  });

  it("does not match a label with an unexplained single-letter suffix on its leading word", () => {
    const withSuffix = [toOfficialUnit("GB-9", "block", "Galsi -I"), toOfficialUnit("GB-10", "block", "Galsi-Ii")];
    assert.deepEqual(matchLabel("Galsi-W", withSuffix), [], "the meaning of -W is not stated, so it is not guessed");
    // A numeral suffix is understood, so a numbered sibling still shows up as a candidate.
    assert.ok(matchLabel("Galsi", withSuffix).length > 0);
  });

  it("returns nothing for an unrelated label", () => {
    assert.deepEqual(matchLabel("Zzzzz", pool), []);
  });

  it("depends only on the label, never on a sales territory", () => {
    // The function has no territory parameter, so identical labels from
    // different sales territories cannot be told apart.
    assert.equal(matchLabel.length, 2);
    assert.deepEqual(matchLabel("Sankrail", pool), matchLabel("Sankrail", pool));
  });
});

describe("buildCrosswalkEntry", () => {
  it("links a single exact block candidate provisionally", () => {
    const entry = buildCrosswalkEntry("TU-001", matchLabel("Panskura-I", pool), kindOf);
    assert.equal(entry.status, "provisional");
    assert.equal(entry.featureId, "GB-1");
  });

  it("refuses to choose between two same-named blocks", () => {
    const entry = buildCrosswalkEntry("TU-002", matchLabel("Sankrail", pool), kindOf);
    assert.equal(entry.status, "ambiguous");
    assert.equal(entry.featureId, null);
    assert.equal(entry.candidates.length, 2);
  });

  it("refuses a label that names both a block and a district", () => {
    const entry = buildCrosswalkEntry("TU-003", matchLabel("Jhargram", pool), kindOf);
    assert.equal(entry.status, "ambiguous");
    assert.equal(entry.featureId, null);
  });

  it("never selects a weak candidate", () => {
    const entry = buildCrosswalkEntry("TU-004", matchLabel("Mahisadal", pool), kindOf);
    assert.equal(entry.status, "weak");
    assert.equal(entry.featureId, null);
    assert.equal(entry.candidates.length, 1);
  });

  it("reports no candidate as none", () => {
    const entry = buildCrosswalkEntry("TU-005", [], kindOf);
    assert.equal(entry.status, "none");
    assert.equal(entry.featureId, null);
  });
});
