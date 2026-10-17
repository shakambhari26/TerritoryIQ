import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { Euler, PerspectiveCamera, Vector3 } from "three";
import { angularDistance, faceRotation, lngLatToVector } from "../../src/features/globe/geo-math.ts";
import { mergeLayer } from "../../src/features/globe/layer-merge.ts";
import { decodeGeometry, pointInPolygons } from "../../src/features/globe/shapes.ts";
import type { GlobeManifest, GlobeOverlay } from "../../src/features/globe/types.ts";
import { browserPath, runAxe, skipReason, startServer, type Server } from "./harness.mts";

/**
 * The globe (at /globe, a locally integrated prototype) in a real browser: idle spin, flight, arrival and stillness, reveal after arrival, selection
 * by search, pointer and keyboard, reset, reduced motion, no WebGL, a failed texture, no outbound request.
 * Chrome renders WebGL in software here (SwiftShader), so frame rates are low and every wait is on state, not time.
 *
 * Set GLOBE_SHOTS to a folder to also write the screenshots used as visual evidence.
 */
const ROOT = path.resolve(import.meta.dirname, "..", "..");
const GENERATED = path.join(ROOT, "data", "generated");
const GLOBE_LAYER_PATH = path.join(GENERATED, "globe-boundaries.json");
const GLOBE_LAYER_ROUTE = "**/geo/globe-boundaries.json";
const SHOTS = process.env.GLOBE_SHOTS;
const ROOT_SEL = '[data-testid="globe-prototype"]';
const HOST_SEL = '[data-testid="globe-canvas-host"]';
const WEBGL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

interface View {
  lng: number;
  lat: number;
  dist: number;
}

const readView = async (page: Page): Promise<View> => {
  const raw = await page.getAttribute(HOST_SEL, "data-view");
  assert.ok(raw, "the canvas host reports its view");
  const [lng, lat, dist] = raw.split(",").map(Number);
  return { lng, lat, dist };
};
const attr = (page: Page, name: string) => page.getAttribute(ROOT_SEL, name);
const waitPhase = (page: Page, phase: string, timeout = 30_000) =>
  page.waitForSelector(`${ROOT_SEL}[data-phase="${phase}"]`, { timeout });
const shot = async (page: Page, name: string, selector = ROOT_SEL) => {
  if (SHOTS) await page.locator(selector).screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

/** Records the view every animation frame from inside the page, so a flight is checked frame by frame. */
const startRecording = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __rec: Array<{ t: number; v: string | null; phase: string | null; districts: string | null; blocks: string | null }>; __stop: boolean };
    w.__rec = [];
    w.__stop = false;
    const host = document.querySelector('[data-testid="globe-canvas-host"]') as HTMLElement;
    const root = document.querySelector('[data-testid="globe-prototype"]') as HTMLElement;
    const loop = () => {
      w.__rec.push({
        t: performance.now(),
        v: host.getAttribute("data-view"),
        phase: root.getAttribute("data-phase"),
        districts: root.getAttribute("data-revealed-districts"),
        blocks: root.getAttribute("data-revealed-blocks"),
      });
      if (!w.__stop) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
const stopRecording = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __rec: Array<{ t: number; v: string | null; phase: string | null; districts: string | null; blocks: string | null }>; __stop: boolean };
    w.__stop = true;
    return w.__rec;
  });

