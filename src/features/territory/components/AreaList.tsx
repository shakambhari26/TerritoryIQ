"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { LINK_LABEL, formatCount } from "../format";
import type { TerritoryModel } from "../model";
import { ALLOCATION_STATES, ALLOCATION_STATE_LABEL, type AllocationState, type Selection } from "../types";
import { StateChip } from "./state-style";
import { buttonClass, inputClass } from "./ui";

type Mode = "rows" | "blocks";
type OutlineFilter = "any" | "with" | "without";

interface AreaListProps {
  model: TerritoryModel;
  selection: Selection;
  shapeIds: ReadonlySet<string>;
  layerReady: boolean;
  onSelect: (selection: Selection) => void;
}

interface Item {
  key: string;
  selection: NonNullable<Selection>;
  title: string;
  subtitle: string;
  state: AllocationState;
  outline: boolean;
  haystack: string;
  territoryId: string | null;
}

/**
 * The polygon-independent way to find and select areas. It lists every
 * workbook row and every official block whether or not a boundary exists, and
 * says plainly which have none, so the work does not depend on the map.
 */
export function AreaList({ model, selection, shapeIds, layerReady, onSelect }: AreaListProps) {
  const uid = useId();
  const [mode, setMode] = useState<Mode>("rows");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<AllocationState | "any">("any");
  const [outline, setOutline] = useState<OutlineFilter>("any");
  const [territory, setTerritory] = useState("any");
  const deferredQuery = useDeferredValue(query);

  const items = useMemo((): Item[] => {
    if (mode === "rows") {
      return model.dataset.units.map((unit) => {
        const link = model.links.get(unit.id)!;
        const allocation = model.unitAllocation.get(unit.id)!;
        const territoryLabel = model.territoryById.get(unit.salesTerritoryId)!.label;
        const names = model.effective.get(unit.id)!.slots.flatMap((s) => s.names).join(" ");
        return {
          key: unit.id,
          selection: { kind: "unit" as const, id: unit.id },
          title: unit.blockLabel.trim(),
          subtitle: `${territoryLabel} · row ${unit.sourceRow} · ${LINK_LABEL[link.status].toLowerCase()}`,
          state: allocation.state,
          outline: link.featureId ? shapeIds.has(link.featureId) : false,
          haystack: `${unit.blockLabel} ${territoryLabel} ${names} ${unit.id}`.toLowerCase(),
          territoryId: unit.salesTerritoryId,
        };
      });
    }
    return model.dataset.features
      .filter((f) => f.kind === "block")
      .map((feature) => {
        const districtName = model.featureById.get(feature.districtId!)?.name ?? "";
        return {
          key: feature.id,
          selection: { kind: "feature" as const, id: feature.id },
          title: feature.name,
          subtitle: `${districtName} · LGD ${feature.lgdCode}`,
          state: model.featureAllocation.get(feature.id)!.state,
          outline: shapeIds.has(feature.id),
          haystack: `${feature.name} ${districtName} ${feature.lgdCode} ${feature.id}`.toLowerCase(),
          territoryId: null,
        };
      });
  }, [mode, model, shapeIds]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return items.filter(
      (item) =>
        (state === "any" || item.state === state) &&
        (outline === "any" || (outline === "with") === item.outline) &&
        (territory === "any" || mode === "blocks" || item.territoryId === territory) &&
        (q === "" || item.haystack.includes(q)),
    );
  }, [items, deferredQuery, state, outline, territory, mode]);

  const selectedKey = selection && ((selection.kind === "unit" && mode === "rows") || (selection.kind === "feature" && mode === "blocks")) ? selection.id : null;

  return (
    <Card as="section" aria-label="Areas" className="flex flex-col" data-testid="area-list">
      <header className="space-y-3 border-b border-line px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Areas</h2>
          <div role="group" aria-label="List contents" className="inline-flex overflow-hidden rounded-md border border-line-strong text-xs font-medium">
            {(
              [
                ["rows", `Workbook rows (${model.dataset.units.length})`],
                ["blocks", `Official blocks (${model.summary.blocks.total})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={cn("px-2.5 py-1.5", mode === value ? "bg-navy-950 text-on-navy" : "bg-surface text-ink hover:bg-surface-muted")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor={`${uid}-q`} className="sr-only">
            Search areas, territories or people
          </label>
          <input
            id={`${uid}-q`}
            type="search"
            className={inputClass}
            placeholder={mode === "rows" ? "Search block, territory or person" : "Search block or district"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${uid}-state`} className="sr-only">
              Filter by allocation state
            </label>
            <select id={`${uid}-state`} className={inputClass} value={state} onChange={(e) => setState(e.target.value as AllocationState | "any")}>
              <option value="any">Any state</option>
              {ALLOCATION_STATES.map((s) => (
                <option key={s} value={s}>
                  {ALLOCATION_STATE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-outline`} className="sr-only">
              Filter by boundary availability
            </label>
            <select id={`${uid}-outline`} className={inputClass} value={outline} onChange={(e) => setOutline(e.target.value as OutlineFilter)}>
              <option value="any">Outline: any</option>
              <option value="with">Has an outline</option>
              <option value="without">No boundary available</option>
            </select>
          </div>
          {mode === "rows" ? (
            <div className="col-span-2">
              <label htmlFor={`${uid}-territory`} className="sr-only">
                Filter by sales territory
              </label>
              <select id={`${uid}-territory`} className={inputClass} value={territory} onChange={(e) => setTerritory(e.target.value)}>
                <option value="any">All sales territories</option>
                {model.dataset.salesTerritories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
          <p role="status" data-testid="area-count">
            Showing {formatCount(filtered.length)} of {formatCount(items.length)}
            {!layerReady ? " · boundary layer not loaded" : ""}
          </p>
          {state !== "any" || outline !== "any" || territory !== "any" || query !== "" ? (
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                setState("any");
                setOutline("any");
                setTerritory("any");
                setQuery("");
              }}
            >
              Reset filters
            </button>
          ) : null}
        </div>
      </header>

      <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto" data-testid="area-items">
        {filtered.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              aria-current={selectedKey === item.key ? "true" : undefined}
              data-area-id={item.key}
              data-state={item.state}
              onClick={() => onSelect(item.selection)}
              className={cn(
                "flex w-full items-start justify-between gap-3 px-5 py-2.5 text-left hover:bg-surface-muted",
                selectedKey === item.key && "bg-gold-50 shadow-[inset_3px_0_0_var(--color-gold-400)]",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {item.subtitle}
                  {item.outline ? "" : " · no boundary"}
                </span>
              </span>
              <StateChip state={item.state} />
            </button>
          </li>
        ))}
        {filtered.length === 0 ? <li className="px-5 py-6 text-sm text-ink-muted">Nothing matches these filters.</li> : null}
      </ul>
    </Card>
  );
}
