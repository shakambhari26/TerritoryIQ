"use client";

import Link from "next/link";
import { useMemo } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { useLocalChanges } from "@/features/allocation/overlay-store";
import { LINK_LABEL, LINK_MEANING, REFERENCE_LIST_NOTE, formatCount, plural, shortHash } from "../format";
import { buildModel } from "../model";
import { ALLOCATION_STATES, ALLOCATION_STATE_LABEL, type BoundaryLayerMeta, type TerritoryDataset } from "../types";
import { StateBar } from "./StateBar";
import { StateChip } from "./state-style";
import { buttonClass } from "./ui";

function Panel({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <Card as="section" aria-label={title} className="p-5" data-testid={testId}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm text-ink">{children}</div>
    </Card>
  );
}

export function OverviewDashboard({ dataset, layerMeta }: { dataset: TerritoryDataset; layerMeta: BoundaryLayerMeta | null }) {
  const local = useLocalChanges();
  const model = useMemo(() => buildModel(dataset, local.changes), [dataset, local.changes]);
  const s = model.summary;

  const gaps = useMemo(() => {
    const unlisted = dataset.features.filter((f) => {
      if (f.kind !== "block") return false;
      const a = model.featureAllocation.get(f.id)!;
      return a.claimants.length + a.contestedBy.length + a.possibleRows.length === 0;
    });
    const byDistrict = new Map<string, number>();
    for (const f of unlisted) byDistrict.set(f.districtId!, (byDistrict.get(f.districtId!) ?? 0) + 1);
    const districtNote = [...byDistrict.entries()]
      .map(([id, n]) => `${model.featureById.get(id)?.name} (${n})`)
      .join(", ");
    const districtsWithoutBlocks = dataset.features
      .filter((f) => f.kind === "district" && !dataset.features.some((b) => b.kind === "block" && b.districtId === f.id))
      .map((f) => f.name);
    return { unlisted: unlisted.length, districtNote, districtsWithoutBlocks };
  }, [dataset, model]);

  const linkRows = (["reviewed", "provisional", "ambiguous", "weak", "none", "excluded"] as const).filter(
    (status) => s.links.byStatus[status] > 0 || status === "provisional",
  );

  return (
    <div className="mt-6 space-y-6" data-testid="overview">
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">
          Key indicators
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div data-testid="kpi-territories">
            <KpiCard
              label="Sales territories"
              value={formatCount(dataset.salesTerritories.length)}
              caption={`${plural(s.units.total, "workbook row")}, the company’s own grouping`}
            />
          </div>
          <div data-testid="kpi-allocated">
            <KpiCard
              label="Rows allocated"
              value={formatCount(s.units.byState.allocated)}
              caption={`${formatCount(s.units.byState.conflicting)} conflicting · ${formatCount(s.units.byState.missing)} missing · ${formatCount(s.units.byState.confirmed_unallocated)} confirmed unallocated`}
            />
          </div>
          <div data-testid="kpi-outlined">
            <KpiCard
              label="Blocks with an outline"
              value={formatCount(s.blocks.withBoundary)}
              caption={`of ${formatCount(s.blocks.total)} blocks in the current reference list, plus ${s.districts.withBoundary} of ${s.districts.total} districts. Provisional.`}
            />
          </div>
          <div data-testid="kpi-staffing">
            <KpiCard
              label="Staff slots filled"
              value={formatCount(s.staffing.namedSlots)}
              caption={`${formatCount(s.staffing.vacantSlots)} Vacant markers · ${formatCount(s.staffing.distinctNames)} distinct names (not a headcount)`}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Workbook rows by allocation state" testId="panel-row-states">
          <StateBar counts={s.units.byState} total={s.units.total} label="Workbook rows" />
          <p className="text-xs text-ink-muted">
            “Allocated” means at least one named person is listed. Coverage depth differs: {formatCount(s.units.coverage.full)} rows list both primary and secondary,{" "}
            {formatCount(s.units.coverage.partial)} are partly covered and {formatCount(s.units.coverage["asm-only"])} list an ASM only.
            “Conflicting” rows share a block with another row. Nothing is confirmed unallocated until someone records it with evidence.
          </p>
        </Panel>
        <Panel title="Blocks by allocation state" testId="panel-block-states">
          <StateBar counts={s.blocks.byState} total={s.blocks.total} label="Blocks in the reference list" />
          <p className="text-xs text-ink-muted">
            A block that no workbook row is linked to is <strong>missing / unverified</strong>: its allocation is not known. It is not counted as unallocated or as white space.
          </p>
          <p className="text-xs text-ink-muted" data-testid="reference-list-note">
            {REFERENCE_LIST_NOTE}
          </p>
        </Panel>
      </div>

      <Card as="section" aria-label="Sales territories" className="overflow-hidden" data-testid="territory-table">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Sales territories</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Labels are the workbook’s DISTRICT column, kept as written. They are not matched to administrative districts.
            </p>
          </div>
          <Link href="/workspace" className={buttonClass}>
            Open the workspace
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Rows and allocation states per sales territory</caption>
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th scope="col" className="px-5 py-2 font-medium">
                  Sales territory
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  Rows
                </th>
                {ALLOCATION_STATES.map((state) => (
                  <th key={state} scope="col" className="px-2 py-2 text-right font-medium">
                    {ALLOCATION_STATE_LABEL[state]}
                  </th>
                ))}
                <th scope="col" className="px-5 py-2 text-right font-medium">
                  With outline
                </th>
              </tr>
            </thead>
            <tbody>
              {s.byTerritory.map((row) => (
                <tr key={row.territoryId} className="border-b border-line last:border-0" data-territory-row={row.territoryId}>
                  <th scope="row" className="px-5 py-2 font-medium">
                    <Link href={`/workspace#territory=${row.territoryId}`} className="text-accent-ink underline-offset-2 hover:underline">
                      {row.label}
                    </Link>
                  </th>
                  <td className="px-2 py-2 text-right tabular-nums">{row.units}</td>
                  {ALLOCATION_STATES.map((state) => (
                    <td key={state} className="px-2 py-2 text-right tabular-nums text-ink-muted">
                      {row.byState[state] || "–"}
                    </td>
                  ))}
                  <td className="px-5 py-2 text-right tabular-nums">
                    {row.withBoundary} / {row.units}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="How rows link to official geography" testId="panel-links">
          <ul className="space-y-2">
            {linkRows.map((status) => (
              <li key={status} className="flex items-start justify-between gap-3">
                <span>
                  <span className="font-medium">{LINK_LABEL[status]}</span>
                  <span className="block text-xs text-ink-muted">{LINK_MEANING[status]}</span>
                </span>
                <span className="font-semibold tabular-nums" data-link-count={status}>
                  {formatCount(s.links.byStatus[status])}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">
            {formatCount(s.links.rowsWithBoundary)} rows currently reach an outline on the map; {formatCount(s.links.rowsWithoutBoundary)} are listed without one. A row is never drawn from a guess.
          </p>
        </Panel>

        <Panel title="Known gaps" testId="panel-gaps">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>{formatCount(s.blocks.withoutBoundary)}</strong> blocks in the reference list have no outline: no boundary feature carries their exact name, usually a spelling difference. They stay listed and show as hatched gaps.
            </li>
            <li>
              <strong>{formatCount(gaps.unlisted)}</strong> blocks in the reference list are not listed in the workbook, and nothing resembles them
              {gaps.districtNote ? ` (${gaps.districtNote})` : ""}. Their state is missing / unverified, not unallocated.
            </li>
            {gaps.districtsWithoutBlocks.length > 0 ? (
              <li>
                {gaps.districtsWithoutBlocks.join(", ")} {gaps.districtsWithoutBlocks.length === 1 ? "has" : "have"} no block in the LGD report. Urban bodies and wards are not in any supplied data, so no ward boundary is drawn or claimed.
              </li>
            ) : null}
            <li>
              {formatCount(s.links.byStatus.ambiguous + s.links.byStatus.weak + s.links.byStatus.none)} rows have no justified boundary (ambiguous, spelling variant only, or no candidate). Many are urban labels such as boroughs and municipalities. A reviewer can resolve them in the workspace.
            </li>
            <li>Outlines are community-sourced and indicative. Legal review of their licence terms is not recorded.</li>
          </ul>
        </Panel>
      </div>

      <Panel title="Sources and provenance" testId="panel-provenance">
        <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="font-medium text-ink-muted">Workbook</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">
            {dataset.meta.workbook.file} · SHA-256 <code>{shortHash(dataset.meta.workbook.sha256)}</code> · {dataset.meta.workbook.dataRows} rows
          </dd>
          <dt className="font-medium text-ink-muted">LGD districts</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">
            {dataset.meta.lgdDistricts.file} · <code>{shortHash(dataset.meta.lgdDistricts.sha256)}</code> · report generated {dataset.meta.lgdDistricts.reportGenerated}
          </dd>
          <dt className="font-medium text-ink-muted">LGD blocks</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">
            {dataset.meta.lgdBlocks.file} · <code>{shortHash(dataset.meta.lgdBlocks.sha256)}</code> · report generated {dataset.meta.lgdBlocks.reportGenerated}. Effective date and reuse terms are unverified.
          </dd>
          <dt className="font-medium text-ink-muted">Boundaries</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">
            {layerMeta ? (
              <>
                {layerMeta.attribution} ({layerMeta.licence}) · snapshot {[...new Set(layerMeta.snapshots.map((x) => x.slice(0, 10)))].join(", ")} · retrieved {layerMeta.retrievedAt.slice(0, 10)} · simplified to about {Math.round(layerMeta.simplificationDegrees * 111000)} m
              </>
            ) : (
              "No boundary layer has been built, so no geography is drawn."
            )}
          </dd>
          <dt className="font-medium text-ink-muted">Crosswalk</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{dataset.meta.matching.protocol}</dd>
        </dl>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <Badge>Local prototype</Badge>
          <StateChip state="allocated" />
          <span>Local changes ({local.changes.length}) are applied to every figure on this page.</span>
        </div>
      </Panel>
    </div>
  );
}