describe("globe prototype in a real browser", { skip: skipReason, timeout: 600_000 }, () => {
  let server: Server;
  let browser: Browser;
  let overlay: GlobeOverlay;
  let manifest: GlobeManifest;

  before(async () => {
    // What the page draws: the validated manifest joined to the outlines the route handler serves.
    manifest = JSON.parse(await readFile(path.join(GENERATED, "globe-overlay.json"), "utf8")) as GlobeManifest;
    const layer: unknown = JSON.parse(await readFile(GLOBE_LAYER_PATH, "utf8"));
    const merged = mergeLayer(manifest, layer);
    assert.ok(merged.ok, merged.ok ? "" : merged.reason);
    overlay = merged.overlay;
    server = await startServer(3218);
    browser = await chromium.launch({ executablePath: browserPath, headless: true, args: WEBGL_ARGS });
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  async function open(options: { width?: number; height?: number; reducedMotion?: "reduce" | "no-preference"; browser?: Browser } = {}) {
    const context: BrowserContext = await (options.browser ?? browser).newContext({
      viewport: { width: options.width ?? 1440, height: options.height ?? 1000 },
      reducedMotion: options.reducedMotion ?? "no-preference",
    });
    const page = await context.newPage();
    const hosts = new Set<string>();
    const dataRequests: string[] = [];
    const urls: string[] = [];
    const errors: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol.startsWith("http")) {
        hosts.add(url.host);
        urls.push(url.pathname);
      }
      // Script-initiated requests (fetch / XHR), ignoring the framework's own route-data requests.
      if (["fetch", "xhr", "websocket", "eventsource", "ping"].includes(request.resourceType()) && !url.searchParams.has("_rsc")) dataRequests.push(`${request.method()} ${url.pathname}`);
    });
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.baseUrl}/globe`, { waitUntil: "load" });
    return { page, context, hosts, errors, dataRequests, urls };
  }
  const ready = (page: Page) => page.waitForSelector(`${ROOT_SEL}[data-status="ready"]`, { timeout: 90_000 });

  it("renders a real WebGL globe, turning on its own, with nothing but this machine contacted", async () => {
    const { page, context, hosts, errors, dataRequests } = await open();
    await ready(page);
    assert.equal(await page.locator(`${HOST_SEL} canvas`).count(), 1);
    assert.equal(await attr(page, "data-phase"), "idle");
    // The outline-data strip spans the bottom and must not push the panel out from beside the globe.
    const stageBox = (await page.locator(HOST_SEL).boundingBox())!;
    const panelBox = (await page.locator(`${ROOT_SEL} aside`).boundingBox())!;
    assert.ok(panelBox.x >= stageBox.x + stageBox.width - 2 && Math.abs(panelBox.y - stageBox.y) < 4, `the panel sits beside the globe (stage ${JSON.stringify(stageBox)}, panel ${JSON.stringify(panelBox)})`);
    const stripBox = (await page.locator('[data-testid="globe-outlines-status"]').boundingBox())!;
    assert.ok(stripBox.y >= stageBox.y + stageBox.height - 2, "the outline-data strip is under the globe");
    assert.match((await page.locator('[data-testid="globe-status"]').textContent()) ?? "", /Rotating/);
    const first = await readView(page);
    await page.waitForTimeout(3500);
    const second = await readView(page);
    assert.ok(second.lng < first.lng - 0.5 || second.lng > first.lng + 100, `longitude moved: ${first.lng} -> ${second.lng}`);
    assert.equal(first.lat, second.lat);
    assert.equal(first.dist, second.dist);
    const a = await page.locator(HOST_SEL).screenshot();
    await page.waitForTimeout(1500);
    const b = await page.locator(HOST_SEL).screenshot();
    assert.ok(a.length > 60_000, `the canvas is not blank (${a.length} bytes)`);
    assert.notDeepEqual(a, b, "the picture changes as the globe turns");
    await shot(page, "01-idle-rotating");
    assert.deepEqual([...hosts], [new URL(server.baseUrl).host], "every request went to this machine");
    assert.deepEqual(dataRequests, ["GET /geo/globe-boundaries.json"], "the only script request is the one same-origin outline fetch, for the globe's own file");
    await page.waitForSelector(`${ROOT_SEL}[data-outlines="ready"]`);
    assert.match((await page.locator('[data-testid="globe-outlines-status"]').textContent()) ?? "", /Validated: 23 district and 309 block outlines, provisional/);
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("flies to West Bengal smoothly, stops on arrival, and reveals outlines only after it has arrived", async () => {
    const { page, context, hosts, errors } = await open();
    await ready(page);
    await startRecording(page);
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "flying");
    await shot(page, "02-flying-to-west-bengal");
    await waitPhase(page, "arrived");
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-districts="true"]`);
    await page.waitForTimeout(2500);
    await shot(page, "03-arrived-districts");
    const recording = await stopRecording(page);

    const target = { lng: (overlay.state.bbox![0] + overlay.state.bbox![2]) / 2, lat: (overlay.state.bbox![1] + overlay.state.bbox![3]) / 2 };
    const frames = recording.filter((r) => r.v);
    const flying = frames.filter((r) => r.phase === "flying");
    assert.ok(flying.length >= 8, `a flight is spread over many frames (${flying.length})`);
    // Smooth: the distance to the target never grows during the flight, and no frame jumps.
    const remaining = flying.map((r) => {
      const [lng, lat] = r.v!.split(",").map(Number);
      return angularDistance(lng, lat, target.lng, target.lat);
    });
    for (let i = 1; i < remaining.length; i++) assert.ok(remaining[i] <= remaining[i - 1] + 0.2, `no backwards step at frame ${i}: ${remaining[i - 1]} -> ${remaining[i]}`);
    let largestStep = 0;
    for (let i = 1; i < frames.length; i++) {
      const [l0, a0] = frames[i - 1].v!.split(",").map(Number);
      const [l1, a1] = frames[i].v!.split(",").map(Number);
      if (frames[i].phase === "flying" && frames[i - 1].phase === "flying") largestStep = Math.max(largestStep, angularDistance(l0, a0, l1, a1));
    }
    assert.ok(largestStep < 15, `no jump between frames (largest ${largestStep.toFixed(2)} degrees)`);
    // Stops: once arrived, the view never changes again.
    const arrivedAt = frames.findIndex((r) => r.phase === "arrived");
    const held = new Set(frames.slice(arrivedAt + 1).map((r) => r.v));
    assert.ok(held.size <= 1, `the view is held still after arrival (${held.size} distinct views)`);
    const final = await readView(page);
    assert.ok(Math.abs(final.lng - target.lng) < 0.01 && Math.abs(final.lat - target.lat) < 0.01, "arrived on the West Bengal target");
    // Outlines appear only after arrival.
    const early = frames.filter((r) => r.phase === "flying" || r.phase === "idle");
    assert.ok(early.every((r) => r.districts === "false"), "no outline is revealed during the flight");
    assert.equal(await attr(page, "data-level"), "state");
    const arrivedText = (await page.locator(ROOT_SEL).textContent()) ?? "";
    assert.match(arrivedText, /23 of 23 district outlines passed validation/);
    assert.match(arrivedText, /Confirmed: no representative\s*none yet; needs a reviewed source record/, "white stays in the legend and says why nothing is white");
    assert.deepEqual([...hosts], [new URL(server.baseUrl).host]);
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("at the state overview the two districts without a representative-linked block are grey and the other 21 royal blue", async () => {
    const { page, context, errors } = await open();
    await ready(page);
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "arrived");
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-districts="true"]`);
    await page.waitForTimeout(2500);
    assert.equal(await attr(page, "data-level"), "state");
    await shot(page, "state-overview-district-colours", HOST_SEL);

    // Where each district lies in the picture: the renderer's own camera (FOV, position, Earth rotation), rebuilt here.
    assert.match(await readFile(path.join(ROOT, "src", "features", "globe", "GlobeRenderer.ts"), "utf8"), /export const FOV = 32;/);
    const view = await readView(page);
    const box = (await page.locator(HOST_SEL).boundingBox())!;
    const camera = new PerspectiveCamera(32, box.width / box.height, 0.01, 200);
    camera.position.set(0, 0, view.dist);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const face = faceRotation(view.lng, view.lat);
    const turn = new Euler(face.x, face.y, 0, "XYZ");
    const toPixel = (lng: number, lat: number): [number, number] => {
      const [x, y, z] = lngLatToVector(lng, lat, 1.0008);
      const p = new Vector3(x, y, z).applyEuler(turn).project(camera);
      return [((p.x + 1) / 2) * box.width, ((1 - p.y) / 2) * box.height];
    };
    // Up to 60 points inside each district's outline, so labels and edges cannot decide the reading.
    const points = overlay.districts.map((d) => {
      const polygons = decodeGeometry(d.geometry!);
      const [west, south, east, north] = d.geometry!.bbox;
      const inside: Array<[number, number]> = [];
      for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) {
        const lng = west + ((i + 0.5) / 20) * (east - west);
        const lat = south + ((j + 0.5) / 20) * (north - south);
        if (pointInPolygons(lng, lat, polygons)) inside.push(toPixel(lng, lat));
      }
      const step = Math.max(1, Math.floor(inside.length / 60));
      return inside.filter((_, i) => i % step === 0);
    });
    assert.ok(points.every((p) => p.length >= 5), "every district has interior points to sample");
    const png = (await page.locator(HOST_SEL).screenshot()).toString("base64");
    const samples = await page.evaluate(
      async ({ png, points, width }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const scale = image.width / width;
        return points.map((set) => set.map(([x, y]) => Array.from(context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data.slice(0, 3))));
      },
      { png, points, width: box.width },
    );
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const reading = overlay.districts.map((d, i) => {
      const [r, g, b] = [0, 1, 2].map((c) => median(samples[i].map((s) => s[c])));
      return { name: d.name, state: d.state, r, g, b, blueness: b - Math.max(r, g) };
    });
    // Royal blue (#4169e1) over any terrain is strongly blue; the neutral grey (#8796b0) is nearly colourless.
    const blue = reading.filter((x) => x.state === "represented");
    const grey = reading.filter((x) => x.state === "unresolved");
    assert.equal(blue.length, 21);
    assert.deepEqual(grey.map((x) => x.name).sort(), ["Kalimpong", "Kolkata"]);
    if (SHOTS) await writeFile(path.join(SHOTS, "state-overview-district-colours.json"), JSON.stringify({ view, box, reading }, null, 2));
    const lowestBlue = Math.min(...blue.map((x) => x.blueness));
    const highestGrey = Math.max(...grey.map((x) => x.blueness));
    assert.ok(lowestBlue > highestGrey + 25, `blue and grey are separated: bluest grey ${highestGrey}, least blue of the 21 ${lowestBlue}`);
    for (const x of blue) assert.ok(x.blueness > 40, `${x.name} reads royal blue: ${JSON.stringify(x)}`);
    for (const x of grey) assert.ok(x.blueness < 25, `${x.name} reads neutral grey, not blue: ${JSON.stringify(x)}`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("goes to a district by search, then reveals only that district's validated blocks, then shows a block", async () => {
    const { page, context, errors } = await open();
    await ready(page);
    const district = overlay.districts.find((d) => d.name === "Bankura")!;
    const drawn = overlay.blocks.filter((b) => b.districtId === district.id && b.geometry);
    assert.ok(drawn.length > 0);
    await page.getByRole("searchbox").fill("bankura");
    await page.getByRole("button", { name: /^Bankura\s+district/ }).click();
    await waitPhase(page, "flying");
    assert.equal(await attr(page, "data-revealed-blocks"), "", "no blocks while travelling");
    await waitPhase(page, "arrived");
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-blocks="${district.id}"]`);
    await page.waitForTimeout(2200);
    await shot(page, "04-district-blocks");
    assert.equal(await attr(page, "data-selected"), district.id);
    const text = (await page.locator(ROOT_SEL).textContent()) ?? "";
    assert.match(text, new RegExp(`${drawn.length} of ${district.blockCount} blocks in the current reference list have a validated outline`));
    assert.match(text, /Colour shows a provisional, unreviewed link only/);

    // A block the workbook links to a named person.
    const represented = overlay.blocks.find((b) => b.districtId === district.id && b.state === "represented" && b.geometry)!;
    await page.getByRole("list", { name: /Blocks in Bankura/ }).getByRole("button", { name: new RegExp(`^${represented.name}`) }).first().click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    await page.waitForTimeout(1500);
    await shot(page, "05-block-details");
    assert.equal(await attr(page, "data-level"), "block");
    const details = (await page.locator(ROOT_SEL).textContent()) ?? "";
    assert.match(details, /Provisional representative link/);
    assert.match(details, /Workbook rows linked to this block/);
    assert.match(details, /A sales territory label is not an administrative district/);
    const person = represented.records[0].people.find((p) => p.name)!;
    assert.ok(details.includes(person.name!), "the workbook name for the linked row is shown");

    // A block with no outline says so and draws nothing for it.
    const undrawn = overlay.blocks.find((b) => b.districtId === district.id && !b.geometry);
    if (undrawn) {
      await page.getByRole("searchbox").fill(undrawn.name);
      await page.getByRole("button", { name: new RegExp(`^${undrawn.name}\\s+block`) }).first().click();
      await waitPhase(page, "flying");
      await waitPhase(page, "arrived");
      assert.match((await page.locator(ROOT_SEL).textContent()) ?? "", /No outline is drawn for this block/);
    }
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("picks an outline by pointer: a click at the centre of the view selects the district under it", async () => {
    const { page, context, errors } = await open();
    await ready(page);
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-districts="true"]`);
    await page.waitForTimeout(2200);
    const centre = await readView(page);
    const expected = overlay.districts.find((d) => d.geometry && pointInPolygons(centre.lng, centre.lat, decodeGeometry(d.geometry)));
    assert.ok(expected, "the centre of the West Bengal view lies inside a district");
    const box = (await page.locator(`${HOST_SEL} canvas`).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    assert.match((await page.locator('[data-testid="globe-hover"]').textContent()) ?? "", new RegExp(expected.name));
    await shot(page, "06-pointer-hover");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    assert.equal(await attr(page, "data-selected"), expected.id);
    assert.equal(await attr(page, "data-level"), "district");
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("can be dragged by hand while idle, and a drag never selects anything", async () => {
    const { page, context } = await open();
    await ready(page);
    const before = await readView(page);
    const box = (await page.locator(`${HOST_SEL} canvas`).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 20, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const after = await readView(page);
    assert.ok(Math.abs(after.lng - before.lng) > 3, `the drag turned the globe (${before.lng} -> ${after.lng})`);
    assert.equal(await attr(page, "data-level"), "globe");
    await context.close();
  });

  it("returns to the rotating globe on reset, clears the outlines, and starts turning again", async () => {
    const { page, context, errors } = await open();
    await ready(page);
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-districts="true"]`);
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Return to globe" }).click();
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-districts="false"]`);
    await waitPhase(page, "flying");
    await shot(page, "07-reset-flying");
    await waitPhase(page, "idle");
    assert.equal(await attr(page, "data-level"), "globe");
    assert.equal(await attr(page, "data-selected"), "");
    const before = await readView(page);
    assert.ok(before.dist > 3.5, "back at the whole-globe distance");
    await page.waitForTimeout(3500);
    const after = await readView(page);
    assert.notEqual(after.lng, before.lng, "the globe turns again");
    await shot(page, "08-reset-rotating");
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("works from the keyboard alone: fly, step through outlines, select, go back", async () => {
    const { page, context, errors } = await open();
    await ready(page);
    const stage = page.locator('[role="group"][aria-roledescription="interactive globe"]');
    await stage.focus();
    await page.keyboard.press("Enter");
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-districts="true"]`);
    await page.waitForTimeout(1800);
    assert.equal(await attr(page, "data-level"), "state");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const focused = (await page.locator('[data-testid="globe-hover"]').textContent())?.trim();
    assert.ok(focused && focused.length > 2, "the focused outline is named on screen");
    assert.equal((await page.locator('[data-testid="globe-announcement"]').textContent())?.trim(), focused, "and announced");
    await shot(page, "09-keyboard-focus");
    await page.keyboard.press("Enter");
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    assert.equal(await attr(page, "data-level"), "district");
    assert.ok(await attr(page, "data-selected"));
    await page.keyboard.press("Escape");
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    assert.equal(await attr(page, "data-level"), "state");
    await page.keyboard.press("Escape");
    await waitPhase(page, "idle");
    assert.equal(await attr(page, "data-level"), "globe");
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("with reduced motion: no idle spin, and a selection arrives at once with outlines shown", async () => {
    const { page, context, errors } = await open({ reducedMotion: "reduce" });
    await ready(page);
    const first = await readView(page);
    await page.waitForTimeout(2500);
    assert.deepEqual(await readView(page), first, "the globe does not turn on its own");
    assert.match((await page.locator('[data-testid="globe-status"]').textContent()) ?? "", /Still \(reduced motion\)/);
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-districts="true"]`, { timeout: 5000 });
    assert.equal(await attr(page, "data-phase"), "arrived");
    await shot(page, "10-reduced-motion-arrived");
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("shows a usable static fallback when WebGL is unavailable, and does not request the outline file it could not draw", async () => {
    const noWebgl = await chromium.launch({ executablePath: browserPath, headless: true, args: ["--disable-gpu", "--disable-3d-apis", "--disable-webgl", "--disable-webgl2"] });
    try {
      const { page, context, errors, dataRequests, urls } = await open({ browser: noWebgl });
      await page.waitForSelector('[data-testid="globe-fallback"], [data-testid="globe-error"]', { timeout: 60_000 });
      assert.equal(await page.locator('[data-testid="globe-fallback"]').count(), 1, "the fallback, not a crash");
      assert.match((await page.locator('[data-testid="globe-fallback"]').textContent()) ?? "", /The 3D globe is not available/);
      await page.getByRole("searchbox").fill("bankura");
      await page.getByRole("button", { name: /^Bankura\s+district/ }).click();
      const text = (await page.locator('[data-testid="globe-fallback"]').textContent()) ?? "";
      assert.match(text, /blocks in the current reference list have a validated outline/);
      assert.match(text, /None is drawn: the outline data is unavailable/, "the list never claims an outline is drawn");
      await shot(page, "11-no-webgl-fallback", '[data-testid="globe-fallback"]');
      assert.deepEqual(dataRequests, [], "nothing to draw on, so no outline request");
      assert.ok(!urls.includes("/geo/globe-boundaries.json"));
      assert.deepEqual(errors.filter((e) => !/WebGL|GPU|GL context|Failed to load resource/i.test(e)), []);
      await context.close();
    } finally {
      await noWebgl.close();
    }
  });

  /** Counts requests so far for a path pattern. */
  const countOf = (urls: string[], pattern: RegExp) => urls.filter((u) => pattern.test(u)).length;
  const flyToWestBengal = async (page: Page) => {
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
  };
  const turns = async (page: Page) => {
    const first = await readView(page);
    await page.waitForTimeout(3000);
    const second = await readView(page);
    assert.ok(second.lng !== first.lng, `the globe is turning (${first.lng} -> ${second.lng})`);
  };
  const refusal = (status: number, code: string) => ({ status, contentType: "application/json", body: JSON.stringify({ code, error: "refused" }) });

  it("a texture that fails gives its own error and retry, and the outline data finishes on its own and is not fetched again", async () => {
    const { page, context, urls } = await open();
    await context.route("**/globe/earth-day-*.jpg", (route) => route.abort());
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector('[data-testid="globe-error"]', { timeout: 60_000 });
    assert.match((await page.locator('[data-testid="globe-error"]').textContent()) ?? "", /Could not load .*earth-day/);
    // The outline data does not wait for, or depend on, the textures.
    await page.waitForSelector(`${ROOT_SEL}[data-outlines="ready"]`, { timeout: 30_000 });
    assert.equal(await page.locator('[data-testid="globe-outlines-status"]').getAttribute("data-state"), "ready");
    assert.equal(await attr(page, "data-status"), "error");
    await shot(page, "12-texture-error");
    const layerFetches = countOf(urls, /^\/geo\/globe-boundaries\.json$/);
    await context.unroute("**/globe/earth-day-*.jpg");
    await page.getByRole("button", { name: "Try again" }).click();
    await ready(page);
    assert.equal(countOf(urls, /^\/geo\/globe-boundaries\.json$/), layerFetches, "retrying the textures does not fetch the outline data again");
    assert.equal(await attr(page, "data-outlines"), "ready");
    await context.close();
  });

  it("when the outline data cannot be loaded the globe still renders, turns and flies, the places list works, and a retry loads the outlines", async () => {
    const { page, context, errors } = await open();
    await ready(page);
    await context.route(GLOBE_LAYER_ROUTE, (route) => route.abort());
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector('[data-testid="globe-outlines-error"]', { timeout: 60_000 });
    await ready(page);
    assert.equal(await attr(page, "data-outlines"), "unavailable");
    assert.match((await page.locator('[data-testid="globe-outlines-error"]').textContent()) ?? "", /could not be loaded from \/geo\/globe-boundaries\.json/);
    assert.equal(await page.locator(`${HOST_SEL} canvas`).count(), 1, "the globe is there");
    await turns(page);

    // List-only behaviour: the search and the details work, the flight happens, and nothing is drawn or claimed as drawn.
    const district = overlay.districts.find((d) => d.name === "Bankura")!;
    await page.getByRole("searchbox").fill("bankura");
    await page.getByRole("button", { name: /^Bankura\s+district/ }).click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    await page.waitForTimeout(1500);
    assert.equal(await attr(page, "data-revealed-districts"), "false");
    assert.equal(await attr(page, "data-revealed-blocks"), "");
    assert.equal(await attr(page, "data-selected"), district.id);
    const text = (await page.locator(ROOT_SEL).textContent()) ?? "";
    assert.match(text, /None is drawn: the outline data is unavailable/);
    assert.match(text, /Blocks in Bankura|Blocks/);
    assert.match((await page.locator('[data-testid="globe-announcement"]').textContent()) ?? "", /outline data is unavailable, so no outline is drawn/);
    await shot(page, "14-outlines-unavailable");

    // Retry: the data loads, and because the camera is already there, the outlines are revealed at once.
    await context.unroute(GLOBE_LAYER_ROUTE);
    await page.getByTestId("globe-outlines-retry").click();
    await page.waitForSelector(`${ROOT_SEL}[data-outlines="ready"]`, { timeout: 30_000 });
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-blocks="${district.id}"]`, { timeout: 30_000 });
    assert.equal(await page.getByTestId("globe-outlines-error").count(), 0);
    assert.deepEqual(errors.filter((e) => !/Failed to load resource|Failed to fetch/.test(e)), []);
    await context.close();
  });

  it("each server refusal gives its own plain reason, and the globe keeps working under every one", async () => {
    const { page, context } = await open();
    const cases: Array<[number, string, RegExp]> = [
      [404, "missing", /outline file has not been built on the server/],
      [500, "tampered", /no longer matches the validated copy/],
      [500, "identity", /not the dataset the globe was validated against/],
      [500, "invalid", /failed its structural check/],
    ];
    for (const [status, code, message] of cases) {
      await context.route(GLOBE_LAYER_ROUTE, (route) => route.fulfill(refusal(status, code)));
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector('[data-testid="globe-outlines-error"]', { timeout: 60_000 });
      assert.match((await page.locator('[data-testid="globe-outlines-error"]').textContent()) ?? "", message, code);
      await ready(page);
      assert.equal(await page.locator(`${HOST_SEL} canvas`).count(), 1, `${code}: a globe, not an error screen`);
      await context.unroute(GLOBE_LAYER_ROUTE);
    }
    await context.close();
  });

  it("refuses an outline file that is not the globe's validated dataset, in the browser too, and keeps the globe", async () => {
    const { page, context } = await open();
    const workspace = await readFile(path.join(GENERATED, "boundaries.json"), "utf8");
    const globeLayer = JSON.parse(await readFile(GLOBE_LAYER_PATH, "utf8")) as { meta: { datasetId: string; kind?: string } };
    const otherDataset = { ...globeLayer, meta: { ...globeLayer.meta, datasetId: "osm-somewhere-else" } };
    const noKind = { ...globeLayer, meta: { ...globeLayer.meta, kind: undefined } };
    for (const body of [workspace, JSON.stringify(otherDataset), JSON.stringify(noKind)]) {
      await context.route(GLOBE_LAYER_ROUTE, (route) => route.fulfill({ contentType: "application/json", body }));
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector('[data-testid="globe-outlines-error"]', { timeout: 60_000 });
      assert.match((await page.locator('[data-testid="globe-outlines-error"]').textContent()) ?? "", /not the one this overlay was validated against/);
      await ready(page);
      assert.equal(await attr(page, "data-outlines"), "unavailable");
      await context.unroute(GLOBE_LAYER_ROUTE);
    }
    await context.close();
  });

  it("an outline whose path was altered in transit is refused on its own; the others are drawn", async () => {
    const { page, context } = await open();
    const layer = JSON.parse(await readFile(GLOBE_LAYER_PATH, "utf8")) as { shapes: Array<{ featureId: string; d: string }> };
    const victim = overlay.districts.find((d) => d.name === "Bankura")!;
    const shape = layer.shapes.find((s) => s.featureId === victim.id)!;
    shape.d = shape.d.replace(/^M(-?\d+)/, (_, n: string) => `M${Number(n) + 400}`);
    await context.route(GLOBE_LAYER_ROUTE, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(layer) }));
    await page.reload({ waitUntil: "load" });
    await ready(page);
    await page.waitForSelector(`${ROOT_SEL}[data-outlines="ready"]`);
    assert.match((await page.locator('[data-testid="globe-outlines-status"]').textContent()) ?? "", /Validated: 22 district and \d+ block outlines/);
    await flyToWestBengal(page);
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-districts="true"]`);
    assert.match((await page.locator('[data-testid="globe-announcement"]').textContent()) ?? "", /22 provisional district outlines shown/);
    await page.getByRole("searchbox").fill("bankura");
    await page.getByRole("button", { name: /^Bankura\s+district/ }).click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    assert.match((await page.locator(ROOT_SEL).textContent()) ?? "", /Outline not drawn|0 of \d+ blocks in the current reference list have a validated outline/);
    await context.close();
  });

  it("loads independently: the globe renders and turns while the outline data is still loading, and outlines wait for both arrival and validation", async () => {
    const { page, context, errors } = await open();
    await ready(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await context.route(GLOBE_LAYER_ROUTE, async (route) => {
      await gate;
      await route.continue();
    });
    await page.reload({ waitUntil: "load" });
    await ready(page); // the globe is up although the outline request has not been answered
    assert.equal(await attr(page, "data-outlines"), "loading");
    assert.equal(await page.locator(`${HOST_SEL} canvas`).count(), 1);
    assert.match((await page.locator('[data-testid="globe-outlines-status"]').textContent()) ?? "", /Loading and validating/);
    await turns(page);
    await shot(page, "15-globe-turning-while-outlines-load");

    await flyToWestBengal(page);
    await page.waitForTimeout(2000);
    assert.equal(await attr(page, "data-revealed-districts"), "false", "arrived, but the data has not passed validation: nothing is revealed");
    assert.match((await page.locator('[data-testid="globe-announcement"]').textContent()) ?? "", /outline data is still being validated; outlines appear when it is ready/);
    assert.match((await page.locator(ROOT_SEL).textContent()) ?? "", /district outlines passed validation; none is drawn yet, because the outline data is still loading/);
    await shot(page, "16-arrived-waiting-for-outlines");

    release();
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-districts="true"]`, { timeout: 30_000 });
    assert.equal(await attr(page, "data-outlines"), "ready");
    assert.equal(await attr(page, "data-phase"), "arrived", "revealed on a held view, not mid-flight");
    assert.match((await page.locator('[data-testid="globe-announcement"]').textContent()) ?? "", /23 provisional district outlines shown/);
    await page.waitForTimeout(2200);
    await shot(page, "17-outlines-revealed-after-validation");
    assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), []);
    await context.close();
  });

  it("outlines that are ready before the camera arrives wait for the flight, then appear (the other order)", async () => {
    const { page, context } = await open();
    await ready(page);
    await page.waitForSelector(`${ROOT_SEL}[data-outlines="ready"]`);
    await startRecording(page);
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "arrived");
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-districts="true"]`);
    const frames = (await stopRecording(page)).filter((r) => r.v);
    const revealedAt = frames.findIndex((r) => r.districts === "true");
    assert.ok(revealedAt >= 0 && frames.slice(0, revealedAt).every((r) => r.districts === "false"));
    assert.equal(frames[revealedAt].phase, "arrived", "the first revealed frame is an arrived frame");
    await context.close();
  });

  it("when both the textures and the outline data fail, each shows its own message and each retry is independent of the other", async () => {
    const { page, context, urls } = await open();
    await context.route("**/globe/earth-day-*.jpg", (route) => route.abort());
    await context.route(GLOBE_LAYER_ROUTE, (route) => route.abort());
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector('[data-testid="globe-error"]', { timeout: 60_000 });
    await page.waitForSelector('[data-testid="globe-outlines-error"]', { timeout: 60_000 });
    await shot(page, "18-textures-and-outlines-failed");
    assert.equal(await attr(page, "data-status"), "error");
    assert.equal(await attr(page, "data-outlines"), "unavailable");
    const textures = () => countOf(urls, /^\/globe\/earth-day-/);
    const layers = () => countOf(urls, /^\/geo\/globe-boundaries\.json$/);
    const [texturesBefore, layersBefore] = [textures(), layers()];

    // Retry the textures only: the globe starts; the outline data is still unavailable and was not asked again.
    await context.unroute("**/globe/earth-day-*.jpg");
    await page.locator('[data-testid="globe-error"]').getByRole("button", { name: "Try again" }).click();
    await ready(page);
    assert.equal(await attr(page, "data-outlines"), "unavailable");
    assert.equal(layers(), layersBefore, "the texture retry did not fetch the outline data");
    assert.ok(textures() > texturesBefore);

    // Retry the outline data only: it loads; the textures are not fetched again.
    const texturesMid = textures();
    await context.unroute(GLOBE_LAYER_ROUTE);
    await page.getByTestId("globe-outlines-retry").click();
    await page.waitForSelector(`${ROOT_SEL}[data-outlines="ready"]`, { timeout: 30_000 });
    assert.equal(textures(), texturesMid, "the outline retry did not reload the textures");
    assert.ok(layers() > layersBefore);
    await context.close();
  });

  it("the real route serves the validated file, refuses a tampered, swapped or missing file, and leaves the workspace route alone", async () => {
    const record = manifest.meta.inputs["globe-boundaries.json"];
    const sha = async (response: Response) => createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
    const layerUrl = `${server.baseUrl}/geo/globe-boundaries.json`;
    const workspaceUrl = `${server.baseUrl}/geo/boundaries.json`;
    const original = await readFile(GLOBE_LAYER_PATH);
    const workspaceBytes = await readFile(path.join(GENERATED, "boundaries.json"));
    const asserted = async (status: number, code: string | null) => {
      const response = await fetch(layerUrl);
      assert.equal(response.status, status, `${code ?? "ok"}: status`);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      if (code === null) return response;
      const text = await response.text();
      assert.equal((JSON.parse(text) as { code: string }).code, code);
      assert.ok(!text.includes('"shapes"') && !text.includes('"d":'), `${code}: the refusal carries no outline data`);
      return response;
    };
    const workspaceUnchanged = async () => {
      const response = await fetch(workspaceUrl);
      assert.equal(response.status, 200);
      assert.equal(await sha(response), createHash("sha256").update(workspaceBytes).digest("hex"), "the workspace route still serves its own file, byte for byte");
    };

    try {
      const ok = await asserted(200, null);
      assert.equal(ok.headers.get("content-type"), "application/json; charset=utf-8");
      assert.equal(await sha(await fetch(layerUrl)), record.sha256, "served bytes are the validated bytes");
      await workspaceUnchanged();

      // Tampered: one byte appended while the server runs. The route reads the file on every request, so it notices.
      await writeFile(GLOBE_LAYER_PATH, Buffer.concat([original, Buffer.from(" ")]));
      await asserted(500, "tampered");
      await workspaceUnchanged();
      const { page, context } = await open();
      await page.waitForSelector('[data-testid="globe-outlines-error"]', { timeout: 60_000 });
      assert.match((await page.locator('[data-testid="globe-outlines-error"]').textContent()) ?? "", /no longer matches the validated copy/);
      await ready(page);
      assert.equal(await page.locator(`${HOST_SEL} canvas`).count(), 1, "a working globe under a real server refusal");
      await context.close();

      // Another dataset in its place: the workspace's own layer.
      await writeFile(GLOBE_LAYER_PATH, workspaceBytes);
      await asserted(500, "identity");

      // Missing.
      await rm(GLOBE_LAYER_PATH);
      await asserted(404, "missing");
      const second = await open();
      await second.page.waitForSelector('[data-testid="globe-outlines-error"]', { timeout: 60_000 });
      assert.match((await second.page.locator('[data-testid="globe-outlines-error"]').textContent()) ?? "", /has not been built on the server/);
      await second.context.close();
    } finally {
      await writeFile(GLOBE_LAYER_PATH, original);
    }
    assert.equal(await sha(await fetch(layerUrl)), record.sha256, "restored: served again, byte for byte");
  });

  it("has no accessibility violations on the globe, at the state view and at a district", async () => {
    const { page, context } = await open();
    await ready(page);
    assert.deepEqual(await runAxe(page), [], "whole globe");
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-districts="true"]`);
    assert.deepEqual(await runAxe(page), [], "West Bengal");
    await page.getByRole("searchbox").fill("bankura");
    await page.getByRole("button", { name: /^Bankura\s+district/ }).click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    assert.deepEqual(await runAxe(page), [], "district");
    await context.close();
  });

  it("fits a phone: no sideways scroll, and the search and details stack under the globe", async () => {
    const { page, context } = await open({ width: 390, height: 844 });
    await ready(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `no horizontal overflow (${overflow}px)`);
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    await page.waitForSelector(`${ROOT_SEL}[data-revealed-districts="true"]`);
    await page.waitForTimeout(1500);
    await shot(page, "13-phone-west-bengal");
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
    await context.close();
  });

  it("leaves cleanly, and comes back fresh: the WebGL canvas is released on navigating away and rebuilt on return", async () => {
    const { page, context, errors } = await open();
    await ready(page);
    await page.getByRole("button", { name: /Fly to West Bengal/ }).click();
    await waitPhase(page, "flying");
    await waitPhase(page, "arrived");
    await page.getByRole("link", { name: "Workspace" }).first().click();
    await page.waitForURL("**/workspace");
    // Next.js keeps the page you left, hidden; its effects are cleaned up, so the renderer must be disposed.
    await page.waitForFunction(() => document.querySelectorAll("canvas").length === 0, undefined, { timeout: 10_000 });
    assert.equal(await page.locator(HOST_SEL).isVisible(), false, "the globe is not on screen");
    await page.goBack();
    await page.waitForURL("**/globe");
    await ready(page);
    assert.equal(await page.locator(`${HOST_SEL} canvas`).count(), 1, "one new canvas");
    assert.equal(await attr(page, "data-level"), "globe", "back at the whole globe, not a stale selection");
    assert.equal(await attr(page, "data-revealed-districts"), "false");
    await page.waitForSelector(`${ROOT_SEL}[data-phase="idle"]`);
    assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), []);
    await context.close();
  });

  it("is linked from the navigation, and the navigation still links the Overview and the Workspace", async () => {
    const { page, context } = await open();
    await ready(page);
    const links = await page.$$eval('nav[aria-label="Primary"] a', (anchors) => anchors.map((a) => a.getAttribute("href")));
    assert.deepEqual(links, ["/globe", "/", "/workspace"]);
    await context.close();
  });
});
