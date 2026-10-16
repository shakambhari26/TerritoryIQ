import type { ReactNode } from "react";

interface MapWorkspaceProps {
  title: string;
  /** The map's header: location, layer switch, search. */
  toolbar?: ReactNode;
  /** The map surface. Positioned and sized by this frame; the map fills it. */
  children: ReactNode;
  /** Optional strip below the map surface, e.g. a legend. */
  footer?: ReactNode;
}

/**
 * Navy frame for the map (the `map-theme` scope in globals.css re-themes everything inside it). Owns sizing,
 * chrome and the section landmark; the map implementation itself lives in src/features/territory (GeoMap). The
 * frame takes most of the viewport height so the map is the main thing on the page.
 */
export function MapWorkspace({ title, toolbar, children, footer }: MapWorkspaceProps) {
  return (
    <section
      aria-labelledby="map-workspace-title"
      data-testid="map-workspace"
      className="map-theme flex flex-col rounded-2xl border border-line bg-surface shadow-card lg:h-[calc(100dvh-5rem)] lg:min-h-[38rem]"
    >
      <h2 id="map-workspace-title" className="sr-only">
        {title}
      </h2>
      {toolbar ? <header className="relative z-20 border-b border-line px-3 py-2.5 sm:px-4">{toolbar}</header> : null}
      <div className="relative h-[64dvh] min-h-[24rem] overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1">{children}</div>
      {footer ? <div className="rounded-b-2xl border-t border-line bg-surface-muted/60">{footer}</div> : null}
    </section>
  );
}
