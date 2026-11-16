import { connection } from "next/server";
import { ASK_HEADERS, askFail, readOneValue } from "@/features/globe/ask-request.server";
import { editTeam, parseChange } from "@/features/globe/team-admin.server";

/** POST /api/globe/team/edit: `{"change": {"action": "add"|"remove", "blockId", "role", "name"}}` → a new team version. */
export async function POST(request: Request) {
  await connection();
  const body = await readOneValue(request, "change", 2048);
  if (body instanceof Response) return body;
  const change = parseChange(body.value);
  if (!change) return askFail(400, "The change must name an action (add or remove), a place, a role and a person.");
  const result = await editTeam(change);
  return result.ok ? Response.json(result.data, { headers: ASK_HEADERS }) : askFail(result.status, result.error);
}
