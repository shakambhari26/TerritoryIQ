/**
 * The data boundary of the Territory Overview (`/`).
 *
 * The Overview shows counts, never who covers what. It still recomputes every figure in the browser, because the
 * reviewer's local change log (kept only in that browser) is applied to all of them. So the browser needs the
 * structure the model counts over, but not the staff names: those stay on the server.
 *
 * `buildOverviewData` runs on the server and turns the workbook-derived dataset into an `OverviewData`: row, slot
 * and crosswalk structure plus the few geography fields the page reads, with every person replaced by an opaque
 * integer key. The key is the order of first appearance of the whitespace-collapsed, lower-cased name, the same
 * normalisation the model uses for "distinct names", so two slots share a key exactly when the model would count
 * them as one name. A key is not derived from the name and cannot be turned back into one.
 *
 * Pure functions, no I/O, so the client may import the types and `overviewModelInput`, and tests can run the
 * builder on synthetic data. The one thing the keys cannot do is recognise a name that a reviewer types locally
 * as equal to a workbook name; such a name is counted as distinct (see docs/security-notes.md).
 */

import type {
  CrosswalkEntry,
  GeoFeature,
  GeoKind,
  LinkStatus,
  MatchTier,
  SlotStatus,
  StaffRole,
  TerritoryDataset,
} from "./types.ts";

export interface OverviewSlot {
  role: StaffRole;
  slot: number;
  status: SlotStatus;
  /** One opaque key per listed person, `[]` for a vacant marker. Never a name. */
  people: number[];
}

export interface OverviewUnit {
  id: string;
  territoryId: string;
  slots: OverviewSlot[];
}

export interface OverviewFeature {
  id: string;
  kind: GeoKind;
  /** The official LGD name, as the Overview prints it in its gap notes. */
  name: string;
  districtId: string | null;
  hasBoundary: boolean;
}

export interface OverviewCrosswalk {
  unitId: string;
  status: LinkStatus;
  featureId: string | null;
  candidates: Array<{ featureId: string; tier: MatchTier }>;
}

/** Everything `OverviewDashboard` receives about the workbook. No staff name, source row or block label. */
export interface OverviewData {
  provenance: {
    workbook: { file: string; sha256: string; dataRows: number };
    lgdDistricts: { file: string; sha256: string; reportGenerated: string };
    lgdBlocks: { file: string; sha256: string; reportGenerated: string };
    crosswalkProtocol: string;
  };
  territories: Array<{ id: string; label: string }>;
  units: OverviewUnit[];
  features: OverviewFeature[];
  crosswalk: OverviewCrosswalk[];
}

/** The model's own normalisation for counting distinct names (see `buildModel`). */
const personKey = (name: string) => name.replace(/\s+/g, " ").toLowerCase();

/** Server only: the names are read here and must not appear in the result. */
export function buildOverviewData(dataset: TerritoryDataset): OverviewData {
  const keys = new Map<string, number>();
  const keyOf = (name: string) => {
    const normal = personKey(name);
    let key = keys.get(normal);
    if (key === undefined) {
      key = keys.size;
      keys.set(normal, key);
    }
    return key;
  };

  const { workbook, lgdDistricts, lgdBlocks, matching } = dataset.meta;
  return {
    provenance: {
      workbook: { file: workbook.file, sha256: workbook.sha256, dataRows: workbook.dataRows },
      lgdDistricts: { file: lgdDistricts.file, sha256: lgdDistricts.sha256, reportGenerated: lgdDistricts.reportGenerated },
      lgdBlocks: { file: lgdBlocks.file, sha256: lgdBlocks.sha256, reportGenerated: lgdBlocks.reportGenerated },
      crosswalkProtocol: matching.protocol,
    },
    territories: dataset.salesTerritories.map((t) => ({ id: t.id, label: t.label })),
    units: dataset.units.map((unit) => ({
      id: unit.id,
      territoryId: unit.salesTerritoryId,
      slots: unit.slots.map((s) => ({
        role: s.role,
        slot: s.slot,
        status: s.status,
        people: s.status === "named" ? s.names.map(keyOf) : [],
      })),
    })),
    features: dataset.features.map((f) => ({
      id: f.id,
      kind: f.kind,
      name: f.name,
      districtId: f.districtId,
      hasBoundary: f.boundary !== null,
    })),
    crosswalk: dataset.crosswalk.map((c) => ({
      unitId: c.unitId,
      status: c.status,
      featureId: c.featureId,
      candidates: c.candidates.map((x) => ({ featureId: x.featureId, tier: x.tier })),
    })),
  };
}

/**
 * Prefix that turns a key into the stand-in "name" the model counts. A control character, so a name a reviewer
 * types can never collide with it.
 */
const PERSON_PREFIX = "\u0000person:";

/**
 * Rebuilds the shape `buildModel` takes from an `OverviewData`, so the model, and so every figure, is the same
 * code as everywhere else. Fields the Overview never reads (source row, block label, flags, relation ID, review
 * reasons, generation time, file sizes) are neutral placeholders; they carry no workbook data.
 */
export function overviewModelInput(data: OverviewData): TerritoryDataset {
  const unitIdsByTerritory = new Map<string, string[]>(data.territories.map((t) => [t.id, []]));
  for (const unit of data.units) unitIdsByTerritory.get(unit.territoryId)?.push(unit.id);
  const { workbook, lgdDistricts, lgdBlocks } = data.provenance;

  return {
    meta: {
      generatedAt: "",
      workbook: { ...workbook, bytes: 0 },
      lgdDistricts: { ...lgdDistricts, bytes: 0 },
      lgdBlocks: { ...lgdBlocks, bytes: 0, villageRows: 0 },
      matching: { protocol: data.provenance.crosswalkProtocol, exactTierRows: 0, provisionalRows: 0, ambiguousRows: 0, weakRows: 0, noneRows: 0 },
    },
    salesTerritories: data.territories.map((t) => ({ id: t.id, label: t.label, unitIds: unitIdsByTerritory.get(t.id) ?? [] })),
    units: data.units.map((unit) => ({
      id: unit.id,
      sourceRow: 0,
      salesTerritoryId: unit.territoryId,
      blockLabel: "",
      slots: unit.slots.map((s) => ({ role: s.role, slot: s.slot, status: s.status, names: s.people.map((p) => `${PERSON_PREFIX}${p}`) })),
      flags: [],
    })),
    features: data.features.map(
      (f): GeoFeature => ({
        id: f.id,
        kind: f.kind,
        lgdCode: 0,
        name: f.name,
        districtId: f.districtId,
        villageRows: null,
        boundary: f.hasBoundary ? { source: "osm", relationId: 0, sourceName: "", basis: "lgd-district-code" } : null,
        boundaryGap: null,
      }),
    ),
    crosswalk: data.crosswalk.map(
      (c): CrosswalkEntry => ({
        unitId: c.unitId,
        status: c.status,
        featureId: c.featureId,
        candidates: c.candidates.map((x) => ({ featureId: x.featureId, tier: x.tier, score: null })),
        reason: "",
      }),
    ),
  };
}
