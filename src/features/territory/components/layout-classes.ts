/**
 * Where the district navigator lives is decided by CSS container queries on the workspace grid, so the choice is made at
 * first paint with no script. The classes are written out in full (never built by joining strings) so Tailwind finds them.
 *
 * The navigator is a rail inside the map frame when the frame is wide enough to give the map its room beside it, and
 * otherwise a list in the details panel. The frame is as wide as the grid, less the details panel (30rem and a 1.5rem gap
 * from the xl breakpoint) when that is open, so the grid needs 900 px for the frame, and 900 + 504 with the panel open.
 */

/** The rail, with the details panel open. */
export const RAIL_SHOWS_PANEL_OPEN = "@min-[1404px]:flex";
/** The rail, with the details panel closed. */
export const RAIL_SHOWS_PANEL_CLOSED = "@min-[900px]:flex";
/** The details panel's own list steps aside when the rail is showing (the panel is open, by definition). */
export const PANEL_LIST_HIDES_FOR_RAIL = "@min-[1404px]:hidden";
