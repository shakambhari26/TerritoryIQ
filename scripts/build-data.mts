/**
 * Builds the local prototype dataset.
 *
 *   data-source/*  (read-only)  ─┬─> data/generated/dataset.json     units, sales territories, official features, crosswalk
 *   data/raw/osm/* (fetched)    ─┴─> data/generated/boundaries.json simplified boundary shapes with provenance
 *                                    data/generated/build-report.json  counts, link evidence, gaps
 *
 * Everything is written under data/generated/, which is server-only and git-ignored.
 * Nothing is written to public/, because Next serves every file there verbatim to
 * anything that can reach the port. The app serves the boundary layer through the
 * route handler at /geo/boundaries.json instead.
 *
 * The source files are hashed before and after and the build fails if either
 * hash differs from the recorded value. Network access is never used here; run
 * `npm run data:fetch-osm` first to obtain boundary data.
 */
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCrosswalkEntry, matchLabel, toOfficialUnit } from "../src/features/geo/crosswalk.ts";
import type { Polygon } from "../src/features/geo/geometry.ts";
import { encodeShape, LAYER_SCALE, unionViewBox } from "../src/features/geo/layer.ts";
import {
  districtOfBlock,
  linkBlocks,
  osmName,
  relationToGeometry,
  type OsmRelation,
} from "../src/features/geo/osm.ts";
import type {
  BoundaryLayer,
  BoundaryShape,
  CrosswalkEntry,
  GeoFeature,
  TerritoryDataset,
} from "../src/features/territory/types.ts";
import { readLgdBlocks, readLgdDistricts } from "./lib/lgd.ts";
import { checkSources, ROOT, sha256File, sourcePath, SOURCES } from "./lib/sources.ts";
import { readWorkbook } from "./lib/workbook.ts";

const GENERATED_DIR = path.join(ROOT, "data", "generated");
const RAW_OSM_DIR = path.join(ROOT, "data", "raw", "osm");
/** Douglas-Peucker tolerance in degrees (about 65 m). */
const TOLERANCE_DEGREES = 0.0006;
const TODAY = new Date().toISOString();

// ----------------------------------------------------------- 1. sources ----

const before = await checkSources();
if (before.some((c) => !c.ok)) {
  console.error("A source file does not match its recorded hash. Run `npm run data:verify`. Nothing was built.");
  process.exit(1);
}
const sourceInfo = (key: (typeof SOURCES)[number]["key"]) => {
  const check = before.find((c) => c.spec.key === key)!;
  return { file: check.spec.file, sha256: check.actual!, bytes: check.bytes! };
};

const spec = (key: (typeof SOURCES)[number]["key"]) => SOURCES.find((s) => s.key === key)!;
const workbook = await readWorkbook(sourcePath(spec("workbook")));
const lgdDistricts = await readLgdDistricts(sourcePath(spec("lgdDistricts")));
const lgdBlocks = await readLgdBlocks(sourcePath(spec("lgdBlocks")));

// ----------------------------------------------------- 2. official units ----

const features: GeoFeature[] = [];
for (const district of lgdDistricts.districts) {
  features.push({
    id: `GD-${district.code}`,
    kind: "district",
    lgdCode: district.code,
    name: district.name,
    districtId: null,
    villageRows: null,
    boundary: null,
    boundaryGap: "Not yet linked to a boundary source feature.",
  });
}
const blocksSorted = [...lgdBlocks.blocks].sort((a, b) => a.districtCode - b.districtCode || a.code - b.code);
for (const block of blocksSorted) {
  features.push({
    id: `GB-${block.code}`,
    kind: "block",
    lgdCode: block.code,
    name: block.name,
    districtId: `GD-${block.districtCode}`,
    villageRows: block.villageRows,
    boundary: null,
    boundaryGap: "Not yet linked to a boundary source feature.",
  });
}
const featureById = new Map(features.map((f) => [f.id, f]));

// ------------------------------------------------------- 3. crosswalk ------

const pool = features.map((f) => toOfficialUnit(f.id, f.kind, f.name));
const kindOf = (id: string) => featureById.get(id)!.kind;
const crosswalk: CrosswalkEntry[] = workbook.units.map((unit) =>
  buildCrosswalkEntry(unit.id, matchLabel(unit.blockLabel, pool), kindOf),
);
const countStatus = (status: CrosswalkEntry["status"]) => crosswalk.filter((c) => c.status === status).length;
const exactTierRows = crosswalk.filter((c) => c.candidates.some((cand) => cand.tier === "T1" || cand.tier === "T2")).length;

// -------------------------------------------------------- 4. boundaries ----

interface RawGeomFile {
  osm3s?: { timestamp_osm_base?: string };
  elements: OsmRelation[];
}
const rawFiles = (await readdir(RAW_OSM_DIR).catch(() => [])).filter((f) => /^(districts|blocks)-geom-\d+\.json$/.test(f)).sort();
const layerShapes: BoundaryShape[] = [];
const linkReport: unknown[] = [];
const rawSha256: Record<string, string> = {};
const snapshots = new Set<string>();
let boundaryNote = "";

