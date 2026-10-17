/**
 * Colour semantics for the globe overlay, in one place so the legend, the shapes and the details panel agree.
 *
 * The colour says whether a provisional, unreviewed link ties a workbook row with a named person to the area.
 * It is not the allocation classification (Assigned, Vacant, Unallocated, Data Missing / Unknown), it does not
 * mean the area is covered, and it is never inferred from a missing record.
 */

import type { UnitState } from "./types.ts";

export interface StateStyle {
  label: string;
  /** Short wording for chips and the legend. */
  short: string;
  fill: string;
  fillOpacity: number;
  /** Outline colour of the polygon edge. */
  edge: string;
  description: string;
}

export const ROYAL_BLUE = "#4169e1";
export const ORANGE = "#f5821f";
export const NEUTRAL = "#8796b0";

/** Selected, hovered and keyboard-focused boundaries. Distinct from every state fill and from the edge lines. */
export const SELECTED_COLOUR = "#e2b93b";
export const HOVER_COLOUR = "#2dd4bf";

export const DISTRICT_STYLE: Record<UnitState, StateStyle> = {
  represented: {
    label: "District with a provisional representative link",
    short: "Royal blue",
    fill: ROYAL_BLUE,
    fillOpacity: 0.7,
    edge: "#cfe0ff",
    description: "At least one block has a provisional link to a named representative. This does not mean the district is completely covered, and no link is officially verified.",
  },
  "no-representative": {
    label: "District confirmed to have no representative",
    short: "White",
    fill: "#ffffff",
    fillOpacity: 0.7,
    edge: "#0b1220",
    description: "Explicitly confirmed to have no associated representative.",
  },
  unresolved: {
    label: "Unresolved or unverified",
    short: "Grey",
    fill: NEUTRAL,
    fillOpacity: 0.42,
    edge: "#dbe3f1",
    description: "No provisional link to a named representative is known. This is not the same as unrepresented.",
  },
};

export const BLOCK_STYLE: Record<UnitState, StateStyle> = {
  represented: {
    label: "Block with a provisional representative link",
    short: "Orange",
    fill: ORANGE,
    fillOpacity: 0.78,
    edge: "#fff1df",
    description: "A workbook row is linked by exact name (unreviewed) and lists a named person.",
  },
  "no-representative": {
    label: "Block confirmed to have no representative",
    short: "White",
    fill: "#ffffff",
    fillOpacity: 0.85,
    edge: "#0b1220",
    description: "Explicitly confirmed to have no associated representative.",
  },
  unresolved: {
    label: "Unresolved or unverified",
    short: "Grey",
    fill: NEUTRAL,
    fillOpacity: 0.5,
    edge: "#e6ecf7",
    description: "Unknown, ambiguous, unmatched or missing a validated outline. Not the same as unrepresented.",
  },
};
