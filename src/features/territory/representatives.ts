/**
 * Representative pins: which workbook people may be pinned on the map, and where.
 * Pure functions, no React, so every rule is tested directly.
 *
 * What a pin is. A pin is a marker placed on a *verified area anchor*: the label point the boundary layer
 * already computes inside a drawn official block (`BoundaryShape.anchor`). A pin never has a position of its
 * own, so it can never claim to be where a person is. Two kinds exist:
 *
 *   territory  one per sales territory (state overview). Labelled with the ASM names the workbook lists on the
 *              territory's rows. Placed on the anchor of the matched member block nearest the middle of the
 *              territory's matched blocks. That is a real block of the territory, not its centre of gravity.
 *   block      one per official block with a named person (territory and district drill-down). Placed on that
 *              block's own anchor. Rows that share a block are grouped into the one pin and never merged.
 *
 * What is never pinned. A row that is not linked to exactly one official block (ambiguous, weak, none,
 * excluded), a block with no drawn outline or no anchor, and a block with only `Vacant` markers or no names.
 * Nothing is placed from a name, a label or a guess.
 *
 * Honesty rules the text follows:
 *   - A name is workbook text. Equal text on two rows is not a verified single person (B-25).
 *   - Information the workbook does not state is marked `implied`: a territory's ASM (taken from the ASM cell of
 *     each row), and "reports to" (people on one row sit under that row's ASM; no reporting line is recorded, B-08).
 *   - Every pin carries the provisional-boundary warning, and a pin whose block is claimed by several rows says so.
 */

import type { EffectiveUnit } from "../allocation/overlay.ts";
import { ROLE_CAPACITY, ROLE_LABEL, type StaffRole, type StaffSlot } from "./types.ts";
import type { TerritoryModel } from "./model.ts";
import type { MapContext } from "./map-level.ts";

/** A verified label point inside a drawn block: [x, y, radius of the largest inscribed circle]. */
export type PinAnchor = readonly [number, number, number];

export type PinKind = "territory" | "block";

/** One named person (or vacant marker) on a workbook row, with the slot it sits in. */
export interface PinPerson {
  /** The text the workbook holds, whitespace collapsed. A vacant slot has no name. */
  name: string | null;
  role: StaffRole;
  /** `ASM`, `Primary 2`, `Secondary 1`, `DSO 3`: the workbook slot, as the sheet lays it out. */
  slotLabel: string;
  vacant: boolean;
  /** Shown when this ASM cell lists two names: the workbook leaves the choice undecided (B-21). */
  note: string | null;
}

/** One workbook row that stands behind a pin. */
export interface PinRecord {
  unitId: string;
  /** The block label exactly as the row writes it (trimmed for display only). */
  blockLabel: string;
  territoryId: string;
  territoryLabel: string;
  /** The official block and its district, from the Local Government Directory. */
  blockName: string;
  districtName: string;
  people: PinPerson[];
  /** Rows of this record's people that report to its ASM. Implied by sharing a row, not recorded. */
  reportingImplied: string | null;
}

export interface RepresentativePin {
  /** Stable: `RP-<territory id>` or `RP-<block feature id>`. */
  id: string;
  kind: PinKind;
  /** The anchor the pin sits on. World coordinates of the boundary layer. */
  at: readonly [number, number];
  /** The official block whose anchor positions the pin. */
  anchorFeatureId: string;
  /** Short text on the pin's accessible name, never a person's name. */
  title: string;
  /** Sales territories the pin concerns. */
  territoryIds: string[];
  records: PinRecord[];
  /** Explicit statements about what is implied, undecided or contested. Always includes the provisional notice. */
  notices: string[];
  /** More than one row is linked to the block, or the territory lists more than one ASM. */
  contested: boolean;
  /** Territory pins only: how many of the territory's rows are matched to a drawn block, and how many it has. */
  coverage?: { matchedRows: number; totalRows: number };
}

export const PROVISIONAL_NOTICE =
  "Position is provisional: it sits on the label point of a community-drawn block outline that has not been reviewed. It does not show where anyone is.";
export const NAME_NOTICE =
  "Names are the text written in the workbook. Two entries with the same text are not verified to be one person.";

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

export function slotLabel(role: StaffRole, slot: number): string {
  return ROLE_CAPACITY[role] > 1 ? `${ROLE_LABEL[role]} ${slot}` : ROLE_LABEL[role];
}

