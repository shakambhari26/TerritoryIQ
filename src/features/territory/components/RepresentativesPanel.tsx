"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { PIN_COLOR } from "../map-style";
import { NAME_NOTICE, PROVISIONAL_NOTICE, type PinPerson, type PinRecord, type RepresentativePin } from "../representatives";

interface RepresentativesPanelProps {
  pins: readonly RepresentativePin[];
  /** Compact maps get a bottom sheet instead of a side panel. */
  compact: boolean;
  /** Distance from the map's bottom edge to keep clear (the pan pad), for the sheet. */
  sheetBottom: number;
  onClose: () => void;
  onShowUnit: (unitId: string) => void;
  onShowTerritory: (territoryId: string) => void;
  /** Present for a group of pins: moves the map so they separate. */
  onZoomTo?: () => void;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Marks what the workbook does not say. Colour is never the only cue: the word is there. */
function Implied({ children }: { children: string }) {
  return (
    <p className="mt-1.5 flex gap-1.5 text-xs leading-5 text-ink-muted">
      <span className="mt-0.5 h-4 shrink-0 rounded border border-line-strong px-1 text-[0.625rem] font-semibold uppercase leading-[0.875rem] tracking-wide text-ink">
        Implied
      </span>
      <span>{capitalise(children.replace(/^Implied:\s*/, ""))}</span>
    </p>
  );
}

function Person({ person }: { person: PinPerson }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 py-0.5">
      <span className="w-20 shrink-0 text-xs font-medium text-ink-subtle">{person.slotLabel}</span>
      {person.vacant ? (
        <span className="text-sm italic text-ink-muted">Vacant (as written in the workbook)</span>
      ) : (
        <span className="min-w-0 break-words text-sm font-medium text-ink">{person.name}</span>
      )}
      {person.note ? <span className="basis-full pl-[5.5rem] text-xs text-ink-muted">{person.note}</span> : null}
    </li>
  );
}

function Record({ pin, record, onShowUnit }: { pin: RepresentativePin; record: PinRecord; onShowUnit: (unitId: string) => void }) {
  const territoryPin = pin.kind === "territory";
  return (
    <li className="rounded-lg border border-line bg-surface-muted/60 px-3 py-2.5">
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs leading-5">
        <dt className="text-ink-subtle">Territory</dt>
        <dd className="min-w-0 break-words text-ink">{record.territoryLabel}</dd>
        {territoryPin ? (
          <>
            <dt className="text-ink-subtle">Listed on</dt>
            <dd className="text-ink">{record.blockLabel}</dd>
          </>
        ) : (
          <>
            <dt className="text-ink-subtle">Block / area</dt>
            <dd className="min-w-0 break-words text-ink">
              {record.blockLabel}
              {record.blockLabel !== record.blockName ? <span className="text-ink-muted"> (official: {record.blockName})</span> : null}
            </dd>
            <dt className="text-ink-subtle">District</dt>
            <dd className="text-ink">{record.districtName}</dd>
          </>
        )}
      </dl>
      <ul className="mt-2 border-t border-line pt-1.5" aria-label={territoryPin ? "ASM" : `People listed for ${record.blockLabel}`}>
        {record.people.map((person, index) => (
          <Person key={`${person.slotLabel}-${index}`} person={person} />
        ))}
      </ul>
      {record.reportingImplied ? <Implied>{record.reportingImplied}</Implied> : null}
      {!territoryPin ? (
        <button
          type="button"
          onClick={() => onShowUnit(record.unitId)}
          className="mt-2 inline-flex h-8 items-center rounded-md border border-line-strong px-2.5 text-xs font-medium text-ink hover:bg-surface-muted"
        >
          Show this row in the details panel
        </button>
      ) : null}
    </li>
  );
}

/**
 * What a pin stands for, opened from the map. A non-modal dialog: it takes focus when it opens, Escape or the
 * close button closes it (the map returns focus to the pin), and the map stays usable behind it. Every pin keeps
 * its own notices: what is implied, what is undecided, what is contested, and that the position is provisional.
 */
