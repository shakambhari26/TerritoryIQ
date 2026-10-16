/**
 * Place-name normalisation used to compare workbook labels with official
 * (LGD) names and with OpenStreetMap names.
 *
 * Pure and dependency-free so that the data scripts, the app and the tests
 * share one implementation. Originals are never rewritten: a `NameKey` is a
 * derived, working value only.
 */

export interface NameKey {
  /** Name exactly as supplied. */
  raw: string;
  /** Lower-case name without its trailing numeral, dashes unified, spaces collapsed. */
  stem: string;
  /** `stem` reduced to letters and digits only. */
  compact: string;
  /** Trailing Roman or Arabic block numeral (I..V, 1..4) as a number, or null. */
  numeral: number | null;
}

const NUMERALS: Readonly<Record<string, number>> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
};

const NBSP = String.fromCharCode(0x00a0);
/** En dash, em dash and underscore all read as a hyphen. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}_]`, "g");

const TRAILING_NUMERAL = /^(.*?)[\s-]+(iv|iii|ii|i|v|[1-4])$/u;

/**
 * Derived key: NFKC, non-breaking space to space, en/em dash and underscore to
 * hyphen, spaces collapsed, trimmed, case-folded. A trailing numeral that
 * follows a space, a hyphen or both is split off so that `-I`, ` I`, ` - I`,
 * `_I`, `-1` and `Ii` read as the same numeral.
 */
export function deriveKey(label: string): NameKey {
  const folded = label
    .normalize("NFKC")
    .replaceAll(NBSP, " ")
    .replace(DASHES, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  let stem = folded;
  let numeral: number | null = null;
  const match = TRAILING_NUMERAL.exec(folded);
  if (match && match[1].trim().length > 0) {
    stem = match[1].trim();
    numeral = NUMERALS[match[2]] ?? null;
  }

  return {
    raw: label,
    stem,
    compact: stem.replace(/[^\p{L}\p{N}]/gu, ""),
    numeral,
  };
}

/** Words of a stem, split on spaces and hyphens. */
export function stemWords(stem: string): string[] {
  return stem.split(/[\s-]+/u).filter((word) => word.length > 0);
}
