/** Apply an uploaded sheet as the new team version. A same-origin POST of `{ file }` to the literal `/api/globe/team/apply`. */

import type { VersionMeta } from "../team-types";

const APPLY_URL = "/api/globe/team/apply";

export async function applySheet(file: string, signal?: AbortSignal): Promise<VersionMeta> {
  const response = await fetch(APPLY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file }),
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
