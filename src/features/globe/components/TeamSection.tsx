"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BlockRowsRequestError, fetchBlockRows } from "../block-rows-client";
import type { BlockRow } from "../block-rows";
import { fetchDistrictTeam } from "../district-team-client";
import type { DistrictTeamPayload } from "../block-rows";
import { ROLE_COLOUR, ROLE_NAME, ROLE_ORDER } from "../staffing";
import { editTeamMember } from "../team-clients/edit";
import type { TeamRole } from "../team-types";
import type { ManifestBlock } from "../types";

/** A request that has not answered by now is abandoned and shown as an error with a retry. */
export const TEAM_TIMEOUT_MS = 10_000;

type Outcome<T> = { attempt: number; kind: "ready"; data: T } | { attempt: number; kind: "error"; signedOut?: boolean };
export type Lookup<T> = { state: "idle" } | { state: "loading" } | { state: "error"; retry: () => void; signedOut: boolean } | { state: "ready"; data: T };

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
      (error: unknown) => {
        if (!controller.signal.aborted) finish({ attempt, kind: "error", signedOut: error instanceof BlockRowsRequestError && error.status === 401 });
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
  if (current.kind === "error") return { state: "error", retry: () => setAttempt((n) => n + 1), signedOut: current.signedOut === true };
  return { state: "ready", data: current.data };
}

/** Everyone in one district (every place with its sheet rows). Idle when no district is open. */
export function useDistrictTeam(districtId: string | null, blocks: readonly ManifestBlock[], version = 0): Lookup<DistrictTeamPayload> {
  const expected = useMemo(() => blocks.map((b) => ({ id: b.id, rowIds: b.rowIds })), [blocks]);
  const key = `v${version}:${districtId}:${expected.map((e) => `${e.id}=${e.rowIds.join(",")}`).join("|")}`;
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

function Failed({ testId, onRetry, signedOut }: { testId: string; onRetry: () => void; signedOut: boolean }) {
  return (
    <div data-testid={testId} data-state="error" className="space-y-2">
      <p role="alert" className="text-xs text-warn-ink">
        {signedOut ? "Your sign-in has expired. Reload the page to sign in again." : "The team could not be loaded."}
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
export function BlockTeam({ block, version = 0, editable = false }: { block: ManifestBlock; version?: number; editable?: boolean }) {
  const lookup = useTeamLookup(`v${version}:${block.id}:${block.rowIds.join("|")}`, block.rowIds.length > 0, (signal) => fetchBlockRows(block.id, block.rowIds, signal).then((p) => p.rows));
  const testId = "globe-block-team";
  if (lookup.state === "idle")
    return editable ? (
      <section data-testid={testId} data-state="ready" aria-label={`Team in ${block.name}`}>
        <TeamEditor block={block} groups={[]} />
      </section>
    ) : null;
  if (lookup.state === "loading") return <Loading testId={testId} />;
  if (lookup.state === "error") return <Failed testId={testId} onRetry={lookup.retry} signedOut={lookup.signedOut} />;
  const groups = groupByRole([{ place: block.name, rows: lookup.data }]);
  return (
    <section data-testid={testId} data-state="ready" aria-label={`Team in ${block.name}`}>
      {editable ? <TeamEditor block={block} groups={groups} /> : <TeamList groups={groups} showPlaces={false} />}
    </section>
  );
}

/**
 * Editing one place's team: remove a person (asked to confirm), or add one with a role. Each change is saved as a new
 * team version, and the page data is refreshed so the map, counts and panels show it at once.
 */
function TeamEditor({ block, groups }: { block: ManifestBlock; groups: RoleGroup[] }) {
  const router = useRouter();
  const [role, setRole] = useState<TeamRole>("SECONDARY");
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (action: "add" | "remove", r: TeamRole, person: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const version = await editTeamMember({ action, blockId: block.id, role: r, name: person });
      setMessage({ ok: true, text: version.summary });
      setName("");
      setConfirming(null);
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "That did not work." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="team-editor">
      {groups.map(({ role: r, people }) => (
        <div key={r}>
          <h4 className="text-xs font-semibold text-ink-muted">{ROLE_NAME[r] ?? r}</h4>
          <ul className="mt-1 space-y-1">
            {people.map((person) => {
              const key = `${r}|${person.name}`;
              return (
                <li key={key} className="flex items-center gap-2">
                  <PersonIcon role={r} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{person.name}</span>
                  {confirming === key ? (
                    <span className="flex items-center gap-1">
                      <button type="button" disabled={busy} onClick={() => save("remove", r as TeamRole, person.name)} className="rounded-md bg-[#c62828] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" data-testid="team-editor-confirm">
                        Remove
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className="rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted">
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => setConfirming(key)} aria-label={`Remove ${person.name}`} className="grid size-7 place-items-center rounded-md text-ink-muted hover:bg-[#c62828]/10 hover:text-[#c62828]" data-testid="team-editor-remove">
                      <svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="m5.5 5.5 9 9m0-9-9 9" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <form
        className="space-y-2 rounded-xl bg-surface-muted p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim().length >= 2) void save("add", role, name);
        }}
        data-testid="team-editor-add"
      >
        <p className="text-xs font-semibold text-ink">Add a person to {block.name}</p>
        <select value={role} onChange={(event) => setRole(event.target.value as TeamRole)} aria-label="Role" className="h-9 w-full rounded-lg bg-white px-2 text-sm text-ink ring-1 ring-line">
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>
              {ROLE_NAME[r]}
            </option>
          ))}
        </select>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Full name" aria-label="Full name" className="h-9 w-full rounded-lg bg-white px-2 text-sm text-ink ring-1 ring-line" />
        <button type="submit" disabled={busy || name.trim().length < 2} className="h-9 w-full rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50">
          {busy ? "Saving…" : "Add person"}
        </button>
      </form>
      {message ? (
        <p role="status" className={message.ok ? "text-xs text-ink" : "text-xs text-warn-ink"} data-testid="team-editor-message">
          {message.text}
        </p>
      ) : null}
    </div>
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
  if (lookup.state === "error") return <Failed testId={testId} onRetry={lookup.retry} signedOut={lookup.signedOut} />;
  return (
    <section data-testid={testId} data-state="ready" aria-label={`Team in ${districtName}`}>
      <TeamList groups={groups} showPlaces />
    </section>
  );
}
