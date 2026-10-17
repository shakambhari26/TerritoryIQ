# Local prototype: what was built and how it behaves

**Scope.** A localhost-only prototype. It is not deployed, uses no production service and
is not meant to be public. P0, P1 and P2 are treated as development milestones, not
approval gates. Open business and legal questions are still listed (section 9); they are
recorded, not hidden, and none of them was settled by building this.

Figures below were measured on 2026-10-15 from the files in `data-source/`.

## 1. Run and verify

Requires Node.js 20.9 or newer to run the app (developed on Node 24); the `.ts` tests need 22.18+.

```bash
npm install
npm run data:verify        # the four source files against their recorded SHA-256 values
npm run data:fetch-osm     # once: download district and block outlines (optional, uses the network)
npm run data:build         # build the dataset and the boundary layer into data/generated/
npm run dev                # http://127.0.0.1:3000  (bound to 127.0.0.1 only)
```

Restart the server after `data:build`: the data is read once when the server starts, and a
production build bakes it in, so run `npm run build` again for that.
Open `/` (overview) and `/workspace` (map, details panel, forms). `/territory-map`, the retired
Gate P0 preview, redirects to `/workspace`.

```bash
npm run check              # typecheck + lint + npm test
npm test                   # the canonical non-browser suite (tests/unit and tests/guardrails.test.ts)
npm run build              # production build, then:
npm run verify:build       # no staff name, layer ID or data file is a public asset (same check as verify:assets)
npm run test:e2e           # browser tests (installed Chrome or Edge, production build, 127.0.0.1)
```

`npm test` is the single canonical command for everything that does not need a browser. There is
no separate "unit only" command, so a result is never a sum of two overlapping runs. The Gate P0
tests were removed from it on 2026-10-15 (section 10).

## 2. Data flow

```text
data-source/AREA MAPPING.xlsx            (read-only) ─┐
data-source/LGD_..._Districts_...xls     (read-only) ─┼─> scripts/build-data.mts ─> data/generated/dataset.json     (server only)
data-source/LGD_..._Blocks_...xls        (read-only) ─┤                          ─> data/generated/boundaries.json  (server only)
data/raw/osm/*.json (fetched once)                    ─┘                          ─> data/generated/build-report.json

data/generated/boundaries.json ──> src/app/geo/boundaries.json/route.ts ──> GET /geo/boundaries.json (browser, validated before drawing)
data/generated/dataset.json    ──> server pages (/ and /workspace)       ──> page HTML and payload
```

- `scripts/verify-sources.mts` and `scripts/build-data.mts` hash all four source files before and
  after, and fail if any differs from the recorded value. Nothing writes to `data-source/`, and a
  test scans the scripts for any write that names it.
- `scripts/fetch-osm.mts` is the only code that uses the network. It sends a generic
  `User-Agent` (`TerritoryIQ-local-prototype/0.1`), a content type, and a geographic query
  (a bounding box and relation IDs). It does not read the workbook. No company address is sent
  anywhere. The app and the tests make no external request (a browser test asserts this).
- Everything generated lives under `data/`, which is git-ignored and server-only. **Nothing is
  written to `public/`**: Next.js serves every file there verbatim to anything that can reach the
  port, and a guard test fails if a data file appears in it.

## 3. Four things kept apart

| Thing | Where it lives | Rule |
| --- | --- | --- |
| Sales territory (the workbook `DISTRICT` label) and its block rows | `SalesTerritory`, `TerritoryUnit` | Kept verbatim. Never joined to an administrative district, name, code or polygon. |
| Official unit (LGD district or block) | `GeoFeature` | Names and codes exactly as the LGD report prints them. |
| The link between them | `CrosswalkEntry` | Explicit, with every candidate, the evidence and a status. |
| Boundary geometry | `data/generated/boundaries.json`, served at `/geo/boundaries.json` | Drawn only for an official unit whose outline link was justified. Provisional. |

The workbook is the company's statement of which blocks sit under which territory. Rows are
never dropped or edited. A sales territory has no polygon of its own: its place on the map is
the set of outlines linked to its rows.

## 4. The crosswalk (workbook row to official unit)

The matcher (`src/features/geo/crosswalk.ts`) reproduces the Phase 0E protocol on the
**block label only**. Its signature has no territory parameter, and a test shows the same
label always gets the same candidates.

