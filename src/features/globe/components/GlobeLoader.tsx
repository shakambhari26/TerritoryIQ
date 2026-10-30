"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { CustomerSummary } from "../customers";
import type { GlobeManifest } from "../types";

/**
 * Loads the globe only in the browser, and only for this page: Three.js and the renderer are code-split out of
 * every other route, and nothing here runs WebGL on the server.
 */
const GlobeExperience = dynamic(() => import("./GlobeExperience"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[min(74vh,780px)] min-h-[440px] items-center justify-center rounded-xl border border-line bg-[#f8fafc]" role="status">
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
      <div className="rounded-xl border border-line bg-surface p-6 text-center" role="alert" data-testid="globe-error">
        <p className="text-base font-semibold text-ink">The globe could not be loaded</p>
        <p className="mt-1 text-sm text-ink-muted">The script for this page did not load. Reload the page to try again.</p>
      </div>
    );
  }
}

export function GlobeLoader({ manifest, customers }: { manifest: GlobeManifest; customers: CustomerSummary | null }) {
  return (
    <LoadBoundary>
      <GlobeExperience manifest={manifest} customers={customers} />
    </LoadBoundary>
  );
}
