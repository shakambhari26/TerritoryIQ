"use client";

import { useDeferredValue, useId, useMemo, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { searchFeatures, type SearchEntry, type SearchHit } from "../search";

interface MapSearchProps {
  index: readonly SearchEntry[];
  /** The district the map is focused on, or null at state level. */
  districtId: string | null;
  districtName: string | null;
  onPick: (hit: SearchHit) => void;
}

/**
 * Searches official district and block names. Results are told apart by district (two blocks may share a
 * name) and carry the internal ID, so a pick selects that exact feature. Inside a district the search is
 * limited to that district's blocks until the box is unticked.
 */
export function MapSearch({ index, districtId, districtName, onPick }: MapSearchProps) {
  const uid = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [everywhere, setEverywhere] = useState(false);
  const deferred = useDeferredValue(query);
  const scoped = districtId !== null && !everywhere;

  const hits = useMemo(
    () => searchFeatures(index, deferred, { districtId, onlyDistrict: scoped }, 10),
    [index, deferred, districtId, scoped],
  );
  const showList = open && query.trim().length > 0;
  const activeHit = hits[Math.min(active, hits.length - 1)];

  const pick = (hit: SearchHit) => {
    onPick(hit);
    setQuery("");
    setOpen(false);
    setActive(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === "Enter" && showList && activeHit) {
      event.preventDefault();
      pick(activeHit);
    } else if (event.key === "Escape" && (showList || query)) {
      // Close the list first; a second Escape reaches the map.
      event.preventDefault();
      event.stopPropagation();
      if (showList) setOpen(false);
      else setQuery("");
    }
  };

  return (
    <div className="relative w-full min-w-0 sm:w-64" data-testid="map-search">
      <label htmlFor={`${uid}-q`} className="sr-only">
        Search districts and blocks
      </label>
      <div className="relative">
        <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="16" height="16" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13.5 13.5 3.5 3.5" />
        </svg>
        <input
          id={`${uid}-q`}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${uid}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && activeHit ? `${uid}-opt-${activeHit.id}` : undefined}
          autoComplete="off"
          placeholder={scoped && districtName ? `Search blocks in ${districtName}` : "Search district or block"}
          className="block h-9 w-full rounded-lg border border-line-strong bg-surface pl-8 pr-2 text-sm text-ink placeholder:text-ink-subtle focus:border-accent-ink"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      {showList ? (
        <div className="absolute left-0 right-0 top-10 z-30 overflow-hidden rounded-lg border border-line bg-surface shadow-lg sm:w-80">
        {districtId ? (
          <label className="flex items-center gap-1.5 border-b border-line bg-surface-muted px-3 py-1.5 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={!everywhere}
              // Keep the focus (and so the open result list) in the search box while the scope is changed.
              onMouseDown={(e) => e.preventDefault()}
              onChange={(e) => setEverywhere(!e.target.checked)}
              className="h-3.5 w-3.5 accent-accent-ink"
            />
            Only in {districtName}
          </label>
        ) : null}
        <ul
          id={`${uid}-list`}
          role="listbox"
          aria-label="Search results"
          data-testid="map-search-results"
          className="max-h-72 overflow-y-auto py-1"
        >
          {hits.length === 0 ? (
            <li role="presentation" className="px-3 py-2 text-sm text-ink-muted">
              No district or block matches.
            </li>
          ) : (
            hits.map((hit, i) => (
              <li
                key={hit.id}
                id={`${uid}-opt-${hit.id}`}
                role="option"
                aria-selected={i === Math.min(active, hits.length - 1)}
                data-feature-id={hit.id}
                // mousedown, not click: the input's blur would close the list before a click lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(hit);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn("cursor-pointer px-3 py-1.5 text-sm", i === Math.min(active, hits.length - 1) ? "bg-accent-soft" : "hover:bg-surface-muted")}
              >
                <span className="font-medium text-ink">{hit.name}</span>
                <span className="block text-xs text-ink-muted">
                  {hit.kind === "district" ? "District" : `Block · ${hit.districtName} district`}
                  {hit.drawn ? "" : " · no outline"}
                </span>
              </li>
            ))
          )}
        </ul>
        </div>
      ) : null}
    </div>
  );
}