| Tier | Meaning |
| --- | --- |
| T1, T2 | Exact name, or exact apart from spacing and punctuation. Numerals are compared as numbers, so `-I`, ` I`, `-1` agree. |
| T3 | Same name with a missing or different numeral, same words reordered, leading words, or a contiguous part of a longer name. A label ending in an unexplained single letter (for example `-W`) is not matched on its leading words (B-24). |
| T4 | Spelling variant, similarity of at least 0.80 (0.85 for four-letter names). |

If any T1 or T2 candidate exists, weaker tiers are not candidates. The link status is then:

| Status | Rows | Meaning |
| --- | ---: | --- |
| `provisional` | 298 | Exactly one exact-name **block**. The only status that yields a boundary, and only if that block has an outline. Unreviewed. |
| `ambiguous` | 3 | More than one exact candidate, or a block and a district. `Sankrail` (two official blocks) and `Jhargram`. No boundary until a reviewer chooses. |
| `weak` | 43 | Only spelling or numbering variants. Candidates are listed; none is selected. |
| `none` | 14 | No plausible candidate: urban labels such as boroughs and municipalities, `Medinipur Sadar`, `Nanur` and the two `-W` rows. |

This reproduces the Phase 0E counts exactly (301 rows with an exact candidate, 298 and 3, 43
weak, 14 none, with the same 14 row numbers). A reviewer can confirm, hold or exclude a link in
the workspace; a confirmation is the only way a row that is not provisional gets a boundary.

## 5. Boundaries

Official districts are tied to OpenStreetMap by the LGD code OSM carries (a code join). A
block is tied to an OSM relation only if (a) the relation lies inside that block's official
district, found from an interior point of the block and not from its edge, (b) its name key
matches exactly, and (c) no other official block competes for it. Spelling variants are
recorded as suggestions in `build-report.json` and are never applied.

| Level | Drawn | Not drawn |
| --- | ---: | --- |
| Districts | 23 of 23 | none |
| Official blocks | 309 of 345 | 36 with no same-named OSM relation in their district (spelling variants such as `Mahishadal`/`Mahisadal`, `Arambagh`/`Arambag`) |
| Workbook rows | 278 of 358 reach an outline | 80: 20 provisional rows whose block has no outline, 3 ambiguous, 43 weak, 14 none |

The layer is simplified (about 67 m), projected to spherical Mercator and encoded as integer SVG
paths (562 KB). Its `meta` carries source, licence, attribution, the OSM snapshot timestamps,
retrieval time and the SHA-256 of every raw extract. It is labelled provisional and indicative.
The attribution stays on screen beneath the map, with a coverage line ("Coverage is not complete":
how many districts and blocks have an outline, and that no ward or urban-body boundary is drawn).
The browser checks the layer before drawing it and refuses one that lacks the licence, the
attribution, a source snapshot date or a status beginning "Provisional". A name match between a
workbook row and an official block is never worded as verified or confirmed anywhere in the UI;
only a reviewer's explicit confirmation in the workspace produces a "reviewed" link.

**Remaining geographic gaps:** no ward polygons (Kolkata 209, Howrah 68), no urban-body outlines,
no official boundary source, no outline for the 36 blocks above. Kolkata has no block in the LGD
report. Eight official blocks are not listed in the workbook and nothing resembles them
(`Nanoor`, `Midnapore`, `Galsi -I`, `Deshapran` and the four Kalimpong blocks); their state is
missing / unverified, not unallocated.

## 6. The four allocation states

Shown separately on the overview, in the lists and on the map (colour plus a hatch pattern and a
text label, so colour is never the only cue):

| State | Rule |
| --- | --- |
| Allocated | At least one named person is listed (any role). `coverage` (primary and secondary, partial, ASM only) shows how deep. **Provisional definition**, pending B-12 and B-28. |
| Confirmed unallocated | An explicit stored confirmation (who, when, evidence). Never derived. None exists until someone records one. |
| Missing / unverified | Nothing usable is known: no named person, or no row linked to an official block. The default. Never shown as unallocated or white space. |
| Conflicting | Records disagree and none is chosen: two rows linked to one official block, several rows that could mean it, or a confirmation recorded for a row that lists staff. |

Today: rows 350 allocated, 8 conflicting, 0 missing, 0 confirmed unallocated. Official blocks: 290
allocated, 49 missing / unverified, 6 conflicting. `Vacant` stays a slot-level marker (30 cells).
It is not a block state, because vacancy needs evidence of an approved position (B-12).

