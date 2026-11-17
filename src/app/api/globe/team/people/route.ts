import { connection } from "next/server";
import { isRequestAuthorized } from "@/lib/auth";
import { ASK_HEADERS, askFail } from "@/features/globe/ask-request.server";
import { teamPeople } from "@/features/globe/team-admin.server";

/** GET /api/globe/team/people: everyone in the team now, with roles and places (for the team-change wizard). */
export async function GET(request: Request) {
  await connection();
  if (!isRequestAuthorized(request.headers)) return askFail(401, "Sign in required.");
  const result = await teamPeople();
  return result.ok ? Response.json(result.data, { headers: ASK_HEADERS }) : askFail(result.status, result.error);
}
