import { connection } from "next/server";
import { DISTRICT_ID_PATTERN } from "@/features/globe/block-rows";
import { handleLookupRequest } from "@/features/globe/block-rows-route.server";
import { blockRowsAvailable, getDistrictTeam } from "@/features/globe/overlay.server";

/**
 * POST /api/globe/district-team: the sheet rows (ASM, PRIMARY, SECONDARY, DSO) of every place in one selected district,
 * fetched when the visitor opens the district so the /globe page itself carries no staff names. Same validation, limits
 * and headers as /api/globe/block-rows (features/globe/block-rows-route.server.ts). Dynamic and never cached.
 */
async function respond(request: Request) {
  await connection();
  return handleLookupRequest(request, {
    key: "districtId",
    pattern: DISTRICT_ID_PATTERN,
    field: "blocks",
    available: await blockRowsAvailable(),
    lookup: getDistrictTeam,
  });
}

export const POST = respond;
export const GET = respond;
export const PUT = respond;
export const PATCH = respond;
export const DELETE = respond;
export const OPTIONS = respond;
