"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { NavLink, RAIL_FADE, RAIL_LABEL } from "@/components/layout/NavLink";
import { NAV_ICONS } from "@/components/layout/NavIcons";
import { Badge } from "@/components/ui/Badge";
import { LogoMark } from "@/components/ui/LogoMark";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, SITE } from "@/lib/site";

const Search = NAV_ICONS.Search;
const Menu = NAV_ICONS.Menu;
const Close = NAV_ICONS.Close;

/** `rail`: inside the sidebar, so its name follows the icon rail (the top bar's brand never does). */
function Brand({ rail }: { rail: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3 rounded-xl">
      <LogoMark className="size-9 shrink-0" />
      <span className={cn("leading-tight", rail && RAIL_LABEL)}>
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
 * Desktop: an icon rail that opens by itself, labelled, over the page while the pointer is on it or keyboard focus is
 * inside it, and is icons only otherwise. There is nothing to press. Its footprint in the layout is the rail's, so the page
 * never moves or re-fits when it opens. The icons stay where they are (every row has the same left padding in both states),
 * so only the width and the labels animate; `prefers-reduced-motion` turns the animation off. The labels are in the
 * document either way, so assistive technology reads the same menu.
 */
export function Sidebar() {
  const pathname = usePathname();
  const searchId = useId();
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The drawer is open for one route only, so following a link closes it without an effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
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

      {/* The footprint: always the rail's width, so the page does not move. The aside opens over it (data-rail drives the `rail:` variants). */}
      <div data-rail="" className="contents lg:sticky lg:top-0 lg:z-30 lg:block lg:h-dvh lg:w-[4.75rem] lg:shrink-0">
        <aside
          id="sidebar"
          aria-label="Sidebar"
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface shadow-[0_0_40px_-12px_rgb(23_43_77/0.35)]",
            "transition-[transform,visibility,width,box-shadow] duration-200 ease-out motion-reduce:transition-none",
            "lg:absolute lg:z-20 lg:w-64 lg:max-w-none lg:translate-x-0 lg:visible lg:overflow-hidden lg:shadow-[1px_0_0_0_var(--color-line)]",
            "rail:w-[4.75rem] rail-peek:shadow-[10px_0_36px_-14px_rgb(23_43_77/0.4)]",
            open ? "visible translate-x-0" : "invisible -translate-x-full",
          )}
        >
          <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-5">
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

          <div className="px-3 pb-3">
            <label htmlFor={searchId} className="sr-only">
              Search pages
            </label>
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle">
                <Search />
              </span>
              <input
                id={searchId}
                // Not type="search": the pages' own place and area searches are the "searchbox" on a page, and there is one each.
                type="text"
                inputMode="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages"
                autoComplete="off"
                className="h-11 w-full rounded-xl bg-surface-muted pl-12 pr-3 text-sm text-ink transition-colors placeholder:text-ink-subtle focus-visible:bg-surface focus-visible:outline-primary rail:placeholder:text-transparent"
              />
            </div>
          </div>

          {/*
          `relative` keeps the text of the planned items inside this scroll container, so it cannot widen the page; the
          rail's labels are cut off by the sidebar's own edge, not scrolled to.
        */}
          <nav aria-label="Primary" onClick={onNavClick} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-1">
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.label}>
                  {item.status === "available" && item.href ? (
                    <NavLink href={item.href} icon={NAV_ICONS[item.label]({})}>
                      {item.label}
                    </NavLink>
                  ) : (
                    <span className="flex h-11 cursor-not-allowed items-center gap-3 rounded-xl px-4 text-sm text-ink-subtle">
                      <span aria-hidden="true" className="shrink-0 opacity-70">
                        {NAV_ICONS[item.label]({})}
                      </span>
                      <span className={RAIL_LABEL}>{item.label}</span>
                      <Badge aria-hidden="true" className={cn("ml-auto px-1.5 py-0 text-[0.5625rem]", RAIL_LABEL)}>
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

          <div className="px-3 pb-4 pt-3">
            <Badge tone="warning" className={cn("w-full justify-center whitespace-normal py-1 text-center", RAIL_FADE, "rail:h-8 rail:overflow-hidden rail:whitespace-nowrap")}>
              Local prototype · not for deployment
            </Badge>
          </div>
        </aside>
      </div>
    </>
  );
}
