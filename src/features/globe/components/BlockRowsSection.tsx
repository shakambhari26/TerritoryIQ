"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { slotLabel } from "@/features/territory/representatives";
import type { StaffRole } from "@/features/territory/types";
import { fetchBlockRows } from "../block-rows-client";
import type { BlockRow } from "../block-rows";
import type { GlobeManifest } from "../types";
import { workspaceHref } from "../workspace-link";
import { WorkspaceLink } from "./WorkspaceLink";

/** A request that has not answered by now is abandoned and shown as an error with a retry. */
export const BLOCK_ROWS_TIMEOUT_MS = 10_000;

type Outcome = { attempt: number; kind: "ready"; rows: BlockRow[] } | { attempt: number; kind: "error" };

interface SectionProps {
  overlay: Pick<GlobeManifest, "districts" | "blocks">;
  blockId: string;
  rowIds: readonly string[];
}

/**
 * The workbook rows (names, row label, sales territory) behind the selected block. The page does not carry them: they are
 * fetched here, once the block is selected, from POST /api/globe/block-rows (block-rows-client.ts), and dropped when the
 * selection changes or ends. Callers render it with `key={blockId}`, so a new block starts from nothing; the cleanup also
 * aborts the old request and `settled` stops a late answer for block A from reaching block B's panel.
 *
 * States: no `rowIds` is "empty" (no request is sent); otherwise "loading" until the validated rows arrive ("ready") or the
 * request fails, times out or returns something other than this block's rows ("error", with a retry button).
 */
export function BlockRowsSection({ overlay, blockId, rowIds }: SectionProps) {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** True from the click on Retry until its request settles, so a repeated click does not start a second request. */
  const busy = useRef(false);
  const idsKey = rowIds.join("|");

  useEffect(() => {
    if (rowIds.length === 0) return;
    const controller = new AbortController();
    let settled = false;
    const finish = (next: Outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      busy.current = false;
      setOutcome(next);
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish({ attempt, kind: "error" });
    }, BLOCK_ROWS_TIMEOUT_MS);
    fetchBlockRows(blockId, rowIds, controller.signal).then(
      (payload) => finish({ attempt, kind: "ready", rows: payload.rows }),
      () => {
        // An abort is the timeout (handled above) or this effect ending (selection changed): never an error to show.
        if (!controller.signal.aborted) finish({ attempt, kind: "error" });
      },
    );
    return () => {
      settled = true;
      clearTimeout(timer);
      controller.abort();
    };
    // `idsKey` stands for `rowIds`, which a parent may rebuild with the same content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId, idsKey, attempt]);

  if (rowIds.length === 0) return <div data-testid="globe-block-rows" data-state="empty" hidden />;

  const current = outcome && outcome.attempt === attempt ? outcome : null;

  if (!current) {
    return (
      <div data-testid="globe-block-rows" data-state="loading" aria-busy="true" className="space-y-2">
        <p role="status" className="text-xs text-ink-subtle">
          Loading the workbook rows for this block…
        </p>
      </div>
    );
  }

  if (current.kind === "error") {
    return (
      <div data-testid="globe-block-rows" data-state="error" className="space-y-2">
        <p role="alert" className="rounded-md border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100">
          The workbook rows for this block could not be loaded.
        </p>
        <button
          type="button"
          data-testid="globe-block-rows-retry"
          onClick={() => {
            if (busy.current) return;
            busy.current = true;
            setOutcome(null);
            setAttempt((n) => n + 1);
          }}
          className="inline-flex items-center rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div data-testid="globe-block-rows" data-state="ready" className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Workbook rows linked to this block</h3>
      {current.rows.map((record) => (
        <div key={record.unitId} className="rounded-md border border-line bg-surface-muted p-2">
          <p className="text-xs text-ink-subtle">
            Sales territory <span className="font-medium text-ink-muted">{record.territory}</span> · row label{" "}
            <span className="font-medium text-ink-muted">{record.blockLabel}</span>
          </p>
          {record.people.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {record.people.map((person, index) => (
                <li key={index} className="flex justify-between gap-3">
                  <span className="text-xs text-ink-subtle">{slotLabel(person.role as StaffRole, person.slot)}</span>
                  <span className={cn("text-right text-xs", person.vacant ? "italic text-ink-subtle" : "font-medium text-ink")}>{person.vacant ? "Vacant marker" : person.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-ink-subtle">The row lists no names.</p>
          )}
          {(() => {
            const rowHref = workspaceHref(overlay, { kind: "row", id: record.unitId });
            return rowHref ? (
              <div className="mt-2">
                <WorkspaceLink href={rowHref} label="Open this row in 2D workspace" testId="globe-open-workspace-row" />
              </div>
            ) : null;
          })()}
        </div>
      ))}
      <p className="text-[0.6875rem] text-ink-subtle">Names are the text written in the workbook. A sales territory label is not an administrative district.</p>
    </div>
  );
}
