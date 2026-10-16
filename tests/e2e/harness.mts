import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";

/**
 * Shared helpers for the browser tests. They run the production build
 * (`npm run build` first) on 127.0.0.1 and drive it in the installed Chrome or
 * Edge through playwright-core, which downloads no browser of its own.
 * Everything stays on localhost.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const BROWSERS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((p): p is string => !!p);

export const hasBuild = existsSync(path.join(ROOT, ".next", "BUILD_ID")) && existsSync(path.join(ROOT, "data", "generated", "dataset.json"));
export const browserPath = BROWSERS.find((p) => existsSync(p));
export const skipReason = !browserPath
  ? "no Chrome or Edge found (set CHROME_PATH)"
  : !hasBuild
    ? "run `npm run data:build` and `npm run build` first"
    : false;

export interface Server {
  baseUrl: string;
  stop: () => Promise<void>;
}

async function waitFor(url: string, child: ChildProcess, ms = 40_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`The server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export async function startServer(port = 3199): Promise<Server> {
  if (process.env.E2E_BASE_URL) return { baseUrl: process.env.E2E_BASE_URL, stop: async () => {} };
  const next = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: ROOT,
    stdio: "ignore",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitFor(`${baseUrl}/`, child);
  return {
    baseUrl,
    stop: async () => {
      child.kill();
      await new Promise((r) => setTimeout(r, 300));
    },
  };
}

export async function launch(): Promise<Browser> {
  return chromium.launch({ executablePath: browserPath, headless: true });
}

/** A page that records every request host and every console or page error. */
export async function openPage(browser: Browser, width = 1440, height = 1000) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const hosts = new Set<string>();
  const errors: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http")) hosts.add(url.host);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return { page, context, hosts, errors };
}

/**
 * Clicks inside a drawn shape: scans a grid over its box for a point where the
 * shape is the top element, so overlapping neighbours do not intercept.
 */
export async function clickShape(page: Page, featureId: string) {
  await page.locator('[data-testid="geo-map"]').scrollIntoViewIfNeeded();
  const point = await page.evaluate((fid) => {
    const el = document.querySelector(`path[data-fid="${fid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let i = 1; i <= 24; i++) {
      for (let j = 1; j <= 24; j++) {
        const x = r.left + (r.width * i) / 25;
        const y = r.top + (r.height * j) / 25;
        if (document.elementFromPoint(x, y) === el) return { x, y };
      }
    }
    return null;
  }, featureId);
  if (!point) throw new Error(`No clickable point found on shape ${featureId}`);
  await page.mouse.click(point.x, point.y);
}

export async function runAxe(page: Page) {
  const source = await readFile(path.join(ROOT, "node_modules", "axe-core", "axe.min.js"), "utf8");
  await page.evaluate(source);
  return page.evaluate(async () => {
    // @ts-expect-error axe is injected into the page
    const result = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    });
    return result.violations.map((v: { id: string; impact: string; help: string; nodes: Array<{ target: unknown[] }> }) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
    }));
  });
}

export const dataset = async () =>
  JSON.parse(await readFile(path.join(ROOT, "data", "generated", "dataset.json"), "utf8")) as import("../../src/features/territory/types.ts").TerritoryDataset;
