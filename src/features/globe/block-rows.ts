/**
 * The contract of POST /api/globe/block-rows: what a client may ask for and what it gets back. Pure and free of any
 * workbook data, so both the route (block-rows-route.server.ts) and the browser (block-rows-client.ts) import it.
 *
 * The page no longer carries the workbook rows behind each block (names, the row's own block label, the sales
 * territory). It carries each block's row IDs only, and the details panel asks for one selected block's rows here.
 * This narrows what a page load exposes. It is not authentication or access control: whoever can reach the local
 * server can ask for any block ID.
 */

/** A block's feature ID: `GB-` and one to nine digits. Anything else is refused before any lookup. */
export const BLOCK_ID_PATTERN = /^GB-[0-9]{1,9}$/;

/** A request body is `{"blockId":"GB-1234"}`: far below this. Larger bodies are refused unread. */
export const MAX_REQUEST_BYTES = 256;

export interface BlockRowPerson {
  role: string;
  slot: number;
  name: string | null;
  vacant: boolean;
}

export interface BlockRow {
  unitId: string;
  /** The block label exactly as the workbook row writes it. */
  blockLabel: string;
  /** The workbook DISTRICT label: a sales territory, not an administrative district. */
  territory: string;
  people: BlockRowPerson[];
}

export interface BlockRowsPayload {
  blockId: string;
  rows: BlockRow[];
}

/** Fixed error codes of the route, each with the one sentence it ever sends. Neither ever echoes input. */
export const BLOCK_ROWS_ERRORS = {
  method: { status: 405, message: "Use POST." },
  host: { status: 403, message: "TerritoryIQ is a localhost-only prototype." },
  mediatype: { status: 415, message: "The request must be application/json." },
  toolarge: { status: 413, message: "The request body is too large." },
  badjson: { status: 400, message: "The request body is not valid JSON." },
  badrequest: { status: 400, message: "The request must be an object with one key, blockId." },
  badid: { status: 400, message: "The block ID is not valid." },
  notfound: { status: 404, message: "No such block." },
  unavailable: { status: 404, message: "The globe data has not been built." },
} as const;

export type BlockRowsErrorCode = keyof typeof BLOCK_ROWS_ERRORS;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
};

function personProblem(value: unknown): boolean {
  if (!isObject(value) || !hasExactKeys(value, ["role", "slot", "name", "vacant"])) return true;
  return typeof value.role !== "string" || !Number.isInteger(value.slot) || !(typeof value.name === "string" || value.name === null) || typeof value.vacant !== "boolean";
}

function rowProblem(value: unknown): boolean {
  if (!isObject(value) || !hasExactKeys(value, ["unitId", "blockLabel", "territory", "people"])) return true;
  if (typeof value.unitId !== "string" || typeof value.blockLabel !== "string" || typeof value.territory !== "string") return true;
  return !Array.isArray(value.people) || value.people.some(personProblem);
}

/**
 * The response as a typed payload, or null if it is not exactly what the route sends for `blockId`. The browser does not
 * trust the route: the shape, the block and the exact sequence of row IDs the page was given must all match, so a
 * response for another block, or one with missing, extra or reordered rows, is never rendered.
 */
export function parseBlockRowsPayload(value: unknown, blockId: string, rowIds: readonly string[]): BlockRowsPayload | null {
  if (!isObject(value) || !hasExactKeys(value, ["blockId", "rows"])) return null;
  if (value.blockId !== blockId || !Array.isArray(value.rows)) return null;
  const rows: unknown[] = value.rows;
  if (rows.length !== rowIds.length || rows.some(rowProblem)) return null;
  if (!(rows as BlockRow[]).every((row, index) => row.unitId === rowIds[index])) return null;
  return { blockId, rows: rows as BlockRow[] };
}
