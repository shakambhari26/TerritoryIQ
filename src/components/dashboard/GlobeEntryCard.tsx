import Link from "next/link";
import { RotatingEarth } from "@/components/dashboard/RotatingEarth";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

const primaryLinkClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white shadow-float hover:bg-primary-hover sm:w-auto";
const secondaryLinkClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-surface px-5 py-2 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-surface-muted sm:w-auto";

/**
 * Homepage entry to the globe, and the Overview's main geographic visual. A server component with no data of its own:
 * it never reads the geographic data, so it is shown whether or not that data is present (the /globe route handles its
 * own missing-data state), and it imports nothing from the globe feature, so the Overview downloads no Three.js,
 * globe textures or outline data. The Earth is a small still picture (a CSS background, see globals.css) with the small
 * RotatingEarth canvas turning over it; neither says anything about any place. The notice is permanent and carries no
 * figures. Links keep the default Next.js prefetching.
 */
export function GlobeEntryCard() {
  return (
    <Card as="section" aria-labelledby="globe-entry-heading" className="mt-6 overflow-clip" data-testid="globe-entry">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex min-w-0 flex-col justify-center gap-5 p-6 sm:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 id="globe-entry-heading" className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                Explore on the globe
              </h2>
              <Badge tone="warning">Provisional outlines</Badge>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted sm:text-base">
              Explore places on an interactive 3D globe and inspect provisional geographic outlines.
            </p>
            <p className="mt-3 max-w-xl text-xs leading-5 text-ink-muted" data-testid="globe-entry-notice">
              The outlines use unofficial OpenStreetMap geometry, are not official boundaries, and do not provide complete district or block coverage.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/globe" className={primaryLinkClass} data-testid="globe-entry-primary">
              Explore on the globe
            </Link>
            <Link href="/workspace" className={secondaryLinkClass} data-testid="globe-entry-secondary">
              Go to the 2D workspace
            </Link>
          </div>
        </div>

        {/* The Earth: a still picture (public/overview/earth-preview.webp, a CSS background) that shows first, with scripts off and under
            reduced motion, and RotatingEarth turning over it from one small world map (public/overview/earth-map.webp). Both are drawn
            from the NASA texture the globe uses; the Overview still loads no Three.js, none of the globe's own textures and no boundary data. It
            names no place and carries no figures. */}
        <div className="relative grid min-h-64 place-items-center bg-[radial-gradient(ellipse_at_50%_46%,#f6faff_0%,#dfeafa_58%,#c9dbf2_100%)] py-8">
          <div className="earth-preview relative size-52 rounded-full shadow-[0_0_0_1px_rgb(140_185_240/0.55),0_0_34px_6px_rgb(110_170_245/0.38),0_38px_56px_-26px_rgb(20_60_140/0.6)] sm:size-56">
            <RotatingEarth />
          </div>
        </div>
      </div>
    </Card>
  );
}
