"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { GlobeRenderer, webglAvailable, type FeatureRef } from "../GlobeRenderer";
import { fetchBoundaryLayer, LayerRequestError } from "../layer-client";
import { mergeLayer, type MergeOutcome } from "../layer-merge";
import { arrivalWithoutOutlines, canReveal, type OutlinesStatus } from "../outline-gate";
import { BLOCK_STYLE, DISTRICT_STYLE, HOVER_COLOUR, SELECTED_COLOUR } from "../styles";
import { buildTargets, pickableRefs, type Target } from "../targets";
import type { GlobeManifest, Level, Phase } from "../types";
import { GlobeFallback } from "./GlobeFallback";
import { GlobeDetails, PlaceSearch } from "./GlobePanel";

interface Selection {
  level: Level;
  districtId: string | null;
  blockId: string | null;
}

const ATTRIBUTION_EARTH = "Earth: NASA Earth Observatory, Blue Marble.";

const NONE: Selection = { level: "globe", districtId: null, blockId: null };

type Status = "loading" | "ready" | "error";

/** The outline file: fetched, integrity-checked by the server, and joined to the validated manifest. Independent of the textures. */
type LayerState = { status: "loading" } | { status: "ready"; outcome: Extract<MergeOutcome, { ok: true }> } | { status: "unavailable"; reason: string };

function placeName(view: GlobeManifest, s: Selection): string {
  if (s.level === "state") return view.state.name;
  if (s.level === "block") return view.blocks.find((b) => b.id === s.blockId)?.name ?? "";
  if (s.level === "district") return view.districts.find((d) => d.id === s.districtId)?.name ?? "";
  return "the globe";
}

function Legend({ open }: { open: boolean }) {
  const rows: Array<{ colour: string; label: string; note?: string; ring?: boolean }> = [
    { colour: DISTRICT_STYLE.represented.fill, label: "District: provisional link", note: "at least one linked block. Not complete or officially verified coverage" },
    { colour: BLOCK_STYLE.represented.fill, label: "Block: provisional link", note: "named representative, unreviewed" },
    { colour: "#ffffff", label: "Confirmed: no representative", note: "none yet; needs a reviewed source record", ring: true },
    { colour: BLOCK_STYLE.unresolved.fill, label: "Unresolved or unverified", note: "not the same as none" },
  ];
  return (
    <details key={open ? "open" : "closed"} open={open} aria-label="Legend" className="pointer-events-auto w-60 rounded-lg border border-white/10 bg-navy-950/80 p-2.5 backdrop-blur">
      <summary className="cursor-pointer text-[0.6875rem] font-semibold uppercase tracking-wide text-on-navy-subtle">Legend (provisional)</summary>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-xs text-on-navy-muted">
            <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-sm", row.ring && "ring-1 ring-white/60")} style={{ backgroundColor: row.colour }} />
            <span className="min-w-0 flex-1 leading-4">
              {row.label}
              {row.note ? <span className="block text-[0.6875rem] text-on-navy-subtle">{row.note}</span> : null}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2 border-t border-white/10 pt-1 text-xs text-on-navy-muted">
          <span aria-hidden="true" className="h-0.5 w-3 shrink-0 rounded" style={{ backgroundColor: SELECTED_COLOUR }} />
          Selected
          <span aria-hidden="true" className="ml-2 h-0.5 w-3 shrink-0 rounded" style={{ backgroundColor: HOVER_COLOUR }} />
          Hover or focus
        </li>
      </ul>
    </details>
  );
}

/** Where the outline data is, always on screen, whatever the textures are doing. */
function OutlineDataStrip({ layer, onRetry, drawn }: { layer: LayerState; onRetry: () => void; drawn: { districts: number; blocks: number } }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-navy-950 px-4 py-2 text-xs text-on-navy-muted lg:order-last lg:col-span-2"
      data-testid="globe-outlines-status"
      data-state={layer.status}
    >
      <span className="font-semibold uppercase tracking-wide text-[0.6875rem] text-on-navy-subtle">Outline data</span>
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
            className="rounded-md border border-accent/60 bg-accent/15 px-3 py-1 text-xs font-semibold text-on-navy hover:bg-accent/25"
            data-testid="globe-outlines-retry"
          >
            Try again
          </button>
        </>
      ) : null}
    </div>
  );
}

