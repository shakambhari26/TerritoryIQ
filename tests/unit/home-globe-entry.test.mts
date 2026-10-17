import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The homepage "Explore on the globe" entry card (Phase 2). Source-level checks: the card is a plain server component
 * that pulls in nothing from the globe feature (so the Overview cannot start downloading Three.js, textures or outline
 * data), links to exactly /globe, keeps its provisional wording, makes no numeric or coverage claim, and the Overview
 * around it is unchanged. The behaviour in a browser is in tests/e2e/globe-integration.test.mts.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (file: string) => readFileSync(resolve(ROOT, file), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CARD = "src/components/dashboard/GlobeEntryCard.tsx";
const PAGE = "src/app/page.tsx";
const card = strip(read(CARD));
const page = strip(read(PAGE));

/** The text a visitor reads: JSX text and the string attributes, without the markup. */
const visibleText = card
  .slice(card.indexOf("return ("))
  .replace(/className="[^"]*"|data-testid="[^"]*"|id="[^"]*"|aria-labelledby="[^"]*"/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ");

describe("homepage globe entry: imports", () => {
  const importsOf = (source: string) => [...source.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1] ?? m[2]);

  it("the card imports only Next's Link and the two shared UI primitives", () => {
    assert.deepEqual(importsOf(card).sort(), ["@/components/ui/Badge", "@/components/ui/Card", "next/link"]);
  });

  for (const [name, source] of [["card", card], ["homepage", page]] as const) {
    it(`the ${name} has no Three.js, globe loader, globe renderer, boundary overlay or features/globe import`, () => {
      for (const specifier of importsOf(source)) {
        assert.doesNotMatch(specifier, /three/i, specifier);
        assert.doesNotMatch(specifier, /features\/globe|\/globe\//, specifier);
        assert.doesNotMatch(specifier, /GlobeLoader|GlobeCanvas|GlobeRenderer|Renderer|overlay|boundar/i, specifier);
      }
      assert.doesNotMatch(source, /\brequire\s*\(|\bimport\s*\(/, "no dynamic import or require");
      assert.doesNotMatch(source, /next\/dynamic/);
      assert.doesNotMatch(source, /globe-boundaries|geo\/boundaries|globe-overlay/, "no data or texture path");
    });
  }
});

describe("homepage globe entry: a server component", () => {
  it("is not a client component and uses no client-only API", () => {
    assert.doesNotMatch(read(CARD), /^\s*["']use client["']/m);
    assert.doesNotMatch(card, /\buse(State|Effect|Memo|Ref|Callback|Layout\w*|Router|Pathname|SearchParams)\b|\bwindow\b|\bdocument\b|\bonClick\b/);
    assert.match(card, /export function GlobeEntryCard\(\)/, "takes no props, so it cannot depend on loaded data");
  });

  it("does not read the dataset or the geographic data itself", () => {
    assert.doesNotMatch(card, /dataset|getLayerMeta|\.server|\bfetch\b|readFileSync|process\./i);
  });
});

describe("homepage globe entry: links", () => {
  const anchors = [...card.matchAll(/<Link\b[\s\S]*?<\/Link>/g)].map((m) => m[0]);

  it("has exactly two links: /globe first, then /workspace, both literal", () => {
    assert.equal(anchors.length, 2);
    assert.deepEqual(anchors.map((a) => a.match(/href="([^"]*)"/)?.[1]), ["/globe", "/workspace"]);
    assert.doesNotMatch(card, /href=\{/, "no computed href");
  });

  it("labels them Explore on the globe and Go to the 2D workspace, and keeps Next's default prefetching", () => {
    assert.match(anchors[0], />\s*Explore on the globe\s*</);
    assert.match(anchors[1], />\s*Go to the 2D workspace\s*</);
    assert.doesNotMatch(card, /\bprefetch\b/, "the prefetch behaviour is not overridden");
  });

  it("gives both a 44px minimum height, full width on a phone", () => {
    const classes = [...card.matchAll(/const (primaryLinkClass|secondaryLinkClass) =\s*"([^"]*)"/g)];
    assert.deepEqual(classes.map((c) => c[1]), ["primaryLinkClass", "secondaryLinkClass"]);
    for (const [, , value] of classes) {
      assert.match(value, /\bmin-h-11\b/);
      assert.match(value, /\bw-full\b/);
    }
    assert.match(anchors[0], /className=\{primaryLinkClass\}/);
    assert.match(anchors[1], /className=\{secondaryLinkClass\}/);
  });
});

describe("homepage globe entry: wording", () => {
  it("has the heading, the badge and the description", () => {
    assert.match(card, /<h2[^>]*>\s*Explore on the globe\s*<\/h2>/);
    assert.match(card, /<Badge>Provisional outlines<\/Badge>/);
    assert.match(visibleText, /interactive 3D globe/);
    assert.match(visibleText, /provisional geographic outlines/);
  });

  it("carries the permanent provisional notice, with no condition around it", () => {
    assert.match(visibleText, /unofficial OpenStreetMap geometry/);
    assert.match(visibleText, /not official boundaries/);
    assert.match(visibleText, /do not provide complete district or block coverage/);
    assert.doesNotMatch(card, /\{[^}]*\?[^}]*Provisional|\bhidden\b|sr-only/, "the notice is not hidden or conditional");
  });

  it("says nothing official, verified, confirmed, live or fully integrated", () => {
    // "unofficial" and "not official boundaries" are the two honest uses.
    const text = visibleText.replace(/unofficial/gi, "").replace(/not official boundaries/gi, "");
    assert.doesNotMatch(text, /\bofficial\b/i);
    assert.doesNotMatch(text, /\b(verified|verify|confirmed|confirm|live|real-time|fully integrated|integrated|approved|authoritative|accurate)\b/i);
  });

  it("has no number, percentage, total or coverage claim", () => {
    // The only digits are in "3D" and "2D".
    assert.deepEqual(visibleText.match(/\d+/g), ["3", "2"]);
    assert.doesNotMatch(visibleText, /%|percent|\btotal\b|\ball (?:districts|blocks|places)\b|\bfull coverage\b|\bcomplete coverage\b|\bevery\b|\bnationwide\b/i);
    assert.doesNotMatch(visibleText.replace(/do not provide complete district or block coverage/, ""), /\bcomplete\b|\bcoverage\b/i);
  });

  it("adds no image, decorative SVG or external URL", () => {
    assert.doesNotMatch(card, /<img\b|<svg\b|<Image\b|next\/image|<canvas\b|<video\b|url\(|https?:\/\//i);
  });
});

describe("homepage globe entry: the Overview is unchanged around it", () => {
  const order = (needle: string) => page.indexOf(needle);

  it("the card sits between PageHeader and OverviewDashboard, outside the dataset condition", () => {
    const header = order("<PageHeader");
    const cardAt = order("<GlobeEntryCard />");
    const dashboard = order("<OverviewDashboard");
    assert.ok(header >= 0 && cardAt > header && dashboard > cardAt, "PageHeader, then the card, then the dashboard");
    assert.equal((page.match(/<GlobeEntryCard/g) ?? []).length, 1);
    assert.match(page, /^\s*<GlobeEntryCard \/>\s*$/m, "its own element, not inside the dataset ternary");
    assert.ok(cardAt < order("{overview ?"), "rendered before the dataset condition, so it shows when the data is missing");
  });

  it("keeps the Territory Overview heading, the dashboard, the missing-data fallback and the Workspace entry", () => {
    assert.match(page, /title="Territory Overview"/);
    assert.match(page, /<OverviewDashboard data=\{overview\} layerMeta=\{getLayerMeta\(\)\} \/>/);
    assert.match(page, /<DatasetMissing \/>/);
    assert.match(page, /href="\/workspace"[\s\S]*?Open the workspace/);
    assert.match(page, /<Badge>Local prototype<\/Badge>/);
    assert.doesNotMatch(page, /href="\/globe"/, "the page itself only renders the card; the card owns the globe link");
  });

  it("OverviewDashboard still keeps its own Workspace link and does not mention the globe", () => {
    const dashboard = strip(read("src/features/territory/components/OverviewDashboard.tsx"));
    assert.match(dashboard, /href="\/workspace"/);
    assert.doesNotMatch(dashboard, /globe/i);
  });
});
