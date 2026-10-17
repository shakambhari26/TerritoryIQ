import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { arrivalWithoutOutlines, canReveal, drawnClause } from "../../src/features/globe/outline-gate.ts";
import type { Level } from "../../src/features/globe/types.ts";

/**
 * When outlines may appear. The globe and the outline file load independently; an outline is revealed only when the
 * location transition is complete (arrived, held still) AND the geographic validation is complete (the renderer holds
 * validated outlines). The browser behaviour is in tests/e2e/globe.test.mts; this is the rule and the code's shape.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("canReveal", () => {
  const levels: Level[] = ["globe", "state", "district", "block"];

  it("is true only when outlines are validated, the flight has arrived, and the view is not the whole globe", () => {
    for (const hasOutlines of [false, true]) {
      for (const arrived of [false, true]) {
        for (const level of levels) {
          assert.equal(canReveal({ hasOutlines, arrived, level }), hasOutlines && arrived && level !== "globe", JSON.stringify({ hasOutlines, arrived, level }));
        }
      }
    }
  });

  it("does not reveal during a flight even with validated outlines, and not before validation even after arrival", () => {
    assert.equal(canReveal({ hasOutlines: true, arrived: false, level: "state" }), false);
    assert.equal(canReveal({ hasOutlines: false, arrived: true, level: "state" }), false);
  });
});

describe("what the page says while outlines are not there", () => {
  it("arriving before the data is ready says outlines will appear; arriving after it failed says none is drawn", () => {
    assert.match(arrivalWithoutOutlines("West Bengal", "loading"), /still being validated; outlines appear when it is ready/);
    assert.match(arrivalWithoutOutlines("West Bengal", "unavailable"), /unavailable, so no outline is drawn/);
    assert.match(arrivalWithoutOutlines("West Bengal", "unavailable"), /places list still works/);
  });

  it("never claims outlines are drawn unless they are", () => {
    assert.equal(drawnClause("ready", 23), "23 are drawn");
    assert.match(drawnClause("loading", 23), /none is drawn yet/);
    assert.match(drawnClause("unavailable", 23), /none is drawn/);
    assert.doesNotMatch(drawnClause("unavailable", 23), /23/);
  });
});

describe("the page starts the globe and the outline data independently", () => {
  const experience = read("src/features/globe/components/GlobeExperience.tsx");
  const renderer = read("src/features/globe/GlobeRenderer.ts");

  it("the renderer is created from textures alone: no outline argument, and re-created only by its own retry", () => {
    assert.match(renderer, /static async create\(host: HTMLElement, events: RendererEvents, options: RendererOptions/);
    assert.doesNotMatch(experience, /GlobeRenderer\.create\([^)]*overlay/);
    assert.match(experience, /\},\s*\[attempt\]\);\s*\n\s*\n\s*\/\/ Hand the validated outlines/, "the renderer effect depends on its own attempt counter only");
  });

  it("the outline fetch is its own effect, with its own attempt counter and abort, and is started by the experience, not the stage", () => {
    assert.match(experience, /fetchBoundaryLayer\(controller\.signal\)/);
    assert.match(experience, /return \(\) => controller\.abort\(\);/);
    assert.match(experience, /\[manifest, attempt, webgl\]/);
    const stage = experience.slice(experience.indexOf("function GlobeStage"), experience.indexOf("const CODE_REASON"));
    assert.doesNotMatch(stage, /fetchBoundaryLayer|mergeLayer/);
  });

  it("outlines reach the renderer only through setOverlay, and are revealed only through canReveal", () => {
    assert.match(experience, /renderer\.setOverlay\(outlinesOverlay\)/);
    assert.match(experience, /canReveal\(\{ hasOutlines: renderer\.hasOutlines, arrived: arrivedRef\.current, level: current\.level \}\)/);
    // showDistricts / showBlocks are the reveal; the only calls that reveal sit after that gate or on a hide path.
    const reveals = [...experience.matchAll(/renderer\.showDistricts\(true\)/g)].length;
    assert.equal(reveals, 1);
    assert.match(renderer, /showDistricts\(visible: boolean\): void \{\s*const overlay = this\.overlay;\s*if \(!overlay\) return;/);
    assert.match(renderer, /showBlocks\(districtId: string \| null\): void \{\s*const overlay = this\.overlay;\s*if \(!overlay\) return;/);
  });

  it("a texture failure and an outline failure each have their own message and retry", () => {
    assert.match(experience, /data-testid="globe-error"/);
    assert.match(experience, /data-testid="globe-outlines-error"/);
    assert.match(experience, /data-testid="globe-outlines-retry"/);
    assert.match(experience, /setAttempt\(\(n\) => n \+ 1\)/);
  });

  it("textures that did load are disposed when another fails, and the context is released", () => {
    assert.match(renderer, /Promise\.allSettled/);
    assert.match(renderer, /for \(const texture of loaded\) texture\.dispose\(\);\s*renderer\.dispose\(\);\s*renderer\.forceContextLoss\(\);/);
  });
});
