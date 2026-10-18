/**
 * The globe overlay manifest as scripts/globe/build_overlay.py writes it to data/generated/globe-overlay.json: the
 * client-facing manifest (types.ts) with each block's full workbook rows, names included.
 *
 * SERVER ONLY, types only. Import it with `import type` from server modules (*.server.ts) and tests, never from a
 * client component: tests/unit/globe-names-on-demand.test.mts fails if any client file reaches this module or the server
 * modules that hold the rows. `GlobeManifest` (types.ts) is what the page gets, and it has `rowIds` where this has `records`.
 */

import type { BlockRowPerson } from "./block-rows.ts";
import type { GlobeManifest, ManifestBlock } from "./types.ts";

export interface ServerRecord {
  unitId: string;
  /** The block label exactly as the workbook row writes it. */
  blockLabel: string;
  /** The workbook DISTRICT label: a sales territory, not an administrative district. */
  territory: string;
  people: BlockRowPerson[];
  namedPeople: number;
}

export type ServerBlock = Omit<ManifestBlock, "rowIds"> & { records: ServerRecord[] };

export type ServerManifest = Omit<GlobeManifest, "blocks"> & { blocks: ServerBlock[] };
