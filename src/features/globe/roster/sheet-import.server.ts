import "server-only";
import { parseWorkbook } from "../../../../scripts/lib/workbook.ts";
import { ALIASES, AREAS_WITHOUT_OUTLINE, OUTSIDE_STATE, TERRITORY_DISTRICT } from "../area-mapping.config.ts";
import type { ServerManifest, ServerRecord } from "../server-types.ts";
import type { ImportReport } from "../team-types.ts";

export type { ImportReport };
import type { Roster } from "./roster.server.ts";
import { buildCanonical, editDistance, matchKey, placeName, tidyName } from "./sheet-clean.ts";

/**
 * Reads an uploaded area-mapping sheet (.xlsx, the same layout as the original: DISTRICT, BLOCK, ASM, PRIMARY ×3,
 * SECONDARY ×5, DSO ×3) into a roster, placing every row the way the build does: the reviewed rules in
 * area-mapping.config.ts first, then the row's name inside its district, then a close spelling (at most two letters
 * different) inside its district. A row that still matches no place, or more than one, is reported, never guessed.
 * Names are cleaned exactly as the build cleans them (sheet-clean.ts).
 */

export type ImportResult = { ok: true; roster: Roster; report: ImportReport } | { ok: false; error: string };

const compact = (key: string) => key.split("#")[0];
const numeral = (key: string) => key.split("#")[1] ?? "";

export function importSheet(bytes: Buffer, base: ServerManifest): ImportResult {
  let sheet: ReturnType<typeof parseWorkbook>;
  try {
    sheet = parseWorkbook(bytes);
  } catch (error) {
    return { ok: false, error: `This file is not the area-mapping sheet layout: ${error instanceof Error ? error.message : "it could not be read"}.` };
  }
  if (sheet.units.length === 0) return { ok: false, error: "The sheet has no rows." };
  if (sheet.units.length > 5000) return { ok: false, error: "The sheet has too many rows." };

  const territoryOf = new Map(sheet.salesTerritories.map((t) => [t.id, t.label.trim()]));
  const districtIdByName = new Map(base.districts.map((d) => [d.name.toLowerCase(), d.id]));
  const districtName = new Map(base.districts.map((d) => [d.id, d.name]));
  const territoryDistrict = new Map(Object.entries(TERRITORY_DISTRICT).map(([k, v]) => [k.toLowerCase(), v]));
  const blocksIn = (districtId: string | undefined) => base.blocks.filter((b) => !districtId || b.districtId === districtId);

  const canonical = buildCanonical(sheet.units.flatMap((u) => u.slots.flatMap((s) => s.names.map((raw) => ({ territory: territoryOf.get(u.salesTerritoryId)!, raw })))));
  const corrections = new Map<string, string>();
  const clean = (raw: string, territory: string) => {
    const tidy = tidyName(raw);
    const name = canonical.get(territory)?.get(tidy) ?? tidy;
    const original = raw.replace(/\s+/g, " ").trim();
    if (name !== original && name.toLowerCase() !== original.toLowerCase()) corrections.set(original, name);
    return name;
  };

  const roster: Roster = Object.fromEntries(base.blocks.map((b) => [b.id, [] as ServerRecord[]]));
  const report: ImportReport = { rows: sheet.units.length, placed: 0, outside: [], unplaced: [], guessed: [], corrections: [] };

  for (const [index, unit] of sheet.units.entries()) {
    const territory = territoryOf.get(unit.salesTerritoryId)!;
    const label = unit.blockLabel.trim();
    const ruleKey = `${territory}|${label}`;
    const row = unit.sourceRow;

    if (OUTSIDE_STATE[ruleKey]) {
      report.outside.push({ row, territory, label, note: OUTSIDE_STATE[ruleKey] });
      continue;
    }
    let blockId: string | null = null;
    const area = AREAS_WITHOUT_OUTLINE[ruleKey];
    if (area) blockId = base.blocks.find((b) => b.placement?.areaKey === area.key)?.id ?? null;
    if (!blockId) {
      const alias = ALIASES[ruleKey];
      const districtId = districtIdByName.get((alias?.district ?? territoryDistrict.get(territory.toLowerCase()) ?? "").toLowerCase());
      const wanted = matchKey(alias?.osm ?? label);
      const wantedFixed = matchKey(placeName(label));
      const exact = (pool: typeof base.blocks) => pool.filter((b) => b.placement?.keys.includes(wanted) || b.placement?.keys.includes(wantedFixed));
      let hits = exact(blocksIn(districtId));
      if (hits.length === 1) blockId = hits[0].id;
      else if (hits.length === 0) {
        // A close spelling inside the district: the same trailing numeral and at most two letters different.
        hits = blocksIn(districtId).filter((b) => b.placement?.keys.some((k) => numeral(k) === numeral(wanted) && editDistance(compact(k), compact(wanted)) <= 2 && compact(wanted).length >= 4));
        if (districtId && hits.length === 1) {
          blockId = hits[0].id;
          report.guessed.push({ row, label, place: hits[0].name, district: districtName.get(hits[0].districtId ?? "") ?? "", how: "close spelling" });
        } else if (hits.length === 0) {
          // The exact name in another district (a place listed under a neighbouring territory).
          const elsewhere = exact(blocksIn(undefined));
          if (elsewhere.length === 1) {
            blockId = elsewhere[0].id;
            report.guessed.push({ row, label, place: elsewhere[0].name, district: districtName.get(elsewhere[0].districtId ?? "") ?? "", how: "found in another district" });
          }
        }
      }
      if (!blockId) {
        report.unplaced.push({ row, territory, label, reason: districtId ? (hits.length > 1 ? "matches more than one place" : "no place with this name in the district") : `unknown district "${territory}"` });
        continue;
      }
    }

    const people: ServerRecord["people"] = [];
    for (const slot of unit.slots) {
      if (slot.status === "vacant") people.push({ role: slot.role, slot: slot.slot, name: null, vacant: true });
      else for (const raw of slot.names) if (raw.trim()) people.push({ role: slot.role, slot: slot.slot, name: clean(raw, territory), vacant: false });
    }
    roster[blockId].push({
      unitId: `TU-${String(index + 1).padStart(3, "0")}`,
      blockLabel: placeName(label),
      territory,
      people,
      namedPeople: people.filter((p) => !p.vacant).length,
    });
    report.placed++;
  }
  report.corrections = [...corrections].map(([from, to]) => ({ from, to })).filter((c) => c.from.split(" ").length !== c.to.split(" ").length || editDistance(c.from.toLowerCase(), c.to.toLowerCase()) > 0);
  return { ok: true, roster, report };
}
