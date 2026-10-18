import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser, type BrowserContext, type Page, type Request, type Route } from "playwright-core";
import { staffNames, GLOBE_OUTPUT, WORKSPACE_OUTPUT } from "../../scripts/verify-public-assets.mjs";
import { BLOCK_ROWS_ERRORS } from "../../src/features/globe/block-rows.ts";
import { projectManifest } from "../../src/features/globe/overlay-projection.server.ts";
import type { ServerManifest } from "../../src/features/globe/server-types.ts";
import type { GlobeManifest } from "../../src/features/globe/types.ts";
import { leakedNames } from "../unit/helpers/leaked-names.mts";
import { browserPath, dataset, runAxe, skipReason, startServer, type Server } from "./harness.mts";

/**
 * Globe names on demand, proven on the production build and a real browser. The /globe page, its RSC payloads and every
 * Globe build artifact carry no staff names, row labels or sales territories; one selected block's rows are fetched with
 * POST /api/globe/block-rows after the visitor selects it, and are dropped again when the selection ends. Workspace is the
 * one known named output and is the positive control for every scan.
 *
 * Every assertion on names COUNTS matches and never prints a name, so a failure cannot leak one into a log.
 * This narrows what a page load carries. It is not authentication or access control.
 */
const ROOT = path.resolve(import.meta.dirname, "..", "..");
const NEXT = path.join(ROOT, ".next");
const ROOT_SEL = '[data-testid="globe-prototype"]';
const ROWS = '[data-testid="globe-block-rows"]';
const ROWS_READY = `${ROWS}[data-state="ready"]`;
const ENDPOINT = "/api/globe/block-rows";
const WEBGL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const NO_WEBGL_ARGS = ["--disable-gpu", "--disable-3d-apis", "--disable-webgl", "--disable-webgl2"];
/** Request resource types whose bodies are read (images, fonts and media are the globe's textures: not text). */
const TEXT_TYPES = new Set(["document", "script", "fetch", "xhr", "stylesheet", "other"]);

function* walk(directory: string, skip: (relative: string) => boolean = () => false): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    if (skip(relative)) continue;
    if (entry.isDirectory()) yield* walk(file, skip);
    else if (entry.isFile()) yield file;
  }
}

