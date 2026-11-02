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
 * Sidebar link that marks itself as the current page. In the icon rail (`rail:`, see globals.css) the label stays in the
 * document for assistive technology but is not drawn. Only the link whose
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
        "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors rail:justify-center rail:px-0",
        active ? "bg-primary-soft font-semibold text-primary-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
      )}
    >
      {active ? <span aria-hidden="true" className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-primary" /> : null}
      <span aria-hidden="true" className={cn("shrink-0", active ? "text-primary" : "text-ink-subtle group-hover:text-ink-muted")}>
        {icon}
      </span>
      <span className="rail:sr-only">{children}</span>
    </Link>
  );
}
