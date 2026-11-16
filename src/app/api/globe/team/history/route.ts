import { connection } from "next/server";
import { isRequestAuthorized } from "@/lib/auth";
import { ASK_HEADERS, askFail } from "@/features/globe/ask-request.server";
import { teamHistory } from "@/features/globe/team-admin.server";

/** GET /api/globe/team/history: the saved team versions, newest first, and which one is in force. */
export async function GET(request: Request) {
  await connection();
  if (!isRequestAuthorized(request.headers)) return askFail(401, "Sign in required.");
  const result = await teamHistory();
  return result.ok ? Response.json(result.data, { headers: ASK_HEADERS }) : askFail(result.status, result.error);
}
