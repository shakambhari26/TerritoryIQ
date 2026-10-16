"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** One pan step, in screen pixels. The arrow keys and the on-screen buttons share it. */
export const KEY_PAN = 60;

const button =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink transition-colors hover:bg-surface-muted active:bg-navy-700 disabled:cursor-not-allowed disabled:text-ink-subtle/50 disabled:hover:bg-transparent max-sm:h-8 max-sm:w-8";

/** A press on a control must not reach the map underneath: it would start a drag or clear the selection. */
const keepOffMap = {
  onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  onDoubleClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitState: () => void;
  onFitView: () => void;
  onReset: () => void;
  /** What Fit view would fit now (the selected block, else the selected district), for its tooltip; null when nothing is selected to fit. */
  fitViewTarget: string | null;
  resetLabel: string;
  /** The coordinate grid is off until asked for: a toggle, not a state of the map. */
  gridOn: boolean;
  onToggleGrid: () => void;
}

/**
 * Zoom and fit. Zoom only scales the current view. The two fit buttons move the
 * view to a geographic extent without changing what is selected: the whole
 * state, or "Fit view", which is context-aware (the selected block if it has an
 * outline, else the selected district, else disabled). Choosing a district or a
 * block is a selection, not a zoom.
 */
export function MapControls({ onZoomIn, onZoomOut, onFitState, onFitView, onReset, fitViewTarget, resetLabel, gridOn, onToggleGrid }: MapControlsProps) {
  const divider = <span aria-hidden="true" className="mx-1.5 my-0.5 block h-px bg-line-strong" />;
  return (
    <div
      role="group"
      aria-label="Map controls"
      data-testid="map-controls"
      className="absolute right-3 top-3 z-10 flex flex-col rounded-xl border border-line bg-surface/90 p-0.5 shadow-md backdrop-blur"
      {...keepOffMap}
    >
      <button type="button" className={button} onClick={onZoomIn} aria-label="Zoom in" title="Zoom in (+)">
        <span aria-hidden="true" className="text-lg leading-none">+</span>
      </button>
      <button type="button" className={button} onClick={onZoomOut} aria-label="Zoom out" title="Zoom out (−)">
        <span aria-hidden="true" className="text-lg leading-none">−</span>
      </button>
      {divider}
      <button type="button" className={button} onClick={onFitState} aria-label="Fit entire state" title="Fit entire state (0)">
        <Icon>
          <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
        </Icon>
      </button>
      <button
        type="button"
        className={button}
        onClick={onFitView}
        disabled={fitViewTarget === null}
        aria-label="Fit view"
        data-testid="fit-view"
        title={fitViewTarget ? `Fit ${fitViewTarget} to the map` : "Nothing selected to fit"}
      >
        <Icon>
          <circle cx="10" cy="10" r="4.5" />
          <path d="M10 2v3M10 15v3M2 10h3M15 10h3" />
        </Icon>
      </button>
      {divider}
      <button type="button" className={button} onClick={onReset} aria-label="Reset view" title={resetLabel}>
        <Icon>
          <path d="M4 10a6 6 0 1 0 2-4.5M4 3.5V6h2.5" />
        </Icon>
      </button>
      {divider}
      <button
        type="button"
        className={cn(button, gridOn && "bg-navy-700 shadow-[inset_0_0_0_1.5px_var(--color-ember)]")}
        onClick={onToggleGrid}
        aria-label="Coordinate grid"
        aria-pressed={gridOn}
        data-testid="grid-toggle"
        title={gridOn ? "Hide the latitude and longitude grid (G)" : "Show the latitude and longitude grid (G)"}
      >
        <Icon>
          <path d="M7 3v14M13 3v14M3 7h14M3 13h14" />
        </Icon>
      </button>
    </div>
  );
}

/**
 * On-screen pan buttons: the single-pointer alternative to dragging (WCAG 2.5.7),
 * and the way to pan without a keyboard or a drag gesture. Same step and
 * direction as the arrow keys.
 */
export function PanControls({ onPan, compact = false }: { onPan: (dx: number, dy: number) => void; compact?: boolean }) {
  const arrow = (rotate: number) => (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M10 16V4M5 9l5-5 5 5" />
    </svg>
  );
  const cell = cn(button, "bg-surface/90 shadow-md backdrop-blur");
  const up = (
    <button type="button" className={cell} onClick={() => onPan(0, KEY_PAN)} aria-label="Pan up" title="Pan up (↑)">
      {arrow(0)}
    </button>
  );
  const left = (
    <button type="button" className={cell} onClick={() => onPan(KEY_PAN, 0)} aria-label="Pan left" title="Pan left (←)">
      {arrow(-90)}
    </button>
  );
  const right = (
    <button type="button" className={cell} onClick={() => onPan(-KEY_PAN, 0)} aria-label="Pan right" title="Pan right (→)">
      {arrow(90)}
    </button>
  );
  const down = (
    <button type="button" className={cell} onClick={() => onPan(0, -KEY_PAN)} aria-label="Pan down" title="Pan down (↓)">
      {arrow(180)}
    </button>
  );
  // A small map gets one row, so the buttons do not sit on top of the state. Same buttons, same order of keys.
  if (compact) {
    return (
      <div role="group" aria-label="Pan map" data-testid="pan-controls" className="absolute bottom-3 left-3 z-10 flex gap-1" {...keepOffMap}>
        {left}
        {up}
        {down}
        {right}
      </div>
    );
  }
  return (
    <div role="group" aria-label="Pan map" data-testid="pan-controls" className="absolute bottom-3 left-3 z-10 grid grid-cols-3 gap-1 max-sm:bottom-3" {...keepOffMap}>
      <span aria-hidden="true" />
      {up}
      <span aria-hidden="true" />
      {left}
      <span aria-hidden="true" />
      {right}
      <span aria-hidden="true" />
      {down}
      <span aria-hidden="true" />
    </div>
  );
}
