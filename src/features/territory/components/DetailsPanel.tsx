"use client";

import type { ReactNode } from "react";
import type { Change } from "@/features/allocation/overlay";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import {
  COVERAGE_LABEL,
  LINK_LABEL,
  LINK_MEANING,
  ROLE_TITLE,
  STATE_MEANING,
  TIER_LABEL,
  describeConflict,
  formatCount,
  plural,
} from "../format";
import type { TerritoryModel } from "../model";
import { GEO_QUALITIES, GEO_QUALITY_LABEL, GEO_QUALITY_MEANING, districtQuality } from "../quality";
import type { Selection, StaffSlot } from "../types";
import { ROLE_CAPACITY, STAFF_ROLES } from "../types";
import { ChangeList, LinkReviewForm, StaffForm, UnallocatedForm, type SubmitChange } from "./forms";
import { StateBar } from "./StateBar";
import { StateChip } from "./state-style";
import { Note, Section, buttonClass } from "./ui";

interface DetailsPanelProps {
  model: TerritoryModel;
  selection: Selection;
  /** Features that have a drawn outline in the loaded layer. */
  shapeIds: ReadonlySet<string>;
  layerReady: boolean;
  changes: readonly Change[];
  onSelect: (selection: Selection) => void;
  submit: SubmitChange;
  onUndoLast: () => void;
}

function Disclosure({ summary, children, testId }: { summary: string; children: ReactNode; testId?: string }) {
  return (
    <details className="group rounded-lg border border-line bg-surface" data-testid={testId}>
      <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-muted">{summary}</summary>
      <div className="border-t border-line p-3">{children}</div>
    </details>
  );
}

function RowButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-left text-sm hover:bg-surface-muted"
    >
      {children}
    </button>
  );
}

function makeLabels(model: TerritoryModel) {
  const featureName = (id: string) => model.featureById.get(id)?.name ?? id;
  const districtName = (id: string | null) => (id ? (model.featureById.get(id)?.name ?? id) : "");
  const unitLabel = (id: string) => {
    const unit = model.unitById.get(id);
    if (!unit) return id;
    const territory = model.territoryById.get(unit.salesTerritoryId)?.label ?? "";
    return `row ${unit.sourceRow} “${unit.blockLabel.trim()}” (${territory})`;
  };
  return { featureName, districtName, unitLabel };
}

