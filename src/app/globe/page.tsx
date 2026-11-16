import type { Metadata } from "next";
import { GlobeLoader } from "@/features/globe/components/GlobeLoader";
import { getGlobeManifest } from "@/features/globe/overlay.server";

export const metadata: Metadata = {
  title: "Globe",
};

/**
 * The sales team map: a 3D Earth that flies to West Bengal and shows, for every district and block, who works there.
 *
 * The ONLY data on the globe is the area-mapping sheet (data-source/AREA MAPPING.xlsx), placed on OpenStreetMap
 * outlines by scripts/globe/build-area-map.mts (rules in scripts/globe/area-mapping.config.ts). Clicking a district
 * shows everyone working there by role; clicking a block shows its ASM, Primary, Secondary and DSO. Staff names are not
 * in the page: they are fetched for the selected place from /api/globe/block-rows and /api/globe/district-team.
 * Dealers, distributors and influencers are planned as later layers.
 */
export default function GlobePage() {
  const manifest = getGlobeManifest();
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Globe</h1>
        <p className="min-w-[18rem] flex-1 text-xs leading-5 text-ink-muted" data-testid="globe-provisional-notice">
          How many people work in each district and block. Red means few people: hire there. Click a place to see who works there.
        </p>
      </div>
      <div className="mt-3">
        {manifest ? (
          <GlobeLoader manifest={manifest} />
        ) : (
          <div className="rounded-card bg-surface p-6 shadow-card" role="alert">
            <p className="text-base font-semibold text-ink">The globe data has not been built</p>
            <p className="mt-1 text-sm text-ink-muted">
              Run <code className="font-mono">npm run data:build</code>, then <code className="font-mono">npm run data:build-globe</code>, and restart the server.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
