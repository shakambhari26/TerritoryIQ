/** Add or remove one person at one place. A same-origin POST of `{ change }` to the literal `/api/globe/team/edit`. */

import type { TeamChange, VersionMeta } from "../team-types";

const EDIT_URL = "/api/globe/team/edit";

export async function editTeamMember(change: TeamChange, signal?: AbortSignal): Promise<VersionMeta> {
  const response = await fetch(EDIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ change }),
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
