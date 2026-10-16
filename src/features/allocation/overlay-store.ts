"use client";

import { useCallback, useSyncExternalStore } from "react";
import { OVERLAY_VERSION, parseOverlay, serialiseOverlay, type Change } from "./overlay.ts";

/**
 * Browser-local persistence for the change log. Everything stays in this
 * browser's localStorage; nothing is sent anywhere. Storage can be unavailable
 * or empty (private windows, blocked site data), so every access is guarded and
 * the app works without it, keeping changes in memory for the session.
 *
 * The store satisfies the `useSyncExternalStore` contract: `getSnapshot`
 * returns the same object until the log changes.
 */

const CHANGES_KEY = "territoryiq.localChanges.v1";
const RECORDED_BY_KEY = "territoryiq.recordedBy";

interface Snapshot {
  changes: readonly Change[];
  problem: string | null;
  /** False when changes cannot be saved in this browser. */
  persistent: boolean;
}

const EMPTY: Snapshot = { changes: [], problem: null, persistent: true };
let snapshot: Snapshot = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const { changes, problem } = parseOverlay(readStorage(CHANGES_KEY));
  snapshot = { changes, problem, persistent: true };
}

function commit(changes: readonly Change[], problem: string | null = null) {
  const persistent = writeStorage(CHANGES_KEY, changes.length === 0 ? null : serialiseOverlay(changes));
  snapshot = { changes, problem, persistent };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === CHANGES_KEY) {
      const { changes, problem } = parseOverlay(event.newValue);
      snapshot = { changes, problem, persistent: true };
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = (): Snapshot => {
  ensureLoaded();
  return snapshot;
};
const getServerSnapshot = (): Snapshot => EMPTY;

export function addChange(change: Change) {
  ensureLoaded();
  commit([...snapshot.changes, change]);
}

export function removeLastChange() {
  ensureLoaded();
  commit(snapshot.changes.slice(0, -1));
}

export function resetChanges() {
  ensureLoaded();
  commit([]);
}

/** Replaces the log with an imported file. Returns a message if it could not be used. */
export function importChanges(text: string): string | null {
  const { changes, problem } = parseOverlay(text);
  if (problem) return problem;
  commit(changes);
  return null;
}

export function exportChangesText(): string {
  ensureLoaded();
  return serialiseOverlay(snapshot.changes);
}

export function useLocalChanges() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return current;
}

// ---- who is recording changes (a name or role; kept only in this browser) ---

const recordedByListeners = new Set<() => void>();
let recordedBy = "";
let recordedByLoaded = false;

function getRecordedBy(): string {
  if (!recordedByLoaded && typeof window !== "undefined") {
    recordedByLoaded = true;
    recordedBy = readStorage(RECORDED_BY_KEY) ?? "";
  }
  return recordedBy;
}

function subscribeRecordedBy(listener: () => void) {
  recordedByListeners.add(listener);
  return () => recordedByListeners.delete(listener);
}

export function useRecordedBy(): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribeRecordedBy,
    getRecordedBy,
    () => "",
  );
  const set = useCallback((next: string) => {
    recordedBy = next;
    writeStorage(RECORDED_BY_KEY, next.trim() === "" ? null : next);
    recordedByListeners.forEach((l) => l());
  }, []);
  return [value, set];
}

export { OVERLAY_VERSION };
