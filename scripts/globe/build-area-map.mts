/**
 * Builds the globe from the area-mapping sheet: one map unit per place the sheet names, each carrying every sheet row
 * (ASM, PRIMARY, SECONDARY, DSO) that lists it. Nothing else feeds the globe: no visits, customers or inferred links.
 *
 *   node scripts/globe/build-area-map.mts           # writes data/generated/globe-overlay.json and globe-boundaries.json
 *   node scripts/globe/build-area-map.mts --check   # resolve and report, write nothing
 *
 * Inputs (read-only, offline)
 *   data-source/AREA MAPPING.xlsx       the sheet (hash-checked by scripts/lib/sources.ts)
 *   data/raw/osm/*-geom-*.json          OpenStreetMap district (admin 5) and block (admin 6) relations
 *   data/generated/dataset.json         official LGD district / block codes, used only to label units with their code
 *   scripts/globe/area-mapping.config.ts how each sheet row lands on the map (reviewed rules; see that file)
 *
 * Every sheet row must resolve to exactly one of: an OpenStreetMap block outline (automatic name match inside the
 * row's district, or an explicit alias), an area without an outline (placed in its district, never given an invented
 * shape), or "outside West Bengal". The build fails on any row that resolves to nothing, or to more than one outline.
 *
 * Output keeps the format the app already validates (src/features/globe/types.ts, server-types.ts): a manifest with
 * outline summaries and each unit's sheet rows (names stay server-side), and the globe's own outline file whose
 * SHA-256 the manifest records. Each outline summary is computed with the browser's own decoder, so the browser's
 * join (layer-merge.ts) accepts exactly what was built here.
 */

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ALIASES, AREAS_WITHOUT_OUTLINE, OUTSIDE_STATE, PLACE_NAME_FIXES, TERRITORY_DISTRICT } from "./area-mapping.config.ts";
import { deriveKey } from "../../src/features/geo/names.ts";
import { districtOfBlock, osmName, relationToGeometry, type OsmRelation } from "../../src/features/geo/osm.ts";
import type { Polygon as GeoPolygon } from "../../src/features/geo/geometry.ts";
import { encodeShape, unionViewBox } from "../../src/features/geo/layer.ts";
import { layerToLngLat } from "../../src/features/geo/projection.ts";
import { decodeGeometry } from "../../src/features/globe/shapes.ts";
import { GLOBE_LAYER_FILE, GLOBE_LAYER_KIND } from "../../src/features/globe/layer-identity.ts";
import type { BoundaryShape } from "../../src/features/territory/types.ts";
import { checkSources, ROOT, sourcePath, SOURCES } from "../lib/sources.ts";
import { readWorkbook } from "../lib/workbook.ts";

const CHECK_ONLY = process.argv.includes("--check");
const GENERATED = path.join(ROOT, "data", "generated");
const RAW_OSM = path.join(ROOT, "data", "raw", "osm");
/** Douglas-Peucker tolerance in degrees (about 65 m), the same as the workspace layer. */
const TOLERANCE_DEGREES = 0.0006;
const STATUS =
  "Provisional outlines from OpenStreetMap (community-sourced, simplified, not official boundaries). Who works where comes only from the area-mapping sheet.";

// ------------------------------------------------------------------ sources --
const checks = await checkSources();
if (checks.some((c) => !c.ok)) {
  console.error("A source file does not match its recorded hash. Run `npm run data:verify`. Nothing was built.");
  process.exit(1);
}
const workbookSpec = SOURCES.find((s) => s.key === "workbook")!;
const workbookPath = sourcePath(workbookSpec);
const workbookSha = checks.find((c) => c.spec.key === "workbook")!.actual!;
const sheet = await readWorkbook(workbookPath);
const territoryLabel = new Map(sheet.salesTerritories.map((t) => [t.id, t.label]));

const dataset = JSON.parse(await readFile(path.join(GENERATED, "dataset.json"), "utf8")) as {
  features: Array<{ id: string; kind: "district" | "block"; lgdCode: number; name: string; districtId: string | null; boundary: { relationId?: number } | null }>;
};
const lgdDistrictByName = new Map(dataset.features.filter((f) => f.kind === "district").map((f) => [f.name, f]));
const lgdBlockByRelation = new Map(
  dataset.features.filter((f) => f.kind === "block" && f.boundary?.relationId).map((f) => [f.boundary!.relationId!, f]),
);
const lgdBlocks = dataset.features.filter((f) => f.kind === "block");

