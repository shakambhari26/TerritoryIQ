"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { CustomerSummary } from "../customers";
import type { GlobeInsights } from "../insights";
import type { GlobeManifest } from "../types";

/**
 * Loads the globe only in the browser, and only for this page: Three.js and the renderer are code-split out of
 * every other route, and nothing here runs WebGL on the server.
 */
const GlobeExperience = dynamic(() => import("./GlobeExperience"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[clamp(26rem,calc(100dvh-17.5rem),44rem)] md:h-[clamp(30rem,calc(100dvh-15rem),44rem)] items-center justify-center rounded-card border border-line lg:h-[clamp(32rem,calc(100dvh-13.5rem),46rem)] bg-[radial-gradient(ellipse_at_50%_46%,#f3f8fe_0%,#dbe8f7_52%,#c3d6ec_100%)]" role="status">
      <p className="text-sm text-ink-muted">Loading the globe…</p>
    </div>
  ),
});

class LoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center" role="alert" data-testid="globe-error">
        <p className="text-base font-semibold text-ink">The globe could not be loaded</p>
        <p className="mt-1 text-sm text-ink-muted">The script for this page did not load. Reload the page to try again.</p>
      </div>
    );
  }
}

export function GlobeLoader({ manifest, insights = null, customers = null }: { manifest: GlobeManifest; insights?: GlobeInsights | null; customers?: CustomerSummary | null }) {
  return (
    <LoadBoundary>
      <GlobeExperience manifest={manifest} insights={insights} customers={customers} />
    </LoadBoundary>
  );
}