## 7. The workspace

`/workspace`: an SVG map on a deep-navy canvas with three geographic levels, representative pins (section 7.1), a details panel (collapsible), a
searchable, filterable list of all 358 rows and all 345 official blocks, and local change controls.
Selection is by internal ID (`TU-…`, `GB-…`, `GD-…`, `ST-…`), kept in the URL hash, and the geographic
level is derived from the selection, so a shared link restores both.

**District navigator.** All 23 districts are listed A to Z with their outlined blocks (`20/22`), a thin bar of their blocks
by allocation state, and the same counts the details panel uses. Picking a row opens that district on the map (a
selection, like a click), and hovering or focusing a row outlines the district on the map. Where it appears depends on
the room, chosen in CSS by container queries on the workspace grid (no script, no layout shift): when the map frame is at
least 900 px wide (details panel closed, or a window of about 1470 px and more with it open) it is a 256 px rail inside the
map frame, with a summary of the current view (outline coverage, allocation bar, pin count) above the list; otherwise the
same list is in the details panel while nothing is selected.

**Names.** District names go beside their district; a name that does not fit gets a short leader line (60 px at most) only
if the line stays clear of every other name, line, marker and district dot. A name with no clean place becomes a dot and is
named on hover. Every district is named or dotted, and none is dropped.

| Level | What the map shows | How you get there |
| --- | --- | --- |
| State | The 23 district outlines, each named; with the allocation or data-quality layer, every outlined block shaded lightly (not clickable) | Start, "West Bengal" in the breadcrumb, Escape, Back |
| District | The district fitted to the map and its own blocks drawn and clickable, block names appearing as the map zooms in; neighbouring districts muted | Click a district, search, a list pick |
| Block | The block outlined (navy casing under a Molten Orange line, with a faint orange wash) inside its district; breadcrumb `West Bengal › District › Block` | Click a block, search, a list pick |

Zoom and drill-down are separate actions. The wheel, pinch, +/− and the zoom buttons only scale the
current view; choosing a district, a block or a breadcrumb changes the geographic context and fits the
map to it. A click on a block never moves the view; the "Fit selected block" button does. At state level
a block is not clickable (a click opens its district), and a block of another district cannot be
selected out of context.

The parent of a block is the district code the LGD block report prints for it (`GeoFeature.districtId`),
an explicit identifier. It is never derived from a name or from the workbook's `DISTRICT` column, which
is a sales-territory grouping. A row that is ambiguous, spelling-variant only or has no candidate gives no
district, and the map stays at state level for it. Two blocks with one name (Sankrail under Howrah and
under Jhargram) are two features with two IDs, told apart by district in search and selected by ID.

**Grid and scale.** The latitude and longitude grid is orientation only and starts hidden. The grid button in
the map controls (`aria-pressed`, keyboard operable) or the **G** key on the map shows it; it changes nothing
else. A scale bar derived from the layer's projection is always shown and labelled approximate. A selected area
is outlined in Molten Orange with a soft halo behind the outline (`data-glow`, pointer events off); the halo is
gone as soon as the selection is cleared.

**Layers** (a switch above the map): *Boundaries* (outlines and names), *Allocation status* (the four
states, restrained fills plus hatch for missing and conflicting) and *Data quality* (how well each block
is tied to the workbook: reviewed, provisional name link, contested, spelling variant, no row). Geographic
confidence and allocation status are never merged. Inside a district, the part of it with no block outline
is dotted and counted ("20 of 22 block outlines"): missing geography, not an unallocated area.

**Names.** Each label sits at the shape's stored anchor, the pole of inaccessibility of its largest part
(`geo/geometry.ts`, written into the layer by the build), never an average of coordinates. District
names come only from districts whose outline is tied by the LGD district code. At state level a name that
fits goes at its anchor, a crowded one moves to free space with a leader line, and a name with no room
(phones) is marked with a dot and shown on hover or selection. Inside a district, block names show only
where they fit inside their outline, so more appear as you zoom. Placement is recomputed when the view
changes, not on pointer movement, and is hidden while the map flies to a new view.

Without polygons it stays useful: the list and details work, a row with no boundary shows an
"unavailable area" notice, and district gaps show as hatching. If the layer file is missing,
invalid or refused, the map shows an explicit empty state and nothing is invented.

