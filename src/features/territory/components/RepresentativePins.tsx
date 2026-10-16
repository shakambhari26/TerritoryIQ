"use client";

import type { Rect } from "@/features/geo/labels";
import { PIN_COLOR } from "../map-style";
import type { PinCluster, RepresentativePin } from "../representatives";

/**
 * Marker sizes in screen pixels. The tip of a pin is the anchor; a cluster is centred on its anchor. A block pin is
 * a teardrop; a territory pin is a compact "ASM" tag with a pointer, so the word sits inside the marker and the
 * marker stays narrow enough not to cover its neighbours.
 */
const PIN_W = 28;
const PIN_H = 36;
const TAG_W = 40;
const TAG_H = 30;
const CLUSTER = 36;
/** Pins whose markers would overlap closer than this join one group. */
export const CLUSTER_RADIUS = 36;

const sizeOf = (pin: RepresentativePin) => (pin.kind === "territory" ? { width: TAG_W, height: TAG_H } : { width: PIN_W, height: PIN_H });

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
  const strokeWidth = pin.contested ? 2.4 : 1.8;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      className="block overflow-visible"
      style={{ filter: `drop-shadow(0 0 ${active ? 9 : 5}px ${PIN_COLOR.glow})` }}
    >
      {pin.kind === "territory" ? (
        <>
          <path d="M11.5 1H28.5A10.5 10.5 0 0 1 28.5 22H24L20 29L16 22H11.5A10.5 10.5 0 0 1 11.5 1Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <text x="20" y="11.5" textAnchor="middle" dominantBaseline="central" fontSize="10.5" fontWeight="800" letterSpacing="0.4" fill={PIN_COLOR.core}>
            ASM
          </text>
        </>
      ) : (
        <>
          <path d="M14 35C14 35 3 22.5 3 13.5a11 11 0 1 1 22 0C25 22.5 14 35 14 35Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <circle cx="14" cy="13.5" r="4.2" fill={PIN_COLOR.core} />
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
 * The markers, as real buttons over the map: reachable by keyboard, with an accessible name, a 28 by 36 pixel
 * target (40 by 30 for an ASM tag, 36 for a group), and a visible focus ring. Each sits exactly on a verified area anchor (see
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
                  className="flex h-full w-full items-center justify-center rounded-full border-2 text-sm font-bold tabular-nums"
                  style={{
                    background: PIN_COLOR.core,
                    borderColor: PIN_COLOR.body,
                    color: "#ffd9c6",
                    boxShadow: `0 0 ${active ? 14 : 8}px ${PIN_COLOR.glow}`,
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