function peopleOf(slots: readonly StaffSlot[]): PinPerson[] {
  const out: PinPerson[] = [];
  for (const slot of slots) {
    const label = slotLabel(slot.role, slot.slot);
    if (slot.status === "vacant") {
      out.push({ name: null, role: slot.role, slotLabel: label, vacant: true, note: null });
      continue;
    }
    const names = slot.names.map(collapse).filter((n) => n.length > 0);
    // A named slot whose names are all blank carries no person: it is dropped, never shown as a vacancy.
    if (names.length === 0) continue;
    names.forEach((name, index) =>
      out.push({
        name,
        role: slot.role,
        slotLabel: label,
        vacant: false,
        note: names.length > 1 && index === 0 ? "This cell lists two names; the workbook leaves the choice undecided." : null,
      }),
    );
  }
  return out;
}

const hasNamed = (slots: readonly StaffSlot[]) => peopleOf(slots).some((p) => !p.vacant);

type PinModel = Pick<TerritoryModel, "featureById" | "links" | "unitById" | "territoryById" | "effective" | "claimants">;

/**
 * The official block a row may be pinned to, or null. Only an effective link to one block counts (provisional by
 * exact name, or confirmed by a reviewer), and the block must have an anchor in the drawn layer.
 */
function pinnableFeature(model: PinModel, unitId: string, anchors: ReadonlyMap<string, PinAnchor>): string | null {
  const link = model.links.get(unitId);
  if (!link?.featureId) return null;
  if (link.status !== "provisional" && link.status !== "reviewed") return null;
  const feature = model.featureById.get(link.featureId);
  if (!feature || feature.kind !== "block") return null;
  const anchor = anchors.get(link.featureId);
  if (!anchor || !Number.isFinite(anchor[0]) || !Number.isFinite(anchor[1])) return null;
  return link.featureId;
}

function recordOf(model: PinModel, unit: EffectiveUnit, featureId: string): PinRecord {
  const territory = model.territoryById.get(unit.unit.salesTerritoryId);
  const feature = model.featureById.get(featureId)!;
  const people = peopleOf(unit.slots);
  const asm = people.find((p) => p.role === "ASM" && !p.vacant);
  const others = people.filter((p) => p.role !== "ASM" && !p.vacant).length;
  return {
    unitId: unit.unit.id,
    blockLabel: unit.unit.blockLabel.trim(),
    territoryId: unit.unit.salesTerritoryId,
    territoryLabel: territory?.label ?? unit.unit.salesTerritoryId,
    blockName: feature.name,
    districtName: (feature.districtId && model.featureById.get(feature.districtId)?.name) || "unknown district",
    people,
    reportingImplied:
      asm && others > 0
        ? `Implied: the ${others} other named ${others === 1 ? "person" : "people"} on this row sit under its ASM. The workbook records no reporting line.`
        : null,
  };
}

// ----------------------------------------------------------------- territory --

