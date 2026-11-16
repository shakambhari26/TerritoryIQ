"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { bandFor, districtAverage, STAFF_BANDS } from "../staffing";
import type { GlobeManifest } from "../types";

/**
 * Sales team insights: headline numbers, then ONE chart the viewer picks from a dropdown, for all of West Bengal or one
 * district. All counts come from the team data (no names). Every bar has a hover tooltip and a value label; clicking a
 * district or block bar flies the globe there.
 */

type View = "hire" | "headcount" | "nofield" | "vacant" | "stretch";
const VIEWS: Array<{ id: View; label: string; question: string }> = [
  { id: "hire", label: "Where to hire first", question: "People per block, fewest first. Red is short of people." },
  { id: "headcount", label: "Blocks by number of people", question: "How many blocks have 1, 2, 3 … people." },
  { id: "nofield", label: "Blocks with no field staff", question: "Blocks where only the Area Sales Manager is listed." },
  { id: "vacant", label: "Vacant positions", question: "Positions the sheet marks as vacant." },
  { id: "stretch", label: "How stretched is the field team", question: "Field staff by how many places each one covers." },
];
/** Single-series magnitude colour (sequential blue, validated). */
const SINGLE = "#3987e5";

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

interface Bar {
  id: string;
  label: string;
  value: number;
  display: string;
  colour: string;
  tip: ReactNode;
  onClick?: () => void;
}

function TipBox({ tip }: { tip: Tip | null }) {
  return tip ? (
    <div role="tooltip" className="pointer-events-none absolute z-20 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-5 text-white shadow-float" style={{ left: tip.x, top: tip.y - 10 }}>
      {tip.content}
    </div>
  ) : null;
}

const hostBox = (el: Element) => (el.closest("[data-tip-host]") as HTMLElement).getBoundingClientRect();

/** A horizontal bar chart: label, bar, value. An optional reference line (e.g. the state average). */
function HBars({ bars, max, reference }: { bars: Bar[]; max: number; reference?: { value: number; label: string } }) {
  const [tip, setTip] = useState<Tip | null>(null);
  if (!bars.length) return <p className="py-6 text-center text-sm text-ink-muted">Nothing to show here.</p>;
  return (
    <div className="relative" data-tip-host>
      <ul className="space-y-1">
        {bars.map((bar) => (
          <li key={bar.id}>
            <button
              type="button"
              onClick={bar.onClick}
              disabled={!bar.onClick}
              className="group grid w-full grid-cols-[minmax(6rem,10rem)_1fr_4.5rem] items-center gap-3 rounded-md py-0.5 text-left"
              onMouseMove={(event) => {
                const host = hostBox(event.currentTarget);
                setTip({ x: event.clientX - host.left, y: event.clientY - host.top, content: bar.tip });
              }}
              onMouseLeave={() => setTip(null)}
              onFocus={(event) => {
                const host = hostBox(event.currentTarget);
                const box = event.currentTarget.getBoundingClientRect();
                setTip({ x: box.left - host.left + box.width / 2, y: box.top - host.top, content: bar.tip });
              }}
              onBlur={() => setTip(null)}
            >
              <span className="truncate text-xs text-ink group-enabled:group-hover:text-primary-ink group-enabled:group-hover:underline">{bar.label}</span>
              <span className="relative h-4">
                <span className="absolute inset-y-0 left-0 rounded-r transition-[width] duration-300" style={{ width: `${max ? (bar.value / max) * 100 : 0}%`, backgroundColor: bar.colour }} />
                {reference ? <span aria-hidden="true" className="absolute -inset-y-1 w-0.5 bg-ink/60" style={{ left: `${(reference.value / max) * 100}%` }} /> : null}
              </span>
              <span className="text-right text-xs tabular-nums text-ink">{bar.display}</span>
            </button>
          </li>
        ))}
      </ul>
      {reference ? (
        <p className="mt-2 flex items-center gap-2 text-[0.6875rem] text-ink-muted">
          <span aria-hidden="true" className="inline-block h-3 w-0.5 bg-ink/60" /> {reference.label}
        </p>
      ) : null}
      <TipBox tip={tip} />
    </div>
  );
}

