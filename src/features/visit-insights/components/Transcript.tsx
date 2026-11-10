import { cn } from "@/lib/cn";
import type { Highlight, VisitBrief } from "../types";
import { segmentTerm, titleCase, type Words } from "../vocab";

const MARK: Record<Highlight["kind"], string> = {
  decisive: "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300",
  other: "bg-amber-100 text-amber-950 ring-1 ring-amber-300",
  flag: "bg-sky-100 text-sky-950 ring-1 ring-sky-300",
  negated: "bg-slate-200 text-slate-600 line-through",
  ml: "bg-violet-50 text-violet-950 underline decoration-violet-500 decoration-2 underline-offset-2",
};

const LEGEND: Record<Highlight["kind"], Record<Words, string>> = {
  decisive: { simple: "Words that decided it", expert: "Keyword → chosen segment" },
  other: { simple: "Words pointing somewhere else", expert: "Keyword → other segment" },
  flag: { simple: "Side topic", expert: "Flag keyword" },
  negated: { simple: "Cancelled by “not”", expert: "Negated keyword" },
  ml: { simple: "Words the learning model leaned on", expert: "ML top features (+ pull)" },
};

function why(h: Highlight, words: Words): string {
  const group = h.kind === "flag" ? titleCase(h.target.replace(/_/g, " ")) : segmentTerm(h.target, words);
  if (h.kind === "negated") return `Would point to ${group}, but cancelled by “${h.negated_by}”`;
  if (h.by === "ml") return `The learning model leaned on this for ${group} (pull ${h.weight})`;
  return words === "simple" ? `Points to ${group}` : `Keyword → ${group} · weight ${h.weight}`;
}

/** The transcript cut into plain text and marked spans. Spans arrive sorted and non-overlapping from the service. */
function pieces(text: string, spans: Highlight[]): (string | Highlight)[] {
  const out: (string | Highlight)[] = [];
  let at = 0;
  for (const h of spans) {
    if (h.start < at || h.end > text.length) continue;
    if (h.start > at) out.push(text.slice(at, h.start));
    out.push(h);
    at = h.end;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/**
 * The rep's whole note, always shown in full, with a switch that colours the words behind the decision. The switch is
 * a CSS-only checkbox (peer-checked), so the card stays a server component and works before any script loads.
 */
export function Transcript({ v, words }: { v: VisitBrief; words: Words }) {
  const spans = v.highlights ?? [];
  const kinds = (Object.keys(MARK) as Highlight["kind"][]).filter((k) => spans.some((h) => h.kind === k));
  const id = `hl-${v.visit_key}`;
  return (
    // The checkbox is inside the label; this wrapper swaps plain for marked text through :has(:checked).
    <div className={cn("mt-3", spans.length > 0 && "has-[:checked]:[&_.plain]:hidden has-[:checked]:[&_.marked]:block has-[:checked]:[&_.legend]:flex")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {words === "simple" ? "What the rep said" : `Transcript · note score ${v.note_score}/10`}
        </p>
        {spans.length ? (
          <label htmlFor={id} className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-ink">
            {words === "simple" ? "Show what the AI noticed" : "Highlight evidence"}
            <input id={id} type="checkbox" className="peer sr-only" />
            <span
              aria-hidden="true"
              className="relative h-5 w-9 rounded-full bg-line-strong transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-navy-950 peer-checked:after:left-[18px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary"
            />
          </label>
        ) : null}
      </div>
      <div>
        <blockquote className="plain mt-1 whitespace-pre-line rounded-lg bg-surface-muted px-3 py-2 text-sm leading-6 text-ink">“{v.transcript}”</blockquote>
        {spans.length ? (
          <>
            <blockquote className="marked mt-1 hidden whitespace-pre-line rounded-lg bg-surface-muted px-3 py-2 text-sm leading-7 text-ink">
              “
              {pieces(v.transcript, spans).map((p, i) =>
                typeof p === "string" ? (
                  <span key={i}>{p}</span>
                ) : (
                  <mark key={i} title={why(p, words)} className={cn("rounded px-0.5", MARK[p.kind])}>
                    {v.transcript.slice(p.start, p.end)}
                  </mark>
                ),
              )}
              ”
            </blockquote>
            <ul className="legend mt-2 hidden flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
              {kinds.map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <span className={cn("inline-block h-3 w-5 rounded", MARK[k])} aria-hidden="true" />
                  {LEGEND[k][words]}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      {words === "expert" && v.note_issues.length ? <p className="mt-1 text-xs text-ink-muted">Missing from the note: {v.note_issues.join(", ")}</p> : null}
    </div>
  );
}
