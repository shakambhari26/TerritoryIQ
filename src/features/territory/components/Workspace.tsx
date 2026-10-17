"use client";

import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { MapWorkspace } from "@/components/dashboard/MapWorkspace";
import { addChange, removeLastChange, useLocalChanges } from "@/features/allocation/overlay-store";
import { validateChange, type Change } from "@/features/allocation/overlay";
import { cn } from "@/lib/cn";
import { ALLOCATION_STATE_LABEL, type AllocationState, type BoundaryLayer, type Selection, type TerritoryDataset } from "../types";
import { layerProblem } from "../layer-validation";
import {
  STATE_NAME,
  actionForBackgroundClick,
  actionForEscape,
  actionForFeatureClick,
  breadcrumbs,
  mapContext,
  parentSelection,
  type Crumb,
  type MapAction,
} from "../map-level";
import { type MapLayerMode } from "../map-style";
import { buildModel } from "../model";
import { pinSetFor, pinsFor, type PinAnchor } from "../representatives";
import { blockQuality, districtQuality } from "../quality";
import { buildSearchIndex, type SearchHit } from "../search";
import { parseSelectionHash, selectionForFeature, selectionToHash } from "../selection";
import { AreaList } from "./AreaList";
import { DetailsPanel } from "./DetailsPanel";
import { DistrictNavigator, type NavigatorPins } from "./DistrictNavigator";
import { GeoMap, type LayerLoad } from "./GeoMap";
import { LocalChangesBar } from "./LocalChangesBar";
import { MapLegend } from "./MapLegend";
import { MapToolbar } from "./MapToolbar";
import { RAIL_SHOWS_PANEL_CLOSED, RAIL_SHOWS_PANEL_OPEN } from "./layout-classes";

const LAYER_URL = "/geo/boundaries.json";

// ---- selection lives in the URL hash so a view can be shared and reloaded ----

const hashListeners = new Set<() => void>();
function subscribeHash(listener: () => void) {
  hashListeners.add(listener);
  window.addEventListener("hashchange", listener);
  return () => {
    hashListeners.delete(listener);
    window.removeEventListener("hashchange", listener);
  };
}
const readHash = () => window.location.hash;
function writeHash(hash: string) {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
  hashListeners.forEach((listener) => listener());
}

function useBoundaryLayer(dataset: TerritoryDataset): LayerLoad {
  const [load, setLoad] = useState<LayerLoad>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const known = new Set(dataset.features.map((f) => f.id));
    fetch(LAYER_URL, { signal: controller.signal, cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: unknown = await response.json();
        const problem = layerProblem(data, known);
        setLoad(
          problem
            ? { status: "unavailable", reason: `The boundary file was refused: ${problem}` }
            : { status: "ready", layer: data as BoundaryLayer },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const detail = error instanceof Error ? error.message : "unknown error";
        setLoad({
          status: "unavailable",
          reason: `The boundary file ${LAYER_URL} could not be loaded (${detail}). Run "npm run data:fetch-osm" then "npm run data:build". Areas can still be listed and allocated without it.`,
        });
      });
    return () => controller.abort();
  }, [dataset]);
  return load;
}