/** A column chart for a distribution (x = a count, y = how many). */
function Columns({ cols, xLabel }: { cols: Array<{ label: string; value: number; colour: string; tip: string }>; xLabel: string }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const top = Math.max(...cols.map((c) => c.value), 1);
  return (
    <div className="relative" data-tip-host>
      <div className="flex h-48 items-end gap-2" role="list" aria-label={xLabel}>
        {cols.map((c) => (
          <div key={c.label} role="listitem" className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[0.6875rem] tabular-nums text-ink">{c.value || ""}</span>
            <span
              tabIndex={0}
              aria-label={c.tip}
              className="w-full rounded-t outline-none transition-[height] duration-300 focus-visible:ring-2 focus-visible:ring-ink"
              style={{ height: `${(c.value / top) * 100}%`, minHeight: c.value ? 2 : 0, backgroundColor: c.colour }}
              onMouseMove={(event) => {
                const host = hostBox(event.currentTarget);
                setTip({ x: event.clientX - host.left, y: event.clientY - host.top, content: c.tip });
              }}
              onMouseLeave={() => setTip(null)}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 border-t border-line pt-1">
        {cols.map((c) => (
          <span key={c.label} className="flex-1 text-center text-[0.6875rem] text-ink-muted">
            {c.label}
          </span>
        ))}
      </div>
      <p className="mt-1 text-center text-[0.6875rem] text-ink-muted">{xLabel}</p>
      <TipBox tip={tip} />
    </div>
  );
}

export function TeamInsights({
  manifest,
  onSelectDistrict,
  onSelectBlock,
  disabled,
}: {
  manifest: GlobeManifest;
  onSelectDistrict: (id: string) => void;
  onSelectBlock: (id: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  const [view, setView] = useState<View>("hire");
  const [scope, setScope] = useState<string>(""); // "" = all of West Bengal, else a district ID

  const districts = useMemo(() => manifest.districts.filter((d) => d.blockCount > 0).sort((a, b) => a.name.localeCompare(b.name)), [manifest.districts]);
  const scopeDistrict = scope ? (manifest.districts.find((d) => d.id === scope) ?? null) : null;
  const blocks = useMemo(() => (scope ? manifest.blocks.filter((b) => b.districtId === scope) : manifest.blocks), [manifest.blocks, scope]);
  const where = scopeDistrict ? scopeDistrict.name : "West Bengal";

  const stateAverage = manifest.blocks.reduce((n, b) => n + b.staff, 0) / Math.max(manifest.blocks.length, 1);
  const fieldPerBlock = blocks.reduce((n, b) => n + b.fieldStaff, 0) / Math.max(blocks.length, 1);
  const noField = blocks.filter((b) => b.fieldStaff === 0).length;
  const vacant = blocks.reduce((n, b) => n + b.vacancies, 0);
  const people = scopeDistrict ? scopeDistrict.staff : (manifest.meta.sheet?.staff ?? 0);

  const districtRows = useMemo(
    () =>
      districts.map((d) => {
        const mine = manifest.blocks.filter((b) => b.districtId === d.id);
        return {
          d,
          average: districtAverage(d, manifest.blocks) ?? 0,
          thin: mine.filter((b) => b.staff <= 2).length,
          noField: mine.filter((b) => b.fieldStaff === 0).length,
          vacant: mine.reduce((n, b) => n + b.vacancies, 0),
          blocks: mine.length,
        };
      }),
    [districts, manifest.blocks],
  );
  const worst = [...districtRows].sort((a, b) => a.average - b.average)[0];
  const toDistrict = (districtId: string) => (disabled ? undefined : () => onSelectDistrict(districtId));
  const toBlock = (blockId: string) => (disabled ? undefined : () => onSelectBlock(blockId));

  let chart: ReactNode;
  if (view === "hire") {
    if (scopeDistrict) {
      const bars: Bar[] = [...blocks]
        .sort((a, b) => a.staff - b.staff || a.name.localeCompare(b.name))
        .map((b) => ({
          id: b.id,
          label: b.name,
          value: b.staff,
          display: `${b.staff} ${b.staff === 1 ? "person" : "people"}`,
          colour: bandFor(b.staff).colour,
          tip: (
            <>
              <strong>{b.name}</strong>
              <br />
              {b.staff} people · {b.fieldStaff} field staff{b.vacancies ? ` · ${b.vacancies} vacant` : ""}
            </>
          ),
          onClick: toBlock(b.id),
        }));
      chart = <HBars bars={bars} max={Math.max(...blocks.map((b) => b.staff), 5)} reference={{ value: stateAverage, label: `State average ${stateAverage.toFixed(1)} people per block` }} />;
    } else {
      const bars: Bar[] = [...districtRows]
        .sort((a, b) => a.average - b.average)
        .map((r) => ({
          id: r.d.id,
          label: r.d.name,
          value: r.average,
          display: r.average.toFixed(1),
          colour: bandFor(r.average).colour,
          tip: (
            <>
              <strong>{r.d.name}</strong>
              <br />
              {r.average.toFixed(1)} people per block · {r.d.staff} people · {r.blocks} blocks
              <br />
              {r.thin} blocks with 1–2 people · {r.noField} with no field staff
            </>
          ),
          onClick: toDistrict(r.d.id),
        }));
      chart = <HBars bars={bars} max={Math.max(...districtRows.map((r) => r.average), 5)} reference={{ value: stateAverage, label: `State average ${stateAverage.toFixed(1)} · bar colour = the map colour` }} />;
    }
  } else if (view === "headcount") {
    const cols = Array.from({ length: 8 }, (_, i) => {
      const n = i + 1;
      const value = blocks.filter((b) => (n === 8 ? b.staff >= 8 : b.staff === n)).length;
      return { label: n === 8 ? "8+" : String(n), value, colour: bandFor(n).colour, tip: `${value} blocks with ${n === 8 ? "8 or more" : n} ${n === 1 ? "person" : "people"}` };
    });
    chart = <Columns cols={cols} xLabel="people in the block (colour = the map colour)" />;
  } else if (view === "nofield") {
    if (scopeDistrict) {
      const list = blocks.filter((b) => b.fieldStaff === 0);
      chart = list.length ? (
        <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
          {list.map((b) => (
            <li key={b.id}>
              <button type="button" disabled={disabled} onClick={() => onSelectBlock(b.id)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-muted">
                <span className="font-medium text-ink">{b.name}</span>
                <span className="text-xs text-ink-muted">Area Sales Manager only</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-ink-muted">Every block in {where} has field staff.</p>
      );
    } else {
      const bars: Bar[] = districtRows
        .filter((r) => r.noField > 0)
        .sort((a, b) => b.noField - a.noField)
        .map((r) => ({
          id: r.d.id,
          label: r.d.name,
          value: r.noField,
          display: `${r.noField} of ${r.blocks}`,
          colour: SINGLE,
          tip: (
            <>
              <strong>{r.d.name}</strong>
              <br />
              {r.noField} of {r.blocks} blocks have no field staff
            </>
          ),
          onClick: toDistrict(r.d.id),
        }));
      chart = <HBars bars={bars} max={Math.max(...bars.map((b) => b.value), 1)} />;
    }
  } else if (view === "vacant") {
    const bars: Bar[] = scopeDistrict
      ? blocks
          .filter((b) => b.vacancies > 0)
          .sort((a, b) => b.vacancies - a.vacancies)
          .map((b) => ({
            id: b.id,
            label: b.name,
            value: b.vacancies,
            display: String(b.vacancies),
            colour: SINGLE,
            tip: (
              <>
                <strong>{b.name}</strong>
                <br />
                {b.vacancies} vacant {b.vacancies === 1 ? "position" : "positions"}
              </>
            ),
            onClick: toBlock(b.id),
          }))
      : districtRows
          .filter((r) => r.vacant > 0)
          .sort((a, b) => b.vacant - a.vacant)
          .map((r) => ({
            id: r.d.id,
            label: r.d.name,
            value: r.vacant,
            display: String(r.vacant),
            colour: SINGLE,
            tip: (
              <>
                <strong>{r.d.name}</strong>
                <br />
                {r.vacant} vacant positions
              </>
            ),
            onClick: toDistrict(r.d.id),
          }));
    chart = bars.length ? <HBars bars={bars} max={Math.max(...bars.map((b) => b.value), 1)} /> : <p className="py-6 text-center text-sm text-ink-muted">No vacant positions in {where}.</p>;
  } else {
    const raw = manifest.meta.sheet?.spread ?? [];
    const cols = Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      const value = n < 10 ? (raw[n] ?? 0) : raw.slice(10).reduce((a, b) => a + (b ?? 0), 0);
      const label = n < 10 ? String(n) : "10+";
      return { label, value, colour: SINGLE, tip: `${value} ${value === 1 ? "person covers" : "people cover"} ${label} ${label === "1" ? "place" : "places"}` };
    });
    const total = cols.reduce((a, c) => a + c.value, 0);
    const stretched = cols.slice(5).reduce((a, c) => a + c.value, 0);
    chart = (
      <>
        <Columns cols={cols} xLabel="places covered by one field person (all of West Bengal)" />
        <p className="mt-2 text-sm text-ink">
          <strong className="font-semibold">{stretched}</strong> of {total} field staff cover 6 or more places — the most stretched, and where a new hire would take load off.
        </p>
      </>
    );
  }
  const current = VIEWS.find((v) => v.id === view)!;

  return (
    <section aria-labelledby={`${id}-title`} className="mt-4 rounded-card bg-surface p-4 shadow-card" data-testid="team-insights">
      <h2 id={`${id}-title`} className="text-base font-semibold text-ink">
        Sales team insights
      </h2>
      <p className="text-xs text-ink-muted">Counts people by where they are assigned. The sheet has no sales figures, so this measures coverage, not sales performance.</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-testid="insight-tiles">
        {[
          { value: people, label: `people in ${where}` },
          { value: blocks.length, label: "blocks covered" },
          { value: fieldPerBlock.toFixed(1), label: "field staff per block (excl. ASM)" },
          { value: noField, label: "blocks with no field staff" },
          { value: vacant, label: "vacant positions" },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl bg-surface-muted px-3 py-2.5">
            <p className="text-2xl font-semibold tabular-nums text-ink">{tile.value}</p>
            <p className="text-xs leading-4 text-ink-muted">{tile.label}</p>
          </div>
        ))}
      </div>

      {worst && !scopeDistrict ? (
        <p className="mt-3 rounded-xl bg-[#c62828]/8 px-3 py-2 text-sm text-ink" data-testid="insight-headline">
          <strong className="font-semibold">Hire first in {worst.d.name}</strong>: {worst.average.toFixed(1)} people per block against a state average of {stateAverage.toFixed(1)}; {worst.thin} of its {worst.blocks} blocks have only 1–2
          people{worst.noField ? `, and ${worst.noField} ${worst.noField === 1 ? "has" : "have"} no field staff at all` : ""}.
        </p>
      ) : null}

      <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-line">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[15rem] flex-1 flex-col gap-1 text-xs font-medium text-ink-muted">
            Show
            <select value={view} onChange={(event) => setView(event.target.value as View)} className="h-10 rounded-lg bg-surface-muted px-3 text-sm font-semibold text-ink ring-1 ring-line" data-testid="insight-view">
              {VIEWS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-medium text-ink-muted">
            For
            <select value={scope} onChange={(event) => setScope(event.target.value)} className="h-10 rounded-lg bg-surface-muted px-3 text-sm font-semibold text-ink ring-1 ring-line" data-testid="insight-scope">
              <option value="">All of West Bengal</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <h3 className="mt-4 text-sm font-semibold text-ink">
          {current.label} · {where}
        </h3>
        <p className="mb-3 text-xs text-ink-muted">{current.question}</p>
        <div data-testid="insight-chart" data-view={view}>
          {chart}
        </div>
        {view === "hire" || view === "headcount" ? (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2" aria-label="Colours">
            {STAFF_BANDS.map((band) => (
              <li key={band.key} className="flex items-center gap-1.5 text-[0.6875rem] text-ink">
                <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: band.colour }} />
                {band.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
