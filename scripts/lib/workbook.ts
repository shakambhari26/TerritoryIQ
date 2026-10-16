import { readFile } from "node:fs/promises";
import type {
  SalesTerritory,
  StaffRole,
  StaffSlot,
  TerritoryUnit,
  UnitFlag,
} from "../../src/features/territory/types.ts";
import { readFirstSheet } from "./xlsx.ts";

/**
 * Reads `AREA MAPPING.xlsx` (read-only) into territory units. Columns are read
 * by position because header texts repeat. Cell text is never altered, except
 * that slot values are trimmed for display; the `DISTRICT` label is carried
 * verbatim as the sales-territory label.
 */

const COLUMNS: ReadonlyArray<{ letter: string; header: string; role: StaffRole | null; slot: number }> = [
  { letter: "A", header: "DISTRICT", role: null, slot: 0 },
  { letter: "B", header: "BLOCK", role: null, slot: 0 },
  { letter: "C", header: "ASM", role: "ASM", slot: 1 },
  { letter: "D", header: "PRIMARY", role: "PRIMARY", slot: 1 },
  { letter: "E", header: "PRIMARY", role: "PRIMARY", slot: 2 },
  { letter: "F", header: "PRIMARY", role: "PRIMARY", slot: 3 },
  { letter: "G", header: "SECONDARY", role: "SECONDARY", slot: 1 },
  { letter: "H", header: "SECONDARY", role: "SECONDARY", slot: 2 },
  { letter: "I", header: "SECONDARY", role: "SECONDARY", slot: 3 },
  { letter: "J", header: "SECONDARY", role: "SECONDARY", slot: 4 },
  { letter: "K", header: "SECONDARY", role: "SECONDARY", slot: 5 },
  { letter: "L", header: "DSO", role: "DSO", slot: 1 },
  { letter: "M", header: "DSO", role: "DSO", slot: 2 },
  { letter: "N", header: "DSO", role: "DSO", slot: 3 },
];

const NBSP = String.fromCharCode(0x00a0);
const EN_DASH = String.fromCharCode(0x2013);

export interface WorkbookRead {
  salesTerritories: SalesTerritory[];
  units: TerritoryUnit[];
  /** Counts used for cross-checks against the Phase 0B inventory. */
  stats: {
    dataRows: number;
    vacantCells: number;
    whitespaceOnlyCells: number;
    namedSlots: number;
    distinctNames: number;
  };
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

export async function readWorkbook(file: string): Promise<WorkbookRead> {
  const rows = readFirstSheet(await readFile(file));
  const header = rows.find((r) => r.row === 1);
  if (!header) throw new Error("Workbook has no header row");
  for (const column of COLUMNS) {
    const actual = (header.cells[column.letter] ?? "").trim();
    if (actual !== column.header) {
      throw new Error(`Unexpected header in column ${column.letter}: "${actual}" (expected "${column.header}")`);
    }
  }

  const dataRows = rows.filter((r) => r.row > 1).sort((a, b) => a.row - b.row);
  const territoryByLabel = new Map<string, SalesTerritory>();
  const units: TerritoryUnit[] = [];
  const names = new Set<string>();
  let vacantCells = 0;
  let whitespaceOnlyCells = 0;
  let namedSlots = 0;

  for (const row of dataRows) {
    const label = row.cells.A ?? "";
    const blockLabel = row.cells.B ?? "";
    if (label.trim() === "" || blockLabel.trim() === "") {
      throw new Error(`Row ${row.row} has a blank DISTRICT or BLOCK cell`);
    }

    let territory = territoryByLabel.get(label);
    if (!territory) {
      territory = { id: `ST-${pad(territoryByLabel.size + 1, 2)}`, label, unitIds: [] };
      territoryByLabel.set(label, territory);
    }

    const id = `TU-${pad(units.length + 1, 3)}`;
    const slots: StaffSlot[] = [];
    const flags = new Set<UnitFlag>();

    for (const column of COLUMNS) {
      if (column.role === null) continue;
      const raw = row.cells[column.letter];
      if (raw === undefined) continue;
      const trimmed = raw.replaceAll(NBSP, " ").trim();
      if (trimmed === "") {
        // Stored with no visible text (an empty or whitespace-only string): blank, never vacant.
        whitespaceOnlyCells++;
        flags.add("whitespace-only-cells");
        continue;
      }
      if (/^vacant$/i.test(trimmed)) {
        vacantCells++;
        slots.push({ role: column.role, slot: column.slot, status: "vacant", names: [] });
        continue;
      }
      const people =
        column.role === "ASM"
          ? trimmed.split("/").map((part) => part.trim()).filter((part) => part.length > 0)
          : [trimmed];
      if (people.length > 1) flags.add("asm-two-names");
      namedSlots++;
      for (const person of people) names.add(person.replace(/\s+/g, " ").toLowerCase());
      slots.push({ role: column.role, slot: column.slot, status: "named", names: people });
    }

    if (blockLabel.includes(EN_DASH)) flags.add("label-en-dash");
    if (blockLabel.includes(NBSP)) flags.add("label-nbsp");

    units.push({
      id,
      sourceRow: row.row,
      salesTerritoryId: territory.id,
      blockLabel,
      slots,
      flags: [...flags],
    });
    territory.unitIds.push(id);
  }

  return {
    salesTerritories: [...territoryByLabel.values()],
    units,
    stats: {
      dataRows: dataRows.length,
      vacantCells,
      whitespaceOnlyCells,
      namedSlots,
      distinctNames: names.size,
    },
  };
}
