import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright-core";
import { launch, openPage, skipReason, startServer, type Server } from "./harness.mts";

/**
 * The navigation in a real browser. The icon rail and the labelled sidebar are the same on every page (the width, or
 * the visitor's own choice, decides, never the route); the choice outlives a reload; on a phone the drawer closes on any
 * link, including the current page's own, and the page does not scroll sideways at the widths below.
 */
const KEY = "territoryiq.sidebar-rail";
const ROUTES = ["/", "/workspace", "/globe"];
const SIDEBAR = "#sidebar";

const sidebarWidth = async (page: Page) => Math.round((await page.locator(SIDEBAR).boundingBox())!.width);
const labelDrawn = async (page: Page) => {
  // The label is in the document either way; it is drawn when it is not clipped to a 1px box.
  const box = await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Workspace" }).locator("span").last().boundingBox();
  return box !== null && box.width > 4;
};

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

  it("is the same on every page on a wide monitor: the labelled sidebar", async () => {
    for (const route of ROUTES) {
      const { page, context } = await open(route, 1600);
      assert.equal(await sidebarWidth(page), 256, `${route}: full width at 1600 px`);
      assert.equal(await labelDrawn(page), true, `${route}: labels drawn`);
      await context.close();
    }
  });

  it("keeps the visitor's choice across pages and a reload, and the choice beats the width", async () => {
    const { page, context } = await open("/", 1440);
    assert.equal(await sidebarWidth(page), 76);
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    assert.equal(await sidebarWidth(page), 256, "expanded at 1440 px");
    assert.equal(await labelDrawn(page), true);
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Workspace" }).click();
    await page.waitForURL("**/workspace");
    assert.equal(await sidebarWidth(page), 256, "still expanded on the next page");
    await page.reload();
    await page.locator(SIDEBAR).waitFor({ state: "attached" });
    assert.equal(await sidebarWidth(page), 256, "still expanded after a reload");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    assert.equal(await sidebarWidth(page), 76);
    await page.reload();
    assert.equal(await sidebarWidth(page), 76, "a collapse is kept too");
    await context.close();

    const wide = await open("/", 1600, 900, "1");
    assert.equal(await sidebarWidth(wide.page), 76, "collapsed on a wide monitor when the visitor chose it");
    await wide.context.close();
  });

  it("still works when storage is unavailable", async () => {
    const { page, context, errors } = await openPage(browser, 1600, 900);
    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get: () => { throw new Error("blocked"); } });
    });
    await page.goto(server.baseUrl);
    await page.locator(SIDEBAR).waitFor({ state: "attached" });
    assert.equal(await sidebarWidth(page), 256, "falls back to the width rule");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    assert.deepEqual(errors, [], "no error from the blocked storage");
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
