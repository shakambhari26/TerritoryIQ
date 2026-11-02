// The Overview's Earth is one static picture, not a second renderer. This guards what that one asset may be: a small WebP
// under public/overview, shown as a CSS background, and nothing else from the globe's texture set.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, it } from "node:test";

/** The most the preview may weigh. It is 35 KB today; the cap leaves room for a recompress, not for a texture. */
export const EARTH_PREVIEW_MAX_BYTES = 61_440;
const PREVIEW = "public/overview/earth-preview.webp";
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("the Overview's static Earth preview", () => {
  it("is a WebP within the size cap, and the only file in public/overview", () => {
    const bytes = readFileSync(new URL(`../../${PREVIEW}`, import.meta.url));
    assert.ok(bytes.length > 0 && bytes.length <= EARTH_PREVIEW_MAX_BYTES, `${bytes.length} bytes against a cap of ${EARTH_PREVIEW_MAX_BYTES}`);
    assert.equal(bytes.subarray(0, 4).toString("latin1"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("latin1"), "WEBP");
    assert.deepEqual(readdirSync(new URL("../../public/overview/", import.meta.url)), ["earth-preview.webp"]);
    assert.ok(statSync(new URL(`../../${PREVIEW}`, import.meta.url)).size <= EARTH_PREVIEW_MAX_BYTES);
  });

  it("is reached only through one CSS rule, never from the card's markup and never as one of the globe's own textures", () => {
    const css = read("src/app/globals.css");
    assert.equal(css.match(/url\(([^)]*)\)/g)?.filter((u) => /earth-|\/globe\/|overview/.test(u)).join("|"), "url(/overview/earth-preview.webp)");
    assert.doesNotMatch(css, /\/globe\//, "no globe texture in the stylesheet every page loads");
    const card = read("src/components/dashboard/GlobeEntryCard.tsx");
    assert.match(card, /className="earth-preview /);
    assert.doesNotMatch(card, /<img\b|<svg\b|<Image\b|next\/image|<canvas\b|<video\b|url\(|https?:\/\/|\/globe\//i);
  });
});
