/** Restore a saved team version (0 = the original sheet). A same-origin POST of `{ versionId }` to the literal `/api/globe/team/restore`. */

import type { VersionMeta } from "../team-types";

const RESTORE_URL = "/api/globe/team/restore";

export async function restoreTeamVersion(versionId: number, signal?: AbortSignal): Promise<VersionMeta> {
  const response = await fetch(RESTORE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ versionId }),
    signal,
    cache: "no-store",
  });
  if (response.status === 401) throw new Error("Your sign-in has expired. Reload the page to sign in again.");
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new Error(typeof message === "string" && message.length < 300 ? message : "That did not work. Try again.");
  }
  return body as VersionMeta;
}
