import { FILTER_KEYS, type Filters, type TabId } from "./types.ts";

/** URLs inside /visit-insights. Everything is in the query string so every view, filter and question can be linked. */

export function tabHref(tab: TabId, days: number | null, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ role: tab, ...extra });
  if (days) q.set("days", String(days));
  return `/visit-insights?${q}`;
}

export function exploreHref(filters: Filters | Record<string, string>, days: number | null): string {
  const clean = Object.fromEntries(
    Object.entries(filters).filter(([k, v]) => (FILTER_KEYS as readonly string[]).includes(k) && typeof v === "string" && v),
  ) as Record<string, string>;
  return tabHref("explore", days, clean);
}

export function askHref(tab: TabId, days: number | null, question: string, filters: Filters = {}): string {
  return tabHref(tab, days, { ...(tab === "explore" ? (filters as Record<string, string>) : {}), ask: question }) + "#ask";
}

/** One visit's page: its explanation and the send-to-rep form. */
export function visitHref(key: string, extra: Record<string, string> = {}): string {
  return `/visit-insights/visit?${new URLSearchParams({ key, ...extra })}`;
}
