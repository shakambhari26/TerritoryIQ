import { connection } from "next/server";
import { isRequestAuthorized } from "@/lib/auth";
import { getMarketJson } from "@/features/globe/market.server";

/**
 * GET /api/globe/market: the real market figures for the dashboard under the globe (features/market). Auth-checked
 * (it carries rep names), never cached. 404 when the file has not been built, so the dashboard falls back to its
 * sample generator.
 */
const NO_STORE = { "Cache-Control": "no-store" };

async function respond(request: Request) {
  await connection();
  if (!isRequestAuthorized(request.headers)) return new Response("Sign in required.", { status: 401, headers: NO_STORE });
  const body = getMarketJson();
  if (!body) return new Response(JSON.stringify({ error: "not built" }), { status: 404, headers: { "Content-Type": "application/json", ...NO_STORE } });
  return new Response(body, { headers: { "Content-Type": "application/json", ...NO_STORE } });
}

export const GET = respond;
