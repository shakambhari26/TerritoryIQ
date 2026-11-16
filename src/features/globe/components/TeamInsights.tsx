"use client";

import { useMemo, useState, type ReactNode } from "react";
import { bandFor, districtAverage, ROLE_NAME } from "../staffing";
import type { GlobeManifest } from "../types";

/**
 * Sales team insights for decision making, all computed from the area-mapping sheet (counts only, no names):
 *   - headline numbers;
 *   - where to hire first: districts by people per block, against the state average;
 *   - which roles are missing where: share of each district's blocks with a Primary, a Secondary and a DSO;
 *   - how stretched the field team is: how many places each field person covers.
 * Every mark has a hover tooltip and a text label; clicking a district flies the globe there.
 */

/** Sequential blue (one hue, light to dark) for the role grid and the single-series columns. */
const SEQ = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
const SINGLE = "#3987e5";
const FIELD_ROLES = ["PRIMARY", "SECONDARY", "DSO"] as const;

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bind = (content: ReactNode) => ({
    onMouseMove: (event: React.MouseEvent) => {
      const host = (event.currentTarget as HTMLElement).closest("[data-tip-host]")!.getBoundingClientRect();
      setTip({ x: event.clientX - host.left, y: event.clientY - host.top, content });
    },
    onMouseLeave: () => setTip(null),
    onFocus: (event: React.FocusEvent) => {
      const host = (event.currentTarget as HTMLElement).closest("[data-tip-host]")!.getBoundingClientRect();
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      setTip({ x: box.left - host.left + box.width / 2, y: box.top - host.top, content });
    },
    onBlur: () => setTip(null),
  });
  const view = tip ? (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-5 text-white shadow-float"
      style={{ left: tip.x, top: tip.y - 10 }}
    >
      {tip.content}
    </div>
  ) : null;
  return { bind, view };
}

