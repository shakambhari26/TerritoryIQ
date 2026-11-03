import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright-core";
import { launch, openPage, skipReason, startServer, type Server } from "./harness.mts";

/**
 * The Overview's Earth turns. A real sphere on a small 2D canvas, drawn over the still picture: it must really change from
 * frame to frame, be round with a clear corner, stop when it is off screen, never start for a visitor who asked for reduced
 * motion (and never fetch its map then), and leave the still picture alone if the map cannot load.
 */
const CANVAS = '[data-testid="rotating-earth"]';
const MAP = "/overview/earth-map.webp";

/**
 * A hash of the canvas pixels, so two frames can be compared without shipping them. Only fully opaque pixels count: the
 * anti-aliased rim has partial alpha, which the browser's read-back rounds differently the first time it is read.
 */
const frame = (page: Page) =>
  page.evaluate((selector) => {
    const canvas = document.querySelector(selector) as HTMLCanvasElement;
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    let hash = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) hash = (Math.imul(hash, 31) + data[i] + data[i + 1] * 3 + data[i + 2] * 7) | 0;
    return hash;
  }, CANVAS);
const alphaAt = (page: Page, fx: number, fy: number) =>
  page.evaluate(
    ([selector, x, y]) => {
      const canvas = document.querySelector(selector as string) as HTMLCanvasElement;
      return canvas.getContext("2d")!.getImageData(Math.floor(canvas.width * (x as number)), Math.floor(canvas.height * (y as number)), 1, 1).data[3];
    },
    [CANVAS, fx, fy] as const,
  );
const opacity = (page: Page) => page.evaluate((selector) => getComputedStyle(document.querySelector(selector)!).opacity, CANVAS);

describe("the Overview's rotating Earth in a real browser", { skip: skipReason, timeout: 300_000 }, () => {
  let server: Server;
  let browser: Browser;

  before(async () => {
    server = await startServer(3232);
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  async function open(options: { reducedMotion?: "reduce"; abortMap?: boolean; width?: number; height?: number } = {}) {
    const opened = await openPage(browser, options.width ?? 1440, options.height ?? 900);
    if (options.reducedMotion) await opened.page.emulateMedia({ reducedMotion: options.reducedMotion });
    if (options.abortMap) await opened.context.route(`**${MAP}`, (route) => route.abort());
    const maps: string[] = [];
    opened.page.on("request", (request) => {
      if (request.url().endsWith(MAP)) maps.push(request.url());
    });
    await opened.page.goto(server.baseUrl);
    await opened.page.locator(CANVAS).waitFor({ state: "attached" });
    return { ...opened, maps };
  }

  it("draws a round Earth that fades in over the still picture and keeps turning", async () => {
    const { page, context, errors } = await open();
    await page.waitForFunction((s) => getComputedStyle(document.querySelector(s)!).opacity === "1", CANVAS, { timeout: 15_000 });
    const size = await page.evaluate((s) => {
      const canvas = document.querySelector(s) as HTMLCanvasElement;
      return { width: canvas.width, height: canvas.height, css: canvas.clientWidth };
    }, CANVAS);
    assert.equal(size.width, size.height, "square");
    assert.ok(size.css >= 200, `${size.css} css px`);
    assert.equal(await alphaAt(page, 0.5, 0.5), 255, "opaque at the centre");
    assert.equal(await alphaAt(page, 0.02, 0.02), 0, "clear at the corner: it is a disc");
    const a = await frame(page);
    await page.waitForTimeout(1200);
    const b = await frame(page);
    await page.waitForTimeout(1200);
    const c = await frame(page);
    assert.ok(a !== b && b !== c, `the picture changes between frames (${a}, ${b}, ${c})`);
    assert.deepEqual(errors, [], "no console or page error");
    await context.close();
  });

  it("stops while it is scrolled out of view and carries on from there when it comes back", async () => {
    const { page, context } = await open({ width: 390, height: 700 });
    // Below the fold at this height, so it has not started (nor fetched its map) until it is scrolled to.
    await page.locator(CANVAS).scrollIntoViewIfNeeded();
    await page.waitForFunction((s) => getComputedStyle(document.querySelector(s)!).opacity === "1", CANVAS, { timeout: 15_000 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // The observer reports the scroll a moment later and the frame in flight finishes; after that nothing is drawn.
    await page.waitForTimeout(1000);
    const a = await frame(page);
    await page.waitForTimeout(1200);
    assert.equal(await frame(page), a, "no frame is drawn while it is off screen");
    await page.locator(CANVAS).scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    assert.notEqual(await frame(page), a, "turning again");
    await context.close();
  });

  it("never starts, and never fetches its map, when the visitor asks for reduced motion", async () => {
    const { page, context, maps, errors } = await open({ reducedMotion: "reduce" });
    await page.waitForTimeout(1500);
    assert.deepEqual(maps, [], "the world map is not requested");
    assert.equal(await opacity(page), "0", "the canvas stays clear, so the still picture shows");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".earth-preview")!).backgroundImage.includes("earth-preview.webp")), true, "the still picture is there");
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("starts when reduced motion is switched off, without a reload", async () => {
    const { page, context } = await open({ reducedMotion: "reduce" });
    await page.waitForTimeout(500);
    assert.equal(await opacity(page), "0");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction((s) => getComputedStyle(document.querySelector(s)!).opacity === "1", CANVAS, { timeout: 15_000 });
    await context.close();
  });

  it("leaves the still picture in place, and raises no error, if the world map cannot load", async () => {
    const { page, context } = await open({ abortMap: true });
    await page.waitForTimeout(1500);
    assert.equal(await opacity(page), "0");
    assert.equal(await page.getByTestId("globe-entry").isVisible(), true);
    await context.close();
  });

  it("is weightless for the page around it: the card keeps its layout and no sideways scroll at phone width", async () => {
    for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]] as const) {
      const { page, context } = await open({ width, height });
      await page.waitForTimeout(600);
      const box = await page.locator(CANVAS).boundingBox();
      const parent = await page.locator(".earth-preview").boundingBox();
      assert.ok(box && parent && Math.abs(box.width - parent.width) < 1 && Math.abs(box.height - parent.height) < 1, `${width}px: the canvas fills the circle exactly`);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0, `${width}px: no sideways scroll`);
      await context.close();
    }
  });
});
