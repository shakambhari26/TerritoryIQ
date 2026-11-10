"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

/**
 * A friendly, reusable "we're on it" panel for any spot where there is a real wait — a route still rendering, a page
 * fetching its data. It always says, plainly, that data is being fetched, shows a progress track that eases forward so
 * nothing ever looks frozen, and rotates a short reassuring line so the wait reads as work in progress, not a stall.
 * Pure client animation; use it as a Suspense/route fallback or while a client fetch is in flight.
 */

const DEFAULT_LINES = [
  "Pulling the latest figures from the field.",
  "Fetching real visit data — one moment.",
  "Lining up the numbers so they're right, not just fast.",
  "Almost there — assembling your view.",
];

export function Loading({
  title = "Fetching data",
  lines = DEFAULT_LINES,
  className,
}: {
  title?: string;
  lines?: string[];
  className?: string;
}) {
  const [pct, setPct] = useState(8);
  const [line, setLine] = useState(0);

  // Ease toward ~92% and hold — alive and nearly-there, never a false "done".
  useEffect(() => {
    const id = window.setInterval(() => {
      setPct((p) => (p >= 92 ? 92 : p + Math.max(0.5, (92 - p) * 0.09)));
    }, 180);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setLine((l) => (l + 1) % lines.length), 2600);
    return () => window.clearInterval(id);
  }, [lines.length]);

  return (
    <Card className={className ?? "p-6 sm:p-8"} role="status" aria-live="polite" aria-label={title}>
      <div className="flex items-center gap-3">
        <svg className="h-5 w-5 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <p className="text-sm font-semibold text-ink">{title}…</p>
        <span className="ml-auto font-mono text-sm tabular-nums text-ink-subtle">{Math.round(pct)}%</span>
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="relative h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        >
          <span className="loader-sheen absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        </div>
      </div>

      <p key={line} className="loader-rise mt-4 text-sm text-ink-muted">
        {lines[line]}
      </p>
    </Card>
  );
}
