import { connection } from "next/server";
import { ASK_HEADERS, askFail, readOneField } from "@/features/globe/ask-request.server";
import { applyUpload, MAX_SHEET_BYTES } from "@/features/globe/team-admin.server";

/** POST /api/globe/team/apply: `{"file": "<base64 .xlsx>"}` → reads it again and saves it as the new team version. */
export async function POST(request: Request) {
  await connection();
  const file = await readOneField(request, "file", Math.ceil(MAX_SHEET_BYTES * 1.4) + 64);
  if (file instanceof Response) return file;
  const result = await applyUpload(file);
  return result.ok ? Response.json(result.data, { headers: ASK_HEADERS }) : askFail(result.status, result.error);
}
