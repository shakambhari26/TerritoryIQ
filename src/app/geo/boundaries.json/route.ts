import { getLayerText } from "@/features/territory/dataset.server";

/**
 * Serves the provisional boundary layer to the workspace map. The layer lives in
 * `data/generated/` (server only), not in `public/`, so it is delivered only by
 * this handler and only after `src/proxy.ts` has accepted the request's host.
 * Its own `meta` block carries the OpenStreetMap attribution, the ODbL licence
 * and the provisional status; the browser refuses a layer that lacks them.
 *
 * Both the layer and the "not built" answer carry the same `Cache-Control` as the `/geo/:path*` rule in
 * `next.config.ts` (tests/unit/response-headers-config.test.mts keeps the two equal).
 */
const CACHE_CONTROL = "private, no-store";

export function GET() {
  const text = getLayerText();
  if (text === null) {
    return Response.json(
      { error: "The boundary layer has not been built. Run npm run data:build, then restart the server." },
      { status: 404, headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }
  return new Response(text, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
