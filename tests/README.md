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
| `viewport.test.mts` | Fit, zoom about a point, zoom limits, invalid zoom factors, zero-size containers, pan; and `fitClear`, the map's own fit: whole extent on the map, uniform scale, clear of every control and notice at desktop, laptop, tablet and phone sizes |
| `model-allocation.test.mts` | The four allocation states, official-unit states, local changes, validation, summary counts (synthetic data) |
| `selection-layer.test.mts` | Selection by ID and URL hash, layer validation (provenance and the provisional status), wording helpers |
| `data-integrity.test.mts` | The real build: counts against the Phase 0E audit, crosswalk rules, boundary provenance and shapes, no email or salary data, source hashes. Skipped, not failed, if `data:build` has not been run |
| `home-globe-entry.test.mts` | The homepage "Explore on the globe" card, from the source: it imports only `next/link`, `Badge` and `Card` (nothing from `features/globe`, no Three.js, loader, renderer or boundary module, no dynamic import), is not a client component and takes no props, links to exactly `/globe` and `/workspace`, keeps its provisional and unofficial wording, has no figure, percentage, coverage or official, verified, confirmed, live or integrated claim, and sits between `PageHeader` and `OverviewDashboard` outside the dataset condition, with the Overview and its Workspace links unchanged |
| `overview-data.test.mts` | The Overview's data boundary: on synthetic names, the serialised `OverviewData` and the model input rebuilt from it contain no name (however cased or escaped) and only the explicit fields; people are bare integer keys shared exactly where the model counts one name; the Overview's figures equal the full dataset's with no local changes and under every kind of local change; the one known limit (a local name equal to a workbook name counts as distinct); the homepage passes `OverviewData`, never the dataset, to the dashboard. On the real build, it reports counts only: same figures, no staff name in the serialised data, and the same scan does find them in the full dataset. Skipped, not failed, if `data:build` has not been run |
| `local-boundary.test.mts` | The localhost-only boundary: `-H 127.0.0.1` on `dev` and `start`, the loopback Host check, no data in `public/`, no client import of the dataset, provisional and attributed layer, the only network request the app makes, the fetch script's limits, no write to `data-source/`, and the public-asset scanner itself on synthetic builds |
| `globe-workspace-link.test.mts` | The globe-to-workspace hand-off: state, district, block and workbook-row URLs, encoding, unknown, empty and wrong-kind IDs, and, on the real build, that every district, block and row the globe lists gives a hash the workspace's own parser accepts and a map level that agrees with the globe |

## `tests/e2e/` (the built app in Chrome)