function Card({ title, question, children }: { title: string; question: string; children: ReactNode }) {
  return (
    <section className="relative rounded-2xl bg-white p-4 ring-1 ring-line" data-tip-host>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="text-xs text-ink-muted">{question}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function TeamInsights({ manifest, onSelectDistrict, disabled }: { manifest: GlobeManifest; onSelectDistrict: (id: string) => void; disabled: boolean }) {
  const hire = useTip();
  const grid = useTip();
  const spread = useTip();
  const byPeople = useTip();

  const rows = useMemo(() => {
    return manifest.districts
      .map((d) => {
        const blocks = manifest.blocks.filter((b) => b.districtId === d.id);
        const average = districtAverage(d, manifest.blocks);
        if (!blocks.length || average === null) return null;
        const share = (role: (typeof FIELD_ROLES)[number]) => blocks.filter((b) => b.roleCounts[role] > 0).length / blocks.length;
        return {
          id: d.id,
          name: d.name,
          average,
          blocks: blocks.length,
          people: d.staff,
          vacancies: d.vacancies,
          thin: blocks.filter((b) => b.staff <= 2).length,
          noField: blocks.filter((b) => b.fieldStaff === 0).length,
          shares: { PRIMARY: share("PRIMARY"), SECONDARY: share("SECONDARY"), DSO: share("DSO") },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.average - b.average || a.name.localeCompare(b.name));
  }, [manifest]);

  const blocks = manifest.blocks;
  const stateAverage = blocks.reduce((n, b) => n + b.staff, 0) / blocks.length;
  const fieldPerBlock = blocks.reduce((n, b) => n + b.fieldStaff, 0) / blocks.length;
  const noField = blocks.filter((b) => b.fieldStaff === 0).length;
  const vacant = manifest.districts.reduce((n, d) => n + d.vacancies, 0);
  const max = Math.max(...rows.map((r) => r.average), 5);

  // Field staff by how many places each covers; 10 or more folded into one column.
  const spreadRaw = manifest.meta.sheet?.spread ?? [];
  const spreadCols = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    const value = n < 10 ? (spreadRaw[n] ?? 0) : spreadRaw.slice(10).reduce((a, b) => a + (b ?? 0), 0);
    return { label: n < 10 ? String(n) : "10+", value };
  });
  const spreadMax = Math.max(...spreadCols.map((c) => c.value), 1);
  const fieldTotal = spreadCols.reduce((a, c) => a + c.value, 0);
  const stretched = spreadCols.slice(5).reduce((a, c) => a + c.value, 0);
  const worst = rows[0];

  return (
    <section aria-labelledby="team-insights-title" className="mt-4 rounded-card bg-surface p-4 shadow-card" data-testid="team-insights">
      <h2 id="team-insights-title" className="text-base font-semibold text-ink">
        Sales team insights
      </h2>
      <p className="text-xs text-ink-muted">From the area-mapping sheet. Counts people by where they are assigned; the sheet has no sales figures, so this measures coverage, not sales performance.</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-testid="insight-tiles">
        {[
          { value: manifest.meta.sheet?.staff ?? 0, label: "people in the team" },
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

      {worst ? (
        <p className="mt-3 rounded-xl bg-[#c62828]/8 px-3 py-2 text-sm text-ink" data-testid="insight-headline">
          <strong className="font-semibold">Hire first in {worst.name}</strong>: {worst.average.toFixed(1)} people per block against a state average of {stateAverage.toFixed(1)}; {worst.thin} of its{" "}
          {worst.blocks} blocks have only 1–2 people{worst.noField ? `, and ${worst.noField} ${worst.noField === 1 ? "has" : "have"} no field staff at all` : ""}.
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card title="Where to hire first" question="People per block in each district, fewest first. The line is the state average.">
          <ul className="space-y-1" aria-label="People per block by district">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectDistrict(r.id)}
                  className="group grid w-full grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 rounded-md py-0.5 text-left disabled:opacity-60"
                  {...hire.bind(
                    <>
                      <strong>{r.name}</strong>
                      <br />
                      {r.average.toFixed(1)} people per block · {r.people} people · {r.blocks} blocks
                      <br />
                      {r.thin} blocks with 1–2 people · {r.noField} with no field staff · {r.vacancies} vacant
                    </>,
                  )}
                >
                  <span className="truncate text-xs text-ink group-hover:text-primary-ink group-hover:underline">{r.name}</span>
                  <span className="relative h-4">
                    <span className="absolute inset-y-0 left-0 rounded-r" style={{ width: `${(r.average / max) * 100}%`, backgroundColor: bandFor(r.average).colour }} />
                    <span aria-hidden="true" className="absolute -inset-y-1 w-0.5 bg-ink/60" style={{ left: `${(stateAverage / max) * 100}%` }} />
                  </span>
                  <span className="text-right text-xs tabular-nums text-ink">{r.average.toFixed(1)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex items-center gap-2 text-[0.6875rem] text-ink-muted">
            <span aria-hidden="true" className="inline-block h-3 w-0.5 bg-ink/60" /> State average {stateAverage.toFixed(1)} · bar colour = the map colour
          </p>
          {hire.view}
        </Card>

        <Card title="Which roles are missing where" question="Share of each district's blocks that have at least one person in the role. Pale = the role is missing in many blocks.">
          <table className="w-full border-separate border-spacing-0.5 text-xs" aria-label="Role coverage by district">
            <thead>
              <tr>
                <th className="text-left font-medium text-ink-muted">District</th>
                {FIELD_ROLES.map((role) => (
                  <th key={role} className="px-1 font-medium text-ink-muted">
                    {ROLE_NAME[role].replace(" Officer", "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="truncate pr-2 text-left font-normal text-ink">
                    {r.name}
                  </th>
                  {FIELD_ROLES.map((role) => {
                    const v = r.shares[role];
                    const step = Math.min(SEQ.length - 1, Math.floor(v * SEQ.length));
                    return (
                      <td
                        key={role}
                        tabIndex={0}
                        className="h-6 rounded text-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ink"
                        style={{ backgroundColor: v === 0 ? "#f3f2ef" : SEQ[step], color: step >= 3 ? "#fff" : "#1f2937" }}
                        {...grid.bind(
                          <>
                            <strong>{r.name}</strong> · {ROLE_NAME[role]}
                            <br />
                            in {Math.round(v * r.blocks)} of {r.blocks} blocks ({Math.round(v * 100)}%)
                          </>,
                        )}
                      >
                        {Math.round(v * 100)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {grid.view}
        </Card>

        <Card title="How stretched is the field team" question="Field staff (Primary, Secondary, DSO) by how many places each one covers.">
          <div className="flex h-40 items-end gap-1.5" role="list" aria-label="Field staff by number of places covered">
            {spreadCols.map((c) => (
              <div key={c.label} role="listitem" className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[0.6875rem] tabular-nums text-ink">{c.value || ""}</span>
                <span
                  tabIndex={0}
                  className="w-full rounded-t outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  style={{ height: `${(c.value / spreadMax) * 100}%`, minHeight: c.value ? 2 : 0, backgroundColor: SINGLE }}
                  {...spread.bind(
                    <>
                      {c.value} {c.value === 1 ? "person covers" : "people cover"} {c.label} {c.label === "1" ? "place" : "places"}
                    </>,
                  )}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5 border-t border-line pt-1">
            {spreadCols.map((c) => (
              <span key={c.label} className="flex-1 text-center text-[0.6875rem] text-ink-muted">
                {c.label}
              </span>
            ))}
          </div>
          <p className="mt-1 text-center text-[0.6875rem] text-ink-muted">places covered by one person</p>
          <p className="mt-2 text-sm text-ink">
            <strong className="font-semibold">{stretched}</strong> of {fieldTotal} field staff cover 6 or more places: the most stretched, and where a new hire would
            take load off.
          </p>
          {spread.view}
        </Card>

        <Card title="Blocks by number of people" question="How many blocks have 1, 2, 3 … people. Red bars (1–2 people) are where to add people first.">
          {(() => {
            const counts = Array.from({ length: 8 }, (_, i) => ({ n: i + 1, value: blocks.filter((b) => (i === 7 ? b.staff >= 8 : b.staff === i + 1)).length }));
            const top = Math.max(...counts.map((c) => c.value), 1);
            return (
              <>
                <div className="flex h-40 items-end gap-1.5" role="list" aria-label="Blocks by number of people">
                  {counts.map((c) => (
                    <div key={c.n} role="listitem" className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[0.6875rem] tabular-nums text-ink">{c.value || ""}</span>
                      <span
                        tabIndex={0}
                        className="w-full rounded-t outline-none focus-visible:ring-2 focus-visible:ring-ink"
                        style={{ height: `${(c.value / top) * 100}%`, minHeight: c.value ? 2 : 0, backgroundColor: bandFor(c.n).colour }}
                        {...byPeople.bind(
                          <>
                            {c.value} blocks with {c.n === 8 ? "8 or more" : c.n} {c.n === 1 ? "person" : "people"}
                          </>,
                        )}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex gap-1.5 border-t border-line pt-1">
                  {counts.map((c) => (
                    <span key={c.n} className="flex-1 text-center text-[0.6875rem] text-ink-muted">
                      {c.n === 8 ? "8+" : c.n}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-center text-[0.6875rem] text-ink-muted">people in the block (colour = the map colour)</p>
              </>
            );
          })()}
          {byPeople.view}
        </Card>
      </div>
    </section>
  );
}
