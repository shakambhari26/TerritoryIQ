/**
 * Splits the names-bearing manifest into the two things the app may use, on the server only.
 *
 *   projectManifest(server)     the page's manifest: an allow-list projection. Every object is built field by field from
 *                               named keys, so a field added to the generated file later (a name, a label) reaches the page
 *                               only when someone adds it here and to types.ts. A block's `records` become `rowIds`.
 *   buildBlockRowIndex(server)  an exact-lookup Map from a block ID to that block's rows, for POST /api/globe/block-rows.
 *
 * Pure: no file access, so the tests run it on synthetic manifests. Nothing here is imported by a client component.
 */

import type { BlockRow } from "./block-rows.ts";
import type { ServerBlock, ServerManifest } from "./server-types.ts";
import type { GeometrySummary, GlobeManifest, ManifestBlock, ManifestDistrict } from "./types.ts";

const geometry = (summary: GeometrySummary | null): GeometrySummary | null =>
  summary === null
    ? null
    : {
        bbox: [summary.bbox[0], summary.bbox[1], summary.bbox[2], summary.bbox[3]],
        anchor: summary.anchor === null ? null : [summary.anchor[0], summary.anchor[1]],
        vertices: summary.vertices,
      };

function projectBlock(block: ServerBlock): ManifestBlock {
  return {
    id: block.id,
    name: block.name,
    lgdCode: block.lgdCode,
    districtId: block.districtId,
    state: block.state,
    reason: block.reason,
    ...(block.confirmation === undefined ? {} : { confirmation: block.confirmation }),
    contested: block.contested,
    rowIds: block.records.map((record) => record.unitId),
    geometry: geometry(block.geometry),
    noGeometryReason: block.noGeometryReason,
  };
}

function projectDistrict(district: ServerManifest["districts"][number]): ManifestDistrict {
  return {
    id: district.id,
    name: district.name,
    lgdCode: district.lgdCode,
    state: district.state,
    reason: district.reason,
    ...(district.confirmation === undefined ? {} : { confirmation: district.confirmation }),
    blockCount: district.blockCount,
    representedBlockCount: district.representedBlockCount,
    drawnBlockCount: district.drawnBlockCount,
    geometry: geometry(district.geometry),
    noGeometryReason: district.noGeometryReason,
  };
}

export function projectManifest(server: ServerManifest): GlobeManifest {
  const { meta, state } = server;
  const counts = meta.counts;
  return {
    meta: {
      schema: meta.schema,
      generatedAt: meta.generatedAt,
      inputs: Object.fromEntries(
        Object.entries(meta.inputs).map(([file, input]) => [
          file,
          {
            sha256: input.sha256,
            ...(input.datasetId === undefined ? {} : { datasetId: input.datasetId }),
            ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
            ...(input.kind === undefined ? {} : { kind: input.kind }),
            ...(input.shapes === undefined ? {} : { shapes: input.shapes }),
          },
        ]),
      ),
      crs: meta.crs,
      layerSource: meta.layerSource,
      licence: meta.licence,
      attribution: meta.attribution,
      snapshots: [...meta.snapshots],
      status: meta.status,
      colourRule: Object.fromEntries(Object.entries(meta.colourRule).map(([key, value]) => [key, value])),
      counts: {
        districts: counts.districts,
        districtsDrawn: counts.districtsDrawn,
        districtsRepresented: counts.districtsRepresented,
        blocks: counts.blocks,
        blocksDrawn: counts.blocksDrawn,
        blocksRepresented: counts.blocksRepresented,
        blocksRepresentedAndDrawn: counts.blocksRepresentedAndDrawn,
        blocksNoRepresentativeConfirmed: counts.blocksNoRepresentativeConfirmed,
        blocksUnresolved: counts.blocksUnresolved,
        blocksContested: counts.blocksContested,
        shapesRejected: counts.shapesRejected,
        parentFailures: counts.parentFailures,
        duplicateShapes: counts.duplicateShapes,
      },
    },
    state: {
      id: state.id,
      name: state.name,
      bbox: state.bbox === null ? null : [state.bbox[0], state.bbox[1], state.bbox[2], state.bbox[3]],
      centre: state.centre === null ? null : [state.centre[0], state.centre[1]],
      basis: state.basis,
    },
    districts: server.districts.map(projectDistrict),
    blocks: server.blocks.map(projectBlock),
    rejected: server.rejected.map((entry) => ({ id: entry.id, reason: entry.reason })),
  };
}

/**
 * Block ID to that block's rows, every block present (a block with no rows maps to []). Rows are copied field by field,
 * which also leaves out `namedPeople`, a count the panel does not show. The route resolves an ID with `Map.get` only,
 * so a user-chosen string is never used as an object key, path or relationship identifier.
 */
export function buildBlockRowIndex(server: ServerManifest): Map<string, BlockRow[]> {
  const index = new Map<string, BlockRow[]>();
  for (const block of server.blocks) {
    index.set(
      block.id,
      block.records.map((record) => ({
        unitId: record.unitId,
        blockLabel: record.blockLabel,
        territory: record.territory,
        people: record.people.map((person) => ({ role: person.role, slot: person.slot, name: person.name, vacant: person.vacant })),
      })),
    );
  }
  return index;
}
