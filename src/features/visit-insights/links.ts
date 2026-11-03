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

/** The Insights page as one value: who is looking, over what period, and the inbox filters (status lane included). */
export interface View {
  tab: TabId;
  days: number | null;
  filters: Filters;
}

/** The same view with some filters changed; an empty string removes one. */
export function viewHref(v: View, change: Filters = {}): string {
  const merged = Object.fromEntries(
    Object.entries({ ...v.filters, ...change }).filter(([k, x]) => (FILTER_KEYS as readonly string[]).includes(k) && x),
  ) as Record<string, string>;
  return tabHref(v.tab, v.days, merged);
}

/** One visit's page: its explanation and the send-to-rep form. */
export function visitHref(key: string, extra: Record<string, string> = {}): string {
  return `/visit-insights/visit?${new URLSearchParams({ key, ...extra })}`;
}

/** Back to the view a card's form was posted from, scrolled to that card, saying what happened (`done`). */
export function landingHref(returnTo: string, done: string, key: string): string {
  const [path, query = ""] = returnTo.split("?");
  const q = new URLSearchParams(query);
  q.delete("ask");
  q.set("done", done);
  q.set("at", key);
  return `${path}?${q}#visit-${key}`;
}
