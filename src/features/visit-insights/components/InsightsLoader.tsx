"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/**
 * The wait on the Visit Insights pages is real work — the service reads thousands of field visits, scores what reps
 * heard and builds the story. Rather than a flat "Loading…", this shows what's happening right now, a progress track
 * that eases forward so the page never feels frozen, and a rotating line of field-sales wisdom to read while it lands.
 * Pure client animation used only as a Suspense fallback; it is replaced the moment the server content streams in.
 */

// What the service is actually doing, in order. We walk these as the fake progress climbs.
const STEPS = [
  "Opening the field diary",
  "Reading thousands of real visits",
  "Scoring what reps heard on the ground",
  "Sorting visits into the ten segments",
  "Spotting what needs head office now",
  "Writing up the story",
];

// A line to read while it loads. Kept short, true to the field, and a little motivating.
const QUOTES = [
  ["“The best market research is a day in the field.”", "Every visit here was a real trip to a real dealer."],
  ["“What gets measured gets managed.”", "We're turning loose remarks into numbers you can act on."],
  ["“The map is not the territory — until you walk it.”", "These insights come from feet on the ground, not a spreadsheet."],
  ["“Revenue hides in the follow-up.”", "We're surfacing the visits that need a reply today."],
  ["“Listen twice as much as you talk.”", "Every rep's note is being read, not skimmed."],
  ["“Small signals, repeated, are a trend.”", "One complaint is noise; fifty is a priority."],
  ["“A lead goes cold in silence.”", "We're flagging the warm ones before they cool."],
];

export function InsightsLoader({ label = "Loading visit insights" }: { label?: string }) {
  const [pct, setPct] = useState(6);
  const [quote, setQuote] = useState(() => Math.floor(Math.random() * QUOTES.length));

  // Ease toward ~94% and stop — it should feel alive and nearly-there, never claim it finished.
  useEffect(() => {
    const id = window.setInterval(() => {
      setPct((p) => {
        const next = p + Math.max(0.4, (94 - p) * 0.08);
        return next > 94 ? 94 : next;
      });
    }, 180);
    return () => window.clearInterval(id);
  }, []);

  // The current step is derived straight from progress — no state needed.
  const step = Math.min(STEPS.length - 1, Math.floor((pct / 95) * STEPS.length));

  // Rotate the quote every few seconds so there's always something new to read.
  useEffect(() => {
    const id = window.setInterval(() => setQuote((q) => (q + 1) % QUOTES.length), 3800);
    return () => window.clearInterval(id);
  }, []);

  const [headline, sub] = QUOTES[quote];

  return (
    <Card className="overflow-hidden bg-navy-900 p-6 text-on-navy sm:p-8" role="status" aria-live="polite" aria-label={label}>
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
        </span>
        <p className="text-sm font-medium text-on-navy-muted">{STEPS[step]}…</p>
        <span className="ml-auto font-mono text-sm tabular-nums text-on-navy-subtle">{Math.round(pct)}%</span>
      </div>

      {/* Progress track with a travelling sheen so it reads as active even between ticks. */}
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-navy-700">
        <div
          className="relative h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        >
          <span className="loader-sheen absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>
      </div>

      {/* The step checklist, lighting up as we pass each one. */}
      <ul className="mt-5 grid gap-1.5">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={cn(
              "flex items-center gap-2 text-xs transition-colors duration-300",
              i < step ? "text-accent" : i === step ? "text-on-navy" : "text-on-navy-subtle",
            )}
          >
            <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              {i < step ? (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.1 3.1 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                </svg>
              ) : i === step ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full border border-current opacity-50" />
              )}
            </span>
            {s}
          </li>
        ))}
      </ul>

      {/* Something to read while it lands. */}
      <div key={quote} className="loader-rise mt-6 border-t border-navy-700 pt-5">
        <p className="text-base font-medium leading-snug text-on-navy">{headline}</p>
        <p className="mt-1 text-sm text-on-navy-muted">{sub}</p>
      </div>
    </Card>
  );
}
