import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { GlobeLoader } from "@/features/globe/components/GlobeLoader";
import { getGlobeManifest } from "@/features/globe/overlay.server";

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
 */
export default function GlobePage() {
  const manifest = getGlobeManifest();
  return (
    <>
      <PageHeader
        title="Globe"
        description="A rotating 3D Earth that flies to a place you choose, stops, and then reveals provisional outlines. A selected place can be opened in the 2D workspace."
        aside={<Badge>Local prototype · not for deployment</Badge>}
      />
      <p
        className="mt-3 max-w-4xl rounded-md border border-dashed border-line-strong bg-surface-muted px-3 py-2 text-xs leading-5 text-ink-muted"
        data-testid="globe-provisional-notice"
      >
        <strong className="font-semibold text-ink">Provisional outlines.</strong> They are unofficial OpenStreetMap geometry, not official boundaries, and no
        authority has reviewed or approved them. Colours show a provisional, unreviewed link to a named representative only. This prototype runs on this
        machine and is not approved for deployment.
      </p>
      <div className="mt-5">
        {manifest ? (
          <GlobeLoader manifest={manifest} />
        ) : (
          <div className="rounded-xl border border-line bg-surface p-6" role="alert">
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
