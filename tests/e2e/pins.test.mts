import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright-core";
import { staffNames } from "../../scripts/verify-public-assets.mjs";
import { buildModel } from "../../src/features/territory/model.ts";
import { blockPins, territoryPins, type PinAnchor } from "../../src/features/territory/representatives.ts";
import type { BoundaryLayer } from "../../src/features/territory/types.ts";
import { clickShape, dataset, launch, openPage, runAxe, skipReason, startServer, type Server } from "./harness.mts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PIN = '[data-testid="representative-pin"]';
const MARKER = '[data-testid="representative-pin"], [data-testid="pin-cluster"]';
const PANEL = '[data-testid="representatives-panel"]';

/** Pins on screen, counting a group as the pins inside it. */
const pinTotal = (page: Page) =>
  page.evaluate((selector) => [...document.querySelectorAll(selector)].reduce((n, el) => n + Number(el.getAttribute("data-pin-count")), 0), MARKER);

/** Everything a visitor or a screen reader can read from the page: visible text and every accessible name. */
const readable = (page: Page) =>
  page.evaluate(() => {
    const attrs = [...document.querySelectorAll("[aria-label], [title], [alt]")].flatMap((el) => [el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("alt")]);
    return [document.body.innerText, ...attrs].filter(Boolean).join("\n");
  });

/** Starts recording whether the map layer is ever given a transform transition (the fly-to), from now on. */
const watchTransition = (page: Page) =>
  page.evaluate(() => {
    const layer = document.querySelector('[data-testid="map-layer"]') as HTMLElement;
    const w = window as unknown as { __flew: boolean };
    w.__flew = false;
    new MutationObserver(() => {
      if (/transform/.test(layer.style.transition)) w.__flew = true;
    }).observe(layer, { attributes: true, attributeFilter: ["style"] });
  });
const flew = (page: Page) => page.evaluate(() => (window as unknown as { __flew: boolean }).__flew);

