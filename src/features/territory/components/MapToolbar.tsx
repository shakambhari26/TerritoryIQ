"use client";

import { cn } from "@/lib/cn";
import { LEVEL_LABEL, type Crumb, type MapContext } from "../map-level";
import { MAP_LAYERS, type MapLayerMode } from "../map-style";
import type { SearchEntry, SearchHit } from "../search";
import { MapSearch } from "./MapSearch";

interface MapToolbarProps {
  crumbs: readonly Crumb[];
  context: MapContext;
  /** What the "back" action lands on, or null at state level. */
  backLabel: string | null;
  onBack: () => void;
  onCrumb: (crumb: Crumb) => void;
  layerMode: MapLayerMode;
  onLayerMode: (mode: MapLayerMode) => void;
  searchIndex: readonly SearchEntry[];
  districtName: string | null;
  onSearchPick: (hit: SearchHit) => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  detailsId: string;
  /** Representative pins: how many the current view offers, and whether they are drawn. */
  pinCount: number;
  pinsOn: boolean;
  onTogglePins: () => void;
}

/**
 * The map's header: where the map is (breadcrumb and level), a way back up, the layer switch, search, and the
 * toggle for the details panel. Going down a level is a click on the map or a search pick; going up is here.
 */
export function MapToolbar({
  crumbs,
  context,
  backLabel,
  onBack,
  onCrumb,
  layerMode,
  onLayerMode,
  searchIndex,
  districtName,
  onSearchPick,
  detailsOpen,
  onToggleDetails,
  detailsId,
  pinCount,
  pinsOn,
  onTogglePins,
}: MapToolbarProps) {
  return (
    <div className="flex flex-col gap-2" data-testid="map-toolbar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {backLabel ? (
          <button
            type="button"
            onClick={onBack}
            data-testid="map-back"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-sm font-medium text-ink hover:bg-surface-muted"
          >
            <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4 6 10l6 6" />
            </svg>
            <span>
              <span className="sr-only">Back to </span>
              {backLabel}
            </span>
          </button>
        ) : null}
        <nav aria-label="Map location" className="min-w-0">
          <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm" data-testid="map-breadcrumb">
            {crumbs.map((crumb, i) => (
              <li key={crumb.key} className="flex min-w-0 items-center gap-1.5">
                {i > 0 ? (
                  <span aria-hidden="true" className="text-ink-subtle">
                    ›
                  </span>
                ) : null}
                {crumb.current ? (
                  <span aria-current="page" className="truncate font-semibold text-ink">
                    {crumb.label}
                  </span>
                ) : (
                  <button type="button" onClick={() => onCrumb(crumb)} className="truncate rounded text-accent-ink underline-offset-2 hover:underline">
                    {crumb.label}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <span
          data-testid="map-level"
          className="rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide text-ink-muted"
        >
          {LEVEL_LABEL[context.level]}
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <div role="group" aria-label="Map layer" className="inline-flex w-full overflow-hidden rounded-lg border border-line-strong text-xs font-medium sm:w-auto" data-testid="layer-switch">
          {MAP_LAYERS.map((layer) => (
            <button
              key={layer.value}
              type="button"
              aria-pressed={layerMode === layer.value}
              title={layer.hint}
              onClick={() => onLayerMode(layer.value)}
              className={cn(
                "h-9 flex-1 px-2.5 sm:flex-none",
                layerMode === layer.value ? "bg-navy-700 text-on-navy shadow-[inset_0_-2px_0_var(--color-ember)]" : "bg-surface text-ink hover:bg-surface-muted",
              )}
            >
              {layer.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={pinsOn}
          onClick={onTogglePins}
          data-testid="pins-toggle"
          title={pinCount === 0 ? "No representative pins are supported by the data for this view" : "Show or hide representative pins"}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium",
            pinsOn ? "border-ember/70 bg-ember/10 text-ink" : "border-line-strong bg-surface text-ink hover:bg-surface-muted",
          )}
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 28 36" width="10" height="13" className="shrink-0 overflow-visible">
            <path d="M14 35C14 35 3 22.5 3 13.5a11 11 0 1 1 22 0C25 22.5 14 35 14 35Z" fill={pinsOn ? "var(--color-ember)" : "none"} stroke="var(--color-ember)" strokeWidth="2.5" />
          </svg>
          <span>Representatives</span>
          <span className="tabular-nums text-ink-subtle">{pinCount}</span>
        </button>
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:flex-none">
        <MapSearch index={searchIndex} districtId={context.districtId} districtName={districtName} onPick={onSearchPick} />
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={onToggleDetails}
          data-testid="details-toggle"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 sm:ml-2 rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink hover:bg-surface-muted"
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
            <path d="M12.5 3.5v13" />
          </svg>
          <span className="max-sm:sr-only">{detailsOpen ? "Hide details" : "Show details"}</span>
        </button>
        </div>
      </div>
    </div>
  );
}
