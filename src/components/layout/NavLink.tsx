"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface NavLinkProps {
  href: string;
  children: ReactNode;
}

/**
 * Primary-nav link that marks itself as the current page. Only the link whose
 * route matches gets `aria-current`; with more than one available route, the
 * markup must not claim every link is the current page.
 *
 * The Workspace link does not prefetch: its payload carries every staff name, and this navigation is on every page,
 * including the globe, which deliberately loads no names until a block is selected. A click still navigates.
 */
export function NavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      prefetch={href === "/workspace" ? false : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-on-navy",
        active
          ? "bg-white/10 after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-accent"
          : "hover:bg-white/5",
      )}
    >
      {children}
    </Link>
  );
}
