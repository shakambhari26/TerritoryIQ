"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface NavLinkProps {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}

/**
 * How a sidebar label fades with the icon rail (`rail:`, see globals.css): transparent at rest and fading in a moment after
 * the sidebar starts to widen (so the text never wraps against a narrow edge), and out at once. The text stays in the
 * document for assistive technology either way.
 */
export const RAIL_FADE = "transition-opacity duration-150 delay-75 rail:opacity-0 rail:delay-0 motion-reduce:transition-none";
/** The same for a one-line label, which never wraps (the sidebar's edge cuts it off at rest). */
export const RAIL_LABEL = `whitespace-nowrap ${RAIL_FADE}`;

/**
 * Sidebar link that marks itself as the current page. In the icon rail the label stays in the document for assistive
 * technology but is not drawn, and the icon does not move when the sidebar opens (its row has the same padding in both
 * states, 16 px, which centres a 20 px icon in the 52 px of a rail row). Only the link whose
 * route matches gets `aria-current`; with more than one available route, the
 * markup must not claim every link is the current page.
 *
 * The Workspace link does not prefetch: its payload carries every staff name, and this navigation is on every page,
 * including the globe, which deliberately loads no names until a block is selected. A click still navigates.
 */
export function NavLink({ href, icon, children }: NavLinkProps) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      prefetch={href === "/workspace" ? false : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-11 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors",
        active ? "bg-primary-soft font-semibold text-primary-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
      )}
    >
      {active ? <span aria-hidden="true" className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-primary" /> : null}
      <span aria-hidden="true" className={cn("shrink-0", active ? "text-primary" : "text-ink-subtle group-hover:text-ink-muted")}>
        {icon}
      </span>
      <span className={RAIL_LABEL}>{children}</span>
    </Link>
  );
}
