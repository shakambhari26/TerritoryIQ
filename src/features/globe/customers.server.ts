import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { summariseCustomers, type CustomerFile, type CustomerRecord, type CustomerSummary } from "./customers";

/**
 * Server-side access to data/generated/customers.json (`npm run data:build-customers`). Server only: the file holds
 * customer and firm names, so it is never imported from a client component and never written to `public/`. Read once
 * at module scope, like overlay.server.ts; restart the server after regenerating it.
 *
 * What leaves this module: counts with no names (`getCustomerSummary`, for the page) and one block's customers on
 * request (`getBlockCustomers`, for POST /api/globe/block-customers). Both are null when the file has not been built.
 */
async function load(): Promise<{ summary: CustomerSummary; globeBlocks: Set<string>; blocks: Map<string, CustomerRecord[]> } | null> {
  try {
    const file = JSON.parse(await readFile(path.join(process.cwd(), "data", "generated", "customers.json"), "utf8")) as CustomerFile;
    return { summary: summariseCustomers(file), globeBlocks: new Set(file.globeBlockIds), blocks: new Map(Object.entries(file.blocks)) };
  } catch {
    return null;
  }
}

const loaded = await load();

export function getCustomerSummary(): CustomerSummary | null {
  return loaded?.summary ?? null;
}

/** One block's customers: an array (empty for a globe block with none), or null for an ID that is no globe block. */
export function getBlockCustomers(blockId: string): CustomerRecord[] | null {
  if (!loaded?.globeBlocks.has(blockId)) return null;
  return loaded.blocks.get(blockId) ?? [];
}

export function blockCustomersAvailable(): boolean {
  return loaded !== null;
}
