/**
 * The globe's second network request: a same-origin POST to the route handler at `/api/globe/block-rows`
 * (src/app/api/globe/block-rows/route.ts) for the workbook rows of ONE selected block. The URL is a literal and the
 * body is always `{ blockId }`; nothing here accepts a URL, a host or a path from anywhere else. The response is not
 * trusted: `parseBlockRowsPayload` (block-rows.ts) checks it against the selected block and the row IDs the page was
 * given before anything is rendered.
 */

import { parseBlockRowsPayload, type BlockRowsPayload } from "./block-rows";

const BLOCK_ROWS_URL = "/api/globe/block-rows";

/** The request failed, or the response was not what the route sends. `code` is the route's own word for why, if it gave one. */
export class BlockRowsRequestError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  constructor(status: number | null, code: string | null) {
    super(status === null ? "invalid response" : `HTTP ${status}${code ? ` ${code}` : ""}`);
    this.name = "BlockRowsRequestError";
    this.status = status;
    this.code = code;
  }
}

/** The validated rows of `blockId`. Rejects with an AbortError if `signal` aborts, and with BlockRowsRequestError otherwise. */
export async function fetchBlockRows(blockId: string, rowIds: readonly string[], signal: AbortSignal): Promise<BlockRowsPayload> {
  const response = await fetch(BLOCK_ROWS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blockId }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    let code: string | null = null;
    try {
      const body: unknown = await response.json();
      const value = (body as { code?: unknown } | null)?.code;
      if (typeof value === "string" && /^[a-z]{1,16}$/.test(value)) code = value;
    } catch {
      /* no usable body: the status alone is reported */
    }
    throw new BlockRowsRequestError(response.status, code);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new BlockRowsRequestError(null, null);
  }
  const payload = parseBlockRowsPayload(body, blockId, rowIds);
  if (!payload) throw new BlockRowsRequestError(null, null);
  return payload;
}
