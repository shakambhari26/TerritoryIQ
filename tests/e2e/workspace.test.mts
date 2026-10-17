import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { Browser } from "playwright-core";
import { checkPublicAssets, staffNames } from "../../scripts/verify-public-assets.mjs";
import { buildModel } from "../../src/features/territory/model.ts";
import type { BoundaryLayer } from "../../src/features/territory/types.ts";
import { clickShape, dataset, hasBuild, launch, openPage, runAxe, skipReason, startServer, type Server } from "./harness.mts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** A GET with an explicit Host header, which `fetch` does not allow, so the host check can be exercised. */
function get(baseUrl: string, urlPath: string, host?: string) {
  return new Promise<{ status: number; location: string | undefined; body: string }>((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const request = http.request(
      { hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`, method: "GET", headers: host ? { Host: host } : {} },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, location: response.headers.location, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    request.on("error", reject);
    request.end();
  });
}

/** Waits (up to 4 s) for a selector to match exactly `n` elements; the list filters re-render asynchronously. */
async function expectCount(page: import("playwright-core").Page, selector: string, n: number) {
  await page.waitForFunction(([sel, want]) => document.querySelectorAll(sel as string).length === want, [selector, n] as const, { timeout: 4000 }).catch(() => {});
  assert.equal(await page.locator(selector).count(), n, `${selector} count`);
}

describe("territory workspace in a real browser", { skip: skipReason }, () => {
  let server: Server;
  let browser: Browser;
  let data: Awaited<ReturnType<typeof dataset>>;
  let layer: BoundaryLayer;
  let model: ReturnType<typeof buildModel>;

  before(async () => {
    data = await dataset();
    layer = JSON.parse(await readFile(path.join(ROOT, "data", "generated", "boundaries.json"), "utf8")) as BoundaryLayer;
    model = buildModel(data, []);
    server = await startServer();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const unitByLabel = (label: string, territory?: string) =>
    data.units.find(
      (u) => u.blockLabel.trim() === label && (!territory || data.salesTerritories.find((t) => t.id === u.salesTerritoryId)?.label === territory),
    )!;

  /** The biggest allocated block with an outline, so it is easy to hit with the mouse. */
  const bigAllocatedBlock = () => {
    const sizes = new Map(layer.shapes.map((s) => [s.featureId, (s.bbox[2] - s.bbox[0]) * (s.bbox[3] - s.bbox[1])]));
    return data.features
      .filter((f) => f.kind === "block" && f.boundary && model.featureAllocation.get(f.id)!.state === "allocated" && model.featureAllocation.get(f.id)!.claimants.length === 1)
      .sort((a, b) => sizes.get(b.id)! - sizes.get(a.id)!)[0];
  };

  it("overview shows real, separate counts for the four states and never invents confirmed-unallocated", async () => {
    const { page, context, errors } = await openPage(browser);
    await page.goto(`${server.baseUrl}/`, { waitUntil: "networkidle" });
    assert.equal(await page.locator('[data-testid="kpi-territories"] dd').first().innerText(), "21");
    const rows = page.locator('[data-testid="panel-row-states"] [data-state-count]');
    assert.equal(await rows.count(), 4);
    const counts = Object.fromEntries(
      await rows.evaluateAll((els) => els.map((el) => [el.getAttribute("data-state-count"), Number(el.lastElementChild!.textContent!.replace(/,/g, ""))])),
    );
    assert.deepEqual(counts, {
      allocated: model.summary.units.byState.allocated,
      confirmed_unallocated: 0,
      missing: model.summary.units.byState.missing,
      conflicting: model.summary.units.byState.conflicting,
    });
    assert.equal(counts.allocated + counts.missing + counts.conflicting, 358);
    assert.equal(await page.locator("[data-territory-row]").count(), 21);
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("makes no request outside localhost", async () => {
    const { page, context, hosts } = await openPage(browser);
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="map-svg"]').waitFor();
    assert.deepEqual([...hosts], [new URL(server.baseUrl).host]);
    await context.close();
  });

  it("draws one shape per linked official unit and shows the attribution", async () => {
    const { page, context, errors } = await openPage(browser);
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="map-svg"]').waitFor();
    assert.equal(await page.locator("path[data-fid]").count(), layer.shapes.length);
    assert.equal(await page.locator('path[data-fid^="GD-"]').count(), 23);
    assert.match(await page.locator('[data-testid="map-legend"]').innerText(), /OpenStreetMap contributors/);
    assert.match(await page.locator('[data-testid="map-legend"]').innerText(), /provisional/i, "the legend always says so, with the attribution");
    assert.match(await page.locator('[data-testid="map-provisional"]').innerText(), /Provisional boundaries/, "and the chip on the map is always there");
    // The full coverage wording is a disclosure: collapsed until asked for, and an accessible button opens it.
    const toggle = page.locator('[data-testid="map-about-toggle"]');
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator('[data-testid="map-coverage"]').isVisible(), false, "collapsed by default");
    assert.equal(await toggle.getAttribute("aria-controls"), await page.locator('[data-testid="map-about"]').getAttribute("id"));
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    const coverage = await page.locator('[data-testid="map-coverage"]').innerText();
    assert.match(coverage, /Coverage is not complete/);
    assert.match(coverage, new RegExp(`${layer.shapes.filter((s) => s.featureId.startsWith("GD-")).length} of 23 districts`));
    assert.match(coverage, new RegExp(`${data.features.filter((f) => f.kind === "block" && f.boundary).length} of 345 blocks in the current reference list have provisional outlines`));
    assert.match(await page.locator('[data-testid="map-reference-note"]').innerText(), /not been independently verified as the complete official total/);
    assert.equal(/official blocks/i.test(coverage), false, "the 345 is never called official");
    assert.match(coverage, /No ward or urban-body boundaries/);
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("downloads no staff name in any script, style, font or image, nor in the boundary file", async () => {
    const { page, context } = await openPage(browser);
    const assets: Array<{ url: string; body: Buffer }> = [];
    let layerBody: string | null = null;
    page.on("response", async (response) => {
      const type = response.request().resourceType();
      const url = response.url();
      try {
        if (url.endsWith("/geo/boundaries.json")) layerBody = await response.text();
        else if (["script", "stylesheet", "font", "image", "media"].includes(type)) assets.push({ url, body: await response.body() });
      } catch {
        /* a response closed by navigation */
      }
    });
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="map-svg"]').waitFor();
    const names = staffNames(data);
    assert.ok(names.length > 200, "the check needs the real names");
    assert.ok(assets.some((a) => a.url.endsWith(".js")), "the page's scripts were seen");
    for (const asset of assets) {
      const text = asset.body.toString("utf8");
      const found = names.filter((name: string) => text.includes(name));
      assert.deepEqual(found, [], `${asset.url} contains a staff name`);
    }
    assert.ok(layerBody !== null, "the boundary file was fetched");
    assert.deepEqual(names.filter((name: string) => (layerBody as unknown as string).includes(name)), [], "the boundary file contains a staff name");
    await context.close();
  });

  it("serves the boundary layer through its route as provisional, attributed JSON", async () => {
    const response = await fetch(`${server.baseUrl}/geo/boundaries.json`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store|no-cache|max-age=0/);
    const served = (await response.json()) as BoundaryLayer;
    assert.match(served.meta.status, /^Provisional/);
    assert.match(served.meta.attribution, /OpenStreetMap contributors/);
    assert.match(served.meta.licence, /ODbL/);
    assert.equal(served.shapes.length, layer.shapes.length);
  });

  it("answers only to a loopback Host header", async () => {
    for (const urlPath of ["/", "/workspace", "/geo/boundaries.json"]) {
      for (const host of ["evil.example", "evil.example:3199", "192.168.1.20:3199", "localhost.evil.example"]) {
        const refused = await get(server.baseUrl, urlPath, host);
        assert.equal(refused.status, 403, `${urlPath} with Host ${host}`);
        assert.match(refused.body, /localhost-only prototype/);
        assert.doesNotMatch(refused.body, /<html|"shapes"|ASM/i, "a refused request receives no page or data");
      }
      const port = new URL(server.baseUrl).port;
      for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]) {
        assert.equal((await get(server.baseUrl, urlPath, host)).status, 200, `${urlPath} with Host ${host}`);
      }
    }
  });

  it("sends the retired Gate P0 map route to the workspace", async () => {
    for (const urlPath of ["/territory-map", "/territory-map/fixture-preview"]) {
      const moved = await get(server.baseUrl, urlPath);
      assert.equal(moved.status, 307, urlPath);
      assert.match(moved.location ?? "", /\/workspace$/);
    }
  });

  it("selects by clicking: a district opens, then a block inside it is selected by ID, kept in the URL, and Escape climbs one level at a time", async () => {
    const { page, context } = await openPage(browser);
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="map-svg"]').waitFor();
    const block = bigAllocatedBlock();
    const unitId = model.featureAllocation.get(block.id)!.claimants[0];
    // At state level a click on a block's place opens its district; the block itself is not selected yet.
    await clickShape(page, block.districtId!);
    await page.locator('[data-testid="details-district"]').waitFor();
    assert.equal(new URL(page.url()).hash, `#feature=${block.districtId}`);
    assert.equal(await page.locator('[data-testid="geo-map"]').getAttribute("data-level"), "district");
    await clickShape(page, block.id);
    await page.locator('[data-testid="details-unit"]').waitFor();
    assert.equal(await page.locator('[data-testid="details-unit"]').getAttribute("data-unit-id"), unitId);
    assert.equal(new URL(page.url()).hash, `#unit=${unitId}`);
    assert.equal(await page.locator('[data-testid="geo-map"]').getAttribute("data-level"), "block");
    assert.ok(await page.locator('path[data-highlight="focus"]').count() > 0, "the selected outline is emphasised");
    await page.locator('[data-testid="geo-map"]').focus();
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="details-district"]').waitFor();
    assert.equal(new URL(page.url()).hash, `#feature=${block.districtId}`);
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="details-empty"]').waitFor();
    assert.equal(new URL(page.url()).hash, "");
    await context.close();
  });

  it("restores a selection from a deep link and ignores an invented ID", async () => {
    const { page, context } = await openPage(browser);
    await page.goto(`${server.baseUrl}/workspace#unit=TU-009`, { waitUntil: "networkidle" });
    assert.equal(await page.locator('[data-testid="details-unit"]').getAttribute("data-unit-id"), "TU-009");
    await page.goto(`${server.baseUrl}/workspace#unit=NOT-AN-ID`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="details-empty"]').waitFor();
    await page.goto(`${server.baseUrl}/workspace#unit=Nandakumar`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="details-empty"]').waitFor();
    await context.close();
  });

  it("zooms, pans and fits with the buttons and the keyboard", async () => {
    const { page, context } = await openPage(browser);
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    const layerNode = page.locator('[data-testid="map-layer"]');
    await layerNode.waitFor();
    const scale = async () => Number(await layerNode.getAttribute("data-scale"));
    const fit = await scale();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(400);
    const zoomedIn = await scale();
    assert.ok(zoomedIn > fit * 1.4, `zoom in: ${fit} -> ${zoomedIn}`);
    await page.getByRole("button", { name: "Zoom out" }).click();
    await page.waitForTimeout(400);
    assert.ok(Math.abs((await scale()) - fit) < fit * 0.05);
    await page.locator('[data-testid="geo-map"]').focus();
    await page.keyboard.press("+");
    await page.keyboard.press("+");
    await page.waitForTimeout(100);
    assert.ok((await scale()) > fit * 1.8);
    await page.keyboard.press("0");
    await page.waitForTimeout(500);
    assert.ok(Math.abs((await scale()) - fit) < fit * 0.02, "0 fits the whole map");
    // Drag pans without changing scale or selecting anything.
    const box = (await page.locator('[data-testid="geo-map"]').boundingBox())!;
    const before = await layerNode.evaluate((el) => (el as SVGElement).style.transform);
    await page.mouse.move(box.x + 100, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 340, { steps: 4 });
    await page.mouse.up();
    const after = await layerNode.evaluate((el) => (el as SVGElement).style.transform);
    assert.notEqual(before, after);
    assert.equal(Math.abs((await scale()) - fit) < fit * 0.001, true);
    await page.locator('[data-testid="details-empty"]').waitFor();
    // Fit view is disabled until there is a district or a block with an outline to fit.
    assert.equal(await page.getByRole("button", { name: "Fit view", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Fit view", exact: true }).getAttribute("title"), "Nothing selected to fit");
    assert.equal(await page.locator('[data-testid="map-controls"] button').count(), 6, "zoom in and out, fit state, fit view, reset, grid");
    await context.close();
  });

  it("pans with the on-screen buttons: same step and direction as the arrow keys, no zoom, no selection", async () => {
    const { page, context } = await openPage(browser);
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    const layerNode = page.locator('[data-testid="map-layer"]');
    await layerNode.waitFor();
    const view = async () => {
      const transform = await layerNode.evaluate((el) => (el as SVGElement).style.transform);
      const [, tx, ty, scale] = transform.match(/translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/)!.map(Number);
      return { tx, ty, scale };
    };
    const STEP = 60; // KEY_PAN in GeoMap.tsx
    const start = await view();

    // Each button moves the view by one key step, exactly as the matching arrow key does.
    const moves: [string, number, number][] = [
      ["Pan left", STEP, 0],
      ["Pan right", -STEP, 0],
      ["Pan up", 0, STEP],
      ["Pan down", 0, -STEP],
    ];
    for (const [name, dx, dy] of moves) {
      const before = await view();
      await page.getByRole("button", { name, exact: true }).click();
      const after = await view();
      assert.ok(Math.abs(after.tx - before.tx - dx) < 1e-6 && Math.abs(after.ty - before.ty - dy) < 1e-6, `${name}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
      assert.equal(after.scale, before.scale, `${name} must not zoom`);
    }
    const back = await view();
    assert.ok(Math.abs(back.tx - start.tx) < 1e-6 && Math.abs(back.ty - start.ty) < 1e-6, "left+right and up+down cancel");

    // The arrow keys on the map agree with the buttons.
    await page.getByRole("button", { name: "Pan left", exact: true }).click();
    const afterButton = await view();
    await page.getByRole("button", { name: "Pan right", exact: true }).click();
    await page.locator('[data-testid="geo-map"]').focus();
    await page.keyboard.press("ArrowLeft");
    const afterKey = await view();
    assert.ok(Math.abs(afterKey.tx - afterButton.tx) < 1e-6 && Math.abs(afterKey.ty - afterButton.ty) < 1e-6, "ArrowLeft equals the Pan left button");

    // Pressing a pan button never selects or clears anything (the map clears the selection on a bare click).
    await page.locator('[data-testid="details-empty"]').waitFor();

    // All four are real buttons in the tab order, inside a labelled group.
    const group = page.getByRole("group", { name: "Pan map" });
    assert.equal(await group.getByRole("button").count(), 4);
    await group.getByRole("button", { name: "Pan up", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal((await view()).ty - afterKey.ty, STEP, "Enter on a focused pan button pans");
    await context.close();
  });

  it("moves the map to a selection made outside it, but never when a block on the map is clicked", async () => {
    const { page, context } = await openPage(browser);
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    const layerNode = page.locator('[data-testid="map-layer"]');
    await layerNode.waitFor();
    await page.waitForTimeout(700); // the first view settles once the map has its final size
    const scale = async () => Number(await layerNode.getAttribute("data-scale"));
    const fit = await scale();

    // Opening a district fits it; clicking a block inside it selects without moving the view.
    const block = bigAllocatedBlock();
    await clickShape(page, block.districtId!);
    await page.waitForTimeout(600);
    const districtScale = await scale();
    assert.ok(districtScale > fit * 1.5, `district fit: ${fit} -> ${districtScale}`);
    await clickShape(page, block.id);
    await page.locator('[data-testid="details-unit"]').waitFor();
    await page.waitForTimeout(500);
    assert.ok(Math.abs((await scale()) - districtScale) < districtScale * 0.001, "a block click must not zoom");

    // A selection from the list zooms to the outline.
    await page.getByRole("searchbox").fill("nandakumar");
    await page.locator("[data-area-id]").first().click();
    await page.waitForTimeout(600);
    const revealed = await scale();
    assert.ok(revealed > fit * 5, `list selection: ${fit} -> ${revealed}`);

    // Fit view is available, and Fit entire state returns to the whole map.
    assert.equal(await page.getByRole("button", { name: "Fit view", exact: true }).isDisabled(), false);
    await page.getByRole("button", { name: "Fit entire state" }).click();
    await page.waitForTimeout(600);
    // The whole state again. Not the very same scale as at first: inside a district the toolbar has a second row (a
    // Back button and a longer breadcrumb), so the map is a little shorter and the fitted state a little smaller.
    const whole = await page.evaluate(() => {
      const map = document.querySelector('[data-testid="geo-map"]')!.getBoundingClientRect();
      const boxes = [...document.querySelectorAll('path[data-fid^="GD-"]')].map((p) => p.getBoundingClientRect());
      const top = Math.min(...boxes.map((b) => b.top));
      const bottom = Math.max(...boxes.map((b) => b.bottom));
      return { inside: top >= map.top - 1 && bottom <= map.bottom + 1, share: (bottom - top) / map.height };
    });
    assert.equal(whole.inside, true, "every district is on the map");
    assert.ok(whole.share > 0.85, `the state fills the map height (${whole.share.toFixed(2)})`);
    assert.ok((await scale()) < revealed / 5 && Math.abs((await scale()) - fit) < fit * 0.1, "and it is the overview scale, give or take the map's height");
    await page.getByRole("button", { name: "Fit view", exact: true }).click();
    await page.waitForTimeout(600);
    assert.ok(Math.abs((await scale()) - revealed) < revealed * 0.02, "Fit view returns to the selected block");
    await context.close();
  });

  it("opens a deep link already zoomed to the selected outline", async () => {
    const { page, context } = await openPage(browser);
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    const layerNode = page.locator('[data-testid="map-layer"]');
    await layerNode.waitFor();
    const fit = Number(await layerNode.getAttribute("data-scale"));
    await page.goto(`${server.baseUrl}/workspace#unit=${unitByLabel("Nandakumar").id}`, { waitUntil: "networkidle" });
    await layerNode.waitFor();
    await page.waitForTimeout(600);
    assert.ok(Number(await layerNode.getAttribute("data-scale")) > fit * 5);
    await context.close();
  });

  describe("geographic levels and labels", () => {
    const districtByName = (name: string) => data.features.find((f) => f.kind === "district" && f.name === name)!;
    const scaleOf = async (page: import("playwright-core").Page) => Number(await page.locator('[data-testid="map-layer"]').getAttribute("data-scale"));
    /** Lets the fly-to transition and the label fade finish. */
    const settle = (page: import("playwright-core").Page) => page.waitForTimeout(700);
    const crumbs = async (page: import("playwright-core").Page) => (await page.locator('[data-testid="map-breadcrumb"]').innerText()).replace(/\s+/g, " ");

    it("names all 23 districts at the overview, inside the map, over nothing else, and with the LGD names", async () => {
      const { page, context, errors } = await openPage(browser, 1440, 900);
      await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="map-labels"]').waitFor();
      await settle(page);
      const labels = await page.evaluate(() =>
        [...document.querySelectorAll('[data-label-kind="district"]')].map((g) => {
          const boxes = [...g.querySelectorAll("text")].map((t) => t.getBoundingClientRect());
          return {
            id: (g as HTMLElement).dataset.labelId!,
            text: [...g.querySelectorAll("text")].map((t) => t.textContent).join(" "),
            left: Math.min(...boxes.map((b) => b.left)),
            right: Math.max(...boxes.map((b) => b.right)),
            top: Math.min(...boxes.map((b) => b.top)),
            bottom: Math.max(...boxes.map((b) => b.bottom)),
          };
        }),
      );
      assert.equal(labels.length, 23);
      const official = new Map(data.features.filter((f) => f.kind === "district").map((f) => [f.id, f.name]));
      for (const label of labels) assert.equal(label.text, official.get(label.id));
      // The names stay inside the map and clear of one another and of the controls.
      const map = (await page.locator('[data-testid="geo-map"]').boundingBox())!;
      const controls = [(await page.locator('[data-testid="map-controls"]').boundingBox())!, (await page.locator('[data-testid="pan-controls"]').boundingBox())!];
      for (const [i, a] of labels.entries()) {
        assert.ok(a.left >= map.x && a.right <= map.x + map.width && a.top >= map.y && a.bottom <= map.y + map.height, `${a.text} is inside the map`);
        for (const c of controls) assert.ok(a.right < c.x || a.left > c.x + c.width || a.bottom < c.y || a.top > c.y + c.height, `${a.text} is clear of a control`);
        for (const b of labels.slice(i + 1)) assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `${a.text} overlaps ${b.text}`);
      }
      assert.deepEqual(errors, []);
      await context.close();
    });

    it("drills from the state to a district to a block, with breadcrumbs and back at every level", async () => {
      const { page, context, errors } = await openPage(browser, 1440, 900);
      await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="map-layer"]').waitFor();
      await settle(page);
      const stateScale = await scaleOf(page);
      assert.match(await page.locator('[data-testid="map-level"]').innerText(), /state overview/i);
      assert.equal(await page.locator('[data-testid="map-back"]').count(), 0);

      const bankura = districtByName("Bankura");
      await clickShape(page, bankura.id);
      await page.locator('[data-testid="details-district"]').waitFor();
      await settle(page);
      assert.equal(new URL(page.url()).hash, `#feature=${bankura.id}`);
      assert.match(await page.locator('[data-testid="map-level"]').innerText(), /district view/i);
      assert.match(await crumbs(page), /West Bengal › Bankura/);
      assert.ok((await scaleOf(page)) > stateScale * 2, "the district is fitted");
      // Exactly the district's outlined blocks are drawn, and no block of any other district.
      const drawnBlocks = await page.locator('path[data-fid^="GB-"]').evaluateAll((els) => els.map((el) => el.getAttribute("data-fid")!));
      const blocksOfBankura = data.features.filter((f) => f.kind === "block" && f.districtId === bankura.id);
      const expected = blocksOfBankura.filter((f) => f.boundary).map((f) => f.id);
      assert.deepEqual([...drawnBlocks].sort(), [...expected].sort());
      assert.ok((await page.locator('[data-label-kind="block"]').count()) > 0, "block names show inside the district");
      assert.match(await page.locator('[data-testid="map-district-coverage"]').innerText(), new RegExp(`${expected.length} of ${blocksOfBankura.length} block outlines`));

      // Wheel zoom scales this view and does not change the geographic level or the selection.
      const districtScale = await scaleOf(page);
      const box = (await page.locator('[data-testid="geo-map"]').boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(300);
      assert.ok((await scaleOf(page)) > districtScale * 1.2);
      assert.equal(await page.locator('[data-testid="geo-map"]').getAttribute("data-level"), "district");
      assert.equal(new URL(page.url()).hash, `#feature=${bankura.id}`);
      // Reset returns to the district's own extent.
      await page.getByRole("button", { name: "Reset view" }).click();
      await settle(page);
      assert.ok(Math.abs((await scaleOf(page)) - districtScale) < districtScale * 0.02);

      // A block inside the district.
      const block = blocksOfBankura.find((f) => f.boundary && model.featureAllocation.get(f.id)!.claimants.length === 1)!;
      await clickShape(page, block.id);
      await page.locator('[data-testid="details-unit"]').waitFor();
      assert.equal(await page.locator('[data-testid="geo-map"]').getAttribute("data-level"), "block");
      assert.match(await crumbs(page), new RegExp(`West Bengal › Bankura › ${block.name}`));
      assert.equal(await page.locator('path[data-highlight="focus"]').getAttribute("data-highlight"), "focus");
      assert.ok((await page.locator('[data-label-kind="block"]').count()) > 0);

      // Back up, one level at a time.
      await page.locator('[data-testid="map-back"]').click();
      await page.locator('[data-testid="details-district"]').waitFor();
      assert.equal(new URL(page.url()).hash, `#feature=${bankura.id}`);
      await page.locator('[data-testid="map-back"]').click();
      await page.locator('[data-testid="details-empty"]').waitFor();
      await settle(page);
      assert.ok(Math.abs((await scaleOf(page)) - stateScale) < stateScale * 0.02, "back to the state returns to the state fit");
      assert.equal(await page.locator('[data-testid="geo-map"]').getAttribute("data-level"), "state");
      assert.deepEqual(errors, []);
      await context.close();
    });

    it("keeps a control press from changing the level or the selection", async () => {
      const { page, context } = await openPage(browser, 1440, 900);
      const bankura = districtByName("Bankura");
      await page.goto(`${server.baseUrl}/workspace#feature=${bankura.id}`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="map-layer"]').waitFor();
      await settle(page);
      await page.getByRole("button", { name: "Zoom in" }).click();
      await page.getByRole("button", { name: "Pan left", exact: true }).click();
      assert.equal(new URL(page.url()).hash, `#feature=${bankura.id}`);
      assert.equal(await page.locator('[data-testid="geo-map"]').getAttribute("data-level"), "district");
      await context.close();
    });

    it("tells two blocks of the same name apart: search lists both with their district and selects the right one", async () => {
      const { page, context } = await openPage(browser, 1440, 900);
      await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="map-layer"]').waitFor();
      const search = page.locator('[data-testid="map-search"] input[type="search"]');
      await search.fill("sankrail");
      const options = page.locator('[data-testid="map-search-results"] [role="option"]');
      await options.first().waitFor();
      assert.equal(await options.count(), 2);
      const text = await options.allInnerTexts();
      assert.ok(text.some((t) => /Howrah district/.test(t)) && text.some((t) => /Jhargram district/.test(t)), text.join(" | "));
      const jhargramSankrail = data.features.find((f) => f.name === "Sankrail" && f.districtId === districtByName("Jhargram").id)!;
      await options.filter({ hasText: "Jhargram district" }).click();
      await page.waitForTimeout(400);
      const hash = new URL(page.url()).hash;
      const picked = hash.startsWith("#unit=") ? model.links.get(decodeURIComponent(hash.slice(6)))!.featureId : decodeURIComponent(hash.replace("#feature=", ""));
      assert.equal(picked, jhargramSankrail.id, "the Jhargram block, not the Howrah one");
      assert.match(await crumbs(page), /West Bengal › Jhargram › Sankrail/);
      await context.close();
    });

    it("searches only inside the focused district until the box is unticked", async () => {
      const { page, context } = await openPage(browser, 1440, 900);
      const jhargram = districtByName("Jhargram");
      await page.goto(`${server.baseUrl}/workspace#feature=${jhargram.id}`, { waitUntil: "networkidle" });
      const search = page.locator('[data-testid="map-search"] input[type="search"]');
      await search.fill("howrah");
      assert.match(await page.locator('[data-testid="map-search-results"]').innerText(), /No district or block matches/);
      await page.getByLabel("Only in Jhargram").uncheck();
      await page.locator('[data-testid="map-search-results"] [role="option"]').first().waitFor();
      assert.ok((await page.locator('[data-testid="map-search-results"] [role="option"]').count()) > 0);
      await context.close();
    });

    it("keeps geography, allocation and data quality in separate layers, and boundaries mode draws no block shading at the overview", async () => {
      const { page, context } = await openPage(browser, 1440, 900);
      await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="map-layer"]').waitFor();
      assert.equal(await page.locator("path[data-fid]").count(), layer.shapes.length, "the allocation layer shades every outlined block");
      await page.getByRole("button", { name: "Boundaries" }).click();
      assert.equal(await page.locator("path[data-fid]").count(), 23, "the boundaries layer draws the district outlines alone");
      assert.match(await page.locator('[data-testid="legend-items"]').innerText(), /District/);
      await page.getByRole("button", { name: "Data quality" }).click();
      assert.match(await page.locator('[data-testid="legend-items"]').innerText(), /Provisional name link/);
      await page.getByRole("button", { name: "Allocation status" }).click();
      assert.match(await page.locator('[data-testid="legend-items"]').innerText(), /Confirmed unallocated/);
      assert.match(await page.locator('[data-testid="legend-items"]').innerText(), /No outline available/);
      await context.close();
    });

    it("shows a district with no block outlines as missing geography, not as an unallocated area", async () => {
      const { page, context } = await openPage(browser, 1440, 900);
      const kolkata = districtByName("Kolkata");
      await page.goto(`${server.baseUrl}/workspace#feature=${kolkata.id}`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="map-district-coverage"]').waitFor();
      const text = await page.locator('[data-testid="map-district-coverage"]').innerText();
      assert.match(text, /No block outlines/);
      assert.match(text, /wards are not in the data/);
      assert.equal(await page.locator('path[data-fid^="GB-"]').count(), 0, "nothing is invented for Kolkata");
      await context.close();
    });

    it("collapses the details panel to give the map the full width, and opens it again", async () => {
      const { page, context } = await openPage(browser, 1440, 900);
      await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
      const width = async () => (await page.locator('[data-testid="geo-map"]').boundingBox())!.width;
      const open = await width();
      assert.equal(await page.locator('[data-testid="district-rail"]').isVisible(), false, "with the panel open there is no room for the rail");
      await page.locator('[data-testid="details-toggle"]').click();
      assert.equal(await page.locator('[data-testid="details-panel"]').isVisible(), false);
      // The freed width (the panel and its gap, 504 px) is shared by the map and the district rail that appears (256 px).
      assert.equal(await page.locator('[data-testid="district-rail"]').isVisible(), true, "the district rail takes the room");
      assert.ok((await width()) > open + 200, "and the map still gains width");
      await page.locator('[data-testid="details-toggle"]').click();
      assert.equal(await page.locator('[data-testid="details-panel"]').isVisible(), true);
      await context.close();
    });

    it("is usable on a phone: the map fits, names show, a district opens, and the details panel opens below it", async () => {
      const { page, context } = await openPage(browser, 390, 844);
      await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="map-labels"]').waitFor();
      await settle(page);
      const map = (await page.locator('[data-testid="geo-map"]').boundingBox())!;
      assert.ok(map.width >= 340 && map.height >= 380, `map ${map.width} x ${map.height}`);
      const named = await page.locator('[data-label-kind="district"]').count();
      const dotted = await page.locator("[data-hidden-label]").count();
      assert.equal(named + dotted, 23, "every district is named or marked");
      assert.ok(named >= 15, `${named} names at phone width`);
      const controls = (await page.locator('[data-testid="map-controls"]').boundingBox())!;
      assert.ok(controls.x >= map.x && controls.x + controls.width <= map.x + map.width);
      await clickShape(page, districtByName("Bankura").id);
      await page.locator('[data-testid="details-district"]').waitFor();
      await settle(page);
      assert.equal(await page.locator('[data-testid="geo-map"]').getAttribute("data-level"), "district");
      await page.getByRole("button", { name: "Details ↓" }).click();
      await page.waitForTimeout(600);
      assert.equal(await page.locator('[data-testid="details-panel"]').isVisible(), true);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `overflows by ${overflow}px`);
      await context.close();
    });
  });

  it("selects from the list without the map, with search, filters and counts", async () => {
    const { page, context } = await openPage(browser);
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    assert.match(await page.locator('[data-testid="area-count"]').innerText(), /Showing 358 of 358/);
    await page.getByRole("searchbox").fill("nandakumar");
    assert.match(await page.locator('[data-testid="area-count"]').innerText(), /Showing 1 of 358/);
    await page.locator("[data-area-id]").first().click();
    assert.equal(await page.locator('[data-testid="details-unit"]').getAttribute("data-unit-id"), unitByLabel("Nandakumar").id);
    await page.getByRole("button", { name: "Reset filters" }).click();
    await page.getByLabel("Filter by boundary availability").selectOption("without");
    await expectCount(page, "[data-area-id]", model.summary.links.rowsWithoutBoundary);
    await page.getByLabel("Filter by allocation state").selectOption("conflicting");
    await page.getByLabel("Filter by boundary availability").selectOption("any");
    await expectCount(page, "[data-area-id]", model.summary.units.byState.conflicting);
    await page.getByRole("button", { name: "Blocks (345)", exact: true }).click();
    await page.getByLabel("Filter by allocation state").selectOption("missing");
    await expectCount(page, "[data-area-id]", model.summary.blocks.byState.missing);
    await context.close();
  });

  it("shows a row without a boundary as an unavailable area, not as an invented shape", async () => {
    const { page, context } = await openPage(browser);
    const asansol = unitByLabel("Asansol");
    await page.goto(`${server.baseUrl}/workspace#unit=${asansol.id}`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="details-unit"]').waitFor();
    assert.match(await page.locator('[data-testid="details-unit"]').innerText(), /No official block or district is a plausible match/);
    assert.match(await page.locator('[data-testid="map-gap-notice"]').innerText(), /has no boundary on this map/);
    assert.equal(await page.locator('path[data-highlight="focus"]').count(), 0);
    assert.match(await page.locator('[data-testid="link-chip"]').innerText(), /no candidate/i);
    await context.close();
  });

  it("shows two rows that share an official block as conflicting, never picking one", async () => {
    const { page, context } = await openPage(browser);
    const first = data.units.filter((u) => u.blockLabel.trim() === "Jangipara");
    assert.equal(first.length, 2);
    await page.goto(`${server.baseUrl}/workspace#unit=${first[0].id}`, { waitUntil: "networkidle" });
    const details = page.locator('[data-testid="details-unit"]');
    await details.waitFor();
    assert.match(await details.innerText(), /Conflicting data/);
    assert.match(await details.innerText(), /is also listed by/);
    const feature = model.links.get(first[0].id)!.featureId!;
    assert.equal(await page.locator(`path[data-fid="${feature}"]`).getAttribute("data-state"), "conflicting");
    await context.close();
  });

  it("shows an official block that no row lists as missing / unverified, and says that is not unallocated", async () => {
    const { page, context } = await openPage(browser);
    const gorubathan = data.features.find((f) => f.name === "Gorubathan")!;
    await page.goto(`${server.baseUrl}/workspace#feature=${gorubathan.id}`, { waitUntil: "networkidle" });
    const details = page.locator('[data-testid="details-feature"]');
    await details.waitFor();
    const text = await details.innerText();
    assert.match(text, /Missing \/ unverified/);
    assert.match(text, /does not mean it is unallocated/);
    await context.close();
  });

  it("keeps a sales territory out of geography: its view is a set of linked outlines", async () => {
    const { page, context } = await openPage(browser);
    await page.goto(`${server.baseUrl}/workspace#territory=ST-06`, { waitUntil: "networkidle" });
    const details = page.locator('[data-testid="details-territory"]');
    await details.waitFor();
    assert.match(await details.innerText(), /not an administrative district/);
    const expected = data.salesTerritories[5].unitIds.filter((id) => {
      const f = model.links.get(id)!.featureId;
      return f && data.features.find((x) => x.id === f)?.boundary;
    }).length;
    assert.ok(expected > 0);
    assert.equal(await page.locator('path[data-highlight="member"]').count(), expected);
    await context.close();
  });

  describe("allocation forms", () => {
    it("assign, vacate and clear slots; changes persist across reload and never touch the data", async () => {
      const { page, context } = await openPage(browser);
      const unit = unitByLabel("Nandakumar");
      await page.goto(`${server.baseUrl}/workspace#unit=${unit.id}`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="disclosure-staff"] summary').click();
      const form = page.locator('[data-testid="staff-form"]');
      await form.getByLabel("Role").selectOption("PRIMARY");
      await form.getByLabel("Slot", { exact: true }).selectOption("1");
      await form.getByLabel("Name", { exact: true }).fill("Test Person One");
      await form.getByLabel("Reason").fill("Covering a leave");
      await form.getByLabel("Recorded by").fill("Test reviewer");
      await form.getByRole("button", { name: "Save change" }).click();
      await page.getByText("Saved: Primary slot 1 assigned.").waitFor();
      assert.equal(await page.locator('[data-testid="local-change-count"]').innerText(), "1");
      assert.match(await page.locator('[data-testid="staff-table"]').innerText(), /Test Person One/);

      // Blank is not vacant: mark vacant explicitly, then clear.
      await form.getByLabel("Slot", { exact: true }).selectOption("2");
      await form.getByLabel("Mark vacant").check();
      await form.getByLabel("Reason").fill("Position not filled");
      await form.getByRole("button", { name: "Save change" }).click();
      await page.getByText("Saved: Primary slot 2 marked vacant.").waitFor();
      assert.match(await page.locator('[data-testid="staff-table"]').innerText(), /Vacant \(as written\)/);

      await page.reload({ waitUntil: "networkidle" });
      assert.equal(await page.locator('[data-testid="local-change-count"]').innerText(), "2");
      assert.match(await page.locator('[data-testid="staff-table"]').innerText(), /Test Person One/);

      // The source of the data is unchanged.
      const fresh = await dataset();
      assert.deepEqual(fresh.units.find((u) => u.id === unit.id), unit);

      await page.getByRole("button", { name: "Reset…" }).click();
      await page.getByRole("button", { name: "Confirm: remove all" }).click();
      assert.equal(await page.locator('[data-testid="local-change-count"]').innerText(), "0");
      assert.doesNotMatch(await page.locator('[data-testid="staff-table"]').innerText(), /Test Person One/);
      await context.close();
    });

    it("rejects an incomplete form and says why", async () => {
      const { page, context } = await openPage(browser);
      await page.goto(`${server.baseUrl}/workspace#unit=${unitByLabel("Nandakumar").id}`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="disclosure-staff"] summary').click();
      const form = page.locator('[data-testid="staff-form"]');
      await form.getByRole("button", { name: "Save change" }).click();
      const alert = form.getByRole("alert");
      await alert.waitFor();
      const text = await alert.innerText();
      assert.match(text, /Recorded by is required/);
      assert.match(text, /Reason is required/);
      assert.match(text, /At least one name is required/);
      assert.equal(await page.locator('[data-testid="local-change-count"]').innerText(), "0");
      await form.getByLabel("Name", { exact: true }).fill("Vacant");
      await form.getByLabel("Reason").fill("x");
      await form.getByLabel("Recorded by").fill("t");
      await form.getByRole("button", { name: "Save change" }).click();
      assert.match(await form.getByRole("alert").innerText(), /Use "Mark vacant"/);
      await context.close();
    });

    it("confirmed unallocated is explicit: staff present means conflicting, none present means confirmed", async () => {
      const { page, context } = await openPage(browser);
      const asmOnly = data.units.find(
        (u) => u.slots.length === 1 && u.slots[0].role === "ASM" && u.slots[0].names.length === 1 && model.unitAllocation.get(u.id)!.state === "allocated",
      )!;
      await page.goto(`${server.baseUrl}/workspace#unit=${asmOnly.id}`, { waitUntil: "networkidle" });
      const details = page.locator('[data-testid="details-unit"]');
      const stateChip = details.locator("header [data-state]").first();
      assert.equal(await stateChip.getAttribute("data-state"), model.unitAllocation.get(asmOnly.id)!.state);

      await page.locator('[data-testid="disclosure-unallocated"] summary').click();
      const form = page.locator('[data-testid="unallocated-form"]');
      assert.match(await form.innerText(), /named person is listed/);
      await form.getByLabel("Evidence").fill("Reported uncovered after a visit");
      await form.getByLabel("Recorded by").fill("Test reviewer");
      await form.getByRole("button", { name: "Record confirmation" }).click();
      await page.getByText("Confirmation recorded.").waitFor();
      assert.equal(await stateChip.getAttribute("data-state"), "conflicting");
      assert.match(await details.innerText(), /confirmed-unallocated record exists, but named staff/);

      // Clear the only named slot: now nothing contradicts the confirmation.
      await page.locator('[data-testid="disclosure-staff"] summary').click();
      const staff = page.locator('[data-testid="staff-form"]');
      await staff.getByLabel("Role").selectOption("ASM");
      await staff.getByLabel("Clear slot (blank)").check();
      await staff.getByLabel("Reason").fill("Removing the only listed person");
      await staff.getByLabel("Recorded by").fill("Test reviewer");
      await staff.getByRole("button", { name: "Save change" }).click();
      await page.getByText("Saved: ASM slot 1 cleared.").waitFor();
      assert.equal(await stateChip.getAttribute("data-state"), "confirmed_unallocated");
      await context.close();
    });

    it("a reviewer can resolve an ambiguous row, and the outline becomes a reviewed link", async () => {
      const { page, context } = await openPage(browser);
      const sankrail = data.units.filter((u) => u.blockLabel.trim() === "Sankrail");
      const row = sankrail[1]; // the row listed under Howrah
      const howrah = data.features.find((f) => f.name === "Sankrail" && f.districtId === data.features.find((d) => d.name === "Howrah")!.id)!;
      await page.goto(`${server.baseUrl}/workspace#unit=${row.id}`, { waitUntil: "networkidle" });
      assert.match(await page.locator('[data-testid="link-chip"]').innerText(), /ambiguous/i);
      await page.locator('[data-testid="disclosure-review"] summary').click();
      const form = page.locator('[data-testid="link-review-form"]');
      await form.getByLabel("Official unit", { exact: true }).selectOption(howrah.id);
      await form.getByLabel("Note").fill("Row sits under Howrah in the workbook");
      await form.getByLabel("Recorded by").fill("Test reviewer");
      await form.getByRole("button", { name: "Save review" }).click();
      await page.getByText("Saved: link confirmed.").waitFor();
      assert.match(await page.locator('[data-testid="link-chip"]').innerText(), /reviewed link/i);
      assert.ok(await page.locator(`path[data-highlight="focus"]`).count() > 0, "the confirmed block is now the focus");
      await context.close();
    });
  });

  it("stays useful when the boundary layer is unavailable", async () => {
    const { page, context } = await openPage(browser);
    await page.route("**/geo/boundaries.json", (route) => route.abort());
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="map-empty-state"]').waitFor();
    assert.match(await page.locator('[data-testid="map-empty-state"]').innerText(), /No boundary layer available/);
    assert.equal(await page.locator("path[data-fid]").count(), 0, "nothing is drawn");
    assert.match(await page.locator('[data-testid="area-count"]').innerText(), /Showing 358 of 358.*boundary layer not loaded/);
    await page.getByRole("searchbox").fill("jangipara");
    await page.locator("[data-area-id]").first().click();
    assert.match(await page.locator('[data-testid="details-unit"]').innerText(), /The boundary layer is not loaded/);
    await page.locator('[data-testid="disclosure-staff"] summary').click();
    assert.equal(await page.locator('[data-testid="staff-form"]').isVisible(), true);
    await context.close();
  });

  it("refuses a boundary file that fails validation instead of drawing it", async () => {
    const { page, context } = await openPage(browser);
    await page.route("**/geo/boundaries.json", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ shapes: [{ featureId: "GB-1", d: "M0 0", bbox: [0, 0, 1, 1] }] }) }),
    );
    await page.goto(`${server.baseUrl}/workspace`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="map-empty-state"]').waitFor();
    assert.match(await page.locator('[data-testid="map-empty-state"]').innerText(), /was refused/);
    await context.close();
  });

  it("has no serious accessibility violations on the overview or the workspace", async () => {
    const { page, context } = await openPage(browser);
    for (const route of ["/", "/workspace", `/workspace#unit=${unitByLabel("Nandakumar").id}`]) {
      await page.goto(`${server.baseUrl}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      if (route.includes("#unit")) {
        await page.locator('[data-testid="disclosure-staff"] summary').click();
        await page.locator('[data-testid="disclosure-unallocated"] summary').click();
        await page.locator('[data-testid="disclosure-review"] summary').click();
      }
      const violations = await runAxe(page);
      const serious = violations.filter((v: { impact: string }) => v.impact === "serious" || v.impact === "critical");
      assert.deepEqual(serious, [], `${route}: ${JSON.stringify(violations)}`);
    }
    await context.close();
  });

  it("does not overflow horizontally on a phone", async () => {
    const { page, context } = await openPage(browser, 390, 844);
    for (const route of ["/", "/workspace"]) {
      await page.goto(`${server.baseUrl}${route}`, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `${route} overflows by ${overflow}px`);
    }
    await context.close();
  });
});

describe("the production build exposes no workbook data as a public asset", { skip: hasBuild ? false : "run `npm run data:build` and `npm run build` first" }, () => {
  it("finds no staff name or layer ID in public/ or .next/static, and no data file in public/", async () => {
    const data = await dataset();
    const meta = (JSON.parse(await readFile(path.join(ROOT, "data", "generated", "boundaries.json"), "utf8")) as BoundaryLayer).meta;
    const result = checkPublicAssets(ROOT, { names: staffNames(data), layerDatasetId: meta.datasetId });
    assert.deepEqual(result.problems, []);
    assert.ok(result.namesChecked > 200, `${result.namesChecked} names checked`);
    assert.ok(result.assetFilesScanned > 5, `${result.assetFilesScanned} public files scanned`);
  });
});
