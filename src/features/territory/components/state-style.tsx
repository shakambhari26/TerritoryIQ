import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ALLOCATION_FILL, ALLOCATION_SWATCH } from "../map-style";
import { ALLOCATION_STATE_LABEL, type AllocationState } from "../types";

/**
 * One visual definition per allocation state, shared by the map, the legend,
 * the lists and the dashboard. Colour is never the only cue: each state also
 * has a text label, and "missing" and "conflicting" carry a hatch pattern.
 */

export interface StateStyle {
  /** Map fill: a solid colour or a pattern reference, the same one the map draws. */
  fill: string;
  /** Chip classes for light surfaces. */
  chip: string;
  /** Solid swatch classes for bars on light surfaces. */
  bar: string;
  /** CSS background for legend swatches that mirror the map's pattern. */
  swatch: string;
}

export const STATE_STYLE: Readonly<Record<AllocationState, StateStyle>> = {
  allocated: {
    fill: ALLOCATION_FILL.allocated,
    chip: "border-accent-ink/30 bg-accent-soft text-accent-ink",
    bar: "bg-accent",
    swatch: ALLOCATION_SWATCH.allocated,
  },
  confirmed_unallocated: {
    fill: ALLOCATION_FILL.confirmed_unallocated,
    chip: "border-blue-700/30 bg-blue-50 text-blue-800",
    bar: "bg-blue-400",
    swatch: ALLOCATION_SWATCH.confirmed_unallocated,
  },
  missing: {
    fill: ALLOCATION_FILL.missing,
    chip: "border-dashed border-line-strong bg-surface-muted text-ink-muted",
    bar: "bg-slate-400",
    swatch: ALLOCATION_SWATCH.missing,
  },
  conflicting: {
    fill: ALLOCATION_FILL.conflicting,
    chip: "border-amber-700/30 bg-amber-50 text-amber-900",
    bar: "bg-amber-500",
    swatch: ALLOCATION_SWATCH.conflicting,
  },
};

export function StateChip({ state, className }: { state: AllocationState; className?: string }): ReactNode {
  return (
    <span
      data-state={state}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium leading-4",
        STATE_STYLE[state].chip,
        className,
      )}
    >
      {ALLOCATION_STATE_LABEL[state]}
    </span>
  );
}

export function Swatch({ state, className }: { state: AllocationState; className?: string }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-3 w-3 shrink-0 rounded-sm border border-slate-400/60", className)}
      style={{ background: STATE_STYLE[state].swatch }}
    />
  );
}
