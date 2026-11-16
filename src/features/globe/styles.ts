/**
 * Colour semantics for the globe overlay, in one place so the legend, the shapes and the details panel agree.
 *
 * The colour says whether the area-mapping sheet lists the place (and so has a team for it). It is not the allocation
 * classification used elsewhere in the app, and it is never inferred from anything but the sheet.
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

/**
 * Selected, hovered and keyboard-focused boundaries. Distinct from every state fill and from the edge lines. The
 * selected line is white because it is drawn on satellite imagery under royal-blue, orange and grey fills, where the
 * workspace's blue selection colour would disappear.
 */
export const SELECTED_COLOUR = "#ffffff";
export const HOVER_COLOUR = "#2dd4bf";

export const DISTRICT_STYLE: Record<UnitState, StateStyle> = {
  represented: {
    label: "District in the area-mapping sheet",
    short: "Royal blue",
    fill: ROYAL_BLUE,
    fillOpacity: 0.7,
    edge: "#cfe0ff",
    description: "The area-mapping sheet lists at least one place in this district, with its team.",
  },
  "no-representative": {
    label: "District confirmed to have no representative",
    short: "White",
    fill: "#ffffff",
    fillOpacity: 0.7,
    edge: "#172b4d",
    description: "Explicitly confirmed to have no associated representative.",
  },
  unresolved: {
    label: "Not in the sheet",
    short: "Grey",
    fill: NEUTRAL,
    fillOpacity: 0.42,
    edge: "#dbe3f1",
    description: "The area-mapping sheet lists no place in this district. This is not the same as unrepresented.",
  },
};

export const BLOCK_STYLE: Record<UnitState, StateStyle> = {
  represented: {
    label: "Block in the area-mapping sheet",
    short: "Orange",
    fill: ORANGE,
    fillOpacity: 0.78,
    edge: "#fff1df",
    description: "The area-mapping sheet lists this block with its team.",
  },
  "no-representative": {
    label: "Block confirmed to have no representative",
    short: "White",
    fill: "#ffffff",
    fillOpacity: 0.85,
    edge: "#172b4d",
    description: "Explicitly confirmed to have no associated representative.",
  },
  unresolved: {
    label: "Not in the sheet",
    short: "Grey",
    fill: NEUTRAL,
    fillOpacity: 0.5,
    edge: "#e6ecf7",
    description: "The area-mapping sheet does not list this block. Not the same as unrepresented.",
  },
};
