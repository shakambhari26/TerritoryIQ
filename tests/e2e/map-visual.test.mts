import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright-core";
import { dataset, launch, openPage, skipReason, startServer, type Server } from "./harness.mts";

/**
 * Visual regression for the map, as measurements: how much of the map the state fills, that nothing printed on the
 * map overlaps anything else (names, markers, controls, the provisional chip), that no control sits over drawn
 * geography, that the state is not stretched, and that the legend and notices are not clipped, at the sizes of a
 * desktop with the details panel open, a laptop, a portrait tablet and a phone.
 */

// The thresholds sit just under what the redesign measured (and well over the old map: 517 px and 28% on the desktop,
// 253 px and 11% on the laptop), so a change that shrinks the state or the map fails here.
const VIEWPORTS: Array<{ name: string; width: number; height: number; minMapHeight: number; minArea: number }> = [
  { name: "desktop", width: 1440, height: 900, minMapHeight: 560, minArea: 0.34 },
  { name: "laptop", width: 1280, height: 720, minMapHeight: 320, minArea: 0.19 },
  { name: "tablet", width: 820, height: 1180, minMapHeight: 800, minArea: 0.52 },
  { name: "phone", width: 390, height: 844, minMapHeight: 560, minArea: 0.53 },
];

interface R {
  x: number;
  y: number;
  r: number;
  b: number;
}

/** Everything the page measures, read from the DOM in one pass. */
async function measure(page: Page, onlyFid?: string) {
  return page.evaluate((only) => {
    const rect = (el: Element): R & { id: string } => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute("data-label-id") ?? el.getAttribute("data-testid") ?? el.tagName, x: r.left, y: r.top, r: r.right, b: r.bottom };
    };
    const hit = (a: R, b: R) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
    const map = document.querySelector('[data-testid="geo-map"]') as HTMLElement;
    const mr = map.getBoundingClientRect();

    const districts = [...document.querySelectorAll('path[data-fid^="GD-"]')] as SVGGeometryElement[];
    const union = (rects: R[]) => ({ x: Math.min(...rects.map((r) => r.x)), y: Math.min(...rects.map((r) => r.y)), r: Math.max(...rects.map((r) => r.r)), b: Math.max(...rects.map((r) => r.b)) });
    const screen = union(districts.map(rect));
    const boxes = districts.map((p) => p.getBBox());
    const world = {
      x: Math.min(...boxes.map((b) => b.x)),
      y: Math.min(...boxes.map((b) => b.y)),
      r: Math.max(...boxes.map((b) => b.x + b.width)),
      b: Math.max(...boxes.map((b) => b.y + b.height)),
    };

    const labels = [...document.querySelectorAll("[data-label-id]")].map((g) => {
      const t = [...g.querySelectorAll("text")].map((n) => n.getBoundingClientRect());
      return { id: g.getAttribute("data-label-id")!, x: Math.min(...t.map((r) => r.left)), y: Math.min(...t.map((r) => r.top)), r: Math.max(...t.map((r) => r.right)), b: Math.max(...t.map((r) => r.bottom)), leader: g.hasAttribute("data-label-leader") };
    });
    const markers = [...document.querySelectorAll('[data-testid="representative-pin"], [data-testid="pin-cluster"]')].map(rect);
    // The furniture the user can see and press, as drawn.
    const furniture = ["map-controls", "pan-controls", "map-provisional", "map-scale"]
      .map((id) => document.querySelector(`[data-testid="${id}"]`))
      .filter((el): el is Element => !!el)
      .map(rect);

    const pairs = <T extends R>(list: T[]) => list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b] as const));
    const names = (items: ReadonlyArray<readonly [{ id: string }, { id: string }]>) => items.map(([a, b]) => `${a.id} / ${b.id}`);

    // Geography under a control: sample each control and test the sample against the drawn district fills. In a drill-down
    // only the focused district has to be clear: its neighbours are context that runs on past the controls.
    const under: string[] = [];
    const checked = only ? districts.filter((p) => p.getAttribute("data-fid") === only) : districts;
    for (const f of furniture.filter((c) => c.id !== "map-scale")) {
      for (let x = f.x; x <= f.r; x += 6) {
        for (let y = f.y; y <= f.b; y += 6) {
          for (const p of checked) {
            const m = (p as unknown as SVGGraphicsElement).getScreenCTM();
            if (!m) continue;
            const pt = new DOMPoint(x, y).matrixTransform(m.inverse());
            if (p.isPointInFill(pt)) {
              under.push(`${f.id} at ${Math.round(x - mr.left)},${Math.round(y - mr.top)} over ${p.getAttribute("data-fid")}`);
              break;
            }
          }
        }
      }
    }

    const legend = document.querySelector('[data-testid="map-legend"]') as HTMLElement;
    const section = document.querySelector('[data-testid="map-workspace"]')!.getBoundingClientRect();
    const items = [...document.querySelectorAll('[data-testid="legend-items"] li')].map(rect);
    const inMap = (r: R) => r.x >= mr.left - 1 && r.y >= mr.top - 1 && r.r <= mr.right + 1 && r.b <= mr.bottom + 1;

    return {
      map: { w: mr.width, h: mr.height },
      state: { w: screen.r - screen.x, h: screen.b - screen.y },
      area: ((screen.r - screen.x) * (screen.b - screen.y)) / (mr.width * mr.height),
      aspectScreen: (screen.r - screen.x) / (screen.b - screen.y),
      aspectWorld: (world.r - world.x) / (world.b - world.y),
      insideMap: inMap(screen),
      labels: labels.length,
      hidden: document.querySelectorAll("[data-hidden-label]").length,
      labelLabel: names(pairs(labels).filter(([a, b]) => hit(a, b))),
      labelMarker: labels.flatMap((l) => markers.filter((m) => hit(l, m)).map((m) => `${l.id} / ${m.id}`)),
      markerMarker: names(pairs(markers).filter(([a, b]) => hit(a, b))),
      labelFurniture: labels.flatMap((l) => furniture.filter((f) => hit(l, f)).map((f) => `${l.id} / ${f.id}`)),
      markerFurniture: markers.flatMap((m) => furniture.filter((f) => hit(m, f)).map((f) => `${m.id} / ${f.id}`)),
      labelsOutside: labels.filter((l) => !inMap(l)).map((l) => l.id),
      markers: markers.length,
      furnitureInside: furniture.every(inMap),
      under,
      legendClipped: legend.scrollWidth > legend.clientWidth + 1,
      legendItemsInside: items.every((r) => r.x >= section.left - 1 && r.r <= section.right + 1),
      pageScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      grid: document.querySelectorAll('[data-testid="map-graticule"]').length,
      gridPressed: document.querySelector('[data-testid="grid-toggle"]')?.getAttribute("aria-pressed"),
      about: {
        expanded: document.querySelector('[data-testid="map-about-toggle"]')?.getAttribute("aria-expanded"),
        visible: !!document.querySelector('[data-testid="map-coverage"]') && (document.querySelector('[data-testid="map-coverage"]') as HTMLElement).offsetParent !== null,
      },
      chip: document.querySelector('[data-testid="map-provisional"]')?.textContent,
    };
  }, onlyFid);
}

