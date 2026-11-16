/**
 * Cleaning the hand-typed area-mapping sheet, shared by the build (scripts/globe/build-area-map.mts) and by sheet
 * uploads in the app (sheet-import.server.ts), so both clean names exactly the same way. Pure.
 *
 * People: names are tidied (spacing collapsed, ALL-CAPS to title case, an accidentally doubled surname dropped), then,
 * within one sales territory, a first name written alone becomes the one full name there that starts with it, and two
 * spellings one letter apart become the more frequent one. Different territories are never merged.
 * Places: one dash style, trailing numerals as "-I", then the reviewed PLACE_NAME_FIXES.
 */

import { deriveKey } from "../../geo/names.ts";
import { PLACE_NAME_FIXES } from "../area-mapping.config.ts";

/** Name key for matching places: case, dashes, spacing and the trailing numeral normalised; "block"/"subdivision" dropped. */
export function matchKey(label: string): string {
  const key = deriveKey(label.replace(/\b(block|subdivision)\b/gi, " "));
  return `${key.compact}#${key.numeral ?? ""}`;
}

export function tidyName(raw: string): string {
  let name = raw.replace(/\s+/g, " ").trim();
  if (name === name.toUpperCase()) {
    name = name.toLowerCase().replace(/(^|[\s.\-/'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  const words = name.split(" ");
  if (words.length >= 3 && words.at(-1)!.toLowerCase() === words.at(-2)!.toLowerCase()) words.pop();
  return words.join(" ");
}

export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = row[j];
      row[j] = next;
    }
  }
  return row[b.length];
}

/** territory → tidy name → canonical name, from every raw name in the sheet with its territory. */
export function buildCanonical(entries: Iterable<{ territory: string; raw: string }>): Map<string, Map<string, string>> {
  const counts = new Map<string, Map<string, number>>();
  for (const { territory, raw } of entries) {
    if (!raw.trim()) continue;
    const names = counts.get(territory) ?? new Map<string, number>();
    counts.set(territory, names);
    const tidy = tidyName(raw);
    names.set(tidy, (names.get(tidy) ?? 0) + 1);
  }
  const canonical = new Map<string, Map<string, string>>();
  for (const [territory, names] of counts) {
    const map = new Map<string, string>([...names.keys()].map((n) => [n, n]));
    const full = [...names.keys()].filter((n) => n.includes(" "));
    for (const name of names.keys()) {
      if (name.includes(" ")) continue;
      const matches = full.filter((f) => f.split(" ")[0].toLowerCase() === name.toLowerCase());
      if (matches.length === 1) map.set(name, matches[0]);
    }
    const ranked = [...names.keys()].filter((n) => n.includes(" ")).sort((a, b) => names.get(b)! - names.get(a)! || a.localeCompare(b));
    for (const [i, name] of ranked.entries()) {
      const key = name.toLowerCase().replace(/\s/g, "");
      const better = ranked.slice(0, i).find((m) => editDistance(m.toLowerCase().replace(/\s/g, ""), key) <= 1);
      if (better) map.set(name, map.get(better)!);
    }
    canonical.set(territory, map);
  }
  return canonical;
}

/** A place's display name: the sheet label tidied (one dash style, numerals as "-I"), then PLACE_NAME_FIXES. */
export function placeName(label: string): string {
  let name = label.replaceAll("–", "-").replace(/\s+/g, " ").trim().replace(/\s*-\s*/g, "-");
  name = name.replace(/^(.*\S)[\s-]+(i{1,3}|iv|v)$/i, (_, stem: string, numeral: string) => `${stem}-${numeral.toUpperCase()}`);
  name = name.replace(/\b(BOROUGH)\b/, "Borough");
  return PLACE_NAME_FIXES[name] ?? name;
}
