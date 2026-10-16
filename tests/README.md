# Tests

Runner: Node's built-in `node:test` (Node 22.18 or newer, which strips TypeScript types
natively), so no test dependency exists. Under Node 20 the `.ts` and `.mts` tests will not load.
Browser tests use `playwright-core` with the installed Chrome or Edge; it downloads no browser.

| Command | What it runs |
| --- | --- |
| `npm test` | **The canonical non-browser suite.** Everything in `tests/unit/` and `tests/guardrails.test.ts`. One run, one count |
| `npm run check` | `npm run typecheck`, `npm run lint`, then `npm test` |
| `npm run test:e2e` | `tests/e2e/`: the production build in a real browser. Needs `npm run data:build` and `npm run build` first; starts its own server on `127.0.0.1:3199`. Set `E2E_BASE_URL` to test an already running server, `CHROME_PATH` to choose a browser |
| `npm run verify:build` | After `npm run build`: no staff name, layer ID or data file is a public asset. It runs `verify:assets` (the fixture scan it used to include went with the fixture) |

Quote a result with its command: the figures from `npm test` and `npm run test:e2e` are different
suites and are never added together. Counts are not recorded in this file because they go stale;
run the command.

## `tests/unit/` (the prototype)

| File | Covers |
| --- | --- |
| `geo-names-crosswalk.test.mts` | Name keys, numerals, similarity scores, the T1 to T4 matcher, link statuses, no territory input |
| `geo-geometry.test.mts` | Ring stitching, holes, simplification, interior point, path encoding, OSM district and block linking |
| `map-drilldown.test.mts` | The district-to-block rules on the real build: level from selection, click actions, breadcrumbs, back and Escape, which blocks are drawn, duplicate block names in search, geographic confidence, and the district and block label plans |
| `representatives.test.mts` | The representative-pin rules on the real build: pins sit exactly on stored anchors, one ASM pin per supported territory, no pin for unmatched, weak, ambiguous or excluded rows or for a block with no outline or only vacant markers, co-located rows grouped and not merged, implied information marked, grouping is deterministic and uses a real anchor, and pins follow local changes |
| `scale-bar.test.mts` | The scale bar's ground distance against a known real-world length, round lengths, Mercator stretch, and refusing a view it cannot measure |
| `viewport.test.mts` | Fit, zoom about a point, zoom limits, invalid zoom factors, zero-size containers, pan |
| `model-allocation.test.mts` | The four allocation states, official-unit states, local changes, validation, summary counts (synthetic data) |
| `selection-layer.test.mts` | Selection by ID and URL hash, layer validation (provenance and the provisional status), wording helpers |
| `data-integrity.test.mts` | The real build: counts against the Phase 0E audit, crosswalk rules, boundary provenance and shapes, no email or salary data, source hashes. Skipped, not failed, if `data:build` has not been run |
| `local-boundary.test.mts` | The localhost-only boundary: `-H 127.0.0.1` on `dev` and `start`, the loopback Host check, no data in `public/`, no client import of the dataset, provisional and attributed layer, the only network request the app makes, the fetch script's limits, no write to `data-source/`, and the public-asset scanner itself on synthetic builds |

## `tests/e2e/` (the built app in Chrome)

`workspace.test.mts`: the three map levels and their breadcrumbs, 23 district names inside the map at desktop width, search and layers, the phone layout, selection, zoom, pan (drag, keys, and the on-screen pan buttons), lists, forms and persistence, empty and refused layers,
the coverage line, no request off the app's own host, no staff name in any downloaded script,
style, font or image, the boundary route's headers and content, a 403 for any non-loopback Host,
the `/territory-map` redirect, accessibility (axe), phone width, and the build-output scan.
`pins.test.mts`: the representative pins in Chrome. The 21 state pins against the pin logic, no staff name readable
or logged until a pin is opened, the panel's dialog semantics, keyboard (Tab, Enter, Escape, focus return), district
and territory drill-down pin counts, grouping and the toggle, reduced motion and eased motion, phone, tablet and wide
layouts, 24 px targets, and axe with the panel open.
`grid-glow.test.mts`: the coordinate grid is off by default, the toggle's `aria-pressed` state, mouse and keyboard
operation (Enter, Space, the G key, Tab order), the grid not disturbing pins or the scale bar, the selection glow's
layering and legibility (glow under the wash, casing and orange line), no glow without a selection, the taller
control column inside the map at phone, tablet and wide sizes, and axe with the grid on.
`harness.mts` starts the server and the browser.

## `guardrails.test.ts` and the removed Gate P0 tests

The six Gate P0 test files (`allocation-state`, `boundary-layer`, `coverage`, `fixture`, `selection`,
`viewport`) and `fixtures/abstract-layer.ts` were removed on 2026-10-15 together with the retired
`/territory-map` code they tested (see [docs/prototype.md](../docs/prototype.md), section 10, for the
backup and for what else changed).

`guardrails.test.ts` is shared and stays. Its checks, all over the application as it is now: no
data file of any kind in `public/` (it used to fail on purpose while the boundary layer sat there; the
layer lives in `data/generated/` now), no geographic or JSON data file under `src` or `tests`, no email
address anywhere, no User-Agent set by the app, no map or geometry library imported, and the runtime
dependencies are exactly `next`, `react` and `react-dom`. Its Gate P0 fixture, route and
Gate-P0-scoped network checks were removed with their subject; the network rules for the whole app are
in `unit/local-boundary.test.mts`.

Synthetic fixtures in the tests are not geography and not people.
