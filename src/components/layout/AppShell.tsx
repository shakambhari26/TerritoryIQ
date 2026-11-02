import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { SITE } from "@/lib/site";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <a
        href="#main"
        className="absolute left-4 top-4 z-[60] -translate-y-24 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white focus:translate-y-0"
      >
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main id="main" className="mx-auto w-full max-w-[1760px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
        <footer>
          <p className="mx-auto max-w-[1760px] px-4 pb-5 text-xs text-ink-muted sm:px-6 lg:px-8">
            {SITE.name} · Local prototype. Overview and Workspace use the company workbook and Local Government Directory exports with provisional
            boundaries; the Territory Map page is a data-free layout preview.
          </p>
        </footer>
      </div>
    </div>
  );
}
