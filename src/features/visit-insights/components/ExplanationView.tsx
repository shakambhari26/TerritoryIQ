import type { Explanation, ExplanationStep } from "../types";
import { Section } from "./parts";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Probabilities({ rows }: { rows: NonNullable<ExplanationStep["numbers"]> }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,12rem)_1fr_7rem] items-center gap-3 text-sm">
          <span className="truncate text-ink">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
            <span className="block h-full rounded-full bg-accent" style={{ width: pct(r.probability) }} />
          </span>
          <span className="text-right tabular-nums text-ink">
            {pct(r.probability)}
            {r.score !== undefined ? <span className="text-ink-subtle"> · S={r.score}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StepTable({ table }: { table: NonNullable<ExplanationStep["table"]> }) {
  if (!table.rows.length) return null;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-subtle">
            {table.head.map((h) => (
              <th key={h} scope="col" className="py-1.5 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {r.map((c, j) => (
                <td key={j} className="py-1.5 pr-4 tabular-nums text-ink">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Why the system grouped this visit the way it did: a one-line summary, then each step (keywords, rules, ML model,
 * vote, sub-segments, urgency, note score, track record) with the calculation and the real numbers.
 */
export function ExplanationView({ e }: { e: Explanation }) {
  return (
    <Section title="Why the AI says this" hint="Every score below is calculated, not guessed. Open a step to see the maths.">
      <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-ink">{e.summary}</p>
      {e.reliability ? (
        <p className="mt-2 text-xs text-ink-muted">
          Track record of this way of deciding: {e.reliability.correct}/{e.reliability.n} right ({pct(e.reliability.rate)}), 95% range{" "}
          {pct(e.reliability.low)}–{pct(e.reliability.high)}.
        </p>
      ) : null}
      <div className="mt-4 grid gap-2">
        {e.steps.map((s, i) => (
          <details key={s.id} open={i === 1 || s.id === "decision"} className="rounded-xl border border-line px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">{s.title}</summary>
            <p className="mt-2 text-sm text-ink">{s.plain}</p>
            {s.math ? (
              <p className="mt-2 rounded-md bg-surface-muted px-3 py-2 font-mono text-xs leading-relaxed text-ink-muted">{s.math}</p>
            ) : null}
            {s.numbers?.length ? <Probabilities rows={s.numbers} /> : null}
            {s.table ? <StepTable table={s.table} /> : null}
            {s.note ? <p className="mt-2 text-xs text-ink-subtle">{s.note}</p> : null}
          </details>
        ))}
      </div>
    </Section>
  );
}
