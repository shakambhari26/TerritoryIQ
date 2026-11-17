import { connection } from "next/server";
import { isRequestAuthorized } from "@/lib/auth";
import { ASK_HEADERS, askFail } from "@/features/globe/ask-request.server";
import { latestUpdate } from "@/features/globe/team-admin.server";

/**
 * GET /api/globe/team/latest: the newest saved team version (who saved it, when, which file) and what it changed,
 * person by person. The globe page asks every 30 seconds, so an upload by anyone shows to everyone as a popup.
 */
export async function GET(request: Request) {
  await connection();
  if (!isRequestAuthorized(request.headers)) return askFail(401, "Sign in required.");
  const result = await latestUpdate();
  return result.ok ? Response.json(result.data, { headers: ASK_HEADERS }) : askFail(result.status, result.error);
}
