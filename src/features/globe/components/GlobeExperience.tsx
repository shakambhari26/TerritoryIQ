"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { GlobeRenderer, webglAvailable, type FeatureRef } from "../GlobeRenderer";
import type { GlobeInsights } from "../insights";
import { fetchBoundaryLayer, LayerRequestError } from "../layer-client";
import { mergeLayer, type MergeOutcome } from "../layer-merge";
import { arrivalWithoutOutlines, canReveal, type OutlinesStatus } from "../outline-gate";
import { BLOCK_STYLE, DISTRICT_STYLE, HOVER_COLOUR, SELECTED_COLOUR } from "../styles";
import { buildTargets, pickableRefs, type Target } from "../targets";
import type { GlobeManifest, Level, Phase } from "../types";
import type { CustomerSummary } from "../customers";
import { GlobeFallback } from "./GlobeFallback";
import { GlobeDetails, PlaceSearch } from "./GlobePanel";
import { SegmentPanel } from "./SegmentPanel";
import {
  blockLegend,
  buildBlockFacts,
  buildPaint,
  COLOUR_BY_LABEL,
  decodeSegment,
  DISTRICT_RAMP_COLOURS,
  EMPTY_FILTER,
  encodeSegment,
  filterSize,
  maxDistrictMatches,
  segment,
  type ColourBy,
  type LegendRow,
  type SegmentFilter,
} from "../segments";
import { MarketDashboard } from "@/features/market/components/MarketDashboard";

interface Selection {
  level: Level;
  districtId: string | null;
  blockId: string | null;
}

/** The `?seg=` value the page was opened with, if any. */
function readSegmentParam(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("seg") ?? "";
}

const ATTRIBUTION_EARTH = "Earth: NASA Earth Observatory, Blue Marble.";

const NONE: Selection = { level: "globe", districtId: null, blockId: null };

type Status = "loading" | "ready" | "error";

/** The outline file: fetched, integrity-checked by the server, and joined to the validated manifest. Independent of the textures. */
type LayerState = { status: "loading" } | { status: "ready"; outcome: Extract<MergeOutcome, { ok: true }> } | { status: "unavailable"; reason: string };

/** `lg`: where both panels float beside the globe at once. Below it they are drawers and open one at a time. */
const WIDE_QUERY = "(min-width: 64rem)";
const isWide = () => typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches;

/** How much one press of a zoom button moves the camera. */
const ZOOM_STEP = 0.72;

function placeName(view: GlobeManifest, s: Selection): string {
  if (s.level === "state") return view.state.name;
  if (s.level === "block") return view.blocks.find((b) => b.id === s.blockId)?.name ?? "";
  if (s.level === "district") return view.districts.find((d) => d.id === s.districtId)?.name ?? "";
  return "the globe";
}

