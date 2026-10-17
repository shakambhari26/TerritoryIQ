"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { leaderEnd, outlineRects, parseOutline } from "@/features/geo/labels";
import { graticule } from "@/features/geo/graticule";
import { LAYER_SCALE } from "@/features/geo/layer";
import { scaleBar } from "@/features/geo/scale-bar";
import {
  isUsableBounds,
  isUsableViewport,
  padBounds,
  panBy,
  toScreen,
  unionBounds,
  zoomAt,
  zoomLimits,
  type Bounds,
  type Size,
  type Viewport,
} from "@/features/geo/viewport";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import type { GeoQuality } from "../quality";
import { COMPACT_WIDTH, controlObstacles, fitClear, panPad } from "../map-layout";
import { planLabels, type LabelAnchor } from "../map-labels";
import { isBlockInteractive, visibleBlockIds, type MapContext } from "../map-level";
import { ALLOCATION_FILL, MAP_BACKDROP, MAP_COLOR, TEAL, PATTERNS, QUALITY_FILL, districtTint, patternUrl, type MapLayerMode, type PatternSpec } from "../map-style";
import type { TerritoryModel } from "../model";
import { clusterPins, type PinCluster, type RepresentativePin } from "../representatives";
import type { AllocationState, BoundaryLayer, BoundaryShape } from "../types";
import { KEY_PAN, MapControls, PanControls } from "./MapControls";
import { MARKER_GEOMETRY, RepresentativePins, markerRect } from "./RepresentativePins";
import { RepresentativesPanel } from "./RepresentativesPanel";

export type LayerLoad =
  | { status: "loading" }
  | { status: "ready"; layer: BoundaryLayer }
  | { status: "unavailable"; reason: string };

export interface GeoMapProps {
  load: LayerLoad;
  model: Pick<TerritoryModel, "featureById">;
  context: MapContext;
  layerMode: MapLayerMode;
  /** Allocation state of an official block. Districts are drawn neutral. */
  stateOf: (featureId: string) => AllocationState;
  /** How well a block is tied to the workbook (the data-quality layer). */
  qualityOf: (featureId: string) => GeoQuality;
  /** Features to emphasise, including the focus. */
  highlighted: ReadonlySet<string>;
  /** The selected official unit, which gets the strongest outline. */
  focusId: string | null;
  /** Fade everything that is not highlighted (used for a sales-territory view). */
  dimOthers: boolean;
  describe: (featureId: string) => { title: string; detail: string };
  /** Changes whenever the map should move to the current geographic level (a drill-down, a back step, a list pick). */
  revealToken: number;
  onFeatureClick: (featureId: string) => void;
  onBackgroundClick: () => void;
  onEscape: () => void;
  /** Representative pins for the current view (see representatives.ts). Empty or absent draws none. */
  pins?: readonly RepresentativePin[];
  /** Called when the user first acts on the map itself (pointer, zoom, pan, fit, a marker), so the page can retire its first-use hint. */
  onInteract?: () => void;
  /** Opens a workbook row in the details panel. */
  onShowUnit?: (unitId: string) => void;
  /** Selects a sales territory, which shows its blocks and their pins. */
  onShowTerritory?: (territoryId: string) => void;
  /** A feature the pointer or keyboard is on elsewhere (the district navigator): it gets the same outline as a hover on the map. */
  hoverFeatureId?: string | null;
}

const LIMIT_PX = 4;
/** A change in the map's height up to this much keeps the zoom and only re-centres the view. */
const NUDGE_PX = 16;
/** The map's letter, digit and punctuation shortcuts: zoom in, zoom out, fit the state, toggle the grid. */
const SINGLE_KEY_SHORTCUTS: ReadonlySet<string> = new Set(["+", "=", "-", "_", "0", "g", "G"]);
/** The smallest extent a fit shows, as a share of the state's width, so a tiny unit keeps some surroundings. */
const MIN_BLOCK_SPAN = 0.07;
const MIN_DISTRICT_SPAN = 0.05;
const TRANSITION_MS = 320;

// ----------------------------------------------------------------- shapes --

