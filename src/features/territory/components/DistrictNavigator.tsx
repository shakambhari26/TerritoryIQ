"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import { districtRowSummary, districtRows, type DistrictRow } from "../district-nav";
import { formatCount } from "../format";
import { LEVEL_LABEL, STATE_NAME } from "../map-level";
import type { TerritoryModel } from "../model";
import { ALLOCATION_STATES } from "../types";
import { StateBar } from "./StateBar";
import { STATE_STYLE } from "./state-style";

export interface NavigatorPins {
  kind: "territory" | "block";
  count: number;
}

interface DistrictNavigatorProps {
  model: TerritoryModel;
  /** The district the map is focused on, or null at the state overview. */
  focusedId: string | null;
  pins: NavigatorPins | null;
  /** `rail` is the left column of a wide map frame, with a summary card on top; `panel` is just the list, inside the details panel. */
  variant: "rail" | "panel";
  onPick: (districtId: string) => void;
  /** The row the pointer or keyboard is on, or null. The map outlines that district. */
  onHover: (districtId: string | null) => void;
}

/** A thin stacked bar of a district's blocks by allocation state, the same four states and colours the map uses. */
function MiniBar({ row }: { row: DistrictRow }) {
  return (
    <span aria-hidden="true" className="flex h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-line-strong/40">
      {row.blocks > 0
        ? ALLOCATION_STATES.map((state) =>
            row.byState[state] > 0 ? (
              <span key={state} className={cn("h-full", STATE_STYLE[state].bar)} style={{ width: `${(row.byState[state] / row.blocks) * 100}%` }} />
            ) : null,
          )
        : null}
    </span>
  );
}

function SummaryCard({ model, focusedId, pins }: Pick<DistrictNavigatorProps, "model" | "focusedId" | "pins">) {
  const rollup = focusedId ? model.districtRollup.get(focusedId) : null;
  const name = focusedId ? (model.featureById.get(focusedId)?.name ?? focusedId) : STATE_NAME;
  const level = focusedId ? LEVEL_LABEL.district : LEVEL_LABEL.state;
  const blocks = rollup ? rollup.blocks : model.summary.blocks.total;
  const outlined = rollup ? rollup.withBoundary : model.summary.blocks.withBoundary;
  const byState = rollup ? rollup.byState : model.summary.blocks.byState;
  return (
    <section aria-label="Summary of the current map view" data-testid="navigator-summary" className="border-b border-line px-3.5 pb-3.5 pt-3">
      <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-ink-subtle">{level}</p>
      <h3 className="mt-0.5 text-base font-semibold leading-tight text-ink">{name}</h3>
      <p className="mt-1 text-xs leading-5 text-ink-muted">
        {blocks === 0 ? (
          "No blocks in the reference list."
        ) : (
          <>
            <span className="font-semibold tabular-nums text-ink">{formatCount(outlined)}</span> of {formatCount(blocks)} blocks have provisional outlines.
          </>
        )}
      </p>
      {blocks > 0 ? <StateBar className="mt-2.5" counts={byState} total={blocks} label="Blocks" compact stacked /> : null}
      {pins ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-muted" data-testid="navigator-pins">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 15 20" width="9" height="12" className="shrink-0 overflow-visible">
            <path d="M7.5 19.4C7.5 19.4 1 12.6 1 7.6A6.5 6.5 0 1 1 14 7.6C14 12.6 7.5 19.4 7.5 19.4Z" fill="var(--color-ember)" />
          </svg>
          <span>
            <span className="font-semibold tabular-nums text-ink">{pins.count}</span> {pins.kind === "territory" ? "ASM pins, one per sales territory" : "representative pins"} (provisional)
          </span>
        </p>
      ) : null}
    </section>
  );
}

/**
 * Every district, A to Z, as buttons: pick one to open it on the map. Hovering or focusing a row outlines that district on
 * the map. The rows read the same roll-up as the details panel, so the counts agree everywhere. On a wide map frame this is a
 * rail beside the map (with a summary of the current view above the list); otherwise it is the list in the details panel.
 */
export function DistrictNavigator({ model, focusedId, pins, variant, onPick, onHover }: DistrictNavigatorProps) {
  const rows = useMemo(() => districtRows(model), [model]);
  const selected = useRef<HTMLButtonElement | null>(null);
  const rail = variant === "rail";

  // The focused district's row is kept in view when the map moves to it from elsewhere (a click on the map, the search box).
  useEffect(() => {
    if (rail) selected.current?.scrollIntoView({ block: "nearest" });
  }, [rail, focusedId]);

  const list = (
    <ul
      aria-label="Districts"
      data-testid="district-list"
      className={cn("space-y-0.5", rail ? "min-h-0 flex-1 overflow-y-auto px-1.5 pb-2" : "max-h-96 overflow-y-auto pr-1")}
    >
      {rows.map((row) => {
        const isFocused = row.id === focusedId;
        return (
          <li key={row.id}>
            <button
              ref={isFocused ? selected : undefined}
              type="button"
              data-testid="district-row"
              data-district-id={row.id}
              aria-current={isFocused ? "true" : undefined}
              title={districtRowSummary(row)}
              onClick={() => onPick(row.id)}
              onPointerEnter={() => onHover(row.id)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover(row.id)}
              onBlur={() => onHover(null)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] text-ink hover:bg-surface-muted aria-[current=true]:bg-ember/10 aria-[current=true]:shadow-[inset_2px_0_0_var(--color-ember)]"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
              <MiniBar row={row} />
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-muted">
                {row.blocks > 0 ? `${row.outlined}/${row.blocks}` : "none"}
                <span className="sr-only">
                  {row.blocks > 0 ? ` of ${row.blocks} ${row.blocks === 1 ? "block" : "blocks"} outlined` : ": no blocks in the reference list"}
                  {row.drawn ? "" : ", no district outline"}
                  {isFocused ? ", open on the map" : ""}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (!rail) return list;
  return (
    <>
      <SummaryCard model={model} focusedId={focusedId} pins={pins} />
      <div className="flex items-baseline justify-between px-3.5 pb-1 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Districts <span className="font-medium tabular-nums text-ink-subtle">{rows.length}</span>
        </h3>
        <span className="text-[0.6875rem] text-ink-subtle">blocks outlined</span>
      </div>
      {list}
    </>
  );
}
