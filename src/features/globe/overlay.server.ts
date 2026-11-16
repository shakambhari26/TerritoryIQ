import "server-only";
import type { BlockRow } from "./block-rows";
import { neutraliseUnreviewed } from "./classification";
import { buildBlockRowIndex, projectManifest } from "./overlay-projection.server";
import { currentTeam, teamDataAvailable } from "./team-data.server";
import type { GlobeManifest } from "./types";

/**
 * Server-side access to the globe data: the area-mapping build (`npm run data:build-globe`) with the team list in force
 * (team-data.server.ts). Server only: the data holds staff names, so it is never imported from a client component and
 * never written to `public/`. It holds no outline path data; that is served by `/geo/globe-boundaries.json`.
 *
 * What leaves this module is a projection with no names (`getGlobeManifest`, for the page) and one block's or one
 * district's rows on request (`getBlockRows`, `getDistrictTeam`, for the team lookups). All are null when nothing is
 * built. The projection is recomputed only when the team version changes.
 */
interface Projected {
  versionId: number;
  manifest: GlobeManifest;
  rows: Map<string, BlockRow[]>;
  blocksByDistrict: Map<string, string[]>;
}
let projected: Projected | null = null;

async function load(): Promise<Projected | null> {
  const team = await currentTeam();
  if (!team) return null;
  if (projected?.versionId === team.versionId) return projected;
  // A "no representative" state without a reviewed source record is not honoured (see classification.ts).
  const projectedManifest = neutraliseUnreviewed(projectManifest(team.server));
  const manifest = { ...projectedManifest, meta: { ...projectedManifest.meta, teamVersion: team.versionId } };
  const blocksByDistrict = new Map<string, string[]>(manifest.districts.map((d) => [d.id, []]));
  for (const block of manifest.blocks) if (block.districtId) blocksByDistrict.get(block.districtId)?.push(block.id);
  projected = { versionId: team.versionId, manifest, rows: buildBlockRowIndex(team.server), blocksByDistrict };
  return projected;
}

export async function getGlobeManifest(): Promise<GlobeManifest | null> {
  return (await load())?.manifest ?? null;
}

/** The rows of one block: an array (empty for a block with none), or null for an ID that is no block or when nothing is built. */
export async function getBlockRows(blockId: string): Promise<BlockRow[] | null> {
  return (await load())?.rows.get(blockId) ?? null;
}

/** Whether the globe data was built, to tell "not built" from "no such block". */
export function blockRowsAvailable(): Promise<boolean> {
  return teamDataAvailable();
}

/**
 * Every place in one district with its rows, in the manifest's order (the order the page lists them in), or null for an
 * ID that is no district or when nothing is built. For POST /api/globe/district-team.
 */
export async function getDistrictTeam(districtId: string): Promise<Array<{ blockId: string; rows: BlockRow[] }> | null> {
  const data = await load();
  const ids = data?.blocksByDistrict.get(districtId);
  if (!data || !ids) return null;
  return ids.map((blockId) => ({ blockId, rows: data.rows.get(blockId) ?? [] }));
}
