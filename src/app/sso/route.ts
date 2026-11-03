import { connection } from "next/server";
import { authMode, createSessionToken, safeNextPath, sessionCookie } from "@/lib/auth";
import { ssoConfig, verifyFrontierToken } from "@/lib/frontier-sso";

/**
 * GET /sso?token=<signed token>&next=/globe&embed=1: sign-in from the Frontier app (src/lib/frontier-sso.ts).
 *
 * A valid token gets the same session cookie as the sign-in page and a redirect to `next` (a same-site path only).
 * `embed=1` (the default) opens TerritoryIQ without its own sidebar and footer, to sit inside Frontier's screen;
 * `embed=0` opens the full site, e.g. in a new browser tab. `framed=1` says the page is inside a web iframe on
 * Frontier's site, where the cookie must be `SameSite=None` to be sent back at all.
 *
 * Every refusal is the same plain 401 page, so a caller cannot probe which check failed; the reason goes to the
 * server log with the user id, never the token.
 */

const NO_STORE = { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" };

export async function GET(request: Request) {
  await connection();
  const mode = authMode();
  const config = ssoConfig();
  if (mode.kind !== "hosted" || !config) return new Response("Frontier sign-in is not switched on.", { status: 404, headers: NO_STORE });

  const url = new URL(request.url);
  const result = verifyFrontierToken(url.searchParams.get("token"), config);
  if (!result.ok) {
    console.warn(`Frontier sign-in refused: ${result.reason}`);
    return new Response("This sign-in link is not valid or has expired. Open TerritoryIQ again from Frontier.", { status: 401, headers: NO_STORE });
  }
  console.info(`Frontier sign-in: ${result.user.sub} (${result.user.role})`);

  const next = new URL(safeNextPath(url.searchParams.get("next") ?? "/globe"), url.origin);
  if (url.searchParams.get("embed") !== "0") next.searchParams.set("embed", "1");
  const framed = url.searchParams.get("framed") === "1";
  return new Response(null, {
    status: 303,
    headers: {
      Location: next.pathname + next.search,
      "Cache-Control": "no-store",
      "Set-Cookie": sessionCookie(createSessionToken(mode.config), request.headers.get("host"), framed),
    },
  });
}
