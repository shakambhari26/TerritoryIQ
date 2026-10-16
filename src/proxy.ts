import { NextResponse, type NextRequest } from "next/server";
import { isLoopbackHost } from "@/lib/loopback";

/**
 * Refuses any request whose Host header is not the loopback address. See
 * `src/lib/loopback.ts` for what this does and does not protect against. It
 * runs for every path, including static assets, because the pages embed the
 * workbook data and the boundary layer is served by a route.
 */
export function proxy(request: NextRequest) {
  if (isLoopbackHost(request.headers.get("host"))) return NextResponse.next();
  return new NextResponse("TerritoryIQ is a localhost-only prototype. Use http://127.0.0.1 or http://localhost.", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
