import { readFile } from "node:fs/promises";
import { readSpreadsheetMlRows } from "./spreadsheetml.ts";

/**
 * Parsers for the two LGD reports in data-source/. Names are returned exactly
 * as printed; nothing is normalised in place.
 */

export interface LgdDistrict {
  code: number;
  name: string;
  version: number;
}

export interface LgdBlock {
  code: number;
  name: string;
  districtCode: number;
  districtName: string;
  /** Village rows the report lists under this block. */
  villageRows: number;
}

export interface LgdDistrictReport {
  districts: LgdDistrict[];
  /** Last row of the report, e.g. `Oct 15, 2026, 1:02 PM`. */
  reportGenerated: string;
}

export interface LgdBlockReport {
  blocks: LgdBlock[];
  villageRows: number;
  reportGenerated: string;
}

function lastText(rows: string[][]): string {
  for (let i = rows.length - 1; i >= 0; i--) {
    const first = rows[i].find((cell) => cell && cell.trim().length > 0);
    if (first) return first.trim();
  }
  return "";
}

const isInteger = (text: string | undefined): text is string =>
  text !== undefined && /^\d+$/.test(text.trim());

export async function readLgdDistricts(file: string): Promise<LgdDistrictReport> {
  const rows = readSpreadsheetMlRows(await readFile(file, "utf8"));
  const districts: LgdDistrict[] = [];
  for (const row of rows) {
    // S. No. | District Code | District Version | District Name (English) | ...
    // The serial number is stored as a decimal (`1.0`), the codes as integers.
    if (/^\d+(\.0+)?$/.test((row[1] ?? "").trim()) && isInteger(row[2]) && isInteger(row[3]) && row[4]) {
      districts.push({ code: Number(row[2]), version: Number(row[3]), name: row[4] });
    }
  }
  return { districts, reportGenerated: lastText(rows) };
}

export async function readLgdBlocks(file: string): Promise<LgdBlockReport> {
  const rows = readSpreadsheetMlRows(await readFile(file, "utf8"));
  const byCode = new Map<number, LgdBlock>();
  let villageRows = 0;
  for (const row of rows) {
    // State Code | State Name | District Code | District Name | Block Code | Block Name | Village Code | Village Name
    if (!(isInteger(row[1]) && isInteger(row[3]) && isInteger(row[5]) && isInteger(row[7]))) continue;
    villageRows++;
    const code = Number(row[5]);
    const existing = byCode.get(code);
    if (existing) {
      existing.villageRows++;
      if (existing.name !== row[6] || existing.districtCode !== Number(row[3])) {
        throw new Error(`LGD block ${code} carries inconsistent names or district codes`);
      }
    } else {
      byCode.set(code, {
        code,
        name: row[6],
        districtCode: Number(row[3]),
        districtName: row[4],
        villageRows: 1,
      });
    }
  }
  return { blocks: [...byCode.values()], villageRows, reportGenerated: lastText(rows) };
}
