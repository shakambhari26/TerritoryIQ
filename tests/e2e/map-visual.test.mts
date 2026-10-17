import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright-core";
import { LEADER_MAX } from "../../src/features/territory/map-layout.ts";
import { dataset, launch, openPage, skipReason, startServer, type Server } from "./harness.mts";

/**
 * Visual regression for the map, as measurements: how much of the map the state fills, that nothing printed on the
 * map overlaps anything else (names, markers, controls, the provisional chip), that no control sits over drawn
 * geography, that the state is not stretched, and that the legend and notices are not clipped, at the sizes of a
 * desktop with the details panel open, a laptop, a portrait tablet and a phone.
 */

// The thresholds sit just under what the second redesign measured (the first redesign measured 579 px and 35% on the
// desktop and 335 px and 21% on the laptop, and the first map 517 px and 28%, 253 px and 11%), so a change that shrinks the
// state or the map fails here. `minState` is the state's own height on screen.
const VIEWPORTS: Array<{ name: string; width: number; height: number; minMapHeight: number; minArea: number; minState: number; minLabels: number }> = [
  { name: "desktop", width: 1440, height: 900, minMapHeight: 590, minArea: 0.37, minState: 540, minLabels: 23 },
  { name: "laptop", width: 1280, height: 720, minMapHeight: 385, minArea: 0.27, minState: 340, minLabels: 21 },
  { name: "tablet", width: 820, height: 1180, minMapHeight: 810, minArea: 0.54, minState: 730, minLabels: 23 },
  { name: "phone", width: 390, height: 844, minMapHeight: 580, minArea: 0.54, minState: 415, minLabels: 23 },
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

/**
 * Every leader line on the map, read from the DOM, and what is wrong with it: a line that crosses another, runs through a
 * name or a marker, passes through another district's dot, or is long. The names on the map are placed so that none of
 * these happens; this measures what was drawn.
 */
async function auditLeaders(page: Page, maxLength: number) {
  return page.evaluate((max) => {
    interface P {
      x: number;
      y: number;
    }
    const lines = [...document.querySelectorAll("[data-leader-line]")].map((el) => {
      const svg = (el as SVGElement).ownerSVGElement!.getBoundingClientRect();
      const n = (name: string) => Number(el.getAttribute(name));
      return { id: el.getAttribute("data-leader-line")!, a: { x: svg.left + n("x1"), y: svg.top + n("y1") }, b: { x: svg.left + n("x2"), y: svg.top + n("y2") } };
    });
    const dots = [...document.querySelectorAll("[data-label-id] circle, [data-hidden-label]")].map((el) => {
      const svg = (el as SVGElement).ownerSVGElement!.getBoundingClientRect();
      const id = el.getAttribute("data-hidden-label") ?? el.closest("[data-label-id]")!.getAttribute("data-label-id")!;
      return { id, x: svg.left + Number(el.getAttribute("cx")), y: svg.top + Number(el.getAttribute("cy")) };
    });
    const boxes = [...document.querySelectorAll("[data-label-id]")].flatMap((g) =>
      [...g.querySelectorAll("text")].map((t) => {
        const r = t.getBoundingClientRect();
        return { id: g.getAttribute("data-label-id")!, x: r.left, y: r.top, r: r.right, b: r.bottom };
      }),
    );
    const markers = [...document.querySelectorAll('[data-testid="representative-pin"], [data-testid="pin-cluster"]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute("data-pin-id") ?? "cluster", x: r.left, y: r.top, r: r.right, b: r.bottom };
    });
    const cross = (a: P, b: P, c: P, d: P) => {
      const side = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
    };
    const near = (p: P, a: P, b: P) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = dx * dx + dy * dy;
      const t = l === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };
    const through = (a: P, b: P, r: { x: number; y: number; r: number; b: number }) => {
      for (let i = 0; i <= 120; i++) {
        const x = a.x + ((b.x - a.x) * i) / 120;
        const y = a.y + ((b.y - a.y) * i) / 120;
        if (x > r.x + 1 && x < r.r - 1 && y > r.y + 1 && y < r.b - 1) return true;
      }
      return false;
    };
    const out = { lines: lines.length, crossing: [] as string[], throughName: [] as string[], throughMarker: [] as string[], throughDot: [] as string[], long: [] as string[] };
    lines.forEach((l, i) => {
      if (Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y) > max) out.long.push(l.id);
      for (const m of lines.slice(i + 1)) if (cross(l.a, l.b, m.a, m.b)) out.crossing.push(`${l.id} / ${m.id}`);
      for (const box of boxes) if (box.id !== l.id && through(l.a, l.b, box)) out.throughName.push(`${l.id} / ${box.id}`);
      // A marker that holds the line's own anchor is the district's own (a pin sits on a block's label point, and a district's
      // can fall under it); the name keeps clear of it all the same.
      const holds = (r: { x: number; y: number; r: number; b: number }, p: P) => p.x >= r.x && p.x <= r.r && p.y >= r.y && p.y <= r.b;
      for (const marker of markers) if (!holds(marker, l.a) && through(l.a, l.b, marker)) out.throughMarker.push(`${l.id} / ${marker.id}`);
      for (const dot of dots) if (dot.id !== l.id && near(dot, l.a, l.b) < 3) out.throughDot.push(`${l.id} / ${dot.id}`);
    });
    return out;
  }, maxLength);
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
      assert.ok(m.state.h >= v.minState, `the state is ${m.state.h.toFixed(0)} px tall; it should be at least ${v.minState}`);
      assert.ok(m.insideMap, "the whole state is on the map");
      assert.ok(Math.abs(m.aspectScreen / m.aspectWorld - 1) < 0.005, `the state is not stretched (${m.aspectScreen.toFixed(3)} on screen, ${m.aspectWorld.toFixed(3)} in the data)`);

      // Names, markers and furniture.
      assert.ok(m.labels + m.hidden === 23, `every district is named or marked with a dot (${m.labels} + ${m.hidden})`);
      // Measured on the production build: the first three name every district, the laptop's short map leaves two to a dot.
      assert.ok(m.labels >= v.minLabels, `${m.labels} district names are drawn; at least ${v.minLabels} should be`);
      assert.deepEqual(m.labelLabel, [], "names overlap each other");
      assert.deepEqual(m.labelMarker, [], "a name is under a marker");
      assert.deepEqual(m.markerMarker, [], "markers overlap each other");
      assert.deepEqual(m.labelFurniture, [], "a name is under a control or the chip");
      assert.deepEqual(m.markerFurniture, [], "a marker is under a control or the chip");
      assert.deepEqual(m.labelsOutside, [], "a name pokes outside the map");
      assert.ok(m.furnitureInside, "controls and the chip stay inside the map");
      assert.deepEqual(m.under.slice(0, 5), [], "a control or the chip sits over drawn geography");
      assert.ok(m.markers > 0);

      // Leader lines: none crosses another, runs through a name, a marker or another district's dot, or is long.
      const leaders = await auditLeaders(page, LEADER_MAX + 1);
      assert.deepEqual(leaders.crossing, [], "leader lines cross each other");
      assert.deepEqual(leaders.throughName, [], "a leader line runs through a name");
      assert.deepEqual(leaders.throughMarker, [], "a leader line runs through a marker");
      assert.deepEqual(leaders.throughDot, [], "a leader line passes through another district's dot");
      assert.deepEqual(leaders.long, [], "a leader line is long");

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
  it("the first-use hint gives way to a summary after the first map interaction, and the strip and the map do not change size", async () => {
    const { page, context } = await open(1440, 900);
    const sizes = () =>
      page.evaluate(() => {
        const strip = (document.querySelector('[data-testid="map-hint"], [data-testid="map-summary"]') as HTMLElement).parentElement!;
        return { strip: strip.getBoundingClientRect().height, map: document.querySelector('[data-testid="geo-map"]')!.getBoundingClientRect().height };
      });
    assert.equal(await page.locator('[data-testid="map-hint"]').count(), 1, "the hint shows on first load");
    assert.equal(await page.locator('[data-testid="map-summary"]').count(), 0);
    const before = await sizes();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-testid="map-hint"]').count(), 0, "the hint is gone once the map has been used");
    const summary = await page.locator('[data-testid="map-summary"]').innerText();
    assert.match(summary, /West Bengal: \d+ of 345 blocks in the reference list and \d+ of 23 districts have provisional outlines/);
    const after = await sizes();
    assert.ok(Math.abs(after.strip - before.strip) < 1, `the strip keeps its height (${before.strip} -> ${after.strip})`);
    assert.ok(Math.abs(after.map - before.map) < 1, `so the map does not resize (${before.map} -> ${after.map})`);
    await context.close();
  });

  it("a click on the map or a pan by key also retires the hint", async () => {
    for (const how of ["click", "key"] as const) {
      const { page, context } = await open(1440, 900);
      assert.equal(await page.locator('[data-testid="map-hint"]').count(), 1);
      if (how === "click") {
        const box = (await page.locator('[data-testid="geo-map"]').boundingBox())!;
        await page.mouse.click(box.x + 60, box.y + box.height / 2);
      } else {
        await page.locator('[data-testid="geo-map"]').focus();
        await page.keyboard.press("ArrowLeft");
      }
      await page.waitForTimeout(400);
      assert.equal(await page.locator('[data-testid="map-hint"]').count(), 0, `after a ${how}`);
      assert.equal(await page.locator('[data-testid="map-summary"]').count(), 1);
      await context.close();
    }
  });

  it("the compact Representatives and Details controls keep their names, tooltips and a visible keyboard focus", async () => {
    for (const [w, h] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      const { page, context } = await open(w, h);
      const reps = page.getByRole("button", { name: /^Representatives\s*\d+$/ });
      assert.equal(await reps.count(), 1, `${w}: one button named Representatives with its count`);
      const details = page.getByRole("button", { name: /^(Hide|Show) details$/ });
      assert.equal(await details.count(), 1, `${w}: the details toggle keeps its name`);
      const box = (await reps.boundingBox())!;
      assert.ok(box.width < 100, `${w}: the control is compact (${box.width.toFixed(0)} px), so the name is not visible text`);
      assert.match((await reps.getAttribute("title")) ?? "", /representative pins/i, `${w}: it has a tooltip`);
      assert.match((await details.getAttribute("title")) ?? "", /details panel/i);

      // Reach each from the keyboard, the way a keyboard user does, and read the focus ring the browser draws.
      for (const [before, key, target, label] of [
        [page.getByRole("button", { name: "Data quality", exact: true }), "Tab", "pins-toggle", "Representatives"],
        // The map is the next stop after the toolbar, so Shift+Tab from it lands on the last toolbar control.
        [page.locator('[data-testid="geo-map"]'), "Shift+Tab", "details-toggle", "details"],
      ] as const) {
        await before.focus();
        await page.keyboard.press(key);
        const ring = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return { id: el.getAttribute("data-testid"), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), offset: parseFloat(cs.outlineOffset), left: r.left, right: r.right, top: r.top, w: innerWidth };
        });
        assert.equal(ring.id, target, `${w}: Tab reaches ${label}`);
        assert.notEqual(ring.style, "none");
        assert.ok(ring.width >= 2, `${w}: ${label} shows a ${ring.width}px focus ring`);
        assert.ok(ring.left - ring.offset - ring.width >= 0 && ring.right + ring.offset + ring.width <= ring.w, `${w}: the ring is not cut off by the page edge`);
      }
      await context.close();
    }
  });

  it("a pin is a small orange teardrop and a group is a neutral stacked card: different shape, size and hue, both with a 24 px target", async () => {
    for (const [w, h] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      const { page, context } = await open(w, h);
      const pins = await page.locator('[data-testid="representative-pin"]').evaluateAll((els) =>
        els.map((el) => {
          const box = el.getBoundingClientRect();
          const glyph = el.querySelector("svg")!.getBoundingClientRect();
          return { w: box.width, h: box.height, glyphW: glyph.width, glyphH: glyph.height, text: el.textContent?.trim() ?? "" };
        }),
      );
      const groups = await page.locator('[data-testid="pin-cluster"]').evaluateAll((els) =>
        els.map((el) => {
          const box = el.getBoundingClientRect();
          // Every colour the badge draws (fills and borders), as the browser resolves them.
          const colours = [...el.querySelectorAll("*")].flatMap((n) => {
            const cs = getComputedStyle(n);
            return [cs.backgroundColor, cs.borderTopColor, cs.color];
          });
          return { w: box.width, h: box.height, colours, label: el.textContent?.trim() };
        }),
      );
      assert.ok(pins.length > 0 && groups.length > 0, `${w}: the overview has single pins and groups`);
      for (const p of pins) {
        assert.ok(p.w >= 23.99 && p.h >= 23.99, `${w}: a pin keeps a 24 px target (${p.w} x ${p.h})`);
        assert.ok(p.glyphW <= 16 && p.glyphH <= 21, `${w}: the drawn pin is small (${p.glyphW} x ${p.glyphH}), where the old tag was 38 x 27`);
        assert.equal(p.text, "", `${w}: a pin carries no text`);
      }
      const ember = "rgb(232, 98, 42)";
      for (const g of groups) {
        assert.ok(g.w >= 23.99 && g.h >= 23.99, `${w}: a group keeps a 24 px target`);
        assert.ok(!g.colours.includes(ember), `${w}: a group badge uses no Molten Orange, which means one representative or the selection`);
        assert.match(g.label ?? "", /^\d+$/, `${w}: the badge is its count`);
        assert.ok(g.w !== pins[0].w || g.h !== pins[0].h, `${w}: and it is not the pin's size`);
      }
      await context.close();
    }
  });

  it("nothing calls the block total official, and the reference-list caveat is on the map, the details panel and the overview", async () => {
    const { page, context } = await open(1440, 900);
    await page.locator('[data-testid="map-about-toggle"]').click();
    const text = await page.locator("body").innerText();
    assert.equal(/official blocks?/i.test(text.replace(/Official block · LGD code/g, "")), false, "no 'official blocks' wording on the workspace");
    assert.match(await page.locator('[data-testid="map-reference-note"]').innerText(), /not been independently verified as the complete official total/);
    assert.match(text, /blocks in the reference list and \d+ districts have provisional outlines/);
    assert.match(text, /The block total has not been independently verified as the official total/);
    assert.match(await page.getByRole("button", { name: "Blocks (345)", exact: true }).innerText(), /Blocks \(345\)/);
    await page.goto(`${server.baseUrl}/`, { waitUntil: "networkidle" });
    const overview = await page.locator("body").innerText();
    assert.equal(/official blocks?/i.test(overview), false, "no 'official blocks' wording on the overview");
    assert.match(await page.locator('[data-testid="reference-list-note"]').innerText(), /not been independently verified as the complete official total/);
    assert.match(await page.locator('[data-testid="kpi-outlined"]').innerText(), /blocks in the current reference list/);
    await context.close();
  });
});
