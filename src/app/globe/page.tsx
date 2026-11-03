import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { GlobeLoader } from "@/features/globe/components/GlobeLoader";
import { getCustomerSummary } from "@/features/globe/customers.server";
import { buildGlobeInsights } from "@/features/globe/insights";
import { getGlobeManifest } from "@/features/globe/overlay.server";
import { getOverviewData } from "@/features/territory/dataset.server";

export const metadata: Metadata = {
  title: "Globe",
};

/**
 * A realistic, rotating 3D Earth for the territory experience, linked from the navigation as a locally integrated
 * prototype. It does not replace or change the Territory Overview or the Territory Workspace; a selected place can be
 * opened in the 2D workspace through a link (features/globe/workspace-link.ts). Outlines are the provisional
 * OpenStreetMap shapes that passed validation in scripts/globe/build_overlay.py; the page carries only that validation
 * record, and the browser fetches the outlines themselves, in parallel with the textures, from the same-origin
 * /geo/globe-boundaries.json (the globe's own file, not the workspace's /geo/boundaries.json). /globe-prototype, the
 * route this page started on, redirects here (next.config.ts).
 *
 * The page is the globe first: a slim header with the standing provisional notice, then a stage that the globe fills
 * and the place list and insights float over. The insight figures are counts computed from the Overview's own data
 * (features/globe/insights.ts); like the Overview's, they carry no staff name.
 */
export default function GlobePage() {
  const manifest = getGlobeManifest();
  const overview = getOverviewData();
  const insights = overview ? buildGlobeInsights(overview) : null;
  // Counts only: customer names are fetched for one selected block (POST /api/globe/block-customers).
  const customers = getCustomerSummary();
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Globe</h1>
          <Badge tone="warning">Local prototype · not for deployment</Badge>
        </div>
        <p
          className="min-w-[18rem] flex-1 rounded-xl bg-warn-soft px-4 py-2 text-xs leading-5 text-warn-ink"
          data-testid="globe-provisional-notice"
        >
          <strong className="font-semibold">Provisional outlines.</strong> They are unofficial OpenStreetMap geometry, not official boundaries, and no
          authority has reviewed or approved them. Colours show a provisional, unreviewed link to a named representative only. This prototype runs on this
          machine and is not approved for deployment.
        </p>
      </div>
      <div className="mt-3">
        {manifest ? (
          <GlobeLoader manifest={manifest} insights={insights} customers={customers} />
        ) : (
          <div className="rounded-card bg-surface p-6 shadow-card" role="alert">
            <p className="text-base font-semibold text-ink">The globe data has not been built</p>
            <p className="mt-1 text-sm text-ink-muted">
              Run <code className="font-mono">npm run data:build</code>, then <code className="font-mono">python -I scripts/globe/build_overlay.py</code>, and restart the server.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
