/**
 * The globe's district team request: a same-origin POST to the route handler at `/api/globe/district-team`
 * (src/app/api/globe/district-team/route.ts) for the sheet rows of every place in ONE selected district. The URL is a
 * literal and the body is always `{ districtId }`; nothing here accepts a URL, a host or a path from anywhere else. The
 * response is not trusted: `parseDistrictTeamPayload` (block-rows.ts) checks it against the district's places and the
 * row IDs the page was given before anything is rendered.
 */

import { parseDistrictTeamPayload, type DistrictTeamPayload } from "./block-rows";
import { BlockRowsRequestError } from "./block-rows-client";

const DISTRICT_TEAM_URL = "/api/globe/district-team";

/** The validated team of `districtId`; `expected` is the district's places, in the order the page lists them. */
export async function fetchDistrictTeam(
  districtId: string,
  expected: ReadonlyArray<{ id: string; rowIds: readonly string[] }>,
  signal: AbortSignal,
): Promise<DistrictTeamPayload> {
  const response = await fetch(DISTRICT_TEAM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ districtId }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    let code: string | null = null;
    try {
      const value = ((await response.json()) as { code?: unknown } | null)?.code;
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
  const payload = parseDistrictTeamPayload(body, districtId, expected);
  if (!payload) throw new BlockRowsRequestError(null, null);
  return payload;
}
