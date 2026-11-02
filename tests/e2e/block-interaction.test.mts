import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright-core";
import { staffNames } from "../../scripts/verify-public-assets.mjs";
import { workspaceHref, type WorkspaceLookup } from "../../src/features/globe/workspace-link.ts";
import { buildModel } from "../../src/features/territory/model.ts";
import { blockPins, type PinAnchor, type RepresentativePin } from "../../src/features/territory/representatives.ts";
import { selectionForFeature, selectionToHash } from "../../src/features/territory/selection.ts";
import { ALLOCATION_STATE_LABEL, type BoundaryLayer } from "../../src/features/territory/types.ts";
import { dataset, launch, openPage, skipReason, startServer, type Server } from "./harness.mts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PIN = '[data-testid="representative-pin"]';
const CLUSTER = '[data-testid="pin-cluster"]';
const PANEL = '[data-testid="representatives-panel"]';
const CARD = '[data-testid="map-selection-card"]';
const TIP = '[data-testid="map-tooltip"]';
const DETAILS = '[data-testid="details-panel"]';

/**
 * The block interaction on the Workspace map. What a block shows is decided by the current selection (the URL hash),
 * never by an earlier click: the details panel holds the people, the map shows one compact card (name and allocation
 * state) for the selected block, and a hover preview is its own, labelled thing that never replaces either.
 */
