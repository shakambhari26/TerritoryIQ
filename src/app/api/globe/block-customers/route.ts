import { connection } from "next/server";
import { handleBlockRowsRequest } from "@/features/globe/block-rows-route.server";
import { blockCustomersAvailable, getBlockCustomers } from "@/features/globe/customers.server";

/**
 * POST /api/globe/block-customers: the customers placed in one selected globe block (names, firm, ERP code, why they
 * were placed there), fetched after the visitor selects the block so the /globe page itself carries counts only. Same
 * handler, checks and headers as POST /api/globe/block-rows (features/globe/block-rows-route.server.ts): body
 * `{"blockId":"GB-…"}`, `isRequestAuthorized` first, never cached. No phone number is ever part of the answer.
 */
async function respond(request: Request) {
  await connection();
  return handleBlockRowsRequest(request, { available: blockCustomersAvailable(), rows: getBlockCustomers });
}

export const POST = respond;
// Every other method is answered by the same handler with a 405 that carries the same headers.
export const GET = respond;
export const PUT = respond;
export const PATCH = respond;
export const DELETE = respond;
export const OPTIONS = respond;
