import { connection } from "next/server";
import { isRequestAuthorized } from "@/lib/auth";
import { postLabel } from "@/features/visit-insights/client.server";
import { MAX_LABEL_FORM_BYTES, isSameOrigin, parseLabelForm } from "@/features/visit-insights/label-form";

/**
 * POST /api/visit-insights/labels: the supervisor's correction form on /visit-insights. Checks the session again (the
 * proxy already did), refuses cross-site posts, validates the three fields against fixed patterns, forwards them to
 * the Visit Intelligence service server-side, and returns to the supervisor view with a saved / not-saved notice.
 */
const NO_STORE = { "Cache-Control": "no-store" };
const back = (saved: boolean) =>
  new Response(null, { status: 303, headers: { Location: `/visit-insights?role=supervisor&saved=${saved ? 1 : 0}`, ...NO_STORE } });

export async function POST(request: Request) {
  await connection();
  if (!isRequestAuthorized(request.headers)) return new Response("Sign in required.", { status: 401, headers: NO_STORE });
  if (!isSameOrigin(request.headers)) return new Response("Cross-site request refused.", { status: 403, headers: NO_STORE });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_LABEL_FORM_BYTES) return new Response("Request too large.", { status: 413, headers: NO_STORE });

  const label = parseLabelForm(await request.text());
  if (!label) return back(false);
  return back((await postLabel(label)).ok);
}
