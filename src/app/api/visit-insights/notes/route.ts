import { connection } from "next/server";
import { postNote } from "@/features/visit-insights/client.server";
import { parseNoteForm } from "@/features/visit-insights/forms";
import { back, readHoForm } from "@/features/visit-insights/guard.server";

/** POST /api/visit-insights/notes: head office answers a rep's reply; the rep sees it on their reply link. */
export async function POST(request: Request) {
  await connection();
  const body = await readHoForm(request);
  if (body instanceof Response) return body;
  const n = parseNoteForm(body);
  const ok = n ? (await postNote(n.id, n.text)).ok : false;
  return back(`/visit-insights/messages?noted=${ok ? 1 : 0}${n ? `#m${n.id}` : ""}`);
}