`workspace.test.mts`: the three map levels and their breadcrumbs, 23 district names inside the map at desktop width, search and layers, the phone layout, selection, zoom, pan (drag, keys, and the on-screen pan buttons), lists, forms and persistence, empty and refused layers,
the coverage line, no request off the app's own host, no staff name in any downloaded script,
style, font or image, the boundary route's headers and content, a 403 for any non-loopback Host,
the `/territory-map` redirect, accessibility (axe), phone width, and the build-output scan.
`overview-privacy.test.mts`: the Territory Overview sends no staff name to the browser. The homepage HTML, its RSC payload and
the prerendered homepage files under `.next/server/app` contain none of the dataset's names (reported as a count, never printed), with
`/workspace` as the positive control; in Chrome the Overview shows every KPI, territory row, link count and state count the full
dataset gives, and still applies a reviewer's local changes to them.
`pins.test.mts`: the representative pins in Chrome. The 21 state pins against the pin logic, no staff name readable
or logged until a pin is opened, the panel's dialog semantics, keyboard (Tab, Enter, Escape, focus return), district
and territory drill-down pin counts, grouping and the toggle, reduced motion and eased motion, phone, tablet and wide
layouts, 24 px targets, and axe with the panel open.
`grid-glow.test.mts`: the coordinate grid is off by default, the toggle's `aria-pressed` state, mouse and keyboard
operation (Enter, Space, the G key, Tab order), the grid not disturbing pins or the scale bar, the selection glow's
layering and legibility (glow under the wash, casing and orange line), no glow without a selection, the taller
control column inside the map at phone, tablet and wide sizes, and axe with the grid on.
`map-visual.test.mts`: visual and layout regression for the map, as measurements, at a 1440 x 900 desktop (details panel
open), a 1280 x 720 laptop, an 820 x 1180 tablet and a 390 x 844 phone. At each size: the map's height and the share of it
the state fills (minimums sit just under the redesign's figures, so shrinking either fails), the state's on-screen aspect
equal to the data's, all 23 districts named or marked with a dot, and no overlap between names, between markers, between
a name and a marker, or between either and a control, the scale bar or the provisional chip; no control or chip over drawn
geography; the legend not clipped and the page not scrolling sideways; the permanent "Provisional boundaries" chip; the
coverage disclosure collapsed by default; the grid hidden with its toggle unpressed; no request off the app's own host.
Also a Bankura drill-down at desktop and phone width (no name over the selected outline, none under a control), and the
disclosure opening and closing from the keyboard with the attribution still shown. The first-use hint is replaced by a
one-line summary after the first click, key press, zoom or pan, with the strip and the map keeping their size. The
icon-only Representatives and Details controls keep their accessible names, tooltips and a drawn focus ring reached by Tab
(desktop with the panel open, and phone). No screen calls the block total "official": the workspace, the disclosure and
the overview all say "blocks in the current reference list" and that the total is not independently verified. Run it alone with
`npm run build` first, then `node --test --test-concurrency=1 tests/e2e/map-visual.test.mts` (it starts its own server on
`127.0.0.1:3199`, or set `E2E_BASE_URL`).
`globe.test.mts`: the 3D globe at `/globe` in Chrome with software WebGL (flight, arrival, outlines revealed after arrival, selection by search, pointer and keyboard, reduced motion, no WebGL, failed textures, failed or refused outline data, the real outline route, axe, phone, leaving and returning).
`globe-integration.test.mts`: Phase 1 of the globe integration. `/globe` loads the globe with the local-prototype badge and the provisional-outline notice; `/globe-prototype` answers 307 to `/globe`; the navigation is Globe, Overview, Workspace and the planned modules with exactly one `aria-current` link on `/`, `/workspace`, `/globe` and `/globe-prototype`, and the Globe link is on screen at 390px; "Open in 2D workspace" for the state, a district, a block and a workbook row opens the workspace at the matching level with the matching `#feature=` or `#unit=` ID (and a second block after going back shows the second block); the link is present without WebGL and when the outline request is aborted; a hand-off URL works when opened or reloaded directly; `/` is still the Territory Overview and neither `/` nor `/workspace` downloads Three.js (with `/globe` as the positive control); the workspace opens at the state overview and `/geo/boundaries.json` and `/geo/globe-boundaries.json` serve their own validated bytes.
The same file also covers Phase 2, the homepage "Explore on the globe" card: `/` is still the Territory Overview (heading, four KPI cards, the panels, 21 territory rows, both Workspace links); the card, its badge, notice and two links render in order between the heading and the KPIs; the primary link opens `/globe` and the globe becomes ready, Back returns to the Overview, and the secondary link opens `/workspace`; at 390, 768 and 1440px there is no sideways scroll, the card stays inside the page and clear of the KPI row, both links are at least 44px high, the phone links are full width, and on a desktop the actions sit to the right on one line with the KPI row on screen; keyboard order and a drawn focus ring; axe at 390 and 1440px; and opening `/` (with the default link prefetching observed, and shown to have run) loads no Three.js, no `/globe/` texture and neither `/geo/globe-boundaries.json` nor `/geo/boundaries.json`, with `/globe` and `/workspace` as positive controls.
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
