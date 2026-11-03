"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { StateBar } from "@/features/territory/components/StateBar";
import { useLocalChanges } from "@/features/allocation/overlay-store";
import { StateChip } from "@/features/territory/components/state-style";
import { formatCount, STATE_MEANING } from "@/features/territory/format";
import type { GlobeInsights, StaffSlotCounts } from "../insights";
import type { GlobeManifest, Level, ManifestBlock, ManifestDistrict } from "../types";

type Tone = "default" | "blue" | "teal" | "warn";

const VALUE_TONE: Record<Tone, string> = {
  default: "text-ink",
  blue: "text-primary-ink",
  teal: "text-accent-ink",
  warn: "text-warn-ink",
};

const TILE_TONE: Record<Tone, string> = {
  default: "bg-surface-muted",
  blue: "bg-primary-soft",
  teal: "bg-accent-soft",
  warn: "bg-warn-soft",
};

/** One figure with what it counts. A term and its value, so a screen reader reads "Districts, 23". */
function Metric({ label, value, caption, tone = "default", tile = false, wide = false }: { label: string; value: string; caption?: string; tone?: Tone; tile?: boolean; wide?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-xl px-3 py-2.5", tile ? TILE_TONE[tone] : "border border-line bg-white", wide && "col-span-2")}>
      <dl>
        <dt className="text-[0.6875rem] font-semibold uppercase leading-4 tracking-wide text-ink-muted">{label}</dt>
        <dd className={cn("mt-0.5 text-xl font-semibold leading-7 tracking-tight tabular-nums", VALUE_TONE[tone])}>{value}</dd>
        {caption ? <dd className="mt-0.5 text-[0.6875rem] leading-4 text-ink-muted">{caption}</dd> : null}
      </dl>
    </div>
  );
}

