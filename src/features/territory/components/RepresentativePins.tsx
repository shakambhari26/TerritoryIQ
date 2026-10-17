"use client";

import type { Rect } from "@/features/geo/labels";
import { CLUSTER_COLOR, PIN_COLOR } from "../map-style";
import type { MarkerGeometry, PinCluster, RepresentativePin } from "../representatives";

/**
 * Marker sizes in screen pixels. A pin is a small Molten Orange teardrop whose tip is the anchor; the button around it is
 * 24 by 28 so the touch target stays at the WCAG minimum while the drawn mark stays small and quiet. A group of pins is a
 * different shape and a different hue: a neutral slate "stacked card" with the count in white, so a count is never mistaken
 * for a person and orange keeps meaning one thing (a representative, or the selection). Every target is at least 24 pixels
 * on each side.
 */
const PIN_BOX = { width: 24, height: 28 };
const GLYPH = { width: 15, height: 20 };
const CLUSTER = 28;
/** The front card of a group badge; a second card shows behind it, offset to the top right. */
const CARD = 25;

const sizeOf = (): { width: number; height: number } => PIN_BOX;

/** What the clustering needs to know to group pins whose markers would overlap (see `clusterPins`). */
export const MARKER_GEOMETRY: MarkerGeometry = { pin: sizeOf, group: { width: CLUSTER, height: CLUSTER }, gap: 2 };

/** Never lets a press reach the map underneath: it would start a drag or clear the selection. */
const keepOffMap = {
  onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  onDoubleClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
};

/** What a screen reader hears for a marker. Never a person's name: names appear only in the opened panel. */
export function markerLabel(cluster: PinCluster): string {
  if (cluster.pins.length > 1) {
    return `${cluster.pins.length} representative pins grouped here. Open the list.`;
  }
  const pin = cluster.pins[0];
  const flags = pin.contested ? " Records here disagree or overlap." : "";
  return `${pin.title}. Provisional position. Open representatives.${flags}`;
}

/** The rectangle a marker covers, so the label placer can keep names clear of it. */
export function markerRect(cluster: PinCluster): Rect {
  const { x, y } = cluster.screen;
  if (cluster.pins.length > 1) return { x: x - CLUSTER / 2, y: y - CLUSTER / 2, width: CLUSTER, height: CLUSTER };
  const { width, height } = sizeOf();
  return { x: x - width / 2, y: y - height, width, height };
}

function PinGlyph({ pin, active }: { pin: RepresentativePin; active: boolean }) {
  const fill = active ? PIN_COLOR.bodyHover : PIN_COLOR.body;
  const stroke = pin.contested ? PIN_COLOR.contested : PIN_COLOR.ring;
  return (
    <svg
      viewBox={`0 0 ${GLYPH.width} ${GLYPH.height}`}
      width={GLYPH.width}
      height={GLYPH.height}
      aria-hidden="true"
      focusable="false"
      className="block overflow-visible"
      style={{ filter: active ? `drop-shadow(0 0 6px ${PIN_COLOR.glow})` : "drop-shadow(0 1px 1.2px rgba(5, 9, 18, 0.65))" }}
    >
      <path d="M7.5 19.4C7.5 19.4 1 12.6 1 7.6A6.5 6.5 0 1 1 14 7.6C14 12.6 7.5 19.4 7.5 19.4Z" fill={fill} stroke={stroke} strokeWidth={pin.contested ? 1.6 : 1.2} strokeLinejoin="round" />
      <circle cx="7.5" cy="7.4" r="2.2" fill={PIN_COLOR.core} />
    </svg>
  );
}

function GroupBadge({ count, active }: { count: number; active: boolean }) {
  return (
    <span aria-hidden="true" className="relative block h-full w-full">
      <span
        className="absolute right-0 top-0 rounded-[9px] border"
        style={{ width: CARD, height: CARD, background: CLUSTER_COLOR.back, borderColor: CLUSTER_COLOR.backEdge }}
      />
      <span
        className="absolute bottom-0 left-0 flex items-center justify-center rounded-[9px] border text-xs font-bold tabular-nums"
        style={{
          width: CARD,
          height: CARD,
          background: CLUSTER_COLOR.face,
          borderColor: active ? CLUSTER_COLOR.edgeActive : CLUSTER_COLOR.edge,
          color: CLUSTER_COLOR.ink,
          boxShadow: active ? `0 0 0 3px ${CLUSTER_COLOR.glow}, 0 1px 3px rgba(5, 9, 18, 0.7)` : "0 1px 3px rgba(5, 9, 18, 0.7)",
        }}
      >
        {count}
      </span>
    </span>
  );
}

interface RepresentativePinsProps {
  clusters: readonly PinCluster[];
  /** Ids of the pins in the open panel, or null. */
  openIds: ReadonlySet<string> | null;
  /** Hidden (not removed) while the map is flying to a new view, as the names are. */
  hidden: boolean;
  onOpen: (cluster: PinCluster, trigger: HTMLElement) => void;
}

/**
 * The markers, as real buttons over the map: reachable by keyboard, with an accessible name, a 24 by 28 pixel target
 * (28 square for a group), and a visible focus ring. Each sits exactly on a verified area anchor (see
 * representatives.ts); this component only draws where it is told.
 */
export function RepresentativePins({ clusters, openIds, hidden, onOpen }: RepresentativePinsProps) {
  return (
    <div
      data-testid="representative-pins"
      className="pointer-events-none absolute inset-0 z-10"
      style={{ opacity: hidden ? 0 : 1, transition: "opacity 120ms" }}
    >
      {clusters.map((cluster) => {
        const grouped = cluster.pins.length > 1;
        const pin = cluster.pins[0];
        const active = !!openIds && cluster.pins.some((p) => openIds.has(p.id));
        const { x, y } = cluster.screen;
        const box = grouped ? { width: CLUSTER, height: CLUSTER } : sizeOf();
        const left = x - box.width / 2;
        const top = grouped ? y - CLUSTER / 2 : y - box.height;
        return (
          <button
            key={cluster.id}
            type="button"
            data-testid={grouped ? "pin-cluster" : "representative-pin"}
            data-pin-id={grouped ? undefined : pin.id}
            data-pin-kind={grouped ? "cluster" : pin.kind}
            data-pin-count={cluster.pins.length}
            data-pin-contested={!grouped && pin.contested ? "true" : undefined}
            aria-label={markerLabel(cluster)}
            aria-haspopup="dialog"
            aria-expanded={active}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(cluster, event.currentTarget);
            }}
            onPointerDown={keepOffMap.onPointerDown}
            onDoubleClick={keepOffMap.onDoubleClick}
            className="pointer-events-auto absolute left-0 top-0 rounded-lg p-0 focus-visible:outline-offset-2"
            style={{ transform: `translate(${left}px, ${top}px)`, width: box.width, height: box.height }}
          >
            <span
              className={
                grouped
                  ? "pin-in block h-full w-full transition-transform hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
                  : "pin-in relative flex h-full w-full origin-bottom items-end justify-center transition-transform hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100"
              }
            >
              {grouped ? (
                <GroupBadge count={cluster.pins.length} active={active} />
              ) : (
                <>
                  <PinGlyph pin={pin} active={active} />
                  {pin.contested ? (
                    <span
                      aria-hidden="true"
                      className="absolute h-2 w-2 rounded-full"
                      style={{ left: 16, top: 6, background: PIN_COLOR.contested, boxShadow: `0 0 0 1.5px ${PIN_COLOR.ring}` }}
                    />
                  ) : null}
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
