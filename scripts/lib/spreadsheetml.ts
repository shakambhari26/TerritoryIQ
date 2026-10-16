import { decodeXml } from "./xml.ts";

/**
 * Reads the first worksheet of a SpreadsheetML 2003 file (the format the LGD
 * portal exports with an `.xls` extension). Returns one string array per
 * `<Row>`, positioned by each cell's 1-based `ss:Index`, so skipped cells stay
 * aligned. Index 0 of every row is unused.
 */
export function readSpreadsheetMlRows(xml: string): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<(?:ss:)?Row\b[^>]*>([\s\S]*?)<\/(?:ss:)?Row>/g)) {
    const row: string[] = [];
    let column = 0;
    for (const cell of rowMatch[1].matchAll(/<Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Cell>)/g)) {
      const index = /\bss:Index="(\d+)"/.exec(cell[1]);
      column = index ? Number(index[1]) : column + 1;
      const data = /<Data\b[^>]*>([\s\S]*?)<\/Data>/.exec(cell[2] ?? "");
      row[column] = data ? decodeXml(data[1]) : "";
    }
    rows.push(row);
  }
  return rows;
}
