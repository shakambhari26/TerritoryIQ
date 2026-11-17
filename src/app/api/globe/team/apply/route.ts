import { connection } from "next/server";
import { ASK_HEADERS, askFail, readOneValue } from "@/features/globe/ask-request.server";
import { applyUpload, MAX_SHEET_BYTES, parseUpload } from "@/features/globe/team-admin.server";

/**
 * POST /api/globe/team/apply: `{"upload": {"file": "<base64 .xlsx>", "fileName": "<name>.xlsx", "by": "<who is uploading>"}}`
 * → reads the sheet again and saves it as the new team version, with who uploaded it and which file.
 */
export async function POST(request: Request) {
  await connection();
  const body = await readOneValue(request, "upload", Math.ceil(MAX_SHEET_BYTES * 1.4) + 1024);
  if (body instanceof Response) return body;
  const upload = parseUpload(body.value);
  if (!upload) return askFail(400, "Send the .xlsx file, its name and your name (at least 2 letters).");
  const result = await applyUpload(upload);
  return result.ok ? Response.json(result.data, { headers: ASK_HEADERS }) : askFail(result.status, result.error);
}
