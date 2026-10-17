import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

const primaryLinkClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-navy-950 px-4 py-2 text-sm font-semibold text-on-navy hover:bg-navy-800 sm:w-auto";
const secondaryLinkClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted sm:w-auto";

/**
 * Homepage entry to the globe. A server component with no data of its own: it never reads the geographic data, so it is
 * shown whether or not that data is present (the /globe route handles its own missing-data state), and it imports
 * nothing from the globe feature, so the Overview downloads no Three.js, textures or outline data. The notice is
 * permanent and carries no figures. Links keep the default Next.js prefetching.
 */
export function GlobeEntryCard() {
  return (
    <Card as="section" aria-labelledby="globe-entry-heading" className="mt-6 p-5" data-testid="globe-entry">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id="globe-entry-heading" className="text-base font-semibold tracking-tight text-ink sm:text-lg">
              Explore on the globe
            </h2>
            <Badge>Provisional outlines</Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            Explore places on an interactive 3D globe and inspect provisional geographic outlines.
          </p>
          <p className="mt-2 text-xs leading-5 text-ink-muted" data-testid="globe-entry-notice">
            The outlines use unofficial OpenStreetMap geometry, are not official boundaries, and do not provide complete district or block coverage.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Link href="/globe" className={primaryLinkClass} data-testid="globe-entry-primary">
            Explore on the globe
          </Link>
          <Link href="/workspace" className={secondaryLinkClass} data-testid="globe-entry-secondary">
            Go to the 2D workspace
          </Link>
        </div>
      </div>
    </Card>
  );
}