if (rawFiles.length === 0) {
  boundaryNote = "No raw OpenStreetMap data found in data/raw/osm. Run `npm run data:fetch-osm`. The app will show boundary-unavailable states.";
  console.warn(boundaryNote);
} else {
  const relations: OsmRelation[] = [];
  for (const file of rawFiles) {
    const full = path.join(RAW_OSM_DIR, file);
    rawSha256[file] = await sha256File(full);
    const json = JSON.parse(await readFile(full, "utf8")) as RawGeomFile;
    if (json.osm3s?.timestamp_osm_base) snapshots.add(json.osm3s.timestamp_osm_base);
    relations.push(...json.elements);
  }

  // Districts: joined by the LGD code OSM carries (a code join, not a name join).
  const districtGeometry = new Map<number, { polygons: Polygon[]; relationId: number; name: string; complete: boolean }>();
  for (const relation of relations) {
    if (relation.tags?.admin_level !== "5") continue;
    const code = Number(relation.tags["ref:LGD:district"]);
    if (!featureById.has(`GD-${code}`)) continue;
    const geometry = relationToGeometry(relation);
    districtGeometry.set(code, {
      polygons: geometry.polygons,
      relationId: relation.id,
      name: osmName(relation) ?? "",
      complete: geometry.openPieces === 0 && geometry.polygons.length > 0,
    });
  }

  // Blocks: assign each OSM block to the district polygon that holds it.
  const districtList = [...districtGeometry.entries()].map(([code, d]) => ({ code, polygons: d.polygons }));
  const blockGeometry = new Map<number, { polygons: Polygon[]; name: string; complete: boolean; districtCode: number }>();
  let blocksOutsideState = 0;
  for (const relation of relations) {
    if (relation.tags?.admin_level !== "6") continue;
    const name = osmName(relation);
    if (!name) continue;
    const geometry = relationToGeometry(relation);
    if (geometry.polygons.length === 0) continue;
    const districtCode = districtOfBlock(geometry.polygons, districtList);
    if (districtCode === null) {
      blocksOutsideState++;
      continue;
    }
    blockGeometry.set(relation.id, {
      polygons: geometry.polygons,
      name,
      complete: geometry.openPieces === 0,
      districtCode,
    });
  }

  const outcomes = linkBlocks(
    features.filter((f) => f.kind === "block").map((f) => ({
      featureId: f.id,
      name: f.name,
      districtCode: Number(f.districtId!.slice(3)),
    })),
    [...blockGeometry.entries()].map(([relationId, b]) => ({ relationId, name: b.name, districtCode: b.districtCode })),
  );

  const drawn: Array<{ id: string; relationId: number; polygons: Polygon[] }> = [];
  for (const [code, d] of districtGeometry) {
    const feature = featureById.get(`GD-${code}`)!;
    if (!d.complete) {
      feature.boundaryGap = "The district outline in the source extract is incomplete, so it is not drawn.";
      continue;
    }
    feature.boundary = { source: "osm", relationId: d.relationId, sourceName: d.name, basis: "lgd-district-code" };
    feature.boundaryGap = null;
    drawn.push({ id: feature.id, relationId: d.relationId, polygons: d.polygons });
  }
  for (const feature of features) {
    if (feature.kind === "district" && !districtGeometry.has(feature.lgdCode)) {
      feature.boundaryGap = "No OpenStreetMap district relation carries this LGD district code.";
    }
  }
  for (const outcome of outcomes) {
    const feature = featureById.get(outcome.featureId)!;
    if (outcome.status === "linked") {
      const b = blockGeometry.get(outcome.relationId)!;
      if (!b.complete) {
        feature.boundaryGap = "The boundary outline in the source extract is incomplete, so it is not drawn.";
        linkReport.push({ featureId: feature.id, name: feature.name, outcome: "incomplete-geometry", relationId: outcome.relationId });
        continue;
      }
      feature.boundary = {
        source: "osm",
        relationId: outcome.relationId,
        sourceName: outcome.sourceName,
        basis: "name-and-district-containment",
      };
      feature.boundaryGap = null;
      drawn.push({ id: feature.id, relationId: outcome.relationId, polygons: b.polygons });
    } else if (outcome.status === "ambiguous") {
      feature.boundaryGap = `No boundary assigned: ${outcome.reason}`;
      linkReport.push({ featureId: feature.id, name: feature.name, outcome: "ambiguous", relationIds: outcome.relationIds });
    } else {
      feature.boundaryGap = `No boundary assigned: ${outcome.reason}`;
      linkReport.push({
        featureId: feature.id,
        name: feature.name,
        district: featureById.get(feature.districtId!)!.name,
        outcome: "no-name-match",
        suggestionsNotApplied: outcome.variants,
      });
    }
  }

  for (const item of drawn) {
    const encoded = encodeShape(item.polygons, TOLERANCE_DEGREES);
    if (!encoded) {
      const feature = featureById.get(item.id)!;
      feature.boundary = null;
      feature.boundaryGap = "The outline collapsed to nothing when simplified, so it is not drawn.";
      continue;
    }
    layerShapes.push({ featureId: item.id, d: encoded.d, bbox: encoded.bbox, anchor: encoded.anchor });
  }
  console.log(
    `OSM: ${districtGeometry.size} districts, ${blockGeometry.size} blocks inside the state ` +
      `(${blocksOutsideState} level-6 relations outside it ignored)`,
  );
}

