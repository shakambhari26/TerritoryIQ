/**
 * The globe's one network request: a same-origin GET of the globe's own outline file from the route handler at
 * `/geo/globe-boundaries.json` (src/app/geo/globe-boundaries.json/route.ts). It is not the workspace's
 * `/geo/boundaries.json`. The URL is a literal; nothing here accepts a URL, a host or a path from anywhere else. The
 * response is not trusted: it goes through mergeLayer (layer-merge.ts), which checks it against the validated
 * manifest before anything is drawn.
 */

const LAYER_URL = "/geo/globe-boundaries.json";

/** The route refused. `code` is the route's own word for why, when it gave one. */
export class LayerRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, code: string | null) {
    super(`HTTP ${status}${code ? ` ${code}` : ""}`);
    this.name = "LayerRequestError";
    this.status = status;
    this.code = code;
  }
}

export async function fetchBoundaryLayer(signal: AbortSignal): Promise<unknown> {
  const response = await fetch(LAYER_URL, { signal, cache: "no-cache" });
  if (!response.ok) {
    let code: string | null = null;
    try {
      const body: unknown = await response.json();
      const value = (body as { code?: unknown } | null)?.code;
      if (typeof value === "string" && /^[a-z]{1,16}$/.test(value)) code = value;
    } catch {
      /* no usable body: the status alone is reported */
    }
    throw new LayerRequestError(response.status, code);
  }
  return response.json();
}
