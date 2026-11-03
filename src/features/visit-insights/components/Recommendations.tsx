import Link from "next/link";
import { cn } from "@/lib/cn";
import type { Recommendation } from "../types";
import { exploreHref } from "../links";
import { Section } from "./parts";

const PRIORITY: Record<Recommendation["priority"], { label: string; style: string }> = {
  high: { label: "Do first", style: "bg-red-50 text-red-800 border-red-200" },
  medium: { label: "This week", style: "bg-amber-50 text-amber-900 border-amber-200" },
  low: { label: "When you can", style: "bg-surface-muted text-ink-muted border-line" },
};

/** Next steps computed from the visits by fixed rules (recommend.py in the service), never invented. */
export function Recommendations({ items, days }: { items: Recommendation[]; days: number | null }) {
  if (!items.length) return null;
  return (
    <Section title="Recommended next steps" hint="Worked out from these visits. Each one says who should act and links to the visits behind it.">
      <ol className="grid gap-3 md:grid-cols-2">
        {items.map((r) => (
          <li key={r.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", PRIORITY[r.priority].style)}>{PRIORITY[r.priority].label}</span>
              <span className="text-xs text-ink-subtle">Owner: {r.owner}</span>
            </div>
            <p className="mt-2 font-semibold text-ink">{r.title}</p>
            <p className="mt-1 text-sm text-ink-muted">{r.why}</p>
            <p className="mt-2 text-sm text-ink">
              <span className="font-medium">What to do:</span> {r.action}
            </p>
            {Object.keys(r.filter).length ? (
              <Link href={exploreHref(r.filter, days)} className="mt-2 inline-block text-sm font-medium text-accent-ink hover:underline">
                See the visits →
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}
