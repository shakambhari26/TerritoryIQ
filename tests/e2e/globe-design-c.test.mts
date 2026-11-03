import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type { ServerManifest } from "../../src/features/globe/server-types.ts";
import { browserPath, runAxe, skipReason, startServer, type Server } from "./harness.mts";

/**
 * The Globe page as the Design C layout: one large Earth, a floating place list on the left, floating insights on the
 * right, both collapsible, and a stage that is never narrowed by them. Chrome renders WebGL in software here, so every wait
 * is on state, not time. Staff names are never read or printed: the figures checked are counts.
 */
const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GENERATED = path.join(ROOT, "data", "generated");
const ROOT_SEL = '[data-testid="globe-prototype"]';
const HOST_SEL = '[data-testid="globe-canvas-host"]';
const WEBGL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

const attr = (page: Page, name: string) => page.getAttribute(ROOT_SEL, name);
const waitPhase = (page: Page, phase: string, timeout = 30_000) => page.waitForSelector(`${ROOT_SEL}[data-phase="${phase}"]`, { timeout });
const readDist = async (page: Page) => Number(((await page.getAttribute(HOST_SEL, "data-view")) ?? "").split(",")[2]);

/**
 * The Earth's silhouette in the canvas alone (everything floating over it is hidden for the capture): the widest and
 * tallest run of dark pixels, which is the sea and land, not the pale sky or the glow. Returns the diameter and where the
 * centre is, in the host's own pixels.
 */
async function earth(page: Page) {
  await page.addStyleTag({ content: `[data-testid="globe-stage"] > *:not([aria-roledescription="interactive globe"]), ${HOST_SEL} > :not(canvas) { visibility: hidden !important }` });
  const png = await page.locator(HOST_SEL).screenshot();
  await page.evaluate(() => document.querySelectorAll("style").forEach((s) => s.textContent?.includes("visibility: hidden !important") && s.remove()));
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        if (data[i] + data[i + 1] + data[i + 2] < 420) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { width, height, diameter: Math.max(maxX - minX, maxY - minY), cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }, png.toString("base64"));
}

