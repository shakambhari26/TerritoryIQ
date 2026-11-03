// Renders the reps' guide in each language to an A4 PDF with the local Chrome:
//   rep-voice-note-guide-{bn,hi,en}.html -> rep-voice-note-guide-{bn,hi,en}.pdf
// Run build_variants.py first after editing the Bengali source.
//   node docs/rep-guide/render.mjs [png-preview-dir]
import { chromium } from "playwright-core";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const preview = process.argv[2];
const browser = await chromium.launch({ channel: "chrome" });
for (const lang of ["bn", "hi", "en"]) {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(join(here, `rep-voice-note-guide-${lang}.html`)).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: join(here, `rep-voice-note-guide-${lang}.pdf`), format: "A4", printBackground: true, preferCSSPageSize: true });
  console.log(`wrote rep-voice-note-guide-${lang}.pdf`);
  if (preview) {
    await page.setViewportSize({ width: 794, height: 1123 });
    for (const [i, p] of (await page.locator("section.page").all()).entries()) await p.screenshot({ path: join(preview, `${lang}-${i + 1}.png`) });
  }
  await page.close();
}
await browser.close();