const Shapes = memo(function Shapes({
  shapes,
  visibleBlocks,
  interactiveBlocks,
  context,
  fillOf,
  lineOf,
  stateOf,
  lgdCodeOf,
  highlighted,
  dim,
}: {
  shapes: readonly BoundaryShape[];
  visibleBlocks: ReadonlySet<string>;
  interactiveBlocks: ReadonlySet<string>;
  context: MapContext;
  fillOf: (id: string) => string;
  lineOf: (id: string) => { stroke: string; width: number; opacity: number };
  stateOf: (id: string) => string;
  lgdCodeOf: (id: string) => number;
  highlighted: ReadonlySet<string>;
  dim: boolean;
}) {
  const districts = shapes.filter((s) => s.featureId.startsWith("GD-"));
  const blocks = shapes.filter((s) => !s.featureId.startsWith("GD-") && visibleBlocks.has(s.featureId));
  const focused = context.districtId;
  return (
    <>
      {districts.map((shape) => {
        const id = shape.featureId;
        const isFocus = id === focused;
        const context_ = focused !== null && !isFocus;
        return (
          <path
            key={id}
            d={shape.d}
            data-fid={id}
            fill={isFocus ? patternUrl(PATTERNS.gap) : context_ ? MAP_COLOR.districtContext : districtTint(lgdCodeOf(id))}
            fillOpacity={dim && !highlighted.has(id) ? 0.5 : 1}
            fillRule="evenodd"
            stroke="none"
            className="cursor-pointer"
          />
        );
      })}
      {blocks.map((shape) => {
        const id = shape.featureId;
        const interactive = interactiveBlocks.has(id);
        const line = lineOf(id);
        const faded = dim && !highlighted.has(id);
        return (
          <path
            key={id}
            d={shape.d}
            data-fid={id}
            data-state={stateOf(id)}
            fill={fillOf(id)}
            fillRule="evenodd"
            fillOpacity={faded ? 0.25 : interactive ? 1 : 0.6}
            stroke={line.stroke}
            strokeOpacity={faded ? 0.3 : line.opacity}
            strokeWidth={line.width}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className={interactive ? "cursor-pointer" : undefined}
            pointerEvents={interactive ? "all" : "none"}
          />
        );
      })}
      {/* District outlines over the block shading, so the larger regions stay the first thing the eye finds. */}
      <g pointerEvents="none" fill="none" strokeLinejoin="round">
        {districts.map((shape) => {
          const id = shape.featureId;
          const isFocus = id === focused;
          return (
            <path
              key={id}
              d={shape.d}
              fillRule="evenodd"
              stroke={isFocus ? MAP_COLOR.districtLineStrong : MAP_COLOR.districtLine}
              strokeWidth={isFocus ? 1.8 : focused !== null ? 0.9 : 1.2}
              strokeOpacity={focused !== null && !isFocus ? 0.7 : 1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </g>
    </>
  );
});

/** One SVG pattern, drawn at a constant size on screen whatever the zoom (the tile is scaled back by the zoom). */
function MapPattern({ spec, scale }: { spec: PatternSpec; scale: number }) {
  const { id, kind, base, ink, size, weight } = spec;
  const rotate = kind === "diagonal" || kind === "cross" ? "rotate(45) " : "";
  const half = size / 2;
  return (
    <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse" patternTransform={`${rotate}scale(${1 / scale})`}>
      <rect width={size} height={size} fill={base} />
      {kind === "dots" ? (
        <circle cx={half} cy={half} r={weight} fill={ink} />
      ) : (
        <>
          <line x1={half} y1={0} x2={half} y2={size} stroke={ink} strokeWidth={weight} />
          {kind === "cross" ? <line x1={0} y1={half} x2={size} y2={half} stroke={ink} strokeWidth={weight} /> : null}
        </>
      )}
    </pattern>
  );
}

export function EmptyState({ title, children }: { title: string; children: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6 py-16" data-testid="map-empty-state">
      <div className="max-w-md text-center">
        <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" focusable="false" className="mx-auto text-accent-ink" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" />
          <circle cx="12" cy="10" r="2.25" />
        </svg>
        <p className="mt-4 text-base font-semibold text-ink">{title}</p>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{children}</p>
      </div>
    </div>
  );
}

const sameView = (a: Viewport, b: Viewport) => a.scale === b.scale && a.tx === b.tx && a.ty === b.ty;

export function GeoMap({
  load,
  model,
  context,
  layerMode,
  stateOf,
  qualityOf,
  highlighted,
  focusId,
  dimOthers,
  describe,
  revealToken,
  onFeatureClick,
  onBackgroundClick,
  onEscape,
  pins,
  onInteract,
  onShowUnit,
  onShowTerritory,
  hoverFeatureId = null,
}: GeoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const motion = !reducedMotion;
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  // The view is null until the map has a size and a layer; then it is always a usable viewport.
  const [view, setView] = useState<Viewport | null>(null);
  // The extent the view was fitted to, so a resize fits that same extent again (and not whatever the level has become
  // since: selecting a block must never move the map, even if the toolbar or a notice above it changes height). A
  // user's own zoom or pan ends it (null).
  const [fitted, setFitted] = useState<Bounds | null>(null);
  const [animate, setAnimate] = useState(false);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ x: number; y: number; vx: number; vy: number; id: number } | null>(null);
  const pinch = useRef<number | null>(null);
  // The pins in the open representatives panel (by id, so zooming does not change what the panel shows), and the
  // marker that opened it, so closing the panel can hand focus back.
  const [openIds, setOpenIds] = useState<readonly string[] | null>(null);
  // The latitude and longitude grid is orientation only and competed with the outlines, so it starts hidden.
  const [gridOn, setGridOn] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);

  const layer = load.status === "ready" ? load.layer : null;
  const shapes = useMemo(() => layer?.shapes ?? [], [layer]);

  // ------------------------------------------------------- derived geometry --
  const bboxById = useMemo(() => new Map(shapes.map((s) => [s.featureId, s.bbox as Bounds])), [shapes]);
  const pathById = useMemo(() => new Map(shapes.map((s) => [s.featureId, s.d])), [shapes]);
  const anchors = useMemo(() => {
    const out = new Map<string, LabelAnchor>();
    for (const s of shapes) if (s.anchor) out.set(s.featureId, s.anchor);
    return out;
  }, [shapes]);
  const districtIds = useMemo(() => shapes.filter((s) => s.featureId.startsWith("GD-")).map((s) => s.featureId), [shapes]);
  const blockShapeIds = useMemo(() => shapes.filter((s) => !s.featureId.startsWith("GD-")).map((s) => s.featureId), [shapes]);
  const stateBounds: Bounds | null = useMemo(() => {
    const boxes = districtIds.length > 0 ? districtIds.map((id) => bboxById.get(id)!) : shapes.map((s) => s.bbox as Bounds);
    const b = unionBounds(boxes);
    return isUsableBounds(b) ? b : null;
  }, [districtIds, bboxById, shapes]);

  const spanOf = useCallback((share: number) => (stateBounds ? (stateBounds[2] - stateBounds[0]) * share : 0), [stateBounds]);
  const boundsFor = useCallback(
    (id: string | null, share: number): Bounds | null => {
      const box = id ? bboxById.get(id) : undefined;
      return box && isUsableBounds(box) ? padBounds(box, spanOf(share)) : null;
    },
    [bboxById, spanOf],
  );
  const districtBounds = useMemo(() => boundsFor(context.districtId, MIN_DISTRICT_SPAN), [boundsFor, context.districtId]);
  const blockBounds = useMemo(() => boundsFor(context.blockId, MIN_BLOCK_SPAN), [boundsFor, context.blockId]);
  // A selected sales territory (the only selection that dims the rest) fits to the blocks it owns, so its drill-down
  // shows them large instead of leaving them as specks on the whole state.
  const territoryBounds = useMemo((): Bounds | null => {
    if (!dimOthers || highlighted.size === 0) return null;
    const boxes = [...highlighted].map((id) => bboxById.get(id)).filter((b): b is Bounds => !!b);
    const union = unionBounds(boxes);
    return union && isUsableBounds(union) ? padBounds(union, spanOf(MIN_DISTRICT_SPAN)) : null;
  }, [dimOthers, highlighted, bboxById, spanOf]);
  /** The extent of the current geographic level: the block if it has an outline, else its district, else a territory's blocks, else the state. */
  const levelBounds = blockBounds ?? districtBounds ?? territoryBounds ?? stateBounds;

  const limits = useMemo(() => {
    if (!stateBounds || size.width <= 0 || size.height <= 0) return null;
    return zoomLimits(fitClear(stateBounds, size).scale);
  }, [stateBounds, size]);

  const fit = useCallback(
    (bounds: Bounds | null): Viewport | null => {
      if (!bounds || !limits || size.width <= 0) return null;
      const next = fitClear(bounds, size, limits);
      return isUsableViewport(next) ? next : null;
    },
    [limits, size],
  );
  const levelView = useMemo(() => fit(levelBounds), [fit, levelBounds]);

  /** Moves to a view, animated or not. A broken view is refused, so repeated interaction cannot corrupt the map. */
  const apply = useCallback(
    (next: Viewport | null, animated: boolean, extent: Bounds | null) => {
      if (!isUsableViewport(next)) return;
      onInteract?.();
      // With reduced motion the view jumps: nothing flies, fades or eases.
      setAnimate(animated && motion);
      setView((current) => (current && sameView(current, next) ? current : next));
      setFitted(extent);
    },
    [motion, onInteract],
  );

  // A new layer discards the user's view of the old one.
  const [seenLayer, setSeenLayer] = useState(layer);
  if (layer !== seenLayer) {
    setSeenLayer(layer);
    setView(null);
    setFitted(null);
  }

  // Track the container size.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => setSize((s) => (s.width === node.clientWidth && s.height === node.clientHeight ? s : { width: node.clientWidth, height: node.clientHeight }));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Adjust state while rendering, as React advises, rather than in an effect that would draw a wrong frame first:
  // the first view, a resize, and a request to move to the current level.
  const [seenToken, setSeenToken] = useState(revealToken);
  const [seenSize, setSeenSize] = useState<Size>(size);
  if (levelView) {
    if (view === null) {
      setView(levelView);
      setFitted(levelBounds);
      setSeenSize(size);
      setSeenToken(revealToken);
    } else if (revealToken !== seenToken) {
      setSeenToken(revealToken);
      setAnimate(motion);
      setView(levelView);
      setFitted(levelBounds);
    } else if (size.width !== seenSize.width || size.height !== seenSize.height) {
      setSeenSize(size);
      setAnimate(false);
      // A few pixels of height (the toolbar above is a line taller or shorter once something is selected) only re-centre
      // the view: it must not zoom. A real resize (a rotated phone, the disclosure opening, the panel closing) refits.
      const nudge = size.width === seenSize.width && seenSize.height > 0 && Math.abs(size.height - seenSize.height) <= NUDGE_PX;
      if (fitted && !nudge) setView(fit(fitted) ?? levelView);
      else if (seenSize.width > 0) setView({ ...view, tx: view.tx + (size.width - seenSize.width) / 2, ty: view.ty + (size.height - seenSize.height) / 2 });
    }
  }
  const viewport = view;

  // While a move is animating, the names and grid wait: they are placed for where the map will rest.
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    // Timers, not direct calls: state is set from a callback, never synchronously in the effect body.
    if (!animate) {
      const settle = setTimeout(() => setMoving(false), 0);
      return () => clearTimeout(settle);
    }
    const start = setTimeout(() => setMoving(true), 0);
    const stop = setTimeout(() => setMoving(false), TRANSITION_MS + 60);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [animate, view]);

  // ------------------------------------------------------------ interaction --
  const zoomBy = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      if (!viewport || !limits) return;
      apply(zoomAt(viewport, anchor ?? { x: size.width / 2, y: size.height / 2 }, factor, limits), anchor === undefined, null);
    },
    [viewport, limits, size, apply],
  );
  const fitState = useCallback(() => apply(fit(stateBounds), true, stateBounds), [apply, fit, stateBounds]);
  // One context-aware "Fit view": the selected block if it has an outline, else the selected district.
  const fitView = useCallback(() => {
    if (blockBounds) apply(fit(blockBounds), true, blockBounds);
    else if (districtBounds) apply(fit(districtBounds), true, districtBounds);
  }, [apply, fit, blockBounds, districtBounds]);
  const fitViewTarget = blockBounds && context.blockId ? (model.featureById.get(context.blockId)?.name ?? null) : districtBounds && context.districtId ? (model.featureById.get(context.districtId)?.name ?? null) : null;
  const reset = useCallback(() => apply(levelView, true, levelBounds), [apply, levelView, levelBounds]);
  // The arrow keys and the on-screen pan buttons share one step (KEY_PAN) and one code path.
  const panView = useCallback(
    (dx: number, dy: number) => {
      if (!viewport) return;
      apply(panBy(viewport, dx, dy), false, null);
    },
    [viewport, apply],
  );

  // Wheel zoom needs a non-passive listener so the page does not scroll as well.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!viewport || !limits) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      apply(zoomAt(viewport, { x: event.clientX - rect.left, y: event.clientY - rect.top }, Math.exp(-event.deltaY * 0.0015), limits), false, null);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [viewport, limits, apply]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    onInteract?.();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1 && viewport) {
      dragStart.current = { x: event.clientX, y: event.clientY, vx: viewport.tx, vy: viewport.ty, id: event.pointerId };
    } else if (pointers.current.size === 2) {
      dragStart.current = null;
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const previous = pointers.current.get(event.pointerId);
    if (previous) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2 && pinch.current && viewport && limits) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 0) {
        suppressClick.current = true;
        apply(zoomAt(viewport, { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top }, distance / pinch.current, limits), false, null);
        pinch.current = distance;
      }
      return;
    }

    const start = dragStart.current;
    if (start && start.id === event.pointerId && viewport) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) > LIMIT_PX || suppressClick.current) {
        if (!suppressClick.current) {
          event.currentTarget.setPointerCapture(event.pointerId);
          suppressClick.current = true;
        }
        setHover(null);
        apply({ ...viewport, tx: start.vx + dx, ty: start.vy + dy }, false, null);
      }
      return;
    }

    if (event.pointerType === "mouse") {
      const target = (event.target as Element).closest?.("[data-fid]") as SVGElement | null;
      const id = target?.dataset.fid;
      setHover((current) => (id ? (current?.id === id && Math.abs(current.x - (event.clientX - rect.left)) < 1 && Math.abs(current.y - (event.clientY - rect.top)) < 1 ? current : { id, x: event.clientX - rect.left, y: event.clientY - rect.top }) : current === null ? current : null));
    }
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (dragStart.current?.id === event.pointerId) dragStart.current = null;
    if (pointers.current.size === 0) setTimeout(() => (suppressClick.current = false), 0);
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) return;
    const target = (event.target as Element).closest?.("[data-fid]") as SVGElement | null;
    if (target?.dataset.fid) onFeatureClick(target.dataset.fid);
    else onBackgroundClick();
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    zoomBy(2, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  // ----------------------------------------------------- representative pins --
  const pinList = useMemo(() => pins ?? [], [pins]);
  const openPins = useMemo(() => (openIds ? pinList.filter((p) => openIds.includes(p.id)) : []), [openIds, pinList]);
  // Pins that left the view (another level, a toggle) take the panel with them, so it cannot return on its own later.
  if (openIds && openPins.length === 0) setOpenIds(null);

  const clustersFor = useCallback(
    (v: Viewport | null): PinCluster[] => {
      if (!v || size.width <= 0 || pinList.length === 0) return [];
      // A marker that would sit under a button is left out until the map is moved: a covered button breaks the
      // target-size rule and a covered marker would still take keyboard focus.
      const furniture = controlObstacles(size, 2);
      return clusterPins(pinList, (x, y) => toScreen(v, x, y), MARKER_GEOMETRY).filter((c) => {
        if (!(c.screen.x > -40 && c.screen.x < size.width + 40 && c.screen.y > -40 && c.screen.y < size.height + 80)) return false;
        const r = markerRect(c);
        return !furniture.some((f) => r.x < f.x + f.width && r.x + r.width > f.x && r.y < f.y + f.height && r.y + r.height > f.y);
      });
    },
    [pinList, size],
  );
  const clusters = useMemo(() => clustersFor(viewport), [clustersFor, viewport]);

  const closePanel = useCallback(() => {
    setOpenIds(null);
    // Back to the marker that opened the panel; if it is gone (the pins regrouped), to the map itself.
    const target = trigger.current?.isConnected ? trigger.current : containerRef.current;
    requestAnimationFrame(() => target?.focus());
  }, []);
  const openCluster = useCallback((cluster: PinCluster, element: HTMLElement) => {
    trigger.current = element;
    setOpenIds(cluster.pins.map((p) => p.id));
    onInteract?.();
  }, [onInteract]);
  const zoomToPins = useCallback(
    (group: readonly RepresentativePin[]) => {
      const points = group.map((p) => [p.at[0], p.at[1], p.at[0], p.at[1]] as Bounds);
      const union = unionBounds(points);
      if (!union) return;
      apply(fit(padBounds(union, spanOf(0.03))), true, null);
    },
    [apply, fit, spanOf],
  );

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!viewport) return;
    // Ctrl, Cmd or Alt with one of the map's single-key shortcuts is the browser's: Ctrl or Cmd with + - 0 zooms the
    // page, with G finds the next match. Leave those alone, and do not prevent them. AltGraph is the same: on a layout
    // that needs it to type one of these characters, that is text entry, so the shortcut does not fire and the key is
    // not prevented (the on-screen control stays available). Windows reports AltGr as Ctrl plus Alt, and other
    // platforms through getModifierState. Shift still counts (+ and _ need it on many keyboards). Escape and the
    // wheel are not affected.
    const altGraph = typeof event.getModifierState === "function" && event.getModifierState("AltGraph");
    if (SINGLE_KEY_SHORTCUTS.has(event.key) && (event.ctrlKey || event.metaKey || event.altKey || altGraph)) return;
    switch (event.key) {
      // Alt, Ctrl or Cmd with Left or Right is the browser's or the platform's (Back and Forward, word and tab moves):
      // leave it alone and do not prevent it. AltGraph with Left or Right is the same (a layout's own key use, not the
      // map's), so it is left alone too. Up and Down are not guarded.
      case "ArrowLeft": if (event.altKey || event.ctrlKey || event.metaKey || altGraph) return; panView(KEY_PAN, 0); break;
      case "ArrowRight": if (event.altKey || event.ctrlKey || event.metaKey || altGraph) return; panView(-KEY_PAN, 0); break;
      case "ArrowUp": panView(0, KEY_PAN); break;
      case "ArrowDown": panView(0, -KEY_PAN); break;
      case "+": case "=": zoomBy(1.4); break;
      case "-": case "_": zoomBy(1 / 1.4); break;
      case "0": fitState(); break;
      case "g": case "G": setGridOn((on) => !on); break;
      case "Escape":
        // The open panel closes first; the next Escape goes up a level.
        if (openIds) closePanel();
        else onEscape();
        break;
      default: return;
    }
    event.preventDefault();
  };

  // ---------------------------------------------------------------- drawing --
  const shadeAll = layerMode !== "boundaries";
  const visibleBlocks = useMemo(
    () => visibleBlockIds(model, context, blockShapeIds, highlighted, shadeAll),
    [model, context, blockShapeIds, highlighted, shadeAll],
  );
  const interactiveBlocks = useMemo(() => {
    const out = new Set<string>();
    for (const id of visibleBlocks) if (isBlockInteractive(model, context, id)) out.add(id);
    return out;
  }, [visibleBlocks, model, context]);

  const fillOf = useCallback(
    (id: string) => {
      if (layerMode === "allocation") return ALLOCATION_FILL[stateOf(id)];
      if (layerMode === "quality") return QUALITY_FILL[qualityOf(id)];
      return MAP_COLOR.blockFill;
    },
    [layerMode, stateOf, qualityOf],
  );
  const lineOf = useCallback(
    (id: string) =>
      interactiveBlocks.has(id)
        ? { stroke: MAP_COLOR.blockLine, width: 0.9, opacity: 1 }
        : { stroke: MAP_COLOR.blockLine, width: 0.5, opacity: 0.55 },
    [interactiveBlocks],
  );
  const stateOfString = useCallback((id: string) => stateOf(id), [stateOf]);
  const lgdCodeOf = useCallback((id: string) => model.featureById.get(id)?.lgdCode ?? 0, [model]);

  const scale = viewport?.scale ?? 1;
  const highlightList = [...highlighted].filter((id) => pathById.has(id));
  const hoverInfo = hover ? describe(hover.id) : null;
  const hoverId = hover?.id ?? hoverFeatureId;

  // Names are placed once per view, not per pointer move. A deferred view lets a drag or a wheel turn stay smooth.
  const labelView = useDeferredValue(viewport);
  const labelClusters = useMemo(() => clustersFor(labelView), [clustersFor, labelView]);
  // The selected outline: a name may be moved off it but never drawn over it. Parsed once per selection.
  const outlines = useMemo(() => [...highlighted].map((id) => pathById.get(id)).filter((d): d is string => !!d).map(parseOutline), [highlighted, pathById]);
  const labelPlan = useMemo(() => {
    if (!labelView || size.width <= 0 || !levelView) return null;
    return planLabels({
      model,
      anchors,
      context,
      viewport: labelView,
      size,
      districtIds,
      blockIds: interactiveBlocks,
      selectedBlockId: context.blockId,
      // Names keep clear of the buttons and of the pins, so a name is never read through a marker.
      obstacles: [...controlObstacles(size), ...labelClusters.map(markerRect)],
      avoid: outlines.length > 0 ? outlineRects(outlines, labelView, size) : undefined,
      zoomRatio: labelView.scale / levelView.scale,
      overviewHeight: stateBounds ? (stateBounds[3] - stateBounds[1]) * labelView.scale : undefined,
    });
  }, [labelView, size, levelView, model, anchors, context, districtIds, interactiveBlocks, labelClusters, outlines, stateBounds]);

  const grid = useMemo(() => (gridOn && viewport && size.width > 0 ? graticule(viewport, size, LAYER_SCALE) : null), [gridOn, viewport, size]);
  const bar = useMemo(() => (viewport && size.width > 0 ? scaleBar(viewport, size, LAYER_SCALE, size.width < COMPACT_WIDTH ? 72 : 110) : null), [viewport, size]);
  const fade = motion ? "opacity 120ms" : "none";

  const drawn = !!(layer && stateBounds && viewport);

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Territory map. Arrow keys pan, plus and minus zoom, 0 fits the whole state, G shows or hides the coordinate grid, Escape goes up one level. The area list and the search box offer the same selection without the map."
      tabIndex={0}
      data-testid="geo-map"
      data-level={context.level}
      className="absolute inset-0 touch-none select-none overflow-hidden outline-offset-[-2px]"
      style={{ backgroundColor: MAP_COLOR.canvas, backgroundImage: MAP_BACKDROP }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={() => setHover(null)}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      {load.status === "loading" ? (
        <EmptyState title="Loading boundaries…">The area list and the details panel already work without the map.</EmptyState>
      ) : load.status === "unavailable" ? (
        <EmptyState title="No boundary layer available">{load.reason}</EmptyState>
      ) : !stateBounds ? (
        <EmptyState title="The boundary layer has nothing to draw">
          The layer loaded but holds no drawable outlines. Areas are still listed and can be allocated from the list.
        </EmptyState>
      ) : null}

      {drawn ? (
        <>
          {/* Latitude and longitude lines: orientation only, behind the outlines, and only when switched on. */}
          {gridOn ? (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" focusable="false" data-testid="map-graticule" style={{ opacity: moving ? 0 : 1, transition: fade }}>
            {grid?.lines.map((line) =>
              line.orientation === "meridian" ? (
                <g key={`m${line.degrees}`}>
                  <line x1={line.position} x2={line.position} y1={0} y2={size.height} stroke={MAP_COLOR.graticule} strokeWidth={1} />
                  <text x={line.position + 4} y={12} fontSize={9.5} fill={MAP_COLOR.graticuleText} paintOrder="stroke" stroke={MAP_COLOR.canvas} strokeWidth={3}>
                    {line.label}
                  </text>
                </g>
              ) : (
                <g key={`p${line.degrees}`}>
                  <line y1={line.position} y2={line.position} x1={0} x2={size.width} stroke={MAP_COLOR.graticule} strokeWidth={1} />
                  <text x={4} y={line.position - 4} fontSize={9.5} fill={MAP_COLOR.graticuleText} paintOrder="stroke" stroke={MAP_COLOR.canvas} strokeWidth={3}>
                    {line.label}
                  </text>
                </g>
              ),
            )}
          </svg>
          ) : null}

          <svg className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false" data-testid="map-svg">
            <defs>
              {Object.values(PATTERNS).map((spec) => (
                <MapPattern key={spec.id} spec={spec} scale={scale} />
              ))}
            </defs>
            <g
              data-testid="map-layer"
              data-scale={scale}
              style={{
                transform: `translate(${viewport.tx}px, ${viewport.ty}px) scale(${viewport.scale})`,
                transformOrigin: "0 0",
                transition: animate ? `transform ${TRANSITION_MS}ms ease` : undefined,
              }}
            >
              {/* A faint teal halo around the state's outline at the overview: two wide, quiet strokes under the fills (not a blur
                  filter, which would be redrawn on every zoom frame). Only the outer edge shows; the fills cover the rest. */}
              {context.districtId === null ? (
                <g pointerEvents="none" fill="none" strokeLinejoin="round" data-testid="map-halo">
                  {districtIds.map((id) => (
                    <path key={id} d={pathById.get(id)} fillRule="evenodd" stroke={TEAL} strokeWidth={18} strokeOpacity={0.045} vectorEffect="non-scaling-stroke" />
                  ))}
                  {districtIds.map((id) => (
                    <path key={`${id}-near`} d={pathById.get(id)} fillRule="evenodd" stroke={TEAL} strokeWidth={7} strokeOpacity={0.08} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              ) : null}
              <Shapes
                shapes={shapes}
                visibleBlocks={visibleBlocks}
                interactiveBlocks={interactiveBlocks}
                context={context}
                fillOf={fillOf}
                lineOf={lineOf}
                stateOf={stateOfString}
                lgdCodeOf={lgdCodeOf}
                highlighted={highlighted}
                dim={dimOthers}
              />
              <g pointerEvents="none" fill="none" strokeLinejoin="round" data-testid="map-selection">
                {hoverId && pathById.has(hoverId) && !highlighted.has(hoverId) ? (
                  <path d={pathById.get(hoverId)} fillRule="evenodd" stroke={MAP_COLOR.districtLineStrong} strokeWidth={1.4} strokeOpacity={0.8} vectorEffect="non-scaling-stroke" data-hover={hoverId} />
                ) : null}
                {/* Glow, as a pre-pass over every selected outline: two wide, faint orange strokes, so a soft halo spreads past
                    the outline. All of them are drawn before any member's wash, casing and line, so a neighbour's halo can
                    never paint over another member's line along a shared border. Strokes, not a blur filter: a filter would be
                    redrawn on every zoom frame and a territory selects many outlines. */}
                {highlightList.map((id) => (
                  <g key={`glow-${id}`}>
                    <path d={pathById.get(id)} fillRule="evenodd" fill="none" stroke={MAP_COLOR.selected} strokeWidth={id === focusId ? 24 : 15} strokeOpacity={id === focusId ? 0.09 : 0.06} strokeLinejoin="round" vectorEffect="non-scaling-stroke" data-glow="outer" />
                    <path d={pathById.get(id)} fillRule="evenodd" fill="none" stroke={MAP_COLOR.selected} strokeWidth={id === focusId ? 13 : 8} strokeOpacity={id === focusId ? 0.17 : 0.11} strokeLinejoin="round" vectorEffect="non-scaling-stroke" data-glow="inner" />
                  </g>
                ))}
                {/* Selection: a soft orange wash, a navy casing, then the Molten Orange line, so it reads against every fill and pattern. */}
                {highlightList.map((id) => (
                  <g key={id}>
                    <path d={pathById.get(id)} fillRule="evenodd" fill={MAP_COLOR.selectedGlow} stroke={MAP_COLOR.selectedCasing} strokeWidth={id === focusId ? 6 : 4} strokeOpacity={0.9} vectorEffect="non-scaling-stroke" />
                    <path
                      d={pathById.get(id)}
                      fillRule="evenodd"
                      stroke={MAP_COLOR.selected}
                      strokeWidth={id === focusId ? 2.6 : 1.6}
                      vectorEffect="non-scaling-stroke"
                      data-highlight={id === focusId ? "focus" : "member"}
                    />
                  </g>
                ))}
              </g>
            </g>
          </svg>

          {/* Names, in screen space, placed by planLabels. They never take a click or a hover. */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
            focusable="false"
            data-testid="map-labels"
            style={{ opacity: moving ? 0 : 1, transition: fade }}
          >
            {labelPlan?.hidden.map((h) => (
              <circle key={h.id} cx={h.at.x} cy={h.at.y} r={2.4} fill={MAP_COLOR.leader} stroke={MAP_COLOR.halo} strokeWidth={1.2} data-hidden-label={h.id} />
            ))}
            {labelPlan?.labels.map((label) => {
              const end = label.leader ? leaderEnd(label) : null;
              const lineHeight = label.fontSize * 1.18;
              const quiet = label.tone === "quiet";
              return (
                <g key={label.id} data-label-id={label.id} data-label-kind={label.kind} data-label-leader={label.leader ? "true" : undefined}>
                  {end ? (
                    <>
                      <line x1={label.anchor.x} y1={label.anchor.y} x2={end.x} y2={end.y} stroke={MAP_COLOR.leader} strokeOpacity={0.85} strokeWidth={0.9} strokeLinecap="round" data-leader-line={label.id} />
                      <circle cx={label.anchor.x} cy={label.anchor.y} r={2.2} fill={MAP_COLOR.leader} stroke={MAP_COLOR.halo} strokeWidth={1.2} />
                    </>
                  ) : null}
                  {label.lines.map((line, index) => (
                    <text
                      key={index}
                      x={label.box.x + label.box.width / 2}
                      y={label.box.y + 2 + lineHeight * (index + 0.5)}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={label.fontSize}
                      fontWeight={quiet ? 500 : 600}
                      letterSpacing="0.01em"
                      fill={quiet ? MAP_COLOR.inkSoft : MAP_COLOR.ink}
                      fillOpacity={quiet ? 0.75 : 1}
                      stroke={MAP_COLOR.halo}
                      strokeWidth={3.2}
                      strokeLinejoin="round"
                      paintOrder="stroke"
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}
          </svg>

          <MapControls
            onZoomIn={() => zoomBy(1.5)}
            onZoomOut={() => zoomBy(1 / 1.5)}
            onFitState={fitState}
            onFitView={fitView}
            onReset={reset}
            fitViewTarget={fitViewTarget}
            resetLabel={context.level === "state" ? "Reset to the whole state" : context.level === "district" ? "Reset to the district" : "Reset to the block"}
            gridOn={gridOn}
            onToggleGrid={() => setGridOn((on) => !on)}
          />
          <PanControls onPan={panView} compact={size.width < COMPACT_WIDTH} />

          {bar ? (
            <div
              role="img"
              aria-label={`Scale bar: about ${bar.label}`}
              data-testid="map-scale"
              className="pointer-events-none absolute z-10 text-[0.6875rem] font-medium leading-4 text-ink-muted"
              style={{ left: 12 + panPad(size.width).width + 14, bottom: 14 }}
            >
              <span className="block" style={{ width: bar.pixels, height: 6, borderBottom: `1.5px solid ${MAP_COLOR.leader}`, borderLeft: `1.5px solid ${MAP_COLOR.leader}`, borderRight: `1.5px solid ${MAP_COLOR.leader}` }} />
              <span className="mt-0.5 block">~{bar.label}</span>
            </div>
          ) : null}

          {clusters.length > 0 ? <RepresentativePins clusters={clusters} openIds={openIds ? new Set(openIds) : null} hidden={moving} onOpen={openCluster} /> : null}
          {openPins.length > 0 ? (
            <RepresentativesPanel
              pins={openPins}
              compact={size.width < COMPACT_WIDTH}
              sheetBottom={12 + panPad(size.width).height + 10}
              onClose={closePanel}
              onShowUnit={(unitId) => {
                setOpenIds(null);
                onShowUnit?.(unitId);
              }}
              onShowTerritory={(territoryId) => {
                setOpenIds(null);
                onShowTerritory?.(territoryId);
              }}
              onZoomTo={openPins.length > 1 ? () => zoomToPins(openPins) : undefined}
            />
          ) : null}

          {hover && hoverInfo ? (
            <div
              role="presentation"
              data-testid="map-tooltip"
              className="pointer-events-none absolute z-20 max-w-64 rounded-md border border-line-strong bg-surface-muted px-2.5 py-1.5 text-xs shadow-xl"
              style={{ left: Math.min(hover.x + 14, Math.max(size.width - 270, 8)), top: Math.min(hover.y + 14, Math.max(size.height - 60, 8)) }}
            >
              <p className="font-semibold text-ink">{hoverInfo.title}</p>
              <p className="mt-0.5 text-ink-muted">{hoverInfo.detail}</p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
