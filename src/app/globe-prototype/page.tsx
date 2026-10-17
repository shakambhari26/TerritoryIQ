import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { GlobeLoader } from "@/features/globe/components/GlobeLoader";
import { getGlobeManifest } from "@/features/globe/overlay.server";

export const metadata: Metadata = {
  title: "Globe prototype",
};

/**
 * An isolated prototype of a realistic, rotating 3D Earth for the territory experience. It is not linked from the
 * navigation and does not touch the Territory Workspace. Outlines are the provisional OpenStreetMap shapes that passed
 * validation in scripts/globe/build_overlay.py; the page carries only that validation record, and the browser fetches
 * the outlines themselves, in parallel with the textures, from the same-origin /geo/globe-boundaries.json (the globe's
 * own file, not the workspace's /geo/boundaries.json).
 */
export default function GlobePrototypePage() {
  const manifest = getGlobeManifest();
  return (
    <>
      <PageHeader
        title="Globe prototype"
        description="A rotating 3D Earth that flies to a place you choose, stops, and then reveals provisional outlines. Isolated from the Territory Workspace."
        aside={<Badge>Prototype · not integrated</Badge>}
      />
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
