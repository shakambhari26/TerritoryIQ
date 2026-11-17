"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { HOVER_COLOUR, SELECTED_COLOUR } from "../styles";
import { bandFor, NOT_IN_SHEET, ROLE_COLOUR, ROLE_NAME, ROLE_ORDER, STAFF_BANDS, type StaffFilter } from "../staffing";
import type { Level, ManifestBlock } from "../types";

/**
 * The map key, written for someone who has never seen the map: what each colour means in plain words, how many blocks
 * are in each colour (a tap shows only those), what the pin colours mean, and a three-step "what to do next" coach that
 * ticks itself off as you go.
 */

const MEANING: Record<string, { word: string; hint: string }> = {
  low: { word: "Hire here", hint: "1–2 people" },
  few: { word: "Thin", hint: "3 people" },
  good: { word: "Healthy", hint: "4 people" },
  many: { word: "Strong", hint: "5 or more" },
};

const STEPS: Array<{ text: string; done: (level: Level) => boolean }> = [
  { text: "Click a district", done: (l) => l === "district" || l === "block" },
  { text: "Click a coloured block", done: (l) => l === "block" },
  { text: "Hover a pin to see the name", done: () => false },
];

function Pin({ colour }: { colour: string }) {
  return (
    <svg viewBox="0 0 24 32" width="14" height="19" aria-hidden="true" className="shrink-0 drop-shadow-sm">
      <path d="M12 31s10-11.2 10-19A10 10 0 0 0 2 12c0 7.8 10 19 10 19z" fill={colour} stroke="#fff" strokeWidth="2" />
      <circle cx="12" cy="9" r="3" fill="#fff" />
      <path d="M6.5 17c.8-2.6 2.9-3.9 5.5-3.9s4.7 1.3 5.5 3.9z" fill="#fff" />
    </svg>
  );
}

interface Props {
  blocks: readonly ManifestBlock[];
  filter: StaffFilter;
  onFilter: (next: StaffFilter) => void;
  level: Level;
}

