/**
 * Places the visitor can pick and the search over them. Pure.
 */

import type { GlobeManifest, UnitState } from "./types.ts";

export type TargetKind = "state" | "district" | "block";

export interface Target {
  kind: TargetKind;
  id: string;
  name: string;
  /** Parent district name for a block, the state name for a district. */
  context: string | null;
  state: UnitState;
  /** Whether a validated outline will be drawn for it. */
  drawn: boolean;
}

export function buildTargets(overlay: GlobeManifest): Target[] {
  const districtName = new Map(overlay.districts.map((d) => [d.id, d.name]));
  const targets: Target[] = [];
  if (overlay.state.bbox) {
    targets.push({ kind: "state", id: overlay.state.id, name: overlay.state.name, context: null, state: "unresolved", drawn: false });
  }
  for (const d of overlay.districts) {
    targets.push({ kind: "district", id: d.id, name: d.name, context: overlay.state.name, state: d.state, drawn: d.geometry !== null });
  }
  for (const b of overlay.blocks) {
    targets.push({
      kind: "block",
      id: b.id,
      name: b.name,
      context: b.districtId ? (districtName.get(b.districtId) ?? null) : null,
      state: b.state,
      drawn: b.geometry !== null,
    });
  }
  return targets;
}

const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Case- and punctuation-insensitive search. A name that starts with the query ranks first, then a word that does,
 * then any substring; the district a block sits in also matches. At most `limit` results.
 */
export function searchTargets(targets: readonly Target[], query: string, limit = 10): Target[] {
  const q = fold(query);
  if (q === "") return [];
  const scored: Array<{ target: Target; score: number }> = [];
  for (const target of targets) {
    const name = fold(target.name);
    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.split(" ").some((word) => word.startsWith(q))) score = 2;
    else if (name.includes(q)) score = 3;
    else if (target.context && fold(target.context).startsWith(q)) score = 4;
    if (score >= 0) scored.push({ target, score });
  }
  const order = { state: 0, district: 1, block: 2 } as const;
  scored.sort((a, b) => a.score - b.score || order[a.target.kind] - order[b.target.kind] || a.target.name.localeCompare(b.target.name));
  return scored.slice(0, limit).map((s) => s.target);
}

export interface PickableRef {
  kind: "district" | "block";
  id: string;
  name: string;
}

/**
 * The outlines currently on screen, in the order the arrow keys step through them: west to east, then north to
 * south. Blocks of the revealed district when there are any, otherwise the districts.
 */
export function pickableRefs(overlay: GlobeManifest, revealed: { districts: boolean; blocksFor: string | null }): PickableRef[] {
  const items: Array<PickableRef & { x: number; y: number }> = [];
  if (revealed.blocksFor) {
    for (const b of overlay.blocks) {
      if (b.districtId === revealed.blocksFor && b.geometry) {
        const [west, south, east, north] = b.geometry.bbox;
        items.push({ kind: "block", id: b.id, name: b.name, x: (west + east) / 2, y: (south + north) / 2 });
      }
    }
  } else if (revealed.districts) {
    for (const d of overlay.districts) {
      if (d.geometry) {
        const [west, south, east, north] = d.geometry.bbox;
        items.push({ kind: "district", id: d.id, name: d.name, x: (west + east) / 2, y: (south + north) / 2 });
      }
    }
  }
  items.sort((a, b) => a.x - b.x || b.y - a.y);
  return items.map(({ kind, id, name }) => ({ kind, id, name }));
}
