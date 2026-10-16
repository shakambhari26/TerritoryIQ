/**
 * Candidate matching between a workbook block label and the official LGD
 * units, following the tiered protocol of the Phase 0E crosswalk review.
 *
 * INPUT RULE: only the block label and the official pool are inputs. The
 * workbook's `DISTRICT` sales-territory label is deliberately not a parameter,
 * so it cannot restrict, break a tie in, or confirm a match (B-23). A test
 * asserts that the same label always yields the same candidates.
 *
 * A candidate is a name-based suggestion. Only an unambiguous exact-name
 * candidate becomes a provisional link, and a provisional link is not a
 * reviewed one.
 */

import type {
  CrosswalkEntry,
  FeatureCandidate,
  GeoKind,
  MatchTier,
} from "../territory/types.ts";
import { deriveKey, stemWords, type NameKey } from "./names.ts";
import { similarityRatio } from "./similarity.ts";

export interface OfficialUnit {
  featureId: string;
  kind: GeoKind;
  /** Official name verbatim. */
  name: string;
  key: NameKey;
}

export function toOfficialUnit(
  featureId: string,
  kind: GeoKind,
  name: string,
): OfficialUnit {
  return { featureId, kind, name, key: deriveKey(name) };
}

const FUZZY_THRESHOLD = 0.8;
const FUZZY_THRESHOLD_FOUR_LETTERS = 0.85;
const MIN_FUZZY_LETTERS = 4;
const MIN_LEADING_WORDS_LETTERS = 5;

function sortedWords(stem: string): string {
  return stemWords(stem).sort().join(" ");
}

function isPrefix(shorter: string[], longer: string[]): boolean {
  return (
    shorter.length < longer.length &&
    shorter.every((word, index) => word === longer[index])
  );
}

function isContiguousRun(part: string[], whole: string[]): boolean {
  if (part.length === 0 || part.length >= whole.length) return false;
  for (let start = 0; start + part.length <= whole.length; start++) {
    if (part.every((word, offset) => word === whole[start + offset])) {
      return true;
    }
  }
  return false;
}

function weakTier(label: NameKey, official: NameKey, kind: GeoKind): {
  tier: MatchTier;
  score: number | null;
} | null {
  // The district list has no numbered units.
  if (kind === "district" && label.numeral !== null) return null;

  const labelWords = stemWords(label.stem);
  const officialWords = stemWords(official.stem);

  // T3: same name with a different or missing numeral.
  if (label.compact === official.compact && label.numeral !== official.numeral) {
    return { tier: "T3", score: null };
  }
  // T3: same words in a different order.
  if (
    label.compact !== official.compact &&
    labelWords.length > 1 &&
    sortedWords(label.stem) === sortedWords(official.stem)
  ) {
    return { tier: "T3", score: null };
  }
  // A label ending in a lone letter that is not a numeral (for example "-W") carries a suffix
  // whose meaning is not stated (B-24). Its leading words are not matched, so it gets no candidate
  // from that rule rather than a guess.
  const unexplainedSuffix = labelWords.length > 1 && labelWords[labelWords.length - 1].length === 1;

  // T3: one name's words are the leading words of the other.
  const shorter = labelWords.length <= officialWords.length ? labelWords : officialWords;
  const longer = shorter === labelWords ? officialWords : labelWords;
  if (
    !unexplainedSuffix &&
    isPrefix(shorter, longer) &&
    shorter.join("").length >= MIN_LEADING_WORDS_LETTERS
  ) {
    return { tier: "T3", score: null };
  }
  // T3: the label is a contiguous part of a longer official name.
  if (!unexplainedSuffix && isContiguousRun(labelWords, officialWords)) {
    return { tier: "T3", score: null };
  }

  // T4: spelling variant, numerals equal.
  if (label.numeral === official.numeral) {
    const shortestLetters = Math.min(label.compact.length, official.compact.length);
    if (shortestLetters >= MIN_FUZZY_LETTERS) {
      const score = similarityRatio(label.compact, official.compact);
      const threshold =
        shortestLetters === MIN_FUZZY_LETTERS
          ? FUZZY_THRESHOLD_FOUR_LETTERS
          : FUZZY_THRESHOLD;
      if (score >= threshold) return { tier: "T4", score };
    }
  }
  // T4: a one-word label against a single word of a multi-word official name.
  if (labelWords.length === 1 && officialWords.length > 1 && label.compact.length >= MIN_FUZZY_LETTERS) {
    let best = 0;
    for (const word of officialWords) {
      if (word.length >= MIN_FUZZY_LETTERS) {
        best = Math.max(best, similarityRatio(label.compact, word));
      }
    }
    if (best >= FUZZY_THRESHOLD) return { tier: "T4", score: best };
  }
  return null;
}

/**
 * All plausible candidates for one label, none selected. If any exact-tier
 * (T1, T2) candidate exists, weaker tiers are not candidates for that row.
 */
export function matchLabel(
  label: string,
  pool: readonly OfficialUnit[],
): FeatureCandidate[] {
  const key = deriveKey(label);
  const exact: FeatureCandidate[] = [];
  const weak: FeatureCandidate[] = [];

  for (const unit of pool) {
    if (key.compact.length === 0) break;
    if (unit.kind === "district" && key.numeral !== null) continue;

    if (key.stem === unit.key.stem && key.numeral === unit.key.numeral) {
      exact.push({ featureId: unit.featureId, tier: "T1", score: null });
    } else if (
      key.compact === unit.key.compact &&
      key.numeral === unit.key.numeral
    ) {
      exact.push({ featureId: unit.featureId, tier: "T2", score: null });
    } else {
      const found = weakTier(key, unit.key, unit.kind);
      if (found) {
        weak.push({ featureId: unit.featureId, tier: found.tier, score: found.score });
      }
    }
  }
  return exact.length > 0 ? exact : weak;
}

/** Candidate set to a crosswalk entry. Never selects among several candidates. */
export function buildCrosswalkEntry(
  unitId: string,
  candidates: readonly FeatureCandidate[],
  kindOf: (featureId: string) => GeoKind,
): CrosswalkEntry {
  const exact = candidates.filter((c) => c.tier === "T1" || c.tier === "T2");

  if (exact.length === 1 && kindOf(exact[0].featureId) === "block") {
    return {
      unitId,
      status: "provisional",
      featureId: exact[0].featureId,
      candidates: [...candidates],
      reason:
        exact[0].tier === "T1"
          ? "One official block carries exactly this name. Name-based and not yet reviewed."
          : "One official block carries this name apart from spacing or punctuation. Name-based and not yet reviewed.",
    };
  }
  if (exact.length >= 1) {
    const mixedKinds = new Set(exact.map((c) => kindOf(c.featureId))).size > 1;
    return {
      unitId,
      status: "ambiguous",
      featureId: null,
      candidates: [...candidates],
      reason: mixedKinds
        ? "The name matches both a block and a district. Which unit is meant needs a reviewer."
        : exact.length > 1
          ? `The name matches ${exact.length} official units. Which one is meant needs a reviewer.`
          : "The only exact-name match is a district, not a block. Needs a reviewer.",
    };
  }
  if (candidates.length > 0) {
    return {
      unitId,
      status: "weak",
      featureId: null,
      candidates: [...candidates],
      reason:
        "No official unit has this exact name. Only spelling or numbering variants exist, so no boundary is assigned.",
    };
  }
  return {
    unitId,
    status: "none",
    featureId: null,
    candidates: [],
    reason:
      "No official block or district is a plausible match. The label may be an urban unit or a unit outside the supplied lists.",
  };
}
