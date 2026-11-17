"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ROLE_NAME } from "../staffing";
import { fetchLatestUpdate } from "../team-clients/latest";
import { KIND_INFO, reasonLabel } from "../team-change";
import type { LatestUpdate, PeopleChanges, PlaceRef } from "../team-types";
import type { DataSource } from "../types";

/**
 * Keeping everyone up to date when the team sheet changes.
 *
 *   useTeamUpdates   asks the server for the newest saved team version every 30 seconds while the page is visible (and
 *                    at once when the tab comes back, or when this page saves a change). A version newer than the one
 *                    the page opened with refreshes the map and opens the "Team updated" popup, once per version. Nothing
 *                    is kept in the browser: when you open the page, the Data sources line says when it last changed.
 *   TeamUpdatePopup  who joined, who left, whose role changed and who moved, with who uploaded it and when. A name flies
 *                    the map to that person's place.
 *   DataSources      one line per layer: where its data comes from, when it was last uploaded or fetched, by whom, and
 *                    how to check it.
 */

const CHECK_EVERY_MS = 30_000;
/** Sent by this page after it saves a change, so the popup follows at once instead of within 30 seconds. */
export const TEAM_CHANGED_EVENT = "tiq:team-changed";

export function useTeamUpdates(teamVersion: number) {
  const router = useRouter();
  const [latest, setLatest] = useState<LatestUpdate | null>(null);
  const [popup, setPopup] = useState<LatestUpdate | null>(null);
  const refreshedFor = useRef(teamVersion);
  // Versions up to this one were already there when the page opened (or were already shown): no popup for them.
  const shownUpTo = useRef<number | null>(null);

  const check = useCallback(
    async (signal?: AbortSignal) => {
      const got = await fetchLatestUpdate(signal).catch(() => null);
      if (!got || signal?.aborted) return;
      setLatest(got);
      const id = got.version?.id ?? 0;
      if (id !== teamVersion && id !== refreshedFor.current) {
        refreshedFor.current = id;
        router.refresh();
      }
      if (shownUpTo.current === null) shownUpTo.current = Math.min(id, teamVersion);
      if (id > shownUpTo.current) {
        shownUpTo.current = id;
        setPopup(got);
      }
    },
    [router, teamVersion],
  );

  useEffect(() => {
    const controller = new AbortController();
    const run = () => {
      if (document.visibilityState !== "hidden") void check(controller.signal);
    };
    run();
    const timer = window.setInterval(run, CHECK_EVERY_MS);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    window.addEventListener(TEAM_CHANGED_EVENT, run);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener(TEAM_CHANGED_EVENT, run);
    };
  }, [check]);

  const dismiss = useCallback(() => setPopup(null), []);

  return { latest, popup, dismiss };
}

