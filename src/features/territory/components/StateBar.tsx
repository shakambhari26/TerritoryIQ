import { cn } from "@/lib/cn";
import { formatCount } from "../format";
import type { StateCounts } from "../model";
import { ALLOCATION_STATES, ALLOCATION_STATE_LABEL } from "../types";
import { STATE_STYLE, Swatch } from "./state-style";

/**
 * Stacked bar of the four allocation states with an exact-count legend. The
 * legend is real text, so the numbers are readable without the bar.
 */
export function StateBar({
  counts,
  total,
  className,
  label,
  compact = false,
}: {
  counts: StateCounts;
  total: number;
  className?: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <div className={className} data-testid="state-bar">
      <div
        role="img"
        aria-label={`${label}: ${ALLOCATION_STATES.map((s) => `${formatCount(counts[s])} ${ALLOCATION_STATE_LABEL[s].toLowerCase()}`).join(", ")}`}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-line"
      >
        {ALLOCATION_STATES.map((state) =>
          counts[state] > 0 ? (
            <span
              key={state}
              className={cn("h-full", STATE_STYLE[state].bar)}
              style={{ width: `${(counts[state] / Math.max(total, 1)) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <ul className={cn("mt-2 grid gap-x-4 gap-y-1 text-xs text-ink-muted", compact ? "grid-cols-2" : "sm:grid-cols-2")}>
        {ALLOCATION_STATES.map((state) => (
          <li key={state} className="flex items-center justify-between gap-2" data-state-count={state}>
            <span className="flex items-center gap-1.5">
              <Swatch state={state} className="border-line-strong" />
              {ALLOCATION_STATE_LABEL[state]}
            </span>
            <span className="font-semibold tabular-nums text-ink">{formatCount(counts[state])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
