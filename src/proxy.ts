import { NextResponse, type NextRequest } from "next/server";
import { authMode, isRequestAuthorized } from "@/lib/auth";
import { isLoopbackHost } from "@/lib/loopback";

const TEXT = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

/**
 * Reachable without a session in hosted mode: the sign-in page, sign-out, the tab icon the sign-in page shows, and
 * /sso, where a signed token from Frontier starts a session (src/lib/frontier-sso.ts).
 */
const PUBLIC_PATHS = new Set(["/login", "/logout", "/icon.svg", "/sso"]);

/**
 * A field rep's reply link from a head-office WhatsApp or email message (src/app/r/[token]/route.ts). Reps have no
 * account; the unguessable token in the path is the key, and the route shows only that one message. Exactly one path
 * segment after /r/, so nothing else under it is opened up.
 */
const REPLY_LINK = /^\/r\/[A-Za-z0-9_-]{20,64}$/;

/**
 * Runs for every path, including static assets, because the pages embed the workbook data and the boundary layer is
 * served by a route. No matcher, on purpose.
 *
 * Local mode (no sign-in configured, see src/lib/auth.ts): refuses any request whose Host header is not the loopback
 * address. See `src/lib/loopback.ts` for what this does and does not protect against.
 *
 * Hosted mode: any Host, but no session means no data. A page load is sent to /login; anything else gets a 401.
 */
export function proxy(request: NextRequest) {
  const mode = authMode();

  if (mode.kind === "local") {
    if (isLoopbackHost(request.headers.get("host"))) return NextResponse.next();
    return new NextResponse("TerritoryIQ is a localhost-only prototype. Use http://127.0.0.1 or http://localhost.", {
      status: 403,
      headers: TEXT,
    });
  }

  if (mode.kind === "misconfigured") {
    console.error(`TerritoryIQ sign-in is misconfigured: ${mode.problem}. Refusing every request.`);
    return new NextResponse("TerritoryIQ sign-in is not configured correctly.", { status: 503, headers: TEXT });
  }

  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || REPLY_LINK.test(pathname)) return NextResponse.next();
  if (isRequestAuthorized(request.headers, mode)) return NextResponse.next();

  if ((request.method === "GET" || request.method === "HEAD") && !pathname.startsWith("/api/")) {
    // Proxy needs an absolute Location. Build it from the public Host and the edge's protocol, so it never names the
    // internal address the server listens on behind the edge.
    const proto = request.headers.get("x-forwarded-proto") === "https" ? "https" : request.nextUrl.protocol.replace(":", "");
    const login = new URL(`${proto}://${request.headers.get("host") ?? request.nextUrl.host}/login`);
    if (pathname !== "/") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login, { status: 303, headers: { "Cache-Control": "no-store" } });
  }
  return new NextResponse("Sign in required.", { status: 401, headers: TEXT });
}
