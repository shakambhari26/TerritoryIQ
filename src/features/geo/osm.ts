/**
 * Turns OpenStreetMap relation data (Overpass `out geom`) into polygons, and
 * links administrative-boundary relations to official LGD units.
 *
 * Linking is geography to geography. The district of an OSM block comes from
 * where its outline lies (inside which OSM district polygon), and the block is
 * tied to an LGD block only when the name key matches exactly within the same
 * LGD district. Nothing here reads a sales-territory label.
 */

import {
  assemblePolygons,
  interiorPoint,
  pointInPolygons,
  ringArea,
  type AssembledGeometry,
  type Point,
  type Polygon,
} from "./geometry.ts";
import { deriveKey } from "./names.ts";
import { similarityRatio } from "./similarity.ts";

export interface OsmMember {
  type: string;
  ref: number;
  role: string;
  geometry?: Array<{ lat: number; lon: number }>;
}

export interface OsmRelation {
  id: number;
  tags?: Record<string, string>;
  members?: OsmMember[];
}

/** Way members of a relation as [lon, lat] pieces. Node and relation members are ignored. */
export function relationToGeometry(relation: OsmRelation): AssembledGeometry {
  const pieces = (relation.members ?? [])
    .filter((m) => m.type === "way" && m.geometry && m.geometry.length >= 2)
    .map((m) => ({
      role: m.role,
      points: m.geometry!.map((g): Point => [g.lon, g.lat]),
    }));
  return assemblePolygons(pieces);
}

export function osmName(relation: OsmRelation): string | null {
  const tags = relation.tags ?? {};
  const name = tags.name ?? tags["name:en"];
  return name && name.trim().length > 0 ? name.trim() : null;
}

/**
 * The district whose outline contains an interior point of the block's largest
 * part, or null when no district contains it (a block outside the state).
 * An interior point is used because most of a border block's outline lies
 * exactly on a district edge, where containment tests are unreliable.
 */
export function districtOfBlock(
  block: readonly Polygon[],
  districts: ReadonlyArray<{ code: number; polygons: readonly Polygon[] }>,
): number | null {
  const largest = [...block].sort((a, b) => Math.abs(ringArea(b.outer)) - Math.abs(ringArea(a.outer)))[0];
  if (!largest) return null;
  const point = interiorPoint(largest);
  if (!point) return null;
  return districts.find((district) => pointInPolygons(point, district.polygons))?.code ?? null;
}

// ------------------------------------------------------------------ linking --

export interface LgdBlockRef {
  featureId: string;
  name: string;
  districtCode: number;
}

export interface OsmBlockRef {
  relationId: number;
  name: string;
  /** LGD code of the OSM district polygon that contains this block, or null. */
  districtCode: number | null;
}

export interface VariantSuggestion {
  relationId: number;
  name: string;
  score: number;
}

export type BlockLinkOutcome =
  | { featureId: string; status: "linked"; relationId: number; sourceName: string }
  | { featureId: string; status: "ambiguous"; relationIds: number[]; reason: string }
  | { featureId: string; status: "no-name-match"; reason: string; variants: VariantSuggestion[] };

const VARIANT_THRESHOLD = 0.8;

/**
 * Links each LGD block to at most one OSM relation: same LGD district, same
 * name key (stem or letters-and-digits equality, same numeral), and no other
 * LGD block competing for the same relation. Spelling variants are returned as
 * suggestions only and are never linked.
 */
export function linkBlocks(
  lgdBlocks: readonly LgdBlockRef[],
  osmBlocks: readonly OsmBlockRef[],
): BlockLinkOutcome[] {
  const keyedOsm = osmBlocks
    .filter((b) => b.districtCode !== null)
    .map((b) => ({ ...b, key: deriveKey(b.name) }));

  // First pass: exact name key inside the same district.
  const exact = new Map<string, number[]>();
  for (const block of lgdBlocks) {
    const key = deriveKey(block.name);
    const found = keyedOsm
      .filter(
        (o) =>
          o.districtCode === block.districtCode &&
          o.key.numeral === key.numeral &&
          (o.key.stem === key.stem || o.key.compact === key.compact),
      )
      .map((o) => o.relationId);
    exact.set(block.featureId, found);
  }

  // A relation wanted by more than one LGD block is contested, not linked.
  const claims = new Map<number, number>();
  for (const ids of exact.values()) for (const id of ids) claims.set(id, (claims.get(id) ?? 0) + 1);

  const linkedRelationIds = new Set<number>();
  for (const [featureId, ids] of exact) {
    if (ids.length === 1 && claims.get(ids[0]) === 1) linkedRelationIds.add(ids[0]);
    void featureId;
  }

  return lgdBlocks.map((block): BlockLinkOutcome => {
    const ids = exact.get(block.featureId) ?? [];
    if (ids.length === 1 && claims.get(ids[0]) === 1) {
      const osm = keyedOsm.find((o) => o.relationId === ids[0])!;
      return { featureId: block.featureId, status: "linked", relationId: osm.relationId, sourceName: osm.name };
    }
    if (ids.length > 0) {
      return {
        featureId: block.featureId,
        status: "ambiguous",
        relationIds: ids,
        reason:
          ids.length > 1
            ? "Several boundary features inside this district carry the same name."
            : "Another official block also matches the only boundary feature of this name.",
      };
    }
    const key = deriveKey(block.name);
    const variants = keyedOsm
      .filter((o) => o.districtCode === block.districtCode && !linkedRelationIds.has(o.relationId) && o.key.numeral === key.numeral)
      .map((o) => ({ relationId: o.relationId, name: o.name, score: similarityRatio(key.compact, o.key.compact) }))
      .filter((v) => v.score >= VARIANT_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    return {
      featureId: block.featureId,
      status: "no-name-match",
      reason: "No boundary feature inside this district carries this exact name.",
      variants,
    };
  });
}
