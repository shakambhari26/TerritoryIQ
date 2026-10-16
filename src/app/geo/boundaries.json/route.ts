import { getLayerText } from "@/features/territory/dataset.server";

/**
 * Serves the provisional boundary layer to the workspace map. The layer lives in
 * `data/generated/` (server only), not in `public/`, so it is delivered only by
 * this handler and only after `src/proxy.ts` has accepted the request's host.
 * Its own `meta` block carries the OpenStreetMap attribution, the ODbL licence
 * and the provisional status; the browser refuses a layer that lacks them.
 */
export function GET() {
  const text = getLayerText();
  if (text === null) {
    return Response.json(
      { error: "The boundary layer has not been built. Run npm run data:build, then restart the server." },
      { status: 404 },
    );
  }
  return new Response(text, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
