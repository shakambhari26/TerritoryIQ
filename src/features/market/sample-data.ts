/**
 * Sample market data for the head-office dashboard on the globe: channel partners, influencers, IHB, MO, IHB lead
 * status, customer visits and the sales team. Every number and every name here is made up. Nothing is read from the
 * workbook, the customer export or Visit Intelligence, so the page can be shown to anyone; the UI labels it as sample
 * data everywhere it appears.
 *
 * It is deterministic: the same block always gets the same numbers (a seeded generator keyed on the block id), so a
 * district is exactly the sum of its blocks and West Bengal the sum of every block, and a page reload changes nothing.
 * State totals are calibrated to the scale head office expects (TARGET_STATE below), spread unevenly across blocks the
 * way real markets are (a few busy towns, many quiet blocks).
 *
 * Pure and free of React, so the tests and the components share it.
 */

export const PERIODS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIODS)[number];

export const PARTNER_TYPES = ["dealers", "retailers", "engineers", "contractors", "masons", "ihb", "mo"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const VISIT_TYPES = ["dealers", "retailers", "engineers", "contractors", "masons", "ihb"] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const LEAD_STATUSES = ["highlyPositive", "positive", "neutral", "negative"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** West Bengal totals the sample is scaled to: partner counts, and visits and IHB leads over the last 7 days. */
export const TARGET_STATE = {
  partners: { dealers: 735, retailers: 2196, engineers: 740, contractors: 262, masons: 3767, ihb: 37286, mo: 256 },
  visits7: { dealers: 1475, retailers: 1770, engineers: 300, contractors: 58, masons: 1644, ihb: 3848 },
  leads7: { highlyPositive: 1019, positive: 774, neutral: 428, negative: 52 },
} as const satisfies {
  partners: Record<PartnerType, number>;
  visits7: Record<VisitType, number>;
  leads7: Record<LeadStatus, number>;
};

export interface PlaceRef {
  id: string;
  name: string;
}
export interface BlockRef extends PlaceRef {
  districtId: string | null;
}

export interface BlockSample {
  id: string;
  districtId: string | null;
  partners: Record<PartnerType, number>;
  visits: Record<PeriodDays, Record<VisitType, number>>;
  leads: Record<PeriodDays, Record<LeadStatus, number>>;
}

export interface SalesPerson {
  id: string;
  name: string;
  role: "ASM" | "Sales Officer";
  districtId: string | null;
  /** Blocks this person covers. An ASM covers every block of the district through their officers. */
  blockIds: string[];
  /** Days since the person last logged a visit, for "last active". */
  lastVisitDaysAgo: number;
}

export interface MarketSample {
  blocks: Map<string, BlockSample>;
  people: SalesPerson[];
}

export type Scope = { level: "state" } | { level: "district"; districtId: string } | { level: "block"; blockId: string };

export interface PersonRow {
  person: SalesPerson;
  visits: number;
  leads: number;
  /** Highly positive plus positive leads. */
  positiveLeads: number;
  partners: number;
}

export interface MarketSummary {
  blockCount: number;
  partners: Record<PartnerType, number>;
  visits: Record<VisitType, number>;
  leads: Record<LeadStatus, number>;
  team: PersonRow[];
}

// ---- seeded randomness ---------------------------------------------------------------------------------------------

/** FNV-1a: a stable 32-bit hash of a string, the seed for one block's (or one person's) numbers. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for sample data; returns a function giving numbers in [0, 1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rounds up with probability equal to the fraction, so totals keep their expected size even when per-block counts are small. */
function stochasticRound(x: number, r: () => number): number {
  const floor = Math.floor(x);
  return floor + (r() < x - floor ? 1 : 0);
}

/** A block's market size relative to the average block: log-normal, so a few blocks are much busier than most. */
function blockWeight(r: () => number): number {
  const u = Math.max(r(), 1e-9);
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  const sigma = 0.6;
  return Math.exp(sigma * normal - (sigma * sigma) / 2); // mean 1
}

// ---- names ---------------------------------------------------------------------------------------------------------

const FIRST = ["Arnab", "Debjit", "Souvik", "Pritam", "Ankita", "Rupam", "Tanmoy", "Moumita", "Sayan", "Indrani", "Payel",
  "Subhankar", "Riya", "Abhijit", "Sudipta", "Nilanjan", "Sreeparna", "Arindam", "Tanushree", "Shreya", "Kaushik", "Mitali"];
// No first-and-last pair here matches anyone in the area-mapping workbook (tests/unit/market-sample.test.mts checks).
const LAST = ["Chakraborty", "Banerjee", "Mukherjee", "Sarkar", "Bhattacharya", "Sengupta", "Majumdar", "Chatterjee", "Biswas",
  "Roychowdhury", "Basu", "Dasgupta", "Pal", "Nandi", "Halder", "Kundu", "Bhowmik"];

function personName(seed: string, used: Set<string>): string {
  const r = rng(hash(`name:${seed}`));
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Sample Rep ${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

// ---- building ------------------------------------------------------------------------------------------------------

const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** How many blocks one sales officer covers. */
const BLOCKS_PER_OFFICER = 3;

export function buildMarketSample(blocks: readonly BlockRef[], districts: readonly PlaceRef[]): MarketSample {
  const n = Math.max(blocks.length, 1);
  const samples = new Map<string, BlockSample>();

  for (const block of blocks) {
    const r = rng(hash(`block:${block.id}`));
    const weight = blockWeight(r);
    // Urban blocks have relatively more trade partners; rural ones relatively more individual house builders.
    const tilt = 0.75 + 0.5 * r();
    // Lead quality differs by area: in a "warm" block more IHB leads are positive and fewer neutral or negative.
    const warmth = 0.6 + 0.8 * r();
    const partners = zero(PARTNER_TYPES);
    for (const type of PARTNER_TYPES) {
      const lean = type === "ihb" || type === "masons" ? 2 - tilt : tilt;
      partners[type] = stochasticRound((TARGET_STATE.partners[type] / n) * weight * lean, r);
    }
    const visits = {} as BlockSample["visits"];
    const leads = {} as BlockSample["leads"];
    for (const days of PERIODS) {
      const pr = rng(hash(`block:${block.id}:${days}`));
      visits[days] = zero(VISIT_TYPES);
      for (const type of VISIT_TYPES) {
        const perDay = (TARGET_STATE.visits7[type] / 7 / n) * weight;
        visits[days][type] = stochasticRound(perDay * days * (0.9 + 0.2 * pr()), pr);
      }
      leads[days] = zero(LEAD_STATUSES);
      for (const status of LEAD_STATUSES) {
        const lean = status === "highlyPositive" || status === "positive" ? warmth : 2 - warmth;
        const perDay = (TARGET_STATE.leads7[status] / 7 / n) * weight * lean;
        leads[days][status] = stochasticRound(perDay * days * (0.9 + 0.2 * pr()), pr);
      }
    }
    samples.set(block.id, { id: block.id, districtId: block.districtId, partners, visits, leads });
  }

  // One ASM per district and one sales officer per BLOCKS_PER_OFFICER blocks, blocks taken in name order.
  const people: SalesPerson[] = [];
  const used = new Set<string>();
  const lastSeen = (seed: string) => Math.floor(rng(hash(`seen:${seed}`))() * 6);
  for (const district of [...districts].sort((a, b) => a.name.localeCompare(b.name))) {
    const own = blocks.filter((b) => b.districtId === district.id).sort((a, b) => a.name.localeCompare(b.name));
    if (own.length === 0) continue;
    people.push({ id: `asm-${district.id}`, name: personName(`asm-${district.id}`, used), role: "ASM", districtId: district.id, blockIds: own.map((b) => b.id), lastVisitDaysAgo: lastSeen(`asm-${district.id}`) });
    for (let i = 0; i < own.length; i += BLOCKS_PER_OFFICER) {
      const id = `so-${district.id}-${i / BLOCKS_PER_OFFICER + 1}`;
      people.push({ id, name: personName(id, used), role: "Sales Officer", districtId: district.id, blockIds: own.slice(i, i + BLOCKS_PER_OFFICER).map((b) => b.id), lastVisitDaysAgo: lastSeen(id) });
    }
  }
  return { blocks: samples, people };
}

// ---- summarising ---------------------------------------------------------------------------------------------------

function inScope(sample: BlockSample, scope: Scope): boolean {
  if (scope.level === "state") return true;
  if (scope.level === "district") return sample.districtId === scope.districtId;
  return sample.id === scope.blockId;
}

/**
 * Totals for a place and a period. Partner counts are what exists now; visits and leads are for the period. The sales
 * team lists everyone covering at least one block in scope, with figures for their blocks in scope only (an ASM's
 * figures are their whole district's). Visits per person are their blocks' visits, so the team adds up to the place.
 */
export function summarise(market: MarketSample, scope: Scope, days: PeriodDays): MarketSummary {
  const partners = zero(PARTNER_TYPES);
  const visits = zero(VISIT_TYPES);
  const leads = zero(LEAD_STATUSES);
  let blockCount = 0;
  for (const sample of market.blocks.values()) {
    if (!inScope(sample, scope)) continue;
    blockCount++;
    for (const t of PARTNER_TYPES) partners[t] += sample.partners[t];
    for (const t of VISIT_TYPES) visits[t] += sample.visits[days][t];
    for (const s of LEAD_STATUSES) leads[s] += sample.leads[days][s];
  }

  const team: PersonRow[] = [];
  for (const person of market.people) {
    const covered = person.blockIds.map((id) => market.blocks.get(id)).filter((b): b is BlockSample => b !== undefined && inScope(b, scope));
    if (covered.length === 0) continue;
    const row: PersonRow = { person, visits: 0, leads: 0, positiveLeads: 0, partners: 0 };
    for (const b of covered) {
      for (const t of VISIT_TYPES) row.visits += b.visits[days][t];
      for (const s of LEAD_STATUSES) row.leads += b.leads[days][s];
      row.positiveLeads += b.leads[days].highlyPositive + b.leads[days].positive;
      row.partners += b.partners.dealers + b.partners.retailers;
    }
    team.push(row);
  }
  team.sort((a, b) => (a.person.role === b.person.role ? b.visits - a.visits : a.person.role === "ASM" ? -1 : 1));
  return { blockCount, partners, visits, leads, team };
}