/** One provisional ASM-labelled pin per sales territory that has a matched, drawn block and a named ASM. */
export function territoryPins(model: PinModel, anchors: ReadonlyMap<string, PinAnchor>): RepresentativePin[] {
  const pins: RepresentativePin[] = [];
  for (const territory of model.territoryById.values()) {
    const matched: Array<{ unit: EffectiveUnit; featureId: string }> = [];
    for (const unitId of territory.unitIds) {
      const effective = model.effective.get(unitId);
      const featureId = pinnableFeature(model, unitId, anchors);
      if (effective && featureId) matched.push({ unit: effective, featureId });
    }
    // The ASM is read from the ASM cell of each matched row. A territory with no named ASM there gets no pin.
    const asmRows = matched.filter(({ unit }) => unit.slots.some((s) => s.role === "ASM" && s.status === "named" && peopleOf([s]).length > 0));
    if (asmRows.length === 0) continue;

    // Place on the matched block whose anchor is nearest the mean of the matched anchors.
    const featureIds = [...new Set(asmRows.map((m) => m.featureId))];
    const points = featureIds.map((id) => anchors.get(id)!);
    const mx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
    const my = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    const nearest = [...featureIds].sort((a, b) => {
      const da = Math.hypot(anchors.get(a)![0] - mx, anchors.get(a)![1] - my);
      const db = Math.hypot(anchors.get(b)![0] - mx, anchors.get(b)![1] - my);
      return da - db || a.localeCompare(b);
    })[0];
    const at = anchors.get(nearest)!;

    // One record per distinct ASM text (case-insensitive), listing the rows it appears on. People lists hold ASM only.
    const byAsm = new Map<string, { display: string; rows: string[]; twoNames: boolean }>();
    for (const { unit } of asmRows) {
      for (const slot of unit.slots) {
        if (slot.role !== "ASM" || slot.status !== "named") continue;
        const names = slot.names.map(collapse).filter(Boolean);
        for (const name of names) {
          const key = name.toLowerCase();
          const entry = byAsm.get(key) ?? { display: name, rows: [], twoNames: false };
          if (!entry.rows.includes(unit.unit.id)) entry.rows.push(unit.unit.id);
          entry.twoNames ||= names.length > 1;
          byAsm.set(key, entry);
        }
      }
    }
    const rowOfFeature = new Map(asmRows.map((m) => [m.unit.unit.id, m.featureId]));
    const records: PinRecord[] = [...byAsm.values()].map((entry) => {
      const firstRow = entry.rows[0];
      const featureId = rowOfFeature.get(firstRow)!;
      const base = recordOf(model, model.effective.get(firstRow)!, featureId);
      return {
        ...base,
        blockLabel: `${entry.rows.length} of ${territory.unitIds.length} rows in this territory`,
        blockName: base.blockName,
        people: [
          {
            name: entry.display,
            role: "ASM",
            slotLabel: "ASM",
            vacant: false,
            note: entry.twoNames ? "This name shares an ASM cell with a second name; the workbook leaves the choice undecided." : null,
          },
        ],
        reportingImplied: null,
      };
    });

    const contested = byAsm.size > 1;
    const notices = [
      "Implied: the territory's ASM is read from the ASM cell on each of its rows. The workbook has no territory-level record.",
      "Implied: Primary, Secondary and DSO people on the same row sit under that row's ASM. The workbook records no reporting line.",
      ...(contested ? [`The rows list ${byAsm.size} different ASM names for this territory. Nothing chooses between them.`] : []),
      ...(asmRows.length < territory.unitIds.length
        ? [`Only ${asmRows.length} of ${territory.unitIds.length} rows are matched to a drawn block with a named ASM. The other rows are not used here.`]
        : []),
      PROVISIONAL_NOTICE,
      NAME_NOTICE,
    ];
    pins.push({
      id: `RP-${territory.id}`,
      kind: "territory",
      at: [at[0], at[1]],
      anchorFeatureId: nearest,
      title: `Sales territory ${territory.label}: ASM`,
      territoryIds: [territory.id],
      records,
      notices,
      contested,
      coverage: { matchedRows: asmRows.length, totalRows: territory.unitIds.length },
    });
  }
  return pins.sort((a, b) => a.id.localeCompare(b.id));
}

// --------------------------------------------------------------------- block --

/**
 * One pin per official block that a matched row gives a named person. `include` limits the blocks (the focused
 * district's blocks, or a selected territory's). Rows that share a block are grouped into one pin.
 */
export function blockPins(
  model: PinModel,
  anchors: ReadonlyMap<string, PinAnchor>,
  include: (featureId: string) => boolean,
): RepresentativePin[] {
  const byFeature = new Map<string, EffectiveUnit[]>();
  for (const unitId of model.unitById.keys()) {
    const featureId = pinnableFeature(model, unitId, anchors);
    const effective = model.effective.get(unitId);
    if (!featureId || !effective || !include(featureId) || !hasNamed(effective.slots)) continue;
    const list = byFeature.get(featureId);
    if (list) list.push(effective);
    else byFeature.set(featureId, [effective]);
  }
  const pins: RepresentativePin[] = [];
  for (const [featureId, units] of byFeature) {
    const at = anchors.get(featureId)!;
    const feature = model.featureById.get(featureId)!;
    const contested = units.length > 1;
    pins.push({
      id: `RP-${featureId}`,
      kind: "block",
      at: [at[0], at[1]],
      anchorFeatureId: featureId,
      title: `${feature.name} block: ${units.length === 1 ? "representatives" : `${units.length} records`}`,
      territoryIds: [...new Set(units.map((u) => u.unit.salesTerritoryId))].sort(),
      records: units.map((u) => recordOf(model, u, featureId)),
      notices: [
        ...(contested ? [`${units.length} workbook rows are linked to this block. They are shown together and not merged; they may disagree.`] : []),
        ...(units.some((u) => u.unit.flags.includes("asm-two-names")) ? ["An ASM cell on one of these rows lists two names; the workbook leaves the choice undecided."] : []),
        PROVISIONAL_NOTICE,
        NAME_NOTICE,
      ],
      contested,
    });
  }
  return pins.sort((a, b) => a.id.localeCompare(b.id));
}

// -------------------------------------------------------------------- which --

export type PinSet =
  | { mode: "territory" }
  | { mode: "block"; featureIds: ReadonlySet<string> | null; districtId: string | null }
  | { mode: "none" };

