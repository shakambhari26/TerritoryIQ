/**
 * The logic of POST /api/globe/block-rows (src/app/api/globe/block-rows/route.ts), separate from the route file so the
 * tests can drive it with synthetic requests and rows. Server only.
 *
 * One fixed URL, one method. The request must be `application/json`, at most 256 bytes, with exactly one key, `blockId`,
 * a string like `GB-1234`. The block is resolved with an exact `Map.get`, never by using the string as a key, path or
 * query. The response holds only that block's rows. Every response, errors included, is `private, no-store` and
 * `nosniff`, and an error is a fixed code and sentence that never echo the request or any data.
 *
 * This narrows what a page load carries; it is not authentication or access control. Anyone who can reach the local
 * server (and passes the loopback Host check) can ask for any block ID, and the IDs can be enumerated.
 */

import { isLoopbackHost } from "../../lib/loopback.ts";
import { BLOCK_ID_PATTERN, BLOCK_ROWS_ERRORS, MAX_REQUEST_BYTES, type BlockRow, type BlockRowsErrorCode } from "./block-rows.ts";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;

export interface BlockRowsSource {
  /** False when the manifest has not been built. */
  available: boolean;
  /** An exact lookup: the block's rows (possibly none), or null for an unknown ID. */
  rows: (blockId: string) => BlockRow[] | null;
}

export function blockRowsError(code: BlockRowsErrorCode): Response {
  const { status, message } = BLOCK_ROWS_ERRORS[code];
  const headers: Record<string, string> = { ...HEADERS };
  if (code === "method") headers.Allow = "POST";
  return Response.json({ code, error: message }, { status, headers });
}

/** `application/json`, optionally with a charset parameter and nothing else. */
function isJson(contentType: string | null): boolean {
  return contentType !== null && /^application\/json\s*(?:;\s*charset=utf-8\s*)?$/i.test(contentType);
}

/** The body text, or null if it is more than the cap. Stops reading as soon as the cap is passed. */
async function readCapped(request: Request): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d{1,9}$/.test(declared) || Number(declared) > MAX_REQUEST_BYTES)) return null;
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "\u0000";
  }
}

export async function handleBlockRowsRequest(request: Request, source: BlockRowsSource): Promise<Response> {
  // Second layer after src/proxy.ts, which already refuses a non-loopback Host for every path.
  if (!isLoopbackHost(request.headers.get("host"))) return blockRowsError("host");
  if (request.method !== "POST") return blockRowsError("method");
  if (!isJson(request.headers.get("content-type"))) return blockRowsError("mediatype");

  const text = await readCapped(request);
  if (text === null) return blockRowsError("toolarge");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return blockRowsError("badjson");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return blockRowsError("badrequest");
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "blockId") return blockRowsError("badrequest");
  const blockId = (body as { blockId: unknown }).blockId;
  if (typeof blockId !== "string" || !BLOCK_ID_PATTERN.test(blockId)) return blockRowsError("badid");

  if (!source.available) return blockRowsError("unavailable");
  const rows = source.rows(blockId);
  if (rows === null) return blockRowsError("notfound");
  return Response.json({ blockId, rows }, { headers: HEADERS });
}
