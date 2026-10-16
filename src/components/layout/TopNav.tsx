import Link from "next/link";
import { NavLink } from "@/components/layout/NavLink";
import { Badge } from "@/components/ui/Badge";
import { LogoMark } from "@/components/ui/LogoMark";
import { NAV_ITEMS, SITE } from "@/lib/site";

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-950 text-on-navy">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-8 gap-y-1 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-md">
          <LogoMark />
          <span className="leading-tight">
            <span className="block text-base font-semibold tracking-tight">
              {SITE.name}
            </span>
            <span className="hidden text-xs text-on-navy-subtle sm:block">
              {SITE.tagline}
            </span>
          </span>
        </Link>

        <Badge tone="navy" className="ml-auto xl:order-last">
          Local prototype · not for deployment
        </Badge>

        {/*
          `relative` is required: the sr-only text below is absolutely
          positioned, and would otherwise escape this scroll container's
          clipping and widen the whole page.
          The nav shares a row with the brand and badge only from `xl`;
          below that it takes its own full-width row (scrollable on phones).
        */}
        <nav
          aria-label="Primary"
          className="relative -mx-1 w-full overflow-x-auto px-1 xl:mx-0 xl:w-auto xl:flex-1 xl:px-0"
        >
          <ul className="flex items-center gap-1 whitespace-nowrap">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                {item.status === "available" && item.href ? (
                  <NavLink href={item.href}>{item.label}</NavLink>
                ) : (
                  <span className="inline-flex h-10 cursor-not-allowed items-center gap-2 px-3 text-sm text-on-navy-subtle">
                    {item.label}
                    <Badge tone="navy" aria-hidden="true">
                      Soon
                    </Badge>
                    <span className="sr-only">(planned, not yet available)</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