**Forms** (staffing, confirmed unallocated, geography-link review) write to an append-only local
change log in this browser's `localStorage`, each entry with a reason and a recorded-by value.
The workbook-derived data underneath is never modified; export, import and reset are provided.
Invalid entries are rejected with a reason; a damaged log is ignored.

### 7.1 Representative pins

A pin shows who the workbook lists for an area, on the map. It never shows where anyone is. The rules are in
`features/territory/representatives.ts` (pure functions, tested in `tests/unit/representatives.test.mts`).

| View | Pins | Position |
| --- | --- | --- |
| State overview | One **ASM** pin per sales territory that has a matched, drawn block and a named ASM (21 of 21 in the current data) | The stored label point of the matched member block nearest the middle of the territory's matched blocks. A real block of the territory, not an average |
| District or block view | One pin per official block in that district with a named person, from a matched row | That block's own label point |
| Sales territory selected | The block pins of that territory's own blocks; the map fits to them | Same |

- **Verified area anchors only.** A pin sits on `BoundaryShape.anchor`, the point the build already computes
  inside a drawn block. There is no fallback to a bounding box and no position from a name or label. With no
  anchor, nothing is pinned.
- **Not pinned:** a row that is ambiguous, weak, unlisted or excluded; a block with no outline; a block with
  only `Vacant` markers or no names. Nothing is guessed.
- **Look.** A pin is a small Molten Orange teardrop (15 by 20 px drawn, 24 by 28 px target, no text; an amber ring and dot
  mark a contested one). A group is a different shape and hue: a neutral slate "stacked card" with the count in white and
  no orange, so a count is never read as a person and orange keeps meaning one representative or the selection.
- **Grouping.** Markers whose 24 by 28 px targets would overlap join one numbered group, drawn at the member nearest the
  group's middle (always a real anchor), and split as the map zooms. Rows that share one block are one pin with
  both records, flagged, and never merged. A marker that would sit under a map button is left out until the map
  is moved, so no button is covered and no covered marker takes focus.
- **The panel** (click, Enter or Space on a pin): a non-modal dialog with the territory, block or area and
  district, each person with the workbook's role slot (`ASM`, `Primary 2`, `Secondary 1`, `DSO 3`), vacant slots
  as vacant, and notices. It takes focus, Escape closes it before the map goes up a level, and focus returns to
  the pin. Actions: show the row in the details panel, show a territory's blocks and pins, zoom to a group.
