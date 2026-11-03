import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { handleBlockRowsRequest } from "../../src/features/globe/block-rows-route.server.ts";
import { parseBlockCustomersPayload, summariseCustomers, type CustomerFile, type CustomerRecord } from "../../src/features/globe/customers.ts";

/**
 * Customers on the globe (src/features/globe/customers.ts): counts on the page, names for one block on request, every
 * placement labelled as inferred, and no phone number anywhere.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const RECORD: CustomerRecord = {
  id: "CU-45",
  type: "Dealer",
  firm: "Synthetic Traders",
  name: "Aaron Testperson",
  erpCode: "30000001",
  confidence: "good",
  basis: "The firm name names a block.",
  village: null,
  flags: ["duplicate-code"],
};
const FILE: CustomerFile = {
  meta: {
    schema: 1,
    generatedAt: "2026-10-27T00:00:00.000Z",
    inputs: {},
    counts: { total: 3, placed: 2, unplaced: 1, byConfidence: { good: 1, medium: 0, low: 1 }, flagged: 1, byType: { Dealer: 1, IHB: 2 }, flags: {} },
  },
  globeBlockIds: ["GB-1", "GB-2", "GB-3"],
  blocks: {
    "GB-1": [RECORD],
    "GB-2": [{ ...RECORD, id: "CU-10", type: "IHB", firm: "Synthetic Clinic", name: "Synthetic Clinic", confidence: "low", village: { code: 1, name: "Somewhere" } }],
    "GB-3": [],
  },
};

describe("customers: what the page carries", () => {
  it("the summary holds counts only: no names, firms, ERP codes or reasons", () => {
    const summary = summariseCustomers(FILE);
    const text = JSON.stringify(summary);
    for (const secret of ["Aaron Testperson", "Synthetic Traders", "Synthetic Clinic", "30000001", "names a block", "Somewhere"]) {
      assert.ok(!text.includes(secret), secret);
    }
    assert.deepEqual(summary.blocks, {
      "GB-1": { total: 1, byType: { Dealer: 1 }, weakest: "good" },
      "GB-2": { total: 1, byType: { IHB: 1 }, weakest: "low" },
    });
    assert.equal(summary.counts.placed, 2);
  });

  it("the page and the panel get the summary, never the server module", () => {
    assert.match(read("src/app/globe/page.tsx"), /getCustomerSummary\(\)/);
    for (const file of ["src/features/globe/components/CustomersSection.tsx", "src/features/globe/components/GlobePanel.tsx"]) {
      assert.doesNotMatch(read(file), /customers\.server/, file);
    }
    assert.match(read("src/features/globe/customers.server.ts"), /^import "server-only";/);
  });

  it("every placement is shown as inferred", () => {
    const ui = read("src/features/globe/components/CustomersSection.tsx");
    for (const level of ["good", "medium", "low"]) assert.match(ui, new RegExp(`label: "Inferred · ${level}"`));
    assert.doesNotMatch(ui, /Confirmed/);
  });
});

describe("customers: the response is checked before it is shown", () => {
  const payload = { blockId: "GB-1", rows: [RECORD] };

  it("accepts exactly the promised block and count", () => {
    assert.deepEqual(parseBlockCustomersPayload(payload, "GB-1", 1), payload);
  });

  it("refuses another block, a different count, extra keys or a malformed record", () => {
    assert.equal(parseBlockCustomersPayload(payload, "GB-2", 1), null);
    assert.equal(parseBlockCustomersPayload(payload, "GB-1", 2), null);
    assert.equal(parseBlockCustomersPayload({ ...payload, extra: 1 }, "GB-1", 1), null);
    for (const bad of [
      { ...RECORD, phone: "9000000000" },
      { ...RECORD, type: "Distributor" },
      { ...RECORD, confidence: "confirmed" },
      { ...RECORD, id: "45" },
      { ...RECORD, flags: ["made-up"] },
      { ...RECORD, village: { code: "1", name: "x" } },
    ]) {
      assert.equal(parseBlockCustomersPayload({ blockId: "GB-1", rows: [bad] }, "GB-1", 1), null, JSON.stringify(bad));
    }
  });
});

describe("customers: the route", () => {
  const source = { available: true, rows: (id: string) => (id === "GB-1" ? [RECORD] : id === "GB-9" ? [] : null) };
  const post = (body: string, extra: Record<string, string> = {}) =>
    new Request("http://127.0.0.1:3000/api/globe/block-customers", {
      method: "POST",
      headers: { host: "127.0.0.1:3000", "content-type": "application/json", ...extra },
      body,
    });

  it("answers one block's customers, an empty list for a block with none, and 404 for no such block", async () => {
    const ok = await handleBlockRowsRequest(post('{"blockId":"GB-1"}'), source);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await ok.json(), { blockId: "GB-1", rows: [RECORD] });
    assert.deepEqual(await (await handleBlockRowsRequest(post('{"blockId":"GB-9"}'), source)).json(), { blockId: "GB-9", rows: [] });
    assert.equal((await handleBlockRowsRequest(post('{"blockId":"GB-404"}'), source)).status, 404);
  });

  it("applies the same checks as block-rows: Host, method, body", async () => {
    assert.equal((await handleBlockRowsRequest(post('{"blockId":"GB-1"}', { host: "evil.example" }), source)).status, 403);
    assert.equal((await handleBlockRowsRequest(post('{"blockId":"x"}'), source)).status, 400);
    assert.equal((await handleBlockRowsRequest(post('{"blockId":"GB-1","all":true}'), source)).status, 400);
  });

  it("the route file uses the shared handler and the customer lookup", () => {
    const route = read("src/app/api/globe/block-customers/route.ts");
    assert.match(route, /handleBlockRowsRequest\(request, \{ available: blockCustomersAvailable\(\), rows: getBlockCustomers \}\)/);
    assert.match(route, /await connection\(\);/);
  });
});

describe("customers: the build", () => {
  const build = read("scripts/build-customers.mts");

  it("never writes a phone number, and writes only under data/generated", () => {
    assert.doesNotMatch(build, /phone:|contact:|CUSTOMER CONTACT"\]\s*,?\s*\n?\s*\}/);
    assert.match(build, /writeFile\(path\.join\(GENERATED_DIR, "customers\.json"\)/);
  });

  it("places a customer only from the reviewed placements file, checked against LGD and the globe", () => {
    for (const check of ["does not match the export", "is not an LGD block code", "is not on the globe", "lies in block", "placed twice", "give the reason"]) {
      assert.ok(build.includes(check), check);
    }
  });

  it("the generated file, when present, holds no phone number", { skip: existsSync(join(ROOT, "data", "generated", "customers.json")) ? false : "not built" }, () => {
    const generated = read("data/generated/customers.json");
    const file = JSON.parse(generated) as CustomerFile;
    for (const list of Object.values(file.blocks)) for (const record of list) assert.deepEqual(Object.keys(record).sort(), Object.keys(RECORD).sort());
    // No 10-digit Indian mobile number anywhere, except where the export used a phone number as the ERP code.
    const erpCodes = new Set(Object.values(file.blocks).flat().map((r) => r.erpCode));
    for (const match of generated.matchAll(/(?<!\d)[6-9]\d{9}(?!\d)/g)) assert.ok(erpCodes.has(match[0]), "a phone number leaked");
  });
});
