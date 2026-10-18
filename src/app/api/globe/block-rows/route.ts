import { connection } from "next/server";
import { handleBlockRowsRequest } from "@/features/globe/block-rows-route.server";
import { blockRowsAvailable, getBlockRows } from "@/features/globe/overlay.server";

/**
 * POST /api/globe/block-rows: the workbook rows of one selected globe block, fetched after the visitor selects it so
 * the /globe page itself carries no staff names. Validation, limits and headers are in
 * features/globe/block-rows-route.server.ts. The route is dynamic (`connection()`), reads the request, and is never cached.
 *
 * This reduces what a page load exposes. It is not authentication or access control: a request that passes the loopback
 * Host check (src/proxy.ts and again in the handler) may ask for any block ID.
 */
async function respond(request: Request) {
  await connection();
  return handleBlockRowsRequest(request, { available: blockRowsAvailable(), rows: getBlockRows });
}

export const POST = respond;
// Every other method is answered by the same handler with a 405 that carries the same headers.
export const GET = respond;
export const PUT = respond;
export const PATCH = respond;
export const DELETE = respond;
export const OPTIONS = respond;
