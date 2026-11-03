/**
 * Builds the globe's customer layer.
 *
 *   data-source/CustomerData.csv                   (read-only)  the customer export: no location columns
 *   data-source/customer-locations-inferred.csv    (read-only)  reviewed placements, inferred from names
 *   data-source/LGD_..._Covered_Villages_....xls   (read-only)  to check each village really lies in its block
 *   data/generated/globe-overlay.json                           to check each block is on the globe
 *        ──> data/generated/customers.json                      server-only, git-ignored
 *
 * Nothing is placed by guessing here: a customer gets a block only from a row of the reviewed placements file, and
 * that row must agree with the export (SL NO. and ERP CODE), name a real LGD block that is on the globe, and, when it
 * names a village, a village inside that block. Anything else fails the build. Phone numbers are read only to flag a
 * missing contact and are never written out.
 *
 * Run: npm run data:build-customers (after `python -I scripts/globe/build_overlay.py`), then restart the server.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CONFIDENCES,
  CUSTOMER_TYPES,
  type Confidence,
  type CustomerFile,
  type CustomerFlag,
  type CustomerRecord,
  type CustomerType,
} from "../src/features/globe/customers.ts";
import { readSpreadsheetMlRows } from "./lib/spreadsheetml.ts";
import { ROOT, sha256Buffer, SOURCE_DIR } from "./lib/sources.ts";

const GENERATED_DIR = path.join(ROOT, "data", "generated");
const EXPORT_FILE = "CustomerData.csv";
const PLACEMENTS_FILE = "customer-locations-inferred.csv";
const LGD_VILLAGES_FILE = "LGD_West_Bengal_Development_Blocks_with_Covered_Villages_2026-10-15.xls";

function fail(message: string): never {
  console.error(`build-customers: ${message}`);
  process.exit(1);
}

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function records(rows: string[][], file: string, required: readonly string[]): Record<string, string>[] {
  const [header, ...body] = rows;
  if (!header) fail(`${file} is empty`);
  const names = header.map((h) => h.trim());
  for (const column of required) if (!names.includes(column)) fail(`${file} has no "${column}" column`);
  return body.map((cells) => Object.fromEntries(names.map((name, index) => [name, (cells[index] ?? "").trim()])));
}

const isPlaceholderCode = (code: string) => code === "" || /^[01]+$/.test(code) || code.length < 6 || /^(\d)\1+$/.test(code) || /^1234/.test(code);
const isPhone = (value: string) => /^(?:91)?[6-9]\d{9}$/.test(value);
const looksLikeTest = (name: string, firm: string) =>
  [name, firm].some((s) => /\btest\b/i.test(s) || /([a-z])\1{3,}/i.test(s) || /[a-z]\d|\d[a-z]/i.test(s));

// Inputs.
const exportBytes = await readFile(path.join(SOURCE_DIR, EXPORT_FILE)).catch(() => fail(`data-source/${EXPORT_FILE} is missing`));
const placementBytes = await readFile(path.join(SOURCE_DIR, PLACEMENTS_FILE)).catch(() => fail(`data-source/${PLACEMENTS_FILE} is missing`));
const overlayText = await readFile(path.join(GENERATED_DIR, "globe-overlay.json"), "utf8").catch(() =>
  fail("data/generated/globe-overlay.json is missing: run `python -I scripts/globe/build_overlay.py` first"),
);
const lgdXml = await readFile(path.join(SOURCE_DIR, LGD_VILLAGES_FILE), "utf8").catch(() => fail(`data-source/${LGD_VILLAGES_FILE} is missing`));

const customers = records(parseCsv(exportBytes.toString("utf8")), EXPORT_FILE, ["SL NO.", "ERP CODE", "CUSTOMER NAME", "FIRM NAME", "CUSTOMER TYPE", "CUSTOMER CONTACT"]);
const placements = records(parseCsv(placementBytes.toString("utf8")), PLACEMENTS_FILE, ["sl_no", "erp_code", "lgd_block_code", "lgd_village_code", "confidence", "basis"]);
const globeBlocks = new Set((JSON.parse(overlayText) as { blocks: { id: string }[] }).blocks.map((b) => b.id));

// LGD: block code -> name, and village code -> { name, block code }.
// Columns: State Code | State Name | District Code | District Name | Block Code | Block Name | Village Code | Village Name
const lgdBlocks = new Map<number, string>();
const lgdVillages = new Map<number, { name: string; block: number }>();
for (const row of readSpreadsheetMlRows(lgdXml)) {
  if (![row[1], row[3], row[5], row[7]].every((cell) => cell !== undefined && /^\d+$/.test(cell.trim()))) continue;
  lgdBlocks.set(Number(row[5]), row[6]);
  lgdVillages.set(Number(row[7]), { name: row[8], block: Number(row[5]) });
}
if (lgdBlocks.size === 0) fail("no blocks could be read from the LGD village report");

// The export: one entry per row, keyed by SL NO.
const bySl = new Map<string, Record<string, string>>();
const codeUse = new Map<string, number>();
for (const c of customers) {
  if (!/^\d+$/.test(c["SL NO."])) fail(`a row has SL NO. "${c["SL NO."]}", which is not a number`);
  if (bySl.has(c["SL NO."])) fail(`SL NO. ${c["SL NO."]} appears twice`);
  if (!CUSTOMER_TYPES.includes(c["CUSTOMER TYPE"] as CustomerType)) fail(`SL NO. ${c["SL NO."]} has unknown CUSTOMER TYPE "${c["CUSTOMER TYPE"]}"`);
  bySl.set(c["SL NO."], c);
  if (!isPlaceholderCode(c["ERP CODE"])) codeUse.set(c["ERP CODE"], (codeUse.get(c["ERP CODE"]) ?? 0) + 1);
}

function flagsOf(c: Record<string, string>): CustomerFlag[] {
  const flags: CustomerFlag[] = [];
  const code = c["ERP CODE"];
  const contact = c["CUSTOMER CONTACT"];
  if (looksLikeTest(c["CUSTOMER NAME"], c["FIRM NAME"])) flags.push("test-record");
  if (isPlaceholderCode(code)) flags.push("placeholder-code");
  else if (code === contact && isPhone(contact)) flags.push("code-is-phone");
  if ((codeUse.get(code) ?? 0) > 1) flags.push("duplicate-code");
  if (!isPhone(contact)) flags.push("no-contact");
  return flags;
}

// Placements: every one must agree with the export, LGD and the globe.
const blocks: Record<string, CustomerRecord[]> = {};
const placed = new Set<string>();
for (const p of placements) {
  const where = `${PLACEMENTS_FILE} row for SL NO. ${p.sl_no}`;
  const c = bySl.get(p.sl_no);
  if (!c) fail(`${where}: no such row in ${EXPORT_FILE}`);
  if (c["ERP CODE"] !== p.erp_code) fail(`${where}: ERP CODE ${p.erp_code} does not match the export (${c["ERP CODE"]})`);
  if (placed.has(p.sl_no)) fail(`${where}: placed twice`);
  if (!CONFIDENCES.includes(p.confidence as Confidence)) fail(`${where}: confidence must be one of ${CONFIDENCES.join(", ")}`);
  if (p.basis.length < 10) fail(`${where}: give the reason for the placement`);
  const blockCode = Number(p.lgd_block_code);
  if (!lgdBlocks.has(blockCode)) fail(`${where}: ${p.lgd_block_code} is not an LGD block code`);
  const blockId = `GB-${blockCode}`;
  if (!globeBlocks.has(blockId)) fail(`${where}: block ${blockId} is not on the globe`);
  let village: CustomerRecord["village"] = null;
  if (p.lgd_village_code !== "") {
    const v = lgdVillages.get(Number(p.lgd_village_code));
    if (!v) fail(`${where}: ${p.lgd_village_code} is not an LGD village code`);
    if (v.block !== blockCode) fail(`${where}: village ${p.lgd_village_code} lies in block ${v.block}, not ${blockCode}`);
    village = { code: Number(p.lgd_village_code), name: v.name };
  }
  placed.add(p.sl_no);
  (blocks[blockId] ??= []).push({
    id: `CU-${p.sl_no}`,
    type: c["CUSTOMER TYPE"] as CustomerType,
    firm: c["FIRM NAME"],
    name: c["CUSTOMER NAME"],
    erpCode: c["ERP CODE"],
    confidence: p.confidence as Confidence,
    basis: p.basis,
    village,
    flags: flagsOf(c),
  });
}
for (const list of Object.values(blocks)) list.sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3)));

// Counts over the whole export, placed or not.
const byType: Partial<Record<CustomerType, number>> = {};
const flagCounts: Partial<Record<CustomerFlag, number>> = {};
let flagged = 0;
for (const c of customers) {
  byType[c["CUSTOMER TYPE"] as CustomerType] = (byType[c["CUSTOMER TYPE"] as CustomerType] ?? 0) + 1;
  const flags = flagsOf(c);
  if (flags.length > 0) flagged++;
  for (const flag of flags) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
}
const byConfidence = Object.fromEntries(CONFIDENCES.map((level) => [level, 0])) as Record<Confidence, number>;
for (const list of Object.values(blocks)) for (const r of list) byConfidence[r.confidence]++;

const output: CustomerFile = {
  meta: {
    schema: 1,
    generatedAt: new Date().toISOString(),
    inputs: {
      export: { file: `data-source/${EXPORT_FILE}`, sha256: sha256Buffer(exportBytes) },
      placements: { file: `data-source/${PLACEMENTS_FILE}`, sha256: sha256Buffer(placementBytes) },
    },
    counts: { total: customers.length, placed: placed.size, unplaced: customers.length - placed.size, byConfidence, flagged, byType, flags: flagCounts },
  },
  globeBlockIds: [...globeBlocks].sort(),
  blocks,
};
await writeFile(path.join(GENERATED_DIR, "customers.json"), JSON.stringify(output));

console.log(`Customers: ${customers.length} in the export, ${placed.size} placed (all inferred: ${CONFIDENCES.map((l) => `${byConfidence[l]} ${l}`).join(", ")}), ${customers.length - placed.size} unplaced.`);
console.log(`Blocks with customers: ${Object.entries(blocks).map(([id, list]) => `${id} (${list.length})`).join(", ") || "none"}.`);
console.log(`Rows with data-quality flags: ${flagged} (${Object.entries(flagCounts).map(([f, n]) => `${f} ${n}`).join(", ")}).`);