export function RepresentativesPanel({ pins, compact, sheetBottom, onClose, onShowUnit, onShowTerritory, onZoomTo }: RepresentativesPanelProps) {
  const uid = useId();
  const ref = useRef<HTMLDivElement>(null);
  const key = pins.map((p) => p.id).join("|");

  // Take focus when the panel opens or its contents change, so a screen reader reads it and the keyboard is inside.
  useEffect(() => {
    ref.current?.focus();
  }, [key]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keys typed in the panel are the panel's: arrows scroll it and must not also pan the map behind it.
    event.stopPropagation();
    if (event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  };

  const people = pins.reduce((n, p) => n + p.records.length, 0);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${uid}-title`}
      aria-describedby={`${uid}-notice`}
      tabIndex={-1}
      data-testid="representatives-panel"
      data-pin-ids={key}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className="absolute z-20 flex flex-col overflow-hidden rounded-xl border bg-surface shadow-2xl outline-none"
      style={{
        borderColor: PIN_COLOR.body,
        ...(compact
          ? { left: 12, right: 62, bottom: sheetBottom, maxHeight: `calc(100% - ${sheetBottom + 52}px)` }
          : { top: 12, right: 66, bottom: 12, width: "min(24rem, calc(100% - 9rem))" }),
      }}
    >
      <header className="flex items-start justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="min-w-0">
          <h3 id={`${uid}-title`} className="text-sm font-semibold text-ink">
            {pins.length > 1 ? `${pins.length} representative pins` : pins[0].kind === "territory" ? "Territory ASM" : "Block representatives"}
          </h3>
          <p className="text-xs text-ink-muted">
            {people} {people === 1 ? "workbook record" : "workbook records"} · provisional
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="representatives-close"
          aria-label="Close representatives panel"
          className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface-muted"
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        <p id={`${uid}-notice`} className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5 text-[0.6875rem] leading-4 text-amber-100 sm:text-xs sm:leading-5">
          {PROVISIONAL_NOTICE} {NAME_NOTICE}
        </p>
        {onZoomTo ? (
          <button
            type="button"
            onClick={onZoomTo}
            data-testid="representatives-zoom"
            className="inline-flex h-8 items-center rounded-md border border-line-strong px-2.5 text-xs font-medium text-ink hover:bg-surface-muted"
          >
            Zoom the map to these pins
          </button>
        ) : null}
        {pins.map((pin) => (
          <details key={pin.id} open={pins.length === 1} className="group rounded-lg" data-testid="representatives-group" data-pin-id={pin.id}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md py-1 text-sm font-semibold text-ink">
              <span className="min-w-0 break-words">{pin.title}</span>
              <span aria-hidden="true" className="text-ink-subtle transition-transform group-open:rotate-90 motion-reduce:transition-none">
                ›
              </span>
            </summary>
            <ul className="mt-1.5 space-y-2" aria-label={`Records for ${pin.title}`}>
              {pin.records.map((record, index) => (
                <Record key={`${record.unitId}-${index}`} pin={pin} record={record} onShowUnit={onShowUnit} />
              ))}
            </ul>
            <ul className="mt-2 space-y-1">
              {pin.notices
                .filter((notice) => notice !== PROVISIONAL_NOTICE && notice !== NAME_NOTICE)
                .map((notice) =>
                  notice.startsWith("Implied:") ? (
                    <li key={notice}>
                      <Implied>{notice}</Implied>
                    </li>
                  ) : (
                    <li key={notice} className="text-xs leading-5 text-amber-100">
                      <span className="font-semibold">Note: </span>
                      {notice}
                    </li>
                  ),
                )}
            </ul>
            {pin.kind === "territory" ? (
              <button
                type="button"
                onClick={() => onShowTerritory(pin.territoryIds[0])}
                data-testid="representatives-show-territory"
                className="mt-2.5 inline-flex h-8 items-center rounded-md px-2.5 text-xs font-semibold"
                style={{ background: PIN_COLOR.body, color: PIN_COLOR.core }}
              >
                Show this territory&apos;s blocks and pins
              </button>
            ) : null}
          </details>
        ))}
      </div>
    </div>
  );
}