// ---------------------------------------------------------------- geometry --
const relations: OsmRelation[] = [];
const snapshots = new Set<string>();
const rawFiles = (await readdir(RAW_OSM)).filter((f) => /-geom-\d+\.json$/.test(f)).sort();
const rawSha: Record<string, string> = {};
for (const file of rawFiles) {
  const bytes = await readFile(path.join(RAW_OSM, file));
  rawSha[file] = createHash("sha256").update(bytes).digest("hex");
  const json = JSON.parse(bytes.toString("utf8")) as { elements: OsmRelation[]; osm3s?: { timestamp_osm_base?: string } };
  if (json.osm3s?.timestamp_osm_base) snapshots.add(json.osm3s.timestamp_osm_base);
  relations.push(...json.elements);
}
const osmManifest = JSON.parse(await readFile(path.join(RAW_OSM, "manifest.json"), "utf8")) as Array<{ fetchedAt: string }>;
const retrievedAt = osmManifest.map((m) => m.fetchedAt).sort().at(-1)!;

interface OsmDistrict {
  code: number;
  name: string;
  relationId: number;
  polygons: GeoPolygon[];
}
const districts: OsmDistrict[] = [];
for (const r of relations) {
  if (r.tags?.admin_level !== "5") continue;
  const code = Number(r.tags["ref:LGD:district"]);
  const lgd = [...lgdDistrictByName.values()].find((d) => d.lgdCode === code);
  if (!lgd) continue;
  const g = relationToGeometry(r);
  if (g.openPieces > 0 || g.polygons.length === 0) throw new Error(`District outline for ${lgd.name} is incomplete in the OSM extract.`);
  districts.push({ code, name: lgd.name, relationId: r.id, polygons: g.polygons });
}
const districtByName = new Map(districts.map((d) => [d.name, d]));
const districtByCode = new Map(districts.map((d) => [d.code, d]));

interface OsmBlock {
  relationId: number;
  name: string;
  districtCode: number;
  polygons: GeoPolygon[];
  complete: boolean;
}
const osmBlocks: OsmBlock[] = [];
for (const r of relations) {
  if (r.tags?.admin_level !== "6") continue;
  const name = osmName(r);
  if (!name) continue;
  const g = relationToGeometry(r);
  if (g.polygons.length === 0) continue;
  const code = districtOfBlock(g.polygons, districts);
  if (code === null) continue;
  osmBlocks.push({ relationId: r.id, name, districtCode: code, polygons: g.polygons, complete: g.openPieces === 0 });
}

/** Name key for matching: lower case, dashes and spacing unified, trailing numeral split off, "block"/"subdivision" dropped. */
function matchKey(label: string): string {
  const key = deriveKey(label.replace(/\b(block|subdivision)\b/gi, " "));
  return `${key.compact}#${key.numeral ?? ""}`;
}

// ------------------------------------------------------------- resolve rows --
type Resolution =
  | { kind: "outline"; block: OsmBlock; rule: "automatic" | "alias"; note: string | null }
  | { kind: "area"; key: string; name: string; district: OsmDistrict; note: string }
  | { kind: "outside"; note: string };

const problems: string[] = [];
const resolutions = new Map<string, Resolution>();
const usedRules = new Set<string>();

