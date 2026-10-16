"use client";

import { useId, useRef, useState } from "react";
import { exportChangesText, importChanges, resetChanges } from "@/features/allocation/overlay-store";
import { buttonClass } from "./ui";

/**
 * Shows how many local changes exist and offers export, import and reset.
 * Changes are kept in this browser only and sit on top of the unmodified
 * workbook data.
 */
export function LocalChangesBar({
  count,
  persistent,
  rejected,
  storedProblem,
}: {
  count: number;
  persistent: boolean;
  rejected: number;
  storedProblem: string | null;
}) {
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onExport = () => {
    const blob = new Blob([exportChangesText()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `territoryiq-local-changes-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const problem = importChanges(await file.text());
    setMessage(problem ?? "Imported. The change log was replaced.");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm"
      data-testid="local-changes-bar"
    >
      <p className="text-ink">
        <span className="font-semibold tabular-nums" data-testid="local-change-count">
          {count}
        </span>{" "}
        local {count === 1 ? "change" : "changes"}
        <span className="text-ink-muted"> · kept in this browser only, on top of the unmodified workbook data</span>
      </p>
      {!persistent ? <p className="text-xs font-medium text-amber-900">This browser cannot save changes, so they will be lost when the page closes.</p> : null}
      {rejected > 0 ? <p className="text-xs font-medium text-amber-900">{rejected} saved {rejected === 1 ? "change was" : "changes were"} invalid and ignored.</p> : null}
      {storedProblem ? <p className="text-xs font-medium text-amber-900">{storedProblem}</p> : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass} onClick={onExport} disabled={count === 0}>
          Export JSON
        </button>
        <label htmlFor={`${uid}-import`} className={`${buttonClass} cursor-pointer`}>
          Import JSON
        </label>
        <input id={`${uid}-import`} ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void onImport(e.target.files?.[0])} />
        {confirming ? (
          <>
            <button
              type="button"
              className="inline-flex items-center rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800"
              onClick={() => {
                resetChanges();
                setConfirming(false);
                setMessage("All local changes were removed. The workbook data is as it was.");
              }}
            >
              Confirm: remove all
            </button>
            <button type="button" className={buttonClass} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className={buttonClass} onClick={() => setConfirming(true)} disabled={count === 0}>
            Reset…
          </button>
        )}
      </div>
      {message ? (
        <p role="status" className="w-full text-xs text-ink-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
