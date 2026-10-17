/**
 * When outlines may appear, and what the page says about them. Pure.
 *
 * The globe, its textures and the outline file load independently: the globe turns and flies whether or not the
 * outlines are there. An outline is revealed only when BOTH are finished:
 *
 *   - the location transition: the camera has arrived somewhere and is held still, and
 *   - the geographic validation: the outline file was fetched, passed the server's integrity check, and was joined to
 *     the validated manifest (`mergeLayer` returned ok), so the renderer holds outlines.
 *
 * Whichever finishes last triggers the reveal. If the file never validates, nothing is ever revealed and the page
 * says so; the globe and the place list keep working.
 */

import type { Level } from "./types.ts";

/** Where the outline file is: being fetched and validated, validated and joined, or unusable. */
export type OutlinesStatus = "loading" | "ready" | "unavailable";

export interface RevealInput {
  /** The renderer holds validated outlines (`mergeLayer` ok and handed over). */
  hasOutlines: boolean;
  /** A flight to a place has ended and the view is held. */
  arrived: boolean;
  /** What the camera is looking at; the whole globe has no outlines to show. */
  level: Level;
}

export function canReveal({ hasOutlines, arrived, level }: RevealInput): boolean {
  return hasOutlines && arrived && level !== "globe";
}

/** The announcement for an arrival when the outlines cannot be revealed yet (or ever). */
export function arrivalWithoutOutlines(place: string, status: OutlinesStatus): string {
  return status === "unavailable"
    ? `Arrived at ${place}. The outline data is unavailable, so no outline is drawn. The places list still works.`
    : `Arrived at ${place}. The outline data is still being validated; outlines appear when it is ready.`;
}

/** How many outlines the page may say are "drawn", given where the outline file is. */
export function drawnClause(status: OutlinesStatus, count: number): string {
  if (status === "ready") return `${count} are drawn`;
  if (status === "loading") return "none is drawn yet, because the outline data is still loading";
  return "none is drawn, because the outline data is unavailable";
}
