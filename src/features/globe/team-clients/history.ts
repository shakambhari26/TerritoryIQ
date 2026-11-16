/** The saved team versions, newest first: a same-origin GET of the literal `/api/globe/team/history`. */

import type { TeamHistory } from "../team-types";

const HISTORY_URL = "/api/globe/team/history";

export async function fetchTeamHistory(signal?: AbortSignal): Promise<TeamHistory> {
  const response = await fetch(HISTORY_URL, { signal, cache: "no-store" });
  if (response.status === 401) throw new Error("Your sign-in has expired. Reload the page to sign in again.");
  if (!response.ok) throw new Error("The history could not be loaded.");
  return (await response.json()) as TeamHistory;
}