export function MapGuide({ blocks, filter, onFilter, level }: Props) {
  // null: the default, open on a wide screen and folded on a phone.
  const [open, setOpen] = useState<boolean | null>(null);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of blocks) if (b.staff > 0) c[bandFor(b.staff).key] = (c[bandFor(b.staff).key] ?? 0) + 1;
    return c;
  }, [blocks]);
  const total = STAFF_BANDS.reduce((n, b) => n + (counts[b.key] ?? 0), 0);
  const step = STEPS.findIndex((s) => !s.done(level));
  const toggleBand = (key: string) => onFilter({ ...filter, band: filter.band === key ? null : (key as StaffFilter["band"]) });

  const pill = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn("pointer-events-auto items-center gap-2 rounded-full bg-white/95 py-1.5 pl-2 pr-3 text-xs font-semibold text-ink shadow-float ring-1 ring-line hover:ring-ink/30", open === null ? "flex md:hidden" : open ? "hidden" : "flex")}
      aria-expanded={false}
      aria-controls="globe-map-guide"
      data-testid="globe-legend-open"
    >
      <span aria-hidden="true" className="flex h-3 w-10 overflow-hidden rounded-full">
        {STAFF_BANDS.map((b) => (
          <span key={b.key} className="flex-1" style={{ backgroundColor: b.colour }} />
        ))}
      </span>
      Map key
    </button>
  );

  return (
    <>
      {pill}
      <div
        id="globe-map-guide"
        aria-label="Legend"
        className={cn(
          "pointer-events-auto max-h-[calc(100vh-12rem)] w-[17.5rem] overflow-y-auto rounded-2xl bg-white/95 p-3.5 shadow-float ring-1 ring-line backdrop-blur",
          open === null ? "hidden md:block" : open ? "block" : "hidden",
        )}
        data-testid="globe-legend"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-ink">How to read this map</p>
            <p className="text-[0.6875rem] leading-4 text-ink-muted">Colour = people working in a block</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Hide the map key"
            title="Hide"
            className="-mr-1 -mt-1 grid size-7 place-items-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {/* The whole state at a glance: one bar, each colour as wide as its share of blocks. */}
        <div aria-hidden="true" className="mt-2.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {STAFF_BANDS.map((b) => (
            <span
              key={b.key}
              className={cn("transition-opacity", filter.band && filter.band !== b.key && "opacity-25")}
              style={{ backgroundColor: b.colour, flexGrow: counts[b.key] ?? 0, flexBasis: 0 }}
            />
          ))}
        </div>
        <p className="mt-1 flex justify-between text-[0.625rem] font-medium uppercase tracking-wider text-ink-muted">
          <span>Short of people</span>
          <span>Well staffed</span>
        </p>

        <ul className="mt-1.5 space-y-0.5">
          {STAFF_BANDS.map((b) => {
            const active = filter.band === b.key;
            const n = counts[b.key] ?? 0;
            return (
              <li key={b.key}>
                <button
                  type="button"
                  onClick={() => toggleBand(b.key)}
                  aria-pressed={active}
                  title={active ? "Show every block again" : `Show only the ${n} blocks with ${MEANING[b.key].hint.toLowerCase()}`}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl px-2 py-1 text-left transition",
                    active ? "bg-surface-muted ring-2 ring-ink/70" : "hover:bg-surface-muted",
                    filter.band && !active && "opacity-50 hover:opacity-100",
                  )}
                >
                  <span aria-hidden="true" className="size-6 shrink-0 rounded-md shadow-inner ring-1 ring-black/10 transition group-hover:scale-110" style={{ backgroundColor: b.colour }} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[0.8125rem] font-semibold text-ink">{MEANING[b.key].word}</span>
                    <span className="block text-[0.6875rem] text-ink-muted">{MEANING[b.key].hint}</span>
                  </span>
                  <span className="text-right leading-tight">
                    <span className="block text-sm font-bold tabular-nums text-ink">{n}</span>
                    <span className="block text-[0.625rem] text-ink-muted">{total ? `${Math.round((n / total) * 100)}%` : ""}</span>
                  </span>
                </button>
              </li>
            );
          })}
          <li className="flex items-center gap-3 px-2 py-0.5">
            <span aria-hidden="true" className="size-6 shrink-0 rounded-md ring-1 ring-black/10" style={{ backgroundColor: NOT_IN_SHEET }} />
            <span className="text-[0.75rem] text-ink-muted">Not in the sheet · no team listed</span>
          </li>
        </ul>
        <p className="mt-1 text-center text-[0.6875rem] text-ink-muted">
          {filter.band ? (
            <button type="button" onClick={() => onFilter({ ...filter, band: null })} className="font-semibold text-primary-ink underline-offset-2 hover:underline">
              Show every block again
            </button>
          ) : (
            <>👆 Tap a colour to show only those blocks</>
          )}
        </p>

        <div className="mt-2.5 border-t border-line pt-2.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">Pin colour = role</p>
          <ul className="mt-1 grid grid-cols-1 gap-0.5">
            {ROLE_ORDER.map((role) => (
              <li key={role} className="flex items-center gap-2 text-xs text-ink">
                <Pin colour={ROLE_COLOUR[role]} />
                {ROLE_NAME[role]}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 flex items-center gap-2 text-[0.6875rem] text-ink-muted">
            <span aria-hidden="true" className="h-1.5 w-4 shrink-0 rounded ring-1 ring-ink/60" style={{ backgroundColor: SELECTED_COLOUR }} />
            Selected
            <span aria-hidden="true" className="ml-2 h-1.5 w-4 shrink-0 rounded" style={{ backgroundColor: HOVER_COLOUR }} />
            Under the mouse
          </p>
        </div>

        <div className="mt-2.5 border-t border-line pt-2.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">Try it</p>
          <ol className="mt-1 space-y-0.5">
            {STEPS.map((s, i) => {
              const done = s.done(level);
              const now = i === step;
              return (
                <li key={s.text} className={cn("flex items-center gap-2 rounded-lg px-1.5 py-0.5 text-xs transition", now ? "bg-primary-soft font-semibold text-ink" : done ? "text-ink-muted" : "text-ink-muted/80")}>
                  <span
                    aria-hidden="true"
                    className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[0.625rem] font-bold", done ? "bg-[#008300] text-white" : now ? "animate-pulse bg-primary text-white" : "bg-surface-muted text-ink-muted ring-1 ring-line")}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className={cn(done && "line-through decoration-ink/30")}>{s.text}</span>
                  {done ? <span className="sr-only">(done)</span> : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </>
  );
}
