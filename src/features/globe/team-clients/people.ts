/** Everyone in the team now: a same-origin GET of the literal `/api/globe/team/people`. */

import type { TeamPerson } from "../team-types";

const PEOPLE_URL = "/api/globe/team/people";

export async function fetchTeamPeople(signal?: AbortSignal): Promise<TeamPerson[]> {
  const response = await fetch(PEOPLE_URL, { signal, cache: "no-store" });
  if (response.status === 401) throw new Error("Your sign-in has expired. Reload the page to sign in again.");
  if (!response.ok) throw new Error("The team list could not be loaded.");
  return ((await response.json()) as { people: TeamPerson[] }).people;
}
