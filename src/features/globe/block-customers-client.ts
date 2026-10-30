/**
 * The globe's third network request: a same-origin POST to `/api/globe/block-customers`
 * (src/app/api/globe/block-customers/route.ts) for the customers placed in ONE selected block. The URL is a literal and
 * the body is always `{ blockId }`. The response is not trusted: `parseBlockCustomersPayload` (customers.ts) checks it
 * against the selected block and the count the page was given before anything is rendered.
 */

import { parseBlockCustomersPayload, type BlockCustomersPayload } from "./customers";

const BLOCK_CUSTOMERS_URL = "/api/globe/block-customers";

/** The request failed (`status`), or the response was not what the route sends (`status` null). */
export class BlockCustomersRequestError extends Error {
  readonly status: number | null;
  constructor(status: number | null) {
    super(status === null ? "invalid response" : `HTTP ${status}`);
    this.name = "BlockCustomersRequestError";
    this.status = status;
  }
}

/** The validated customers of `blockId`. Rejects with an AbortError if `signal` aborts, and with BlockCustomersRequestError otherwise. */
export async function fetchBlockCustomers(blockId: string, expected: number, signal: AbortSignal): Promise<BlockCustomersPayload> {
  const response = await fetch(BLOCK_CUSTOMERS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blockId }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new BlockCustomersRequestError(response.status);
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new BlockCustomersRequestError(null);
  }
  const payload = parseBlockCustomersPayload(body, blockId, expected);
  if (!payload) throw new BlockCustomersRequestError(null);
  return payload;
}
