import { connection } from "next/server";
import { putContact } from "@/features/visit-insights/client.server";
import { parseContactForm } from "@/features/visit-insights/forms";
import { back, readHoForm } from "@/features/visit-insights/guard.server";

/** POST /api/visit-insights/contacts: save a rep's WhatsApp number and email. The service validates them again. */
export async function POST(request: Request) {
  await connection();
  const body = await readHoForm(request);
  if (body instanceof Response) return body;
  const c = parseContactForm(body);
  const ok = c ? (await putContact(c)).ok : false;
  return back(`/visit-insights/messages?contact=${ok ? 1 : 0}#contacts`);
}
