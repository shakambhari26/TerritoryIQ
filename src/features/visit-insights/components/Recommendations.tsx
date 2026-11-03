import Link from "next/link";
import { cn } from "@/lib/cn";
import type { Recommendation } from "../types";
import { viewHref, type View } from "../links";
import { ownerTerm, type Words } from "../vocab";
import { Section } from "./parts";
import { Icon } from "./VisitIcons";

const PRIORITY: Record<Recommendation["priority"], { label: Record<Words, string>; style: string }> = {
  high: { label: { simple: "Do first", expert: "High priority" }, style: "bg-red-50 text-red-800 border-red-200" },
  medium: { label: { simple: "This week", expert: "Medium priority" }, style: "bg-amber-50 text-amber-900 border-amber-200" },
  low: { label: { simple: "When you can", expert: "Low priority" }, style: "bg-surface-muted text-ink-muted border-line" },
};

/** Next steps computed from the visits by fixed rules (recommend.py in the service), never invented. */
export function Recommendations({ items, view, words }: { items: Recommendation[]; view: View; words: Words }) {
  if (!items.length) return null;
  const simple = words === "simple";
  return (
    <Section
      title={simple ? "Bigger patterns to act on" : "Recommended next steps"}
      hint={simple ? "Things that keep coming up across many visits, and who should handle them." : "Rule-derived from the period's visits. Each names an owner and links to its evidence."}
    >
      <ol className="grid gap-3 md:grid-cols-2">
        {items.map((r) => (
          <li key={r.id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", PRIORITY[r.priority].style)}>{PRIORITY[r.priority].label[words]}</span>
              <span className="inline-flex items-center gap-1 text-xs text-ink-subtle">
                <Icon name="user" className="h-3.5 w-3.5" />
                {ownerTerm(r.owner, words)}
              </span>
            </div>
            <p className="mt-2 font-semibold text-ink">{r.title}</p>
            <p className="mt-1 text-sm text-ink-muted">{r.why}</p>
            <p className="mt-2 text-sm text-ink">
              <span className="font-medium">What to do:</span> {r.action}
            </p>
            {Object.keys(r.filter).length ? (
              <Link href={viewHref({ ...view, filters: {} }, { ...r.filter, status: "all" }) + "#inbox"} className="mt-2 inline-block text-sm font-medium text-accent-ink hover:underline">
                {simple ? "Show me these visits" : "View evidence"} →
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}