- **Implied information is marked with the word *Implied*:** a territory's ASM (read from the ASM cell of each
  row; the workbook has no territory-level record) and who reports to whom (people on one row sit under that
  row's ASM; no reporting line is recorded, B-08). A name is workbook text, and equal text on two rows is not a
  verified single person (B-25). Two ASM names on one territory, or a two-name ASM cell, are shown as undecided.
- **Warnings stay.** Every pin and the panel carry the provisional-position notice; the legend, the
  provisional-boundary banner and the coverage line are unchanged and always visible.
- **Names.** A pin's accessible name is the territory or block, never a person. Names appear only in the opened
  panel, and reach the browser exactly as before (section 8); no pin code reads a file or makes a request.

## 8. Security boundary, privacy and licence

The boundary is the machine. Nothing here is authentication, and nothing is meant to be reachable
from another computer. Each layer below is checked by a test (`tests/unit/local-boundary.test.mts`,
`tests/guardrails.test.ts`, and the browser tests).

| Layer | What it does | Limit |
| --- | --- | --- |
| Bind address | `npm run dev` and `npm run start` pass `-H 127.0.0.1`, so only this machine can connect. The Next.js default is `0.0.0.0`; a server started without the flag listens on every interface | `npx next dev` run by hand bypasses the npm script |
| Host check | `src/proxy.ts` answers 403 to any request whose `Host` is not `localhost`, `127.0.0.1` or `[::1]`, for every path. This stops a DNS-rebinding page from reading the app through a visitor's browser, and use of a mistakenly exposed server by name or LAN address | A client on the network can forge the header, so this does not replace the bind address |
| No data in `public/` | Generated data lives in `data/generated/`. The boundary layer is served by a route handler, the dataset only inside server-rendered pages. A guard test fails if any JSON, spreadsheet, CSV or geographic file appears in `public/` | |
| No staff names in static assets | `npm run verify:build` and a browser test scan `public/` and `.next/static` for every staff name in the dataset (227 distinct strings, matched whole and case-sensitively) and for the layer's dataset ID, and the browser test also checks every script, style, font and image the page actually downloads | See the first limitation below |
| No outbound requests from the app | The app makes one request, a same-origin `fetch` of `/geo/boundaries.json`. A browser test asserts every request goes to the app's own host. `scripts/fetch-osm.mts` is the only project code that reaches the network, and a test pins what it may send | The details panel has one link to `openstreetmap.org/relation/<id>`; it makes no request until a person clicks it, and carries `noopener noreferrer` and a public relation ID only. **The Next.js build and dev tools make their own requests, listed below: this row is about the app and the project's code, not the tooling** |
| Sources | The four files in `data-source/` are hashed before and after every build and never written | |

- **Staff names are in the served pages.** `/` and `/workspace` are prerendered with the full
  dataset so the forms and counts work in the browser, so the page HTML and payload contain the
  names (8 files under `.next/server` in the last build). They are not in `public/` or any file the
  page downloads as an asset. Serving them is the point of the workspace, and the bind address and
  host check are what keep them on this machine. Sending the browser only what each view needs,
  instead of the whole dataset, is future work; any deployment must add real access control first.
- Boundary data is © OpenStreetMap contributors under the ODbL. Legal review of internal
  multi-user use and of LGD reuse is **not recorded**. The data is derived from the public
  Overpass API; no staff or workbook data was sent to it.
- **Network use by the tooling** (checked 2026-10-15; see the next subsection). The app does not
  make these requests and none carries project data, but they exist and an earlier version of this
  section said otherwise: it stated that the dev server's sockets were all loopback with none
  outbound. That was wrong. The dev server contacts the npm registry (below); the earlier check
  missed a short-lived connection.
- Earlier availability probes sent the requester's company address in a `User-Agent` header
  (Phase 0F, section 10; [security-notes.md](security-notes.md), SN-1). No request from this work
  carries it, and a test rejects any address in code, tests, scripts or docs.

### Network use by the tooling

Measured on 2026-10-15 (Windows 11, Node 24.14.1, Next.js 16.4.1 with Turbopack). A request listed here
is made by Next.js, not by the app or the project's scripts. **None of them carries workbook, staff or
boundary data.** Method: the `next build` process's TCP connections were sampled during builds and each
was attributed to its owning process; JavaScript-level connections were also logged from inside the
process with their call stacks; and for telemetry, how every Next.js telemetry object was configured was
logged, each with a control run, with the telemetry endpoint intercepted locally so that nothing was sent
during those tests.

| Host | Made by, when | What it sends | If it cannot be reached | Turn it off |
| --- | --- | --- | --- | --- |
| `fonts.googleapis.com` (two CSS URLs, Geist and Geist Mono) and `fonts.gstatic.com` (the font files) | `next build`, by `next/font/google` in `src/app/layout.tsx`. **On a cold build only:** seen with `.next/cache` and `.next/turbopack` absent; a build with them present made no connection to Google | An HTTPS GET for each URL; the font family and weight range are in the query string | **The build fails** ("Failed to fetch Geist from Google Fonts", exit 1). Observed by forcing the connection through an unreachable proxy with a cold cache. There is no fallback in a build | Not done, because it is a change to `layout.tsx` and not a cleanup: switch to `next/font/local` with the font files committed. Until then, a cold build (fresh checkout, deleted `.next`, new machine) needs access to those two hosts |
| `registry.npmjs.org` | `next build` (every build, warm or cold) and `next dev` (at start-up). The default `experimental.agentUpgrade: 'security'` of Next.js 16.4 | Per the Next.js source: a `POST` to the advisory endpoint with `{"next": [<installed Next.js version>]}` and a `GET` of the `next` package metadata (build), a `GET` of `/-/package/next/dist-tags` (dev). Package name and version only. The dev connections were observed; the request bodies were read from the source, not captured | Ignored. The build warns "Could not check Next.js security advisories" and carries on; the dev check treats the result as unknown | `experimental: { agentUpgrade: false }` in `next.config.ts` stops the reminders (documented by Next.js). Not set: it is a security-advisory feature and turning it off is a decision, not a cleanup. The dev-server staleness check has no switch that was found |
| `telemetry.nextjs.org` | The Next.js CLI | Anonymous usage events | n/a | **Off.** `.env` sets `NEXT_TELEMETRY_DISABLED=1`; see below |

**Telemetry.** Without `.env`, a build made 8 attempts to reach `telemetry.nextjs.org` (intercepted
locally; nothing was sent). With `.env` it made none, and the `next dev` server and the helper that
flushes a dev session's events were disabled the same way, each against a control run. Limits:

- The `next dev` launcher process does not read `.env`, so its own telemetry object is enabled. It
  only queues a "session stopped" event; the helper that would send it does read `.env` (checked).
  In this setup that helper also never finds the queued file (it looks in `.next/dev/cache`, the
  launcher writes to `.next/cache`), so nothing was sent in any run, but that is a Next.js quirk and
  not a guarantee. `npx next telemetry disable` would also close it, for every project on the machine;
  it was not run because the task was this project only.
- `next start` creates no telemetry object at all.
- `.env` is git-ignored (`.env*`) and holds no secrets. On a fresh checkout or another machine it has
  to be created again (one line: `NEXT_TELEMETRY_DISABLED=1`).
- `NEXT_TELEMETRY_DEBUG=1` prints events even when telemetry is disabled in this Next.js version, so it
  cannot be used to test the setting. A first test of this kind gave a false reading for that reason.

The browser never contacts Google: the page loads the fonts from the app's own origin (a browser test
asserts that every request goes to the app's host). `npm install` and `npm run data:fetch-osm` also use
the network and are the only other steps that do.

## 9. Open decisions this does not settle

B-18 (legal: ODbL and LGD reuse), B-26 (named crosswalk reviewer and sign-off), B-12 and B-28
(what counts as allocated, vacant and white space), B-23 (rule for a block under two sales
territories), B-24 (meaning of `-W` and urban labels), B-20 and B-06 (Kolkata, Kalimpong, ward
scope), B-25 (importing staff names), B-15 and B-16 (access and hosting). Provisional rules are
isolated in `src/features/territory/state.ts` so they can change in one place.

## 10. Reconciliation of the two implementations

Two implementations had been built in parallel. Neither imported the other; they shared only the
`MapWorkspace` frame.

| | Gate P0 (`/territory-map`) | Prototype (`/`, `/workspace`) |
| --- | --- | --- |
| Data | None. A test layer of abstract shapes in development only | Real workbook rows, LGD districts and blocks, provisional OSM outlines |
| Map | SVG renderer with zoom, pan, fit, keys | SVG renderer with the same, plus selection from lists, deep links and gap notices |
| Allocation | A disabled form layout; five display states | Local append-only change log with working forms; four states |
| Pipeline and tests | Unit tests of the contract and maths | Data pipeline, crosswalk, unit, data-integrity and browser tests |

**Kept:** the prototype, as the one implementation. **Folded in from Gate P0:** the rule that the
map never reads as complete (the coverage line), the viewport edge cases (a zero, negative or
non-finite zoom factor no longer corrupts the view; tests added), and the guard on `public/`.
**Changed for consistency:** the guard test that had been failing on purpose now passes because the
boundary layer moved out of `public/`; the rule it states (no data served from `public/`) is
unchanged, and the localhost-only boundary of section 8 is tested beside it. The Gate P0 rule
"no boundary data may exist" no longer applies, by the project's decision to allow provisional
OpenStreetMap outlines locally.

**Removed on 2026-10-15,** with the owner's explicit approval of this exact list (29 files):

- `src/features/map/` (types, layer contract, viewport, selection, allocation states, coverage, components)
- `src/app/territory-map/` (`page.tsx`, `fixture-preview/page.tsx`)
- `src/components/dashboard/MapPlaceholder.tsx` and `ContextPanel.tsx` (unused)
- `tests/fixtures/abstract-layer.ts` and the Gate P0 tests `tests/{allocation-state,boundary-layer,coverage,fixture,selection,viewport}.test.ts`

**Backup.** Before anything was deleted, each of the 29 files was copied, with its timestamps, to
`D:\Shakambhari\TerritoryIQ-backups\gate-p0-removal-2026-10-15\removed\` (the same relative paths),
and the copies were compared with the originals by SHA-256 with no difference. `MANIFEST.txt` there
lists every path with its hash and size; `removed-paths.txt` is the bare list; `modified-originals\`
holds the pre-edit copy of each other file this cleanup changed (below). The folder is outside the
project so that no test, type check or lint run sees it. The project is not under version control, so
this folder is the only record of the removed code: keep it.

**Dependency check before deleting.** Nothing in the prototype (`src/` outside the removed set)
imported any removed file. Three active items did, and the removal could not leave them as they were:

| Item | What it did with the removed files | What was done |
| --- | --- | --- |
| `tests/guardrails.test.ts` | Imported the fixture and `scripts/verify-build-output.mjs` at load, and read `src/app/territory-map/*` as text, so it would not load | Edited, not deleted. Removed 7 cases whose subject no longer exists: the `territory-map` page check, the four "fixtures stay out of production" cases, and the Gate-P0-only "no external URL" and "no network call" checks (`tests/unit/local-boundary.test.mts` enforces stricter versions of both over all of `src/`). Kept, retargeted from Gate P0 code to all of `src/`: no map library, no `User-Agent` set. Kept unchanged: no data in `public/`, no email address anywhere, runtime dependencies pinned |
| `package.json` | `verify:fixture` ran `scripts/verify-build-output.mjs`, and `verify:build` ran it first | Removed `verify:fixture`. `verify:build` now runs `verify:assets` only (the staff-name and data-file scan) and keeps its name |
| `scripts/verify-build-output.mjs` | Imports the fixture, so it can no longer run | **Left in place, not deleted** (it was not on the approved list). It is now an orphan: nothing calls it and it fails if run. Delete it when convenient |

`/territory-map` and everything under it still answer with a temporary (307) redirect to `/workspace`:
the redirect lives in `next.config.ts`, runs before routing, and does not depend on any removed file.
Its browser test stays. The suite shrank because of this removal: 104 tests belonged to the six deleted
files and 7 were the guardrail cases above; every other test name is unchanged except two guardrail
cases, renamed from "Gate P0 code ..." to "application code ...".

## 11. Remaining limitations

- **Outlines are provisional and partial.** 23 of 23 districts and 309 of 345 blocks. 36 blocks have
  no same-named OSM relation in their district (spelling variants such as `Mahishadal` and
  `Mahisadal`); variants are listed as suggestions in `build-report.json`, never applied. No ward or
  urban-body polygons exist (Kolkata 209, Howrah 68), and there is no official boundary source.
- **The crosswalk is unreviewed.** Of 358 rows: 298 provisional (one exact-name block), 3 ambiguous,
  43 weak, 14 none. No row is confirmed until a named reviewer does it (B-26). 80 rows reach no outline.
- **Allocation definitions are provisional** (B-12, B-28), and local changes live in one browser's
  `localStorage`; there is no shared store, no database and no authentication.
- **Legal status is not settled.** ODbL obligations for internal multi-user use, and LGD reuse terms,
  are unreviewed (B-18).
- **Names reach the browser.** See section 8. Not suitable for any shared or hosted setting as is.
- **No deployment path.** Not built, tested or secured for production, and not intended to be.
- **A cold build needs the network.** Google Fonts (and, on every build, the npm registry) are
  contacted by the Next.js tooling; a cold build with no route to Google fails. Section 8 has the
  table, what each request sends, and what is and is not switched off.
- **Telemetry is off only through `.env`.** It must be recreated on a fresh checkout, and the `next dev`
  launcher process does not read it (section 8, with the limits).
- **Incident SN-4 is not closed retrospectively.** The server now binds `127.0.0.1` and was checked
  (one listener, `127.0.0.1:3000`; the machine's own LAN address and `[::1]` refuse the connection).
  That says nothing about the hours when a server listened on every interface. Whether anything
  reached it in that time is undetermined, as [security-notes.md](security-notes.md) records.
- **Pins are only as good as the crosswalk.** They exist for matched rows (298 provisional, none reviewed) and
  sit on provisional outlines. The ASM shown for a territory comes from the rows that are matched to a drawn
  block (for example 17 of 25 in one territory), not from all of them, and the panel says so. A pin is not a
  location, a verified person or a confirmed assignment, and no reporting line exists in the source.
- **Accessibility.** On-screen pan buttons now exist (section 7 and
  [ui-foundation.md](ui-foundation.md)), which was the known gap against WCAG 2.5.7. What remains:
  the automated checks (axe, in the browser tests) are not a conformance audit and, as
  ui-foundation.md already says, do not cover contrast over the map or screen-reader behaviour; no
  person or assistive technology has tested the map; and the map still blocks page scroll under the
  pointer (wheel) and under a finger (touch), a known trade-off recorded in ui-foundation.md.
- **One orphan script.** `scripts/verify-build-output.mjs` (section 10) cannot run and is not called.
