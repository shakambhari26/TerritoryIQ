import { connection } from "next/server";
import { ASK_HEADERS, askFail, readOneField } from "@/features/globe/ask-request.server";
import { MAX_SHEET_BYTES, previewUpload } from "@/features/globe/team-admin.server";

/** POST /api/globe/team/preview: `{"file": "<base64 .xlsx>"}` → what applying it would change. Saves nothing. */
export async function POST(request: Request) {
  await connection();
  const file = await readOneField(request, "file", Math.ceil(MAX_SHEET_BYTES * 1.4) + 64);
  if (file instanceof Response) return file;
  const result = await previewUpload(file);
  return result.ok ? Response.json(result.data, { headers: ASK_HEADERS }) : askFail(result.status, result.error);
}
