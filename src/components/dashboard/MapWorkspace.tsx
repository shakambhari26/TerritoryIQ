import type { ReactNode } from "react";

interface MapWorkspaceProps {
  title: string;
  /** The map's header: location, layer switch, search. */
  toolbar?: ReactNode;
  /** Status lines (a missing outline, a district's coverage), in the flow between the header and the map so they never cover it. */
  status?: ReactNode;
  /** The map surface. Positioned and sized by this frame; the map fills it. */
  children: ReactNode;
  /** Optional strip below the map surface, e.g. a legend. */
  footer?: ReactNode;
}

/**
 * Navy frame for the map (the `map-theme` scope in globals.css re-themes everything inside it). Owns sizing,
 * chrome and the section landmark; the map implementation itself lives in src/features/territory (GeoMap). On a
 * wide screen the frame takes the viewport height left under the page heading, so the map is the main thing on the page;
 * its header, status lines and footer are kept slim and sit in the flow, never over the map.
 */
export function MapWorkspace({ title, toolbar, status, children, footer }: MapWorkspaceProps) {
  return (
    <section
      aria-labelledby="map-workspace-title"
      data-testid="map-workspace"
      className="map-theme flex flex-col rounded-2xl border border-line bg-surface shadow-card lg:h-[calc(100dvh-10rem)] lg:min-h-[34rem]"
    >
      <h2 id="map-workspace-title" className="sr-only">
        {title}
      </h2>
      {toolbar ? <header className="relative z-20 border-b border-line px-3 py-2 sm:px-4">{toolbar}</header> : null}
      {status ? <div className="space-y-1 border-b border-line bg-surface-muted/40 px-3 py-1.5 text-xs leading-5 text-ink-muted sm:px-4">{status}</div> : null}
      <div className="relative h-[70dvh] min-h-[26rem] overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1">{children}</div>
      {footer ? <div className="rounded-b-2xl border-t border-line bg-surface-muted/60">{footer}</div> : null}
    </section>
  );
}
