"use client";

import type { Rect } from "@/features/geo/labels";
import { PIN_COLOR } from "../map-style";
import type { MarkerGeometry, PinCluster, RepresentativePin } from "../representatives";

/**
 * Marker sizes in screen pixels. The tip of a pin is the anchor; a group badge is centred on its anchor. A block pin is
 * a teardrop; a territory pin is the same orange body as a compact "ASM" tag with a pointer, so the word sits inside
 * the marker and the marker stays narrow enough not to cover its neighbours. A group is a different shape and colour
 * (a navy disc with an orange halo and a count), so a count is never mistaken for a person. All are at least 24
 * pixels on each side.
 */
const PIN_W = 24;
const PIN_H = 30;
const TAG_W = 38;
const TAG_H = 27;
const CLUSTER = 30;

const sizeOf = (pin: RepresentativePin) => (pin.kind === "territory" ? { width: TAG_W, height: TAG_H } : { width: PIN_W, height: PIN_H });

/** What the clustering needs to know to group pins whose markers would overlap (see `clusterPins`). */
export const MARKER_GEOMETRY: MarkerGeometry = { pin: sizeOf, group: { width: CLUSTER, height: CLUSTER }, gap: 4 };

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
  const { width, height } = sizeOf(cluster.pins[0]);
  return { x: x - width / 2, y: y - height, width, height };
}

function PinGlyph({ pin, active }: { pin: RepresentativePin; active: boolean }) {
  const { width, height } = sizeOf(pin);
  const fill = active ? PIN_COLOR.bodyHover : PIN_COLOR.body;
  const stroke = pin.contested ? PIN_COLOR.contested : PIN_COLOR.ring;
  const strokeWidth = pin.contested ? 2 : 1.4;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      className="block overflow-visible"
      style={{ filter: active ? `drop-shadow(0 0 7px ${PIN_COLOR.glow})` : "drop-shadow(0 1px 1.5px rgba(5, 9, 18, 0.7))" }}
    >
      {pin.kind === "territory" ? (
        <>
          <path d="M11 1H27A10 10 0 0 1 27 21H22L19 26L16 21H11A10 10 0 0 1 11 1Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <text x="19" y="11" textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="800" letterSpacing="0.4" fill={PIN_COLOR.core}>
            ASM
          </text>
        </>
      ) : (
        <>
          <path d="M12 29C12 29 1.5 18.2 1.5 11A10.5 10.5 0 1 1 22.5 11C22.5 18.2 12 29 12 29Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <circle cx="12" cy="11" r="3.6" fill={PIN_COLOR.core} />
        </>
      )}
    </svg>
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
 * The markers, as real buttons over the map: reachable by keyboard, with an accessible name, a 24 by 30 pixel
 * target (38 by 27 for an ASM tag, 30 for a group), and a visible focus ring. Each sits exactly on a verified area anchor (see
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
        const box = grouped ? { width: CLUSTER, height: CLUSTER } : sizeOf(pin);
        const left = grouped ? x - CLUSTER / 2 : x - box.width / 2;
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
            className="pointer-events-auto absolute left-0 top-0 rounded-full p-0 focus-visible:outline-offset-4"
            style={{ transform: `translate(${left}px, ${top}px)`, width: box.width, height: box.height }}
          >
            <span className="pin-in block h-full w-full transition-transform hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100">
              {grouped ? (
                <span
                  aria-hidden="true"
                  className="flex h-full w-full items-center justify-center rounded-full border-2 text-xs font-bold tabular-nums"
                  style={{
                    background: PIN_COLOR.core,
                    borderColor: PIN_COLOR.body,
                    color: "#ffd9c6",
                    boxShadow: `0 0 0 ${active ? 4 : 3}px rgba(232, 98, 42, ${active ? 0.38 : 0.24}), 0 1px 3px rgba(5, 9, 18, 0.7)`,
                  }}
                >
                  {cluster.pins.length}
                </span>
              ) : (
                <>
                  <PinGlyph pin={pin} active={active} />
                  {pin.contested ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1.5 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[0.625rem] font-bold leading-none"
                      style={{ background: PIN_COLOR.contested, color: PIN_COLOR.core }}
                    >
                      !
                    </span>
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
