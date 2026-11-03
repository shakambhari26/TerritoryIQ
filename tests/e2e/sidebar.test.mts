import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright-core";
import { launch, openPage, skipReason, startServer, type Server } from "./harness.mts";

/**
 * The navigation in a real browser. On a desktop the menu is icons only and opens by itself, labelled, over the page while
 * the pointer is on it or keyboard focus is inside it: smoothly, without moving the page or its own icons, and with nothing
 * to press. It is the same on every page. On a phone the drawer closes on any link, including the current page's own, and
 * the page does not scroll sideways at the widths below.
 */
const KEY = "territoryiq.sidebar-rail";
const ROUTES = ["/", "/workspace", "/globe"];
const SIDEBAR = "#sidebar";

/**
 * The sidebar's width animates (200 ms), and a page that is still building a 3D scene gives the animation few frames, so
 * this waits until the width has stopped changing (two reads, 120 ms apart, the same) before anything is measured.
 */
const settle = async (page: Page) => {
  await page.waitForTimeout(150);
  let last = -1;
  for (let i = 0; i < 60; i++) {
    const width = await page.evaluate(() => document.querySelector("#sidebar")!.getBoundingClientRect().width);
    if (Math.abs(width - last) < 0.01) return;
    last = width;
    await page.waitForTimeout(120);
  }
  throw new Error(`the sidebar's width never settled (last ${last} px)`);
};
/** The pointer on the sidebar, and then on a spot over the page, away from it, so nothing is hovered. */
const hover = async (page: Page) => {
  await page.mouse.move(30, 300);
  await settle(page);
};
const away = async (page: Page) => {
  await page.mouse.move(900, 600);
  await settle(page);
};
const mainLeft = async (page: Page) => Math.round((await page.locator("#main").boundingBox())!.x);

const sidebarWidth = async (page: Page) => Math.round((await page.locator(SIDEBAR).boundingBox())!.width);
/** The label is in the document either way; it is drawn when it is opaque and inside the sidebar's edge. */
const labelDrawn = (page: Page) =>
  page.evaluate(() => {
    const link = [...document.querySelectorAll("#sidebar nav a")].find((a) => a.textContent?.includes("Workspace"))!;
    const label = link.querySelector(":scope > span:last-child")!;
    const edge = document.querySelector("#sidebar")!.getBoundingClientRect().right;
    return Number(getComputedStyle(label).opacity) > 0.95 && label.getBoundingClientRect().right <= edge;
  });
/**
 * Records the sidebar's width and the Workspace icon's position on every animation frame, so a test can say what happened
 * between rest and open without racing the 200 ms animation with its own round trips.
 */
const record = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __rec: { width: number; icon: number }[]; __go: boolean };
    w.__rec = [];
    w.__go = true;
    const side = document.querySelector("#sidebar")!;
    const link = [...document.querySelectorAll("#sidebar nav a")].find((a) => a.textContent?.includes("Workspace"))!;
    const icon = link.querySelector("svg")!;
    const tick = () => {
      w.__rec.push({ width: side.getBoundingClientRect().width, icon: icon.getBoundingClientRect().x });
      if (w.__go) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const stopRecording = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __rec: { width: number; icon: number }[]; __go: boolean };
    w.__go = false;
    return w.__rec;
  });
/** Where the Workspace icon is, to show it does not move when the menu opens. */
const iconX = (page: Page) =>
  page.evaluate(() => {
    const link = [...document.querySelectorAll("#sidebar nav a")].find((a) => a.textContent?.includes("Workspace"))!;
    return Math.round(link.querySelector("svg")!.getBoundingClientRect().x * 10) / 10;
  });

