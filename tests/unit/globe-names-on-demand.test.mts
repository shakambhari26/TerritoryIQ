import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { staffNames } from "../../scripts/verify-public-assets.mjs";
import { BLOCK_ID_PATTERN, BLOCK_ROWS_ERRORS, MAX_REQUEST_BYTES, parseBlockRowsPayload, type BlockRow } from "../../src/features/globe/block-rows.ts";
import { handleBlockRowsRequest, type BlockRowsSource } from "../../src/features/globe/block-rows-route.server.ts";
import { buildBlockRowIndex, projectManifest } from "../../src/features/globe/overlay-projection.server.ts";
import type { ServerManifest } from "../../src/features/globe/server-types.ts";
import type { TerritoryDataset } from "../../src/features/territory/types.ts";
import { leakedNames } from "./helpers/leaked-names.mts";

/**
 * Globe names on demand. The /globe page carries no staff names, row labels or sales territories: its manifest is an
 * allow-list projection of the generated file (blocks list `rowIds`), and one selected block's rows come from
 * POST /api/globe/block-rows. These tests use synthetic names for the rules and the refusals, then check the real build
 * by COUNTING matches only, so a failure never prints a real name. The proof against a running server is
 * tests/e2e/globe-privacy.test.mts.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---- synthetic manifest: not real geography, not real people -------------------------------------------------------

const NAMES = ["Zelda Quillfeather", "Orrin Dovetail", "Marguerite Fennimore", "Tobias Wrenfield"];
const LABELS = ["Label Alpha Row", "Label Beta Row", "Label Gamma Row"];
const TERRITORIES = ["Territory Alpha Zone", "Territory Beta Zone"];

const geometry = { bbox: [88.1, 22.2, 88.9, 22.9] as const, anchor: [88.5, 22.5] as const, vertices: 12 };

function synthetic(): ServerManifest {
  const person = (role: string, slot: number, name: string | null) => ({ role, slot, name, vacant: name === null });
  const block = (id: string, name: string, records: ServerManifest["blocks"][number]["records"], withGeometry = true): ServerManifest["blocks"][number] => ({
    id, name, lgdCode: Number(id.slice(3)), districtId: "GD-1", state: records.length > 0 ? "represented" : "unresolved", reason: `reason ${id}`, contested: records.length > 1,
    records, geometry: withGeometry ? { ...geometry, bbox: [...geometry.bbox], anchor: [...geometry.anchor] } as never : null, noGeometryReason: withGeometry ? null : "no outline",
  });
  return {
    meta: {
      schema: 1, generatedAt: "2026-01-01T00:00:00Z", inputs: { "dataset.json": { sha256: "a".repeat(64), generatedAt: "2026-01-01T00:00:00Z" }, "globe-boundaries.json": { sha256: "b".repeat(64), datasetId: "d", kind: "k", shapes: 3 } },
      crs: "EPSG:4326", layerSource: "synthetic", licence: "ODbL", attribution: "synthetic", snapshots: ["s"], status: "Provisional.", colourRule: { district: "d", block: "b", unresolved: "u" },
      counts: { districts: 1, districtsDrawn: 1, districtsRepresented: 1, blocks: 4, blocksDrawn: 3, blocksRepresented: 2, blocksRepresentedAndDrawn: 2, blocksNoRepresentativeConfirmed: 0, blocksUnresolved: 2, blocksContested: 1, shapesRejected: 0, parentFailures: 0, duplicateShapes: 0 },
    },
    state: { id: "GS-1", name: "Synthetic State", bbox: [88, 22, 89, 23], centre: [88.5, 22.5], basis: "synthetic" },
    districts: [{ id: "GD-1", name: "Synthetic District", lgdCode: 1, state: "represented", reason: "r", blockCount: 4, representedBlockCount: 2, drawnBlockCount: 3, geometry, noGeometryReason: null }],
    blocks: [
      block("GB-1", "Block One", [{ unitId: "TU-1", blockLabel: LABELS[0], territory: TERRITORIES[0], namedPeople: 2, people: [person("ASM", 1, NAMES[0]), person("TSI", 1, NAMES[1])] }]),
      block("GB-22", "Block Two", [
        { unitId: "TU-2", blockLabel: LABELS[1], territory: TERRITORIES[1], namedPeople: 1, people: [person("ASM", 1, NAMES[2]), person("TSI", 1, null)] },
        { unitId: "TU-3", blockLabel: LABELS[2], territory: TERRITORIES[1], namedPeople: 1, people: [person("ASM", 1, NAMES[3])] },
      ]),
      block("GB-333", "Block Three", []),
      block("GB-4444", "Block Four", [], false),
    ],
    rejected: [],
  } as ServerManifest;
}

const ALLOWED_KEYS = {
  manifest: ["blocks", "districts", "meta", "rejected", "state"],
  block: ["contested", "districtId", "geometry", "id", "lgdCode", "name", "noGeometryReason", "reason", "rowIds", "state"],
  district: ["blockCount", "drawnBlockCount", "geometry", "id", "lgdCode", "name", "noGeometryReason", "reason", "representedBlockCount", "state"],
  geometry: ["anchor", "bbox", "vertices"],
};
const sorted = (value: object) => Object.keys(value).sort();

describe("the projected manifest (what the page carries)", () => {
  const server = synthetic();
  const manifest = projectManifest(server);
  const text = JSON.stringify(manifest);

  it("holds only the allowed keys, at every level the projection builds", () => {
    assert.deepEqual(sorted(manifest), ALLOWED_KEYS.manifest);
    for (const block of manifest.blocks) {
      assert.deepEqual(sorted(block), ALLOWED_KEYS.block, block.id);
      if (block.geometry) assert.deepEqual(sorted(block.geometry), ALLOWED_KEYS.geometry, block.id);
    }
    for (const district of manifest.districts) {
      assert.deepEqual(sorted(district), ALLOWED_KEYS.district);
      assert.deepEqual(sorted(district.geometry!), ALLOWED_KEYS.geometry);
    }
    assert.deepEqual(sorted(manifest.state), ["basis", "bbox", "centre", "id", "name"]);
    assert.deepEqual(sorted(manifest.meta), ["attribution", "colourRule", "counts", "crs", "generatedAt", "inputs", "layerSource", "licence", "schema", "snapshots", "status"]);
  });

  it("carries none of the synthetic names, row labels or territories, and none of the record field names", () => {
    for (const secret of [...NAMES, ...LABELS, ...TERRITORIES]) assert.ok(!text.includes(secret), "a synthetic detail reached the manifest");
    for (const field of ["records", "people", "blockLabel", "territory", "namedPeople", "unitId"]) assert.ok(!text.includes(`"${field}"`), `${field} is not in the manifest`);
  });

  it("builds each object from named keys: a field added to the generated file does not reach the page", () => {
    const extra = synthetic();
    (extra as unknown as Record<string, unknown>).secret = "S1";
    (extra.meta as unknown as Record<string, unknown>).secret = "S2";
    (extra.state as unknown as Record<string, unknown>).secret = "S3";
    (extra.districts[0] as unknown as Record<string, unknown>).secret = "S4";
    (extra.blocks[0] as unknown as Record<string, unknown>).secret = "S5";
    (extra.blocks[0].geometry as unknown as Record<string, unknown>).secret = "S6";
    (extra.meta.counts as unknown as Record<string, unknown>).secret = "S7";
    (extra.meta.inputs["dataset.json"] as unknown as Record<string, unknown>).secret = "S8";
    const out = JSON.stringify(projectManifest(extra));
    assert.ok(!/"secret"|S[1-8]\b/.test(out), "an unlisted field was copied");
  });

  it("keeps every field the globe draws from, unchanged", () => {
    assert.equal(manifest.blocks.length, server.blocks.length);
    server.blocks.forEach((block, index) => {
      const { records: _records, ...rest } = block;
      void _records;
      const { rowIds: _rowIds, ...projected } = manifest.blocks[index] as typeof manifest.blocks[number] & { rowIds: string[] };
      void _rowIds;
      assert.deepEqual(projected, rest, block.id);
    });
    assert.deepEqual(manifest.districts, server.districts);
    assert.deepEqual(manifest.state, server.state);
    assert.deepEqual(manifest.meta, server.meta);
    assert.deepEqual(manifest.rejected, server.rejected);
  });

  it("lists each block's row IDs in the same order as its records' unitIds", () => {
    assert.deepEqual(manifest.blocks.map((b) => b.rowIds), [["TU-1"], ["TU-2", "TU-3"], [], []]);
  });

  it("keeps a reviewed confirmation where there is one, and adds none where there is none", () => {
    const confirmed = synthetic();
    const confirmation = { schemaVersion: 1, recordId: "R-1" } as never;
    (confirmed.blocks[2] as { confirmation?: unknown }).confirmation = confirmation;
    const out = projectManifest(confirmed);
    assert.equal(out.blocks[2].confirmation, confirmation);
    assert.ok(!("confirmation" in out.blocks[0]));
  });
});

// ---- the endpoint --------------------------------------------------------------------------------------------------

const URL_ = "http://127.0.0.1:3000/api/globe/block-rows";
interface Init {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
}
const request = ({ method = "POST", headers = {}, body }: Init = {}) =>
  new Request(URL_, { method, headers: { host: "127.0.0.1:3000", "content-type": "application/json", ...headers }, body: body === undefined ? JSON.stringify({ blockId: "GB-22" }) : body, ...(body && typeof body !== "string" ? { duplex: "half" } : {}) } as RequestInit);

function sourceOf(server: ServerManifest, available = true): BlockRowsSource {
  const index = buildBlockRowIndex(server);
  return { available, rows: (id) => index.get(id) ?? null };
}

const REQUIRED_HEADERS = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
function assertHeaders(response: Response, label: string) {
  for (const [name, value] of Object.entries(REQUIRED_HEADERS)) assert.equal(response.headers.get(name), value, `${label}: ${name}`);
}

describe("POST /api/globe/block-rows: the handler", () => {
  const source = sourceOf(synthetic());

  it("answers a valid request with that block's rows only, field by field, as private no-store JSON", async () => {
    const response = await handleBlockRowsRequest(request(), source);
    assert.equal(response.status, 200);
    assertHeaders(response, "200");
    assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
    const body = (await response.json()) as { blockId: string; rows: BlockRow[] };
    assert.deepEqual(Object.keys(body).sort(), ["blockId", "rows"]);
    assert.equal(body.blockId, "GB-22");
    assert.deepEqual(body.rows.map((r) => r.unitId), ["TU-2", "TU-3"]);
    for (const row of body.rows) {
      assert.deepEqual(Object.keys(row).sort(), ["blockLabel", "people", "territory", "unitId"]);
      for (const person of row.people) assert.deepEqual(Object.keys(person).sort(), ["name", "role", "slot", "vacant"]);
    }
    const text = JSON.stringify(body);
    assert.ok(text.includes(NAMES[2]) && text.includes(NAMES[3]));
    for (const other of [NAMES[0], NAMES[1], LABELS[0], TERRITORIES[0], "TU-1", "GB-1\"", "GB-333", "GB-4444", "namedPeople"]) assert.ok(!text.includes(other), "another block's data is in the response");
  });

  it("answers a known block that has no rows with an empty array, and the response parses for a block with no row IDs", async () => {
    const response = await handleBlockRowsRequest(request({ body: JSON.stringify({ blockId: "GB-333" }) }), source);
    assert.equal(response.status, 200);
    assertHeaders(response, "empty");
    const body = await response.json();
    assert.deepEqual(body, { blockId: "GB-333", rows: [] });
    assert.deepEqual(parseBlockRowsPayload(body, "GB-333", []), body);
  });

  it("refuses an unknown but well-formed ID with 404, and everything before it with the codes below, never echoing the input", async () => {
    const MARK = "ZZ-ECHO-MARKER-9183";
    const cases: Array<{ label: string; init: Init; status: number; code: string }> = [
      { label: "unknown ID", init: { body: JSON.stringify({ blockId: "GB-999999" }) }, status: 404, code: "notfound" },
      { label: "lowercase ID", init: { body: JSON.stringify({ blockId: "gb-22" }) }, status: 400, code: "badid" },
      { label: "no digits", init: { body: JSON.stringify({ blockId: "GB-" }) }, status: 400, code: "badid" },
      { label: "ten digits", init: { body: JSON.stringify({ blockId: "GB-1234567890" }) }, status: 400, code: "badid" },
      { label: "leading space", init: { body: JSON.stringify({ blockId: " GB-22" }) }, status: 400, code: "badid" },
      { label: "trailing newline", init: { body: JSON.stringify({ blockId: "GB-22\n" }) }, status: 400, code: "badid" },
      { label: "a row ID", init: { body: JSON.stringify({ blockId: "TU-2" }) }, status: 400, code: "badid" },
      { label: "a district ID", init: { body: JSON.stringify({ blockId: "GD-1" }) }, status: 400, code: "badid" },
      { label: "a path", init: { body: JSON.stringify({ blockId: "../GB-22" }) }, status: 400, code: "badid" },
      { label: "__proto__ as the ID", init: { body: JSON.stringify({ blockId: "__proto__" }) }, status: 400, code: "badid" },
      { label: "constructor as the ID", init: { body: JSON.stringify({ blockId: "constructor" }) }, status: 400, code: "badid" },
      { label: "a number", init: { body: JSON.stringify({ blockId: 22 }) }, status: 400, code: "badid" },
      { label: "null ID", init: { body: JSON.stringify({ blockId: null }) }, status: 400, code: "badid" },
      { label: "an array ID", init: { body: JSON.stringify({ blockId: ["GB-22"] }) }, status: 400, code: "badid" },
      { label: "an object ID", init: { body: JSON.stringify({ blockId: { toString: MARK } }) }, status: 400, code: "badid" },
      { label: "an extra key", init: { body: JSON.stringify({ blockId: "GB-22", [MARK]: 1 }) }, status: 400, code: "badrequest" },
      { label: "a different key", init: { body: JSON.stringify({ [MARK]: "GB-22" }) }, status: 400, code: "badrequest" },
      { label: "__proto__ as a key", init: { body: '{"__proto__":{"blockId":"GB-22"}}' }, status: 400, code: "badrequest" },
      { label: "constructor as a key", init: { body: '{"constructor":"GB-22"}' }, status: 400, code: "badrequest" },
      { label: "an empty object", init: { body: "{}" }, status: 400, code: "badrequest" },
      { label: "an array body", init: { body: JSON.stringify([{ blockId: "GB-22" }]) }, status: 400, code: "badrequest" },
      { label: "a null body", init: { body: "null" }, status: 400, code: "badrequest" },
      { label: "a number body", init: { body: "22" }, status: 400, code: "badrequest" },
      { label: "a string body", init: { body: JSON.stringify(MARK) }, status: 400, code: "badrequest" },
      { label: "invalid JSON", init: { body: `{"blockId": ${MARK}` }, status: 400, code: "badjson" },
      { label: "an empty body", init: { body: "" }, status: 400, code: "badjson" },
      { label: "invalid UTF-8", init: { body: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]) }, status: 400, code: "badjson" },
      { label: "an oversized body", init: { body: JSON.stringify({ blockId: "GB-22", pad: MARK.repeat(40) }) }, status: 413, code: "toolarge" },
      { label: "an oversized blockId", init: { body: JSON.stringify({ blockId: `GB-${"1".repeat(MAX_REQUEST_BYTES)}` }) }, status: 413, code: "toolarge" },
      { label: "a declared length over the cap", init: { headers: { "content-length": "4096" } }, status: 413, code: "toolarge" },
      { label: "a malformed content-length", init: { headers: { "content-length": "12abc" } }, status: 413, code: "toolarge" },
      { label: "text/plain", init: { headers: { "content-type": "text/plain" } }, status: 415, code: "mediatype" },
      { label: "form encoding", init: { headers: { "content-type": "application/x-www-form-urlencoded" } }, status: 415, code: "mediatype" },
      { label: "json lookalike", init: { headers: { "content-type": "application/jsonp" } }, status: 415, code: "mediatype" },
      { label: "json with another parameter", init: { headers: { "content-type": "application/json; boundary=x" } }, status: 415, code: "mediatype" },
      { label: "no content type", init: { headers: { "content-type": "" } }, status: 415, code: "mediatype" },
      { label: "GET", init: { method: "GET", body: null }, status: 405, code: "method" },
      { label: "PUT", init: { method: "PUT" }, status: 405, code: "method" },
      { label: "DELETE", init: { method: "DELETE", body: null }, status: 405, code: "method" },
      { label: "PATCH", init: { method: "PATCH" }, status: 405, code: "method" },
      { label: "a foreign Host", init: { headers: { host: "evil.example" } }, status: 403, code: "host" },
      { label: "a lookalike Host", init: { headers: { host: "127.0.0.1.evil.example" } }, status: 403, code: "host" },
    ];
    for (const { label, init, status, code } of cases) {
      const response = await handleBlockRowsRequest(request(init), source);
      const text = await response.text();
      assert.equal(response.status, status, label);
      assertHeaders(response, label);
      const expected = BLOCK_ROWS_ERRORS[code as keyof typeof BLOCK_ROWS_ERRORS];
      assert.deepEqual(JSON.parse(text), { code, error: expected.message }, `${label}: fixed code and message`);
      assert.ok(!text.includes(MARK) && !/GB-\d|constructor|__proto__|toString/.test(text), `${label}: the input is not echoed`);
      for (const secret of [...NAMES, ...LABELS, ...TERRITORIES]) assert.ok(!text.includes(secret), `${label}: no data in an error`);
    }
    const method = await handleBlockRowsRequest(request({ method: "GET", body: null }), source);
    assert.equal(method.headers.get("allow"), "POST");
  });

  it("stops reading a body that has no length once it passes 256 bytes", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 200) controller.close();
        else controller.enqueue(new Uint8Array(64).fill(0x20));
      },
    });
    const response = await handleBlockRowsRequest(request({ body: stream as unknown as BodyInit }), source);
    assert.equal(response.status, 413);
    assert.ok(pulled < 20, `read ${pulled} chunks of a stream with no end`);
  });

  it("accepts a charset parameter and any letter case in the content type, and a body of exactly the cap", async () => {
    for (const type of ["application/json; charset=utf-8", "Application/JSON", "application/json;charset=UTF-8"]) {
      const response = await handleBlockRowsRequest(request({ headers: { "content-type": type } }), source);
      assert.equal(response.status, 200, type);
    }
    const padded = `{"blockId":"GB-22"${" ".repeat(MAX_REQUEST_BYTES - 18 - 1)}}`;
    assert.equal(new TextEncoder().encode(padded).length, MAX_REQUEST_BYTES);
    assert.equal((await handleBlockRowsRequest(request({ body: padded }), source)).status, 200);
    assert.equal((await handleBlockRowsRequest(request({ body: `${padded} ` }), source)).status, 413);
  });

  it("answers 404 `unavailable` for a valid request when the manifest was not built, with the same headers", async () => {
    const response = await handleBlockRowsRequest(request(), sourceOf(synthetic(), false));
    assert.equal(response.status, 404);
    assertHeaders(response, "unavailable");
    assert.equal(((await response.json()) as { code: string }).code, "unavailable");
  });

  it("resolves IDs only by exact lookup in a Map: no prototype key or inherited property is ever a block", () => {
    const index = buildBlockRowIndex(synthetic());
    assert.ok(index instanceof Map);
    for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty", "length", "0", ""]) assert.equal(index.get(key), undefined, key);
    assert.deepEqual([...index.keys()], ["GB-1", "GB-22", "GB-333", "GB-4444"]);
  });
});

describe("the response check the browser applies (parseBlockRowsPayload)", () => {
  const good = () => ({
    blockId: "GB-22",
    rows: [
      { unitId: "TU-2", blockLabel: "l", territory: "t", people: [{ role: "ASM", slot: 1, name: "n", vacant: false }, { role: "TSI", slot: 1, name: null, vacant: true }] },
      { unitId: "TU-3", blockLabel: "l", territory: "t", people: [] },
    ],
  });
  const ids = ["TU-2", "TU-3"];

  it("accepts exactly the expected block and row sequence", () => {
    assert.deepEqual(parseBlockRowsPayload(good(), "GB-22", ids), good());
  });

  it("refuses another block, missing, extra or reordered rows, extra keys and wrong types", () => {
    const mutate = (change: (value: ReturnType<typeof good>) => unknown) => parseBlockRowsPayload(change(good()), "GB-22", ids);
    assert.equal(parseBlockRowsPayload(good(), "GB-1", ids), null, "a response for another block");
    assert.equal(parseBlockRowsPayload(good(), "GB-22", ["TU-2"]), null, "an extra row");
    assert.equal(parseBlockRowsPayload(good(), "GB-22", ["TU-3", "TU-2"]), null, "reordered row IDs");
    assert.equal(parseBlockRowsPayload(good(), "GB-22", []), null, "rows for a block that lists none");
    assert.equal(mutate((v) => ({ ...v, rows: v.rows.slice(0, 1) })), null, "a missing row");
    assert.equal(mutate((v) => ({ ...v, rows: [...v.rows].reverse() })), null, "reordered rows");
    assert.equal(mutate((v) => ({ ...v, extra: 1 })), null);
    assert.equal(mutate((v) => ({ ...v, rows: [{ ...v.rows[0], extra: 1 }, v.rows[1]] })), null);
    assert.equal(mutate((v) => ({ ...v, rows: [{ ...v.rows[0], people: [{ role: "ASM", slot: "1", name: "n", vacant: false }] }, v.rows[1]] })), null);
    assert.equal(mutate((v) => ({ ...v, rows: [{ ...v.rows[0], people: [{ role: "ASM", slot: 1, name: 5, vacant: false }] }, v.rows[1]] })), null);
    assert.equal(mutate((v) => ({ ...v, rows: [{ ...v.rows[0], people: [{ role: "ASM", slot: 1, name: "n", vacant: false, extra: 1 }] }, v.rows[1]] })), null);
    assert.equal(mutate((v) => ({ ...v, rows: [{ ...v.rows[0], territory: 3 }, v.rows[1]] })), null);
    assert.equal(mutate((v) => ({ ...v, rows: "TU-2" })), null);
    for (const value of [null, undefined, "x", 1, [], [good()]]) assert.equal(parseBlockRowsPayload(value, "GB-22", ids), null);
  });
});

// ---- the real build: counts only, no names printed -------------------------------------------------------------------

const overlayPath = join(ROOT, "data", "generated", "globe-overlay.json");
const datasetPath = join(ROOT, "data", "generated", "dataset.json");
const ready = existsSync(overlayPath) && existsSync(datasetPath);

describe("the real build", { skip: ready ? false : "run npm run data:build and python -I scripts/globe/build_overlay.py first" }, () => {
  const server = ready ? (JSON.parse(readFileSync(overlayPath, "utf8")) as ServerManifest) : (null as never);
  const names = ready ? staffNames(JSON.parse(readFileSync(datasetPath, "utf8")) as TerritoryDataset) : [];
  const manifest = ready ? projectManifest(server) : (null as never);
  const index = ready ? buildBlockRowIndex(server) : (null as never);
  const source: BlockRowsSource = ready ? { available: true, rows: (id) => index.get(id) ?? null } : (null as never);

  it("checks a meaningful number of names", () => {
    assert.ok(names.length > 200, `${names.length} names`);
  });

  it("the projected manifest holds no staff name and no record field, by count", () => {
    const text = JSON.stringify(manifest);
    assert.equal(leakedNames(text, names), 0, "staff names in the projected manifest");
    for (const field of ["records", "people", "blockLabel", "namedPeople", "unitId"]) assert.ok(!text.includes(`"${field}"`), `${field} is not in the projected manifest`);
    assert.ok(!text.includes('"territory"'), "territory is not in the projected manifest");
    assert.ok(leakedNames(JSON.stringify(server), names) > 200, "positive control: the source file does carry the names");
  });

  it("keeps rowIds in the order of the former records' unitIds, and every block has them", () => {
    assert.equal(manifest.blocks.length, server.blocks.length);
    let rows = 0;
    server.blocks.forEach((block, i) => {
      assert.deepEqual(manifest.blocks[i].rowIds, block.records.map((r) => r.unitId), block.id);
      rows += block.records.length;
    });
    assert.ok(rows > 250, `${rows} rows`);
  });

  it("changes nothing else about any block or district (drawing, state, counts and metadata are equal)", () => {
    server.blocks.forEach((block, i) => {
      const { records: _records, ...rest } = block;
      void _records;
      const { rowIds: _rowIds, ...projected } = manifest.blocks[i];
      void _rowIds;
      assert.deepEqual(projected, rest, block.id);
    });
    assert.deepEqual(manifest.districts, server.districts);
    assert.deepEqual(manifest.state, server.state);
    assert.deepEqual(manifest.meta, server.meta);
    assert.deepEqual(manifest.rejected, server.rejected);
  });

  it("every real block ID matches the endpoint's pattern, and row IDs are not block IDs", () => {
    for (const block of server.blocks) assert.match(block.id, BLOCK_ID_PATTERN, "a block ID does not match the pattern");
    for (const block of manifest.blocks) for (const id of block.rowIds) assert.doesNotMatch(id, BLOCK_ID_PATTERN);
  });

  it("every block's response holds that block's rows and no other block's person (by count), and parses against the page's row IDs", async () => {
    const namesOf = (rows: Array<{ people: Array<{ name: string | null }> }>) => new Set(rows.flatMap((r) => r.people.flatMap((p) => (p.name ? [p.name.trim()] : []))));
    let answered = 0;
    for (const block of manifest.blocks) {
      const response = await handleBlockRowsRequest(request({ body: JSON.stringify({ blockId: block.id }) }), source);
      assert.equal(response.status, 200, block.id);
      assertHeaders(response, block.id);
      const text = await response.text();
      const own = namesOf(server.blocks.find((b) => b.id === block.id)!.records);
      // A name that is part of one of this block's own names or row strings (as "Sam" is of "Sam Rao") is not another block's.
      const ownText = [...own, ...server.blocks.find((b) => b.id === block.id)!.records.flatMap((r) => [r.blockLabel, r.territory])].map((v) => v.toLowerCase());
      const others = names.filter((name) => !own.has(name) && !ownText.some((v) => v.includes(name.toLowerCase())));
      assert.equal(leakedNames(text, others), 0, `${block.id}: a name that belongs only to other blocks is in the response`);
      assert.equal(leakedNames(text, [...own]), own.size, `${block.id}: its own names are in the response`);
      assert.ok(parseBlockRowsPayload(JSON.parse(text), block.id, block.rowIds), `${block.id}: the page accepts the response`);
      for (const other of manifest.blocks) if (other.id !== block.id) assert.ok(!text.includes(`"${other.id}"`), `${block.id}: another block's ID is in the response`);
      answered += 1;
    }
    assert.equal(answered, manifest.blocks.length);
  });

  it("a block's response is a small fraction of the file that held every block's rows", async () => {
    const full = readFileSync(overlayPath).length;
    const largest = Math.max(...(await Promise.all(manifest.blocks.map(async (b) => (await (await handleBlockRowsRequest(request({ body: JSON.stringify({ blockId: b.id }) }), source)).text()).length))));
    assert.ok(largest < full / 50, `the largest response (${largest} bytes) against the ${full}-byte file`);
  });
});

// ---- structure: what the client may import -----------------------------------------------------------------------------

const SRC = join(ROOT, "src");
function* sourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if ([".ts", ".tsx"].includes(extname(entry.name))) yield path;
  }
}
const sources = new Map<string, string>();
for (const file of sourceFiles(SRC)) sources.set(file, readFileSync(file, "utf8"));
const rel = (file: string) => relative(ROOT, file).split("\\").join("/");

/** Modules that hold, or can return, the names-bearing records. */
const SERVER_ONLY = ["src/features/globe/overlay.server.ts", "src/features/globe/overlay-projection.server.ts", "src/features/globe/server-types.ts", "src/features/globe/block-rows-route.server.ts"];

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(SRC, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  return candidates.find((c) => sources.has(c)) ?? null;
}
const importsOf = (file: string) => [...sources.get(file)!.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map((m) => m[1]);

describe("structure: client code cannot reach the names-bearing manifest or its records", () => {
  const isClient = (text: string) => /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(text);
  const clientRoots = [...sources].filter(([, text]) => isClient(text)).map(([file]) => file);

  it("finds the globe's client components", () => {
    const names = clientRoots.map(rel);
    for (const expected of ["src/features/globe/components/GlobePanel.tsx", "src/features/globe/components/GlobeExperience.tsx", "src/features/globe/components/BlockRowsSection.tsx", "src/features/globe/components/GlobeFallback.tsx"]) {
      assert.ok(names.includes(expected), expected);
    }
  });

  it("no client file, and nothing a client file imports, reaches a server-only module, including through a chain", () => {
    const seen = new Set<string>();
    const queue = [...clientRoots];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const specifier of importsOf(file)) {
        const target = resolveImport(file, specifier);
        if (!target) continue;
        assert.ok(!SERVER_ONLY.includes(rel(target)) && !/\.server(?:\.tsx?)?$/.test(rel(target)), `${rel(file)} imports ${rel(target)}, which holds the names-bearing manifest or its records`);
        queue.push(target);
      }
    }
    assert.ok(seen.size > 20, `${seen.size} client-reachable files walked`);
  });

  it("only server code imports the server-only modules, and the page imports the manifest only through overlay.server", () => {
    const importers = new Map<string, string[]>();
    for (const file of sources.keys()) {
      for (const specifier of importsOf(file)) {
        const target = resolveImport(file, specifier);
        if (target && SERVER_ONLY.includes(rel(target))) importers.set(rel(target), [...(importers.get(rel(target)) ?? []), rel(file)]);
      }
    }
    assert.deepEqual((importers.get("src/features/globe/overlay.server.ts") ?? []).sort(), ["src/app/api/globe/block-rows/route.ts", "src/app/geo/globe-boundaries.json/route.ts", "src/app/globe/page.tsx"]);
    assert.deepEqual(importers.get("src/features/globe/block-rows-route.server.ts"), ["src/app/api/globe/block-rows/route.ts"]);
    assert.deepEqual((importers.get("src/features/globe/overlay-projection.server.ts") ?? []).sort(), ["src/features/globe/overlay.server.ts"]);
    for (const file of importers.get("src/features/globe/server-types.ts") ?? []) assert.match(file, /\.server\.ts$/, `${file} should import server-types only from a server module`);
    for (const [file, text] of sources) {
      for (const specifier of importsOf(file)) {
        const target = resolveImport(file, specifier);
        if (target && rel(target) === "src/features/globe/server-types.ts") assert.match(text, new RegExp(`import type [^;]*from ["']${specifier.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}["']`), `${rel(file)} must use a type-only import for server-types`);
      }
    }
  });

  it("overlay.server exports only the projection and one block's rows, never the parsed manifest", () => {
    const text = sources.get(join(SRC, "features/globe/overlay.server.ts"))!.replace(/\/\*[\s\S]*?\*\//g, "");
    const exported = [...text.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface)\s+(\w+)/gm)].map((m) => m[1]).sort();
    assert.deepEqual(exported, ["blockRowsAvailable", "getBlockRows", "getGlobeManifest"]);
    assert.doesNotMatch(text, /^export\s*\{|^export\s+default|export\s+\*/m);
    assert.match(text, /function getGlobeManifest\(\): GlobeManifest \| null/);
    assert.match(text, /function getBlockRows\(blockId: string\): BlockRow\[\] \| null/);
  });

  it("GlobePanel no longer reads .records, and neither does any other globe source", () => {
    for (const [file, text] of sources) {
      if (!rel(file).startsWith("src/features/globe/") && !rel(file).startsWith("src/app/globe/")) continue;
      if (SERVER_ONLY.includes(rel(file))) continue; // the server modules are where the records are read and split
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      assert.doesNotMatch(code, /\.records\b|\brecords\s*:/, rel(file));
    }
    const panel = sources.get(join(SRC, "features/globe/components/GlobePanel.tsx"))!;
    assert.match(panel, /<BlockRowsSection key=\{block\.id\}/);
    assert.match(panel, /rowIds=\{block\.rowIds\}/);
  });

  it("the client-facing types carry no record type, and the server-only types are the only place the records are declared", () => {
    const types = sources.get(join(SRC, "features/globe/types.ts"))!;
    assert.doesNotMatch(types.replace(/\/\*[\s\S]*?\*\//g, ""), /OverlayRecord|OverlayPerson|namedPeople|blockLabel|territory/);
    assert.match(types, /rowIds: string\[\]/);
    assert.match(sources.get(join(SRC, "features/globe/server-types.ts"))!, /namedPeople: number/);
  });
});

describe("structure: the route", () => {
  const route = sources.get(join(SRC, "app/api/globe/block-rows/route.ts"))!.replace(/\/\*[\s\S]*?\*\//g, "");
  const handlerFile = sources.get(join(SRC, "features/globe/block-rows-route.server.ts"))!.replace(/\/\*[\s\S]*?\*\//g, "");
  const handler = handlerFile.slice(handlerFile.indexOf("export async function handleBlockRowsRequest"));

  it("is dynamic, reads no URL or query, and routes every method through one handler", () => {
    assert.match(route, /import \{ connection \} from "next\/server";/);
    assert.match(route, /await connection\(\);/);
    for (const method of ["POST", "GET", "PUT", "PATCH", "DELETE", "OPTIONS"]) assert.match(route, new RegExp(`export const ${method} = respond;`));
    assert.doesNotMatch(route, /searchParams|params|\.url\b|nextUrl|cookies\(|headers\(\)/);
    assert.doesNotMatch(route, /export const (?:dynamic|revalidate|fetchCache|runtime)\b/);
  });

  it("the handler checks the host, method, media type and size before it reads a lookup, and never builds a key from input", () => {
    const order = ["isLoopbackHost", 'request.method !== "POST"', "isJson(", "readCapped(", "JSON.parse(", "BLOCK_ID_PATTERN.test", "source.rows(blockId)"].map((needle) => handler.indexOf(needle));
    assert.ok(order.every((n) => n >= 0), "every check is present");
    assert.deepEqual([...order].sort((a, b) => a - b), order, "the checks run in this order");
    assert.doesNotMatch(handler, /\[blockId\]|\[body|\[key|new URL|searchParams|readFile|path\.join/);
  });

  it("next.config.ts marks /api/:path* private, no-store", async () => {
    const config = (await import("../../next.config.ts")).default;
    const rules = (await config.headers?.()) ?? [];
    const value = rules.filter((r) => r.source === "/api/:path*").flatMap((r) => r.headers).filter((h) => h.key === "Cache-Control").map((h) => h.value);
    assert.deepEqual(value, ["private, no-store"]);
  });
});

describe("Workspace links outside Workspace do not prefetch its named payload", () => {
  const source = (file: string) => readFileSync(resolve(import.meta.dirname, "..", "..", file), "utf8");

  it("the Globe's Workspace link (panel and row links) sets prefetch={false}", () => {
    const link = source("src/features/globe/components/WorkspaceLink.tsx");
    assert.equal(link.match(/<Link\b/g)?.length, 1);
    assert.match(link, /<Link\b[^>]*\bprefetch=\{false\}/);
  });

  it("the navigation link turns prefetch off for /workspace only", () => {
    const nav = source("src/components/layout/NavLink.tsx");
    assert.match(nav, /prefetch=\{href === "\/workspace" \? false : undefined\}/);
  });
});
