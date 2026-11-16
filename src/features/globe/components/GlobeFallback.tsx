"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { GlobeManifest } from "../types";
import { GlobeDetails, SearchBox } from "./GlobePanel";
import { useDistrictTeam } from "./TeamSection";
import { bandFor, districtAverage, NOT_IN_SHEET } from "../staffing";
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
  const districtBlocks = useMemo(() => (district ? overlay.blocks.filter((b) => b.districtId === district.id) : []), [overlay.blocks, district]);
  const districtTeam = useDistrictTeam(district?.id ?? null, districtBlocks);

  return (
    <>
      <div className="grid overflow-hidden rounded-card border border-line bg-surface shadow-card lg:grid-cols-[minmax(0,1fr)_22rem]" data-testid="globe-fallback">
        <div className="flex min-h-[360px] flex-col items-center justify-center gap-5 bg-[radial-gradient(ellipse_at_50%_46%,#f3f8fe_0%,#dbe8f7_52%,#c3d6ec_100%)] p-6 text-center">
          <div
            role="img"
            aria-label="Static picture of the Earth"
            className="size-56 rounded-full shadow-[0_0_48px_rgba(63,126,203,0.35),inset_-24px_-8px_48px_rgba(8,22,60,0.45)]"
            style={{ backgroundImage: "url(/globe/earth-day-4k.jpg)", backgroundSize: "320% 100%", backgroundPosition: "72% 50%" }}
          />
          <div className="max-w-md space-y-1">
            <p className="text-base font-semibold text-ink">The 3D globe is not available</p>
            <p className="text-sm text-ink-muted">{reason} The places and details below work without it.</p>
          </div>
          <ul className="flex max-w-lg flex-wrap justify-center gap-1.5" aria-label="Districts in the area-mapping sheet">
            {districts.map((d) => (
              <li key={d.id} className="flex items-center gap-1.5 rounded-full border border-line bg-white/90 px-2 py-0.5 text-xs text-ink">
                <span aria-hidden="true" className={cn("size-2 rounded-full")} style={{ backgroundColor: (() => { const avg = districtAverage(overlay.districts.find((x) => x.id === d.id)!, overlay.blocks); return avg === null ? NOT_IN_SHEET : bandFor(avg).colour; })() }} />
                {d.name}
              </li>
            ))}
          </ul>
          <p className="text-[0.6875rem] text-ink-muted">Earth: NASA Earth Observatory, Blue Marble.</p>
        </div>
        <aside className="flex flex-col gap-4 border-t border-line bg-surface p-4 lg:h-[min(74vh,780px)] lg:min-h-[440px] lg:border-l lg:border-t-0">
          <SearchBox targets={targets} onSelect={setSelected} disabled={false} />
          <GlobeDetails
            overlay={overlay}
            level={level}
            district={district}
            block={block}
            disabled={false}
            districtTeam={districtTeam}
            onSelectBlock={(id) => setSelected(targets.find((t) => t.kind === "block" && t.id === id) ?? null)}
            onSelectDistrict={(id) => setSelected(targets.find((t) => t.kind === "district" && t.id === id) ?? null)}
          />
        </aside>
      </div>
    </>
  );
}
