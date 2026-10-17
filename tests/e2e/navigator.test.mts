import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser } from "playwright-core";
import { buildModel } from "../../src/features/territory/model.ts";
import { dataset, launch, openPage, runAxe, skipReason, startServer, type Server } from "./harness.mts";

/**
 * The district navigator: a rail inside the map frame when the frame is wide, the details panel's list otherwise. The
 * choice is made by CSS container queries, so these tests read what is actually visible at each window size.
 */
describe("the district navigator in a real browser", { skip: skipReason }, () => {
  let server: Server;
  let browser: Browser;
  let data: Awaited<ReturnType<typeof dataset>>;
  let model: ReturnType<typeof buildModel>;

  before(async () => {
    data = await dataset();
    model = buildModel(data, []);
    server = await startServer();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const RAIL = '[data-testid="district-rail"]';
  const PANEL_LIST = '[data-testid="details-panel"] [data-testid="district-list"]';

  const open = async (width: number, height: number, hash = "") => {
    const opened = await openPage(browser, width, height);
    await opened.page.goto(`${server.baseUrl}/workspace${hash}`, { waitUntil: "networkidle" });
    await opened.page.locator('[data-testid="map-labels"]').waitFor();
    await opened.page.waitForTimeout(500);
    return opened;
  };

  it("is a rail beside the map on a wide window, and the details panel's list steps aside for it", async () => {
    const { page, context, errors, hosts } = await open(1920, 1080);
    assert.equal(await page.locator(RAIL).isVisible(), true, "the rail is shown");
    assert.equal(await page.locator(`${RAIL} [data-testid="district-row"]`).count(), 23, "one row per district");
    assert.equal(await page.locator(PANEL_LIST).isVisible(), false, "the same list is not shown twice");
    const rail = (await page.locator(RAIL).boundingBox())!;
    const map = (await page.locator('[data-testid="geo-map"]').boundingBox())!;
    const frame = (await page.locator('[data-testid="map-workspace"]').boundingBox())!;
    assert.ok(rail.x >= frame.x && rail.x + rail.width <= map.x + 1, "the rail is inside the frame, left of the map");
    assert.equal(Math.round(rail.width), 256);
    assert.ok(Math.abs(rail.height - map.height) <= 1, "and as tall as the map");
    assert.match(await page.locator('[data-testid="navigator-summary"]').innerText(), /West Bengal[\s\S]*309 of 345 blocks have provisional outlines/);
    assert.match(await page.locator('[data-testid="navigator-pins"]').innerText(), /21 ASM pins, one per sales territory \(provisional\)/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no sideways scroll");
    assert.deepEqual([...hosts], [new URL(server.baseUrl).host], "no request leaves localhost");
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("is the list in the details panel at a desktop, laptop, tablet and phone size", async () => {
    for (const [w, h] of [
      [1440, 900],
      [1280, 720],
      [820, 1180],
      [390, 844],
    ] as const) {
      const { page, context } = await open(w, h);
      assert.equal(await page.locator(RAIL).isVisible(), false, `${w}: no rail`);
      assert.equal(await page.locator(PANEL_LIST).isVisible(), true, `${w}: the list is in the details panel`);
      assert.equal(await page.locator(`${PANEL_LIST} [data-testid="district-row"]`).count(), 23, `${w}: one row per district`);
      await context.close();
    }
  });

  it("takes the room the details panel gave up: closing the panel at 1440 shows the rail, opening it again hides it", async () => {
    const { page, context } = await open(1440, 900);
    await page.locator('[data-testid="details-toggle"]').click();
    assert.equal(await page.locator(RAIL).isVisible(), true);
    // The map is still wide enough to hold the whole state and its names.
    const map = (await page.locator('[data-testid="geo-map"]').boundingBox())!;
    assert.ok(map.width >= 1000, `the map is ${map.width} px wide`);
    await page.locator('[data-testid="details-toggle"]').click();
    assert.equal(await page.locator(RAIL).isVisible(), false);
    assert.equal(await page.locator(PANEL_LIST).isVisible(), true);
    await context.close();
  });

  it("each row shows its district's outlined blocks and reads the same counts as the model", async () => {
    const { page, context } = await open(1920, 1080);
    for (const district of data.features.filter((f) => f.kind === "district")) {
      const rollup = model.districtRollup.get(district.id)!;
      const row = page.locator(`${RAIL} [data-district-id="${district.id}"]`);
      assert.equal(await row.count(), 1, `${district.name} has a row`);
      const text = (await row.innerText()).replace(/\s+/g, " ");
      assert.ok(text.includes(district.name), `${district.name}: named`);
      assert.ok(text.includes(rollup.blocks > 0 ? `${rollup.withBoundary}/${rollup.blocks}` : "none"), `${district.name}: "${text}" shows ${rollup.withBoundary}/${rollup.blocks}`);
      assert.match((await row.getAttribute("title")) ?? "", rollup.blocks > 0 ? /blocks? outlined/ : /no blocks in the reference list/);
    }
    await context.close();
  });

  it("picking a row opens that district on the map, marks the row, and the summary follows", async () => {
    const bankura = data.features.find((f) => f.kind === "district" && f.name === "Bankura")!;
    const { page, context } = await open(1920, 1080);
    const row = page.locator(`${RAIL} [data-district-id="${bankura.id}"]`);
    assert.equal(await row.getAttribute("aria-current"), null);
    await row.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="geo-map"]')?.getAttribute("data-level") === "district");
    assert.equal(await row.getAttribute("aria-current"), "true", "the row is marked as the open district");
    assert.equal(await page.evaluate(() => decodeURIComponent(window.location.hash)), `#feature=${bankura.id}`, "the selection is in the address, as for any other pick");
    assert.match(await page.locator('[data-testid="navigator-summary"]').innerText(), /District view[\s\S]*Bankura[\s\S]*20 of 22 blocks have provisional outlines/i);
    assert.equal(await page.locator('path[data-highlight="focus"]').count(), 1, "the district is selected on the map");
    // Going back up clears the mark.
    await page.getByTestId("map-back").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="geo-map"]')?.getAttribute("data-level") === "state");
    assert.equal(await row.getAttribute("aria-current"), null);
    await context.close();
  });

  it("the details panel's list opens a district too", async () => {
    const district = data.features.find((f) => f.kind === "district" && f.name === "Nadia")!;
    const { page, context } = await open(1440, 900);
    await page.locator(`${PANEL_LIST} [data-district-id="${district.id}"]`).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="geo-map"]')?.getAttribute("data-level") === "district");
    await page.locator('[data-testid="details-district"]').waitFor();
    await context.close();
  });

  it("hovering or focusing a row outlines that district on the map, and leaving takes the outline away", async () => {
    const district = data.features.find((f) => f.kind === "district" && f.name === "Murshidabad")!;
    const { page, context } = await open(1920, 1080);
    const outline = page.locator(`path[data-hover="${district.id}"]`);
    const row = page.locator(`${RAIL} [data-district-id="${district.id}"]`);
    assert.equal(await outline.count(), 0);
    await row.hover();
    assert.equal(await outline.count(), 1, "pointer: outlined");
    await page.mouse.move(900, 20);
    assert.equal(await outline.count(), 0, "pointer left: not outlined");
    await row.focus();
    assert.equal(await outline.count(), 1, "keyboard focus: outlined");
    await row.evaluate((el) => (el as HTMLElement).blur());
    assert.equal(await outline.count(), 0, "focus left: not outlined");
    await context.close();
  });

  it("a row is reachable and operable from the keyboard, with a visible focus ring", async () => {
    const district = data.features.find((f) => f.kind === "district" && f.name === "Birbhum")!;
    const { page, context } = await open(1920, 1080);
    const row = page.locator(`${RAIL} [data-district-id="${district.id}"]`);
    await row.focus();
    const ring = await row.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
    });
    assert.notEqual(ring.style, "none");
    assert.ok(ring.width >= 2, `a ${ring.width}px focus ring`);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('[data-testid="geo-map"]')?.getAttribute("data-level") === "district");
    assert.equal(await row.getAttribute("aria-current"), "true");
    await context.close();
  });

  it("a district with no blocks in the reference list says so, instead of showing 0/0", async () => {
    const empty = data.features.find((f) => f.kind === "district" && model.districtRollup.get(f.id)!.blocks === 0);
    if (!empty) return;
    const { page, context } = await open(1920, 1080);
    const row = page.locator(`${RAIL} [data-district-id="${empty.id}"]`);
    assert.match((await row.innerText()).replace(/\s+/g, " "), /none/);
    assert.match(await row.innerText(), /^[^\d]*$/, "no 0/0");
    await context.close();
  });

  it("accessibility: no axe violation with the rail (wide), with the list in the panel (desktop and phone), or with a district open", async () => {
    for (const [w, h, hash] of [
      [1920, 1080, ""],
      [1920, 1080, "#feature=GD-"],
      [1440, 900, ""],
      [390, 844, ""],
    ] as const) {
      const district = data.features.find((f) => f.kind === "district" && f.name === "Bankura")!;
      const { page, context } = await open(w, h, hash ? `#feature=${encodeURIComponent(district.id)}` : "");
      assert.deepEqual(await runAxe(page), [], `axe at ${w}x${h}${hash ? " with a district open" : ""}`);
      await context.close();
    }
  });
});
