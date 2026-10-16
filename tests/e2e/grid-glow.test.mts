import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { Browser } from "playwright-core";
import { buildModel } from "../../src/features/territory/model.ts";
import { blockPins, type PinAnchor } from "../../src/features/territory/representatives.ts";
import type { BoundaryLayer } from "../../src/features/territory/types.ts";
import { dataset, launch, openPage, runAxe, skipReason, startServer, type Server } from "./harness.mts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GRID = '[data-testid="map-graticule"]';
const TOGGLE = '[data-testid="grid-toggle"]';

describe("coordinate grid toggle and selection glow in a real browser", { skip: skipReason }, () => {
  let server: Server;
  let browser: Browser;
  let data: Awaited<ReturnType<typeof dataset>>;
  let district: string;

  before(async () => {
    data = await dataset();
    const layer = JSON.parse(await readFile(path.join(ROOT, "data", "generated", "boundaries.json"), "utf8")) as BoundaryLayer;
    const model = buildModel(data, []);
    const anchors = new Map<string, PinAnchor>(layer.shapes.filter((s) => s.anchor && !s.featureId.startsWith("GD-")).map((s) => [s.featureId, s.anchor!]));
    district = data.features.find((f) => f.kind === "district" && blockPins(model, anchors, (id) => model.featureById.get(id)?.districtId === f.id).length > 1)!.id;
    server = await startServer();
    browser = await launch();
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const open = async (width = 1440, height = 1000, hash = "") => {
    const opened = await openPage(browser, width, height);
    await opened.page.goto(`${server.baseUrl}/workspace${hash}`, { waitUntil: "networkidle" });
    await opened.page.locator('[data-testid="map-svg"]').waitFor();
    await opened.page.waitForTimeout(600);
    return opened;
  };

  it("the grid is off by default and the toggle says so", async () => {
    const { page, context, errors } = await open();
    assert.equal(await page.locator(GRID).count(), 0, "no grid is drawn until asked for");
    const toggle = page.locator(TOGGLE);
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    assert.equal(await toggle.getAttribute("aria-label"), "Coordinate grid");
    assert.equal(await toggle.evaluate((el) => el.tagName), "BUTTON");
    assert.ok((await page.locator('[data-testid="map-controls"]').locator(TOGGLE).count()) === 1, "it sits with the other map controls");
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("clicking the toggle shows lines and degree labels; clicking again hides them", async () => {
    const { page, context } = await open();
    await page.locator(TOGGLE).click();
    await page.locator(GRID).waitFor();
    assert.equal(await page.locator(TOGGLE).getAttribute("aria-pressed"), "true");
    assert.ok((await page.locator(`${GRID} line`).count()) >= 2, "meridians and parallels are drawn");
    assert.match(await page.locator(GRID).innerHTML(), /°[NE]/, "lines carry degree labels");
    await page.locator(TOGGLE).click();
    await page.locator(GRID).waitFor({ state: "detached" });
    assert.equal(await page.locator(TOGGLE).getAttribute("aria-pressed"), "false");
    await context.close();
  });

  it("keyboard: Enter and Space on the focused button, and G on the map, all toggle it", async () => {
    const { page, context } = await open();
    await page.locator(TOGGLE).focus();
    await page.keyboard.press("Enter");
    await page.locator(GRID).waitFor();
    await page.keyboard.press("Space");
    await page.locator(GRID).waitFor({ state: "detached" });
    await page.locator('[data-testid="geo-map"]').focus();
    await page.keyboard.press("g");
    await page.locator(GRID).waitFor();
    assert.equal(await page.locator(TOGGLE).getAttribute("aria-pressed"), "true");
    await page.keyboard.press("G");
    await page.locator(GRID).waitFor({ state: "detached" });
    // The toggle is reachable by Tab from the control just before it (Reset view).
    await page.locator('[aria-label="Reset view"]').focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "grid-toggle");
    await context.close();
  });

  /** Records every keydown after the app has handled it, so the test can see whether the app prevented the browser's default. */
  const recordKeys = (page: import("playwright-core").Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __keys: Array<{ key: string; prevented: boolean }> };
      w.__keys = [];
      window.addEventListener("keydown", (e) => w.__keys.push({ key: e.key, prevented: e.defaultPrevented }));
    });
  const lastKey = (page: import("playwright-core").Page) =>
    page.evaluate(() => {
      const keys = (window as unknown as { __keys: Array<{ key: string; prevented: boolean }> }).__keys;
      return keys[keys.length - 1];
    });
  const scaleOf = async (page: import("playwright-core").Page) => Number(await page.locator('[data-testid="map-layer"]').getAttribute("data-scale"));

  it("Ctrl, Cmd and Alt with G leave the browser's shortcut alone: the grid does not toggle and the key is not prevented", async () => {
    const { page, context } = await open();
    await page.locator('[data-testid="geo-map"]').focus();
    await recordKeys(page);
    for (const chord of ["Control+g", "Control+G", "Meta+g", "Meta+G", "Alt+g"]) {
      await page.keyboard.press(chord);
      assert.equal(await page.locator(GRID).count(), 0, `${chord} did not show the grid`);
      assert.equal((await lastKey(page)).prevented, false, `${chord} was not default-prevented`);
    }
    // Plain g and Shift+G still toggle, and are still the map's (prevented).
    await page.keyboard.press("g");
    await page.locator(GRID).waitFor();
    assert.equal((await lastKey(page)).prevented, true);
    await page.keyboard.press("Shift+G");
    await page.locator(GRID).waitFor({ state: "detached" });
    assert.equal((await lastKey(page)).key, "G");
    assert.equal((await lastKey(page)).prevented, true);
    await context.close();
  });

  it("Ctrl and Cmd with + - 0 are the browser's page zoom: the map does not move and the key is not prevented; plain and Shift keys still work", async () => {
    const { page, context } = await open();
    await page.locator('[data-testid="geo-map"]').focus();
    await recordKeys(page);
    const start = await scaleOf(page);
    for (const chord of ["Control+=", "Control+-", "Control+0", "Meta+=", "Meta+-", "Meta+0", "Alt+="]) {
      await page.keyboard.press(chord);
      assert.equal(await scaleOf(page), start, `${chord} did not move the map`);
      assert.equal((await lastKey(page)).prevented, false, `${chord} was not default-prevented`);
    }
    // Plain +, then Shift+= (which types +) zoom in; Shift+- (which types _) zooms out; 0 fits the state again.
    await page.keyboard.press("+");
    const zoomed = await scaleOf(page);
    assert.ok(zoomed > start, "+ zooms in");
    assert.equal((await lastKey(page)).prevented, true);
    await page.keyboard.press("Shift+Equal");
    assert.equal((await lastKey(page)).key, "+");
    assert.ok((await scaleOf(page)) > zoomed, "Shift with = (+) zooms in");
    const beforeOut = await scaleOf(page);
    await page.keyboard.press("Shift+Minus");
    assert.equal((await lastKey(page)).key, "_");
    assert.ok((await scaleOf(page)) < beforeOut, "Shift with - (_) zooms out");
    await page.keyboard.press("-");
    await page.keyboard.press("0");
    await page.waitForTimeout(500);
    assert.equal(await scaleOf(page), start, "0 fits the state again");
    await context.close();
  });

  it("every single-key shortcut ignores Ctrl, Cmd and Alt: nothing toggles, zooms or fits, and no key is default-prevented", async () => {
    const { page, context } = await open();
    await page.locator('[data-testid="geo-map"]').focus();
    await recordKeys(page);
    // Zoom in a step first, so a "0" (fit the state) would visibly move the map if the guard failed.
    await page.keyboard.press("+");
    const start = await scaleOf(page);
    // With a modifier held, Chrome may report a Shift-typed key in its base form (Ctrl+Shift+G as "g", Ctrl+Shift+= as "="),
    // so each shortcut lists every form it may arrive as. The guard covers all of them; what is asserted is the behaviour.
    const shortcuts = [
      { chord: "g", keys: ["g"] },
      { chord: "Shift+g", keys: ["G", "g"] },
      { chord: "0", keys: ["0"] },
      { chord: "Equal", keys: ["="] },
      { chord: "Shift+Equal", keys: ["+", "="] },
      { chord: "Minus", keys: ["-"] },
      { chord: "Shift+Minus", keys: ["_", "-"] },
    ];
    for (const modifier of ["Control", "Meta", "Alt"]) {
      for (const shortcut of shortcuts) {
        const chord = `${modifier}+${shortcut.chord}`;
        await page.keyboard.press(chord);
        const last = await lastKey(page);
        assert.ok(shortcut.keys.includes(last.key), `${chord} reached the page as ${JSON.stringify(last.key)}`);
        assert.equal(last.prevented, false, `${chord} was not default-prevented`);
        assert.equal(await scaleOf(page), start, `${chord} did not zoom or fit the map`);
        assert.equal(await page.locator(GRID).count(), 0, `${chord} did not toggle the grid`);
      }
    }
    assert.equal(await page.locator(TOGGLE).getAttribute("aria-pressed"), "false");
    // The same keys without a modifier still work, and are the map's (prevented).
    await page.keyboard.press("-");
    assert.ok((await scaleOf(page)) < start);
    assert.equal((await lastKey(page)).prevented, true);
    await page.keyboard.press("0");
    await page.keyboard.press("g");
    await page.locator(GRID).waitFor();
    assert.equal((await lastKey(page)).prevented, true);
    await context.close();
  });

  /** The map layer's translation in screen pixels, read from its transform. */
  const translateOf = (page: import("playwright-core").Page) =>
    page.locator('[data-testid="map-layer"]').evaluate((el) => {
      const match = /translate\(\s*(-?[\d.e+-]+)px,\s*(-?[\d.e+-]+)px\s*\)/.exec((el as HTMLElement).style.transform);
      return { x: Number(match![1]), y: Number(match![2]) };
    });

  it("Alt+ArrowLeft and Alt+ArrowRight are the browser's Back and Forward: the map does not pan and the key is not prevented", async () => {
    const { page, context } = await open();
    await page.locator('[data-testid="geo-map"]').focus();
    await recordKeys(page);
    const start = await translateOf(page);
    for (const chord of ["Alt+ArrowLeft", "Alt+ArrowRight"]) {
      await page.keyboard.press(chord);
      await page.waitForTimeout(150);
      const last = await lastKey(page);
      assert.equal(last.key, chord.split("+")[1], `${chord} reached the page`);
      assert.equal(last.prevented, false, `${chord} was not default-prevented`);
      assert.deepEqual(await translateOf(page), start, `${chord} did not pan the map`);
    }
    await context.close();
  });

  it("Ctrl and Cmd with ArrowLeft and ArrowRight keep the native behaviour: the map does not pan and the key is not prevented", async () => {
    const { page, context } = await open();
    await page.locator('[data-testid="geo-map"]').focus();
    await recordKeys(page);
    const start = await translateOf(page);
    for (const chord of ["Control+ArrowLeft", "Control+ArrowRight", "Meta+ArrowLeft", "Meta+ArrowRight", "Control+Shift+ArrowLeft", "Meta+Shift+ArrowRight"]) {
      await page.keyboard.press(chord);
      await page.waitForTimeout(150);
      const last = await lastKey(page);
      assert.equal(last.key, chord.split("+").pop(), `${chord} reached the page`);
      assert.equal(last.prevented, false, `${chord} was not default-prevented`);
      assert.deepEqual(await translateOf(page), start, `${chord} did not pan the map`);
    }
    // Plain and Shift still pan, and are the map's.
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(150);
    assert.ok((await translateOf(page)).x > start.x, "ArrowLeft still pans");
    assert.equal((await lastKey(page)).prevented, true);
    await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(150);
    const back = await translateOf(page);
    assert.ok(Math.abs(back.x - start.x) < 1e-6 && Math.abs(back.y - start.y) < 1e-6, "Shift+ArrowRight pans back by the same step");
    assert.equal((await lastKey(page)).prevented, true);
    await context.close();
  });

  it("AltGraph is text entry: with it held, none of the single-key shortcuts fire and none is default-prevented (synthetic events: this proves the getModifierState path, not a real layout)", async () => {
    const { page, context } = await open();
    await page.locator('[data-testid="geo-map"]').focus();
    await recordKeys(page);
    // Zoom in a step first, so a "0" (fit the state) would visibly move the map if the guard failed.
    await page.keyboard.press("+");
    const start = await scaleOf(page);
    /** Dispatches one keydown on the focused map, as a keyboard would, with the given modifier state. */
    const press = (key: string, init: { altGraph?: boolean; ctrlKey?: boolean; altKey?: boolean }) =>
      page.evaluate(
        ([k, i]) => {
          const el = document.querySelector('[data-testid="geo-map"]')!;
          el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, modifierAltGraph: !!i.altGraph, ctrlKey: !!i.ctrlKey, altKey: !!i.altKey }));
        },
        [key, init] as const,
      );
    const probe = await page.evaluate(() => new KeyboardEvent("keydown", { modifierAltGraph: true }).getModifierState("AltGraph"));
    assert.equal(probe, true, "the browser reports AltGraph through getModifierState for these events");
    const keys = ["g", "G", "0", "=", "+", "-", "_"];
    for (const [label, init] of [
      ["AltGraph only", { altGraph: true }],
      ["AltGraph reported as Ctrl and Alt (Windows)", { altGraph: true, ctrlKey: true, altKey: true }],
    ] as const) {
      for (const key of keys) {
        await press(key, init);
        const last = await lastKey(page);
        assert.equal(last.key, key, `${label}: ${key} reached the page`);
        assert.equal(last.prevented, false, `${label}: ${key} was not default-prevented`);
        assert.equal(await scaleOf(page), start, `${label}: ${key} did not zoom or fit the map`);
        assert.equal(await page.locator(GRID).count(), 0, `${label}: ${key} did not toggle the grid`);
      }
    }
    assert.equal(await page.locator(TOGGLE).getAttribute("aria-pressed"), "false");
    // The same events without AltGraph still work and are the map's (prevented).
    await press("g", {});
    await page.locator(GRID).waitFor();
    assert.equal((await lastKey(page)).prevented, true);
    await press("G", {});
    await page.locator(GRID).waitFor({ state: "detached" });
    await press("-", {});
    assert.ok((await scaleOf(page)) < start, "- zooms out");
    assert.equal((await lastKey(page)).prevented, true);
    await press("=", {});
    assert.ok(Math.abs((await scaleOf(page)) / start - 1) < 1e-9, "= zooms back in by the same step");
    await press("0", {});
    await page.waitForTimeout(500);
    assert.ok((await scaleOf(page)) < start, "0 fits the state, which is further out than the zoomed view");
    assert.equal((await lastKey(page)).prevented, true);
    await context.close();
  });

  it("AltGraph with ArrowLeft or ArrowRight does not pan the map and the key is not prevented (synthetic events: this proves the getModifierState path, not a real layout)", async () => {
    const { page, context } = await open();
    await page.locator('[data-testid="geo-map"]').focus();
    await recordKeys(page);
    const start = await translateOf(page);
    /** Dispatches one keydown on the focused map, as a keyboard would, with the given modifier state. */
    const press = (key: string, init: { altGraph?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }) =>
      page.evaluate(
        ([k, i]) => {
          const el = document.querySelector('[data-testid="geo-map"]')!;
          el.dispatchEvent(
            new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, modifierAltGraph: !!i.altGraph, ctrlKey: !!i.ctrlKey, altKey: !!i.altKey, shiftKey: !!i.shiftKey }),
          );
        },
        [key, init] as const,
      );
    const probe = await page.evaluate(() => new KeyboardEvent("keydown", { modifierAltGraph: true }).getModifierState("AltGraph"));
    assert.equal(probe, true, "the browser reports AltGraph through getModifierState for these events");
    for (const [label, init] of [
      ["AltGraph only", { altGraph: true }],
      ["AltGraph and Shift", { altGraph: true, shiftKey: true }],
      ["AltGraph reported as Ctrl and Alt (Windows)", { altGraph: true, ctrlKey: true, altKey: true }],
    ] as const) {
      for (const key of ["ArrowLeft", "ArrowRight"]) {
        await press(key, init);
        await page.waitForTimeout(150);
        const last = await lastKey(page);
        assert.equal(last.key, key, `${label}: ${key} reached the page`);
        assert.equal(last.prevented, false, `${label}: ${key} was not default-prevented`);
        assert.deepEqual(await translateOf(page), start, `${label}: ${key} did not pan the map`);
      }
    }
    // The same events without AltGraph still pan, and are the map's (prevented).
    await press("ArrowLeft", {});
    await page.waitForTimeout(150);
    assert.ok((await translateOf(page)).x > start.x, "ArrowLeft without AltGraph still pans");
    assert.equal((await lastKey(page)).prevented, true);
    await press("ArrowRight", { shiftKey: true });
    await page.waitForTimeout(150);
    const back = await translateOf(page);
    assert.ok(Math.abs(back.x - start.x) < 1e-6 && Math.abs(back.y - start.y) < 1e-6, "Shift+ArrowRight without AltGraph pans back by the same step");
    assert.equal((await lastKey(page)).prevented, true);
    await context.close();
  });

  it("plain and Shift arrow keys still pan, in the same directions, and are the map's (prevented); Up and Down are unchanged", async () => {
    const { page, context } = await open();
    await page.locator('[data-testid="geo-map"]').focus();
    await recordKeys(page);
    const step = async (chord: string) => {
      const before = await translateOf(page);
      await page.keyboard.press(chord);
      await page.waitForTimeout(150);
      const after = await translateOf(page);
      assert.equal((await lastKey(page)).prevented, true, `${chord} is still handled by the map`);
      return { dx: after.x - before.x, dy: after.y - before.y };
    };
    const left = await step("ArrowLeft");
    assert.ok(left.dx > 0 && left.dy === 0, "ArrowLeft moves the view's content to the right, as before");
    const right = await step("ArrowRight");
    assert.equal(right.dx, -left.dx, "ArrowRight is the exact opposite step");
    assert.equal(right.dy, 0);
    const shiftLeft = await step("Shift+ArrowLeft");
    assert.equal(shiftLeft.dx, left.dx, "Shift+ArrowLeft pans exactly as it did");
    const shiftRight = await step("Shift+ArrowRight");
    assert.equal(shiftRight.dx, right.dx);
    const up = await step("ArrowUp");
    assert.ok(up.dy > 0 && up.dx === 0, "ArrowUp unchanged");
    const down = await step("ArrowDown");
    assert.equal(down.dy, -up.dy, "ArrowDown unchanged");
    assert.equal(down.dx, 0);
    await context.close();
  });

  it("the grid does not change what the map selects or move the pins, and the scale bar stays", async () => {
    const { page, context } = await open();
    const pinsBefore = await page.locator('[data-testid="representative-pin"], [data-testid="pin-cluster"]').count();
    await page.locator(TOGGLE).click();
    await page.locator(GRID).waitFor();
    assert.equal(await page.locator('[data-testid="representative-pin"], [data-testid="pin-cluster"]').count(), pinsBefore);
    assert.equal(await page.locator('[data-testid="map-scale"]').count(), 1);
    assert.equal(await page.locator('[data-testid="geo-map"]').getAttribute("data-level"), "state");
    await context.close();
  });

  it("selected areas get a glow behind a casing and a line that stay on top and stay legible", async () => {
    const { page, context } = await open(1440, 1000, `#feature=${encodeURIComponent(district)}`);
    const layers = await page.evaluate(() => {
      const focus = document.querySelector('path[data-highlight="focus"]')!;
      const selection = document.querySelector('[data-testid="map-selection"]')!;
      const paths = [...selection.querySelectorAll("path")].filter((p) => !p.hasAttribute("data-hover"));
      return {
        order: paths.map((p) => (p.hasAttribute("data-glow") ? "glow" : p.hasAttribute("data-highlight") ? "line" : "casing")),
        glowStroke: (selection.querySelector('[data-glow="outer"]') as SVGElement).getAttribute("stroke"),
        glowFill: (selection.querySelector('[data-glow="outer"]') as SVGElement).getAttribute("fill"),
        lineStroke: focus.getAttribute("stroke"),
        lineWidth: Number(focus.getAttribute("stroke-width")),
        pointerEvents: getComputedStyle(selection).pointerEvents,
        glowCount: document.querySelectorAll("[data-glow]").length,
        highlightCount: document.querySelectorAll("[data-highlight]").length,
      };
    });
    assert.deepEqual(layers.order, ["glow", "glow", "casing", "line"], "every glow first, then the wash and casing, then the orange line on top");
    assert.equal(layers.glowStroke, "#E8622A");
    assert.equal(layers.glowFill, "none", "the glow is a halo and adds no fill over the area");
    assert.equal(layers.lineStroke, "#E8622A");
    assert.ok(layers.lineWidth >= 2.5, "the line is as strong as before");
    assert.equal(layers.pointerEvents, "none", "the glow never takes a click");
    assert.equal(layers.glowCount, layers.highlightCount * 2, "every selected outline has both glow layers");
    await context.close();
  });

  it("the glow exists only for a selected area: none on the overview, none after the selection is cleared", async () => {
    const { page, context } = await open();
    assert.equal(await page.locator("[data-glow]").count(), 0, "nothing selected, nothing glows");
    assert.equal(await page.locator("[data-highlight]").count(), 0);
    await page.goto(`${server.baseUrl}/workspace#feature=${encodeURIComponent(district)}`, { waitUntil: "networkidle" });
    await page.locator('path[data-highlight="focus"]').waitFor();
    assert.ok((await page.locator("[data-glow]").count()) > 0);
    // Escape steps up one level and clears the selection: the glow goes with it.
    await page.locator('[data-testid="geo-map"]').focus();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelectorAll("[data-glow]").length === 0);
    assert.equal(await page.locator("[data-highlight]").count(), 0);
    await context.close();
  });

  it("a selected territory glows on every one of its blocks, more softly than the single focus", async () => {
    const { page, context } = await open();
    await page.locator('[data-testid="representative-pin"]').first().click();
    await page.locator('[data-testid="representatives-show-territory"]').click();
    await page.waitForTimeout(800);
    const members = await page.locator('path[data-highlight="member"]').count();
    assert.ok(members > 1);
    assert.equal(await page.locator('path[data-glow="outer"]').count(), members);
    const widths = await page.locator('path[data-glow="outer"]').evaluateAll((els) => els.map((e) => Number(e.getAttribute("stroke-width"))));
    assert.ok(widths.every((w) => w === 15), "member glow is the softer one");
    await context.close();
  });

  it("with many adjacent selected members, no member's glow is drawn over another member's line", async () => {
    const { page, context } = await open();
    await page.locator('[data-testid="representative-pin"]').nth(4).click();
    await page.locator('[data-testid="representatives-show-territory"]').click();
    await page.waitForTimeout(800);
    const layers = await page.evaluate(() => {
      const selection = document.querySelector('[data-testid="map-selection"]')!;
      const paths = [...selection.querySelectorAll("path")].filter((p) => !p.hasAttribute("data-hover"));
      const kind = (p: Element): string => (p.hasAttribute("data-glow") ? "glow" : p.hasAttribute("data-highlight") ? "line" : "casing");
      const kinds: string[] = paths.map(kind);
      const last = (k: string) => kinds.lastIndexOf(k);
      const first = (k: string) => kinds.indexOf(k);
      return { kinds, lastGlow: last("glow"), firstCasing: first("casing"), firstLine: first("line"), lines: kinds.filter((k) => k === "line").length };
    });
    assert.ok(layers.lines > 2, "a territory selects several blocks");
    assert.ok(layers.lastGlow < layers.firstCasing, "every glow precedes every wash and casing");
    assert.ok(layers.lastGlow < layers.firstLine, "every glow precedes every orange line");
    const glows = layers.kinds.filter((k) => k === "glow").length;
    assert.equal(glows, layers.lines * 2, "the pre-pass still draws both layers for every member");
    // After the glows, each member draws its own casing then its line, so a line is never under a later casing of its own.
    assert.deepEqual(layers.kinds.slice(glows), Array.from({ length: layers.lines }, () => ["casing", "line"]).flat());
    await context.close();
  });

  it("the taller control column stays inside the map at phone, tablet and wide sizes, and clear of every pin", async () => {
    for (const [w, h] of [
      [390, 844],
      [820, 1100],
      [1440, 1000],
    ] as const) {
      const { page, context } = await open(w, h);
      const frame = (await page.locator('[data-testid="geo-map"]').boundingBox())!;
      const controls = (await page.locator('[data-testid="map-controls"]').boundingBox())!;
      assert.ok(controls.y >= frame.y - 1 && controls.y + controls.height <= frame.y + frame.height + 1, `${w}x${h}: controls fit inside the map`);
      assert.ok(controls.x + controls.width <= frame.x + frame.width + 1);
      const pins = await page.locator('[data-testid="representative-pin"], [data-testid="pin-cluster"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
      for (const p of pins) {
        const overlaps = p.x < controls.x + controls.width && p.x + p.width > controls.x && p.y < controls.y + controls.height && p.y + p.height > controls.y;
        assert.equal(overlaps, false, `${w}x${h}: a pin sits under the controls`);
      }
      await context.close();
    }
  });

  it("accessibility: no axe violation with the grid on, with and without a selection, at desktop and phone width", async () => {
    for (const [w, h, hash] of [
      [1440, 1000, ""],
      [390, 844, `#feature=${encodeURIComponent(district)}`],
    ] as const) {
      const { page, context } = await open(w, h, hash);
      await page.locator(TOGGLE).click();
      await page.locator(GRID).waitFor();
      assert.deepEqual(await runAxe(page), [], `axe at ${w}x${h}`);
      await context.close();
    }
  });
});