export function Workspace({ dataset }: { dataset: TerritoryDataset }) {
  const local = useLocalChanges();
  const model = useMemo(() => buildModel(dataset, local.changes), [dataset, local.changes]);
  const load = useBoundaryLayer(dataset);
  const detailsId = useId();

  const layer = load.status === "ready" ? load.layer : null;
  const shapeIds = useMemo(() => new Set(layer?.shapes.map((s) => s.featureId) ?? []), [layer]);
  const searchIndex = useMemo(() => buildSearchIndex(dataset.features, shapeIds), [dataset, shapeIds]);

  const [layerMode, setLayerMode] = useState<MapLayerMode>("allocation");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [pinsOn, setPinsOn] = useState(true);
  // The district the pointer or keyboard is on in the navigator; the map outlines it.
  const [navHover, setNavHover] = useState<string | null>(null);
  // The first-use hint goes once the user has acted on the map (or selected anything); a summary takes its line.
  const [mapTouched, setMapTouched] = useState(false);
  const onMapInteract = useCallback(() => setMapTouched(true), []);

  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");
  const selection: Selection = useMemo(() => parseSelectionHash(hash, model), [hash, model]);
  const select = useCallback((next: Selection) => writeHash(selectionToHash(next)), []);
  // The geographic level follows the selection, and the selection is in the URL, so the level is shared and restored with it.
  const context = useMemo(() => mapContext(model, selection), [model, selection]);
  const crumbs = useMemo(() => breadcrumbs(model, context), [model, context]);

  // A change of geographic context moves the map to it. Moving between blocks of one district does not.
  const [revealToken, setRevealToken] = useState(0);
  const reveal = useCallback(() => setRevealToken((n) => n + 1), []);
  // A hash changed from outside (address bar, back button, a shared link) also moves the map.
  useEffect(() => {
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [reveal]);
  const selectAndReveal = useCallback(
    (next: Selection) => {
      select(next);
      reveal();
    },
    [select, reveal],
  );
  const perform = useCallback(
    (action: MapAction) => {
      if (action.type !== "select") return;
      select(action.selection);
      if (action.reveal) reveal();
    },
    [select, reveal],
  );

  const submit = useCallback(
    (change: Change): string[] => {
      const problems = validateChange(change, model.validation);
      if (problems.length === 0) addChange(change);
      return problems;
    },
    [model.validation],
  );

  // What the map emphasises for the current selection.
  const { focusId, highlighted, dimOthers } = useMemo(() => {
    const set = new Set<string>();
    let focus: string | null = null;
    let dim = false;
    if (selection?.kind === "unit") {
      const link = model.links.get(selection.id)!;
      if (link.featureId) {
        focus = link.featureId;
        set.add(link.featureId);
      } else {
        for (const c of model.crosswalkByUnit.get(selection.id)!.candidates) {
          if (model.featureById.get(c.featureId)?.kind === "block" && shapeIds.has(c.featureId)) set.add(c.featureId);
        }
      }
    } else if (selection?.kind === "feature") {
      focus = selection.id;
      set.add(selection.id);
    } else if (selection?.kind === "territory") {
      dim = true;
      for (const unitId of model.territoryById.get(selection.id)!.unitIds) {
        const fid = model.links.get(unitId)!.featureId;
        if (fid && shapeIds.has(fid)) set.add(fid);
      }
    }
    return { focusId: focus, highlighted: set, dimOthers: dim };
  }, [selection, model, shapeIds]);

  // Representative pins. Their positions are the boundary layer's own label points (no position is invented), and
  // only a block with a drawn outline and an effective link from a row can hold one (see representatives.ts).
  const pinAnchors = useMemo(
    () => new Map<string, PinAnchor>(layer?.shapes.filter((s) => s.anchor && !s.featureId.startsWith("GD-")).map((s) => [s.featureId, s.anchor!]) ?? []),
    [layer],
  );
  // A selected sales territory shows its own blocks' pins; the state overview shows one ASM pin per territory.
  const territoryBlocks = useMemo(() => (selection?.kind === "territory" ? highlighted : null), [selection, highlighted]);
  const pinSet = useMemo(() => pinSetFor(context, territoryBlocks), [context, territoryBlocks]);
  const allPins = useMemo(() => pinsFor(model, pinAnchors, pinSet), [model, pinAnchors, pinSet]);
  const pins = pinsOn ? allPins : [];
  const navigatorPins: NavigatorPins | null = layer && allPins.length > 0 ? { kind: pinSet.mode === "territory" ? "territory" : "block", count: allPins.length } : null;
  const showUnit = useCallback((unitId: string) => selectAndReveal({ kind: "unit", id: unitId }), [selectAndReveal]);
  const showTerritory = useCallback((territoryId: string) => selectAndReveal({ kind: "territory", id: territoryId }), [selectAndReveal]);

  const stateOf = useCallback(
    (featureId: string): AllocationState => model.featureAllocation.get(featureId)?.state ?? "missing",
    [model],
  );
  const qualityOf = useCallback((featureId: string) => blockQuality(model, featureId), [model]);

  const describe = useCallback(
    (featureId: string) => {
      const feature = model.featureById.get(featureId);
      if (!feature) return { title: featureId, detail: "" };
      if (feature.kind === "district") {
        const blocks = model.districtRollup.get(featureId)?.blocks ?? 0;
        return { title: feature.name, detail: `District · ${STATE_NAME} · ${blocks} ${blocks === 1 ? "block" : "blocks"}` };
      }
      const allocation = model.featureAllocation.get(featureId)!;
      const district = model.featureById.get(feature.districtId!)?.name ?? "";
      return { title: feature.name, detail: `Block · ${district} district · ${ALLOCATION_STATE_LABEL[allocation.state]} · provisional outline` };
    },
    [model],
  );

  const onPickDistrict = useCallback((districtId: string) => selectAndReveal({ kind: "feature", id: districtId }), [selectAndReveal]);
  const renderNavigator = (variant: "rail" | "panel") => (
    <DistrictNavigator model={model} focusedId={context.districtId} pins={navigatorPins} variant={variant} onPick={onPickDistrict} onHover={setNavHover} />
  );

  const onFeatureClick = useCallback((featureId: string) => perform(actionForFeatureClick(model, context, featureId)), [model, context, perform]);
  const onBackgroundClick = useCallback(() => perform(actionForBackgroundClick(context, selection !== null)), [context, selection, perform]);
  const onEscape = useCallback(() => perform(actionForEscape(context, selection !== null)), [context, selection, perform]);
  const onBack = useCallback(() => perform({ type: "select", selection: parentSelection(context), reveal: true }), [context, perform]);
  const onCrumb = useCallback((crumb: Crumb) => perform({ type: "select", selection: crumb.selection, reveal: true }), [perform]);
  const onSearchPick = useCallback(
    (hit: SearchHit) => perform({ type: "select", selection: hit.kind === "district" ? { kind: "feature", id: hit.id } : selectionForFeature(model, hit.id), reveal: true }),
    [model, perform],
  );

  const districtName = context.districtId ? (model.featureById.get(context.districtId)?.name ?? null) : null;
  const backLabel = context.level === "state" ? null : context.level === "block" ? districtName : STATE_NAME;

  // Block outline coverage of the focused district: what is drawn, and what is missing (never "unallocated").
  const districtCoverage = useMemo(
    () => (context.districtId ? districtQuality(model, context.districtId, (id) => shapeIds.has(id)) : null),
    [context.districtId, model, shapeIds],
  );

  // A selection with no drawn boundary gets an explicit indicator on the map.
  const gapNotice = useMemo(() => {
    if (!layer) return null;
    if (selection?.kind === "unit") {
      const link = model.links.get(selection.id)!;
      if (link.featureId && shapeIds.has(link.featureId)) return null;
      const unit = model.unitById.get(selection.id)!;
      const reason = link.featureId
        ? (model.featureById.get(link.featureId)?.boundaryGap ?? "no outline in the layer")
        : model.crosswalkByUnit.get(selection.id)!.reason;
      return `“${unit.blockLabel.trim()}” has no boundary on this map. ${reason}`;
    }
    if (selection?.kind === "feature" && !shapeIds.has(selection.id)) {
      const feature = model.featureById.get(selection.id);
      if (feature) return `${feature.name} has no boundary on this map. ${feature.boundaryGap ?? "No outline in the layer."}`;
    }
    return null;
  }, [layer, selection, model, shapeIds]);

  const announcement = useMemo(() => {
    const where = context.level === "state" ? STATE_NAME : crumbs.map((c) => c.label).join(", ");
    if (!selection) return `Nothing selected. Map at ${where}.`;
    if (selection.kind === "unit") return `Selected row ${model.unitById.get(selection.id)?.blockLabel.trim()}. Map at ${where}.`;
    if (selection.kind === "feature") return `Selected official unit ${model.featureById.get(selection.id)?.name}. Map at ${where}.`;
    return `Selected sales territory ${model.territoryById.get(selection.id)?.label}.`;
  }, [selection, model, context.level, crumbs]);

  const openDetails = () => {
    setDetailsOpen(true);
    requestAnimationFrame(() => document.getElementById(detailsId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="mt-3 space-y-4" data-testid="workspace">
      <p role="status" className="sr-only">
        {announcement}
      </p>

      <div className={cn("@container grid gap-4 lg:gap-6", detailsOpen ? "lg:grid-cols-[minmax(0,1fr)_26rem] xl:grid-cols-[minmax(0,1fr)_30rem]" : "lg:grid-cols-[minmax(0,1fr)]")}>
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <MapWorkspace
            title="Territory map"
            rail={
              <aside
                aria-label="District navigator"
                data-testid="district-rail"
                className={cn("hidden w-64 shrink-0 flex-col border-r border-line bg-surface/80", detailsOpen ? RAIL_SHOWS_PANEL_OPEN : RAIL_SHOWS_PANEL_CLOSED)}
              >
                {renderNavigator("rail")}
              </aside>
            }
            toolbar={
              <MapToolbar
                crumbs={crumbs}
                context={context}
                backLabel={backLabel}
                onBack={onBack}
                onCrumb={onCrumb}
                layerMode={layerMode}
                onLayerMode={setLayerMode}
                searchIndex={searchIndex}
                districtName={districtName}
                onSearchPick={onSearchPick}
                detailsOpen={detailsOpen}
                onToggleDetails={() => setDetailsOpen((open) => !open)}
                detailsId={detailsId}
                pinCount={allPins.length}
                pinsOn={pinsOn}
                onTogglePins={() => setPinsOn((on) => !on)}
              />
            }
            status={
              layer ? (
                <>
                  {/* One line is always here, so the map is the same size whatever is selected: the hint at the state
                      level, the district's outline coverage inside a district. */}
                  {context.level === "state" ? (
                    mapTouched || selection !== null ? (
                      <p data-testid="map-summary">
                        {STATE_NAME}: {model.summary.blocks.withBoundary} of {model.summary.blocks.total} blocks in the reference list and {model.summary.districts.withBoundary} of {model.summary.districts.total} districts have provisional outlines.
                      </p>
                    ) : (
                      <p data-testid="map-hint">Click a district to open its blocks. Scroll or use + and − to zoom.</p>
                    )
                  ) : districtCoverage ? (
                    <p data-testid="map-district-coverage">
                      {districtCoverage.blocks === 0 ? (
                        <>
                          <strong className="font-semibold text-ink">No block outlines.</strong> The LGD lists no development blocks for {districtName}; urban wards are not in the data, so none are drawn.
                        </>
                      ) : (
                        <>
                          <strong className="font-semibold text-ink">
                            {districtCoverage.outlined} of {districtCoverage.blocks} block outlines.
                          </strong>{" "}
                          {districtCoverage.withoutOutline.length > 0
                            ? `${districtCoverage.withoutOutline.length} without an outline show as dotted gaps: missing geography, not unallocated.`
                            : "Every block in the reference list here has a provisional outline."}
                        </>
                      )}
                    </p>
                  ) : null}
                  {gapNotice ? (
                    <p role="status" data-testid="map-gap-notice" className="border-l-2 border-amber-400/60 pl-2 text-ink">
                      {gapNotice}
                    </p>
                  ) : null}
                </>
              ) : undefined
            }
            footer={
              <MapLegend
                meta={layer?.meta ?? null}
                layerMode={layerMode}
                pins={layer && pins.length > 0 ? { kind: pinSet.mode === "territory" ? "territory" : "block", count: pins.length } : null}
                coverage={{
                  districtsDrawn: model.summary.districts.withBoundary,
                  districtsTotal: model.summary.districts.total,
                  blocksDrawn: model.summary.blocks.withBoundary,
                  blocksTotal: model.summary.blocks.total,
                }}
              />
            }
          >
            <GeoMap
              load={load}
              model={model}
              context={context}
              layerMode={layerMode}
              stateOf={stateOf}
              qualityOf={qualityOf}
              highlighted={highlighted}
              focusId={focusId}
              dimOthers={dimOthers}
              describe={describe}
              revealToken={revealToken}
              onFeatureClick={onFeatureClick}
              onBackgroundClick={onBackgroundClick}
              onEscape={onEscape}
              pins={pins}
              onInteract={onMapInteract}
              onShowUnit={showUnit}
              onShowTerritory={showTerritory}
              hoverFeatureId={navHover}
            />
            {layer ? (
              <p
                role="status"
                data-testid="map-provisional"
                className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-navy-950/85 px-2 py-1 text-[0.6875rem] font-medium leading-4 text-amber-200 ring-1 ring-amber-400/40 backdrop-blur"
              >
                Provisional boundaries
              </p>
            ) : null}
            {selection ? (
              <button
                type="button"
                onClick={openDetails}
                className="absolute bottom-3 right-3 z-10 rounded-lg border border-line-strong bg-surface/90 px-3 py-1.5 text-xs font-medium text-ink shadow-lg hover:bg-surface-muted lg:hidden"
              >
                Details ↓
              </button>
            ) : null}
          </MapWorkspace>
        </div>

        <div id={detailsId} className={cn("min-w-0 scroll-mt-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start", !detailsOpen && "hidden")}>
          <div className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:rounded-2xl">
            <DetailsPanel
              model={model}
              selection={selection}
              shapeIds={shapeIds}
              layerReady={load.status === "ready"}
              changes={local.changes}
              onSelect={selectAndReveal}
              submit={submit}
              onUndoLast={removeLastChange}
              districtList={renderNavigator("panel")}
            />
          </div>
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <AreaList model={model} selection={selection} shapeIds={shapeIds} layerReady={load.status === "ready"} onSelect={selectAndReveal} />
        </div>
      </div>

      <LocalChangesBar
        count={local.changes.length}
        persistent={local.persistent}
        rejected={model.rejectedChanges}
        storedProblem={local.problem}
      />
    </div>
  );
}
