// Renders rep-voice-note-guide.html to rep-voice-note-guide.pdf (A4) with the local Chrome.
//   node docs/rep-guide/render.mjs [png-preview-dir]
import { chromium } from "playwright-core";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(pathToFileURL(join(here, "rep-voice-note-guide.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: join(here, "rep-voice-note-guide.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
const preview = process.argv[2];
if (preview) {
  await page.setViewportSize({ width: 794, height: 1123 });
  const pages = await page.locator("section.page").all();
  for (const [i, p] of pages.entries()) await p.screenshot({ path: join(preview, `page-${i + 1}.png`) });
}
await browser.close();
