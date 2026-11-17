import { connection } from "next/server";
import { ASK_HEADERS, askFail, readOneValue } from "@/features/globe/ask-request.server";
import { recordTeamChange } from "@/features/globe/team-admin.server";

/**
 * POST /api/globe/team/change: `{"change": <TeamChangeRequest>}` (src/features/globe/team-change.ts). With
 * `dryRun: true` it only says what the change would do; otherwise it is saved as a new team version with who recorded
 * it, why, and from when.
 */
export async function POST(request: Request) {
  await connection();
  const body = await readOneValue(request, "change", 16_384);
  if (body instanceof Response) return body;
  const result = await recordTeamChange(body.value);
  return result.ok ? Response.json(result.data, { headers: ASK_HEADERS }) : askFail(result.status, result.error);
}
