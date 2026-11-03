import { connection } from "next/server";
import { postMessage } from "@/features/visit-insights/client.server";
import { parseMessageForm } from "@/features/visit-insights/forms";
import { back, readHoForm } from "@/features/visit-insights/guard.server";
import { visitHref } from "@/features/visit-insights/links";

/**
 * POST /api/visit-insights/messages: head office sends a suggestion or to-do list to a rep (in-app, WhatsApp, email).
 * Returns to the visit it was about, or to the Messages page, with a sent / not-sent notice.
 */
export async function POST(request: Request) {
  await connection();
  const body = await readHoForm(request);
  if (body instanceof Response) return body;
  const m = parseMessageForm(body);
  const where = (ok: boolean, id?: number) =>
    m?.visit_key
      ? `${visitHref(m.visit_key, { sent: ok ? "1" : "0" })}#send`
      : `/visit-insights/messages?sent=${ok ? 1 : 0}${id ? `#m${id}` : ""}`;
  if (!m) return back(where(false));
  const res = await postMessage(m);
  return back(where(res.ok, res.ok ? res.data.id : undefined));
}
