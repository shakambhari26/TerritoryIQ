import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * data/generated/market.json — the real market figures (channel partners, influencers, IHB, MO, visits and the sales
 * team) computed from GPS-placed visits by scripts/globe/place_visits.py. Read once at module scope; null when the
 * file has not been built. It holds rep names, so it is server-only and served through the auth-checked market route,
 * never imported by a client component.
 */
async function load(): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), "data", "generated", "market.json"), "utf8");
  } catch {
    return null;
  }
}

const marketJson = await load();

export function getMarketJson(): string | null {
  return marketJson;
}
