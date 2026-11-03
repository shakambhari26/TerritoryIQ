/**
 * Where the district navigator lives is decided by CSS container queries on the workspace grid, so the choice is made at
 * first paint with no script. The classes are written out in full (never built by joining strings) so Tailwind finds them.
 *
 * The navigator is a left panel inside the map frame when the frame is wide enough to give the map its room beside it, and
 * otherwise a list in the details panel. The frame is as wide as the grid, less the details panel (22rem and a 1.25rem gap
 * from the xl breakpoint) when that is open, so the grid needs 900 px for the frame, and 900 + 372 with the panel open.
 *
 * With the panel open the left panel waits for a wider grid (1500 px, a window of about 1565 px): beside a 256 px panel
 * the map must still be about 870 px wide, because the label planner names a block only where its name fits inside its
 * own outline, and a narrower map fits none of them (the Bankura drill-down test at 1440 x 900 guards this). Below that
 * the district list is the first list in the details panel.
 */

/** The rail, with the details panel open. */
export const RAIL_SHOWS_PANEL_OPEN = "@min-[1500px]:flex";
/** The rail, with the details panel closed. */
export const RAIL_SHOWS_PANEL_CLOSED = "@min-[900px]:flex";
/** The details panel's own list steps aside when the rail is showing (the panel is open, by definition). */
export const PANEL_LIST_HIDES_FOR_RAIL = "@min-[1500px]:hidden";
