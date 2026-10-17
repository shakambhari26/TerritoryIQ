import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { mergeLayer } from "../../src/features/globe/layer-merge.ts";
import type { GlobeManifest, GlobeOverlay } from "../../src/features/globe/types.ts";
import { browserPath, skipReason, startServer, type Server } from "./harness.mts";

/**
 * Phase 1 of the globe integration, in a real browser: the permanent /globe route, the redirect from the old
 * /globe-prototype, the navigation entry and its single active link, the hand-off to the 2D workspace by ID (and
 * that it survives a missing WebGL or a failed outline request), and that the Overview, the Workspace and their
 * boundary route are unchanged and never load Three.js. The globe's own behaviour is in globe.test.mts.
 */
const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GENERATED = path.join(ROOT, "data", "generated");
const ROOT_SEL = '[data-testid="globe-prototype"]';
const WEBGL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const NO_WEBGL_ARGS = ["--disable-gpu", "--disable-3d-apis", "--disable-webgl", "--disable-webgl2"];
const MAP = '[data-testid="geo-map"]';
const LINK = '[data-testid="globe-open-workspace"]';
const ROW_LINK = '[data-testid="globe-open-workspace-row"]';

const attr = (page: Page, name: string) => page.getAttribute(ROOT_SEL, name);
const waitPhase = (page: Page, phase: string) => page.waitForSelector(`${ROOT_SEL}[data-phase="${phase}"]`, { timeout: 30_000 });
const ready = (page: Page) => page.waitForSelector(`${ROOT_SEL}[data-status="ready"]`, { timeout: 90_000 });

