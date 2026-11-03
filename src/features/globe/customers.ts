/**
 * Customers on the globe: the contract shared by the build (scripts/build-customers.mts), the server
 * (customers.server.ts), POST /api/globe/block-customers and the browser (block-customers-client.ts). Pure and free of
 * any customer data.
 *
 * The customer export (data-source/CustomerData.csv) has no address, PIN code, district, block or coordinates. A
 * customer is placed only through data-source/customer-locations-inferred.csv: a reviewed list of placements inferred
 * from a place name inside the customer's or firm's name, each with a confidence and the reason. Every placement is
 * therefore "inferred", never confirmed, and the page says so. Customers without a reviewed placement are counted as
 * unplaced and are not drawn anywhere.
 *
 * As with the workbook rows, the page carries counts only. Names are fetched for one selected block at a time, and
 * phone numbers are never part of the app.
 */

export const CUSTOMER_TYPES = ["Dealer", "Retailer", "Mason", "IHB"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CONFIDENCES = ["good", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** Problems seen in the export row itself. Shown next to the customer; never used to place anyone. */
export const CUSTOMER_FLAGS = {
  "test-record": "Looks like a test record",
  "placeholder-code": "The ERP code looks like a placeholder",
  "code-is-phone": "The ERP code is the phone number",
  "duplicate-code": "Another row has the same ERP code",
  "no-contact": "No usable contact number",
} as const;
export type CustomerFlag = keyof typeof CUSTOMER_FLAGS;

/** One placed customer, as POST /api/globe/block-customers returns it. No phone number. */
export interface CustomerRecord {
  /** `CU-<SL NO.>`: the export has no reliable customer ID (placeholder and duplicate ERP codes). */
  id: string;
  type: CustomerType;
  firm: string;
  name: string;
  erpCode: string;
  confidence: Confidence;
  /** Why this block: the reviewed reason, in words. */
  basis: string;
  /** The LGD village the name points to, when the placement is that precise. */
  village: { code: number; name: string } | null;
  flags: CustomerFlag[];
}

/** Per block, what the page may carry: counts only. */
export interface BlockCustomerCount {
  total: number;
  byType: Partial<Record<CustomerType, number>>;
  /** The most cautious confidence among this block's placements. */
  weakest: Confidence;
}

export interface CustomerSummary {
  counts: {
    total: number;
    placed: number;
    unplaced: number;
    byConfidence: Record<Confidence, number>;
    flagged: number;
  };
  blocks: Record<string, BlockCustomerCount>;
}

/** The generated file, data/generated/customers.json. Server only: it holds names. */
export interface CustomerFile {
  meta: {
    schema: 1;
    generatedAt: string;
    inputs: Record<string, { file: string; sha256: string }>;
    counts: CustomerSummary["counts"] & { byType: Partial<Record<CustomerType, number>>; flags: Partial<Record<CustomerFlag, number>> };
  };
  /** Every block on the globe when this was built, so the server can tell "no customers here" from "no such block". */
  globeBlockIds: string[];
  blocks: Record<string, CustomerRecord[]>;
}

export interface BlockCustomersPayload {
  blockId: string;
  rows: CustomerRecord[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
};

function recordProblem(value: unknown): boolean {
  if (!isObject(value) || !hasExactKeys(value, ["id", "type", "firm", "name", "erpCode", "confidence", "basis", "village", "flags"])) return true;
  if (typeof value.id !== "string" || !/^CU-\d{1,9}$/.test(value.id)) return true;
  if (!CUSTOMER_TYPES.includes(value.type as CustomerType) || !CONFIDENCES.includes(value.confidence as Confidence)) return true;
  if (typeof value.firm !== "string" || typeof value.name !== "string" || typeof value.erpCode !== "string" || typeof value.basis !== "string") return true;
  const village = value.village;
  if (village !== null && (!isObject(village) || !hasExactKeys(village, ["code", "name"]) || !Number.isInteger(village.code) || typeof village.name !== "string")) return true;
  return !Array.isArray(value.flags) || value.flags.some((flag) => typeof flag !== "string" || !Object.hasOwn(CUSTOMER_FLAGS, flag));
}

/**
 * The response as a typed payload, or null if it is not exactly what the route sends for `blockId`: the right block,
 * the number of customers the page's count promised, and every record well formed. Nothing else is rendered.
 */
export function parseBlockCustomersPayload(value: unknown, blockId: string, expected: number): BlockCustomersPayload | null {
  if (!isObject(value) || !hasExactKeys(value, ["blockId", "rows"])) return null;
  if (value.blockId !== blockId || !Array.isArray(value.rows)) return null;
  const rows: unknown[] = value.rows;
  if (rows.length !== expected || rows.some(recordProblem)) return null;
  return { blockId, rows: rows as CustomerRecord[] };
}

/** Counts for the page from the full file: no names, no codes, no reasons. */
export function summariseCustomers(file: CustomerFile): CustomerSummary {
  const order: Record<Confidence, number> = { good: 0, medium: 1, low: 2 };
  const blocks: Record<string, BlockCustomerCount> = {};
  for (const [blockId, records] of Object.entries(file.blocks)) {
    if (records.length === 0) continue;
    const byType: Partial<Record<CustomerType, number>> = {};
    let weakest: Confidence = "good";
    for (const record of records) {
      byType[record.type] = (byType[record.type] ?? 0) + 1;
      if (order[record.confidence] > order[weakest]) weakest = record.confidence;
    }
    blocks[blockId] = { total: records.length, byType, weakest };
  }
  const { total, placed, unplaced, byConfidence, flagged } = file.meta.counts;
  return { counts: { total, placed, unplaced, byConfidence, flagged }, blocks };
}