describe("globe names on demand", { skip: skipReason, timeout: 900_000 }, () => {
  let server: Server;
  let webgl: Browser;
  let plain: Browser;
  let names: string[];
  let source: ServerManifest;
  let manifest: GlobeManifest;
  let fileSize: number;

  before(async () => {
    names = staffNames(await dataset());
    assert.ok(names.length > 200, `${names.length} names to look for`);
    const file = path.join(ROOT, "data", "generated", "globe-overlay.json");
    source = JSON.parse(readFileSync(file, "utf8")) as ServerManifest;
    fileSize = statSync(file).size;
    manifest = projectManifest(source);
    server = await startServer(3227);
    webgl = await chromium.launch({ executablePath: browserPath, headless: true, args: WEBGL_ARGS });
    plain = await chromium.launch({ executablePath: browserPath, headless: true, args: NO_WEBGL_ARGS });
  });
  after(async () => {
    await webgl?.close();
    await plain?.close();
    await server?.stop();
  });

  // ------------------------------------------------------------------ data --
  const rowsOf = (blockId: string) => source.blocks.find((b) => b.id === blockId)!.records;
  const namesOf = (blockId: string) => new Set(rowsOf(blockId).flatMap((r) => r.people.flatMap((p) => (p.name ? [p.name.trim()] : []))));
  /** Names that are none of this block's own (and not a fragment of one of its strings), so seeing one means another block's rows. */
  const othersThan = (blockId: string) => {
    const own = namesOf(blockId);
    const ownText = [...own, ...rowsOf(blockId).flatMap((r) => [r.blockLabel, r.territory])].map((v) => v.toLowerCase());
    return names.filter((name) => !own.has(name) && !ownText.some((v) => v.includes(name.toLowerCase())));
  };

  const bankura = () => manifest.districts.find((d) => d.name === "Bankura")!;
  const withRows = () => manifest.blocks.filter((b) => b.districtId === bankura().id && b.state === "represented" && b.geometry && b.rowIds.length > 0);
  /** Two Bankura blocks, each with at least one person the other lacks (people cover several blocks, so full disjointness is rare). */
  function pair() {
    const blocks = withRows();
    const unique = (name: string) => manifest.blocks.filter((x) => x.name === name).length === 1;
    const only = (x: string, y: string) => [...namesOf(x)].filter((n) => !namesOf(y).has(n));
    for (const a of blocks) for (const b of blocks) if (unique(a.name) && unique(b.name) && a.id !== b.id && only(a.id, b.id).length > 0 && only(b.id, a.id).length > 0) return [a, b] as const;
    throw new Error("no two Bankura blocks that each have a person the other lacks");
  }
  const noRows = () => {
    const unique = (name: string) => manifest.blocks.filter((b) => b.name === name).length === 1;
    const block = manifest.blocks.find((b) => b.rowIds.length === 0 && unique(b.name));
    assert.ok(block, "a block with no workbook rows and a unique name");
    return block;
  };

  // --------------------------------------------------------------- browser --
  async function open(browser: Browser, url = "/globe", setup?: (context: BrowserContext) => Promise<void>) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await setup?.(context);
    const page = await context.newPage();
    const errors: string[] = [];
    const posts: Request[] = [];
    const requests: Request[] = [];
    const bodies: Array<{ path: string; text: string }> = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      requests.push(request);
      if (request.url().endsWith(ENDPOINT)) posts.push(request);
    });
    page.on("response", async (response) => {
      if (!TEXT_TYPES.has(response.request().resourceType())) return;
      try {
        bodies.push({ path: new URL(response.url()).pathname, text: await response.text() });
      } catch {
        /* a body that went away (a navigation, an abort) is not evidence either way */
      }
    });
    await page.goto(`${server.baseUrl}${url}`, { waitUntil: "load" });
    return { page, context, errors, posts, requests, bodies };
  }
  const openGlobe = async (setup?: (context: BrowserContext) => Promise<void>) => {
    const opened = await open(webgl, "/globe", setup);
    await opened.page.waitForSelector(`${ROOT_SEL}[data-status="ready"]`, { timeout: 90_000 });
    return opened;
  };
  const openFallback = async (setup?: (context: BrowserContext) => Promise<void>) => {
    const opened = await open(plain, "/globe", setup);
    await opened.page.waitForSelector('[data-testid="globe-fallback"]', { timeout: 60_000 });
    return opened;
  };
  const waitPhase = (page: Page, phase: string) => page.waitForSelector(`${ROOT_SEL}[data-phase="${phase}"]`, { timeout: 30_000 });
  const dom = (page: Page) => page.evaluate(() => document.documentElement.outerHTML);
  const domNames = async (page: Page) => leakedNames(await dom(page), names);
  /** The URL paths of the response bodies that carry a staff name. Nothing is excluded: Workspace's own response counts like any other. */
  const named = (bodies: Array<{ path: string; text: string }>) => bodies.filter((body) => leakedNames(body.text, names) > 0).map((body) => body.path);
  /** Every request to /workspace of any kind (HTML, RSC, segment prefetch): the path is what is compared, so a query or header cannot hide one. */
  const workspaceRequests = (requests: Request[]) => requests.filter((r) => /^\/workspace(?:$|[/?])/.test(new URL(r.url()).pathname)).map((r) => `${r.method()} ${new URL(r.url()).pathname}`);
  const workspaceBodies = (bodies: Array<{ path: string; text: string }>) => bodies.filter((body) => /^\/workspace(?:$|[/?])/.test(body.path)).length;

  const esc = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const arrivedAt = (page: Page, level: string) => page.waitForSelector(`${ROOT_SEL}[data-level="${level}"][data-phase="arrived"]`, { timeout: 30_000 });
  /**
   * Waits for a flight to start and end at `level`. Waiting for `flying` first matters: the level changes a render before the
   * phase does, so `level` plus `arrived` alone can match the old flight's end, with the buttons still disabled.
   */
  const flight = async (page: Page, level: string) => {
    await waitPhase(page, "flying");
    await arrivedAt(page, level);
  };

  async function selectDistrict(page: Page, flying: boolean) {
    await page.getByRole("searchbox").fill("bankura");
    await page.getByRole("button", { name: /^Bankura\s+district/ }).click();
    if (flying) await flight(page, "district");
    await page.getByRole("list", { name: /Blocks in Bankura/ }).waitFor();
  }
  /** Clicks a block in the district's list (only on screen at district level). With WebGL, waits for the flight to end. */
  async function selectBlock(page: Page, name: string, flying: boolean) {
    await page.getByRole("list", { name: /Blocks in Bankura/ }).getByRole("button", { name: new RegExp(`^${esc(name)}`) }).first().click();
    if (flying) await flight(page, "block");
  }
  /** Picks a block through the search box, which is on screen at every level. */
  async function searchBlock(page: Page, name: string, flying: boolean) {
    await page.getByRole("searchbox").fill(name);
    await page.getByRole("button", { name: new RegExp(`^${esc(name)}\\s+block`) }).first().click();
    if (flying) await flight(page, "block");
  }
  /** The details panel's block name is what is on screen: used where there is no flight to wait for. */
  const showing = (page: Page, name: string) => page.getByRole("heading", { level: 2, name }).waitFor({ timeout: 10_000 });
  const postedIds = (posts: Request[]) => posts.map((r) => (r.postDataJSON() as { blockId: string }).blockId);
  const serious = async (page: Page) => (await runAxe(page)).filter((v: { impact: string }) => v.impact === "serious" || v.impact === "critical");

  /** A route that answers the block-rows POST with `respond`, and counts how many it has seen. */
  const intercept = async (context: BrowserContext, respond: (route: Route, request: Request, count: number) => Promise<void> | void) => {
    let count = 0;
    await context.route(`**${ENDPOINT}`, (route, request) => respond(route, request, ++count));
  };
  const fulfillError = (route: Route, status: number, code: string) =>
    route.fulfill({ status, contentType: "application/json", headers: { "cache-control": "private, no-store" }, body: JSON.stringify({ code, error: "x" }) });

  // ------------------------------------------------- build output and HTML --
  it("1. the /globe HTML carries no staff name and no detailed record: blocks list rowIds, not records", async () => {
    const html = await (await fetch(`${server.baseUrl}/globe`)).text();
    assert.ok(html.length > 50_000, "the page carries the manifest");
    assert.equal(leakedNames(html, names), 0, "staff names in the /globe HTML");
    assert.match(html, /rowIds/, "the manifest in the page lists each block's row IDs");
    assert.doesNotMatch(html, /blockLabel|namedPeople|\\*"people\\*"\s*:|\\*"records\\*"\s*:|\\*"territory\\*"\s*:|\\*"slots\\*"\s*:/, "no record field is serialised into the page");
    const control = await (await fetch(`${server.baseUrl}/workspace`)).text();
    assert.ok(leakedNames(control, names) > 100, "positive control: /workspace's HTML does carry names");
  });

  it("2. the RSC payload and its prefetch variants carry no staff name (/workspace's carry them: positive control)", async () => {
    const variants: Array<Record<string, string>> = [
      {},
      { "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/_tree" },
      { "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/_full" },
      { "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/_index" },
      { "Next-Router-Prefetch": "1", "Next-Router-Segment-Prefetch": "/globe/__PAGE__" },
    ];
    let bytes = 0;
    for (const extra of variants) {
      const label = JSON.stringify(extra);
      const response = await fetch(`${server.baseUrl}/globe`, { headers: { RSC: "1", ...extra } });
      const text = await response.text();
      assert.equal(response.status, 200, label);
      assert.match(response.headers.get("content-type") ?? "", /^text\/x-component/, label);
      assert.equal(leakedNames(text, names), 0, `staff names in the /globe RSC ${label}`);
      assert.doesNotMatch(text, /blockLabel|namedPeople/, label);
      bytes += text.length;
    }
    assert.ok(bytes > 50_000, `${bytes} bytes of RSC read`);
    const control = await (await fetch(`${server.baseUrl}/workspace`, { headers: { RSC: "1" } })).text();
    assert.ok(leakedNames(control, names) > 100, "positive control: /workspace's RSC payload carries names");
  });

  it("3. every Globe-prefixed build artifact (page, RSC, segment and route-cache files, API route) holds zero staff names", () => {
    const globeFiles = [...walk(NEXT, (r) => r === ".next/cache")].filter((file) => GLOBE_OUTPUT.test(path.relative(ROOT, file).split(path.sep).join("/")));
    const names_in = (files: string[]) => files.filter((file) => leakedNames(readFileSync(file, "utf8"), names) > 0);
    assert.ok(globeFiles.length >= 15, `${globeFiles.length} Globe build files scanned`);
    for (const required of ["server/app/globe.html", "server/app/globe.rsc", "server/app/globe.segments/_full.segment.rsc", "server/app/globe.segments/globe/__PAGE__.segment.rsc", "server/app/api/globe/block-rows/route.js"]) {
      assert.ok(globeFiles.some((f) => f.split(path.sep).join("/").endsWith(`.next/${required}`)), `${required} was scanned`);
    }
    assert.deepEqual(names_in(globeFiles).map((f) => path.relative(ROOT, f)), [], "Globe build files that hold a staff name");
    const all = names_in([...walk(path.join(NEXT, "server")), ...walk(path.join(NEXT, "static"))]).map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
    assert.ok(all.length > 0 && all.length <= 8, `${all.length} server or static files hold names`);
    assert.ok(all.every((f) => WORKSPACE_OUTPUT.test(f)), `${all.filter((f) => !WORKSPACE_OUTPUT.test(f)).length} named build files are outside Workspace`);
  });

  it("4. the only named server build output is Workspace's: the positive control finds it, and nothing else", () => {
    const named = [...walk(path.join(NEXT, "server"))]
      .filter((file) => leakedNames(readFileSync(file, "utf8"), names) > 0)
      .map((file) => path.relative(ROOT, file).split(path.sep).join("/"));
    assert.ok(named.length >= 1, "positive control: the scan does find Workspace's names");
    assert.equal(named.filter((f) => WORKSPACE_OUTPUT.test(f)).length, named.length, "every named server file belongs to Workspace");
    assert.equal(named.filter((f) => /\/app\/(?:globe|api)/.test(f) || GLOBE_OUTPUT.test(f)).length, 0);
  });

  // ----------------------------------------------------------- WebGL globe --
  it("5. before a block is selected the DOM and every response body hold zero staff names, and no block-rows request is made", async () => {
    const { page, context, errors, posts, requests, bodies } = await openGlobe();
    await page.waitForSelector(`${ROOT_SEL}[data-outlines="ready"]`);
    await page.waitForTimeout(500);
    assert.equal(await domNames(page), 0, "staff names in the DOM");
    assert.equal(await page.locator(ROWS).count(), 0, "no rows section yet");
    assert.ok(bodies.length >= 3, `${bodies.length} response bodies read`);
    assert.deepEqual(named(bodies), [], "response bodies that carry a staff name");
    assert.ok(bodies.some((body) => /rowIds/.test(body.text)), "the page body is among those read");
    assert.equal(requests.filter((r) => r.url().includes("block-rows")).length, 0, "no block-rows request of any method");
    assert.deepEqual(workspaceRequests(requests), [], "no /workspace request (HTML, RSC or prefetch) before the visitor asks for it");
    assert.equal(workspaceBodies(bodies), 0, "no /workspace response body");
    // Selecting a district (not a block) still loads no names.
    await selectDistrict(page, true);
    assert.equal(await domNames(page), 0, "staff names in the DOM at district level");
    assert.equal(posts.length, 0, "no block-rows request at district level");
    assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), []);
    await context.close();
  });

  it("6. selecting block A sends exactly one POST with only { blockId } and shows only A's rows; block B then does the same", async () => {
    const [a, b] = pair();
    const { page, context, errors, posts } = await openGlobe();
    await selectDistrict(page, true);
    await selectBlock(page, a.name, true);
    await page.waitForSelector(ROWS_READY);
    assert.equal(posts.length, 1, "exactly one block-rows request");
    assert.equal(posts[0].method(), "POST");
    assert.deepEqual(posts[0].postDataJSON(), { blockId: a.id }, "the body is only { blockId }");
    assert.equal(new URL(posts[0].url()).pathname + new URL(posts[0].url()).search, ENDPOINT, "the fixed URL, no query");
    const response = await posts[0].response();
    assert.equal(response?.status(), 200);
    assert.equal(response?.headers()["cache-control"], "private, no-store");
    const body = (await response!.json()) as { blockId: string; rows: Array<{ unitId: string }> };
    assert.equal(body.blockId, a.id);
    assert.deepEqual(body.rows.map((r) => r.unitId), a.rowIds);

    const html = await dom(page);
    assert.equal(leakedNames(html, [...namesOf(a.id)]), namesOf(a.id).size, "all of A's names are shown");
    assert.equal(leakedNames(html, othersThan(a.id)), 0, "no name that belongs only to another block is shown");
    assert.equal(await page.locator('[data-testid="globe-open-workspace-row"]').count(), a.rowIds.length, "one row link per row");

    await searchBlock(page, b.name, true);
    await page.waitForSelector(ROWS_READY);
    assert.equal(posts.length, 2, "one request per selected block");
    assert.deepEqual(postedIds(posts), [a.id, b.id]);
    assert.deepEqual(posts[1].postDataJSON(), { blockId: b.id });
    const after = await dom(page);
    assert.equal(leakedNames(after, [...namesOf(b.id)]), namesOf(b.id).size, "all of B's names are shown");
    assert.equal(leakedNames(after, othersThan(b.id)), 0, "A's names are gone");
    assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), []);
    await context.close();
  });

  it("5b. opening /globe and selecting a block never prefetches /workspace; its links are all rendered and an explicit click still opens it", async () => {
    const [a] = pair();
    const { page, context, requests, bodies, errors } = await openGlobe();
    await page.waitForSelector(`${ROOT_SEL}[data-outlines="ready"]`);
    // Next starts a viewport prefetch for each visible <Link> once the page is idle: give it time to have started.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    const nav = page.getByRole("navigation").getByRole("link", { name: "Workspace" });
    assert.equal(await nav.count(), 1, "the Workspace navigation link is on screen");
    assert.equal(await nav.getAttribute("href"), "/workspace", "its target is unchanged");
    assert.deepEqual(workspaceRequests(requests), [], "opening /globe issued no /workspace request");
    assert.equal(workspaceBodies(bodies), 0);

    await selectDistrict(page, true);
    await selectBlock(page, a.name, true);
    await page.waitForSelector(ROWS_READY);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    const links = page.locator('[data-testid="globe-open-workspace"], [data-testid="globe-open-workspace-row"]');
    assert.ok((await links.count()) > a.rowIds.length, "the panel's block link and every row link are rendered");
    for (const href of await links.evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""))) assert.match(href, /^\/workspace#(?:feature|unit)=[A-Za-z0-9-]+$/, "target, hash and parameters are unchanged");
    assert.deepEqual(workspaceRequests(requests), [], "selecting a block and rendering the panel's links issued no /workspace request");
    assert.equal(workspaceBodies(bodies), 0);
    assert.deepEqual([...new Set(named(bodies))], [ENDPOINT], "the selected block's rows are the only response that carries names (nothing is excluded)");
    assert.equal(leakedNames(await dom(page), othersThan(a.id)), 0, "only the selected block's names are on screen");
    assert.deepEqual(postedIds(requests.filter((r) => r.url().endsWith(ENDPOINT))), [a.id], "only the selected block's rows were fetched");

    // An explicit click is what opens Workspace, and it is the first and only thing that requests it.
    await page.getByTestId("globe-open-workspace-row").first().click();
    await page.waitForURL("**/workspace#unit=*");
    await page.getByTestId("workspace").waitFor({ timeout: 15_000 });
    assert.ok(workspaceRequests(requests).length > 0, "the click navigated to /workspace");
    assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), []);
    await context.close();

    const second = await openGlobe();
    await second.page.waitForLoadState("networkidle");
    await second.page.getByRole("navigation").getByRole("link", { name: "Workspace" }).click();
    await second.page.waitForURL("**/workspace");
    await second.page.getByTestId("workspace").waitFor({ timeout: 15_000 });
    assert.equal(await second.page.getByRole("navigation").getByRole("link", { name: "Workspace" }).getAttribute("aria-current"), "page", "the navigation link now marks Workspace as current");
    assert.ok(workspaceBodies(second.bodies) > 0 && named(second.bodies).some((p) => /^\/workspace/.test(p)), "positive control: Workspace is the response that carries names, and only after the click");
    assert.equal(await second.page.getByTestId("globe-open-workspace").count(), 0);
    await second.context.close();
  });

  it("8. switching, Back, Escape and Return to globe each clear the names from the DOM", async () => {
    const [a, b] = pair();
    const { page, context } = await openGlobe();
    await selectDistrict(page, true);
    const cleared = async (label: string) => {
      assert.equal(await page.locator(ROWS).count(), 0, `${label}: no rows section`);
      assert.equal(await domNames(page), 0, `${label}: staff names left in the DOM`);
    };
    const selectA = async () => {
      await selectBlock(page, a.name, true);
      await page.waitForSelector(ROWS_READY);
      assert.ok((await domNames(page)) > 0, "A's names are shown");
    };

    await selectA();
    await searchBlock(page, b.name, true);
    await page.waitForSelector(ROWS_READY);
    assert.equal(leakedNames(await dom(page), othersThan(b.id)), 0, "switching: A's names are gone");

    await page.getByRole("button", { name: "Back" }).click();
    await flight(page, "district");
    await cleared("Back");

    await selectA();
    await page.locator(`${ROOT_SEL} [role="group"]`).focus();
    await page.keyboard.press("Escape");
    await flight(page, "district");
    await cleared("Escape");

    await selectBlock(page, a.name, true);
    await page.waitForSelector(ROWS_READY);
    await page.getByRole("button", { name: "Return to globe" }).click();
    await page.waitForSelector(`${ROOT_SEL}[data-level="globe"]`);
    await cleared("Return to globe");
    await context.close();
  });

  it("7. (WebGL) leaving a block while its request is pending shows nothing from that request, even if it answers later", async () => {
    const [a, b] = pair();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const { page, context, posts } = await openGlobe(async (ctx) => {
      await intercept(ctx, async (route, request) => {
        if ((request.postDataJSON() as { blockId: string }).blockId !== a.id) return route.continue();
        const response = await route.fetch();
        await held;
        await route.fulfill({ response }).catch(() => undefined);
      });
    });
    await selectDistrict(page, true);
    await page.locator(`${ROOT_SEL}`).waitFor();
    await page.getByRole("list", { name: /Blocks in Bankura/ }).getByRole("button", { name: new RegExp(`^${a.name}`) }).first().click();
    await page.waitForSelector(`${ROWS}[data-state="loading"]`);
    assert.equal(await domNames(page), 0, "nothing is shown while the request is pending");
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForSelector(`${ROWS}`, { state: "detached" });
    await flight(page, "district");
    await selectBlock(page, b.name, true);
    await page.waitForSelector(ROWS_READY);
    release();
    await page.waitForTimeout(800);
    const html = await dom(page);
    assert.equal(leakedNames(html, othersThan(b.id)), 0, "block A's late answer did not reach block B's panel");
    assert.equal(leakedNames(html, [...namesOf(b.id)]), namesOf(b.id).size);
    assert.deepEqual(postedIds(posts), [a.id, b.id]);
    await context.close();
  });

  it("9a. a block with no workbook rows sends no request and shows an empty section", async () => {
    const block = noRows();
    const { page, context, posts } = await openGlobe();
    await searchBlock(page, block.name, false);
    await page.waitForSelector(`${ROOT_SEL}[data-level="block"]`);
    await page.waitForSelector(`${ROWS}[data-state="empty"]`, { state: "attached" });
    await page.waitForTimeout(500);
    assert.equal(posts.length, 0, "no request for a block with no rowIds");
    assert.equal(await domNames(page), 0);
    assert.equal(await page.getByText("Workbook rows linked to this block").count(), 0);
    await context.close();
  });

  const failures: Array<{ label: string; respond: (route: Route) => Promise<void> | void }> = [
    { label: "not found (404)", respond: (route) => fulfillError(route, 404, "notfound") },
    { label: "a server error (500)", respond: (route) => fulfillError(route, 500, "unavailable") },
    { label: "an aborted request", respond: (route) => route.abort() },
    { label: "an answer that is not JSON", respond: (route) => route.fulfill({ status: 200, contentType: "application/json", body: "not json" }) },
    { label: "another block's answer", respond: (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ blockId: "GB-1", rows: [] }) }) },
  ];
  for (const { label, respond } of failures) {
    it(`9b. ${label} shows an error with Retry, shows no names, and Retry loads the rows (one request per attempt)`, async () => {
      const [a] = pair();
      let fail = true;
      const { page, context, posts } = await openGlobe(async (ctx) => {
        await intercept(ctx, (route) => (fail ? respond(route) : route.continue()));
      });
      await selectDistrict(page, true);
      await selectBlock(page, a.name, true);
      await page.waitForSelector(`${ROWS}[data-state="error"]`);
      assert.equal(await page.locator(`${ROWS} [role="alert"]`).count(), 1, "the error is announced");
      assert.equal(await domNames(page), 0, "no names with an error");
      assert.equal(posts.length, 1);
      fail = false;
      await page.getByTestId("globe-block-rows-retry").dblclick();
      await page.waitForSelector(ROWS_READY);
      assert.equal(posts.length, 2, "a repeated click on Retry sent one request, not two");
      assert.equal(leakedNames(await dom(page), othersThan(a.id)), 0);
      assert.ok((await domNames(page)) > 0);
      await context.close();
    });
  }

  it("9c. a request that never answers is abandoned after about ten seconds and shown as an error", async () => {
    const [a] = pair();
    const { page, context, posts } = await openGlobe(async (ctx) => {
      await intercept(ctx, () => undefined);
    });
    await selectDistrict(page, true);
    await selectBlock(page, a.name, true);
    await page.waitForSelector(`${ROWS}[data-state="loading"]`);
    const start = Date.now();
    await page.waitForSelector(`${ROWS}[data-state="error"]`, { timeout: 20_000 });
    const waited = Date.now() - start;
    assert.ok(waited > 4_000 && waited < 14_000, `the timeout fired after ${waited} ms of waiting (the flight took part of the ten seconds)`);
    assert.equal(posts.length, 1);
    assert.equal(await domNames(page), 0);
    await context.close();
  });

  it("13. the selected, loading and error states have no serious or critical accessibility violations, and announce themselves", async () => {
    const [a] = pair();
    let mode: "hold" | "fail" | "pass" = "hold";
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const { page, context } = await openGlobe(async (ctx) => {
      await intercept(ctx, async (route) => {
        if (mode === "hold") {
          const response = await route.fetch();
          await held;
          return route.fulfill({ response }).catch(() => undefined);
        }
        return mode === "fail" ? fulfillError(route, 500, "unavailable") : route.continue();
      });
    });
    await selectDistrict(page, true);
    await selectBlock(page, a.name, true);
    await page.waitForSelector(`${ROWS}[data-state="loading"]`);
    assert.equal(await page.locator(`${ROWS} [role="status"]`).count(), 1, "loading is announced politely");
    assert.equal(await page.locator(ROWS).getAttribute("aria-busy"), "true");
    assert.deepEqual(await serious(page), [], "loading state");
    release();
    await page.waitForSelector(ROWS_READY);
    assert.deepEqual(await serious(page), [], "selected (ready) state");

    mode = "fail";
    await page.getByRole("button", { name: "Back" }).click();
    await flight(page, "district");
    await selectBlock(page, a.name, true);
    await page.waitForSelector(`${ROWS}[data-state="error"]`);
    assert.equal(await page.locator(`${ROWS} [role="alert"]`).count(), 1);
    assert.deepEqual(await serious(page), [], "error state");
    await context.close();
  });

  // -------------------------------------------------------------- fallback --
  it("10. the no-WebGL fallback loads names only after a block is selected, one POST of { blockId }, and drops them when the selection moves on", async () => {
    const [a, b] = pair();
    const { page, context, posts, requests, bodies } = await openFallback();
    assert.equal(await domNames(page), 0, "no names in the fallback before selection");
    assert.deepEqual(named(bodies), [], "no response body carries a name");
    assert.equal(requests.filter((r) => r.url().includes("block-rows")).length, 0);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    assert.deepEqual(workspaceRequests(requests), [], "no /workspace request from the fallback either");
    await selectDistrict(page, false);
    assert.equal(await domNames(page), 0, "no names at district level");
    assert.equal(posts.length, 0);
    await selectBlock(page, a.name, false);
    await page.waitForSelector(ROWS_READY);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].postDataJSON(), { blockId: a.id });
    assert.equal(leakedNames(await dom(page), [...namesOf(a.id)]), namesOf(a.id).size);
    assert.equal(leakedNames(await dom(page), othersThan(a.id)), 0);
    await searchBlock(page, b.name, false);
    await page.waitForSelector(ROWS_READY);
    assert.equal(leakedNames(await dom(page), othersThan(b.id)), 0, "A's names are gone");
    await context.close();
  });

  it("7. (fallback) switching blocks rapidly: a late or abort-ignoring answer for A never shows once B is selected", async () => {
    const [a, b] = pair();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const { page, context, posts } = await openFallback(async (ctx) => {
      // The page's fetch ignores its AbortSignal, as a transport that cannot cancel would: A's answer really does arrive late.
      await ctx.addInitScript(() => {
        const original = window.fetch.bind(window);
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input).includes("/api/globe/block-rows") && init) {
            const { signal: _signal, ...rest } = init;
            void _signal;
            return original(input, rest);
          }
          return original(input, init);
        };
      });
      await intercept(ctx, async (route, request) => {
        if ((request.postDataJSON() as { blockId: string }).blockId !== a.id) return route.continue();
        const response = await route.fetch();
        await held;
        await route.fulfill({ response }).catch(() => undefined);
      });
    });
    await selectDistrict(page, false);
    await selectBlock(page, a.name, false);
    await showing(page, a.name);
    await page.waitForSelector(`${ROWS}[data-state="loading"]`);
    await searchBlock(page, b.name, false);
    await showing(page, b.name);
    await page.waitForSelector(ROWS_READY);
    release();
    await page.waitForTimeout(800);
    const html = await dom(page);
    assert.equal(leakedNames(html, othersThan(b.id)), 0, "A's names did not reach B's panel");
    assert.equal(leakedNames(html, [...namesOf(b.id)]), namesOf(b.id).size, "B's names are shown");
    assert.deepEqual(postedIds(posts), [a.id, b.id]);
    // And back to A afterwards: its rows load afresh, with no trace of B.
    await searchBlock(page, a.name, false);
    await page.waitForSelector(ROWS_READY);
    assert.equal(leakedNames(await dom(page), othersThan(a.id)), 0);
    await context.close();
  });

  // ------------------------------------------------------ the real server --
  describe("the real server's responses", () => {
    const url = `http://127.0.0.1:3227${ENDPOINT}`;
    const post = (body: BodyInit | null, headers: Record<string, string> = { "content-type": "application/json" }, method = "POST") =>
      fetch(`${server.baseUrl}${ENDPOINT}`, { method, headers, body });
    const baseline = (response: Response, label: string) => {
      assert.equal(response.headers.get("cache-control"), "private, no-store", `${label}: Cache-Control`);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", `${label}: nosniff`);
      assert.equal(response.headers.get("x-frame-options"), "DENY", `${label}: X-Frame-Options`);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer", `${label}: Referrer-Policy`);
      assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/, `${label}: CSP`);
      assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/, `${label}: Permissions-Policy`);
    };
    const error = async (response: Response, status: number, code: keyof typeof BLOCK_ROWS_ERRORS, label: string) => {
      const text = await response.text();
      assert.equal(response.status, status, label);
      baseline(response, label);
      assert.deepEqual(JSON.parse(text), { code, error: BLOCK_ROWS_ERRORS[code].message }, `${label}: a fixed code and message`);
      assert.equal(leakedNames(text, names), 0, `${label}: no name in an error`);
    };

    it("11. a valid request: 200, JSON, only that block's rows, private no-store, with the global security headers", async () => {
      const [a] = pair();
      const response = await post(JSON.stringify({ blockId: a.id }));
      assert.equal(response.status, 200);
      baseline(response, "200");
      assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
      const text = await response.text();
      const body = JSON.parse(text) as { blockId: string; rows: Array<{ unitId: string }> };
      assert.deepEqual(Object.keys(body), ["blockId", "rows"]);
      assert.deepEqual(body.rows.map((r) => r.unitId), a.rowIds);
      assert.equal(leakedNames(text, othersThan(a.id)), 0, "another block's names in the response");
      assert.equal(leakedNames(text, [...namesOf(a.id)]), namesOf(a.id).size);
    });

    it("11. a block with no rows answers 200 with an empty array", async () => {
      const response = await post(JSON.stringify({ blockId: noRows().id }));
      assert.equal(response.status, 200);
      baseline(response, "empty");
      assert.deepEqual(await response.json(), { blockId: noRows().id, rows: [] });
    });

    it("11. refusals: 405 for other methods, 415, 413, 400 for extra keys, arrays, bad IDs and bad JSON, 404 for an unknown block", async () => {
      const [a] = pair();
      const ok = JSON.stringify({ blockId: a.id });
      for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
        const response = await post(null, { "content-type": "application/json" }, method);
        assert.equal(response.headers.get("allow"), "POST", `${method}: Allow`);
        await error(response, 405, "method", method);
      }
      await error(await post(ok, { "content-type": "text/plain" }), 415, "mediatype", "wrong content type");
      await error(await post(ok, {}), 415, "mediatype", "no content type");
      await error(await post(JSON.stringify({ blockId: a.id, pad: "x".repeat(400) })), 413, "toolarge", "an oversized body");
      await error(await post(JSON.stringify({ blockId: a.id, extra: true })), 400, "badrequest", "an extra key");
      await error(await post(JSON.stringify([{ blockId: a.id }])), 400, "badrequest", "an array");
      await error(await post(JSON.stringify({ blockId: [a.id] })), 400, "badid", "an array ID");
      await error(await post(JSON.stringify({ blockId: a.id.toLowerCase() })), 400, "badid", "a lowercase ID");
      await error(await post(JSON.stringify({ blockId: a.rowIds[0] })), 400, "badid", "a row ID");
      await error(await post(JSON.stringify({ blockId: "__proto__" })), 400, "badid", "__proto__");
      await error(await post(JSON.stringify({ blockId: "constructor" })), 400, "badid", "constructor");
      await error(await post('{"__proto__":{"blockId":"GB-1"}}'), 400, "badrequest", "__proto__ as a key");
      await error(await post("{not json"), 400, "badjson", "invalid JSON");
      await error(await post(JSON.stringify({ blockId: "GB-999999999" })), 404, "notfound", "an unknown block");
    });

    it("11. a non-loopback Host is refused with 403 before any lookup, with no rows and no cache", async () => {
      const [a] = pair();
      for (const host of ["evil.example", "localhost.evil.example", "127.0.0.1.evil.example:3227", "192.168.1.5"]) {
        const refused = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
          const target = new URL(url);
          const request = http.request({ hostname: target.hostname, port: target.port, path: ENDPOINT, method: "POST", headers: { Host: host, "Content-Type": "application/json" } }, (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (c: Buffer) => chunks.push(c));
            response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
          });
          request.on("error", reject);
          request.end(JSON.stringify({ blockId: a.id }));
        });
        assert.equal(refused.status, 403, host);
        assert.match(refused.headers["cache-control"] ?? "", /no-store/, `${host}: never cached`);
        assert.equal(leakedNames(refused.body, names), 0, host);
        assert.doesNotMatch(refused.body, /rows|blockId/, host);
      }
    });

    it("12. a selected block's response is a small fraction of the full manifest and holds only that block's rows", async () => {
      const sizes: number[] = [];
      for (const block of manifest.blocks.filter((b) => b.rowIds.length > 0)) {
        const text = await (await post(JSON.stringify({ blockId: block.id }))).text();
        sizes.push(text.length);
        const body = JSON.parse(text) as { blockId: string; rows: Array<{ unitId: string }> };
        assert.deepEqual(body.rows.map((r) => r.unitId), block.rowIds, block.id);
      }
      const largest = Math.max(...sizes);
      assert.ok(largest < fileSize / 50, `the largest block response is ${largest} bytes; the full manifest file is ${fileSize}`);
      assert.ok(sizes.length > 250, `${sizes.length} blocks checked`);
      const page = (await (await fetch(`${server.baseUrl}/globe`)).text()).length;
      assert.ok(page > largest, "the page is larger than any one block's answer");
    });
  });
});
