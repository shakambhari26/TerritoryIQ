import type { ReactNode } from "react";
import { TopNav } from "@/components/layout/TopNav";
import { SITE } from "@/lib/site";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="absolute left-4 top-4 z-50 -translate-y-24 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-navy-950 focus:translate-y-0"
      >
        Skip to main content
      </a>
      <TopNav />
      <main
        id="main"
        className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      >
        {children}
      </main>
      <footer className="border-t border-line">
        <p className="mx-auto max-w-[1600px] px-4 py-4 text-xs text-ink-muted sm:px-6 lg:px-8">
          {SITE.name} · Local prototype. Overview and Workspace use the company
          workbook and Local Government Directory exports with provisional
          boundaries; the Territory Map page is a data-free layout preview.
        </p>
      </footer>
    </div>
  );
}
