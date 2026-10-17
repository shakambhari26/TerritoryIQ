"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { DISTRICT_STYLE } from "../styles";
import type { GlobeManifest } from "../types";
import { GlobeDetails, PlaceSearch } from "./GlobePanel";
import { buildTargets, type Target } from "../targets";

/**
 * What the visitor gets when the 3D globe cannot run (no WebGL). The same places, search and details as the
 * globe, and a static picture of the Earth: the same-origin NASA texture, shown as a CSS disc. Nothing moves, and
 * nothing is drawn that has not passed validation: districts are listed as text with their provisional status.
 */
export function GlobeFallback({ overlay, reason }: { overlay: GlobeManifest; reason: string }) {
  const targets = useMemo(() => buildTargets(overlay), [overlay]);
  const districts = useMemo(() => targets.filter((t) => t.kind === "district").sort((a, b) => a.name.localeCompare(b.name)), [targets]);
  const [selected, setSelected] = useState<Target | null>(null);
  const district = selected?.kind === "district" ? (overlay.districts.find((d) => d.id === selected.id) ?? null) : selected?.kind === "block" ? (overlay.districts.find((d) => d.id === overlay.blocks.find((b) => b.id === selected.id)?.districtId) ?? null) : null;
  const block = selected?.kind === "block" ? (overlay.blocks.find((b) => b.id === selected.id) ?? null) : null;
  const level = !selected ? "globe" : selected.kind === "state" ? "state" : selected.kind;

  return (
    <div className="map-theme grid overflow-hidden rounded-xl border border-line bg-navy-950 lg:grid-cols-[minmax(0,1fr)_23rem]" data-testid="globe-fallback">
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-5 bg-[#02060f] p-6 text-center">
        <div
          role="img"
          aria-label="Static picture of the Earth"
          className="size-56 rounded-full shadow-[0_0_70px_rgba(60,120,255,0.3),inset_-28px_-10px_60px_rgba(0,0,10,0.75)]"
          style={{ backgroundImage: "url(/globe/earth-day-4k.jpg)", backgroundSize: "320% 100%", backgroundPosition: "72% 50%" }}
        />
        <div className="max-w-md space-y-1">
          <p className="text-base font-semibold text-on-navy">The 3D globe is not available</p>
          <p className="text-sm text-on-navy-muted">{reason} The places and details below work without it.</p>
        </div>
        <ul className="flex max-w-lg flex-wrap justify-center gap-1.5" aria-label="Districts and their provisional status">
          {districts.map((d) => (
            <li key={d.id} className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 text-xs text-on-navy-muted">
              <span aria-hidden="true" className={cn("size-2 rounded-full")} style={{ backgroundColor: DISTRICT_STYLE[d.state].fill }} />
              {d.name}
            </li>
          ))}
        </ul>
        <p className="text-[0.6875rem] text-on-navy-subtle">Earth: NASA Earth Observatory, Blue Marble. District status is provisional and unreviewed.</p>
      </div>
      <aside className="space-y-4 border-t border-line bg-surface p-4 lg:border-l lg:border-t-0">
        <PlaceSearch targets={targets} districts={districts} onSelect={setSelected} disabled={false} />
        <GlobeDetails
          overlay={overlay}
          level={level}
          district={district}
          block={block}
          disabled={false}
          outlines="unavailable"
          onSelectBlock={(id) => setSelected(targets.find((t) => t.kind === "block" && t.id === id) ?? null)}
          onSelectDistrict={(id) => setSelected(targets.find((t) => t.kind === "district" && t.id === id) ?? null)}
        />
      </aside>
    </div>
  );
}