describe("the map's cartography at desktop, laptop, tablet and phone sizes", { skip: skipReason }, () => {
  let server: Server;
  let browser: Browser;
  let data: Awaited<ReturnType<typeof dataset>>;

  before(async () => {
    data = await dataset();
    server = await startServer();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const open = async (width: number, height: number, hash = "") => {
    const opened = await openPage(browser, width, height);
    await opened.page.goto(`${server.baseUrl}/workspace${hash}`, { waitUntil: "networkidle" });
    await opened.page.locator('[data-testid="map-labels"]').waitFor();
    await opened.page.locator('[data-testid="geo-map"]').scrollIntoViewIfNeeded();
    await opened.page.waitForTimeout(900);
    return opened;
  };

  for (const v of VIEWPORTS) {
    it(`${v.name} (${v.width} x ${v.height}): a large, undistorted state, and nothing overlaps or is clipped`, async () => {
      const { page, context, errors, hosts } = await open(v.width, v.height);
      const m = await measure(page);

      // Scale and shape.
      assert.ok(m.map.h >= v.minMapHeight, `the map is ${m.map.h.toFixed(0)} px tall; it should be at least ${v.minMapHeight}`);
      assert.ok(m.area >= v.minArea, `the state covers ${(m.area * 100).toFixed(1)}% of the map; it should cover at least ${v.minArea * 100}%`);
      assert.ok(m.insideMap, "the whole state is on the map");
      assert.ok(Math.abs(m.aspectScreen / m.aspectWorld - 1) < 0.005, `the state is not stretched (${m.aspectScreen.toFixed(3)} on screen, ${m.aspectWorld.toFixed(3)} in the data)`);

      // Names, markers and furniture.
      assert.ok(m.labels + m.hidden === 23, `every district is named or marked with a dot (${m.labels} + ${m.hidden})`);
      assert.deepEqual(m.labelLabel, [], "names overlap each other");
      assert.deepEqual(m.labelMarker, [], "a name is under a marker");
      assert.deepEqual(m.markerMarker, [], "markers overlap each other");
      assert.deepEqual(m.labelFurniture, [], "a name is under a control or the chip");
      assert.deepEqual(m.markerFurniture, [], "a marker is under a control or the chip");
      assert.deepEqual(m.labelsOutside, [], "a name pokes outside the map");
      assert.ok(m.furnitureInside, "controls and the chip stay inside the map");
      assert.deepEqual(m.under.slice(0, 5), [], "a control or the chip sits over drawn geography");
      assert.ok(m.markers > 0);

      // The legend, the notices and the page.
      assert.equal(m.legendClipped, false, "the legend is not clipped");
      assert.equal(m.legendItemsInside, true, "every legend item is inside the frame");
      assert.equal(m.pageScrollsSideways, false, "the page does not scroll sideways");
      assert.match(m.chip ?? "", /Provisional boundaries/, "the provisional chip is on the map");
      assert.equal(m.about.expanded, "false", "the coverage disclosure starts collapsed");
      assert.equal(m.about.visible, false, "and its text is not on screen");
      assert.equal(m.grid, 0, "the grid is hidden by default");
      assert.equal(m.gridPressed, "false", "and its toggle says so");

      assert.deepEqual([...hosts], [new URL(server.baseUrl).host], "no request leaves localhost");
      assert.deepEqual(errors, []);
      await context.close();
    });
  }

  it("a district drill-down is just as clean: names and markers do not overlap each other, the controls or the selected outline", async () => {
    const district = data.features.find((f) => f.kind === "district" && f.name === "Bankura")!;
    for (const [w, h] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      const { page, context } = await open(w, h, `#feature=${encodeURIComponent(district.id)}`);
      await page.locator('path[data-highlight="focus"]').waitFor();
      await page.waitForTimeout(700);
      const m = await measure(page, district.id);
      assert.deepEqual(m.labelLabel, [], `${w}: names overlap`);
      assert.deepEqual(m.labelMarker, [], `${w}: a name is under a marker`);
      assert.deepEqual(m.markerMarker, [], `${w}: markers overlap`);
      assert.deepEqual(m.labelFurniture, [], `${w}: a name is under a control`);
      assert.deepEqual(m.markerFurniture, [], `${w}: a marker is under a control`);
      assert.deepEqual(m.under.slice(0, 5), [], `${w}: a control sits over the focused district`);
      assert.equal(m.pageScrollsSideways, false);

      // No name covers the selected outline: sample the orange line and test each name's box.
      const covered = await page.evaluate(() => {
        const line = document.querySelector('path[data-highlight="focus"]') as SVGGeometryElement;
        const matrix = line.getScreenCTM()!;
        const total = line.getTotalLength();
        const points: Array<[number, number]> = [];
        for (let at = 0; at < total; at += total / 400) {
          const p = line.getPointAtLength(at).matrixTransform(matrix);
          points.push([p.x, p.y]);
        }
        const out: string[] = [];
        for (const g of document.querySelectorAll("[data-label-id]")) {
          for (const t of g.querySelectorAll("text")) {
            const r = t.getBoundingClientRect();
            // The text is drawn with a halo; the boxes the placer kept clear are a little larger than the glyphs.
            if (points.some(([x, y]) => x > r.left + 1 && x < r.right - 1 && y > r.top + 1 && y < r.bottom - 1)) out.push(g.getAttribute("data-label-id")!);
          }
        }
        return out;
      });
      assert.deepEqual(covered, [], `${w}: a name is drawn over the selected outline`);
      await context.close();
    }
  });

  it("the disclosure opens and closes from the keyboard, and the legend keeps its attribution when it is closed", async () => {
    const { page, context } = await open(1440, 900);
    const toggle = page.locator('[data-testid="map-about-toggle"]');
    assert.match(await page.locator('[data-testid="map-legend"]').innerText(), /OpenStreetMap contributors/);
    await toggle.focus();
    await page.keyboard.press("Enter");
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator('[data-testid="map-coverage"]').isVisible(), true);
    assert.match(await page.locator('[data-testid="map-coverage"]').innerText(), /Coverage is not complete/);
    await page.keyboard.press("Space");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator('[data-testid="map-coverage"]').isVisible(), false);
    assert.match(await page.locator('[data-testid="map-legend"]').innerText(), /OpenStreetMap contributors/, "still attributed");
    await context.close();
  });
});