interface StageProps {
  manifest: GlobeManifest;
  layer: LayerState;
  onRetryLayer: () => void;
}

function GlobeStage({ manifest, layer, onRetryLayer }: StageProps) {
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
  const selectionRef = useRef<Selection>(NONE);
  // True from the arrival of a flight to a place until the next flight or reset begins.
  const arrivedRef = useRef(false);
  // This component renders only in the browser, so the width can be read once: on a phone the legend starts closed.
  const [wide] = useState(() => window.matchMedia("(min-width: 768px)").matches);
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
  const districtsById = useMemo(() => new Map(view.districts.map((d) => [d.id, d])), [view.districts]);
  const blocksById = useMemo(() => new Map(view.blocks.map((b) => [b.id, b])), [view.blocks]);
  const district = selection.districtId ? (districtsById.get(selection.districtId) ?? null) : null;
  const block = selection.blockId ? (blocksById.get(selection.blockId) ?? null) : null;

  const commit = useCallback((next: Selection) => {
    selectionRef.current = next;
    setSelection(next);
  }, []);

  const nameOf = useCallback((s: Selection) => placeName(view, s), [view]);

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

  // ------------------------------------------------------------- views --
  const level = selection.level;
  const stageLabel =
    level === "globe"
      ? "Rotating globe. Press Enter to fly to West Bengal."
      : `Globe view of ${nameOf(selection)}. Arrow keys move between outlines, Enter selects, Escape goes back.`;
  const statusText =
    phase === "flying" ? `Travelling to ${nameOf(selection)}` : level === "globe" ? (reducedMotion ? "Still (reduced motion)" : "Rotating") : `Arrived: ${nameOf(selection)}`;
  const hoverName = hover
    ? hover.kind === "district"
      ? districtsById.get(hover.id)?.name
      : hover.kind === "block"
        ? blocksById.get(hover.id)?.name
        : view.state.name
    : null;
  const focusName = focus ? (focus.kind === "district" ? districtsById.get(focus.id)?.name : blocksById.get(focus.id)?.name) : null;
  const showProvisional = revealed.districts || revealed.blocksFor !== null;

  return (
    <div
      className="map-theme grid overflow-hidden rounded-xl border border-line bg-navy-950 lg:grid-cols-[minmax(0,1fr)_23rem]"
      data-testid="globe-prototype"
      data-status={status}
      data-outlines={layer.status}
      data-level={level}
      data-phase={phase}
      data-revealed-districts={revealed.districts ? "true" : "false"}
      data-revealed-blocks={revealed.blocksFor ?? ""}
      data-selected={selection.blockId ?? selection.districtId ?? ""}
    >
      <div className="relative h-[min(74vh,780px)] min-h-[440px] bg-[#02060f]">
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
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(2,6,15,0.55)_100%)]" />
        <p id="globe-help" className="sr-only">
          Use the search and place list on the right, or press Enter to fly to West Bengal. When outlines are shown, the arrow keys move between them, Enter selects one, and Escape goes back one step.
        </p>
        <div className="sr-only" role="status" aria-live="polite" data-testid="globe-announcement">
          {announcement}
        </div>

        {status === "ready" ? (
          <>
            <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full border border-white/15 bg-navy-950/80 px-3 py-1 text-xs font-medium text-on-navy backdrop-blur"
                  data-testid="globe-status"
                >
                  <span aria-hidden="true" className={cn("mr-2 inline-block size-2 rounded-full", phase === "idle" ? "bg-accent" : phase === "flying" ? "bg-gold-400" : "bg-white")} />
                  {statusText}
                </span>
                {showProvisional ? (
                  <span className="rounded-full border border-dashed border-gold-400/60 bg-navy-950/80 px-3 py-1 text-[0.6875rem] font-medium uppercase tracking-wide text-gold-400 backdrop-blur">
                    Provisional outlines
                  </span>
                ) : null}
              </div>
              {level !== "globe" ? (
                <div className="pointer-events-auto flex gap-2">
                  <button
                    type="button"
                    onClick={back}
                    className="rounded-md border border-white/20 bg-navy-950/80 px-3 py-1.5 text-xs font-semibold text-on-navy backdrop-blur hover:border-accent"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-md border border-accent/60 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-on-navy backdrop-blur hover:bg-accent/25"
                  >
                    Return to globe
                  </button>
                </div>
              ) : null}
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3">
              <Legend open={showProvisional && wide} />
            </div>
            {hoverName || focusName ? (
              <p className="pointer-events-none absolute bottom-3 left-1/2 max-w-[40%] -translate-x-1/2 truncate rounded-full border border-white/15 bg-navy-950/85 px-3 py-1 text-xs font-medium text-on-navy backdrop-blur" data-testid="globe-hover">
                {focusName ?? hoverName}
              </p>
            ) : null}
            <p className="pointer-events-none absolute bottom-3 right-3 hidden max-w-[16rem] text-right text-[0.6875rem] leading-4 text-on-navy-subtle md:block">
              {ATTRIBUTION_EARTH} Outlines: {view.meta.attribution}, ODbL, provisional and not official boundaries.
            </p>
          </>
        ) : null}

        {status === "loading" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" role="status" data-testid="globe-loading">
            <div aria-hidden="true" className="size-40 animate-pulse rounded-full bg-[radial-gradient(circle_at_35%_30%,#2a5ca8,#0b1f4a_55%,#030a1c_100%)] shadow-[0_0_60px_rgba(60,120,255,0.25)]" />
            <p className="text-sm text-on-navy-muted">Loading the globe… {Math.round(progress * 100)}%</p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-navy-950/90 p-6 text-center" role="alert" data-testid="globe-error">
            <p className="text-base font-semibold text-on-navy">The globe could not be shown</p>
            <p className="max-w-md text-sm text-on-navy-muted">{errorText}</p>
            <button
              type="button"
              onClick={() => {
                setStatus("loading");
                setProgress(0);
                setAttempt((n) => n + 1);
              }}
              className="rounded-md border border-accent/60 bg-accent/15 px-4 py-2 text-sm font-semibold text-on-navy hover:bg-accent/25"
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>

      <OutlineDataStrip layer={layer} onRetry={onRetryLayer} drawn={{ districts: view.meta.counts.districtsDrawn, blocks: view.meta.counts.blocksDrawn }} />
      <p className="border-t border-line bg-navy-950 px-4 py-2 text-[0.6875rem] leading-4 text-on-navy-subtle md:hidden lg:col-span-2">
        {ATTRIBUTION_EARTH} Outlines: {view.meta.attribution}, ODbL, provisional and not official boundaries.
      </p>
      <aside className="space-y-4 border-t border-line bg-surface p-4 lg:max-h-[min(74vh,780px)] lg:overflow-y-auto lg:border-l lg:border-t-0">
        <PlaceSearch targets={targets} districts={districtTargets} onSelect={selectTarget} disabled={status !== "ready" || flying} />
        <GlobeDetails
          overlay={view}
          level={level}
          district={district}
          block={block}
          disabled={status !== "ready" || flying}
          outlines={outlines}
          onSelectBlock={(id) => goTo({ level: "block", districtId: blocksById.get(id)?.districtId ?? null, blockId: id })}
          onSelectDistrict={(id) => goTo({ level: "district", districtId: id, blockId: null })}
        />
      </aside>
    </div>
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
export default function GlobeExperience({ manifest }: { manifest: GlobeManifest }) {
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

  if (!webgl) return <GlobeFallback overlay={manifest} reason="WebGL is not available in this browser, so the 3D globe cannot run." />;
  return <GlobeStage manifest={manifest} layer={layer} onRetryLayer={retry} />;
}