/**
 * Which pins a map view shows. The state overview shows the territory pins. A district view shows the block
 * pins of that district. A selected sales territory shows the block pins of its own matched blocks.
 */
export function pinSetFor(
  context: MapContext,
  territoryBlocks: ReadonlySet<string> | null,
): PinSet {
  if (territoryBlocks) return { mode: "block", featureIds: territoryBlocks, districtId: null };
  if (context.districtId) return { mode: "block", featureIds: null, districtId: context.districtId };
  if (context.level === "state") return { mode: "territory" };
  return { mode: "none" };
}

export function pinsFor(
  model: PinModel,
  anchors: ReadonlyMap<string, PinAnchor>,
  set: PinSet,
): RepresentativePin[] {
  if (set.mode === "none") return [];
  if (set.mode === "territory") return territoryPins(model, anchors);
  const { featureIds, districtId } = set;
  return blockPins(model, anchors, (id) => {
    if (featureIds && !featureIds.has(id)) return false;
    if (districtId && model.featureById.get(id)?.districtId !== districtId) return false;
    return true;
  });
}

// ------------------------------------------------------------------ cluster --

export interface PinCluster {
  /** Stable for the same members. */
  id: string;
  /** Pins in the group, in id order. One pin means not grouped. */
  pins: RepresentativePin[];
  /** Screen position, taken from the member pin nearest the group's middle, so it is always a real anchor. */
  screen: { x: number; y: number };
  at: readonly [number, number];
}

/** What a marker covers on screen. A single pin stands with its tip on the anchor; a group is centred on its anchor. */
export interface MarkerGeometry {
  /** Size of the marker of one pin, which is anchored at the bottom middle. */
  pin: (pin: RepresentativePin) => { width: number; height: number };
  /** Size of the badge that stands for a group. */
  group: { width: number; height: number };
  /** Clear space kept between two markers, in pixels. */
  gap: number;
}

interface Group {
  items: Array<{ pin: RepresentativePin; x: number; y: number }>;
  /** The member whose anchor the marker is drawn at: the one nearest the group's middle. */
  centre: { pin: RepresentativePin; x: number; y: number };
}

function centreOf(items: Group["items"]): Group["centre"] {
  const cx = items.reduce((s, i) => s + i.x, 0) / items.length;
  const cy = items.reduce((s, i) => s + i.y, 0) / items.length;
  return [...items].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy) || a.pin.id.localeCompare(b.pin.id))[0];
}

/**
 * Groups pins whose markers would overlap on screen. Two markers overlap when their rectangles (the pin's own, or
 * the group badge's, widened by half the gap on each side) intersect. Deterministic: pins are taken in id order, the
 * first overlapping pair is merged and the group's badge is checked again, until no two markers overlap. The group
 * is drawn at the member nearest its middle, never at an averaged point that is no anchor.
 */
export function clusterPins(
  pins: readonly RepresentativePin[],
  project: (x: number, y: number) => { x: number; y: number },
  marker: MarkerGeometry,
): PinCluster[] {
  const groups: Group[] = [];
  for (const pin of [...pins].sort((a, b) => a.id.localeCompare(b.id))) {
    const point = project(pin.at[0], pin.at[1]);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const item = { pin, ...point };
    groups.push({ items: [item], centre: item });
  }
  const rect = (g: Group) => {
    const { x, y } = g.centre;
    const size = g.items.length > 1 ? marker.group : marker.pin(g.items[0].pin);
    const half = marker.gap / 2;
    return g.items.length > 1
      ? { x: x - size.width / 2 - half, y: y - size.height / 2 - half, width: size.width + marker.gap, height: size.height + marker.gap }
      : { x: x - size.width / 2 - half, y: y - size.height - half, width: size.width + marker.gap, height: size.height + marker.gap };
  };
  const touch = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  // A merged badge is a new shape in a new place, so every pair is looked at again until none overlaps.
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (!touch(rect(groups[i]), rect(groups[j]))) continue;
        const items = [...groups[i].items, ...groups[j].items];
        groups[i] = { items, centre: centreOf(items) };
        groups.splice(j, 1);
        merged = true;
        j = i;
      }
    }
  }
  return groups.map((group) => {
    const members = [...group.items].sort((a, b) => a.pin.id.localeCompare(b.pin.id));
    return {
      id: members.length === 1 ? members[0].pin.id : `cluster:${members.map((i) => i.pin.id).join("+")}`,
      pins: members.map((i) => i.pin),
      screen: { x: group.centre.x, y: group.centre.y },
      at: group.centre.pin.at,
    };
  });
}