function Section({ title, subtitle, children, testId }: { title: string; subtitle?: string; children: ReactNode; testId: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-line bg-white p-3.5" data-testid={testId}>
      <h3 id={id} className="text-sm font-semibold tracking-tight text-ink">
        {title}
      </h3>
      {subtitle ? <p className="mt-0.5 text-[0.6875rem] leading-4 text-ink-muted">{subtitle}</p> : null}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

const slotTotal = (staff: StaffSlotCounts) => staff.named + staff.vacant;

/** Staff slots are their own count: a named slot or a Vacant marker. They are not an allocation state. */
function StaffLine({ staff, scope }: { staff: StaffSlotCounts; scope: string }) {
  return (
    <Group label="Staff slots, counted apart from geography">
      <p className="text-xs leading-5 text-ink" data-testid="insight-staff">
        <strong className="font-semibold tabular-nums">{formatCount(staff.named)}</strong> named ·{" "}
        <strong className="font-semibold tabular-nums">{formatCount(staff.vacant)}</strong> Vacant {staff.vacant === 1 ? "marker" : "markers"} {scope}. A slot is not a
        person and not an allocation state.
      </p>
    </Group>
  );
}

interface Props {
  manifest: GlobeManifest;
  level: Level;
  district: ManifestDistrict | null;
  block: ManifestBlock | null;
  insights: GlobeInsights | null;
}

const NOT_BUILT = "The workbook figures are not available because the data has not been built (npm run data:build).";

/**
 * The right-hand insights for the place the globe is on: region overview, allocation overview and quick insights. Every
 * figure is a count the app already computes (the globe manifest's counts, and `GlobeInsights`, which reads the
 * Overview's model). Nothing is a trend, a forecast or a percentage that no source defines. It adapts to the level:
 * the whole globe and the state show West Bengal, a district shows its blocks, a block shows itself.
 */
export function InsightSections({ manifest, level, district, block, insights }: Props) {
  // The figures are the workbook baseline. A change a reviewer recorded in this browser is not in them, and the panel says so when one exists.
  const localChanges = useLocalChanges().changes.length;
  const counts = manifest.meta.counts;
  const districtInsight = district && insights ? insights.districts[district.id] : undefined;
  const blockInsight = block && insights ? insights.blocks[block.id] : undefined;
  const atBlock = level === "block" && block !== null;
  const atDistrict = level === "district" && district !== null;
  const heading = atBlock ? block.name : atDistrict ? district.name : manifest.state.name;

  // ---------------------------------------------------------------- region --
  let region: ReactNode;
  if (atBlock) {
    const staff = blockInsight?.staff;
    region = (
      <>
        <Metric tile tone="blue" label="Outline" value={block.geometry ? "Provisional" : "None"} caption={block.geometry ? "unofficial OpenStreetMap shape" : "no validated shape for this block"} />
        <Metric tile tone="blue" label="Workbook rows" value={formatCount(block.rowIds.length)} caption="linked to this block" />
        <Metric tile wide label="Staff slots" value={staff ? formatCount(slotTotal(staff)) : "–"} caption={staff ? `${formatCount(staff.named)} named · ${formatCount(staff.vacant)} vacant markers` : "workbook data not built"} />
      </>
    );
  } else if (atDistrict) {
    const staff = districtInsight?.staff;
    region = (
      <>
        <Metric tile tone="blue" label="Blocks" value={formatCount(district.blockCount)} caption="in the reference list" />
        <Metric tile tone="blue" label="Provisional outlines" value={formatCount(district.drawnBlockCount)} caption={`of ${formatCount(district.blockCount)} blocks`} />
        <Metric tile wide label="Staff slots" value={staff ? formatCount(slotTotal(staff)) : "–"} caption={staff ? `${formatCount(staff.named)} named · ${formatCount(staff.vacant)} vacant markers` : "workbook data not built"} />
      </>
    );
  } else {
    const staff = insights?.state.staff;
    region = (
      <>
        <Metric tile tone="blue" label="Districts" value={formatCount(counts.districts)} caption={`${formatCount(counts.districtsDrawn)} with a provisional outline`} />
        <Metric tile tone="blue" label="Provisional block outlines" value={formatCount(counts.blocksDrawn)} caption={`of ${formatCount(counts.blocks)} reference blocks`} />
        <Metric tile wide label="Staff slots" value={staff ? formatCount(slotTotal(staff)) : "–"} caption={staff ? `${formatCount(staff.named)} named · ${formatCount(staff.vacant)} vacant markers` : "workbook data not built"} />
      </>
    );
  }

  // ------------------------------------------------------------ allocation --
  let allocation: ReactNode;
  if (!insights) {
    allocation = <p className="text-xs leading-5 text-ink-muted">{NOT_BUILT}</p>;
  } else if (atBlock && blockInsight) {
    allocation = (
      <>
        <Group label="Workbook allocation state of this block">
          <StateChip state={blockInsight.state} />
          <p className="mt-1.5 text-xs leading-5 text-ink-muted">{STATE_MEANING[blockInsight.state]}</p>
        </Group>
        <StaffLine staff={blockInsight.staff} scope="in the linked rows" />
      </>
    );
  } else if (atDistrict && districtInsight) {
    allocation = (
      <>
        <Group label="Reference blocks in this district">
          <StateBar counts={districtInsight.blocks.byState} total={districtInsight.blocks.total} label="Blocks in this district" stacked />
        </Group>
        <Group label="Workbook rows linked to this district">
          {districtInsight.rows.linked > 0 ? (
            <StateBar counts={districtInsight.rows.byState} total={districtInsight.rows.linked} label="Workbook rows linked to this district" stacked />
          ) : (
            <p className="text-xs leading-5 text-ink-muted">No workbook row is linked to this district or its blocks.</p>
          )}
        </Group>
        <StaffLine staff={districtInsight.staff} scope="in those rows" />
      </>
    );
  } else {
    allocation = (
      <>
        <Group label="Workbook rows">
          <StateBar counts={insights.state.rows.byState} total={insights.state.rows.total} label="Workbook rows" stacked />
        </Group>
        <Group label="Reference blocks">
          <StateBar counts={insights.state.blocks.byState} total={insights.state.blocks.total} label="Reference blocks" stacked />
          <p className="mt-2 text-[0.6875rem] leading-4 text-ink-muted">
            {formatCount(counts.blocksDrawn)} of {formatCount(counts.blocks)} blocks have a provisional outline. An outline shows where a block is, not who covers it. A block with no row linked, or
            whose row lists no one, is missing / unverified, not unallocated.
          </p>
        </Group>
        <StaffLine staff={insights.state.staff} scope="across all rows" />
      </>
    );
  }

  // ----------------------------------------------------------------- quick --
  let quick: ReactNode;
  if (atBlock) {
    quick = (
      <>
        <Metric label="Provisional link" value={block.state === "represented" ? "Yes" : block.state === "no-representative" ? "No" : "Unresolved"} caption="named row, unreviewed" />
        <Metric label="Shared by rows" value={block.contested ? "Yes" : "No"} caption="more than one row linked" tone={block.contested ? "warn" : "default"} />
      </>
    );
  } else if (atDistrict) {
    const byState = districtInsight?.blocks.byState;
    quick = (
      <>
        <Metric label="Provisional links" value={formatCount(district.representedBlockCount)} caption={`of ${formatCount(district.blockCount)} blocks`} tone="teal" />
        <Metric label="Without outline" value={formatCount(district.blockCount - district.drawnBlockCount)} caption="listed, none drawn" />
        <Metric label="Conflicting" value={byState ? formatCount(byState.conflicting) : "–"} caption="blocks with conflicting rows" tone={byState && byState.conflicting > 0 ? "warn" : "default"} />
        <Metric label="Missing / unverified" value={byState ? formatCount(byState.missing) : "–"} caption="no row linked, or no one listed" />
      </>
    );
  } else {
    quick = (
      <>
        <Metric label="Provisional links" value={formatCount(counts.blocksRepresented)} caption={`of ${formatCount(counts.blocks)} blocks, unreviewed`} tone="teal" />
        <Metric label="Without outline" value={formatCount(counts.blocks - counts.blocksDrawn)} caption="listed, none drawn" />
        <Metric label="Shared by rows" value={formatCount(counts.blocksContested)} caption="blocks with more than one row" tone={counts.blocksContested > 0 ? "warn" : "default"} />
        <Metric label="Sales territories" value={insights ? formatCount(insights.state.salesTerritories) : "–"} caption="the company’s own grouping" />
      </>
    );
  }

  return (
    <div className="space-y-3" data-testid="globe-insights" data-level={level}>
      {level === "globe" ? (
        <p className="rounded-xl bg-primary-soft px-3 py-2 text-xs leading-5 text-primary-ink">
          {manifest.state.name} is the only region with data. Figures below are for {manifest.state.name}; choose it to fly there.
        </p>
      ) : null}
      {localChanges > 0 ? (
        <p className="rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-xs leading-5 text-warn-ink" role="note" data-testid="insight-local-changes">
          <strong className="font-semibold">Baseline figures.</strong> {formatCount(localChanges)} {localChanges === 1 ? "change" : "changes"} recorded in this browser {localChanges === 1 ? "is" : "are"} not included here. The Overview applies{" "}
          {localChanges === 1 ? "it" : "them"}, so its figures can differ.
        </p>
      ) : null}
      <Section title="Region overview" subtitle={heading} testId="insight-region">
        <div className="grid grid-cols-2 gap-2">{region}</div>
      </Section>
      <Section title="Allocation overview" subtitle="Workbook baseline. Rows, blocks and staff slots are separate counts." testId="insight-allocation">
        {allocation}
      </Section>
      <Section title="Quick insights" testId="insight-quick">
        <div className="grid grid-cols-2 gap-2">{quick}</div>
      </Section>
      <p className="px-1 text-[0.6875rem] leading-4 text-ink-muted" data-testid="insight-basis">
        Figures are the workbook baseline, counted the same way as the Overview before any local change. Changes a reviewer records in this browser are applied on the Overview and the Workspace, not here.
        Globe colours show a provisional representative link only; they are not these allocation states.
      </p>
    </div>
  );
}
