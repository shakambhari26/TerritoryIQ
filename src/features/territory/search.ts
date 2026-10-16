/**
 * Search over official districts and blocks, by name. Every result carries the
 * internal ID of the feature and the name of its district, so two blocks with
 * the same name (`Sankrail` exists under both Howrah and Jhargram) are two
 * results, told apart by district and selected by ID, never by name.
 *
 * Names are compared on a derived key (case, spacing, dashes and trailing
 * numerals normalised: `Kharagpur -I`, `kharagpur 1` and `Kharagpur I` agree).
 * The official name is shown as the LGD prints it.
 */

import { deriveKey } from "../geo/names.ts";
import type { GeoFeature } from "./types.ts";

export interface SearchEntry {
  id: string;
  kind: "district" | "block";
  name: string;
  districtId: string | null;
  /** The district's official name (the entry's own name for a district). */
  districtName: string;
  /** Normalised words, for matching. */
  text: string;
  /** `text` without spaces. */
  compact: string;
  /** Whether an outline is drawn for it, so a result can say it has none. */
  drawn: boolean;
}

export interface SearchHit extends SearchEntry {
  score: number;
}

const normalise = (value: string): string => {
  const key = deriveKey(value);
  const stem = key.stem.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return key.numeral === null ? stem : `${stem} ${key.numeral}`;
};

export function buildSearchIndex(features: readonly GeoFeature[], shapeIds: ReadonlySet<string>): SearchEntry[] {
  const nameById = new Map(features.map((f) => [f.id, f.name]));
  return features.map((feature) => {
    const text = normalise(feature.name);
    return {
      id: feature.id,
      kind: feature.kind,
      name: feature.name,
      districtId: feature.kind === "district" ? feature.id : feature.districtId,
      districtName: feature.kind === "district" ? feature.name : (nameById.get(feature.districtId ?? "") ?? ""),
      text,
      compact: text.replace(/\s+/g, ""),
      drawn: shapeIds.has(feature.id),
    };
  });
}

export interface SearchScope {
  /** The district the map is focused on, if any. */
  districtId: string | null;
  /** Only blocks of that district (and not the district itself or any other). */
  onlyDistrict: boolean;
}

function scoreOf(entry: SearchEntry, query: string, compactQuery: string): number {
  if (entry.text === query || entry.compact === compactQuery) return 100;
  if (entry.text.startsWith(query)) return 80;
  if (entry.text.split(" ").some((word) => word.startsWith(query))) return 60;
  if (entry.compact.startsWith(compactQuery)) return 55;
  if (entry.compact.includes(compactQuery)) return 40;
  return 0;
}

/**
 * Matches in order of relevance. A district outranks a block of the same score,
 * and a block in the focused district outranks one elsewhere. Ties fall back on
 * name and then ID, so the order is stable. An empty query returns nothing.
 */
export function searchFeatures(index: readonly SearchEntry[], rawQuery: string, scope: SearchScope, limit = 12): SearchHit[] {
  const query = normalise(rawQuery);
  const compactQuery = query.replace(/\s+/g, "");
  if (compactQuery.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const entry of index) {
    if (scope.onlyDistrict && scope.districtId !== null && !(entry.kind === "block" && entry.districtId === scope.districtId)) continue;
    const base = scoreOf(entry, query, compactQuery);
    if (base === 0) continue;
    const inFocus = scope.districtId !== null && entry.districtId === scope.districtId;
    hits.push({ ...entry, score: base + (inFocus ? 15 : 0) + (entry.kind === "district" ? 5 : 0) });
  }
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return hits.slice(0, limit);
}