describe("globe integration (Phase 1) in a real browser", { skip: skipReason, timeout: 600_000 }, () => {
  let server: Server;
  let browser: Browser;
  let manifest: GlobeManifest;
  let overlay: GlobeOverlay;

  before(async () => {
    manifest = JSON.parse(await readFile(path.join(GENERATED, "globe-overlay.json"), "utf8")) as GlobeManifest;
    const merged = mergeLayer(manifest, JSON.parse(await readFile(path.join(GENERATED, "globe-boundaries.json"), "utf8")));
    assert.ok(merged.ok, merged.ok ? "" : merged.reason);
    overlay = merged.overlay;
    server = await startServer(3219);
    browser = await chromium.launch({ executablePath: browserPath, headless: true, args: WEBGL_ARGS });
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  async function open(url: string, options: { width?: number; height?: number; browser?: Browser; abortLayer?: boolean } = {}) {
    const context: BrowserContext = await (options.browser ?? browser).newContext({ viewport: { width: options.width ?? 1440, height: options.height ?? 1000 } });
    if (options.abortLayer) await context.route("**/geo/globe-boundaries.json", (route) => route.abort());
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.baseUrl}${url}`, { waitUntil: "load" });
    return { page, context, errors };
  }

  // The district the tests use, a represented block in it that has an outline and a workbook row, and a second such block.
  const district = () => overlay.districts.find((d) => d.name === "Bankura")!;
  const blocksOf = () => overlay.blocks.filter((b) => b.districtId === district().id && b.state === "represented" && b.geometry && b.records.length > 0);

  async function selectDistrict(page: Page) {
    await page.getByRole("searchbox").fill("bankura");
    await page.getByRole("button", { name: /^Bankura\s+district/ }).click();
  }
  async function selectBlock(page: Page, name: string) {
    await page.getByRole("list", { name: /Blocks in Bankura/ }).getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  }
  /** Waits for the workspace to show the map at the given level (it derives the level from the URL hash after hydration). */
  async function workspaceAt(page: Page, level: "state" | "district" | "block") {
    await page.waitForURL("**/workspace**");
    await page.locator(`${MAP}[data-level="${level}"]`).waitFor({ timeout: 15_000 });
  }
  /** The breadcrumb for the map's current place (the navigation's current link is an <a>, the breadcrumb a <span>). */
  const currentCrumb = (page: Page) => page.locator('span[aria-current="page"]').first().textContent();

  // ------------------------------------------------------------------ route --
  it("/globe is the existing globe experience, marked as a local prototype with a standing provisional notice", async () => {
    const { page, context, errors } = await open("/globe");
    await ready(page);
    assert.equal(new URL(page.url()).pathname, "/globe");
    assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "Globe");
    assert.equal(await page.locator('[data-testid="globe-canvas-host"] canvas').count(), 1, "the same WebGL globe");
    await page.waitForSelector(`${ROOT_SEL}[data-outlines="ready"]`);
    const text = (await page.locator("body").textContent()) ?? "";
    assert.ok(!/not integrated/i.test(text), "the stale 'not integrated' wording is gone");
    assert.match(text, /Local prototype · not for deployment/);
    const notice = (await page.getByTestId("globe-provisional-notice").textContent()) ?? "";
    assert.match(notice, /unofficial OpenStreetMap geometry, not official boundaries/);
    assert.match(notice, /not approved for deployment/);
    assert.match(text, /ODbL, provisional and not official boundaries/, "the attribution is still on screen");
    assert.equal(await page.title(), "Globe · TerritoryIQ");
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("/globe-prototype redirects to /globe with a temporary 307, for the path and anything under it", async () => {
    // (A trailing slash is first normalised by Next itself, with a 308, before this redirect applies; not tested here.)
    for (const from of ["/globe-prototype", "/globe-prototype/anything", "/globe-prototype/a/b"]) {
      const response = await fetch(`${server.baseUrl}${from}`, { redirect: "manual" });
      assert.equal(response.status, 307, from);
      assert.match(response.headers.get("location") ?? "", /\/globe$/, from);
    }
    const { page, context } = await open("/globe-prototype");
    await ready(page);
    assert.equal(new URL(page.url()).pathname, "/globe", "an old bookmark lands on the globe");
    await context.close();
  });

  // ------------------------------------------------------------- navigation --
  it("the navigation lists Globe, Overview, Workspace, then the planned modules, and exactly one link is current on each page", async () => {
    for (const [route, current] of [
      ["/", "Overview"],
      ["/workspace", "Workspace"],
      ["/globe", "Globe"],
      ["/globe-prototype", "Globe"],
    ] as const) {
      const { page, context } = await open(route);
      const items = await page.$$eval('nav[aria-label="Primary"] li', (lis) => lis.map((li) => ({ text: li.textContent ?? "", link: li.querySelector("a") !== null })));
      assert.deepEqual(
        items.map((i) => [i.text.replace(/\(planned, not yet available\)$/, "").replace(/Soon$/, ""), i.link]),
        [["Globe", true], ["Overview", true], ["Workspace", true], ["Allocation", false], ["Analytics", false], ["Data Import", false]],
        `${route}: order, and only the three built routes are links`,
      );
      assert.ok(items.slice(3).every((i) => i.text.endsWith("Soon(planned, not yet available)")), `${route}: the planned modules say so`);
      const links = await page.$$eval('nav[aria-label="Primary"] a', (anchors) => anchors.map((a) => ({ text: a.textContent, href: a.getAttribute("href"), current: a.getAttribute("aria-current") })));
      assert.deepEqual(links.map((l) => [l.text, l.href]), [["Globe", "/globe"], ["Overview", "/"], ["Workspace", "/workspace"]], route);
      assert.deepEqual(links.filter((l) => l.current !== null).map((l) => [l.text, l.current]), [[current, "page"]], `${route}: one current link, ${current}`);
      await context.close();
    }
  });

  it("the Globe link is reachable at phone width without a sideways scroll, and works", async () => {
    const { page, context } = await open("/", { width: 390, height: 844 });
    const link = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Globe" });
    const box = (await link.boundingBox())!;
    assert.ok(box.x >= 0 && box.x + box.width <= 390, `the Globe link is on screen at 390px (${JSON.stringify(box)})`);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
    await link.click();
    await page.waitForURL("**/globe");
    await page.getByRole("link", { name: "Globe", exact: true }).first().waitFor();
    assert.equal(await page.getByRole("navigation", { name: "Primary" }).locator('[aria-current="page"]').textContent(), "Globe");
    await ready(page);
    await context.close();
  });

  // ---------------------------------------------------- hand-off to the 2D map --
  it("state, district and block hand-offs open the workspace at the matching map level with the matching ID, and survive back and forth", async () => {
    const [blockA, blockB] = blocksOf();
    assert.ok(blockA && blockB, "two represented blocks with a row in Bankura");
    const { page, context, errors } = await open("/globe");
    await ready(page);

    // State level: no hash, state overview.
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "arrived");
    assert.equal(await page.locator(LINK).getAttribute("href"), "/workspace");
    await page.locator(LINK).click();
    await workspaceAt(page, "state");
    assert.equal(new URL(page.url()).hash, "");
    await page.goBack();
    await ready(page);

    // District level.
    await selectDistrict(page);
    await waitPhase(page, "arrived");
    assert.equal(await page.locator(LINK).getAttribute("href"), `/workspace#feature=${district().id}`);
    await page.locator(LINK).click();
    await workspaceAt(page, "district");
    assert.equal(new URL(page.url()).hash, `#feature=${district().id}`);
    assert.equal(await page.locator('[data-testid="details-district"]').getAttribute("data-feature-id"), district().id);
    await page.goBack();
    await ready(page);
    assert.equal(await attr(page, "data-level"), "globe", "the globe comes back fresh");

    // Block A.
    await selectDistrict(page);
    await waitPhase(page, "arrived");
    await selectBlock(page, blockA.name);
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    assert.equal(await attr(page, "data-level"), "block");
    assert.equal(await attr(page, "data-selected"), blockA.id);
    assert.equal(await page.locator(LINK).getAttribute("href"), `/workspace#feature=${blockA.id}`);
    await page.locator(LINK).click();
    await workspaceAt(page, "block");
    assert.equal(new URL(page.url()).hash, `#feature=${blockA.id}`);
    assert.equal(await page.locator('[data-testid="details-feature"]').getAttribute("data-feature-id"), blockA.id);
    assert.ok((await currentCrumb(page))?.includes(blockA.name), "the current breadcrumb is the block");

    // Back to the globe, then a different block: the workspace (kept by the router) must show the new one, not the old.
    await page.goBack();
    await ready(page);
    await selectDistrict(page);
    await waitPhase(page, "arrived");
    await selectBlock(page, blockB.name);
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    assert.equal(await page.locator(LINK).getAttribute("href"), `/workspace#feature=${blockB.id}`);
    await page.locator(LINK).click();
    await workspaceAt(page, "block");
    await page.waitForFunction((id) => document.querySelector('[data-testid="details-feature"]')?.getAttribute("data-feature-id") === id, blockB.id, { timeout: 10_000 });
    assert.equal(new URL(page.url()).hash, `#feature=${blockB.id}`);
    assert.ok((await currentCrumb(page))?.includes(blockB.name));
    assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), []);
    await context.close();
  });

  it("a workbook row in the block details opens that row (#unit=) in the workspace, at its block", async () => {
    const block = blocksOf()[0];
    const row = block.records[0];
    const { page, context } = await open("/globe");
    await ready(page);
    await selectDistrict(page);
    await waitPhase(page, "arrived");
    await selectBlock(page, block.name);
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    const rowLinks = page.locator(ROW_LINK);
    assert.equal(await rowLinks.count(), block.records.length, "one link per workbook row listed");
    assert.equal(await rowLinks.first().getAttribute("href"), `/workspace#unit=${row.unitId}`);
    await rowLinks.first().click();
    await workspaceAt(page, "block");
    assert.equal(new URL(page.url()).hash, `#unit=${row.unitId}`);
    assert.equal(await page.locator('[data-testid="details-unit"]').getAttribute("data-unit-id"), row.unitId);
    assert.ok((await currentCrumb(page))?.includes(block.name));
    await context.close();
  });

  it("the link is on the screen when the globe has no WebGL, and opens the same places", async () => {
    const noWebgl = await chromium.launch({ executablePath: browserPath, headless: true, args: NO_WEBGL_ARGS });
    try {
      const block = blocksOf()[0];
      const { page, context } = await open("/globe", { browser: noWebgl });
      await page.waitForSelector('[data-testid="globe-fallback"]', { timeout: 60_000 });
      assert.equal(await page.locator(LINK).count(), 0, "nothing is selected yet, so no link");
      await selectDistrict(page);
      assert.equal(await page.locator(LINK).getAttribute("href"), `/workspace#feature=${district().id}`);
      await selectBlock(page, block.name);
      assert.equal(await page.locator(LINK).getAttribute("href"), `/workspace#feature=${block.id}`);
      assert.equal(await page.locator(ROW_LINK).first().getAttribute("href"), `/workspace#unit=${block.records[0].unitId}`);
      await page.locator(LINK).click();
      await workspaceAt(page, "block");
      assert.equal(await page.locator('[data-testid="details-feature"]').getAttribute("data-feature-id"), block.id);
      await context.close();
    } finally {
      await noWebgl.close();
    }
  });

  it("the link is on the screen when the outline request fails, and opens the same place", async () => {
    const block = blocksOf()[0];
    const { page, context } = await open("/globe", { abortLayer: true });
    await page.waitForSelector('[data-testid="globe-outlines-error"]', { timeout: 60_000 });
    await ready(page);
    assert.equal(await attr(page, "data-outlines"), "unavailable");
    await selectDistrict(page);
    await waitPhase(page, "arrived");
    assert.equal(await attr(page, "data-revealed-districts"), "false", "no outline was drawn");
    assert.equal(await page.locator(LINK).getAttribute("href"), `/workspace#feature=${district().id}`);
    await selectBlock(page, block.name);
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    assert.equal(await page.locator(LINK).getAttribute("href"), `/workspace#feature=${block.id}`);
    await page.locator(LINK).click();
    await workspaceAt(page, "block");
    assert.equal(await page.locator('[data-testid="details-feature"]').getAttribute("data-feature-id"), block.id);
    await context.close();
  });

  it("a hand-off URL opened directly (a shared link, a reload) selects the same place at the same level", async () => {
    const block = blocksOf()[0];
    const { page, context } = await open(`/workspace#feature=${block.id}`);
    await workspaceAt(page, "block");
    assert.equal(await page.locator('[data-testid="details-feature"]').getAttribute("data-feature-id"), block.id);
    await page.reload({ waitUntil: "load" });
    await workspaceAt(page, "block");
    assert.equal(await page.locator('[data-testid="details-feature"]').getAttribute("data-feature-id"), block.id);
    await context.close();
  });

  // ----------------------------------------------- Overview and Workspace stay --
  /** Every script the page downloads, with the source text, to look for Three.js in. */
  async function scriptsLoaded(url: string, settle = 2500) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const scripts = new Map<string, string>();
    const pending: Promise<void>[] = [];
    page.on("response", (response) => {
      if (response.request().resourceType() === "script") pending.push(response.text().then((text) => void scripts.set(new URL(response.url()).pathname, text)).catch(() => {}));
    });
    await page.goto(`${server.baseUrl}${url}`, { waitUntil: "networkidle" });
    // The Globe link is on screen here, so any prefetch it starts has started; give it time to finish.
    await page.waitForTimeout(settle);
    await Promise.all(pending);
    await context.close();
    return scripts;
  }
  const hasThree = (scripts: Map<string, string>) => [...scripts].filter(([, text]) => /WebGLRenderer/.test(text)).map(([name]) => name);

  it("the Overview at / is still the Territory Overview and never loads Three.js, with the Globe link on screen", async () => {
    const { page, context } = await open("/");
    assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "Territory Overview");
    assert.equal(await page.getByRole("link", { name: "Open the workspace" }).first().getAttribute("href"), "/workspace");
    assert.equal(await page.locator('[data-testid="globe-prototype"]').count(), 0);
    assert.equal(await page.locator("canvas").count(), 0);
    await context.close();

    const onGlobe = await scriptsLoaded("/globe");
    assert.ok(hasThree(onGlobe).length > 0, "control: the detector finds Three.js on /globe");
    for (const route of ["/", "/workspace"]) {
      const scripts = await scriptsLoaded(route);
      assert.ok(scripts.size > 0, `${route} loads scripts`);
      assert.deepEqual(hasThree(scripts), [], `${route} does not load Three.js`);
    }
  });

  it("the Workspace is unchanged: it opens at the state overview, and /geo/boundaries.json is still its own file, byte for byte", async () => {
    const { page, context } = await open("/workspace");
    await workspaceAt(page, "state");
    assert.equal(await page.getByTestId("globe-open-workspace").count(), 0, "the globe's link is not in the workspace");
    await context.close();

    const original = await readFile(path.join(GENERATED, "boundaries.json"));
    const response = await fetch(`${server.baseUrl}/geo/boundaries.json`);
    assert.equal(response.status, 200);
    assert.equal(createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex"), createHash("sha256").update(original).digest("hex"));
    const globeLayer = await fetch(`${server.baseUrl}/geo/globe-boundaries.json`);
    assert.equal(globeLayer.status, 200);
    assert.equal(createHash("sha256").update(Buffer.from(await globeLayer.arrayBuffer())).digest("hex"), manifest.meta.inputs["globe-boundaries.json"].sha256, "the globe's own file, validated");
  });
});