describe("representative pins in a real browser", { skip: skipReason }, () => {
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

  const open = async (width = 1440, height = 1000, hash = "") => {
    const opened = await openPage(browser, width, height);
    await opened.page.goto(`${server.baseUrl}/workspace${hash}`, { waitUntil: "networkidle" });
    await opened.page.locator('[data-testid="map-svg"]').waitFor();
    await opened.page.waitForTimeout(600);
    return opened;
  };

  it("the state overview shows one ASM pin per supported sales territory, matching the pin logic", async () => {
    const { page, context, errors, hosts } = await open();
    const expected = territoryPins(model, anchors);
    assert.equal(expected.length, 21);
    assert.equal(await pinTotal(page), expected.length);
    assert.match(await page.locator('[data-testid="pins-toggle"]').innerText(), /21/);
    assert.equal(await page.locator('[data-testid="pins-toggle"]').getAttribute("aria-pressed"), "true");
    for (const label of await page.locator(PIN).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!))) {
      assert.match(label, /^Sales territory .+: ASM\. Provisional position\. Open representatives\./);
    }
    assert.match(await page.locator('[data-testid="map-provisional"]').innerText(), /Provisional boundaries/);
    assert.match(await page.locator('[data-testid="legend-pins"]').innerText(), /ASM pin, one per sales territory/);
    assert.deepEqual([...hosts], [new URL(server.baseUrl).host], "no request leaves localhost");
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("no staff name is readable on the page until a pin is opened, and none reaches the console", async () => {
    const { page, context } = await openPage(browser);
    const logs: string[] = [];
    page.on("console", (m) => logs.push(m.text()));
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    await page.locator(PIN).first().waitFor();
    const before = await readable(page);
    assert.deepEqual(names.filter((n: string) => before.includes(n)), [], "pins and legend carry no staff name");
    await page.locator(PIN).first().click();
    await page.locator(PANEL).waitFor();
    const after = await readable(page);
    assert.ok(names.some((n: string) => after.includes(n)), "the opened panel shows the ASM as written in the workbook");
    assert.deepEqual(names.filter((n: string) => logs.join("\n").includes(n)), [], "no staff name in the console");
    await context.close();
  });

  it("a click opens an accessible panel with territory, ASM, implied information and the provisional warning", async () => {
    const { page, context } = await open();
    await page.locator(PIN).first().click();
    const panel = page.locator(PANEL);
    await panel.waitFor();
    assert.equal(await panel.getAttribute("role"), "dialog");
    assert.equal(await panel.getAttribute("aria-modal"), "false");
    const title = await panel.evaluate((el) => document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.textContent ?? "");
    assert.match(title, /Territory ASM/, "the dialog is named by its heading");
    const described = await panel.evaluate((el) => document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent ?? "");
    assert.match(described, /provisional/i, "and described by the provisional warning");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "representatives-panel", "focus moves into the panel");
    const text = await panel.innerText();
    assert.match(text, /Territory ASM/);
    assert.match(text, /Territory\s+\S+/);
    assert.match(text, /ASM/);
    assert.match(text, /provisional/i);
    assert.match(text, /IMPLIED/i, "implied information is marked with the word");
    assert.match(text, /not verified to be one person/);
    assert.match(text, /workbook records no reporting line/);
    // The pin that opened it is marked as expanded.
    assert.equal(await page.locator(`${PIN}[aria-expanded="true"]`).count(), 1);
    await context.close();
  });

  it("keyboard: Tab reaches a pin, Enter opens the panel, Escape closes it and returns focus to the pin", async () => {
    const { page, context } = await open();
    // The last pan button is the control just before the pins in the tab order.
    await page.locator('[aria-label="Pan down"]').focus();
    await page.keyboard.press("Tab");
    const reached = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
    assert.ok(reached === "representative-pin" || reached === "pin-cluster", `Tab reached ${reached}`);
    const pinId = await page.evaluate(() => document.activeElement?.getAttribute("data-pin-id") ?? null);
    await page.keyboard.press("Enter");
    await page.locator(PANEL).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "representatives-panel");
    // Tab stays inside the panel's own controls first.
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "representatives-close");
    await page.keyboard.press("Escape");
    await page.locator(PANEL).waitFor({ state: "detached" });
    await page.waitForTimeout(100);
    const back = await page.evaluate(() => ({ id: document.activeElement?.getAttribute("data-pin-id") ?? null, kind: document.activeElement?.getAttribute("data-testid") }));
    assert.equal(back.id, pinId, "focus returns to the pin that opened the panel");
    // A second Escape is the map's: with nothing selected it changes nothing.
    await page.keyboard.press("Escape");
    assert.equal(await page.locator('[data-testid="geo-map"]').getAttribute("data-level"), "state");
    await context.close();
  });

  it("Escape closes the panel before it steps the map up a level; the close button works too", async () => {
    const district = data.features.find((f) => f.kind === "district" && blockPins(model, anchors, (id) => model.featureById.get(id)?.districtId === f.id).length > 1)!;
    const { page, context } = await open(1440, 1000, `#feature=${encodeURIComponent(district.id)}`);
    assert.equal(await page.locator('[data-testid="geo-map"]').getAttribute("data-level"), "district");
    await page.locator(MARKER).first().click();
    await page.locator(PANEL).waitFor();
    await page.locator('[data-testid="geo-map"]').focus();
    await page.keyboard.press("Escape");
    await page.locator(PANEL).waitFor({ state: "detached" });
    assert.equal(await page.locator('[data-testid="geo-map"]').getAttribute("data-level"), "district", "the first Escape only closed the panel");
    await page.locator(MARKER).first().click();
    await page.locator('[data-testid="representatives-close"]').click();
    await page.locator(PANEL).waitFor({ state: "detached" });
    await context.close();
  });

  it("district drill-down shows that district's block pins, grouped when close, and the panel names block, district and role slots", async () => {
    const candidates = data.features
      .filter((f) => f.kind === "district")
      .map((f) => ({ f, pins: blockPins(model, anchors, (id) => model.featureById.get(id)?.districtId === f.id) }))
      .filter((c) => c.pins.length >= 3)
      .sort((a, b) => b.pins.length - a.pins.length);
    const { f: district, pins: expected } = candidates[0];
    const { page, context, errors } = await open();
    await clickShape(page, district.id);
    await page.waitForFunction(() => document.querySelector('[data-testid="geo-map"]')?.getAttribute("data-level") === "district");
    await page.waitForTimeout(700);
    assert.equal(await pinTotal(page), expected.length, "every supported block in the district has a pin or is inside a group");
    assert.equal(await page.locator('[data-pin-kind="territory"]').count(), 0, "territory pins are for the state overview only");
    assert.match(await page.locator('[data-testid="legend-pins"]').innerText(), /one per block/);

    // Open a single block pin and check what the panel says.
    const single = page.locator(PIN).first();
    await single.click();
    const panel = page.locator(PANEL);
    await panel.waitFor();
    const text = await panel.innerText();
    assert.match(text, /Block representatives|representative pins/);
    assert.match(text, /Block \/ area/);
    assert.match(text, new RegExp(`District\\s+${district.name}`));
    assert.match(text, /\b(ASM|Primary \d|Secondary \d|DSO \d)\b/, "role-slot labels");
    assert.match(text, /IMPLIED/i);
    assert.match(text, /provisional/i);
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("opening a territory from its pin selects it, fits its blocks and shows their pins", async () => {
    const { page, context } = await open();
    const scaleBefore = Number(await page.locator('[data-testid="map-layer"]').getAttribute("data-scale"));
    await page.locator(PIN).first().click();
    await page.locator(PANEL).waitFor();
    const territoryId = (await page.locator('[data-testid="representatives-group"]').first().getAttribute("data-pin-id"))!.replace("RP-", "");
    await page.locator('[data-testid="representatives-show-territory"]').click();
    await page.locator(PANEL).waitFor({ state: "detached" });
    await page.waitForTimeout(800);
    const own = new Set(model.territoryById.get(territoryId)!.unitIds.map((id) => model.links.get(id)!.featureId).filter((id): id is string => !!id));
    const expected = blockPins(model, anchors, (id) => own.has(id));
    assert.ok(expected.length > 0);
    assert.equal(await pinTotal(page), expected.length);
    assert.equal(await page.locator('[data-pin-kind="territory"]').count(), 0);
    assert.ok(Number(await page.locator('[data-testid="map-layer"]').getAttribute("data-scale")) > scaleBefore, "the map moved in on the territory's blocks");
    await context.close();
  });

  it("zooming in splits a group; the pins toggle hides every pin and the panel", async () => {
    const { page, context } = await open();
    const before = await page.locator('[data-testid="pin-cluster"]').count();
    assert.ok(before > 0, "the state overview groups close territories");
    await page.locator('[data-testid="pin-cluster"]').first().click();
    await page.locator(PANEL).waitFor();
    assert.ok((await page.locator('[data-testid="representatives-group"]').count()) >= 2);
    await page.locator('[data-testid="representatives-zoom"]').click();
    await page.waitForTimeout(800);
    assert.ok((await page.locator('[data-testid="pin-cluster"]').count()) <= before, "zooming in does not add groups");
    await page.locator('[data-testid="pins-toggle"]').click();
    assert.equal(await page.locator(MARKER).count(), 0);
    assert.equal(await page.locator(PANEL).count(), 0);
    assert.equal(await page.locator('[data-testid="pins-toggle"]').getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator('[data-testid="legend-pins"]').count(), 0);
    await context.close();
  });

  it("reduced motion: the map jumps instead of flying and pins do not animate", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    await page.locator(PIN).first().waitFor();
    const animation = await page.locator(PIN).first().locator("> span").evaluate((el) => getComputedStyle(el).animationName);
    assert.equal(animation, "none", "the pin does not run its entrance animation");
    const district = data.features.find((f) => f.kind === "district" && model.districtRollup.get(f.id)!.withBoundary > 0)!;
    await watchTransition(page);
    await clickShape(page, district.id);
    await page.waitForFunction(() => document.querySelector('[data-testid="geo-map"]')?.getAttribute("data-level") === "district");
    await page.waitForTimeout(600);
    assert.equal(await flew(page), false, "no transform transition is ever set while the visitor asks for less motion");
    await context.close();
  });

  it("with motion allowed, a drill-down eases the map and a pin settles in", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    await page.locator(PIN).first().waitFor();
    assert.equal(await page.locator(PIN).first().locator("> span").evaluate((el) => getComputedStyle(el).animationName), "pin-in");
    const district = data.features.find((f) => f.kind === "district" && model.districtRollup.get(f.id)!.withBoundary > 0)!;
    await watchTransition(page);
    await clickShape(page, district.id);
    await page.waitForFunction(() => document.querySelector('[data-testid="geo-map"]')?.getAttribute("data-level") === "district");
    await page.waitForTimeout(600);
    assert.equal(await flew(page), true);
    await context.close();
  });

  it("phone width: the panel is a sheet inside the map, nothing scrolls sideways, and the pins stay reachable", async () => {
    const { page, context } = await open(390, 844);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal page scroll");
    await page.locator(PIN).first().click();
    const panel = page.locator(PANEL);
    await panel.waitFor();
    const box = (await panel.boundingBox())!;
    const map = (await page.locator('[data-testid="geo-map"]').boundingBox())!;
    assert.ok(box.x >= map.x && box.x + box.width <= map.x + map.width + 1, "inside the map horizontally");
    assert.ok(box.y >= map.y - 1 && box.y + box.height <= map.y + map.height + 1, "inside the map vertically");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    // Each marker is at least 24 by 24 CSS pixels (WCAG 2.5.8).
    const small = await page.locator(MARKER).evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()).filter((r) => r.width < 24 || r.height < 24).length,
    );
    assert.equal(small, 0);
    await context.close();
  });

  it("tablet and wide layouts keep the pins inside the map frame", async () => {
    for (const [w, h] of [
      [820, 1100],
      [1920, 1080],
    ] as const) {
      const { page, context } = await open(w, h);
      const frame = (await page.locator('[data-testid="geo-map"]').boundingBox())!;
      const boxes = await page.locator(MARKER).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
      assert.ok(boxes.length > 0);
      for (const b of boxes) {
        assert.ok(b.x >= frame.x - 1 && b.x + b.width <= frame.x + frame.width + 1 && b.y >= frame.y - 1 && b.y + b.height <= frame.y + frame.height + 1, `${w}x${h}: a pin is outside the map`);
      }
      assert.equal(await pinTotal(page), 21);
      await context.close();
    }
  });

  it("accessibility: no axe violation with a pin panel open, at desktop and phone width", async () => {
    for (const [w, h] of [
      [1440, 1000],
      [390, 844],
    ] as const) {
      const { page, context } = await open(w, h);
      await page.locator(PIN).first().click();
      await page.locator(PANEL).waitFor();
      assert.deepEqual(await runAxe(page), [], `axe at ${w}x${h}`);
      await context.close();
    }
  });
});
