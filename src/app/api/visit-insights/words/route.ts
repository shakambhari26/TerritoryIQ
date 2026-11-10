import { connection } from "next/server";
import { isRequestAuthorized } from "@/lib/auth";
import { isLoopbackHost } from "@/lib/loopback";
import { safeReturn } from "@/features/visit-insights/forms";
import { NO_STORE } from "@/features/visit-insights/guard.server";
import { WORDS_COOKIE, parseWords } from "@/features/visit-insights/vocab";

/**
 * GET /api/visit-insights/words?mode=simple|expert&back=<path>: the Simple / Expert switch. Remembers the choice in a
 * cookie (a display preference only, no data) and returns to the page it was flipped on. A link, so it works without
 * scripts and every page reads the same setting.
 */
export async function GET(request: Request) {
  await connection();
  if (!isRequestAuthorized(request.headers)) return new Response("Sign in required.", { status: 401, headers: NO_STORE });
  const url = new URL(request.url);
  const words = parseWords(url.searchParams.get("mode"));
  const location = safeReturn(url.searchParams.get("back")) ?? "/visit-insights";
  // Like the session cookie: Secure everywhere but loopback, where a test over plain http needs it off.
  const secure = isLoopbackHost(request.headers.get("host")) ? "" : "; Secure";
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      "Set-Cookie": `${WORDS_COOKIE}=${words}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`,
      ...NO_STORE,
    },
  });
}
