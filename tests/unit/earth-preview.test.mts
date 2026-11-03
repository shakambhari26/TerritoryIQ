// The Overview's Earth is a still picture with a small canvas turning over it, not a second globe renderer. This guards what
// those two assets may be (small WebPs under public/overview, nothing else from the globe's texture set) and how they are reached:
// the still one through one CSS rule, the world map only from RotatingEarth, which imports no Three.js and no globe feature.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/** The most the still preview may weigh. It is 35 KB today; the cap leaves room for a recompress, not for a texture. */
export const EARTH_PREVIEW_MAX_BYTES = 61_440;
/** The most the world map may weigh. It is 54 KB today at 1024 x 512; a bigger map belongs to /globe, not to the Overview. */
export const EARTH_MAP_MAX_BYTES = 92_160;
const PREVIEW = "public/overview/earth-preview.webp";
const MAP = "public/overview/earth-map.webp";
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Width and height of a lossy WebP from its VP8 header. */
function webpSize(bytes: Buffer) {
  assert.equal(bytes.subarray(12, 16).toString("latin1"), "VP8 ", "a lossy WebP");
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
}

describe("the Overview's Earth pictures", () => {
  for (const [file, cap] of [[PREVIEW, EARTH_PREVIEW_MAX_BYTES], [MAP, EARTH_MAP_MAX_BYTES]] as const) {
    it(`${file} is a WebP within its size cap`, () => {
      const bytes = readFileSync(new URL(`../../${file}`, import.meta.url));
      assert.ok(bytes.length > 0 && bytes.length <= cap, `${bytes.length} bytes against a cap of ${cap}`);
      assert.equal(bytes.subarray(0, 4).toString("latin1"), "RIFF");
      assert.equal(bytes.subarray(8, 12).toString("latin1"), "WEBP");
    });
  }

  it("public/overview holds those two files and nothing else", () => {
    assert.deepEqual(readdirSync(new URL("../../public/overview/", import.meta.url)).sort(), ["earth-map.webp", "earth-preview.webp"]);
  });

  it("the world map is an equirectangular 2:1 picture, as the projection assumes", () => {
    const { width, height } = webpSize(readFileSync(new URL(`../../${MAP}`, import.meta.url)));
    assert.equal(width, 2 * height, `${width} x ${height}`);
    assert.ok(width >= 512 && width <= 1024, "small enough to be cheap, large enough for a 448 px sphere");
  });

  it("the still picture is reached only through one CSS rule, never from the card's markup and never as one of the globe's own textures", () => {
    const css = read("src/app/globals.css");
    assert.equal(css.match(/url\(([^)]*)\)/g)?.filter((u) => /earth-|\/globe\/|overview/.test(u)).join("|"), "url(/overview/earth-preview.webp)");
    assert.doesNotMatch(css, /\/globe\//, "no globe texture in the stylesheet every page loads");
    const card = read("src/components/dashboard/GlobeEntryCard.tsx");
    assert.match(card, /className="earth-preview /);
    assert.doesNotMatch(card, /<img\b|<svg\b|<Image\b|next\/image|<canvas\b|<video\b|url\(|https?:\/\/|\/globe\//i);
  });
});

describe("the rotating Earth component", () => {
  const source = read("src/components/dashboard/RotatingEarth.tsx");
  const code = strip(source);
  const specifiers = [...code.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);

  it("is a client component that imports only React: no Three.js, no globe feature, no data", () => {
    assert.match(source, /^"use client";/);
    assert.deepEqual(specifiers, ["react"]);
    assert.doesNotMatch(code, /\bthree\b|features\/globe|dataset|\.server|boundar|overlay|\bimport\s*\(|\brequire\s*\(/i);
  });

  it("loads the one world map by its own path, and nothing from /globe/", () => {
    assert.deepEqual(code.match(/["'`]\/[^"'`\s]+\.(?:webp|jpe?g|png|avif|json)["'`]/g), ['"/overview/earth-map.webp"']);
    assert.doesNotMatch(code, /\/globe\/|https?:\/\/|\bfetch\b/);
  });

  it("is hidden from assistive technology (the card's text carries the meaning) and respects reduced motion", () => {
    assert.match(code, /aria-hidden="true"/);
    assert.match(code, /prefers-reduced-motion: reduce/);
    assert.match(code, /document\.hidden/, "stops in a hidden tab");
    assert.match(code, /IntersectionObserver/, "stops when off screen");
  });

  it("names no place and shows no figure", () => {
    assert.doesNotMatch(code, /<(?:p|span|text|title)\b|\bfillText\b|\bstrokeText\b/);
  });
});