function Legend({ open, colourBy, segmented, maxMatched }: { open: boolean; colourBy: ColourBy; segmented: boolean; maxMatched: number }) {
  const plain = colourBy === "link" && !segmented;
  const rows: LegendRow[] = plain
    ? [
        { colour: DISTRICT_STYLE.represented.fill, label: "District: provisional link", note: "at least one linked block. Not complete or officially verified coverage" },
        { colour: BLOCK_STYLE.represented.fill, label: "Block: provisional link", note: "named representative, unreviewed" },
        { colour: "#ffffff", label: "Confirmed: no representative", note: "none yet; needs a reviewed source record", ring: true },
        { colour: BLOCK_STYLE.unresolved.fill, label: "Unresolved or unverified", note: "not the same as none" },
      ]
    : [
        ...blockLegend(colourBy),
        ...(segmented ? [{ colour: BLOCK_STYLE.unresolved.fill, label: "Faded: outside the segment" }] : [{ colour: DISTRICT_STYLE.represented.fill, label: "District: provisional link" }]),
      ];
  return (
    <details key={open ? "open" : "closed"} open={open} aria-label="Legend" className="pointer-events-auto w-60 rounded-xl bg-white/95 p-3 shadow-float ring-1 ring-line" data-testid="globe-legend">
      <summary className="cursor-pointer text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">
        Legend (provisional){plain ? "" : ` · ${COLOUR_BY_LABEL[colourBy]}`}
      </summary>
      {segmented ? (
        <div className="mt-2">
          <p className="text-xs text-ink">District: blocks in the segment</p>
          <div className="mt-1 flex h-2 overflow-hidden rounded" aria-hidden="true">
            {DISTRICT_RAMP_COLOURS.map((c) => (
              <span key={c} className="flex-1" style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="mt-0.5 flex justify-between text-[0.6875rem] tabular-nums text-ink-muted">
            <span>1</span>
            <span>{maxMatched}</span>
          </div>
        </div>
      ) : null}
      <ul className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-start gap-2 text-xs text-ink">
            <span aria-hidden="true" className={cn("mt-0.5 size-3 shrink-0 rounded-sm", row.ring && "ring-1 ring-ink/50")} style={{ backgroundColor: row.colour }} />
            <span className="min-w-0 flex-1 leading-4">
              {row.label}
              {row.note ? <span className="block text-[0.6875rem] text-ink-muted">{row.note}</span> : null}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2 border-t border-line pt-1.5 text-xs text-ink">
          <span aria-hidden="true" className="h-1 w-3 shrink-0 rounded bg-white ring-1 ring-ink/60" style={{ backgroundColor: SELECTED_COLOUR }} />
          Selected
          <span aria-hidden="true" className="ml-2 h-1 w-3 shrink-0 rounded" style={{ backgroundColor: HOVER_COLOUR }} />
          Hover or focus
        </li>
      </ul>
    </details>
  );
}

/** Where the outline data is, always on screen, whatever the textures are doing; with the credits the data and the Earth owe. */
function OutlineDataStrip({ layer, onRetry, drawn, attribution }: { layer: LayerState; onRetry: () => void; drawn: { districts: number; blocks: number }; attribution: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface-muted px-4 py-2 text-xs text-ink-muted">
      <div className="flex min-w-0 flex-[2_1_20rem] flex-wrap items-center gap-x-3 gap-y-1" data-testid="globe-outlines-status" data-state={layer.status}>
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink">Outline data</span>
        {layer.status === "loading" ? (
          <p role="status" className="min-w-0 flex-1">
            Loading and validating. The globe works meanwhile; outlines appear once you have arrived somewhere and the data has passed validation.
          </p>
        ) : null}
        {layer.status === "ready" ? (
          <p role="status" className="min-w-0 flex-1">
            Validated: {drawn.districts} district and {drawn.blocks} block outlines, provisional.
          </p>
        ) : null}
        {layer.status === "unavailable" ? (
          <>
            <p role="alert" className="min-w-0 flex-1" data-testid="globe-outlines-error">
              {layer.reason} No outline is drawn. The globe and the places list still work.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-primary/40 bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-ink hover:border-primary"
              data-testid="globe-outlines-retry"
            >
              Try again
            </button>
          </>
        ) : null}
      </div>
      <p className="min-w-0 flex-[1_1_18rem] text-[0.6875rem] leading-4 lg:text-right">{attribution}</p>
    </div>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const controlClass =
  "grid size-10 w-10 place-items-center text-ink hover:bg-primary-soft hover:text-primary-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink";

/** A pill that opens a collapsed panel. `bar` is the mobile form: a full-width strip that names the place. */
function PanelToggle({ label, onClick, icon, className, controls }: { label: string; onClick: () => void; icon: ReactNode; className?: string; controls: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={false}
      aria-controls={controls}
      className={cn("pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full bg-white px-3.5 text-sm font-semibold text-ink shadow-float ring-1 ring-line hover:bg-primary-soft hover:text-primary-ink", className)}
    >
      {icon}
      {label}
    </button>
  );
}

function CollapseButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("pointer-events-auto grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink", className)}
    >
      <Icon>
        <path d="m5.5 5.5 9 9m0-9-9 9" />
      </Icon>
    </button>
  );
}

interface StageProps {
  manifest: GlobeManifest;
  layer: LayerState;
  onRetryLayer: () => void;
  insights: GlobeInsights | null;
  /** Counts only; null when the customer file has not been built. */
  customers: CustomerSummary | null;
}

function GlobeStage({ manifest, layer, onRetryLayer, insights, customers }: StageProps) {
  const reducedMotion = usePrefersReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GlobeRenderer | null>(null);
  const reducedRef = useRef(reducedMotion);
  // This component only renders in the browser, and only when WebGL was found (see GlobeExperience).
  const [status, setStatus] = useState<Status>("loading");
  const [progress, setProgress] = useState(0);
  const [errorText, setErrorText] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [selection, setSelection] = useState<Selection>(NONE);
  const [revealed, setRevealed] = useState<{ districts: boolean; blocksFor: string | null }>({ districts: false, blocksFor: null });
  const [hover, setHover] = useState<FeatureRef | null>(null);
  const [focus, setFocus] = useState<FeatureRef | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Both panels start open where there is room beside the globe, and closed where they would cover it.
  const [placesOpen, setPlacesOpen] = useState(isWide);
  const [insightsOpen, setInsightsOpen] = useState(isWide);
  const [leftTab, setLeftTab] = useState<"places" | "segment">(() => (readSegmentParam() ? "segment" : "places"));
  const [initialSegment] = useState(() => decodeSegment(readSegmentParam(), { districts: new Set(manifest.districts.map((d) => d.id)) }));
  const [filter, setFilter] = useState<SegmentFilter>(initialSegment.filter);
  const [colourBy, setColourBy] = useState<ColourBy>(initialSegment.by);
  const placesToggleRef = useRef<HTMLDivElement>(null);
  const insightsToggleRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<"places" | "insights" | null>(null);
  const focusInto = useRef<"places" | "insights" | null>(null);
  const placesPanelRef = useRef<HTMLDivElement>(null);
  const insightsPanelRef = useRef<HTMLElement>(null);
  const selectionRef = useRef<Selection>(NONE);
  // True from the arrival of a flight to a place until the next flight or reset begins.
  const arrivedRef = useRef(false);
  // The renderer outlives renders, so it calls the latest handlers through refs.
  const pickHandler = useRef<(ref: FeatureRef) => void>(() => {});
  const revealRef = useRef<() => void>(() => {});
  const arrivalRef = useRef<(kind: "home" | "select") => void>(() => {});

  // What the page lists and describes: the validated manifest, or, once the outlines have joined it, the joined
  // overlay (which also drops any outline the join refused). Both carry the same validated summaries.
  const outlinesOverlay = layer.status === "ready" ? layer.outcome.overlay : null;
  const view: GlobeManifest = outlinesOverlay ?? manifest;
  const outlines: OutlinesStatus = layer.status;
  const viewRef = useRef(view);
  const layerStatusRef = useRef(layer.status);

  const targets = useMemo(() => buildTargets(view), [view]);
  const districtTargets = useMemo(() => targets.filter((t) => t.kind === "district").sort((a, b) => a.name.localeCompare(b.name)), [targets]);
  const blockTargets = useMemo(() => targets.filter((t) => t.kind === "block").sort((a, b) => a.name.localeCompare(b.name)), [targets]);
  const districtsById = useMemo(() => new Map(view.districts.map((d) => [d.id, d])), [view.districts]);
  const blocksById = useMemo(() => new Map(view.blocks.map((b) => [b.id, b])), [view.blocks]);
  const district = selection.districtId ? (districtsById.get(selection.districtId) ?? null) : null;
  const block = selection.blockId ? (blocksById.get(selection.blockId) ?? null) : null;

  const commit = useCallback((next: Selection) => {
    selectionRef.current = next;
    setSelection(next);
  }, []);

  const nameOf = useCallback((s: Selection) => placeName(view, s), [view]);

  // ----------------------------------------------------------- segment --
  // Facts per block, the faceted result and the paint for the renderer. Everything is from props already on the page.
  const facts = useMemo(() => buildBlockFacts(view, insights, customers), [view, insights, customers]);
  const segmentResult = useMemo(() => segment(facts, filter), [facts, filter]);
  const paint = useMemo(() => buildPaint(view, facts, segmentResult, colourBy), [view, facts, segmentResult, colourBy]);
  const segmented = segmentResult.active;
  useEffect(() => {
    rendererRef.current?.setPaint(paint);
  }, [paint, status]);
  // The segment lives in the address bar, so a view can be bookmarked or sent to a colleague.
  useEffect(() => {
    const url = new URL(window.location.href);
    const encoded = encodeSegment(filter, colourBy);
    if (encoded) url.searchParams.set("seg", encoded);
    else url.searchParams.delete("seg");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [filter, colourBy]);

  // ---------------------------------------------------------- renderer --
  useEffect(() => {
    reducedRef.current = reducedMotion;
    rendererRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    viewRef.current = view;
    layerStatusRef.current = layer.status;
    // Reveals what the current selection calls for, but only when the flight has arrived AND the renderer holds
    // validated outlines (outline-gate.ts). Called when a flight arrives and when the outlines become ready:
    // whichever finishes last triggers it.
    revealRef.current = () => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const current = selectionRef.current;
      if (!canReveal({ hasOutlines: renderer.hasOutlines, arrived: arrivedRef.current, level: current.level })) return;
      const v = viewRef.current;
      renderer.showDistricts(true);
      if (current.level === "state") {
        renderer.showBlocks(null);
        renderer.setLabels("districts");
        setRevealed({ districts: true, blocksFor: null });
        setAnnouncement(`Arrived at ${v.state.name}. ${v.meta.counts.districtsDrawn} provisional district outlines shown.`);
      } else if (current.districtId) {
        renderer.showBlocks(current.districtId);
        renderer.setLabels("blocks");
        setRevealed({ districts: true, blocksFor: current.districtId });
        const d = v.districts.find((x) => x.id === current.districtId);
        setAnnouncement(
          current.level === "block"
            ? `Arrived at ${v.blocks.find((b) => b.id === current.blockId)?.name ?? "the block"}. Details are in the panel.`
            : `Arrived at ${d?.name ?? "the district"}. ${d?.drawnBlockCount ?? 0} provisional block outlines shown.`,
        );
      }
    };
    arrivalRef.current = (kind) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      if (kind === "home") {
        arrivedRef.current = false;
        setAnnouncement("Back at the rotating globe. Choose another place.");
        return;
      }
      const current = selectionRef.current;
      if (current.level === "globe") return;
      arrivedRef.current = true;
      if (!renderer.hasOutlines) setAnnouncement(arrivalWithoutOutlines(placeName(viewRef.current, current), layerStatusRef.current));
      revealRef.current();
    };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let renderer: GlobeRenderer | null = null;
    // Textures only: the globe starts, turns and flies without the outline data.
    GlobeRenderer.create(
      host,
      {
        onPhase: (next) => setPhase(next),
        onArrive: (kind) => arrivalRef.current(kind),
        onHover: (ref) => setHover(ref),
        onPick: (ref) => {
          if (ref) pickHandler.current(ref);
        },
        onContextLost: () => {
          setErrorText("The graphics context was lost. This can happen when the device is under memory pressure.");
          setStatus("error");
        },
      },
      { reducedMotion: reducedRef.current },
      (fraction) => setProgress(fraction),
    )
      .then((created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        renderer = created;
        rendererRef.current = created;
        const wb = viewRef.current.state.centre;
        if (wb) created.setMarker({ ref: { kind: "state", id: viewRef.current.state.id }, lng: wb[0], lat: wb[1], name: viewRef.current.state.name });
        created.setMarkerEnabled(true);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorText(error instanceof Error ? error.message : "The globe could not start.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
      renderer?.dispose();
      rendererRef.current = null;
      // Next keeps a page you navigate away from (hidden) and runs this cleanup; when you come back the effect
      // builds a fresh globe, so the state that described the old one is cleared with it.
      setStatus("loading");
      setProgress(0);
      setPhase("idle");
      setRevealed({ districts: false, blocksFor: null });
      setHover(null);
      setFocus(null);
      arrivedRef.current = false;
      selectionRef.current = NONE;
      setSelection(NONE);
    };
    // The renderer is created once per attempt; it reads live state through refs.
  }, [attempt]);

  // Hand the validated outlines to the renderer when both exist, whichever came first, and reveal them if the
  // camera has already arrived. Nothing is drawn by handing them over.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || status !== "ready") return;
    renderer.setOverlay(outlinesOverlay);
    revealRef.current();
  }, [outlinesOverlay, status]);

  // Mirror the React hover / focus into the renderer's outlines.
  useEffect(() => {
    rendererRef.current?.setFocus(focus);
  }, [focus, status]);

  // A collapsed panel takes the keyboard focus back to the button that reopens it, and a panel the visitor opens takes it in.
  useEffect(() => {
    const back = returnFocusTo.current;
    if (back && !(back === "places" ? placesOpen : insightsOpen)) {
      returnFocusTo.current = null;
      (back === "places" ? placesToggleRef : insightsToggleRef).current?.querySelector("button")?.focus();
    }
    const into = focusInto.current;
    if (into && (into === "places" ? placesOpen : insightsOpen)) {
      focusInto.current = null;
      (into === "places" ? placesPanelRef : insightsPanelRef).current?.querySelector<HTMLElement>("button")?.focus();
    }
  }, [placesOpen, insightsOpen]);

  // ----------------------------------------------------------- actions --
  const selectedRef: FeatureRef | null = selection.blockId ? { kind: "block", id: selection.blockId } : selection.level === "district" && selection.districtId ? { kind: "district", id: selection.districtId } : null;
  const selectedKey = selectedRef ? `${selectedRef.kind}:${selectedRef.id}` : "";
  useEffect(() => {
    rendererRef.current?.setSelected(selectedRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, status]);

  const goTo = useCallback(
    (next: Selection) => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const previous = selectionRef.current;
      commit(next);
      setFocus(null);
      arrivedRef.current = false;
      const wantsBlocksFor = next.level === "district" || next.level === "block" ? next.districtId : null;
      // Anything about to be left behind fades out now; the new level is revealed on arrival.
      if (previous.districtId !== wantsBlocksFor || next.level === "state") {
        renderer.showBlocks(null);
        setRevealed((r) => ({ ...r, blocksFor: null }));
      }
      renderer.setLabels("none");
      renderer.setMarkerEnabled(false);

      let box = view.state.bbox;
      let fill = 0.62;
      if (next.level === "district" && next.districtId) {
        box = districtsById.get(next.districtId)?.geometry?.bbox ?? box;
        fill = 0.68;
      } else if (next.level === "block" && next.blockId) {
        const target = blocksById.get(next.blockId);
        const own = target?.geometry?.bbox;
        box = own ?? (next.districtId ? districtsById.get(next.districtId)?.geometry?.bbox : null) ?? box;
        fill = own ? 0.5 : 0.68;
        // A block with no outline: look at its district and say so; nothing is drawn for it.
        if (!own) commit({ ...next, level: "block" });
      }
      if (!box) return;
      setAnnouncement(`Travelling to ${nameOf(next)}.`);
      renderer.flyTo(renderer.poseForBox(box, fill));
    },
    [blocksById, commit, districtsById, nameOf, view.state.bbox],
  );

  const selectTarget = useCallback(
    (target: Target) => {
      // Where the list is a drawer over the globe, it steps aside so the flight can be seen.
      if (!isWide()) setPlacesOpen(false);
      if (target.kind === "state") goTo({ level: "state", districtId: null, blockId: null });
      else if (target.kind === "district") goTo({ level: "district", districtId: target.id, blockId: null });
      else goTo({ level: "block", districtId: blocksById.get(target.id)?.districtId ?? null, blockId: target.id });
    },
    [blocksById, goTo],
  );

  const pickRef = useCallback(
    (ref: FeatureRef) => {
      if (ref.kind === "state") goTo({ level: "state", districtId: null, blockId: null });
      else if (ref.kind === "district") goTo({ level: "district", districtId: ref.id, blockId: null });
      else goTo({ level: "block", districtId: blocksById.get(ref.id)?.districtId ?? null, blockId: ref.id });
    },
    [blocksById, goTo],
  );

  useEffect(() => {
    pickHandler.current = pickRef;
  }, [pickRef]);

  const reset = useCallback(() => {
    const renderer = rendererRef.current;
    commit(NONE);
    arrivedRef.current = false;
    setFocus(null);
    setHover(null);
    setRevealed({ districts: false, blocksFor: null });
    if (!renderer) return;
    renderer.showBlocks(null);
    renderer.showDistricts(false);
    renderer.setLabels("none");
    renderer.setMarkerEnabled(true);
    renderer.setSelected(null);
    renderer.flyHome();
    setAnnouncement("Returning to the rotating globe.");
  }, [commit]);

  const back = useCallback(() => {
    const current = selectionRef.current;
    if (current.level === "block" && current.districtId) goTo({ level: "district", districtId: current.districtId, blockId: null });
    else if (current.level === "district") goTo({ level: "state", districtId: null, blockId: null });
    else reset();
  }, [goTo, reset]);

  const zoom = useCallback((factor: number) => {
    rendererRef.current?.zoomBy(factor);
    setAnnouncement(factor < 1 ? "Zooming in." : "Zooming out.");
  }, []);

  // Back to the framing the current place was flown to; on the whole globe, back to the rotating view.
  const recentre = useCallback(() => {
    const current = selectionRef.current;
    if (current.level === "globe") {
      rendererRef.current?.flyHome();
      setAnnouncement("Recentring the globe.");
    } else goTo(current);
  }, [goTo]);

  const openPlaces = useCallback(() => {
    focusInto.current = "places";
    setPlacesOpen(true);
    if (!isWide()) setInsightsOpen(false);
  }, []);
  const openInsights = useCallback(() => {
    focusInto.current = "insights";
    setInsightsOpen(true);
    if (!isWide()) setPlacesOpen(false);
  }, []);
  const closePlaces = useCallback(() => {
    returnFocusTo.current = "places";
    setPlacesOpen(false);
  }, []);
  const closeInsights = useCallback(() => {
    returnFocusTo.current = "insights";
    setInsightsOpen(false);
  }, []);

  // The marker returns with the whole-globe view.
  const flying = phase === "flying";

  // ---------------------------------------------------------- keyboard --
  const pickables = useMemo(() => pickableRefs(view, revealed), [view, revealed]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (status !== "ready") return;
      if (event.key === "Escape") {
        if (selectionRef.current.level !== "globe") {
          event.preventDefault();
          back();
        }
        return;
      }
      if (flying) return;
      const level = selectionRef.current.level;
      if (level === "globe" && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        goTo({ level: "state", districtId: null, blockId: null });
        return;
      }
      if (pickables.length === 0) return;
      const index = focus ? pickables.findIndex((p) => p.kind === focus.kind && p.id === focus.id) : -1;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = pickables[(index + 1) % pickables.length];
        setFocus({ kind: next.kind, id: next.id });
        setAnnouncement(next.name);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = pickables[(index <= 0 ? pickables.length : index) - 1];
        setFocus({ kind: next.kind, id: next.id });
        setAnnouncement(next.name);
      } else if ((event.key === "Enter" || event.key === " ") && focus) {
        event.preventDefault();
        pickRef(focus);
      }
    },
    [back, flying, focus, goTo, pickRef, pickables, status],
  );

  // Escape closes a panel that is a drawer over the globe; where the panels float beside it, Escape keeps its other uses.
  const panelEscape = useCallback((event: KeyboardEvent<HTMLElement>, close: () => void) => {
    if (event.key === "Escape" && !isWide() && !(event.target instanceof HTMLInputElement && event.target.value !== "")) {
      event.preventDefault();
      close();
    }
  }, []);

  // ------------------------------------------------------------- views --
  const level = selection.level;
  const stageLabel =
    level === "globe"
      ? "Rotating globe. Press Enter to fly to West Bengal."
      : `Globe view of ${nameOf(selection)}. Arrow keys move between outlines, Enter selects, Escape goes back.`;
  const statusText =
    phase === "flying"
      ? `Travelling to ${nameOf(selection)}`
      : level === "globe"
        ? phase === "arrived"
          ? "Held (use Recentre to turn again)"
          : reducedMotion
            ? "Still (reduced motion)"
            : "Rotating"
        : `Arrived: ${nameOf(selection)}`;
  const hoverName = hover
    ? hover.kind === "district"
      ? districtsById.get(hover.id)?.name
      : hover.kind === "block"
        ? blocksById.get(hover.id)?.name
        : view.state.name
    : null;
  const focusName = focus ? (focus.kind === "district" ? districtsById.get(focus.id)?.name : blocksById.get(focus.id)?.name) : null;
  const showProvisional = revealed.districts || revealed.blocksFor !== null;
  const trail = ["Earth", ...(level === "globe" ? [] : [view.state.name]), ...(district ? [district.name] : []), ...(block ? [block.name] : [])];
  const placeLabel = level === "globe" ? "Earth" : nameOf(selection);

  const searchIcon = (
    <Icon>
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.5 13.5 3.5 3.5" />
    </Icon>
  );
  const insightsIcon = (
    <Icon>
      <path d="M4 16V9m6 7V4m6 12v-5" />
    </Icon>
  );

  return (
    <>
      <div
        className="overflow-clip rounded-card bg-surface shadow-card"
        data-testid="globe-prototype"
        data-status={status}
        data-outlines={layer.status}
        data-level={level}
        data-phase={phase}
        data-revealed-districts={revealed.districts ? "true" : "false"}
        data-revealed-blocks={revealed.blocksFor ?? ""}
        data-selected={selection.blockId ?? selection.districtId ?? ""}
        data-places={placesOpen ? "open" : "closed"}
        data-insights={insightsOpen ? "open" : "closed"}
      >
        {/* The stage: the globe fills all of it, and everything else floats over it. */}
        <div className="relative h-[clamp(26rem,calc(100dvh-17.5rem),44rem)] md:h-[clamp(30rem,calc(100dvh-15rem),44rem)] bg-[radial-gradient(ellipse_at_50%_46%,#f7fbff_0%,#e3eefa_55%,#d0e1f4_100%)] lg:h-[clamp(32rem,calc(100dvh-13.5rem),46rem)]" data-testid="globe-stage">
          <div
            ref={stageRef}
            tabIndex={0}
            role="group"
            aria-roledescription="interactive globe"
            aria-label={stageLabel}
            aria-describedby="globe-help"
            onKeyDown={onKeyDown}
            className="absolute inset-0 outline-offset-[-3px]"
          >
            <div ref={hostRef} className="absolute inset-0" data-testid="globe-canvas-host" />
          </div>
          <p id="globe-help" className="sr-only">
            Use the search and place list on the left, or press Enter to fly to West Bengal. When outlines are shown, the arrow keys move between them, Enter selects one, and Escape goes back one step.
          </p>
          <div className="sr-only" role="status" aria-live="polite" data-testid="globe-announcement">
            {announcement}
          </div>

          {status === "ready" ? (
            <>
              {/* Status and navigation, between the two panels. On a phone: the status on the first row, beside the two panel buttons, and the rest on a second. */}
              <div
                className={cn(
                  "pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-wrap items-start justify-center gap-2 md:left-[6.5rem] md:right-[6.5rem]",
                  placesOpen ? "lg:left-[19rem]" : "lg:left-[6.5rem]",
                  insightsOpen ? "lg:right-[21rem]" : "lg:right-[6.5rem]",
                )}
              >
                <div className="flex min-h-10 w-full items-center justify-center px-[6.25rem] md:min-h-0 md:w-auto md:px-0">
                  <span className="max-w-full truncate rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-ink shadow-float ring-1 ring-line" data-testid="globe-status" title={statusText}>
                    <span aria-hidden="true" className={cn("mr-2 inline-block size-2 rounded-full", phase === "idle" ? "bg-accent" : phase === "flying" ? "bg-primary" : "bg-ink")} />
                    {statusText}
                  </span>
                </div>
                {segmented ? (
                  <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-primary py-1 pl-3 pr-1 text-xs font-semibold text-white shadow-float" data-testid="globe-segment-pill">
                    <button type="button" onClick={() => { setLeftTab("segment"); openPlaces(); }} className="hover:underline">
                      Segment: {segmentResult.matched.size} of {segmentResult.total} blocks
                    </button>
                    <button type="button" onClick={() => setFilter(EMPTY_FILTER)} aria-label="Clear the segment" title="Clear the segment" className="grid size-5 place-items-center rounded-full hover:bg-white/20">
                      <svg aria-hidden="true" viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <path d="m5.5 5.5 9 9m0-9-9 9" />
                      </svg>
                    </button>
                  </div>
                ) : null}
                {showProvisional || level !== "globe" ? (
                  <div className="flex w-full flex-wrap items-center justify-center gap-2 md:w-auto">
                    {showProvisional ? (
                      <span className="rounded-full border border-warn-line bg-warn-soft px-3 py-1 text-[0.6875rem] font-semibold uppercase leading-5 tracking-wider text-warn-ink shadow-sm">
                        Provisional outlines
                      </span>
                    ) : null}
                    {level !== "globe" ? (
                      <div className="pointer-events-auto flex gap-2">
                        <button type="button" onClick={back} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-float ring-1 ring-line hover:bg-surface-muted">
                          Back
                        </button>
                        <button type="button" onClick={reset} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-float hover:bg-primary-hover">
                          Return to globe
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Closed panels leave one button each, in the top corners. */}
              {!placesOpen ? (
                <div ref={placesToggleRef} className="pointer-events-none absolute left-3 top-3 z-20">
                  <PanelToggle label="Places" onClick={openPlaces} icon={searchIcon} controls="globe-places" />
                </div>
              ) : null}
              {!insightsOpen ? (
                <div ref={insightsToggleRef} className="pointer-events-none absolute right-3 top-3 z-20">
                  <PanelToggle label="Insights" onClick={openInsights} icon={insightsIcon} controls="globe-insights-panel" />
                </div>
              ) : null}

              {/* Zoom and recentre. Beside the insights panel when it is open, so neither covers the other. */}
              <menu
                aria-label="Globe controls"
                className={cn(
                  "pointer-events-auto absolute bottom-[4.25rem] right-3 z-10 m-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-xl bg-white shadow-float ring-1 ring-line md:bottom-3",
                  insightsOpen ? "lg:right-[21rem]" : "lg:right-3",
                )}
                data-testid="globe-controls"
              >
                <li>
                  <button type="button" className={controlClass} onClick={() => zoom(ZOOM_STEP)} disabled={flying} aria-label="Zoom in" title="Zoom in">
                    <Icon>
                      <path d="M10 4.5v11M4.5 10h11" />
                    </Icon>
                  </button>
                </li>
                <li>
                  <button type="button" className={controlClass} onClick={() => zoom(1 / ZOOM_STEP)} disabled={flying} aria-label="Zoom out" title="Zoom out">
                    <Icon>
                      <path d="M4.5 10h11" />
                    </Icon>
                  </button>
                </li>
                <li>
                  <button type="button" className={controlClass} onClick={recentre} disabled={flying} aria-label="Recentre" title="Recentre on this place">
                    <Icon>
                      <circle cx="10" cy="10" r="3" />
                      <path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3" />
                    </Icon>
                  </button>
                </li>
              </menu>

              <div className={cn("pointer-events-none absolute bottom-[4.25rem] left-3 z-10 md:bottom-3", placesOpen ? "lg:left-[19rem]" : "lg:left-3")}>
                <Legend open={segmented || colourBy !== "link"} colourBy={colourBy} segmented={segmented} maxMatched={maxDistrictMatches(segmentResult)} />
              </div>
              {hoverName || focusName ? (
                <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 max-w-[40%] -translate-x-1/2 truncate rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-ink shadow-float md:max-w-[min(40%,16rem)]" data-testid="globe-hover">
                  {focusName ?? hoverName}
                </p>
              ) : null}

              {/* Mobile: a compact strip that names the place and opens the details sheet. */}
              {!insightsOpen ? (
                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 md:hidden">
                  <button
                    type="button"
                    onClick={openInsights}
                    aria-controls="globe-insights-panel"
                    aria-expanded={false}
                    className="pointer-events-auto flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-2 text-left shadow-float ring-1 ring-line"
                    data-testid="globe-details-strip"
                  >
                    <span className="min-w-0">
                      <span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">{level === "globe" ? "Region insights" : "Details"}</span>
                      <span className="block truncate text-sm font-semibold text-ink">{placeLabel}</span>
                    </span>
                    <span aria-hidden="true" className="text-primary-ink">
                      <Icon>
                        <path d="m5 12 5-5 5 5" />
                      </Icon>
                    </span>
                  </button>
                </div>
              ) : null}

              {/* Left: go to a place. */}
              {placesOpen ? (
                <div
                  id="globe-places"
                  ref={placesPanelRef}
                  role="region"
                  aria-label="Places"
                  onKeyDown={(event) => panelEscape(event, closePlaces)}
                  className="pointer-events-auto absolute bottom-3 left-3 top-3 z-30 flex w-[min(20rem,calc(100%-1.5rem))] flex-col rounded-2xl bg-white p-4 [&_h2]:pr-8 shadow-[0_8px_30px_-12px_rgb(23_43_77/0.35)] ring-1 ring-line lg:z-20 lg:w-[17.5rem]"
                  data-testid="globe-places"
                >
                  <CollapseButton label="Hide places" onClick={closePlaces} className="absolute right-2.5 top-2.5 z-10" />
                  <div role="tablist" aria-label="Left panel" className="mb-3 mr-9 flex gap-1 rounded-xl bg-surface-muted p-1">
                    {(["places", "segment"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={leftTab === tab}
                        onClick={() => setLeftTab(tab)}
                        className={cn("min-h-8 flex-1 rounded-lg px-2 text-xs font-semibold transition-colors", leftTab === tab ? "bg-white text-primary-ink shadow-float" : "text-ink-muted hover:text-ink")}
                        data-testid={`globe-tab-${tab}`}
                      >
                        {tab === "places" ? "Places" : "Segment"}
                        {tab === "segment" && filterSize(filter) > 0 ? <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[0.625rem] leading-4 text-white">{filterSize(filter)}</span> : null}
                      </button>
                    ))}
                  </div>
                  {leftTab === "places" ? (
                    <PlaceSearch targets={targets} districts={districtTargets} blocks={blockTargets} onSelect={selectTarget} disabled={status !== "ready" || flying} activeId={selection.blockId ?? selection.districtId} trail={trail} />
                  ) : (
                    <SegmentPanel
                      filter={filter}
                      onFilter={setFilter}
                      colourBy={colourBy}
                      onColourBy={setColourBy}
                      result={segmentResult}
                      facts={facts}
                      districts={view.districts}
                      hasInsights={insights !== null}
                      hasCustomers={customers !== null}
                      disabled={status !== "ready" || flying}
                      onSelectBlock={(id) => {
                        if (!isWide()) setPlacesOpen(false);
                        goTo({ level: "block", districtId: blocksById.get(id)?.districtId ?? null, blockId: id });
                      }}
                    />
                  )}
                </div>
              ) : null}

              {/* Right: insights and details. A bottom sheet on a phone. */}
              {insightsOpen ? (
                <aside
                  id="globe-insights-panel"
                  ref={insightsPanelRef}
                  aria-label="Insights"
                  onKeyDown={(event) => panelEscape(event, closeInsights)}
                  className="pointer-events-auto absolute inset-x-3 bottom-3 z-30 flex max-h-[72%] flex-col rounded-2xl bg-white p-4 shadow-[0_8px_30px_-12px_rgb(23_43_77/0.35)] ring-1 ring-line md:inset-x-auto md:right-3 md:top-3 md:max-h-none md:w-[19.5rem] lg:z-20"
                  data-testid="globe-insights-panel"
                >
                  <div className="-mt-1 mb-2 flex items-center justify-between gap-2">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">Insights</p>
                    <CollapseButton label="Hide insights" onClick={closeInsights} className="-mr-1" />
                  </div>
                  <GlobeDetails
                    key={`${level}:${selection.blockId ?? selection.districtId ?? ""}`}
                    overlay={view}
                    level={level}
                    district={district}
                    block={block}
                    disabled={status !== "ready" || flying}
                    outlines={outlines}
                    insights={insights}
                    customers={customers}
                    onSelectBlock={(id) => goTo({ level: "block", districtId: blocksById.get(id)?.districtId ?? null, blockId: id })}
                    onSelectDistrict={(id) => goTo({ level: "district", districtId: id, blockId: null })}
                  />
                </aside>
              ) : null}
            </>
          ) : null}

          {status === "loading" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" role="status" data-testid="globe-loading">
              <div aria-hidden="true" className="size-40 animate-pulse rounded-full bg-[radial-gradient(circle_at_35%_30%,#8dbbf3,#3f7ecb_55%,#235aa6_100%)] shadow-[0_0_48px_rgba(63,126,203,0.28)]" />
              <p className="text-sm text-ink-muted">Loading the globe… {Math.round(progress * 100)}%</p>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/95 p-6 text-center" role="alert" data-testid="globe-error">
              <p className="text-base font-semibold text-ink">The globe could not be shown</p>
              <p className="max-w-md text-sm text-ink-muted">{errorText}</p>
              <button
                type="button"
                onClick={() => {
                  setStatus("loading");
                  setProgress(0);
                  setAttempt((n) => n + 1);
                }}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>

        <OutlineDataStrip
          layer={layer}
          onRetry={onRetryLayer}
          drawn={{ districts: view.meta.counts.districtsDrawn, blocks: view.meta.counts.blocksDrawn }}
          attribution={`${ATTRIBUTION_EARTH} Outlines: ${view.meta.attribution}, ODbL, provisional and not official boundaries.`}
        />
      </div>
      <MarketDashboard
        blocks={manifest.blocks}
        districts={manifest.districts}
        stateName={manifest.state.name}
        level={level}
        districtId={selection.districtId}
        blockId={selection.blockId}
        onSelectDistrict={status === "ready" && !flying ? (id) => goTo({ level: "district", districtId: id, blockId: null }) : undefined}
      />
    </>
  );
}

const CODE_REASON: Record<string, string> = {
  missing: "The outline file has not been built on the server.",
  unavailable: "The outline file has not been built on the server.",
  identity: "The server refused the outline file: it is not the dataset the globe was validated against.",
  tampered: "The server refused the outline file: it no longer matches the validated copy.",
  invalid: "The server refused the outline file: it failed its structural check.",
};

/**
 * Starts two things at once and keeps them apart: the globe (textures, WebGL; see GlobeStage) and the outline
 * file (fetch from the same-origin route, then the join to the validated manifest). The globe renders and turns
 * while the outlines load; outlines are revealed only after a flight has arrived and the join has passed. If the
 * outline file fails, the globe and the searchable places list carry on and the reason and a retry are on screen;
 * if the textures fail, the globe shows its own error and retry, and the outline status is unaffected. Without
 * WebGL there is nothing to draw on, so the list-only view is shown and the outline file is not requested.
 */
export default function GlobeExperience({ manifest, insights = null, customers = null }: { manifest: GlobeManifest; insights?: GlobeInsights | null; customers?: CustomerSummary | null }) {
  const [webgl] = useState(() => webglAvailable());
  const [attempt, setAttempt] = useState(0);
  const [layer, setLayer] = useState<LayerState>({ status: "loading" });

  useEffect(() => {
    if (!webgl) return;
    const controller = new AbortController();
    fetchBoundaryLayer(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const outcome = mergeLayer(manifest, data);
        setLayer(outcome.ok ? { status: "ready", outcome } : { status: "unavailable", reason: outcome.reason });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const known = error instanceof LayerRequestError && error.code ? CODE_REASON[error.code] : undefined;
        const detail = error instanceof Error ? error.message : "unknown error";
        setLayer({ status: "unavailable", reason: known ?? `The outline data could not be loaded from /geo/globe-boundaries.json (${detail}).` });
      });
    return () => controller.abort();
  }, [manifest, attempt, webgl]);

  const retry = useCallback(() => {
    setLayer({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  if (!webgl) return <GlobeFallback overlay={manifest} insights={insights} customers={customers} reason="WebGL is not available in this browser, so the 3D globe cannot run." />;
  return <GlobeStage manifest={manifest} layer={layer} onRetryLayer={retry} insights={insights} customers={customers} />;
}
