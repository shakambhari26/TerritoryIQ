import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { visitHref } from "../links";
import type { Taxonomy, Urgency, VisitBrief } from "../types";

const URGENCY_STYLE: Record<Urgency, string> = {
  P0: "bg-red-50 text-red-800 border-red-200",
  P1: "bg-amber-50 text-amber-900 border-amber-200",
  P2: "bg-accent-soft text-accent-ink border-teal-200",
  P3: "bg-surface-muted text-ink-muted border-line",
};
const URGENCY_LABEL: Record<Urgency, string> = { P0: "P0 · Critical", P1: "P1 · High", P2: "P2 · Medium", P3: "P3 · Low" };

export function UrgencyPill({ level }: { level: Urgency }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold", URGENCY_STYLE[level])}>
      {URGENCY_LABEL[level]}
    </span>
  );
}

export function Section({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <Card as="section" className={cn("p-5", className)}>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {hint ? <p className="mt-0.5 text-sm text-ink-muted">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line-strong bg-surface-muted px-4 py-6 text-center text-sm text-ink-muted">{children}</p>;
}

/** Horizontal bars; no chart library (the guardrails pin the runtime dependencies). */
export function Bars({ rows }: { rows: { label: ReactNode; value: number; key: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,11rem)_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="truncate text-ink">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-medium tabular-nums text-ink">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "Date unknown";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
}

export function VisitCard({ v, children }: { v: VisitBrief; children?: ReactNode }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <UrgencyPill level={v.urgency} />
        <span className="text-sm font-semibold text-ink">
          <span aria-hidden="true">{v.emoji} </span>
          {v.segment_name}
        </span>
        {v.needs_review ? (
          <span className="rounded-full border border-dashed border-line-strong px-2 py-0.5 text-xs text-ink-muted">Needs review</span>
        ) : null}
        <span className="ml-auto text-xs text-ink-subtle">{formatWhen(v.visit_at)}</span>
      </div>
      <p className="mt-2 text-sm text-ink">
        <span className="font-medium">{v.customer_name}</span>
        <span className="text-ink-muted"> · {v.visit_category.toLowerCase()} · rep {v.rep_name}</span>
        {v.qty_mt !== null ? <span className="text-ink-muted"> · {v.qty_mt} MT</span> : null}
      </p>
      <p className="mt-2 rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">
        <span className="font-semibold">{v.action.owner}:</span> {v.action.text}
        <span className="block text-xs text-ink-subtle">Why: {v.why ?? v.urgency_reason}</span>
      </p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-accent-ink">What the rep said · note score {v.note_score}/10</summary>
        <p className="mt-1 text-ink">“{v.transcript}”</p>
        {v.note_issues.length ? <p className="mt-1 text-xs text-ink-muted">Missing: {v.note_issues.join(", ")}</p> : null}
        <p className="mt-1 text-xs text-ink-subtle">
          Decided by {v.decided_by} · confidence {Math.round(v.confidence * 100)}%
        </p>
      </details>
      <Link href={visitHref(v.visit_key)} className="mt-2 inline-block text-sm font-medium text-accent-ink underline">
        See the AI&rsquo;s reasoning · send the rep a to-do →
      </Link>
      {children}
    </article>
  );
}

export function VisitList({ visits, empty, children }: { visits: VisitBrief[]; empty: string; children?: (v: VisitBrief) => ReactNode }) {
  if (!visits.length) return <Empty>{empty}</Empty>;
  return (
    <div className="grid gap-3">
      {visits.map((v) => (
        <VisitCard key={v.visit_key} v={v}>
          {children?.(v)}
        </VisitCard>
      ))}
    </div>
  );
}

/** The supervisor's one-tap correction: a plain form post, so it works before any script loads. */
/**
 * The manual-override control: pick the right group for a visit when the AI (or a layer) got it wrong.
 * Posts to the same /api/visit-insights/labels route; the saved label is a human label, so it overrides
 * the model and is never overwritten by a later AI pass. Used on the supervisor review view (LabelForm)
 * and on every single-visit page, so anyone signed in can correct any visit — not only uncertain ones.
 */
export function RelabelForm({ visitKey, segment, urgency, taxonomy }: { visitKey: string; segment: string; urgency: Urgency; taxonomy: Taxonomy }) {
  return (
    <form method="post" action="/api/visit-insights/labels" className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
      <input type="hidden" name="visit_key" value={visitKey} />
      <label className="text-xs font-medium text-ink-muted">
        Correct group
        <select name="segment" defaultValue={segment} className="mt-1 block h-9 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink">
          {Object.entries(taxonomy.segments).map(([code, s]) => (
            <option key={code} value={code}>
              {s.emoji} {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-ink-muted">
        Urgency
        <select name="urgency" defaultValue="" className="mt-1 block h-9 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink">
          <option value="">Keep ({urgency})</option>
          {(Object.keys(taxonomy.urgency) as Urgency[]).map((u) => (
            <option key={u} value={u}>
              {URGENCY_LABEL[u]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="h-9 rounded-md bg-navy-950 px-3 text-sm font-semibold text-on-navy hover:bg-navy-800">
        Save
      </button>
    </form>
  );
}

export function LabelForm({ v, taxonomy }: { v: VisitBrief; taxonomy: Taxonomy }) {
  return <RelabelForm visitKey={v.visit_key} segment={v.segment} urgency={v.urgency} taxonomy={taxonomy} />;
}

export function DataTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-subtle">
            {head.map((h) => (
              <th key={h} scope="col" className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cn("py-2 pr-4 text-ink", j > 0 && "tabular-nums")}>
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
