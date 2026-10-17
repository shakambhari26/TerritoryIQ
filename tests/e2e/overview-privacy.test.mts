import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { Browser } from "playwright-core";
import { staffNames, walk } from "../../scripts/verify-public-assets.mjs";
import { serialiseOverlay, type Change } from "../../src/features/allocation/overlay.ts";
import { formatCount } from "../../src/features/territory/format.ts";
import { buildModel } from "../../src/features/territory/model.ts";
import { ALLOCATION_STATES, ROLE_CAPACITY, STAFF_ROLES } from "../../src/features/territory/types.ts";
import { leakedNames } from "../unit/helpers/leaked-names.mts";
import { dataset, launch, openPage, skipReason, startServer, type Server } from "./harness.mts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/**
 * The Territory Overview (`/`) must not send staff names to the browser, and must still show every figure it showed
 * before. The scans below read the real names from the generated dataset but only ever report how many were found,
 * never the names, so a failure does not write a name to the log. `/workspace` is the positive control: it shows
 * who covers each area by design (a separate review), so the same scan must find names there.
 */
describe("the Territory Overview sends no staff name to the browser", { skip: skipReason }, () => {
  let server: Server;
  let browser: Browser;
  let data: Awaited<ReturnType<typeof dataset>>;
  let names: string[];

  before(async () => {
    data = await dataset();
    names = staffNames(data);
    assert.ok(names.length > 200, `the scan needs the real names (${names.length})`);
    server = await startServer();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const text = async (urlPath: string, headers: Record<string, string> = {}) => {
    const response = await fetch(`${server.baseUrl}${urlPath}`, { headers });
    assert.equal(response.status, 200, urlPath);
    return response.text();
  };

  it("the homepage HTML (which carries the serialised props) contains no staff name", async () => {
    const html = await text("/");
    assert.match(html, /Territory Overview/);
    assert.match(html, /data-testid="overview"/, "the Overview rendered with its data, not the data-missing state");
    assert.match(html, /distinct names/, "the distinct-name caption is in the page");
    assert.equal(leakedNames(html, names), 0, "staff names found in the homepage HTML");
    assert.doesNotMatch(html, /names\\*"\s*:|blockLabel|sourceRow/, "no workbook slot, label or row field is serialised into the page");
  });

  it("the homepage's RSC payload contains the Overview props and no staff name", async () => {
    const flight = await text("/", { RSC: "1" });
    assert.match(flight, /"people"|\\"people\\"/, "the payload carries the Overview data (opaque person keys)");
    assert.equal(leakedNames(flight, names), 0, "staff names found in the homepage RSC payload");
    assert.doesNotMatch(flight, /names\\*"\s*:|blockLabel|sourceRow/);
  });

  it("the prerendered homepage files in the build contain no staff name", async () => {
    const appDir = path.join(ROOT, ".next", "server", "app");
    const homepage = [...walk(appDir)].filter((file: string) => /^index(\.|$)/.test(path.relative(appDir, file).split(path.sep)[0]));
    assert.ok(homepage.length >= 2, `${homepage.length} homepage files found (index.html and index.rsc at least)`);
    let withNames = 0;
    for (const file of homepage) if (leakedNames(await readFile(file, "utf8"), names) > 0) withNames++;
    assert.equal(withNames, 0, "homepage build files containing staff names");
  });

  it("positive control: the scan does find staff names in the workspace, which shows them by design", async () => {
    const found = leakedNames(await text("/workspace"), names);
    assert.ok(found > 200, `${found} of ${names.length} names found in /workspace`);
  });

  /** The numbers in a card or a table cell, in order, with the thousands separators removed. */
  const numbers = (content: string) => (content.match(/\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, "")));

  async function readFigures(page: import("playwright-core").Page) {
    const card = async (id: string) => numbers(await page.locator(`[data-testid="${id}"]`).innerText());
    const rows = await page.locator("[data-territory-row]").evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute("data-territory-row"),
        label: el.querySelector("th")!.textContent!.trim(),
        cells: [...el.querySelectorAll("td")].map((td) => td.textContent!.replace(/\s+/g, " ").trim()),
      })),
    );
    const links = await page.locator("[data-link-count]").evaluateAll((els) => els.map((el) => [el.getAttribute("data-link-count"), el.textContent!.trim()]));
    const states = await page.locator("[data-state-count]").evaluateAll((els) => els.map((el) => [el.getAttribute("data-state-count"), el.lastElementChild!.textContent!.trim()]));
    return {
      territories: await card("kpi-territories"),
      allocated: await card("kpi-allocated"),
      outlined: await card("kpi-outlined"),
      staffing: await card("kpi-staffing"),
      rows,
      links,
      states,
      gaps: await page.locator('[data-testid="panel-gaps"]').innerText(),
      provenance: await page.locator('[data-testid="panel-provenance"]').innerText(),
    };
  }

  /** What the Overview shows, worked out from the full dataset by the same model the Workspace uses. */
  function expectedFigures(changes: Change[]) {
    const model = buildModel(data, changes);
    const s = model.summary;
    return {
      territories: [data.salesTerritories.length, s.units.total],
      allocated: [s.units.byState.allocated, s.units.byState.conflicting, s.units.byState.missing, s.units.byState.confirmed_unallocated],
      outlined: [s.blocks.withBoundary, s.blocks.total, s.districts.withBoundary, s.districts.total],
      staffing: [s.staffing.namedSlots, s.staffing.vacantSlots, s.staffing.distinctNames],
      rows: s.byTerritory.map((row) => ({
        id: row.territoryId,
        label: row.label,
        cells: [String(row.units), ...ALLOCATION_STATES.map((state) => (row.byState[state] ? String(row.byState[state]) : "–")), `${row.withBoundary} / ${row.units}`],
      })),
      links: Object.entries(s.links.byStatus)
        .filter(([status, n]) => n > 0 || status === "provisional")
        .map(([status, n]) => [status, formatCount(n)]),
      states: ALLOCATION_STATES.map((state) => [state, formatCount(s.units.byState[state])]),
    };
  }

  const pick = (figures: Awaited<ReturnType<typeof readFigures>>) => ({
    territories: figures.territories,
    allocated: figures.allocated,
    outlined: figures.outlined,
    staffing: figures.staffing,
    rows: figures.rows,
    links: figures.links,
    states: figures.states.slice(0, 4),
  });

  it("in the browser the Overview shows every figure the full dataset gives, and no staff name", async () => {
    const { page, context, errors } = await openPage(browser);
    await page.goto(`${server.baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByTestId("overview").waitFor();
    const figures = await readFigures(page);
    assert.deepEqual(pick(figures), expectedFigures([]));
    assert.equal(figures.rows.length, 21);
    assert.equal(leakedNames(await page.locator("body").innerText(), names), 0, "staff names visible on the Overview");
    assert.equal(leakedNames(await page.content(), names), 0, "staff names in the hydrated DOM");
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("the Overview still applies the reviewer's local changes to every figure", async () => {
    const model = buildModel(data, []);
    const allocated = data.units.filter((u) => model.unitAllocation.get(u.id)!.state === "allocated");
    // Row A has a free slot to fill; row B gets a confirmation (it lists staff, so it becomes conflicting); row C
    // lists exactly one person, whose slot is marked vacant (so the row stops being allocated).
    const freeSlot = (u: (typeof data.units)[number]) =>
      STAFF_ROLES.flatMap((role) => Array.from({ length: ROLE_CAPACITY[role] }, (_, k) => ({ role, slot: k + 1 }))).find(
        ({ role, slot }) => !u.slots.some((s) => s.role === role && s.slot === slot),
      );
    const rowA = allocated.find((u) => freeSlot(u))!;
    const rowC = allocated.find((u) => u.id !== rowA.id && u.slots.filter((s) => s.status === "named").length === 1)!;
    const rowB = allocated.find((u) => u.id !== rowA.id && u.id !== rowC.id)!;
    assert.ok(rowA && rowB && rowC, "the real data has rows for all three probes");
    const free = freeSlot(rowA)!;
    const onlyNamed = rowC.slots.find((s) => s.status === "named")!;
    const at = "2026-10-15T10:00:00.000Z";
    const changes: Change[] = [
      { id: "p1", at, recordedBy: "Synthetic reviewer", reason: "probe", kind: "set-slot", unitId: rowA.id, role: free.role, slot: free.slot, names: ["Synthetic Probe Person"] },
      { id: "p2", at, recordedBy: "Synthetic reviewer", reason: "probe", kind: "confirm-unallocated", unitId: rowB.id, evidence: "synthetic evidence" },
      { id: "p3", at, recordedBy: "Synthetic reviewer", reason: "probe", kind: "mark-slot-vacant", unitId: rowC.id, role: onlyNamed.role, slot: onlyNamed.slot },
    ];
    const base = expectedFigures([]);
    const changed = expectedFigures(changes);
    assert.notDeepEqual(changed.staffing, base.staffing, "the probe changes the staffing figures");
    assert.notDeepEqual(changed.allocated, base.allocated, "the probe changes the allocation figures");

    const { page, context, errors } = await openPage(browser);
    await context.addInitScript((stored) => window.localStorage.setItem("territoryiq.localChanges.v1", stored), serialiseOverlay(changes));
    await page.goto(`${server.baseUrl}/`, { waitUntil: "networkidle" });
    await page.getByTestId("overview").waitFor();
    await page.getByText(`Local changes (${changes.length}) are applied to every figure on this page.`).waitFor();
    assert.deepEqual(pick(await readFigures(page)), changed);
    assert.deepEqual(errors, []);
    await context.close();
  });
});
