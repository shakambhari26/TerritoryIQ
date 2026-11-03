import { isRequestAuthorized } from "@/lib/auth";
import { MAX_FORM_BYTES } from "./forms";
import { isSameOrigin } from "./label-form";

/**
 * Shared checks for the head-office form posts under /api/visit-insights: the session again (the proxy already did),
 * same-origin only, and a size cap. Returns the form body, or the response to send instead.
 */
export const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function readHoForm(request: Request): Promise<string | Response> {
  if (!isRequestAuthorized(request.headers)) return new Response("Sign in required.", { status: 401, headers: NO_STORE });
  if (!isSameOrigin(request.headers)) return new Response("Cross-site request refused.", { status: 403, headers: NO_STORE });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FORM_BYTES) {
    return new Response("Request too large.", { status: 413, headers: NO_STORE });
  }
  return request.text();
}

/** 303 back to a fixed page inside the app; callers build `path` from validated values only (no open redirect). */
export const back = (path: string) => new Response(null, { status: 303, headers: { Location: path, ...NO_STORE } });