function StaffTable({ slots }: { slots: readonly StaffSlot[] }) {
  const blank = STAFF_ROLES.reduce((n, r) => n + ROLE_CAPACITY[r], 0) - slots.length;
  return (
    <div>
      <table className="w-full text-left text-sm" data-testid="staff-table">
        <caption className="sr-only">Staff listed for this row</caption>
        <thead>
          <tr className="text-xs text-ink-muted">
            <th scope="col" className="py-1 pr-2 font-medium">
              Role
            </th>
            <th scope="col" className="py-1 pr-2 font-medium">
              Slot
            </th>
            <th scope="col" className="py-1 font-medium">
              Listed
            </th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={`${slot.role}-${slot.slot}`} className="border-t border-line align-top">
              <td className="py-1 pr-2">{ROLE_TITLE[slot.role]}</td>
              <td className="py-1 pr-2 tabular-nums">{slot.slot}</td>
              <td className="py-1">
                {slot.status === "vacant" ? (
                  <span className="rounded border border-dashed border-line-strong px-1.5 text-xs text-ink-muted">Vacant (as written)</span>
                ) : (
                  slot.names.join(" / ")
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-ink-muted">
        {blank} other {blank === 1 ? "slot is" : "slots are"} blank. Blank is not vacant and is not shown as a gap.
      </p>
    </div>
  );
}

function UnitDetails({ model, id, shapeIds, layerReady, changes, onSelect, submit, onUndoLast }: DetailsPanelProps & { id: string }) {
  const unit = model.unitById.get(id)!;
  const effective = model.effective.get(id)!;
  const allocation = model.unitAllocation.get(id)!;
  const link = model.links.get(id)!;
  const entry = model.crosswalkByUnit.get(id)!;
  const territory = model.territoryById.get(unit.salesTerritoryId)!;
  const { featureName, districtName, unitLabel } = makeLabels(model);
  const feature = link.featureId ? model.featureById.get(link.featureId) : undefined;
  const unitChanges = changes.filter((c) => c.unitId === id);
  const drawn = feature ? shapeIds.has(feature.id) : false;

  return (
    <div className="space-y-4" data-testid="details-unit" data-unit-id={id}>
      <header>
        <p className="text-xs text-ink-muted">
          Workbook row {unit.sourceRow} · {id}
        </p>
        <h3 className="mt-0.5 text-lg font-semibold leading-snug text-ink">{unit.blockLabel.trim()}</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StateChip state={allocation.state} />
          <Badge>{COVERAGE_LABEL[allocation.coverage].split(" (")[0]}</Badge>
          <Badge data-testid="link-chip">{LINK_LABEL[link.status]}</Badge>
        </div>
      </header>

      <Section title="Sales territory">
        <p>
          <button type="button" className="font-semibold text-accent-ink underline-offset-2 hover:underline" onClick={() => onSelect({ kind: "territory", id: territory.id })}>
            {territory.label}
          </button>
        </p>
        <p className="text-xs text-ink-muted">
          This is the company’s own grouping (the workbook’s DISTRICT column). It is not an administrative district and was never used to find geography.
        </p>
      </Section>

      <Section title="Why this state">
        <p>{STATE_MEANING[allocation.state]}</p>
        {allocation.conflicts.map((conflict) => (
          <Note key={JSON.stringify(conflict)} tone="warn">
            {describeConflict(conflict, unitLabel, featureName)}
          </Note>
        ))}
        {allocation.state === "missing" ? (
          <Note>
            {allocation.vacantSlots > 0
              ? "Only Vacant markers are listed. Vacancy needs evidence of an approved position before it counts as anything else."
              : "No slot is filled."}
          </Note>
        ) : null}
      </Section>

      <Section title={`Staffing (${plural(allocation.namedSlots, "named slot")}, ${plural(allocation.vacantSlots, "vacancy", "vacancies")})`}>
        {effective.slots.length > 0 ? <StaffTable slots={effective.slots} /> : <p className="text-ink-muted">Nothing is listed.</p>}
        {unit.flags.includes("asm-two-names") ? (
          <Note>The ASM cell names two people. Whether that means joint responsibility or a handover is not stated (open question B-21).</Note>
        ) : null}
      </Section>

      <Section title="Geography">
        <p className="font-medium">{LINK_LABEL[link.status]}</p>
        <p className="text-xs text-ink-muted">{LINK_MEANING[link.status]}</p>
        {link.held ? <Note>A reviewer is holding this link for more evidence.</Note> : null}
        {feature ? (
          <div className="rounded-lg border border-line bg-surface-muted p-3" data-testid="linked-feature">
            <p className="font-semibold">{feature.name}</p>
            <p className="text-xs text-ink-muted">
              Official block · LGD code {feature.lgdCode} · {districtName(feature.districtId)}
            </p>
            <p className="mt-1 text-xs">
              {drawn
                ? "Provisional outline shown on the map."
                : !layerReady
                  ? "The boundary layer is not loaded, so no outline is shown."
                  : `No outline available: ${feature.boundaryGap ?? "unknown reason"}`}
            </p>
            <button type="button" className={`${buttonClass} mt-2`} onClick={() => onSelect({ kind: "feature", id: feature.id })}>
              Open the official block
            </button>
          </div>
        ) : null}
        {!feature && entry.candidates.length > 0 ? (
          <div>
            <p className="text-xs font-semibold text-ink">Candidates (none selected)</p>
            <ul className="mt-1 space-y-1.5" data-testid="candidate-list">
              {entry.candidates.map((c) => {
                const f = model.featureById.get(c.featureId);
                return (
                  <li key={c.featureId}>
                    <RowButton onClick={() => onSelect({ kind: "feature", id: c.featureId })}>
                      <span>
                        <span className="font-medium">{f?.name ?? c.featureId}</span>
                        <span className="block text-xs text-ink-muted">
                          {f?.kind === "district" ? "District" : `Block · ${districtName(f?.districtId ?? null)}`} · {TIER_LABEL[c.tier]}
                          {c.score ? ` (${c.score.toFixed(2)})` : ""} · {shapeIds.has(c.featureId) ? "outline available" : "no outline"}
                        </span>
                      </span>
                    </RowButton>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {!feature && entry.candidates.length === 0 ? (
          <Note>
            No official unit is a plausible match, so this row is listed but has no place on the map. It is not drawn anywhere.
          </Note>
        ) : null}
      </Section>

      <Section title="Update this row">
        <div className="space-y-2">
          <Disclosure summary="Update staffing" testId="disclosure-staff">
            <StaffForm effective={effective} submit={submit} />
          </Disclosure>
          <Disclosure summary={effective.confirmation ? "Confirmed unallocated (recorded)" : "Record confirmed unallocated"} testId="disclosure-unallocated">
            <UnallocatedForm effective={effective} namedSlots={allocation.namedSlots} submit={submit} />
          </Disclosure>
          <Disclosure summary="Review the geography link" testId="disclosure-review">
            <LinkReviewForm
              unitId={id}
              entry={entry}
              link={link}
              review={effective.review}
              featureOf={(fid) => model.featureById.get(fid)}
              hasShape={(fid) => shapeIds.has(fid)}
              districtName={districtName}
              submit={submit}
            />
          </Disclosure>
        </div>
      </Section>

      <Section title="Local changes to this row">
        <ChangeList changes={unitChanges} onUndoLast={changes.length > 0 ? onUndoLast : undefined} />
        <p className="text-xs text-ink-muted">Changes live in this browser only. The workbook data underneath is never modified.</p>
      </Section>
    </div>
  );
}

/**
 * How well the district's blocks are tied to the workbook, kept apart from who covers them. A block with named
 * staff can still have a doubtful link, and a block with no row is unknown, not unallocated.
 */
function GeoConfidence({ model, districtId, shapeIds }: { model: TerritoryModel; districtId: string; shapeIds: ReadonlySet<string> }) {
  const quality = districtQuality(model, districtId, (id) => shapeIds.has(id));
  return (
    <div className="space-y-2" data-testid="district-confidence">
      <h4 className="text-xs font-semibold text-ink">Geographic data confidence</h4>
      <ul className="space-y-0.5 text-xs">
        {GEO_QUALITIES.filter((q) => quality.counts[q] > 0).map((q) => (
          <li key={q} className="flex items-baseline justify-between gap-3" title={GEO_QUALITY_MEANING[q]}>
            <span>{GEO_QUALITY_LABEL[q]}</span>
            <span className="tabular-nums text-ink-muted">{quality.counts[q]}</span>
          </li>
        ))}
      </ul>
      {quality.withoutOutline.length > 0 ? (
        <Note>
          No outline for {quality.withoutOutline.map((id) => model.featureById.get(id)?.name ?? id).join(", ")}. They are listed below and show as dotted gaps on the map, which is missing geography and not unallocated area.
        </Note>
      ) : null}
      <p className="text-xs text-ink-muted">Block-to-district parentage is the district code printed in the LGD block report. Outlines are matched to blocks by name and stay provisional.</p>
    </div>
  );
}

function FeatureDetails({ model, id, shapeIds, layerReady, onSelect }: DetailsPanelProps & { id: string }) {
  const feature = model.featureById.get(id)!;
  const { districtName, unitLabel } = makeLabels(model);

  if (feature.kind === "district") {
    const roll = model.districtRollup.get(id)!;
    const blocks = model.dataset.features.filter((f) => f.kind === "block" && f.districtId === id);
    return (
      <div className="space-y-4" data-testid="details-district" data-feature-id={id}>
        <header>
          <p className="text-xs text-ink-muted">Official district · LGD code {feature.lgdCode} · {id}</p>
          <h3 className="mt-0.5 text-lg font-semibold text-ink">{feature.name}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{shapeIds.has(id) ? "Outline available" : layerReady ? "No outline" : "Layer not loaded"}</Badge>
          </div>
        </header>
        <Note>
          This is an official administrative district. The company’s sales territories (the workbook’s DISTRICT labels) are a different grouping and are not joined to it.
        </Note>
        <Section title={`Official blocks in this district (${blocks.length})`}>
          {blocks.length === 0 ? (
            <p className="text-ink-muted">The LGD block report lists no block under this district. Any urban units or wards are not in the supplied data, so nothing is drawn or counted for them.</p>
          ) : (
            <>
              <StateBar counts={roll.byState} total={roll.blocks} label={`Blocks in ${feature.name}`} compact />
              <p className="text-xs text-ink-muted">
                {roll.withBoundary} of {roll.blocks} blocks have a provisional outline. The counts roll up by official block, not by sales-territory label.
              </p>
              <GeoConfidence model={model} districtId={id} shapeIds={shapeIds} />
              <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {blocks.map((block) => (
                  <li key={block.id}>
                    <RowButton onClick={() => onSelect({ kind: "feature", id: block.id })}>
                      <span>{block.name}</span>
                      <StateChip state={model.featureAllocation.get(block.id)!.state} />
                    </RowButton>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      </div>
    );
  }

  const allocation = model.featureAllocation.get(id)!;
  const drawn = shapeIds.has(id);
  return (
    <div className="space-y-4" data-testid="details-feature" data-feature-id={id}>
      <header>
        <p className="text-xs text-ink-muted">Official block · LGD code {feature.lgdCode} · {id}</p>
        <h3 className="mt-0.5 text-lg font-semibold text-ink">{feature.name}</h3>
        <p className="text-xs text-ink-muted">
          {districtName(feature.districtId)} · {formatCount(feature.villageRows ?? 0)} village rows in the LGD report
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StateChip state={allocation.state} />
          <Badge>{drawn ? "Provisional outline" : layerReady ? "No outline" : "Layer not loaded"}</Badge>
        </div>
      </header>

      <Section title="Why this state">
        <p>{STATE_MEANING[allocation.state]}</p>
        {allocation.claimants.length === 0 && allocation.contestedBy.length === 0 ? (
          <Note>
            No workbook row is linked to this official block. That means its allocation is <strong>not known</strong>. It does not mean it is unallocated or unstaffed.
            {allocation.possibleRows.length > 0 ? " Some rows resemble its name; see below." : ""}
          </Note>
        ) : null}
        {allocation.claimants.length + allocation.contestedBy.length >= 2 ? (
          <Note tone="warn">More than one row claims, or could mean, this block. No row is chosen over another.</Note>
        ) : null}
      </Section>

      {allocation.claimants.length > 0 ? (
        <Section title="Rows linked to this block">
          <ul className="space-y-1.5">
            {allocation.claimants.map((unitId) => (
              <li key={unitId}>
                <RowButton onClick={() => onSelect({ kind: "unit", id: unitId })}>
                  <span className="text-sm">{unitLabel(unitId)}</span>
                  <StateChip state={model.unitAllocation.get(unitId)!.state} />
                </RowButton>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {allocation.contestedBy.length > 0 ? (
        <Section title="Rows with an ambiguous label that could mean this block">
          <ul className="space-y-1.5">
            {allocation.contestedBy.map((unitId) => (
              <li key={unitId}>
                <RowButton onClick={() => onSelect({ kind: "unit", id: unitId })}>
                  <span className="text-sm">{unitLabel(unitId)}</span>
                </RowButton>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {allocation.possibleRows.length > 0 ? (
        <Section title="Rows that only resemble its name (not linked)">
          <ul className="space-y-1.5">
            {allocation.possibleRows.map((unitId) => (
              <li key={unitId}>
                <RowButton onClick={() => onSelect({ kind: "unit", id: unitId })}>
                  <span className="text-sm">{unitLabel(unitId)}</span>
                </RowButton>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Boundary">
        {feature.boundary ? (
          <>
            <p>
              Outline from OpenStreetMap relation{" "}
              <a className="font-medium text-accent-ink underline" href={`https://www.openstreetmap.org/relation/${feature.boundary.relationId}`} target="_blank" rel="noopener noreferrer">
                {feature.boundary.relationId}
              </a>
              , matched to this official block by exact name within its district. Provisional and unreviewed.
            </p>
          </>
        ) : (
          <Note>No outline: {feature.boundaryGap}</Note>
        )}
      </Section>
    </div>
  );
}

function TerritoryDetails({ model, id, shapeIds, onSelect }: DetailsPanelProps & { id: string }) {
  const territory = model.territoryById.get(id)!;
  const row = model.summary.byTerritory.find((t) => t.territoryId === id)!;
  const withoutShape = territory.unitIds.filter((uid) => {
    const fid = model.links.get(uid)!.featureId;
    return !(fid && shapeIds.has(fid));
  });
  return (
    <div className="space-y-4" data-testid="details-territory" data-territory-id={id}>
      <header>
        <p className="text-xs text-ink-muted">Sales territory · {id}</p>
        <h3 className="mt-0.5 text-lg font-semibold text-ink">{territory.label}</h3>
        <p className="text-xs text-ink-muted">{plural(territory.unitIds.length, "workbook row")}</p>
      </header>
      <Note>
        A sales territory is the company’s grouping of the block rows listed under this label. It is not an administrative district. Its place on the map is the set of outlines linked to its rows, nothing more.
      </Note>
      <Section title="Allocation states of its rows">
        <StateBar counts={row.byState} total={row.units} label={`Rows in ${territory.label}`} compact />
      </Section>
      <Section title="Geography">
        <p>
          {row.withBoundary} of {row.units} rows have a provisional outline (highlighted on the map).{" "}
          {withoutShape.length > 0 ? `${withoutShape.length} have none and are listed below.` : ""}
        </p>
      </Section>
      <Section title="Rows">
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {territory.unitIds.map((uid) => {
            const unit = model.unitById.get(uid)!;
            const fid = model.links.get(uid)!.featureId;
            return (
              <li key={uid}>
                <RowButton onClick={() => onSelect({ kind: "unit", id: uid })}>
                  <span>
                    {unit.blockLabel.trim()}
                    <span className="block text-xs text-ink-muted">{fid && shapeIds.has(fid) ? "provisional outline" : "no outline"}</span>
                  </span>
                  <StateChip state={model.unitAllocation.get(uid)!.state} />
                </RowButton>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

function NothingSelected({ model }: { model: TerritoryModel }) {
  const s = model.summary;
  return (
    <div className="space-y-4" data-testid="details-empty">
      <div className="rounded-lg border-l-4 border-gold-400 bg-gold-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Selection</p>
        <p className="mt-1 text-sm text-ink">Nothing selected. Choose an outline on the map or an area from the list. Both select by internal ID.</p>
      </div>
      <Section title="What you are looking at">
        <p>
          {plural(s.units.total, "workbook row")} under {plural(model.dataset.salesTerritories.length, "sales territory", "sales territories")}, set against {plural(s.blocks.total, "official block")} from the Local Government Directory.
        </p>
        <p className="text-xs text-ink-muted">
          {formatCount(s.blocks.withBoundary)} blocks and {formatCount(s.districts.withBoundary)} districts have provisional outlines. Everything else is listed without a drawn boundary rather than given an invented one.
        </p>
      </Section>
      <Section title="Rows by allocation state">
        <StateBar counts={s.units.byState} total={s.units.total} label="Workbook rows" compact />
      </Section>
    </div>
  );
}

export function DetailsPanel(props: DetailsPanelProps) {
  const { model, selection } = props;
  const valid =
    selection &&
    (selection.kind === "unit"
      ? model.unitById.has(selection.id)
      : selection.kind === "feature"
        ? model.featureById.has(selection.id)
        : model.territoryById.has(selection.id));

  return (
    <Card as="aside" aria-label="Details" className="flex flex-col" data-testid="details-panel">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">Details</h2>
        {props.selection && valid ? (
          <button type="button" className={buttonClass} onClick={() => props.onSelect(null)}>
            Clear selection
          </button>
        ) : null}
      </header>
      <div className="p-5">
        {!selection || !valid ? (
          <NothingSelected model={model} />
        ) : selection.kind === "unit" ? (
          <UnitDetails {...props} id={selection.id} />
        ) : selection.kind === "feature" ? (
          <FeatureDetails {...props} id={selection.id} />
        ) : (
          <TerritoryDetails {...props} id={selection.id} />
        )}
      </div>
    </Card>
  );
}
