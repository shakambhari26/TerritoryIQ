import type { ReactNode } from "react";

interface MapWorkspaceProps {
  title: string;
  /** The map's header: location, layer switch, search. */
  toolbar?: ReactNode;
  /** Status lines (a missing outline, a district's coverage), in the flow between the header and the map so they never cover it. */
  status?: ReactNode;
  /** The map surface. Positioned and sized by this frame; the map fills it. */
  children: ReactNode;
  /** Optional strip below the map surface: the notes and attribution, and on a small screen the jump to the details. */
  footer?: ReactNode;
  /** Optional figures between the map surface and the footer. */
  kpis?: ReactNode;
  /** Optional column to the left of the map surface (it brings its own width and decides for itself when to show). */
  rail?: ReactNode;
}

/**
 * White frame for the map: a card with a toolbar, optional status line, an optional left rail, the map surface (a rounded
 * warm sheet inset in the card), optional figures and a footer line. Owns sizing, chrome and the section landmark; the map
 * implementation itself lives in src/features/territory (GeoMap). The parts are separated by space, not rules. On a wide screen
 * the frame takes the viewport height left under the page heading, so the map is the main thing on the page; the header,
 * status line, figures and footer are kept slim and sit in the flow, never over the map.
 */
export function MapWorkspace({ title, toolbar, status, children, footer, kpis, rail }: MapWorkspaceProps) {
  return (
    <section
      aria-labelledby="map-workspace-title"
      data-testid="map-workspace"
      className="flex flex-col gap-2.5 rounded-card border border-line/80 bg-surface p-1.5 shadow-card sm:p-3 lg:h-[calc(100dvh-6rem)] lg:min-h-[38rem]"
    >
      <h2 id="map-workspace-title" className="sr-only">
        {title}
      </h2>
      {toolbar ? <header className="relative z-20 px-0.5">{toolbar}</header> : null}
      {status ? <div className="space-y-1 px-0.5 text-xs leading-5 text-ink-muted">{status}</div> : null}
      <div className="flex min-h-0 gap-2.5 lg:flex-1">
        {rail}
        <div className="relative h-[70dvh] min-h-[26rem] min-w-0 flex-1 overflow-hidden rounded-xl bg-[#f0eee8] ring-1 ring-black/[0.04] lg:h-auto lg:min-h-0">{children}</div>
      </div>
      {kpis}
      {footer ? <div className="px-0.5">{footer}</div> : null}
    </section>
  );
}
