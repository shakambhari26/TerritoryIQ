"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(listener: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/**
 * True when the visitor asked the system for less motion. The server and the first client render assume motion
 * is fine; the real value arrives on hydration, so no frame mismatches. Anything that moves on its own (the
 * map's fly-to, a fade, a pin appearing) checks this and jumps instead.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
