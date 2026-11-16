"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ROLE_NAME } from "../staffing";
import { applySheet } from "../team-clients/apply";
import { fetchTeamHistory } from "../team-clients/history";
import { previewSheet } from "../team-clients/preview";
import { restoreTeamVersion } from "../team-clients/restore";
import type { TeamHistory, UploadPreview } from "../team-types";

/**
 * Keeping the team up to date as people join and leave: upload a new area-mapping sheet (preview what changes, then
 * apply it), see every saved version, and restore one. People can also be added or removed one at a time from a block's
 * panel on the map ("Edit team"). Everyone signed in can do this; every change is kept and can be undone.
 */

const KIND_LABEL = { upload: "Sheet uploaded", add: "Person added", remove: "Person removed", restore: "Restored" } as const;

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function TeamManager({ teamVersion }: { teamVersion: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [busy, setBusy] = useState<"" | "reading" | "applying" | "restoring">("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<TeamHistory | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);

  const loadHistory = useCallback(() => {
    fetchTeamHistory().then(setHistory, () => setHistory(null));
  }, []);
  useEffect(() => loadHistory(), [loadHistory, teamVersion]);

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setMessage(null);
    setPreview(null);
    if (!/\.xlsx$/i.test(picked.name)) {
      setMessage({ ok: false, text: "Choose an Excel .xlsx file in the same layout as the area-mapping sheet." });
      return;
    }
    setBusy("reading");
    try {
      const base64 = await fileToBase64(picked);
      setFile({ name: picked.name, base64 });
      setPreview(await previewSheet(base64));
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "The file could not be read." });
      setFile(null);
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  };

  const apply = async () => {
    if (!file) return;
    setBusy("applying");
    try {
      const version = await applySheet(file.base64);
      setMessage({ ok: true, text: version.summary });
      setPreview(null);
      setFile(null);
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "The sheet could not be applied." });
    } finally {
      setBusy("");
    }
  };

  const restore = async (versionId: number) => {
    setBusy("restoring");
    try {
      const version = await restoreTeamVersion(versionId);
      setMessage({ ok: true, text: version.summary });
      setConfirmRestore(null);
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "That version could not be restored." });
    } finally {
      setBusy("");
    }
  };

  const added = preview?.changes.reduce((n, c) => n + c.added.length, 0) ?? 0;
  const removed = preview?.changes.reduce((n, c) => n + c.removed.length, 0) ?? 0;

  return (
    <section aria-labelledby="team-manager-title" className="mt-4 rounded-card bg-surface p-4 shadow-card" data-testid="team-manager">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="team-manager-title" className="text-base font-semibold text-ink">
            Manage the team
          </h2>
          <p className="max-w-2xl text-xs text-ink-muted">
            Upload a new area-mapping sheet when people join or leave, or add and remove one person from a block on the map (open the block, then <strong className="font-semibold">Edit team</strong>). You see every change before it is saved, and any earlier version can be restored.
          </p>
        </div>
        <div>
          <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" id="team-upload" onChange={(event) => void choose(event.target.files?.[0])} data-testid="team-upload-input" />
          <label htmlFor="team-upload" className={cn("inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover", busy && "pointer-events-none opacity-60")}>
            <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13V3.5M6 7.5l4-4 4 4M3.5 13v2.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V13" />
            </svg>
            {busy === "reading" ? "Reading the sheet…" : "Upload new sheet"}
          </label>
        </div>
      </div>

      {message ? (
        <p role="status" className={cn("mt-3 rounded-xl px-3 py-2 text-sm", message.ok ? "bg-primary-soft text-primary-ink" : "bg-warn-soft text-warn-ink")} data-testid="team-manager-message">
          {message.text}
        </p>
      ) : null}

      {preview && file ? (
        <div role="dialog" aria-modal="true" aria-labelledby="team-preview-title" className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" data-testid="team-preview">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-float">
            <div className="border-b border-line p-4">
              <h3 id="team-preview-title" className="text-base font-semibold text-ink">
                Check the changes before saving
              </h3>
              <p className="text-xs text-ink-muted">{file.name}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { value: preview.report.placed, label: `of ${preview.report.rows} rows placed` },
                  { value: `+${added}`, label: "people added" },
                  { value: `−${removed}`, label: "people removed" },
                  { value: `${preview.before.people} → ${preview.after.people}`, label: "people in total" },
                ].map((t) => (
                  <div key={t.label} className="rounded-xl bg-surface-muted px-3 py-2">
                    <p className="text-lg font-semibold tabular-nums text-ink">{t.value}</p>
                    <p className="text-[0.6875rem] text-ink-muted">{t.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
              {preview.report.unplaced.length ? (
                <div className="rounded-xl bg-warn-soft p-3 text-warn-ink" data-testid="team-preview-unplaced">
                  <p className="font-semibold">{preview.report.unplaced.length === 1 ? "1 row could" : `${preview.report.unplaced.length} rows could`} not be placed on the map and will be left out:</p>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {preview.report.unplaced.map((u) => (
                      <li key={u.row}>
                        Row {u.row}: {u.territory} / {u.label} — {u.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.report.guessed.length ? (
                <div className="rounded-xl bg-surface-muted p-3" data-testid="team-preview-guessed">
                  <p className="font-semibold text-ink">Please check these places:</p>
                  <ul className="mt-1 list-disc pl-5 text-xs text-ink">
                    {preview.report.guessed.map((g) => (
                      <li key={g.row}>
                        Row {g.row}: “{g.label}” was read as <strong>{g.place}</strong> ({g.district}) — {g.how}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.changes.length ? (
                <div>
                  <p className="mb-2 font-semibold text-ink">Changes by place</p>
                  <ul className="space-y-2" data-testid="team-preview-changes">
                    {preview.changes.map((c) => (
                      <li key={c.blockId} className="rounded-xl ring-1 ring-line p-3">
                        <p className="font-medium text-ink">
                          {c.place} <span className="font-normal text-ink-muted">· {c.district}</span>
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {c.added.map((p) => (
                            <span key={`+${p.role}${p.name}`} className="rounded-full bg-[#184f95]/10 px-2 py-0.5 text-xs text-[#184f95]">
                              + {p.name} · {ROLE_NAME[p.role] ?? p.role}
                            </span>
                          ))}
                          {c.removed.map((p) => (
                            <span key={`-${p.role}${p.name}`} className="rounded-full bg-[#c62828]/10 px-2 py-0.5 text-xs text-[#c62828] line-through decoration-1">
                              − {p.name} · {ROLE_NAME[p.role] ?? p.role}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-ink-muted">Nobody is added or removed: the sheet matches the team as it is now.</p>
              )}
              {preview.report.corrections.length ? (
                <p className="text-xs text-ink-muted">
                  Spelling tidied: {preview.report.corrections.map((c) => `${c.from} → ${c.to}`).join("; ")}.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-line p-4">
              <button type="button" onClick={() => (setPreview(null), setFile(null))} disabled={busy === "applying"} className="h-10 rounded-xl px-4 text-sm font-semibold text-ink hover:bg-surface-muted">
                Cancel
              </button>
              <button type="button" onClick={() => void apply()} disabled={busy === "applying"} className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60" data-testid="team-preview-apply">
                {busy === "applying" ? "Saving…" : "Save these changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <details className="group mt-4 rounded-xl ring-1 ring-line" data-testid="team-history">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
          Change history{history ? ` · ${history.versions.length} saved` : ""}
          <span aria-hidden="true" className="text-ink-muted transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <ul className="divide-y divide-line border-t border-line">
          {(history?.versions ?? []).map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="w-36 shrink-0 text-xs text-ink-muted">{when(v.createdAt)}</span>
              <span className="w-28 shrink-0 text-xs font-semibold text-ink">{KIND_LABEL[v.kind]}</span>
              <span className="min-w-0 flex-1 text-ink">{v.summary}</span>
              {history?.currentId === v.id ? (
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-ink">In use</span>
              ) : confirmRestore === v.id ? (
                <span className="flex gap-1">
                  <button type="button" disabled={!!busy} onClick={() => void restore(v.id)} className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white">
                    Restore this
                  </button>
                  <button type="button" onClick={() => setConfirmRestore(null)} className="rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted">
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmRestore(v.id)} className="rounded-md px-2 py-1 text-xs font-semibold text-primary-ink hover:bg-primary-soft">
                  Restore
                </button>
              )}
            </li>
          ))}
          <li className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <span className="w-36 shrink-0 text-xs text-ink-muted">Original</span>
            <span className="w-28 shrink-0 text-xs font-semibold text-ink">Sheet as built</span>
            <span className="min-w-0 flex-1 text-ink">The team from the area-mapping sheet the app was built with.</span>
            {history?.currentId === 0 ? (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-ink">In use</span>
            ) : confirmRestore === 0 ? (
              <span className="flex gap-1">
                <button type="button" disabled={!!busy} onClick={() => void restore(0)} className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white">
                  Restore this
                </button>
                <button type="button" onClick={() => setConfirmRestore(null)} className="rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted">
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmRestore(0)} className="rounded-md px-2 py-1 text-xs font-semibold text-primary-ink hover:bg-primary-soft">
                Restore
              </button>
            )}
          </li>
        </ul>
      </details>
    </section>
  );
}
