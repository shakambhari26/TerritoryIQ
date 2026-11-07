import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CustomerSummary } from "../../src/features/globe/customers.ts";
import type { GlobeInsights } from "../../src/features/globe/insights.ts";
import {
  buildBlockFacts,
  buildPaint,
  decodeSegment,
  EMPTY_FILTER,
  encodeSegment,
  filterActive,
  segment,
  type SegmentFilter,
} from "../../src/features/globe/segments.ts";
import { BLOCK_STYLE } from "../../src/features/globe/styles.ts";
import type { GlobeManifest, ManifestBlock, ManifestDistrict } from "../../src/features/globe/types.ts";

/** Segmenting the globe (src/features/globe/segments.ts) on synthetic data: facets, live counts, paint, URL state. */

const geometry = { bbox: [0, 0, 1, 1] as const, anchor: null, vertices: 4 };
const district = (id: string): ManifestDistrict => ({
  id, name: id.toUpperCase(), lgdCode: 1, state: "represented", reason: "", blockCount: 0, representedBlockCount: 0, drawnBlockCount: 0, geometry, noGeometryReason: null,
});
const block = (id: string, districtId: string, state: ManifestBlock["state"], extra: Partial<ManifestBlock> = {}): ManifestBlock => ({
  id, name: id, lgdCode: 1, districtId, state, reason: "", contested: false, rowIds: [], geometry, noGeometryReason: null, ...extra,
});

const manifest = {
  districts: [district("d1"), district("d2")],
  blocks: [
    block("b1", "d1", "represented"),
    block("b2", "d1", "unresolved", { geometry: null }),
    block("b3", "d2", "represented", { contested: true }),
    block("b4", "d2", "represented"),
  ],
} as unknown as GlobeManifest;

const insights = {
  blocks: {
    b1: { state: "allocated", staff: { named: 2, vacant: 0 } },
    b2: { state: "missing", staff: { named: 0, vacant: 0 } },
    b3: { state: "conflicting", staff: { named: 1, vacant: 1 } },
    b4: { state: "allocated", staff: { named: 0, vacant: 1 } },
  },
} as unknown as GlobeInsights;

const customers = { counts: {}, blocks: { b4: { total: 3, byType: { Dealer: 2, IHB: 1 }, weakest: "low" } } } as unknown as CustomerSummary;

const facts = buildBlockFacts(manifest, insights, customers);
const ids = (filter: Partial<SegmentFilter>) => [...segment(facts, { ...EMPTY_FILTER, ...filter }).matched].sort();

describe("globe segments", () => {
  it("an empty filter keeps every block and is not active", () => {
    const result = segment(facts, EMPTY_FILTER);
    assert.equal(result.active, false);
    assert.equal(result.matched.size, 4);
  });

  it("values within a facet are OR, facets together are AND", () => {
    assert.deepEqual(ids({ allocation: ["allocated", "missing"] }), ["b1", "b2", "b4"]);
    assert.deepEqual(ids({ allocation: ["allocated"], staffing: ["vacant"] }), ["b4"]);
    assert.deepEqual(ids({ districts: ["d2"], link: ["unresolved"] }), []);
  });

  it("staffing and customers take several values per block", () => {
    assert.deepEqual(ids({ staffing: ["named"] }), ["b1", "b3"]);
    assert.deepEqual(ids({ staffing: ["none"] }), ["b2"]);
    assert.deepEqual(ids({ customers: ["IHB"] }), ["b4"]);
    assert.deepEqual(ids({ customers: ["none"] }), ["b1", "b2", "b3"]);
  });

  it("the contested and outline toggles narrow the segment", () => {
    assert.deepEqual(ids({ contestedOnly: true }), ["b3"]);
    assert.deepEqual(ids({ drawnOnly: true }), ["b1", "b3", "b4"]);
  });

  it("facet counts ignore their own facet but respect the others", () => {
    const result = segment(facts, { ...EMPTY_FILTER, districts: ["d1"], allocation: ["allocated"] });
    // Allocation counts within d1 only, whatever allocation is chosen.
    assert.equal(result.facetCounts.allocation.get("allocated"), 1);
    assert.equal(result.facetCounts.allocation.get("missing"), 1);
    // District counts with allocation=allocated, whatever districts are chosen.
    assert.equal(result.facetCounts.districts.get("d1"), 1);
    assert.equal(result.facetCounts.districts.get("d2"), 1);
    assert.deepEqual(result.byDistrict.get("d1"), { matched: 1, total: 2 });
    assert.deepEqual(result.byDistrict.get("d2"), { matched: 0, total: 2 });
  });

  it("no filter and the default colour leave the renderer's own colours (null paint)", () => {
    assert.equal(buildPaint(manifest, facts, segment(facts, EMPTY_FILTER), "link"), null);
  });

  it("an active segment fades blocks outside it and shades districts by matches", () => {
    const result = segment(facts, { ...EMPTY_FILTER, districts: ["d1"] });
    const paint = buildPaint(manifest, facts, result, "link");
    assert.ok(paint);
    assert.equal(paint.get("block:b1")?.fill, BLOCK_STYLE.represented.fill);
    assert.equal(paint.get("block:b1")?.muted, false);
    assert.equal(paint.get("block:b3")?.muted, true);
    assert.ok((paint.get("block:b3")?.fillOpacity ?? 1) < 0.2);
    assert.equal(paint.get("district:d2")?.muted, true);
    assert.equal(paint.get("district:d1")?.muted, false);
  });

  it("colour by allocation paints every block in the segment by its allocation state", () => {
    const paint = buildPaint(manifest, facts, segment(facts, EMPTY_FILTER), "allocation");
    assert.ok(paint);
    assert.notEqual(paint.get("block:b1")?.fill, paint.get("block:b3")?.fill);
    assert.equal(paint.get("block:b1")?.fill, paint.get("block:b4")?.fill);
  });

  it("the filter round-trips through the URL and drops unknown values", () => {
    const filter: SegmentFilter = { ...EMPTY_FILTER, districts: ["d1"], staffing: ["vacant"], customers: ["IHB", "none"], contestedOnly: true };
    const text = encodeSegment(filter, "staffing");
    const back = decodeSegment(text, { districts: new Set(["d1", "d2"]) });
    assert.deepEqual(back.filter, filter);
    assert.equal(back.by, "staffing");
    const junk = decodeSegment("districts:zz,d2;link:bogus;by:evil", { districts: new Set(["d1", "d2"]) });
    assert.deepEqual(junk.filter.districts, ["d2"]);
    assert.deepEqual(junk.filter.link, []);
    assert.equal(junk.by, "link");
    assert.equal(filterActive(decodeSegment("", { districts: new Set() }).filter), false);
  });
});