for (const unit of sheet.units) {
  const territory = territoryLabel.get(unit.salesTerritoryId)!;
  const label = unit.blockLabel.trim();
  const ruleKey = `${territory}|${label}`;
  const where = `row ${unit.sourceRow} (${ruleKey})`;
  const ruleCount = [ALIASES[ruleKey], AREAS_WITHOUT_OUTLINE[ruleKey], OUTSIDE_STATE[ruleKey]].filter(Boolean).length;
  if (ruleCount > 1) {
    problems.push(`${where}: more than one rule in area-mapping.config.ts`);
    continue;
  }
  if (OUTSIDE_STATE[ruleKey]) {
    usedRules.add(ruleKey);
    resolutions.set(unit.id, { kind: "outside", note: OUTSIDE_STATE[ruleKey] });
    continue;
  }
  const area = AREAS_WITHOUT_OUTLINE[ruleKey];
  if (area) {
    usedRules.add(ruleKey);
    const district = districtByName.get(area.district);
    if (!district) problems.push(`${where}: unknown district "${area.district}"`);
    else resolutions.set(unit.id, { kind: "area", key: area.key, name: area.name, district, note: area.note });
    continue;
  }
  const alias = ALIASES[ruleKey];
  const districtName = alias?.district ?? TERRITORY_DISTRICT[territory];
  const district = districtName ? districtByName.get(districtName) : undefined;
  if (!district) {
    problems.push(`${where}: no district for territory "${territory}"`);
    continue;
  }
  const wanted = matchKey(alias?.osm ?? label);
  const candidates = osmBlocks.filter((b) => b.districtCode === district.code && matchKey(b.name) === wanted);
  if (alias) usedRules.add(ruleKey);
  if (candidates.length !== 1) {
    problems.push(`${where}: ${candidates.length === 0 ? "no" : candidates.length} outline(s) named "${alias?.osm ?? label}" in ${district.name}`);
    continue;
  }
  if (!candidates[0].complete) {
    problems.push(`${where}: the outline of ${candidates[0].name} is incomplete in the OSM extract`);
    continue;
  }
  resolutions.set(unit.id, { kind: "outline", block: candidates[0], rule: alias ? "alias" : "automatic", note: alias?.note ?? null });
}
for (const key of [...Object.keys(ALIASES), ...Object.keys(AREAS_WITHOUT_OUTLINE), ...Object.keys(OUTSIDE_STATE)]) {
  if (!usedRules.has(key)) problems.push(`area-mapping.config.ts rule "${key}" matches no sheet row`);
}
if (problems.length > 0) {
  console.error(`The sheet could not be mapped completely (${problems.length} problem(s)):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

// ------------------------------------------------------------------- people --
/**
 * The sheet is typed by hand, so the same person can be written several ways. Names are cleaned in two passes:
 *   1. tidy: spacing collapsed, ALL-CAPS to title case, an accidentally doubled surname dropped ("Alam Alam");
 *   2. within one sales territory: a first name written alone ("Rakesh") becomes the one full name in that territory
 *      that starts with it ("Rakesh Sarkar"), and two spellings one letter apart ("Shibom" / "Shibam Dutta") become the
 *      more frequent one. Different territories are never merged, so namesakes stay separate people.
 * Every correction is printed by the build.
 */
function tidyName(raw: string): string {
  let name = raw.replace(/\s+/g, " ").trim();
  if (name === name.toUpperCase()) {
    name = name.toLowerCase().replace(/(^|[\s.\-/'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  const words = name.split(" ");
  if (words.length >= 3 && words.at(-1)!.toLowerCase() === words.at(-2)!.toLowerCase()) words.pop();
  return words.join(" ");
}
function editDistance(a: string, b: string): number {
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
const nameFixes = new Map<string, string>();
/** territory → tidy name → canonical name */
const canonical = new Map<string, Map<string, string>>();
{
  const counts = new Map<string, Map<string, number>>();
  for (const unit of sheet.units) {
    const territory = territoryLabel.get(unit.salesTerritoryId)!;
    const names = counts.get(territory) ?? new Map<string, number>();
    counts.set(territory, names);
    for (const slot of unit.slots) for (const raw of slot.names) if (raw.trim()) names.set(tidyName(raw), (names.get(tidyName(raw)) ?? 0) + 1);
  }
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
}
function cleanName(raw: string, territory: string): string {
  const tidy = tidyName(raw);
  const name = canonical.get(territory)?.get(tidy) ?? tidy;
  const original = raw.replace(/\s+/g, " ").trim();
  if (name.toLowerCase() !== original.toLowerCase()) nameFixes.set(original, name);
  return name;
}

/** A place's display name: the sheet label tidied (one dash style, numerals as "-I"), then PLACE_NAME_FIXES. */
function placeName(label: string): string {
  let name = label.replaceAll("\u2013", "-").replace(/\s+/g, " ").trim().replace(/\s*-\s*/g, "-");
  name = name.replace(/^(.*\S)[\s-]+(i{1,3}|iv|v)$/i, (_, stem: string, numeral: string) => `${stem}-${numeral.toUpperCase()}`);
  name = name.replace(/\b(BOROUGH)\b/, "Borough");
  return PLACE_NAME_FIXES[name] ?? name;
}

interface Person {
  role: string;
  slot: number;
  name: string | null;
  vacant: boolean;
}
function peopleOf(unit: (typeof sheet.units)[number], territory: string): Person[] {
  const out: Person[] = [];
  for (const slot of unit.slots) {
    if (slot.status === "vacant") {
      out.push({ role: slot.role, slot: slot.slot, name: null, vacant: true });
      continue;
    }
    for (const raw of slot.names) {
      if (!raw.trim()) continue;
      out.push({ role: slot.role, slot: slot.slot, name: cleanName(raw, territory), vacant: false });
    }
  }
  return out;
}

// -------------------------------------------------------------------- units --
interface MapUnit {
  id: string;
  name: string;
  lgdCode: number;
  district: OsmDistrict;
  block: OsmBlock | null;
  noGeometryReason: string | null;
  mappingNotes: string[];
  rows: Array<{ unitId: string; sourceRow: number; blockLabel: string; territory: string; people: Person[] }>;
}
const units = new Map<string, MapUnit>();
const outside: Array<{ sourceRow: number; territory: string; label: string; note: string }> = [];
const cleanLabel = (label: string) => label.replaceAll("–", "-").replace(/\s+/g, " ").trim();
let areaSeq = 0;
const areaIds = new Map<string, string>();

for (const unit of sheet.units) {
  const resolution = resolutions.get(unit.id)!;
  const territory = territoryLabel.get(unit.salesTerritoryId)!;
  if (resolution.kind === "outside") {
    outside.push({ sourceRow: unit.sourceRow, territory, label: unit.blockLabel, note: resolution.note });
    continue;
  }
  let key: string;
  let make: () => MapUnit;
  if (resolution.kind === "outline") {
    const lgd = lgdBlockByRelation.get(resolution.block.relationId) ?? lgdBlockFor(resolution.block);
    key = `osm:${resolution.block.relationId}`;
    make = () => ({
      id: lgd ? lgd.id : `GB-${resolution.block.relationId}`,
      name: "",
      lgdCode: lgd?.lgdCode ?? 0,
      district: districtByCode.get(resolution.block.districtCode)!,
      block: resolution.block,
      noGeometryReason: null,
      mappingNotes: [],
      rows: [],
    });
  } else {
    key = `area:${resolution.key}`;
    if (!areaIds.has(key)) areaIds.set(key, `GU-${++areaSeq}`);
    make = () => ({
      id: areaIds.get(key)!,
      name: resolution.name,
      lgdCode: 0,
      district: resolution.district,
      block: null,
      noGeometryReason: `No outline: ${resolution.note}.`,
      mappingNotes: [],
      rows: [],
    });
  }
  const target = units.get(key) ?? make();
  units.set(key, target);
  // An area's note is already its "no outline" reason; only an outline's mapping rule is a separate map note.
  const note = resolution.kind === "outline" ? resolution.note : null;
  if (note && !target.mappingNotes.includes(note)) target.mappingNotes.push(note);
  target.rows.push({ unitId: unit.id, sourceRow: unit.sourceRow, blockLabel: cleanLabel(unit.blockLabel), territory, people: peopleOf(unit, territory) });
}

/** The LGD block for an outline the workspace build did not link: same district and the same name key. */
function lgdBlockFor(block: OsmBlock) {
  const lgdDistrict = [...lgdDistrictByName.values()].find((d) => d.lgdCode === block.districtCode);
  const key = matchKey(block.name);
  const found = lgdBlocks.filter((f) => f.districtId === lgdDistrict?.id && matchKey(f.name) === key);
  return found.length === 1 ? found[0] : undefined;
}

// Names: an outline's name is the sheet's own label(s) for it, so the map speaks the sheet's language.
for (const unit of units.values()) {
  if (unit.block) {
    const labels = [...new Set(unit.rows.map((r) => r.blockLabel))];
    const merged = labels.filter((l, i) => labels.findIndex((m) => matchKey(m) === matchKey(l)) === i);
    unit.name = placeName(merged.join(" / "));
  } else {
    unit.name = placeName(unit.name);
  }
}
// IDs must be unique (an LGD code reused by two outlines would be a data error).
const seenIds = new Set<string>();
for (const unit of units.values()) {
  if (seenIds.has(unit.id)) throw new Error(`Duplicate unit ID ${unit.id}`);
  seenIds.add(unit.id);
}

// ------------------------------------------------------------------ encode --
interface Encoded {
  shape: BoundaryShape;
  summary: { bbox: [number, number, number, number]; anchor: [number, number] | null; vertices: number };
}
function encode(featureId: string, polygons: GeoPolygon[]): Encoded {
  const encoded = encodeShape(polygons, TOLERANCE_DEGREES);
  if (!encoded) throw new Error(`The outline of ${featureId} collapsed when simplified.`);
  // The summary is computed with the browser's own decoder (shapes.ts), so layer-merge.ts accepts it.
  const decoded = decodeGeometry({ d: encoded.d, bbox: [0, 0, 0, 0], anchor: null, vertices: 0 });
  const points = decoded.flatMap((p) => p.outer);
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  const anchor = layerToLngLat(encoded.anchor[0], encoded.anchor[1]);
  return {
    shape: { featureId, d: encoded.d, bbox: encoded.bbox, anchor: encoded.anchor },
    summary: {
      bbox: [round(Math.min(...lngs)), round(Math.min(...lats)), round(Math.max(...lngs)), round(Math.max(...lats))],
      anchor: [round(anchor.lng), round(anchor.lat)],
      vertices: decoded.reduce((n, p) => n + p.outer.length + p.holes.reduce((m, h) => m + h.length, 0), 0),
    },
  };
}

const districtFeature = (d: OsmDistrict) => lgdDistrictByName.get(d.name)!;
const encodedDistricts = new Map(districts.map((d) => [d.name, encode(districtFeature(d).id, d.polygons)]));
const encodedUnits = new Map<string, Encoded>();
for (const unit of units.values()) if (unit.block) encodedUnits.set(unit.id, encode(unit.id, unit.block.polygons));

// ------------------------------------------------------------------- output --
const sortedUnits = [...units.values()].sort((a, b) => a.district.name.localeCompare(b.district.name) || a.name.localeCompare(b.name));
const namedCount = (rows: MapUnit["rows"]) => rows.reduce((n, r) => n + r.people.filter((p) => !p.vacant).length, 0);
const staffOf = (rows: MapUnit["rows"]) => new Set(rows.flatMap((r) => r.people.filter((p) => p.name).map((p) => p.name!.toLowerCase()))).size;
const vacanciesOf = (rows: MapUnit["rows"]) => rows.reduce((n, r) => n + r.people.filter((p) => p.vacant).length, 0);

const outBlocks = sortedUnits.map((unit) => {
  const sheetRows = unit.rows.map((r) => `row ${r.sourceRow}`).join(", ");
  const reason =
    unit.rows.length === 1
      ? `From the area-mapping sheet (${sheetRows}).`
      : `From the area-mapping sheet: ${unit.rows.length} rows list this place (${sheetRows}); each is shown as its own team.`;
  return {
    id: unit.id,
    name: unit.name,
    lgdCode: unit.lgdCode,
    districtId: districtFeature(unit.district).id,
    state: namedCount(unit.rows) > 0 ? ("represented" as const) : ("unresolved" as const),
    reason: unit.mappingNotes.length ? `${reason} Map note: ${unit.mappingNotes.join("; ")}.` : reason,
    contested: false,
    staff: staffOf(unit.rows),
    vacancies: vacanciesOf(unit.rows),
    records: unit.rows.map((r) => ({
      unitId: r.unitId,
      blockLabel: r.blockLabel,
      territory: r.territory,
      people: r.people,
      namedPeople: r.people.filter((p) => !p.vacant).length,
    })),
    geometry: encodedUnits.get(unit.id)?.summary ?? null,
    noGeometryReason: unit.noGeometryReason,
  };
});

const outDistricts = districts
  .map((d) => {
    const mine = outBlocks.filter((b) => b.districtId === districtFeature(d).id);
    const represented = mine.filter((b) => b.state === "represented");
    const rows = mine.flatMap((b) => b.records);
    return {
      id: districtFeature(d).id,
      name: d.name,
      lgdCode: d.code,
      state: represented.length > 0 ? ("represented" as const) : ("unresolved" as const),
      reason: mine.length ? `${mine.length} ${mine.length === 1 ? "place" : "places"} from the area-mapping sheet.` : "The area-mapping sheet lists no place in this district.",
      blockCount: mine.length,
      staff: new Set(rows.flatMap((r) => r.people.filter((p) => p.name).map((p) => p.name!.toLowerCase()))).size,
      vacancies: rows.reduce((n, r) => n + r.people.filter((p) => p.vacant).length, 0),
      representedBlockCount: represented.length,
      drawnBlockCount: mine.filter((b) => b.geometry).length,
      geometry: encodedDistricts.get(d.name)!.summary,
      noGeometryReason: null,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const shapes: BoundaryShape[] = [
  ...outDistricts.map((d) => encodedDistricts.get(d.name)!.shape),
  ...outBlocks.filter((b) => b.geometry).map((b) => encodedUnits.get(b.id)!.shape),
];
const DATASET_ID = "globe-area-mapping";
const globeLayer = {
  meta: {
    datasetId: DATASET_ID,
    kind: GLOBE_LAYER_KIND,
    title: "District and block outlines for the places in the area-mapping sheet (OpenStreetMap, community-sourced)",
    source: "OpenStreetMap via the public Overpass API (admin_level 5 and 6 boundary relations)",
    licence: "Open Database Licence (ODbL) 1.0",
    attribution: "© OpenStreetMap contributors",
    snapshots: [...snapshots].sort(),
    retrievedAt,
    projection: "Spherical Mercator, scaled by 1e4 to integers; y points down",
    simplificationDegrees: TOLERANCE_DEGREES,
    status: STATUS,
    counts: { shapes: shapes.length, districts: outDistricts.length, blocks: shapes.length - outDistricts.length },
  },
  viewBox: unionViewBox(shapes.map((s) => s.bbox)),
  shapes,
};
const layerBytes = Buffer.from(JSON.stringify(globeLayer), "utf8");

const boxes = outDistricts.map((d) => d.geometry.bbox);
const stateBbox: [number, number, number, number] = [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];
const people = new Set(outBlocks.flatMap((b) => b.records.flatMap((r) => r.people.filter((p) => p.name).map((p) => p.name!.toLowerCase()))));
const counts = {
  districts: outDistricts.length,
  districtsDrawn: outDistricts.length,
  districtsRepresented: outDistricts.filter((d) => d.state === "represented").length,
  blocks: outBlocks.length,
  blocksDrawn: outBlocks.filter((b) => b.geometry).length,
  blocksRepresented: outBlocks.filter((b) => b.state === "represented").length,
  blocksRepresentedAndDrawn: outBlocks.filter((b) => b.state === "represented" && b.geometry).length,
  blocksNoRepresentativeConfirmed: 0,
  blocksUnresolved: outBlocks.filter((b) => b.state === "unresolved").length,
  blocksContested: 0,
  shapesRejected: 0,
  parentFailures: 0,
  duplicateShapes: 0,
};

const manifest = {
  meta: {
    schema: 2,
    generatedAt: new Date().toISOString(),
    inputs: {
      "AREA MAPPING.xlsx": { sha256: workbookSha, kind: "area-mapping-sheet" },
      ...Object.fromEntries(Object.entries(rawSha).map(([file, sha]) => [`osm/${file}`, { sha256: sha }])),
      [GLOBE_LAYER_FILE]: { sha256: createHash("sha256").update(layerBytes).digest("hex"), datasetId: DATASET_ID, kind: GLOBE_LAYER_KIND, shapes: shapes.length },
    },
    crs: "Bounding boxes and anchors are WGS84 degrees. Outline path data (served separately) is in the layer's planar coordinates.",
    layerSource: globeLayer.meta.source,
    licence: globeLayer.meta.licence,
    attribution: globeLayer.meta.attribution,
    snapshots: globeLayer.meta.snapshots,
    status: STATUS,
    colourRule: {
      district: "blue: the sheet lists at least one place in the district",
      block: "orange: a place from the sheet, with its team",
    },
    counts,
    sheet: { rows: sheet.units.length, mappedRows: sheet.units.length - outside.length, staff: people.size },
  },
  state: {
    id: "WB",
    name: "West Bengal",
    bbox: stateBbox,
    centre: [Math.round(((stateBbox[0] + stateBbox[2]) / 2) * 1e5) / 1e5, Math.round(((stateBbox[1] + stateBbox[3]) / 2) * 1e5) / 1e5],
    basis: "Union of the district outline bounding boxes.",
  },
  districts: outDistricts,
  blocks: outBlocks,
  rejected: [],
};

// ------------------------------------------------------------------- report --
const byRule = { automatic: 0, alias: 0 };
for (const r of resolutions.values()) if (r.kind === "outline") byRule[r.rule]++;
console.log(`Sheet: ${sheet.units.length} rows, ${people.size} distinct people.`);
console.log(`  ${byRule.automatic} rows matched an outline by name, ${byRule.alias} by a reviewed alias,`);
console.log(`  ${[...resolutions.values()].filter((r) => r.kind === "area").length} rows are areas without an outline, ${outside.length} outside West Bengal.`);
console.log(`Map: ${counts.districts} districts, ${counts.blocks} places (${counts.blocksDrawn} with an outline, ${counts.blocks - counts.blocksDrawn} without).`);
for (const d of outDistricts) console.log(`  ${d.name.padEnd(20)} ${String(d.blockCount).padStart(3)} places, ${d.drawnBlockCount} drawn`);
const multi = outBlocks.filter((b) => b.records.length > 1);
if (multi.length) console.log(`Places listed by more than one sheet row: ${multi.map((b) => `${b.name} (${b.records.map((r) => r.territory).join(" + ")})`).join("; ")}`);
if (outside.length) console.log(`Not drawn (outside West Bengal): ${outside.map((o) => `row ${o.sourceRow} ${o.territory} / ${o.label}`).join("; ")}`);
console.log(`Name corrections (beyond capitalisation): ${[...nameFixes].filter(([a, b]) => a.toLowerCase() !== b.toLowerCase() && tidyName(a) !== b || a.split(" ").length !== b.split(" ").length).map(([a, b]) => `${a} -> ${b}`).join("; ") || "none"}`);
const renamed = sortedUnits.filter((u) => u.rows.some((r) => matchKey(r.blockLabel) !== matchKey(u.name)));
console.log(`Place name corrections: ${renamed.map((u) => `${[...new Set(u.rows.map((r) => r.blockLabel))].join(" + ")} -> ${u.name}`).join("; ")}`);
const staffBins = new Map<number, number>();
for (const b of outBlocks) staffBins.set(b.staff, (staffBins.get(b.staff) ?? 0) + 1);
console.log(`People per place: ${[...staffBins].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" ")}`);
console.log(`People per district: ${outDistricts.map((d) => `${d.name} ${d.staff}/${d.blockCount}`).join(", ")}`);
const unmatchedOutlines = osmBlocks.filter((b) => ![...units.values()].some((u) => u.block?.relationId === b.relationId) && districtByCode.has(b.districtCode));
console.log(`Map blocks the sheet does not list (drawn as district background only): ${unmatchedOutlines.map((b) => `${b.name} (${districtByCode.get(b.districtCode)!.name})`).join(", ") || "none"}`);

if (!CHECK_ONLY) {
  await writeFile(path.join(GENERATED, GLOBE_LAYER_FILE), layerBytes);
  await writeFile(path.join(GENERATED, "globe-overlay.json"), JSON.stringify(manifest));
  console.log(`wrote data/generated/${GLOBE_LAYER_FILE} (${layerBytes.length} bytes) and data/generated/globe-overlay.json`);
}
