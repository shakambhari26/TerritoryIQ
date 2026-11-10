import Link from "next/link";
import { cn } from "@/lib/cn";
import { tabHref, viewHref, type View } from "../links";
import { DAY_RANGES, EXPLORE, ROLES } from "../types";
import type { Words } from "../vocab";
import { Icon, type IconName } from "./VisitIcons";

/**
 * The Simple / Expert switch. A plain <a>, not <Link>: it sets a cookie through a route, and a prefetch must never
 * flip it. Works without scripts and is remembered on every Visit Insights page.
 */
export function WordsToggle({ words, here }: { words: Words; here: string }) {
  const expert = words === "expert";
  const href = `/api/visit-insights/words?${new URLSearchParams({ mode: expert ? "simple" : "expert", back: here })}`;
  return (
    <a
      href={href}
      role="switch"
      aria-checked={expert}
      aria-label="Expert words"
      title={expert ? "Showing industry terms, codes and confidence. Switch to everyday words." : "Showing everyday words. Switch to industry terms, codes and confidence."}
      className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface py-1 pl-3 pr-1 text-sm font-medium text-ink shadow-card hover:border-ink-subtle"
    >
      <span className={cn(expert ? "text-ink-subtle" : "text-ink")}>Simple</span>
      <span className={cn("relative h-6 w-11 rounded-full transition-colors", expert ? "bg-navy-950" : "bg-line-strong")} aria-hidden="true">
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", expert ? "left-[22px]" : "left-0.5")} />
      </span>
      <span className={cn("pr-2", expert ? "text-ink" : "text-ink-subtle")}>Expert</span>
    </a>
  );
}

const ADVANCED: { href: string; label: string; hint: string; icon: IconName }[] = [
  { href: "/visit-insights/messages", label: "Messages log", hint: "Every message sent to reps, and their replies", icon: "send" },
  { href: "/visit-insights/keywords", label: "Keyword database", hint: "The words the AI listens for, in 3 languages", icon: "book" },
  { href: "/visit-insights/how-it-works", label: "How the AI scores", hint: "The maths behind every group and urgency", icon: "sparkles" },
];

/** The add-on pages, out of the main path: for power users and developers. */
export function AdvancedMenu() {
  return (
    <details className="relative">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-sm font-medium text-ink shadow-card marker:hidden hover:border-ink-subtle">
        Advanced
        <Icon name="chevron" className="h-4 w-4" />
      </summary>
      <ul className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-1.5 shadow-lg">
        {ADVANCED.map((a) => (
          <li key={a.href}>
            <Link href={a.href} className="flex gap-3 rounded-lg p-2.5 hover:bg-surface-muted">
              <Icon name={a.icon} className="mt-0.5 h-5 w-5 text-ink-muted" />
              <span>
                <span className="block text-sm font-medium text-ink">{a.label}</span>
                <span className="block text-xs text-ink-muted">{a.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

const TABS = [...ROLES, EXPLORE];

/** Whose eyes the page is for. It changes the questions, the next steps and (in Expert) the deep-dive tables. */
export function RolePicker({ view }: { view: View }) {
  const current = TABS.find((t) => t.id === view.tab) ?? ROLES[0];
  return (
    <details className="relative">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-line-strong bg-surface pl-2 pr-3 text-sm shadow-card marker:hidden hover:border-ink-subtle">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-navy-950 text-on-navy">
          <Icon name="user" className="h-4 w-4" />
        </span>
        <span className="text-ink-muted">Viewing as</span>
        <span className="font-semibold text-ink">{current.label}</span>
        <Icon name="chevron" className="h-4 w-4 text-ink-muted" />
      </summary>
      <ul className="absolute left-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-1.5 shadow-lg">
        {TABS.map((t) => (
          <li key={t.id}>
            <Link
              href={tabHref(t.id, view.days)}
              aria-current={t.id === view.tab ? "page" : undefined}
              className={cn("block rounded-lg p-2.5 hover:bg-surface-muted", t.id === view.tab && "bg-surface-muted")}
            >
              <span className="block text-sm font-medium text-ink">{t.label}</span>
              <span className="block text-xs text-ink-muted">{t.question}</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function PeriodPicker({ view, words }: { view: View; words: Words }) {
  return (
    <nav aria-label="Period" className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line-strong bg-surface p-1 shadow-card">
      <Icon name="calendar" className="ml-1.5 h-4 w-4 text-ink-muted" />
      {[...DAY_RANGES, null].map((d) => (
        <Link
          key={d ?? "all"}
          href={viewHref({ ...view, days: d })}
          aria-current={d === view.days ? "true" : undefined}
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-sm",
            d === view.days ? "bg-navy-950 font-semibold text-on-navy" : "text-ink-muted hover:text-ink",
          )}
        >
          {d ? (words === "simple" ? `${d} days` : `${d}d`) : words === "simple" ? "All time" : "All"}
        </Link>
      ))}
    </nav>
  );
}