// Districts first so blocks paint on top.
layerShapes.sort((a, b) => Number(b.featureId.startsWith("GD-")) - Number(a.featureId.startsWith("GD-")));

const manifest = await readFile(path.join(RAW_OSM_DIR, "manifest.json"), "utf8")
  .then((t) => JSON.parse(t) as Array<{ fetchedAt: string }>)
  .catch(() => []);
const retrievedAt = manifest.map((m) => m.fetchedAt).sort()[0] ?? (rawFiles.length ? TODAY : "");

const layer: BoundaryLayer = {
  meta: {
    datasetId: "osm-west-bengal-admin-5-6",
    title: "Indicative district and block outlines (OpenStreetMap, community-sourced)",
    source: "OpenStreetMap via the public Overpass API (admin_level 5 and 6 boundary relations)",
    licence: "Open Database Licence (ODbL) 1.0",
    attribution: "© OpenStreetMap contributors",
    snapshots: [...snapshots].sort(),
    retrievedAt,
    rawSha256,
    projection: `Spherical Mercator, ${LAYER_SCALE} layer units per degree, y down`,
    simplificationDegrees: TOLERANCE_DEGREES,
    status:
      "Provisional. Outlines are unofficial and not an authoritative depiction. Block links are by exact name within the official district and have not been reviewed. Legal review of ODbL use is not recorded.",
  },
  viewBox: layerShapes.length ? unionViewBox(layerShapes.map((s) => s.bbox)) : [0, 0, 0, 0],
  shapes: layerShapes,
};

// ----------------------------------------------------------- 5. outputs ----

const dataset: TerritoryDataset = {
  meta: {
    generatedAt: TODAY,
    workbook: { ...sourceInfo("workbook"), dataRows: workbook.stats.dataRows },
    lgdDistricts: { ...sourceInfo("lgdDistricts"), reportGenerated: lgdDistricts.reportGenerated },
    lgdBlocks: { ...sourceInfo("lgdBlocks"), reportGenerated: lgdBlocks.reportGenerated, villageRows: lgdBlocks.villageRows },
    matching: {
      protocol:
        "Phase 0E tiers T1 to T4 on block labels only; the DISTRICT sales-territory label is not an input. Only a single exact-name block candidate becomes a provisional link.",
      exactTierRows,
      provisionalRows: countStatus("provisional"),
      ambiguousRows: countStatus("ambiguous"),
      weakRows: countStatus("weak"),
      noneRows: countStatus("none"),
    },
  },
  salesTerritories: workbook.salesTerritories,
  units: workbook.units,
  features,
  crosswalk,
};

await mkdir(GENERATED_DIR, { recursive: true });
await writeFile(path.join(GENERATED_DIR, "dataset.json"), JSON.stringify(dataset));
await writeFile(path.join(GENERATED_DIR, "boundaries.json"), JSON.stringify(layer));

const blockFeatures = features.filter((f) => f.kind === "block");
const drawnBlocks = blockFeatures.filter((f) => f.boundary).length;
const drawnDistricts = features.filter((f) => f.kind === "district" && f.boundary).length;
const provisionalWithShape = crosswalk.filter((c) => c.status === "provisional" && featureById.get(c.featureId!)?.boundary).length;

const after = await checkSources();
const report = {
  generatedAt: TODAY,
  workbook: workbook.stats,
  territories: workbook.salesTerritories.length,
  units: workbook.units.length,
  officialDistricts: features.length - blockFeatures.length,
  officialBlocks: blockFeatures.length,
  crosswalk: {
    exactTierRows,
    provisional: countStatus("provisional"),
    ambiguous: countStatus("ambiguous"),
    weak: countStatus("weak"),
    none: countStatus("none"),
    expectedFromPhase0E: { exactTierRows: 301, singleExact: 298, multipleExact: 3, weak: 43, none: 14 },
  },
  boundaries: {
    districtsDrawn: drawnDistricts,
    blocksDrawn: drawnBlocks,
    blocksWithoutBoundary: blockFeatures.length - drawnBlocks,
    unitsWithProvisionalBoundary: provisionalWithShape,
    layerBytes: Buffer.byteLength(JSON.stringify(layer)),
    note: boundaryNote,
  },
  blockLinkReport: linkReport,
  sourceHashes: { checkedAt: new Date().toISOString(), before: before.map((c) => ({ file: c.spec.file, sha256: c.actual, ok: c.ok })), after: after.map((c) => ({ file: c.spec.file, sha256: c.actual, ok: c.ok })) },
};
await writeFile(path.join(GENERATED_DIR, "build-report.json"), JSON.stringify(report, null, 2));

console.log(JSON.stringify({ ...report, blockLinkReport: `${linkReport.length} entries (see build-report.json)` }, null, 2));
if (after.some((c) => !c.ok)) {
  console.error("A source file hash changed during the build.");
  process.exit(1);
}
void stat;
