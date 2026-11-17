/** Record (or, with dryRun, check) a team change. A same-origin POST of `{ change }` to the literal `/api/globe/team/change`. */

import type { TeamChangeRequest } from "../team-change";
import type { ChangeOutcome } from "../team-types";

const CHANGE_URL = "/api/globe/team/change";

export async function sendTeamChange(change: TeamChangeRequest, signal?: AbortSignal): Promise<ChangeOutcome> {
  const response = await fetch(CHANGE_URL, {
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
  return body as ChangeOutcome;
}