describe("sidebar and navigation in a real browser", { skip: skipReason, timeout: 300_000 }, () => {
  let server: Server;
  let browser: Browser;

  before(async () => {
    server = await startServer(3231);
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  async function open(route: string, width: number, height = 900, stored?: string) {
    const opened = await openPage(browser, width, height);
    if (stored !== undefined) await opened.context.addInitScript(([key, value]) => localStorage.setItem(key, value), [KEY, stored]);
    await opened.page.goto(`${server.baseUrl}${route}`);
    await opened.page.locator(SIDEBAR).waitFor({ state: "attached" });
    return opened;
  }

  it("is the same on every page at a laptop width: the icon rail, never labels on one page and icons on another", async () => {
    for (const route of ROUTES) {
      const { page, context } = await open(route, 1440);
      assert.equal(await sidebarWidth(page), 76, `${route}: the rail at 1440 px`);
      assert.equal(await labelDrawn(page), false, `${route}: no label drawn in the rail`);
      await context.close();
    }
  });

  it("is the same on every page on a wide monitor: icons only until it is hovered", async () => {
    for (const route of ROUTES) {
      const { page, context } = await open(route, 1600);
      assert.equal(await sidebarWidth(page), 76, `${route}: the rail at 1600 px too`);
      assert.equal(await labelDrawn(page), false, `${route}: no label drawn at rest`);
      await context.close();
    }
  });

  it("opens labelled over the page while the pointer is on it, closes when it leaves, and never moves the page", async () => {
    for (const route of ROUTES) {
      const { page, context } = await open(route, 1440);
      await page.waitForTimeout(300);
      const left = await mainLeft(page);
      assert.equal(await sidebarWidth(page), 76);
      await hover(page);
      assert.equal(await sidebarWidth(page), 256, `${route}: opens on hover`);
      assert.equal(await labelDrawn(page), true, `${route}: labels drawn while open`);
      assert.equal(await mainLeft(page), left, `${route}: the page does not move while the menu is open over it`);
      assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector("#sidebar")!).boxShadow), "none", `${route}: lifted over the page`);
      // It sits above the page: a point to the right of the rail, inside the open menu, belongs to the menu.
      assert.equal(await page.evaluate(() => !!document.elementFromPoint(200, 300)?.closest("#sidebar")), true, `${route}: over the page, not under it`);
      await away(page);
      assert.equal(await sidebarWidth(page), 76, `${route}: icons only again`);
      assert.equal(await labelDrawn(page), false);
      assert.equal(await mainLeft(page), left);
      await context.close();
    }
  });

  it("the map does not re-fit or resize when the menu opens over it", async () => {
    const { page, context } = await open("/workspace", 1440);
    await page.locator('[data-testid="map-svg"]').waitFor();
    await page.waitForTimeout(900);
    const read = () =>
      page.evaluate(() => ({
        w: document.querySelector('[data-testid="geo-map"]')!.getBoundingClientRect().width,
        scale: document.querySelector('[data-testid="map-layer"]')!.getAttribute("data-scale"),
      }));
    const before = await read();
    await hover(page);
    assert.deepEqual(await read(), before, "same map width and scale while the menu is open");
    await away(page);
    assert.deepEqual(await read(), before);
    await context.close();
  });

  it("opens for the keyboard too, and a link that was clicked does not hold the menu open once the pointer leaves", async () => {
    const { page, context } = await open("/", 1440);
    await away(page);
    assert.equal(await sidebarWidth(page), 76);
    const inSidebar = () => page.evaluate(() => !!document.activeElement?.closest("#sidebar"));
    for (let i = 0; i < 12 && !(await inSidebar()); i++) await page.keyboard.press("Tab");
    assert.equal(await inSidebar(), true, "Tab reaches the sidebar");
    await settle(page);
    assert.equal(await sidebarWidth(page), 256, "keyboard focus opens it");
    assert.equal(await labelDrawn(page), true);
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await settle(page);
    assert.equal(await sidebarWidth(page), 76, "and it closes when focus leaves");
    // A mouse click leaves focus on the link but is not keyboard focus: the menu closes once the pointer is away.
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Workspace" }).click();
    await page.waitForURL("**/workspace");
    await away(page);
    assert.equal(await sidebarWidth(page), 76, "no stuck menu after a click");
    await context.close();
  });

  it("opens and closes smoothly: the width animates through the steps between, the labels fade in after it starts, and the icons never move", async () => {
    // On the Overview, a light page: the animation is the browser's own, but a page still building a 3D scene gives it few frames.
    const { page, context } = await open("/", 1440);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    const rest = await iconX(page);

    await record(page);
    await page.mouse.move(30, 300);
    await settle(page);
    const opening = await stopRecording(page);
    const widths = opening.map((r) => r.width);
    const trace = `${widths.length} frames, first ${widths.slice(0, 4).map(Math.round)}, last ${widths.slice(-4).map(Math.round)}`;
    assert.ok(widths.some((w) => w > 80 && w < 252), `the width passes through values between the rail and the full width (${trace})`);
    assert.ok(widths.every((w, i) => i === 0 || w >= widths[i - 1] - 0.01), "and only ever grows while it opens");
    assert.equal(Math.round(widths[widths.length - 1]), 256, trace);
    assert.ok(opening.every((r) => Math.abs(r.icon - rest) < 0.5), "the icon is where it was in every frame of the animation");
    assert.equal(await labelDrawn(page), true);
    // The label is one line (it did not wrap against the narrow edge while the width animated).
    const lineHeight = await page.evaluate(() => {
      const link = [...document.querySelectorAll("#sidebar nav a")].find((a) => a.textContent?.includes("Workspace"))!;
      return link.querySelector(":scope > span:last-child")!.getBoundingClientRect().height;
    });
    assert.ok(lineHeight < 24, `one line of text (${lineHeight} px)`);

    await record(page);
    await page.mouse.move(900, 600);
    await settle(page);
    const closing = await stopRecording(page);
    const shrinking = closing.map((r) => r.width);
    assert.ok(shrinking.some((w) => w > 80 && w < 252), "and through the steps between while it closes");
    assert.ok(shrinking.every((w, i) => i === 0 || w <= shrinking[i - 1] + 0.01), "only ever shrinking");
    assert.equal(Math.round(shrinking[shrinking.length - 1]), 76);
    assert.ok(closing.every((r) => Math.abs(r.icon - rest) < 0.5), "the icon does not move while it closes either");
    await context.close();
  });

  it("for a visitor who asks for less motion it opens at once, with no animation", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${server.baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator(SIDEBAR).waitFor({ state: "attached" });
    await page.waitForTimeout(300);
    await page.mouse.move(30, 300);
    await page.waitForTimeout(40);
    assert.equal(await sidebarWidth(page), 256, "full width almost at once");
    assert.equal(await labelDrawn(page), true, "labels drawn at once");
    await context.close();
  });

  it("has nothing to press: no toggle or collapse button, and no saved choice that changes it", async () => {
    // A value left in storage by the earlier toggle (kept open, "0", or collapsed, "1") has no effect.
    for (const stored of ["0", "1"]) {
      const { page, context } = await open("/", 1600, 900, stored);
      assert.equal(await sidebarWidth(page), 76, `a stored "${stored}" is ignored`);
      assert.equal(await page.locator(`${SIDEBAR} button:visible`).count(), 0, "no visible button in the desktop sidebar");
      assert.equal(await page.getByRole("button", { name: /collapse|expand|keep menu open/i }).count(), 0, "no toggle anywhere");
      await context.close();
    }
  });

  it("works with storage blocked, and writes nothing to it", async () => {
    const { page, context, errors } = await openPage(browser, 1600, 900);
    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get: () => { throw new Error("blocked"); } });
    });
    await page.goto(server.baseUrl);
    await page.locator(SIDEBAR).waitFor({ state: "attached" });
    assert.equal(await sidebarWidth(page), 76);
    await hover(page);
    assert.equal(await sidebarWidth(page), 256);
    assert.deepEqual(errors, [], "no error from the blocked storage");
    await context.close();
  });

  it("on a phone there is no rail: the drawer keeps its own Close button", async () => {
    const { page, context } = await open("/", 390, 844);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "Close navigation" }).waitFor({ state: "visible" });
    assert.equal(await labelDrawn(page), true, "the drawer is labelled, opaque and inside its edge");
    await context.close();
  });

  it("on a phone the drawer opens, closes on the current page's own link, and the page behind does not scroll", async () => {
    for (const route of ROUTES) {
      const { page, context } = await open(route, 390, 844);
      const menu = page.getByRole("button", { name: "Open navigation" });
      await menu.click();
      assert.equal(await menu.getAttribute("aria-expanded"), "true");
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), "hidden", `${route}: the page behind is fixed`);
      assert.ok((await sidebarWidth(page)) > 200, `${route}: the drawer shows labelled, not as the rail`);
      await page.getByRole("navigation", { name: "Primary" }).locator('[aria-current="page"]').click();
      await page.locator(SIDEBAR).waitFor({ state: "hidden" });
      assert.equal(await menu.getAttribute("aria-expanded"), "false", `${route}: closed by its own link`);
      assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).overflow), "hidden", `${route}: scroll released`);
      await context.close();
    }
  });

  it("on a phone the drawer also closes with Escape and the backdrop", async () => {
    const { page, context } = await open("/", 390, 844);
    const menu = page.getByRole("button", { name: "Open navigation" });
    await menu.click();
    // Escape straight after opening, before focus has moved into the drawer.
    await page.keyboard.press("Escape");
    await page.locator(SIDEBAR).waitFor({ state: "hidden" });
    assert.equal(await menu.getAttribute("aria-expanded"), "false");

    // A tap on an empty part of the drawer leaves focus on the page, and Escape still closes it.
    await menu.click();
    await page.locator(SIDEBAR).waitFor({ state: "visible" });
    await page.mouse.click(150, 780);
    await page.keyboard.press("Escape");
    await page.locator(SIDEBAR).waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Open navigation", "focus returns to the menu button");

    await menu.click();
    await page.mouse.click(380, 400);
    await page.locator(SIDEBAR).waitFor({ state: "hidden" });
    await context.close();
  });

  it("does not scroll sideways at phone, tablet and laptop widths", async () => {
    for (const [width, height] of [[360, 740], [390, 844], [768, 1024], [1024, 768], [1280, 720]]) {
      for (const route of ROUTES) {
        const { page, context } = await open(route, width, height);
        await page.waitForTimeout(300);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 0, `${route} at ${width} px scrolls sideways by ${overflow} px`);
        await context.close();
      }
    }
  });
});
