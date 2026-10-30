"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { fetchBlockCustomers } from "../block-customers-client";
import { CUSTOMER_FLAGS, type Confidence, type CustomerRecord, type CustomerSummary } from "../customers";
import type { ManifestBlock, ManifestDistrict } from "../types";
import { BLOCK_ROWS_TIMEOUT_MS } from "./BlockRowsSection";

/**
 * Customers on the globe (see customers.ts). Every placement is inferred from a place name inside the customer's or
 * firm's name, so it is always labelled "inferred" with its confidence, never shown as a confirmed location.
 */

const confidenceChip: Record<Confidence, { label: string; className: string }> = {
  good: { label: "Inferred · good", className: "border-sky-300/50 bg-sky-400/15 text-sky-100" },
  medium: { label: "Inferred · medium", className: "border-amber-300/50 bg-amber-400/15 text-amber-100" },
  low: { label: "Inferred · low", className: "border-rose-300/50 bg-rose-400/15 text-rose-100" },
};

function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  const chip = confidenceChip[confidence];
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium", chip.className)}>{chip.label}</span>;
}

const typeLine = (byType: Partial<Record<string, number>>) =>
  Object.entries(byType)
    .map(([type, n]) => `${n} ${type}${n === 1 ? "" : "s"}`)
    .join(", ");

const NOTE = "Placed from a place name in the customer's name. The export has no address, so this is not a confirmed location.";

/** State level: how many customers are placed at all, and a button per block that has any. */
export function CustomersOverview({
  customers,
  blocks,
  onSelectBlock,
  disabled,
}: {
  customers: CustomerSummary;
  blocks: readonly ManifestBlock[];
  onSelectBlock: (id: string) => void;
  disabled: boolean;
}) {
  const { counts } = customers;
  const placedBlocks = blocks.filter((b) => customers.blocks[b.id]).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div data-testid="globe-customers-overview" className="space-y-2 rounded-md border border-line bg-surface-muted p-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Customers</h3>
      <p className="text-xs text-ink-muted">
        {counts.placed} of {counts.total} customer rows placed, all <strong className="font-semibold">inferred</strong> from names ({counts.byConfidence.good} good,{" "}
        {counts.byConfidence.medium} medium, {counts.byConfidence.low} low). {counts.unplaced} have no location in the export and are not shown.
      </p>
      <ul className="space-y-0.5" aria-label="Blocks with customers">
        {placedBlocks.map((b) => {
          const entry = customers.blocks[b.id];
          return (
            <li key={b.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectBlock(b.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-ink hover:bg-surface disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                <span className="shrink-0 text-[0.6875rem] text-ink-subtle">{typeLine(entry.byType)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** District level: a count only. */
export function DistrictCustomers({ customers, district, blocks }: { customers: CustomerSummary; district: ManifestDistrict; blocks: readonly ManifestBlock[] }) {
  const inDistrict = blocks.filter((b) => b.districtId === district.id && customers.blocks[b.id]);
  if (inDistrict.length === 0) return null;
  const total = inDistrict.reduce((n, b) => n + customers.blocks[b.id].total, 0);
  return (
    <p data-testid="globe-district-customers" className="text-xs text-ink-subtle">
      Customers placed here (inferred): <span className="font-medium text-ink-muted">{total}</span> in{" "}
      {inDistrict.map((b) => b.name).join(", ")}.
    </p>
  );
}

type Outcome = { attempt: number; kind: "ready"; rows: CustomerRecord[] } | { attempt: number; kind: "error" };

/**
 * Block level: the customers placed in the selected block, fetched once it is selected and dropped when the selection
 * changes, like BlockRowsSection. Callers render it with `key={blockId}`. Nothing is requested for a block with none.
 */
export function BlockCustomersSection({ customers, blockId }: { customers: CustomerSummary; blockId: string }) {
  const expected = customers.blocks[blockId]?.total ?? 0;
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (expected === 0) return;
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
    fetchBlockCustomers(blockId, expected, controller.signal).then(
      (payload) => finish({ attempt, kind: "ready", rows: payload.rows }),
      () => {
        if (!controller.signal.aborted) finish({ attempt, kind: "error" });
      },
    );
    return () => {
      settled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [blockId, expected, attempt]);

  if (expected === 0) return null;
  const current = outcome && outcome.attempt === attempt ? outcome : null;

  return (
    <div data-testid="globe-block-customers" data-state={current?.kind ?? "loading"} className="space-y-2 border-t border-line pt-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Customers ({expected})</h3>
        <ConfidenceChip confidence={customers.blocks[blockId].weakest} />
      </div>
      {!current ? (
        <p role="status" className="text-xs text-ink-subtle">
          Loading the customers placed in this block…
        </p>
      ) : current.kind === "error" ? (
        <>
          <p role="alert" className="rounded-md border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100">
            The customers for this block could not be loaded.
          </p>
          <button
            type="button"
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
        </>
      ) : (
        <>
          {current.rows.map((c) => (
            <div key={c.id} className="space-y-1 rounded-md border border-line bg-surface-muted p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{c.firm}</p>
                  {c.name !== c.firm ? <p className="truncate text-xs text-ink-muted">{c.name}</p> : null}
                </div>
                <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[0.6875rem] font-medium text-ink-muted">{c.type}</span>
              </div>
              <p className="font-mono text-[0.6875rem] text-ink-subtle">ERP {c.erpCode}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <ConfidenceChip confidence={c.confidence} />
                {c.village ? <span className="text-[0.6875rem] text-ink-subtle">village {c.village.name}</span> : null}
              </div>
              <p className="text-xs text-ink-muted">{c.basis}</p>
              {c.flags.length > 0 ? (
                <ul className="space-y-0.5">
                  {c.flags.map((flag) => (
                    <li key={flag} className="text-[0.6875rem] text-amber-200">
                      ⚠ {CUSTOMER_FLAGS[flag]}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          <p className="text-[0.6875rem] text-ink-subtle">{NOTE}</p>
        </>
      )}
    </div>
  );
}