describe("globe design C in a real browser", { skip: skipReason, timeout: 600_000 }, () => {
  let server: Server;
  let browser: Browser;
  let source: ServerManifest;

  before(async () => {
    source = JSON.parse(await readFile(path.join(GENERATED, "globe-overlay.json"), "utf8")) as ServerManifest;
    server = await startServer(3221);
    browser = await chromium.launch({ executablePath: browserPath, headless: true, args: WEBGL_ARGS });
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  async function open(width: number, height: number, localChanges?: string) {
    const context: BrowserContext = await browser.newContext({ viewport: { width, height } });
    // A change log as the Workspace would have saved it in this browser (only its shape is read, to count the changes).
    if (localChanges !== undefined) await context.addInitScript((value) => window.localStorage.setItem("territoryiq.localChanges.v1", value), localChanges);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.baseUrl}/globe`, { waitUntil: "load" });
    await page.waitForSelector(`${ROOT_SEL}[data-status="ready"]`, { timeout: 90_000 });
    await page.waitForSelector(`${ROOT_SEL}[data-outlines="ready"]`, { timeout: 30_000 });
    return { page, context, errors };
  }

  it("the Earth is large and centred in the stage, at 1440 and 1280 wide, and fills the shorter side of a tablet and a phone", async () => {
    // [width, height, smallest and largest diameter in pixels]. Diameter is 0.88 of the shorter side of the stage, a little less as measured (the limb is dark and soft).
    const cases: Array<[number, number, number, number]> = [
      [1440, 900, 550, 650],
      [1280, 800, 480, 560],
      [768, 1024, 560, 660],
      [390, 844, 270, 340],
    ];
    for (const [width, height, min, max] of cases) {
      const { page, context, errors } = await open(width, height);
      const measured = await earth(page);
      assert.ok(measured.diameter >= min && measured.diameter <= max, `${width}x${height}: Earth diameter ${measured.diameter}px, wanted ${min} to ${max}`);
      assert.ok(Math.abs(measured.cx - measured.width / 2) <= measured.width * 0.03, `${width}x${height}: centred across (centre ${measured.cx} of ${measured.width})`);
      assert.ok(Math.abs(measured.cy - measured.height / 2) <= measured.height * 0.05, `${width}x${height}: centred down (centre ${measured.cy} of ${measured.height})`);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, `${width}x${height}: no sideways scroll`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  });

  it("both panels float over the stage and neither narrows it; closing one leaves the globe exactly where it was", async () => {
    const { page, context } = await open(1440, 900);
    assert.equal(await attr(page, "data-places"), "open");
    assert.equal(await attr(page, "data-insights"), "open");
    const stage = (await page.locator(HOST_SEL).boundingBox())!;
    const places = (await page.locator('[data-testid="globe-places"]').boundingBox())!;
    const insights = (await page.locator('[data-testid="globe-insights-panel"]').boundingBox())!;
    assert.ok(places.x >= stage.x && places.x + places.width <= stage.x + stage.width / 2, "the place list floats on the left of the stage");
    assert.ok(insights.x >= stage.x + stage.width / 2 && insights.x + insights.width <= stage.x + stage.width + 1, "the insights float on the right of the stage");
    assert.ok(places.width <= 320 && insights.width <= 340, `compact widths (${places.width}, ${insights.width})`);
    const before = await earth(page);

    await page.getByRole("button", { name: "Hide places" }).click();
    assert.equal(await attr(page, "data-places"), "closed");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Places", "the keyboard focus moves to the button that reopens the list");
    await page.getByRole("button", { name: "Hide insights" }).click();
    assert.equal(await attr(page, "data-insights"), "closed");
    const stageAfter = (await page.locator(HOST_SEL).boundingBox())!;
    assert.deepEqual(stageAfter, stage, "the stage is the same size with both panels closed");
    const after = await earth(page);
    assert.ok(Math.abs(after.diameter - before.diameter) <= 4, `the Earth did not change size (${before.diameter} to ${after.diameter})`);
    assert.ok(Math.abs(after.cx - before.cx) <= 4, "the Earth did not move across");

    await page.getByRole("button", { name: "Places" }).click();
    await page.getByRole("button", { name: "Insights" }).click();
    assert.equal(await attr(page, "data-places"), "open");
    assert.equal(await attr(page, "data-insights"), "open");
    await context.close();
  });

  it("the place list has Districts and Blocks tabs, marks the selected place, and says where the globe is", async () => {
    const { page, context } = await open(1440, 900);
    const districts = source.districts.length;
    const blocks = source.blocks.length;
    const tabs = page.getByRole("tablist", { name: "Kind of place" });
    assert.equal(await tabs.getByRole("tab", { selected: true }).textContent().then((t) => t?.replace(/\s+/g, " ").trim()), `Districts ${districts}`);
    assert.equal(await page.getByRole("list", { name: "Places" }).getByRole("button").count(), districts);
    assert.match((await page.getByTestId("globe-trail").textContent()) ?? "", /Earth/);

    await tabs.getByRole("tab", { name: /^Blocks/ }).click();
    assert.equal(await page.getByRole("list", { name: "Places" }).getByRole("button").count(), blocks);
    assert.equal(await tabs.getByRole("tab", { selected: true }).textContent().then((t) => t?.replace(/\s+/g, " ").trim()), `Blocks ${blocks}`);

    // A block chosen from the list: the globe goes there, the row is marked, and the trail names the place.
    const first = page.getByRole("list", { name: "Places" }).getByRole("button").first();
    const name = ((await first.locator("span").first().textContent()) ?? "").trim();
    await first.click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    assert.equal(await attr(page, "data-level"), "block");
    await page.waitForSelector('[data-testid="globe-places"] [aria-current="true"]');
    const trail = (await page.getByTestId("globe-trail").textContent()) ?? "";
    assert.match(trail, /Earth › West Bengal › /);
    assert.ok(trail.endsWith(name), `the trail ends at the chosen block (${trail})`);

    // Searching lists districts and blocks together, and clearing the search brings the tabs back.
    await page.getByRole("searchbox").fill("bankura");
    assert.equal(await tabs.count(), 0, "no tabs while a search is showing");
    await page.getByRole("searchbox").fill("");
    assert.equal(await tabs.count(), 1);
    await context.close();
  });

  it("zoom and recentre are real controls: they move the camera, and Recentre brings a held globe back to its turn", async () => {
    const { page, context } = await open(1440, 900);
    const home = await readDist(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await waitPhase(page, "arrived");
    const closer = await readDist(page);
    assert.ok(closer < home - 0.3, `zoom in moves the camera closer (${home} to ${closer})`);
    assert.match((await page.getByTestId("globe-status").textContent()) ?? "", /Held/, "a zoomed globe says it is held, not rotating");
    await page.getByRole("button", { name: "Zoom out" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="globe-prototype"]')?.getAttribute("data-phase") === "arrived");
    await page.waitForTimeout(300);
    assert.ok((await readDist(page)) > closer + 0.3, "zoom out moves it back");
    await page.getByRole("button", { name: "Recentre" }).click();
    await waitPhase(page, "idle");
    assert.match((await page.getByTestId("globe-status").textContent()) ?? "", /Rotating/);

    // At a place, Recentre flies back to the framing the place was given.
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "arrived");
    const framed = await readDist(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForFunction((d) => Number((document.querySelector('[data-testid="globe-canvas-host"]')?.getAttribute("data-view") ?? "").split(",")[2]) < d - 0.1, framed, { timeout: 30_000 });
    await waitPhase(page, "arrived");
    await page.getByRole("button", { name: "Recentre" }).click();
    await page.waitForFunction((d) => Math.abs(Number((document.querySelector('[data-testid="globe-canvas-host"]')?.getAttribute("data-view") ?? "").split(",")[2]) - d) < 0.05, framed, { timeout: 30_000 });
    assert.equal(await attr(page, "data-level"), "state");
    await context.close();
  });

  it("the insights adapt to the level and keep rows, blocks and staff slots apart", async () => {
    const { page, context } = await open(1440, 900);
    const region = page.getByTestId("insight-region");
    const allocation = page.getByTestId("insight-allocation");

    // The whole globe: West Bengal is the only region with data, and the panel says so.
    assert.match((await page.getByTestId("globe-insights").textContent()) ?? "", /only region with data/);
    assert.match((await region.textContent()) ?? "", new RegExp(`Districts\\s*${source.districts.length}`));

    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "arrived");
    assert.equal(await page.getByTestId("globe-insights").getAttribute("data-level"), "state");
    const stateText = ((await region.textContent()) ?? "").replace(/\s+/g, " ");
    assert.match(stateText, new RegExp(`Provisional block outlines\\s*${source.meta.counts.blocksDrawn}\\s*of ${source.meta.counts.blocks} reference blocks`));
    assert.match(stateText, /Staff slots\s*[\d,]+\s*[\d,]+ named · [\d,]+ vacant markers/);
    // Rows and blocks are separate bars, each with the four allocation states as text; staff slots are a separate line.
    assert.equal(await allocation.getByTestId("state-bar").count(), 2);
    for (const label of ["Allocated", "Confirmed unallocated", "Missing / unverified", "Conflicting data"]) {
      assert.equal(await allocation.getByText(label, { exact: true }).count(), 2, `${label} appears once for rows and once for blocks`);
    }
    assert.match((await allocation.textContent()) ?? "", /Staff slots, counted apart from geography/);
    assert.match((await allocation.getByTestId("insight-staff").textContent()) ?? "", /Vacant markers? across all rows. A slot is not a person and not an allocation state/);
    assert.match((await page.getByTestId("insight-basis").textContent()) ?? "", /not these allocation states/);

    // A district: its own blocks and rows.
    await page.getByRole("searchbox").fill("bankura");
    await page.getByRole("button", { name: /^Bankura\s+district/ }).click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    assert.equal(await page.getByTestId("globe-insights").getAttribute("data-level"), "district");
    const district = source.districts.find((d) => d.name === "Bankura")!;
    assert.match(((await region.textContent()) ?? "").replace(/\s+/g, " "), new RegExp(`Blocks\\s*${district.blockCount}`));
    assert.match((await allocation.textContent()) ?? "", /Reference blocks in this district/);
    assert.match((await allocation.textContent()) ?? "", /Workbook rows linked to this district/);

    // A block: its own state, with the contested note kept where it was.
    await page.getByRole("list", { name: /Blocks in Bankura/ }).getByRole("button").first().click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    assert.equal(await page.getByTestId("globe-insights").getAttribute("data-level"), "block");
    assert.match((await allocation.textContent()) ?? "", /Workbook allocation state of this block/);
    await context.close();
  });

  it("the figures are labelled as the workbook baseline, and a change recorded in this browser is flagged instead of silently left out", async () => {
    const clean = await open(1440, 900);
    assert.match((await clean.page.getByTestId("insight-allocation").textContent()) ?? "", /Workbook baseline/);
    assert.equal(await clean.page.getByTestId("insight-local-changes").count(), 0, "no notice when the browser holds no change");
    const baseline = ((await clean.page.getByTestId("insight-region").textContent()) ?? "").replace(/\s+/g, " ");
    await clean.context.close();

    const log = JSON.stringify({ version: 1, changes: [{ id: "c1", kind: "note" }, { id: "c2", kind: "note" }] });
    const changed = await open(1440, 900, log);
    const notice = ((await changed.page.getByTestId("insight-local-changes").textContent()) ?? "").replace(/\s+/g, " ");
    assert.match(notice, /Baseline figures\. 2 changes recorded in this browser are not included here\. The Overview applies them/);
    assert.equal(((await changed.page.getByTestId("insight-region").textContent()) ?? "").replace(/\s+/g, " "), baseline, "the figures themselves are the baseline either way");
    assert.match((await changed.page.getByTestId("insight-basis").textContent()) ?? "", /Workbook baseline|workbook baseline/);
    await changed.context.close();
  });

  it("the new cards add no staff name to the page, the response or the DOM before a block is chosen", async () => {
    const names = new Set<string>();
    for (const block of source.blocks) for (const record of block.records) for (const person of record.people) if (person.name && person.name.trim().length >= 5) names.add(person.name.trim());
    assert.ok(names.size > 50, "the real names were found to check against (their count only is reported)");
    const lower = [...names].map((n) => n.toLowerCase());
    const leaked = (text: string) => lower.filter((n) => text.toLowerCase().includes(n)).length;

    const html = await (await fetch(`${server.baseUrl}/globe`)).text();
    assert.equal(leaked(html), 0, "staff names in the /globe HTML");
    assert.match(html, /salesTerritories/, "the insight counts are in the page props");
    assert.doesNotMatch(html, /\\*"slots\\*"\s*:|\\*"people\\*"\s*:|\\*"records\\*"\s*:|blockLabel/);
    const rsc = await (await fetch(`${server.baseUrl}/globe`, { headers: { RSC: "1" } })).text();
    assert.equal(leaked(rsc), 0, "staff names in the /globe RSC payload");

    const { page, context } = await open(1440, 900);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(`${request.method()} ${new URL(request.url()).pathname}`));
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "arrived");
    await page.getByRole("searchbox").fill("bankura");
    await page.getByRole("button", { name: /^Bankura\s+district/ }).click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    assert.equal(leaked(await page.content()), 0, "no staff name in the DOM at state or district level, with every insight card showing");
    assert.deepEqual(
      requests.filter((r) => /workspace|block-rows/.test(r)),
      [],
      "no Workspace prefetch and no block-rows request before a block is chosen",
    );
    await context.close();
  });

  it("the provisional notice, the legend and the attribution stay on screen at every size", async () => {
    for (const [width, height] of [[1440, 900], [1280, 800], [768, 1024], [390, 844]] as const) {
      const { page, context } = await open(width, height);
      assert.equal(await page.getByTestId("globe-provisional-notice").isVisible(), true, `${width}: notice visible`);
      assert.equal(await page.getByLabel("Legend").isVisible(), true, `${width}: legend visible`);
      const strip = (await page.getByTestId("globe-outlines-status").textContent()) ?? "";
      assert.match(strip, /Validated: \d+ district and \d+ block outlines, provisional/);
      assert.match((await page.locator("body").textContent()) ?? "", /NASA Earth Observatory/);
      await page.getByLabel("Legend").locator("summary").click();
      const legend = (await page.getByLabel("Legend").textContent()) ?? "";
      for (const text of ["District: provisional link", "Block: provisional link", "Confirmed: no representative", "Unresolved or unverified", "Selected", "Hover or focus"]) {
        assert.match(legend, new RegExp(text), `${width}: legend row "${text}"`);
      }
      await context.close();
    }
  });

  it("a phone has a places drawer that steps aside after a choice, and a details sheet that opens and closes", async () => {
    const { page, context } = await open(390, 844);
    assert.equal(await attr(page, "data-places"), "closed");
    assert.equal(await attr(page, "data-insights"), "closed");
    await page.getByRole("button", { name: "Places" }).click();
    const drawer = (await page.getByTestId("globe-places").boundingBox())!;
    assert.ok(drawer.width <= 330 && drawer.x >= 0 && drawer.x + drawer.width <= 390, `the drawer fits (${JSON.stringify(drawer)})`);
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "flying");
    assert.equal(await attr(page, "data-places"), "closed", "the drawer steps aside so the flight can be seen");
    await waitPhase(page, "arrived");
    await page.getByTestId("globe-details-strip").click();
    assert.equal(await attr(page, "data-insights"), "open");
    const sheet = (await page.getByTestId("globe-insights-panel").boundingBox())!;
    assert.ok(sheet.x >= 0 && sheet.x + sheet.width <= 390, `the sheet fits the width (${JSON.stringify(sheet)})`);
    assert.match((await page.getByTestId("insight-region").textContent()) ?? "", /Districts/);
    await page.keyboard.press("Escape");
    assert.equal(await attr(page, "data-insights"), "closed", "Escape closes the sheet");
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "no sideways scroll");
    await context.close();
  });

  it("tablet and desktop pass the automated accessibility check with the panels open", async () => {
    for (const [width, height] of [[1440, 900], [768, 1024]] as const) {
      const { page, context } = await open(width, height);
      // On a tablet the panels start closed: open the insights to check them, then the places to choose from.
      if (width < 1000) await page.getByRole("button", { name: "Insights" }).click();
      assert.deepEqual(await runAxe(page), [], `${width}: initial`);
      if (width < 1000) await page.getByRole("button", { name: "Places" }).click();
      await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
      await waitPhase(page, "arrived");
      assert.deepEqual(await runAxe(page), [], `${width}: at West Bengal`);
      await context.close();
    }
  });
});
