import Link from "next/link";
import { cn } from "@/lib/cn";
import { viewHref, type View } from "../links";
import type { Overview } from "../types";
import { GROUP_TERMS, groupTerm, kidLine, type Words } from "../vocab";
import { GROUP_ICON, Icon, toneOf } from "./VisitIcons";

const GROUP_ORDER = ["Service & Supply", "Revenue", "Cash", "Market & Competition", "Demand Pipeline", "Relationship & Channel", "Visit Quality"];

/** One tile per business area with its count; a tile filters the inbox below to that area. */
export function AreaTiles({ o, view, words }: { o: Overview; view: View; words: Words }) {
  const groups = Object.entries(o.groups ?? {}).sort(([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));
  const simple = words === "simple";

  return (
    <section className="grid grid-cols-1 gap-4">
      {groups.length ? (
        <nav aria-label={simple ? "What the visits were about" : "Business areas"}>
          <p className="mb-2 text-sm font-medium text-ink-muted">{simple ? "What the visits were about. Tap one to see only those." : "Business areas (filter)"}</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
            {groups.map(([g, count]) => {
              const on = view.filters.group === g;
              const tone = toneOf(g);
              return (
                <li key={g}>
                  <Link
                    href={viewHref(view, { group: on ? "" : g, segment: "" }) + "#inbox"}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "flex h-full flex-col gap-2 rounded-xl border bg-surface p-3 shadow-card transition hover:-translate-y-0.5 hover:border-ink-subtle",
                      on ? "border-navy-950 ring-2 ring-navy-950" : "border-line",
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span className={cn("grid h-9 w-9 place-items-center rounded-lg", tone.disc)}>
                        <Icon name={GROUP_ICON[g] ?? "note"} />
                      </span>
                      <span className="text-2xl font-semibold tabular-nums text-ink">{count}</span>
                    </span>
                    <span className="text-sm font-semibold leading-5 text-ink">{groupTerm(g, words)}</span>
                    {simple ? <span className="text-xs leading-4 text-ink-muted">{kidLine(GROUP_TERMS, g)}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </section>
  );
}
