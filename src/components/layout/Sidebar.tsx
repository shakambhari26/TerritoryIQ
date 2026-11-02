"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { NavLink } from "@/components/layout/NavLink";
import { NAV_ICONS } from "@/components/layout/NavIcons";
import { Badge } from "@/components/ui/Badge";
import { LogoMark } from "@/components/ui/LogoMark";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, SITE } from "@/lib/site";

const Search = NAV_ICONS.Search;
const Menu = NAV_ICONS.Menu;
const Close = NAV_ICONS.Close;
const Collapse = NAV_ICONS.Collapse;

const RAIL_KEY = "territoryiq.sidebar-rail";
const railListeners = new Set<() => void>();

type RailChoice = "on" | "off" | "auto";

// The visitor's rail choice: "on" (collapsed), "off" (expanded) or "auto" (none made, so the width decides; see the
// `rail:` variant in globals.css). Storage can be missing or throw (private window, blocked site data); the choice is
// then "auto". The server snapshot is "auto", so the first client render matches the markup.
function readRail(): RailChoice {
  try {
    const stored = window.localStorage.getItem(RAIL_KEY);
    return stored === "1" ? "on" : stored === "0" ? "off" : "auto";
  } catch {
    return "auto";
  }
}
// The widths at which "auto" is the rail: keep in step with the variant.
const AUTO_RAIL_QUERY = "(min-width: 64rem) and (max-width: 95.99rem)";
function subscribeAutoRail(listener: () => void) {
  const query = window.matchMedia(AUTO_RAIL_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function writeRail(rail: boolean) {
  try {
    window.localStorage.setItem(RAIL_KEY, rail ? "1" : "0");
  } catch {
    /* the choice then lasts only until reload */
  }
  railListeners.forEach((listener) => listener());
}
function subscribeRail(listener: () => void) {
  railListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    railListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** `rail`: inside the sidebar, so it follows the icon rail (the top bar's brand never does). */
function Brand({ rail }: { rail: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-3 rounded-xl", rail && "rail:justify-center")}>
      <LogoMark className="size-9 shrink-0" />
      <span className={cn("leading-tight", rail && "rail:sr-only")}>
        <span className="block text-base font-semibold tracking-tight text-ink">{SITE.name}</span>
        <span className="block text-[0.6875rem] text-ink-muted">Territory intelligence</span>
      </span>
    </Link>
  );
}

/**
 * The application's one navigation: a persistent left sidebar from `lg`, and below that the same element as an
 * off-canvas drawer opened from a slim top bar. It is a single `<nav>` in both cases, so there is one "Primary"
 * landmark whatever the width.
 *
 * Desktop: full width (labels), or an icon rail. Until the visitor chooses, the width decides (the rail below `2xl`, so
 * the map keeps its room on a laptop); the Collapse button makes the choice, which is remembered and applies on every
 * page, so the labels never come and go with the route.
 */
export function Sidebar() {
  const pathname = usePathname();
  const searchId = useId();
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // The drawer is open for one route only, so following a link closes it without an effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const choice = useSyncExternalStore(subscribeRail, readRail, (): RailChoice => "auto");
  const autoRail = useSyncExternalStore(
    subscribeAutoRail,
    () => window.matchMedia(AUTO_RAIL_QUERY).matches,
    () => false,
  );
  // Whether the rail is showing now, for the Collapse button's state; the layout itself is CSS (`data-rail`).
  const compact = choice === "on" || (choice === "auto" && autoRail);
  const [query, setQuery] = useState("");

  const open = openFor === pathname;
  // While the drawer is open the page behind it is fixed, and Escape closes it wherever focus is (a tap on an empty part
  // of the drawer moves focus to the page, where a handler on the drawer itself would never hear it). Escape is taken
  // first, so a page's own Escape (the map's "back") does not also run. At `lg` and up the drawer is not shown.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || window.matchMedia("(min-width: 64rem)").matches) return;
      event.stopPropagation();
      setOpenFor(null);
      menuRef.current?.focus();
    };
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onEscape, true);
    };
  }, [open]);
  const needle = query.trim().toLowerCase();
  const items = needle ? NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(needle)) : NAV_ITEMS;

  const openDrawer = () => {
    setOpenFor(pathname);
    requestAnimationFrame(() => closeRef.current?.focus());
  };
  const closeDrawer = () => {
    setOpenFor(null);
    menuRef.current?.focus();
  };
  // The drawer otherwise closes only when the route changes, which tapping the current page's own link never does.
  const onNavClick = (event: MouseEvent<HTMLElement>) => {
    if (open && (event.target as HTMLElement).closest("a")) setOpenFor(null);
  };
  const expandAndSearch = () => {
    writeRail(false);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-surface px-3 shadow-float lg:hidden">
        <button
          ref={menuRef}
          type="button"
          onClick={openDrawer}
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="sidebar"
          className="grid size-11 place-items-center rounded-xl text-ink hover:bg-surface-muted"
        >
          <Menu />
        </button>
        <Brand rail={false} />
        <Badge tone="warning" className="ml-auto hidden sm:inline-flex">
          Local prototype
        </Badge>
      </header>

      {open ? <div aria-hidden="true" onClick={closeDrawer} className="fixed inset-0 z-40 bg-ink/30 lg:hidden" /> : null}

      <aside
        id="sidebar"
        aria-label="Sidebar"
        data-rail={choice}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface shadow-[0_0_40px_-12px_rgb(23_43_77/0.35)] transition-[transform,visibility] duration-200",
          "lg:sticky lg:top-0 lg:z-20 lg:h-dvh lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:visible lg:shadow-[1px_0_0_0_var(--color-line)] rail:w-[4.75rem]",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-5 rail:justify-center rail:px-2">
          <Brand rail />
          <button
            ref={closeRef}
            type="button"
            onClick={closeDrawer}
            aria-label="Close navigation"
            className="grid size-11 place-items-center rounded-xl text-ink-muted hover:bg-surface-muted lg:hidden"
          >
            <Close />
          </button>
        </div>

        <div className="px-4 pb-3 rail:px-3">
          <label htmlFor={searchId} className="sr-only">
            Search pages
          </label>
          <div className="relative rail:hidden">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle">
              <Search />
            </span>
            <input
              ref={searchRef}
              id={searchId}
              // Not type="search": the pages' own place and area searches are the "searchbox" on a page, and there is one each.
              type="text"
              inputMode="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages"
              autoComplete="off"
              className="h-11 w-full rounded-xl bg-surface-muted pl-10 pr-3 text-sm text-ink placeholder:text-ink-subtle focus-visible:bg-surface focus-visible:outline-primary"
            />
          </div>
          <button
            type="button"
            onClick={expandAndSearch}
            aria-label="Search pages"
            className="hidden size-11 items-center justify-center rounded-xl bg-surface-muted text-ink-muted hover:text-ink rail:mx-auto rail:flex"
          >
            <Search />
          </button>
        </div>

        {/*
          `relative` keeps the sr-only text of the planned items inside this scroll container, so it cannot widen the page.
        */}
        <nav aria-label="Primary" onClick={onNavClick} className="relative min-h-0 flex-1 overflow-y-auto px-3 py-1">
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.label}>
                {item.status === "available" && item.href ? (
                  <NavLink href={item.href} icon={NAV_ICONS[item.label]({})}>
                    {item.label}
                  </NavLink>
                ) : (
                  <span className="flex h-11 cursor-not-allowed items-center gap-3 rounded-xl px-3 text-sm text-ink-subtle rail:justify-center rail:px-0">
                    <span aria-hidden="true" className="shrink-0 opacity-70">
                      {NAV_ICONS[item.label]({})}
                    </span>
                    <span className="rail:sr-only">{item.label}</span>
                    <Badge aria-hidden="true" className="ml-auto px-1.5 py-0 text-[0.5625rem] rail:sr-only">
                      Soon
                    </Badge>
                    <span className="sr-only">(planned, not yet available)</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {items.length === 0 ? <p className="px-3 py-2 text-sm text-ink-muted">No page matches “{query.trim()}”.</p> : null}
        </nav>

        <div className="space-y-3 px-4 pb-4 pt-3">
          <Badge tone="warning" className="w-full justify-center whitespace-normal py-1 text-center rail:hidden">
            Local prototype · not for deployment
          </Badge>
          <button
            type="button"
            onClick={() => writeRail(!compact)}
            aria-pressed={compact}
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-ink-muted hover:bg-surface-muted hover:text-ink lg:flex rail:justify-center rail:px-0"
          >
            <Collapse />
            <span className="rail:sr-only">Collapse</span>
          </button>
        </div>
      </aside>
    </>
  );
}
