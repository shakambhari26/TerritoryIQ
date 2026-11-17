/** The newest saved team version and what it changed: a same-origin GET of the literal `/api/globe/team/latest`. */

import type { LatestUpdate } from "../team-types";

const LATEST_URL = "/api/globe/team/latest";

export async function fetchLatestUpdate(signal?: AbortSignal): Promise<LatestUpdate | null> {
  const response = await fetch(LATEST_URL, { signal, cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as LatestUpdate;
}
