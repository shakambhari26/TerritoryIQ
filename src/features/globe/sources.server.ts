import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ServerManifest } from "./server-types";
import { teamStore } from "./team-store.server";
import type { VersionMeta } from "./team-types";
import type { DataSource } from "./types";

/**
 * The "Data sources" card: for every layer on the globe, where its data comes from, when it was last uploaded or
 * fetched, who uploaded it, and how to check it against the original. Built from facts the app already keeps (the
 * saved team versions, the build's own record), never typed in by hand.
 *
 * A later layer (dealers, distributors, influencers) writes `meta.source` into its built file under data/generated;
 * listing that file in LAYER_FILES is all it takes to show it here:
 *   meta.source = { kind: "api" | "upload", from: "<plain words>", at: "<ISO time>", fileName?, by?, verify: "<how to check>" }
 *   meta.counts = { total: <number>, ... }   (shown as "<total> <noun>")
 */

const LAYER_FILES: Array<{ id: string; layer: string; file: string; noun: string }> = [
  { id: "dealers", layer: "Dealers", file: "dealers.json", noun: "dealers" },
];

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

export function teamSource(server: ServerManifest, latest: VersionMeta | null, lastUpload: VersionMeta | null): DataSource {
  const people = server.meta.sheet?.staff ?? 0;
  const places = server.blocks.filter((b) => b.staff > 0).length;
  const detail = `${plural(people, "person", "people")} · ${plural(places, "place", "places")}`;
  const verify = "Every change is listed under Manage the team → Change history, and any earlier version can be restored.";
  if (!latest) {
    return { id: "team", layer: "Team", kind: "built-in", from: "AREA MAPPING.xlsx, the area-mapping sheet the app was built with", at: server.meta.generatedAt ?? null, fileName: "AREA MAPPING.xlsx", detail, verify };
  }
  if (lastUpload) {
    return {
      id: "team",
      layer: "Team",
      kind: "upload",
      from: "Excel sheet uploaded in the app",
      at: lastUpload.createdAt,
      ...(lastUpload.by ? { by: lastUpload.by } : {}),
      ...(lastUpload.fileName ? { fileName: lastUpload.fileName } : {}),
      ...(latest.id !== lastUpload.id ? { changedAt: latest.createdAt } : {}),
      detail,
      verify,
    };
  }
  return { id: "team", layer: "Team", kind: "built-in", from: "The area-mapping sheet, changed in the app since", at: latest.createdAt, detail, verify };
}

async function layerSource(entry: (typeof LAYER_FILES)[number]): Promise<DataSource | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path.join(process.cwd(), "data", "generated", entry.file), "utf8"));
  } catch {
    return null; // not built: the layer is not on the globe, so it is not listed
  }
  const meta = (parsed as { meta?: { source?: Record<string, unknown>; counts?: { total?: unknown } } }).meta;
  const s = meta?.source;
  if (!s || (s.kind !== "api" && s.kind !== "upload") || typeof s.from !== "string" || typeof s.verify !== "string") return null;
  const total = typeof meta?.counts?.total === "number" ? meta.counts.total : null;
  return {
    id: entry.id,
    layer: entry.layer,
    kind: s.kind,
    from: s.from,
    at: typeof s.at === "string" ? s.at : null,
    ...(typeof s.by === "string" ? { by: s.by } : {}),
    ...(typeof s.fileName === "string" ? { fileName: s.fileName } : {}),
    detail: total === null ? "" : plural(total, entry.noun.replace(/s$/, ""), entry.noun),
    verify: s.verify,
  };
}

export async function dataSources(server: ServerManifest, latest: VersionMeta | null): Promise<DataSource[]> {
  let lastUpload: VersionMeta | null = null;
  if (latest) {
    try {
      lastUpload = (await teamStore().history(200)).find((v) => v.kind === "upload") ?? null;
    } catch {
      lastUpload = null;
    }
  }
  const layers = await Promise.all(LAYER_FILES.map(layerSource));
  return [teamSource(server, latest, lastUpload), ...layers.filter((l): l is DataSource => l !== null)];
}
