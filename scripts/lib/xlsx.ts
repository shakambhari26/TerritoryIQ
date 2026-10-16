import { listZipEntries, readZipEntry } from "./zip.ts";
import { decodeXml } from "./xml.ts";

/**
 * Reads the first worksheet of an .xlsx as text cells. Values are returned
 * exactly as stored (whitespace and non-breaking spaces preserved), because
 * the audit treats whitespace-only cells and label characters as data.
 */

export interface SheetRow {
  /** 1-based worksheet row number. */
  row: number;
  /** Cell text by column letter. Cells that are stored but empty are "". */
  cells: Record<string, string>;
}

function textOf(fragment: string): string {
  let out = "";
  for (const match of fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
    out += decodeXml(match[1]);
  }
  return out;
}

function sharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    strings.push(textOf(match[1]));
  }
  return strings;
}

export function readFirstSheet(file: Buffer): SheetRow[] {
  const entries = listZipEntries(file);
  const text = (name: string): string | null => {
    const entry = entries.find((e) => e.name === name);
    return entry ? readZipEntry(file, entry).toString("utf8") : null;
  };

  const workbook = text("xl/workbook.xml");
  const rels = text("xl/_rels/workbook.xml.rels");
  let sheetPath = "xl/worksheets/sheet1.xml";
  if (workbook && rels) {
    const sheetTag = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook);
    if (sheetTag) {
      const rel = new RegExp(`<Relationship\\b[^>]*\\bId="${sheetTag[1]}"[^>]*>`).exec(rels);
      const target = rel ? /\bTarget="([^"]+)"/.exec(rel[0]) : null;
      if (target) sheetPath = `xl/${target[1].replace(/^\/?(xl\/)?/, "")}`;
    }
  }
  const sheet = text(sheetPath);
  if (sheet === null) throw new Error(`Worksheet not found: ${sheetPath}`);

  const strings = sharedStrings(text("xl/sharedStrings.xml"));
  const rows: SheetRow[] = [];

  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1]);
    const cells: Record<string, string> = {};
    for (const cell of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(cell[1]);
      if (!ref) continue;
      const type = /\bt="([^"]+)"/.exec(cell[1])?.[1];
      const body = cell[2] ?? "";
      // A styled cell with no value element is formatting only, not stored data.
      if (!type && !/<v>/.test(body)) continue;
      let value = "";
      if (type === "s") {
        const index = Number(/<v>(\d+)<\/v>/.exec(body)?.[1]);
        value = strings[index] ?? "";
      } else if (type === "inlineStr") {
        value = textOf(body);
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body);
        value = raw ? decodeXml(raw[1]) : "";
      }
      cells[ref[1]] = value;
    }
    rows.push({ row: rowNumber, cells });
  }
  return rows;
}