describe("block selection, hover and the representative pins in a real browser", { skip: skipReason }, () => {
  let server: Server;
  let browser: Browser;
  let data: Awaited<ReturnType<typeof dataset>>;
  let model: ReturnType<typeof buildModel>;
  let anchors: Map<string, PinAnchor>;
  let names: string[];

  before(async () => {
    data = await dataset();
    const layer = JSON.parse(await readFile(path.join(ROOT, "data", "generated", "boundaries.json"), "utf8")) as BoundaryLayer;
    model = buildModel(data, []);
    anchors = new Map(layer.shapes.filter((s) => s.anchor && !s.featureId.startsWith("GD-")).map((s) => [s.featureId, s.anchor!]));
    names = staffNames(data);
    server = await startServer();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const districtPins = (districtId: string) => blockPins(model, anchors, (id) => model.featureById.get(id)?.districtId === districtId);
  const namesOf = (pin: RepresentativePin) => pin.records.flatMap((r) => r.people.filter((p) => !p.vacant).map((p) => p.name!));
  const blockName = (fid: string) => model.featureById.get(fid)!.name;
  const stateLabel = (fid: string) => ALLOCATION_STATE_LABEL[model.featureAllocation.get(fid)!.state];
  const hashFor = (fid: string) => selectionToHash(selectionForFeature(model, fid));

  const open = async (width = 1440, height = 1000, hash = "") => {
    const opened = await openPage(browser, width, height);
    await opened.page.goto(`${server.baseUrl}/workspace${hash}`, { waitUntil: "networkidle" });
    await opened.page.locator('[data-testid="map-svg"]').waitFor();
    await opened.page.waitForTimeout(600);
    return opened;
  };

  /** Everything a visitor or a screen reader can read: visible text and every accessible name. */
  const readable = (page: Page) =>
    page.evaluate(() => {
      const attrs = [...document.querySelectorAll("[aria-label], [title], [alt]")].flatMap((el) => [el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("alt")]);
      return [document.body.innerText, ...attrs].filter(Boolean).join("\n");
    });
  const textOf = (page: Page, selector: string) => page.locator(selector).innerText();
  const currentHash = (page: Page) => page.evaluate(() => window.location.hash);
  const setHash = async (page: Page, hash: string) => {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await page.waitForTimeout(500);
  };
  /** A point inside a drawn block where that block is the top element (so a pin or a neighbour does not take it). */
  const pointOn = (page: Page, fid: string) =>
    page.evaluate((id) => {
      const el = document.querySelector(`path[data-fid="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      for (let i = 1; i <= 24; i++) {
        for (let j = 1; j <= 24; j++) {
          const x = r.left + (r.width * i) / 25;
          const y = r.top + (r.height * j) / 25;
          if (document.elementFromPoint(x, y) === el) return { x, y };
        }
      }
      return null;
    }, fid);

  /**
   * A district whose map shows two single-record block pins A and B with a name each that the other does not contain,
   * so "A's information is still on the page" can be asked of a name. Returned with the page already open on it.
   */
  const openPair = async () => {
    const districts = data.features.filter((f) => f.kind === "district").sort((a, b) => districtPins(b.id).length - districtPins(a.id).length);
    for (const district of districts.slice(0, 6)) {
      const opened = await open(1440, 1000, `#feature=${encodeURIComponent(district.id)}`);
      const visible = await opened.page.locator(PIN).evaluateAll((els) => els.map((e) => e.getAttribute("data-pin-id")!));
      const pins = districtPins(district.id).filter((p) => p.records.length === 1 && visible.includes(p.id));
      for (const a of pins) {
        for (const b of pins) {
          if (a === b) continue;
          const bNames = namesOf(b);
          const aOnly = namesOf(a).filter((n) => !bNames.some((m) => m.includes(n) || n.includes(m)));
          const aNames = namesOf(a);
          const bOnly = bNames.filter((n) => !aNames.some((m) => m.includes(n) || n.includes(m)));
          if (aOnly.length > 0 && bOnly.length > 0) return { ...opened, district, a, b, aOnly, bOnly };
        }
      }
      await opened.context.close();
    }
    throw new Error("no district has two single block pins with distinct names on screen");
  };

  it("selecting block A by its pin opens A's information in the details panel, and the map shows only a compact card: no floating roster", async () => {
    const { page, context, a, aOnly } = await openPair();
    await page.locator(`${PIN}[data-pin-id="${a.id}"]`).click();
    const aId = a.anchorFeatureId;
    await page.locator(`[data-testid="details-unit"]`).waitFor();
    assert.equal(await currentHash(page), hashFor(aId), "the pin selects exactly what a click on the outline selects");
    assert.equal(await page.locator(PANEL).count(), 0, "no floating representatives card");
    // The details panel is where the people are.
    const details = await textOf(page, DETAILS);
    assert.ok(aOnly.every((n) => details.includes(n)), "A's staff are in the details panel");
    assert.match(details, new RegExp(blockName(aId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    // The compact card names the block and its allocation state, and nothing else.
    const card = page.locator(CARD);
    await card.waitFor();
    assert.equal(await card.getAttribute("data-kind"), "selected");
    assert.equal(await card.getAttribute("data-feature-id"), aId);
    const cardText = await card.innerText();
    assert.match(cardText, /selected/i);
    assert.ok(cardText.includes(blockName(aId)), "the card names the selected block");
    assert.ok(cardText.includes(stateLabel(aId)), "and its allocation state");
    assert.deepEqual(names.filter((n) => cardText.includes(n)), [], "no staff name on the map card");
    assert.equal(await page.locator(`${PIN}[data-pin-id="${a.id}"]`).getAttribute("aria-haspopup"), null, "a block pin opens no dialog");
    assert.match((await page.locator(`${PIN}[data-pin-id="${a.id}"]`).getAttribute("aria-label")) ?? "", /Show this block in the details panel/);
    await context.close();
  });

  it("selecting block B replaces A: the card, the details panel and the URL all follow B, and nothing of A remains visible", async () => {
    const { page, context, a, b, aOnly, bOnly } = await openPair();
    await page.locator(`${PIN}[data-pin-id="${a.id}"]`).click();
    await page.locator(`[data-testid="details-unit"][data-unit-id="${a.records[0].unitId}"]`).waitFor();
    await page.locator(`${PIN}[data-pin-id="${b.id}"]`).click();
    await page.locator(`[data-testid="details-unit"][data-unit-id="${b.records[0].unitId}"]`).waitFor();
    const bId = b.anchorFeatureId;
    assert.equal(await currentHash(page), hashFor(bId));
    assert.equal(await page.locator(PANEL).count(), 0);
    assert.equal(await page.locator(CARD).count(), 1, "one selection card, never two");
    assert.equal(await page.locator(CARD).getAttribute("data-feature-id"), bId);
    const cardText = await textOf(page, CARD);
    assert.ok(cardText.includes(blockName(bId)) && cardText.includes(stateLabel(bId)));
    const details = await textOf(page, DETAILS);
    assert.ok(bOnly.every((n) => details.includes(n)), "B's staff are in the details panel");
    // Nothing of A: not its card, not its staff anywhere a visitor or a screen reader can read.
    assert.ok(!cardText.includes(blockName(a.anchorFeatureId)) || blockName(a.anchorFeatureId) === blockName(bId), "A's name is not on the card");
    const everything = await readable(page);
    assert.deepEqual(aOnly.filter((n) => everything.includes(n)), [], "no staff name of A is readable after B is selected");
    await context.close();
  });

  it("hovering another block previews it as a hover tooltip and never overwrites the selected block's card, details or URL", async () => {
    const { page, context, a, b, aOnly, bOnly } = await openPair();
    await page.locator(`${PIN}[data-pin-id="${a.id}"]`).click();
    await page.locator(`[data-testid="details-unit"][data-unit-id="${a.records[0].unitId}"]`).waitFor();
    await page.waitForTimeout(700);
    const hashBefore = await currentHash(page);
    const bId = b.anchorFeatureId;
    const point = await pointOn(page, bId);
    assert.ok(point, "B has a point that can be hovered");
    await page.mouse.move(point.x - 3, point.y - 3);
    await page.mouse.move(point.x, point.y);
    const tip = page.locator(TIP);
    await tip.waitFor();
    assert.equal(await tip.getAttribute("data-kind"), "hover");
    assert.equal(await tip.getAttribute("data-feature-id"), bId);
    const tipText = await tip.innerText();
    assert.ok(tipText.includes(blockName(bId)) && tipText.includes(stateLabel(bId)), "the tooltip is B's name and allocation state");
    assert.doesNotMatch(tipText, /selected/i, "a hover preview never says it is the selection");
    assert.deepEqual(names.filter((n) => tipText.includes(n)), [], "no staff name in a hover tooltip");
    // The selection is still A, everywhere.
    assert.equal(await currentHash(page), hashBefore, "hover does not touch the URL");
    assert.equal(await page.locator(CARD).getAttribute("data-feature-id"), a.anchorFeatureId);
    assert.equal(await page.locator('[data-testid="details-unit"]').getAttribute("data-unit-id"), a.records[0].unitId);
    const details = await textOf(page, DETAILS);
    assert.ok(aOnly.every((n) => details.includes(n)), "the details panel still shows A's staff");
    assert.deepEqual(bOnly.filter((n) => details.includes(n)), [], "and none of B's");
    // The pointer leaves: the preview goes, the selection stays.
    await page.mouse.move(2, 2);
    await tip.waitFor({ state: "detached" });
    assert.equal(await page.locator(CARD).getAttribute("data-feature-id"), a.anchorFeatureId);
    await context.close();
  });

  it("clearing the selection closes the card and the details; the map steps up one level at a time", async () => {
    const { page, context, a, district } = await openPair();
    await page.locator(`${PIN}[data-pin-id="${a.id}"]`).click();
    await page.locator(CARD).waitFor();
    await page.locator('[data-testid="geo-map"]').focus();
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="details-district"]').waitFor();
    assert.equal(await currentHash(page), `#feature=${encodeURIComponent(district.id)}`);
    assert.equal(await page.locator(CARD).count(), 0, "no block is selected, so no block card");
    assert.equal(await page.locator(PANEL).count(), 0);
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="details-empty"]').waitFor();
    assert.equal(await currentHash(page), "");
    assert.equal(await page.locator(CARD).count(), 0);
    await context.close();
  });

  it("a selection made through the URL (the address bar, a shared link) is the one source: the card and details follow every change of it", async () => {
    const { page, context, a, b, aOnly } = await openPair();
    const [aId, bId] = [a.anchorFeatureId, b.anchorFeatureId];
    await setHash(page, hashFor(aId));
    await page.locator(`[data-testid="details-unit"][data-unit-id="${a.records[0].unitId}"]`).waitFor();
    assert.equal(await page.locator(CARD).getAttribute("data-feature-id"), aId);
    await setHash(page, hashFor(bId));
    await page.locator(`[data-testid="details-unit"][data-unit-id="${b.records[0].unitId}"]`).waitFor();
    assert.equal(await page.locator(CARD).getAttribute("data-feature-id"), bId, "the card follows the URL at once");
    const everything = await readable(page);
    assert.deepEqual(aOnly.filter((n) => everything.includes(n)), [], "no staff name of A once the URL names B");
    await setHash(page, "");
    await page.locator('[data-testid="details-empty"]').waitFor();
    assert.equal(await page.locator(CARD).count(), 0);
    await context.close();
  });

  it("a block opened from the globe's own link lands on that block's card and details, and Escape steps up to its district", async () => {
    const { context, a, district } = await openPair();
    await context.close();
    const lookup = { districts: [{ id: district.id }], blocks: [{ id: a.anchorFeatureId, districtId: district.id, rowIds: [] }] } as unknown as WorkspaceLookup;
    const href = workspaceHref(lookup, { kind: "block", id: a.anchorFeatureId });
    assert.ok(href, "the globe builds a link for the block");
    const { page, context: landed } = await open(1440, 1000, href.replace("/workspace", ""));
    assert.equal(await page.locator('[data-testid="geo-map"]').getAttribute("data-level"), "block");
    await page.locator(CARD).waitFor();
    assert.equal(await page.locator(CARD).getAttribute("data-feature-id"), a.anchorFeatureId);
    assert.ok((await textOf(page, CARD)).includes(blockName(a.anchorFeatureId)));
    assert.ok((await textOf(page, DETAILS)).includes(blockName(a.anchorFeatureId)), "the details panel is on the same block");
    assert.equal(await page.locator(PANEL).count(), 0);
    await page.locator('[data-testid="geo-map"]').focus();
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="details-district"]').waitFor();
    assert.equal(await page.locator(CARD).count(), 0, "the block's card goes with the block's selection");
    await landed.close();
  });

  it("a group of block pins moves the map in so they separate; it opens no card and selects nothing", async () => {
    const districts = data.features.filter((f) => f.kind === "district").sort((a, b) => districtPins(b.id).length - districtPins(a.id).length);
    // A phone-width map is small enough that the busiest district groups close pins.
    const { page, context } = await open(390, 844, `#feature=${encodeURIComponent(districts[0].id)}`);
    const group = page.locator(CLUSTER).first();
    assert.ok((await page.locator(CLUSTER).count()) > 0, "the busiest district groups close pins at phone width");
    assert.match((await group.getAttribute("aria-label")) ?? "", /Zoom in to separate them/);
    assert.equal(await group.getAttribute("aria-haspopup"), null);
    const hash = await currentHash(page);
    const scale = Number(await page.locator('[data-testid="map-layer"]').getAttribute("data-scale"));
    await group.click();
    await page.waitForTimeout(900);
    assert.ok(Number(await page.locator('[data-testid="map-layer"]').getAttribute("data-scale")) > scale, "the map moved in");
    assert.equal(await page.locator(PANEL).count(), 0);
    assert.equal(await currentHash(page), hash, "a group selects nothing");
    await context.close();
  });

  it("the territory ASM card is tied to the selection: it closes when the selection changes and does not return when it changes back", async () => {
    const unlinked = [...model.unitById.keys()].find((id) => !model.links.get(id)?.featureId);
    assert.ok(unlinked, "the workbook has a row with no linked block, which keeps the map at the state level");
    const { page, context } = await open();
    await page.locator(PIN).first().click();
    await page.locator(PANEL).waitFor();
    assert.equal(await page.locator(`${PIN}[aria-expanded="true"]`).count(), 1);
    await setHash(page, `#unit=${encodeURIComponent(unlinked)}`);
    assert.equal(await page.locator(PANEL).count(), 0, "the card does not outlive the selection it was opened under");
    await setHash(page, "");
    assert.equal(await page.locator(PANEL).count(), 0, "and does not come back when the selection returns to what it was");
    assert.equal(await page.locator(`${PIN}[aria-expanded="true"]`).count(), 0);
    await context.close();
  });
});
