"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchBlockRows } from "../block-rows-client";
import type { BlockRow } from "../block-rows";
import { fetchDistrictTeam } from "../district-team-client";
import type { DistrictTeamPayload } from "../block-rows";
import { ROLE_COLOUR, ROLE_NAME, ROLE_ORDER } from "../staffing";
import type { ManifestBlock } from "../types";

/** A request that has not answered by now is abandoned and shown as an error with a retry. */
export const TEAM_TIMEOUT_MS = 10_000;

type Outcome<T> = { attempt: number; kind: "ready"; data: T } | { attempt: number; kind: "error" };
export type Lookup<T> = { state: "idle" } | { state: "loading" } | { state: "error"; retry: () => void } | { state: "ready"; data: T };

/**
 * Runs `load` once per `key` (and per retry), with a timeout, aborting on change. Names are never on the page: they are
 * fetched when a place is opened, and dropped when the selection changes.
 */
function useTeamLookup<T>(key: string, enabled: boolean, load: (signal: AbortSignal) => Promise<T>): Lookup<T> {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<(Outcome<T> & { key: string }) | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let settled = false;
    const finish = (next: Outcome<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      setOutcome({ ...next, key });
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish({ attempt, kind: "error" });
    }, TEAM_TIMEOUT_MS);
    loadRef.current(controller.signal).then(
      (data) => finish({ attempt, kind: "ready", data }),
      () => {
        if (!controller.signal.aborted) finish({ attempt, kind: "error" });
      },
    );
    return () => {
      settled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, enabled, attempt]);

  if (!enabled) return { state: "idle" };
  const current = outcome && outcome.attempt === attempt && outcome.key === key ? outcome : null;
  if (!current) return { state: "loading" };
  if (current.kind === "error") return { state: "error", retry: () => setAttempt((n) => n + 1) };
  return { state: "ready", data: current.data };
}

/** Everyone in one district (every place with its sheet rows). Idle when no district is open. */
export function useDistrictTeam(districtId: string | null, blocks: readonly ManifestBlock[]): Lookup<DistrictTeamPayload> {
  const expected = useMemo(() => blocks.map((b) => ({ id: b.id, rowIds: b.rowIds })), [blocks]);
  const key = `${districtId}:${expected.map((e) => `${e.id}=${e.rowIds.join(",")}`).join("|")}`;
  return useTeamLookup(key, districtId !== null && expected.length > 0, (signal) => fetchDistrictTeam(districtId!, expected, signal));
}

function Loading({ testId }: { testId: string }) {
  return (
    <div data-testid={testId} data-state="loading" aria-busy="true" className="space-y-2">
      <p role="status" className="sr-only">
        Loading the team…
      </p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-muted" />
      ))}
    </div>
  );
}

function Failed({ testId, onRetry }: { testId: string; onRetry: () => void }) {
  return (
    <div data-testid={testId} data-state="error" className="space-y-2">
      <p role="alert" className="text-xs text-warn-ink">
        The team could not be loaded.
      </p>
      <button type="button" data-testid={`${testId}-retry`} onClick={onRetry} className="rounded-lg bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary-ink">
        Retry
      </button>
    </div>
  );
}

function PersonIcon({ role }: { role: string }) {
  return (
    <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: ROLE_COLOUR[role] ?? "#64748b" }}>
      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
        <circle cx="8" cy="5" r="3" />
        <path d="M2.5 14.5c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6z" />
      </svg>
    </span>
  );
}

interface RoleGroup {
  role: string;
  people: Array<{ name: string; places: string[] }>;
  vacant: number;
}

/** People grouped by role, each person once, with the places they cover. */
function groupByRole(entries: ReadonlyArray<{ place: string; rows: readonly BlockRow[] }>): RoleGroup[] {
  return ROLE_ORDER.map((role) => {
    const people = new Map<string, { name: string; places: string[] }>();
    let vacant = 0;
    for (const { place, rows } of entries) {
      for (const row of rows) {
        for (const person of row.people) {
          if (person.role !== role) continue;
          if (person.vacant || !person.name) {
            vacant++;
            continue;
          }
          const found = people.get(person.name.toLowerCase()) ?? { name: person.name, places: [] };
          if (!found.places.includes(place)) found.places.push(place);
          people.set(person.name.toLowerCase(), found);
        }
      }
    }
    return { role, people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)), vacant };
  }).filter((g) => g.people.length > 0 || g.vacant > 0);
}

/** The team, role by role, with the role written in full. `showPlaces` lists each person's places (district view). */
function TeamList({ groups, showPlaces }: { groups: RoleGroup[]; showPlaces: boolean }) {
  return (
    <div className="space-y-3">
      {groups.map(({ role, people, vacant }) => (
        <div key={role} data-role={role}>
          <h4 className="text-xs font-semibold text-ink-muted">
            {ROLE_NAME[role] ?? role} <span className="font-normal">({people.length})</span>
          </h4>
          <ul className="mt-1 space-y-1">
            {people.map((person) => (
              <li key={person.name} className="flex items-start gap-2">
                <PersonIcon role={role} />
                <span className="min-w-0 flex-1 text-sm leading-6 text-ink">
                  {person.name}
                  {showPlaces ? <span className="block text-xs leading-4 text-ink-muted">{person.places.sort((a, b) => a.localeCompare(b)).join(", ")}</span> : null}
                </span>
              </li>
            ))}
            {vacant > 0 ? <li className="pl-8 text-xs text-ink-muted">{vacant === 1 ? "1 vacant position" : `${vacant} vacant positions`}</li> : null}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The team of one place, fetched when the place is opened. */
export function BlockTeam({ block }: { block: ManifestBlock }) {
  const lookup = useTeamLookup(`${block.id}:${block.rowIds.join("|")}`, block.rowIds.length > 0, (signal) => fetchBlockRows(block.id, block.rowIds, signal).then((p) => p.rows));
  const testId = "globe-block-team";
  if (lookup.state === "idle") return null;
  if (lookup.state === "loading") return <Loading testId={testId} />;
  if (lookup.state === "error") return <Failed testId={testId} onRetry={lookup.retry} />;
  return (
    <section data-testid={testId} data-state="ready" aria-label={`Team in ${block.name}`}>
      <TeamList groups={groupByRole([{ place: block.name, rows: lookup.data }])} showPlaces={false} />
    </section>
  );
}

/** Everyone working in a district, by role, with the places each covers. The data comes from `useDistrictTeam`. */
export function DistrictTeam({ lookup, blocks, districtName }: { lookup: Lookup<DistrictTeamPayload>; blocks: readonly ManifestBlock[]; districtName: string }) {
  const testId = "globe-district-team";
  const groups = useMemo(() => {
    if (lookup.state !== "ready") return [];
    const nameOf = new Map(blocks.map((b) => [b.id, b.name]));
    return groupByRole(lookup.data.blocks.map((entry) => ({ place: nameOf.get(entry.blockId) ?? entry.blockId, rows: entry.rows })));
  }, [lookup, blocks]);
  if (lookup.state === "idle") return null;
  if (lookup.state === "loading") return <Loading testId={testId} />;
  if (lookup.state === "error") return <Failed testId={testId} onRetry={lookup.retry} />;
  return (
    <section data-testid={testId} data-state="ready" aria-label={`Team in ${districtName}`}>
      <TeamList groups={groups} showPlaces />
    </section>
  );
}
