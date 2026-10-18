import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { mergeLayer } from "../../src/features/globe/layer-merge.ts";
import { projectManifest } from "../../src/features/globe/overlay-projection.server.ts";
import type { ServerManifest } from "../../src/features/globe/server-types.ts";
import type { GlobeManifest, GlobeOverlay } from "../../src/features/globe/types.ts";
import { browserPath, runAxe, skipReason, startServer, type Server } from "./harness.mts";

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
  // The full generated file, with each block's workbook rows. Test side only: the page and its manifest carry row IDs.
  let source: ServerManifest;

  before(async () => {
    source = JSON.parse(await readFile(path.join(GENERATED, "globe-overlay.json"), "utf8")) as ServerManifest;
    manifest = projectManifest(source);
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
  const blocksOf = () => overlay.blocks.filter((b) => b.districtId === district().id && b.state === "represented" && b.geometry && b.rowIds.length > 0);
  const rowsOf = (blockId: string) => source.blocks.find((b) => b.id === blockId)!.records;
  /** The selected block's rows have been fetched and shown: names and row links exist only after this. */
  const rowsReady = (page: Page) => page.waitForSelector('[data-testid="globe-block-rows"][data-state="ready"]', { timeout: 15_000 });

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
    const row = rowsOf(block.id)[0];
    const { page, context } = await open("/globe");
    await ready(page);
    await selectDistrict(page);
    await waitPhase(page, "arrived");
    await selectBlock(page, block.name);
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    await rowsReady(page);
    const rowLinks = page.locator(ROW_LINK);
    assert.equal(await rowLinks.count(), block.rowIds.length, "one link per workbook row listed");
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
      await rowsReady(page);
      assert.equal(await page.locator(ROW_LINK).first().getAttribute("href"), `/workspace#unit=${rowsOf(block.id)[0].unitId}`);
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

  // ------------------------------------------- Phase 2: the homepage entry card --
  describe("the homepage 'Explore on the globe' card", () => {
    const CARD = '[data-testid="globe-entry"]';
    const PRIMARY = '[data-testid="globe-entry-primary"]';
    const SECONDARY = '[data-testid="globe-entry-secondary"]';
    const KPIS = ["kpi-territories", "kpi-allocated", "kpi-outlined", "kpi-staffing"];

    const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
    const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    /** Every request a page makes while sitting on a route, with the source of every script, for long enough to include link prefetching. */
    async function observe(url: string, settle = 5000) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const urls: string[] = [];
      const scripts = new Map<string, string>();
      const pending: Promise<void>[] = [];
      page.on("request", (request) => void urls.push(request.url()));
      page.on("response", (response) => {
        if (response.request().resourceType() === "script") pending.push(response.text().then((text) => void scripts.set(new URL(response.url()).pathname, text)).catch(() => {}));
      });
      await page.goto(`${server.baseUrl}${url}`, { waitUntil: "networkidle" });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(settle);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1000);
      await Promise.all(pending);
      await context.close();
      return { paths: urls.map((u) => new URL(u).pathname), scripts, rsc: urls.filter((u) => u.includes("_rsc=")).map((u) => new URL(u).pathname) };
    }

    it("/ is still the Territory Overview: heading, four KPI cards, the panels and all 21 territory rows", async () => {
      const { page, context, errors } = await open("/");
      assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "Territory Overview");
      await page.getByTestId("overview").waitFor();
      for (const id of KPIS) assert.equal(await page.getByTestId(id).count(), 1, id);
      assert.equal(await page.locator('[data-testid="kpi-territories"] dd').first().innerText(), "21");
      for (const id of ["panel-row-states", "panel-block-states", "panel-links", "panel-gaps", "territory-table"]) assert.equal(await page.getByTestId(id).count(), 1, id);
      assert.equal(await page.locator("[data-territory-row]").count(), 21);
      assert.equal(await page.getByRole("link", { name: "Open the workspace" }).count(), 2, "the header link and the territory table's link are both still there");
      for (const link of await page.getByRole("link", { name: "Open the workspace" }).all()) assert.equal(await link.getAttribute("href"), "/workspace");
      assert.deepEqual(errors, []);
      await context.close();
    });

    it("the card renders with its heading, badge, notice and two links, in order, between the page header and the Overview", async () => {
      const { page, context } = await open("/");
      const card = page.locator(CARD);
      assert.equal(await card.count(), 1);
      assert.equal(await card.getByRole("heading", { level: 2 }).textContent(), "Explore on the globe");
      assert.equal(await card.locator("span").filter({ hasText: /^Provisional outlines$/ }).count(), 1, "the badge");
      const text = (await card.textContent()) ?? "";
      assert.match(text, /interactive 3D globe/);
      assert.match(text, /provisional geographic outlines/);
      assert.match(await page.getByTestId("globe-entry-notice").textContent() ?? "", /unofficial OpenStreetMap geometry, are not official boundaries, and do not provide complete district or block coverage/);
      assert.ok(!/\d/.test(text.replace(/[23]D/g, "")), `no figure in the card: ${text}`);
      assert.ok(!/\b(verified|confirmed|live|fully integrated)\b/i.test(text), "no verified, confirmed, live or fully-integrated claim");
      const links = await card.getByRole("link").evaluateAll((anchors) => anchors.map((a) => [a.textContent?.trim(), a.getAttribute("href")]));
      assert.deepEqual(links, [["Explore on the globe", "/globe"], ["Go to the 2D workspace", "/workspace"]]);
      // Between the header (h1) and the Overview (the KPI row), in the page's order.
      const order = await page.evaluate(() => {
        const position = (el: Element | null) => (el ? el.getBoundingClientRect().top + window.scrollY : NaN);
        return [position(document.querySelector("h1")), position(document.querySelector('[data-testid="globe-entry"]')), position(document.querySelector('[data-testid="kpi-territories"]'))];
      });
      assert.ok(order[0] < order[1] && order[1] < order[2], `h1, card, KPIs: ${order}`);
      assert.equal(await page.locator("main img, main svg, main canvas").count(), 0, "no image or canvas on the page");
      await context.close();
    });

    it("the primary link opens /globe and the existing globe becomes ready; Back keeps the Overview, and the secondary link opens /workspace", async () => {
      const { page, context } = await open("/");
      await page.locator(PRIMARY).click();
      await page.waitForURL("**/globe");
      await ready(page);
      assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "Globe");
      assert.equal(await page.locator('[data-testid="globe-canvas-host"] canvas').count(), 1);
      await page.waitForSelector(`${ROOT_SEL}[data-outlines="ready"]`);

      await page.goBack();
      await page.waitForURL((u) => u.pathname === "/");
      assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "Territory Overview");
      await page.getByTestId("overview").waitFor();
      assert.equal(await page.locator("[data-territory-row]").count(), 21);
      assert.equal(await page.locator(CARD).count(), 1);

      await page.locator(SECONDARY).click();
      await workspaceAt(page, "state");
      assert.equal(new URL(page.url()).pathname, "/workspace");
      await context.close();
    });

    for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]] as const) {
      it(`at ${width}px: no sideways scroll, the card stays inside the page and clear of the KPI row`, async () => {
        const { page, context } = await open("/", { width, height });
        await page.getByTestId("overview").waitFor();
        assert.ok((await overflow(page)) <= 0, `overflows by ${await overflow(page)}px`);
        const card = await box(page, CARD);
        assert.ok(card.x >= 0 && card.x + card.width <= width, `the card is within ${width}px: ${JSON.stringify(card)}`);
        const heading = await box(page, "h1");
        assert.ok(card.y >= heading.y + heading.height, "the card starts below the page header");
        const kpiTops = await Promise.all(KPIS.map(async (id) => (await box(page, `[data-testid="${id}"]`)).y));
        assert.ok(card.y + card.height <= Math.min(...kpiTops), `the card (bottom ${card.y + card.height}) does not overlap the KPI row (top ${Math.min(...kpiTops)})`);
        for (const selector of [PRIMARY, SECONDARY]) {
          const link = await box(page, selector);
          assert.ok(link.x >= card.x && link.x + link.width <= card.x + card.width, `${selector} is inside the card`);
          assert.ok(link.y >= card.y && link.y + link.height <= card.y + card.height, `${selector} is inside the card, vertically`);
          assert.ok(link.height >= 44, `${selector} is ${link.height}px high`);
        }
        const [primary, secondary] = [await box(page, PRIMARY), await box(page, SECONDARY)];
        if (width < 640) {
          assert.ok(primary.width >= card.width - 48, `the primary link is full width on a phone (${primary.width} of ${card.width})`);
          assert.ok(secondary.y >= primary.y + primary.height, "the workspace link is below the primary link");
        }
        if (width >= 1024) {
          const text = await box(page, `${CARD} h2`);
          assert.ok(primary.x > text.x + text.width && secondary.x > primary.x, "text on the left, actions grouped to the right");
          assert.ok(Math.abs(primary.y - secondary.y) < 4, "the two actions sit on one line");
          assert.ok(card.height <= 160, `compact on a desktop (${card.height}px)`);
          const kpi = await box(page, '[data-testid="kpi-territories"]');
          assert.ok(kpi.y + kpi.height <= height, `the KPI row is visible without scrolling at ${width} x ${height} (bottom ${kpi.y + kpi.height})`);
        }
        await context.close();
      });
    }

    it("both links are reachable by keyboard in order and show a focus ring", async () => {
      const { page, context } = await open("/", { width: 390, height: 844 });
      await page.locator(PRIMARY).focus();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "globe-entry-primary");
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "globe-entry-secondary");
      const ring = await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement!);
        return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      assert.ok(ring.style !== "none" && ring.width >= 2, `a drawn focus ring after Tab: ${JSON.stringify(ring)}`);
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Enter");
      await page.waitForURL("**/globe");
      await context.close();
    });

    for (const [width, height] of [[390, 844], [1440, 900]] as const) {
      it(`has no serious or critical accessibility violation at ${width}px`, async () => {
        const { page, context } = await open("/", { width, height });
        await page.getByTestId("overview").waitFor();
        await page.waitForTimeout(500);
        const violations = await runAxe(page);
        const serious = violations.filter((v: { impact: string }) => v.impact === "serious" || v.impact === "critical");
        assert.deepEqual(serious, [], JSON.stringify(violations));
        await context.close();
      });
    }

    it("opening / loads no Three.js, no globe texture, and neither boundary file, even after the default link prefetching has run", async () => {
      // Control first: the detector sees all of it where it should be.
      const globe = await observe("/globe", 2500);
      assert.ok(hasThree(globe.scripts).length > 0, "control: /globe loads the renderer");
      assert.ok(globe.paths.includes("/globe/earth-day-4k.jpg") || globe.paths.includes("/globe/earth-day-8k.jpg"), "control: /globe loads a texture");
      assert.ok(globe.paths.includes("/geo/globe-boundaries.json"), "control: /globe loads its own outline file");
      const workspace = await observe("/workspace", 2500);
      assert.ok(workspace.paths.includes("/geo/boundaries.json"), "control: /workspace loads the workspace's outline file");

      const home = await observe("/");
      assert.ok(home.scripts.size > 0, "/ loads scripts");
      assert.ok(home.rsc.includes("/globe") && home.rsc.includes("/workspace"), `the default prefetching ran and reached /globe and /workspace (${home.rsc})`);
      assert.deepEqual(hasThree(home.scripts), [], "/ does not load Three.js, including through prefetch");
      assert.deepEqual(home.paths.filter((p) => p.startsWith("/globe/")), [], "no globe texture or other /globe/ asset");
      assert.equal(home.paths.includes("/geo/globe-boundaries.json"), false);
      assert.equal(home.paths.includes("/geo/boundaries.json"), false);
      assert.deepEqual(home.paths.filter((p) => /\/(?:three|earth-)/i.test(p)), []);
    });
  });
});
