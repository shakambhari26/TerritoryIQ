import { connection } from "next/server";
import { ASK_HEADERS, askFail, readOneValue } from "@/features/globe/ask-request.server";
import { restoreVersion } from "@/features/globe/team-admin.server";

/** POST /api/globe/team/restore: `{"versionId": n}` (0 = the original sheet) → saved again as the newest version. */
export async function POST(request: Request) {
  await connection();
  const body = await readOneValue(request, "versionId", 256);
  if (body instanceof Response) return body;
  if (typeof body.value !== "number") return askFail(400, "Unknown version.");
  const result = await restoreVersion(body.value);
  return result.ok ? Response.json(result.data, { headers: ASK_HEADERS }) : askFail(result.status, result.error);
}