// ------------------------------------------------------------------ wording --

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? "month" : "months"} ago`;
}

const roles = (list: string[]) => list.map((r) => ROLE_NAME[r as keyof typeof ROLE_NAME] ?? r).join(" & ");

const HOW: Record<string, string> = {
  upload: "New sheet uploaded",
  add: "Person added",
  remove: "Person removed",
  restore: "Earlier version restored",
  change: "Team change recorded",
};

// -------------------------------------------------------------------- popup --

function PlaceButton({ place, onShow }: { place: PlaceRef; onShow: (blockId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onShow(place.blockId)}
      className="rounded-full bg-surface-muted px-2 py-0.5 text-[0.6875rem] text-ink hover:bg-primary-soft hover:text-primary-ink"
      title={`Show ${place.place} on the map`}
    >
      {place.place}
      <span className="text-ink-muted"> · {place.district}</span>
    </button>
  );
}

function Group({ title, tone, count, children }: { title: string; tone: string; count: number; children: ReactNode }) {
  if (!count) return null;
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-ink">
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: tone }} />
        {title} <span className="font-normal text-ink-muted">({count})</span>
      </p>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

const MAX_PLACES = 3;
function Places({ places, onShow }: { places: PlaceRef[]; onShow: (blockId: string) => void }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {places.slice(0, MAX_PLACES).map((p) => (
        <PlaceButton key={p.blockId} place={p} onShow={onShow} />
      ))}
      {places.length > MAX_PLACES ? <span className="px-1 text-[0.6875rem] text-ink-muted">+{places.length - MAX_PLACES} more</span> : null}
    </span>
  );
}

export function ChangeLists({ changes, onShow }: { changes: PeopleChanges; onShow: (blockId: string) => void }) {
  return (
    <div className="space-y-4">
      <Group title="Joined" tone="#184f95" count={changes.joined.length}>
        {changes.joined.map((p) => (
          <li key={p.name} className="text-sm">
            <span className="font-medium text-ink">{p.name}</span> <span className="text-ink-muted">· {roles(p.roles)}</span>
            <Places places={p.places} onShow={onShow} />
          </li>
        ))}
      </Group>
      <Group title="Left" tone="#c62828" count={changes.left.length}>
        {changes.left.map((p) => (
          <li key={p.name} className="text-sm">
            <span className="font-medium text-ink line-through decoration-1">{p.name}</span> <span className="text-ink-muted">· was {roles(p.roles)}</span>
            <Places places={p.places} onShow={onShow} />
          </li>
        ))}
      </Group>
      <Group title="Role changed" tone="#b26a00" count={changes.roleChanged.length}>
        {changes.roleChanged.map((p) => (
          <li key={p.name} className="text-sm">
            <span className="font-medium text-ink">{p.name}</span>{" "}
            <span className="text-ink-muted">
              {roles(p.from)} → <span className="font-medium text-ink">{roles(p.to)}</span>
            </span>
            <Places places={p.places} onShow={onShow} />
          </li>
        ))}
      </Group>
      <Group title="Now covers different places" tone="#5b5fc7" count={changes.moved.length}>
        {changes.moved.map((p) => (
          <li key={p.name} className="text-sm">
            <span className="font-medium text-ink">{p.name}</span> <span className="text-ink-muted">· {roles(p.roles)}</span>
            {p.added.length ? (
              <span className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-[0.6875rem] font-semibold text-[#184f95]">Added</span>
                <Places places={p.added} onShow={onShow} />
              </span>
            ) : null}
            {p.removed.length ? (
              <span className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-[0.6875rem] font-semibold text-[#c62828]">Dropped</span>
                <Places places={p.removed} onShow={onShow} />
              </span>
            ) : null}
          </li>
        ))}
      </Group>
    </div>
  );
}

export function TeamUpdatePopup({ update, onClose, onShowPlace }: { update: LatestUpdate; onClose: () => void; onShowPlace: (blockId: string) => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const v = update.version;
  if (!v) return null;
  const c = update.changes;
  const tiles = c
    ? [
        { n: c.joined.length, label: "joined", tone: "text-[#184f95]", sign: "+" },
        { n: c.left.length, label: "left", tone: "text-[#c62828]", sign: "−" },
        { n: c.roleChanged.length, label: "role changed", tone: "text-[#b26a00]", sign: "" },
        { n: c.moved.length, label: "moved", tone: "text-[#5b5fc7]", sign: "" },
      ]
    : [];
  const quiet = c && tiles.every((t) => t.n === 0);
  return (
    <section
      role="dialog"
      aria-labelledby="team-update-title"
      aria-describedby="team-update-who"
      className="fixed bottom-4 right-4 z-50 flex max-h-[min(36rem,calc(100dvh-2rem))] w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-float ring-1 ring-line motion-safe:animate-[tiq-pop_220ms_ease-out]"
      data-testid="team-update-popup"
    >
      <style>{"@keyframes tiq-pop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}"}</style>
      <div className="flex items-start gap-3 border-b border-line bg-[linear-gradient(135deg,#eef5ff,#ffffff)] p-4">
        <span aria-hidden="true" className="relative mt-1.5 flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#184f95] opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#184f95]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="team-update-title" className="text-base font-semibold text-ink">
            Team updated
          </h2>
          <p id="team-update-who" className="text-xs text-ink-muted">
            {v.reason ? KIND_INFO[v.reason.kind].title : (HOW[v.kind] ?? "Changed")}
            {v.by ? (
              <>
                {" "}by <span className="font-semibold text-ink">{v.by}</span>
              </>
            ) : null}{" "}
            · {dateTime(v.createdAt)} ({ago(v.createdAt)})
          </p>
          {v.fileName ? <p className="mt-0.5 truncate text-xs text-ink-muted">File: {v.fileName}</p> : null}
          {v.reason ? (
            <p className="mt-1 text-xs text-ink" data-testid="team-update-why">
              <span className="font-semibold">Why:</span> {v.reason.reasons.map((r) => reasonLabel(v.reason!.kind, r)).join(", ")} ·{" "}
              <span className="font-semibold">From</span> {new Date(`${v.reason.effectiveDate}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
              {v.reason.note ? <span className="block text-ink-muted">“{v.reason.note}”</span> : null}
            </p>
          ) : null}
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="-m-1 rounded-lg p-1 text-ink-muted hover:bg-surface-muted hover:text-ink">
          <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="m5.5 5.5 9 9m0-9-9 9" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {c && !quiet ? (
          <>
            <div className="mb-4 grid grid-cols-4 gap-1.5">
              {tiles.map((t) => (
                <div key={t.label} className={cn("rounded-xl px-2 py-2 text-center", t.n ? "bg-surface-muted" : "bg-surface-muted/50")}>
                  <p className={cn("text-xl font-semibold tabular-nums leading-none", t.n ? t.tone : "text-ink-muted/60")}>
                    {t.n ? t.sign : ""}
                    {t.n}
                  </p>
                  <p className="mt-1 text-[0.625rem] leading-tight text-ink-muted">{t.label}</p>
                </div>
              ))}
            </div>
            <ChangeLists changes={c} onShow={onShowPlace} />
            {c.vacancies.before !== c.vacancies.after ? (
              <p className="mt-4 text-xs text-ink-muted">
                Vacant posts in the sheet: {c.vacancies.before} → <span className="font-semibold text-ink">{c.vacancies.after}</span>
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink">{quiet ? "Nobody joined, left, changed role or moved." : v.summary}</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <p className="text-[0.6875rem] text-ink-muted">The map already shows this. Tap a place to fly there.</p>
        <button type="button" onClick={onClose} className="h-9 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover" data-testid="team-update-ok">
          Got it
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------- data sources --

const KIND_BADGE: Record<DataSource["kind"], { text: string; className: string }> = {
  upload: { text: "Excel upload", className: "bg-[#e8f3ec] text-[#1d6b3a]" },
  "built-in": { text: "Built in", className: "bg-surface-muted text-ink-muted" },
  api: { text: "Live from API", className: "bg-[#e9f0fb] text-[#184f95]" },
};

function SourceIcon({ kind }: { kind: DataSource["kind"] }) {
  return (
    <span aria-hidden="true" className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", kind === "api" ? "bg-[#e9f0fb] text-[#184f95]" : "bg-[#e8f3ec] text-[#1d6b3a]")}>
      {kind === "api" ? (
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 6 3 10l4 4M13 6l4 4-4 4M11 4.5l-2 11" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="3" width="13" height="14" rx="2" />
          <path d="M3.5 7.5h13M3.5 12h13M8.5 7.5V17" />
        </svg>
      )}
    </span>
  );
}

export function DataSources({ sources }: { sources: DataSource[] | null }) {
  if (!sources?.length) return null;
  return (
    <section aria-labelledby="data-sources-title" className="border-t border-line bg-white/70 px-4 py-3" data-testid="data-sources">
      <h2 id="data-sources-title" className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        Where this data comes from
      </h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {sources.map((s) => (
          <li key={s.id} className="flex gap-3" data-testid={`data-source-${s.id}`}>
            <SourceIcon kind={s.kind} />
            <div className="min-w-0 text-xs leading-5">
              <p className="flex flex-wrap items-center gap-x-2">
                <span className="text-sm font-semibold text-ink">{s.layer}</span>
                <span className={cn("rounded-full px-2 py-px text-[0.625rem] font-semibold", KIND_BADGE[s.kind].className)}>{KIND_BADGE[s.kind].text}</span>
                {s.detail ? <span className="text-ink-muted">{s.detail}</span> : null}
              </p>
              <p className="text-ink">
                {s.from}
                {s.fileName && !s.from.includes(s.fileName) ? <span className="text-ink-muted"> · {s.fileName}</span> : null}
              </p>
              {s.at ? (
                <p className="text-ink">
                  {s.kind === "api" ? "Last fetched" : s.kind === "upload" ? "Last uploaded" : "Built"} <span className="font-semibold">{dateTime(s.at)}</span>
                  <span className="text-ink-muted"> ({ago(s.at)})</span>
                  {s.by ? (
                    <>
                      {" "}by <span className="font-semibold">{s.by}</span>
                    </>
                  ) : null}
                </p>
              ) : null}
              {s.changedAt ? (
                <p className="text-ink-muted">
                  Changed in the app since: {dateTime(s.changedAt)} ({ago(s.changedAt)})
                </p>
              ) : null}
              <p className="text-ink-muted">{s.verify}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
