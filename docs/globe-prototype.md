# Globe prototype

Status as of 2026-10-17: ported onto an integration branch cut from `origin/main` 3acb994 and awaiting review. It is
**not linked from the navigation and is not the default entry**: `/globe-prototype` is reached only by its address, the
Territory Workspace and its map are unchanged, and nothing here has been committed or pushed. Written for the people
reviewing it before any decision to make it the entry experience.

Product direction (decided): the globe is meant to become the **geographic entry experience**; the existing 2D
Territory Workspace stays for detailed operational analysis. Neither is replaced or modified in this prototype phase.

## What it is

A realistic 3D Earth built with Three.js that turns slowly on its own, flies smoothly to a place you choose,
stops, and then reveals provisional district or block outlines coloured by whether a named representative is
linked. It runs entirely from local files and makes no request off this machine; the only script request is one
same-origin GET of `/geo/globe-boundaries.json`, the globe's own outline file (see "Geometry"). The textures and
that file load independently (see "Loading order and failures").

| State | What happens |
| --- | --- |
| Rotating | The Earth turns (about one turn in three minutes, eased in). A small marker shows the one place that can be chosen before any outline exists: West Bengal. Dragging turns the globe by hand; the spin pauses, then eases back. |
| Selecting | Search, the place list, the marker, an outline, or the keyboard. The spin is suspended and the camera flies by the shortest way round on an eased path with no overshoot. Selecting again mid-flight starts from where the camera is. |
| Arrived | The camera holds perfectly still (the frame loop stops rendering). Only then are outlines revealed: districts for West Bengal, validated blocks for a district, representative details for a block. Outlines draw in west to east with a fade. |
| Reset | "Return to globe" fades the outlines, flies home and resumes the spin. "Back" and `Esc` go up one level. |

Reduced motion: no idle spin, and a selection completes at once with the outlines shown (once they are validated). No
WebGL: the same places, search and details with a static picture of the Earth, and no outline request. A texture that
fails to load gives an error and a "Try again" button. If the outline data cannot be loaded or validated, the globe
still renders, turns and flies and the searchable places list works; no outline is drawn, the reason is on screen and
"Try again" retries the outline data alone.

## Loading order and failures

The globe and the outline data start together and are kept apart:

| Part | Starts | Fails with | Retry |
| --- | --- | --- | --- |
| Textures and WebGL (`GlobeRenderer.create`) | on mount | the globe's own error panel ("The globe could not be shown", the file that failed) | "Try again" in that panel: textures only; the outline data is not fetched again |
| Outline data (`fetchBoundaryLayer`, then `mergeLayer`) | on mount, in parallel | a strip under the globe: "Outline data" with the reason | "Try again" in the strip: the outline data only; the textures are not loaded again |

- **While the outline data loads** the globe renders, turns and can be flown; the strip says "Loading and validating".
- **Reveal.** Outlines are revealed only when both are done: the camera has arrived and is held (the location
  transition), and the outline file has been fetched, integrity-checked by the server and joined to the validated
  manifest (the geographic validation). Whichever finishes last triggers the reveal (`outline-gate.ts`, `canReveal`).
  Arriving first announces "outlines appear when it is ready"; validation finishing first waits for the flight.
- **If the outline data fails** (not built, refused by the server, another dataset, a failed join, network error) no outline
  is ever drawn, the strip says why with a retry, and the globe and the list keep working. A retry that succeeds while the
  camera is already at a place reveals that place's outlines at once.
- **If the textures fail** the stage shows its error and retry. The outline strip is independent and shows its own
  state, so a loaded outline file is not lost or fetched again by the texture retry.
- **Disposal.** When one texture fails the others that did load are disposed, the renderer and its WebGL context are
  released, so a retry starts from nothing. Leaving the page disposes the renderer and aborts the outline request; a
  retry builds a fresh renderer.

## Run it

```text
npm install                                  # adds three and @types/three, pinned
npm run data:build                           # existing step; writes data/generated/{dataset,boundaries}.json
python -I scripts/globe/build_overlay.py     # validates; writes data/generated/globe-overlay.json and globe-boundaries.json
npm run dev                                  # then open http://127.0.0.1:3000/globe-prototype
```

Rebuilding the data needs a server restart (dev) or a new build (production), as for the workspace.
The textures are already in `public/globe/`. To regenerate them (the only network use, see below):

```text
python -m venv <dir> ; <dir>/bin/pip install pillow numpy       # build-time only, not project dependencies
python -I scripts/globe/fetch_textures.py --raw-dir <new empty folder>
python -I scripts/globe/fetch_textures.py --raw-dir <same folder> --skip-download   # re-derive without downloading
```

Checks: `npm run check` (typecheck, lint, unit tests), `npm run build`, `npm run verify:build`, and
`npm run test:e2e` (builds on `.next`; the globe tests run Chrome with software WebGL and write screenshots to the
folder named by `GLOBE_SHOTS`).

## Files

```text
src/app/globe-prototype/page.tsx            Server page: reads the overlay, hands it to the lazy loader
src/app/geo/globe-boundaries.json/route.ts  GET /geo/globe-boundaries.json: the globe's own file, checked on every request
src/features/globe/
  types.ts                                  Manifest (page props) and overlay (manifest + path data) types, the record type
  overlay.server.ts                         Server-only read of data/generated/globe-overlay.json (no path data in it)
  classification.ts                         The white rule: no "no-representative" without an approved reviewed record (pure)
  layer-identity.ts                         File name and kind of the globe's outline file, shared by server and browser
  layer-integrity.ts                        Server only: checks the file against the manifest (SHA-256, identity, structure) and answers
  layer-client.ts                           The one request: same-origin GET of /geo/globe-boundaries.json, literal URL
  layer-merge.ts                            Validates the served layer and joins it to the manifest; refuses mismatches (pure)
  outline-gate.ts                           When outlines may be revealed, and what the page says meanwhile (pure)
  geo-math.ts                               Sphere conventions, face rotation, framing distances (pure)
  camera.ts                                 Idle / flying / arrived state machine (pure)
  shapes.ts                                 Outline decode (reuses features/geo layer + projection), hit tests (pure)
  styles.ts                                 Colour semantics, selected and hover colours (pure)
  targets.ts                                Places, search, arrow-key order (pure)
  shaders.ts                                Earth, cloud and atmosphere GLSL
  GlobeRenderer.ts                          Scene, textures, overlay meshes, picking, labels, frame loop, disposal
  components/GlobeLoader.tsx                next/dynamic, ssr:false, error boundary
  components/GlobeExperience.tsx            Starts the textures and the outline data independently; stage, keyboard, HUD, legend, outline strip
  components/GlobePanel.tsx                 Search, place list, details
  components/GlobeFallback.tsx              No-WebGL view
scripts/globe/build_overlay.py              Validation and classification (offline); writes the manifest and the globe's outline file
scripts/globe/fetch_textures.py             One-time NASA download and derivation
scripts/globe/texture-manifest.json         Provenance of the textures and of the globe's outline data: sources, dates, sizes, SHA-256
public/globe/*.jpg|png                      Derived textures (images only; no data files)
docs/no-representative-record.md            Proposed reviewed-record schema (no record exists)
docs/schemas/no-representative-record.schema.json   The same, as JSON Schema
tests/unit/globe-{math,overlay,layer-merge,layer-integrity,outline-gate,reviewed-record,network-guard,guards}.test.mts
tests/unit/helpers/network-guard.mts, tests/e2e/globe.test.mts
```

Outside new files the diff touches `package.json`, `package-lock.json`, one test in `tests/guardrails.test.ts` and
the network guard in `tests/unit/local-boundary.test.mts` (widened by one named request, see "Geometry"). No application
file of the Territory Workspace changes, and the workspace's `/geo/boundaries.json` route, file and payload are untouched.

## Geometry and what it is allowed to claim

- **Source.** The outlines are the provisional OpenStreetMap shapes (`data/generated/boundaries.json`, ODbL 1.0,
  snapshots 2026-10-15) that passed the validation below. They are community-sourced and **not an official boundary**;
  the Phase 0D source gate has not passed any polygon source, and this prototype does not change that. Every screen that
  shows an outline says "Provisional outlines" and carries the attribution.
- **The globe's own file.** `/geo/boundaries.json` serves the workspace's dataset, which is not the dataset the globe
  was validated against. The globe therefore has its own file, `data/generated/globe-boundaries.json`, written by
  `build_overlay.py` in the layer's own format and holding exactly the 332 shapes that passed validation (23 districts, 309
  blocks), under its own `meta.datasetId` (`globe-osm-west-bengal-admin-5-6`) and `meta.kind`
  (`globe-validated-outlines`), with a `derivedFrom` record naming the workspace file it was cut from (by SHA-256). The
  manifest records its SHA-256, dataset ID, kind and shape count. Nothing in it depends on the build time, so the same
  input gives the same bytes. Its provenance record is `outlineData` in `scripts/globe/texture-manifest.json`.
- **Delivery.** The path data is not in the page and not in `public/`. The browser fetches it from the new route
  `/geo/globe-boundaries.json` (`src/app/geo/globe-boundaries.json/route.ts`). The route reads the file on every request
  (it is a dynamic route) and serves it only if it still matches the manifest: dataset ID and kind (`identity`), SHA-256
  (`tampered`), and structure and shape set, meaning only validated units, each once, the recorded count (`invalid`). A
  missing file or an unbuilt manifest gives 404 (`missing`, `unavailable`); the others 500. A refusal carries a code and a
  plain sentence and none of the file. Responses carry `Cache-Control: no-store` and `nosniff`. The workspace's
  `/geo/boundaries.json` route, file and payload are unchanged (a browser test fetches both and compares bytes). The page
  carries only the validated manifest: the classification, the staff names for the details panel, and for each outline a
  summary (bounding box, label point, vertex count).
- **The request.** One `fetch` in `src/features/globe/layer-client.ts`: the literal relative URL
  `/geo/globe-boundaries.json`, `GET`, the same options as the workspace (`cache: "no-cache"`, an abort signal), no URL
  parameter, no header, no body, no credentials. The repository's network guard allows exactly two `fetch` calls in the
  app, by file name and exact URL: the workspace to `/geo/boundaries.json` and this client to `/geo/globe-boundaries.json`.
  Each file must hold one `fetch` of its own literal constant, so neither may ask for the other's URL, and the client may
  take no URL argument. The rule is a function (`tests/unit/helpers/network-guard.mts`); `tests/unit/globe-network-guard.test.mts`
  runs it over the real source and over synthetic code to show it still blocks an external URL, an arbitrary or built
  `fetch` URL, XHR, WebSocket, EventSource, `sendBeacon`, geolocation, a second `fetch` in an allowed file, and a new file
  that copies the allowed code. The browser test records the script requests of a real page load and expects exactly
  `GET /geo/globe-boundaries.json`, and no outline request at all without WebGL.
- **What is checked before an outline is drawn** (`layer-merge.ts`, tested against tampered files in
  `tests/unit/globe-layer-merge.test.mts` and `globe-layer-integrity.test.mts`): the file passes the workspace's own
  structural check (provenance, `Provisional` status, snapshot date, no repeated or unknown unit, well-formed paths and
  boxes); it is the globe's dataset (ID and kind), so the workspace's layer is refused here as well; the licence and
  attribution match the manifest; and each outline decodes to the extent and vertex count the manifest validated, and
  (blocks) has its label point inside its parent district's outline. An outline that fails keeps its colour state, is not
  drawn, says why, and is listed. A shape the manifest rejected is never drawn, even though it is in the served file.
- **Coordinates.** `build_overlay.py` decodes each shape and converts the layer's planar Mercator coordinates to
  longitude / latitude (WGS84 degrees) with its own inverse. The browser converts with the existing, tested
  `decodePath` and `layerToLngLat`. `tests/unit/globe-overlay.test.mts` checks the two agree to the manifest's 5
  decimals for all 332 shapes.
- **Validation (a failing shape is not drawn).** Coordinates finite and inside the West Bengal search envelope used to
  fetch the layer; every ring has at least three distinct points and non-zero area; the feature ID exists in the LGD
  list; and each block's label point lies inside its parent district's outline. Result on the current data: 23 of 23
  districts and 309 of 345 blocks validated, 0 rejected, 0 parent failures. The other 36 blocks have no outline in the
  source layer and are listed as "no outline", never drawn.
- **The West Bengal target** is the union of the 23 validated district boxes (85.82 E to 89.88 E, 21.55 N to
  27.22 N). The layer has no state polygon, so none is drawn; the marker and the flight use the box.
- **Relationship to the workbook.** A workbook row is tied to an official block only by the existing crosswalk (an
  unreviewed exact-name match). The workbook `DISTRICT` column is a sales territory and is never used to join to a
  polygon; the details panel shows it labelled "Sales territory". Districts are linked to blocks by LGD parent codes.

## Colour semantics

Implemented in `scripts/globe/build_overlay.py` (classification) and `src/features/globe/styles.ts` (colour).

| Colour | Meaning here | Current data |
| --- | --- | --- |
| Royal blue (district) | At least one block has a provisional representative-linked block. **This does not imply complete coverage, and no link is officially verified.** The legend, the panel and the style description say so. | 21 of 23 |
| Orange (block) | A workbook row is linked by exact name (provisional, unreviewed) and lists at least one named person. | 294 blocks, 274 drawn |
| White | Explicitly confirmed to have no associated representative, by an approved reviewed record. Legend only until such a record exists. | **0.** See below |
| Grey (unresolved) | No row linked, a linked row with no named person, only an ambiguous or weak candidate, or no validated outline. Never read as "unrepresented", "Vacant" or "Unallocated". | 51 blocks (+2 districts) |
| Gold line | Selected boundary. | |
| Teal line | Hover or keyboard focus. | |
| Pale line | Polygon edge. | |

- **White stays in the legend and the styles, and no white polygon is drawn.** It means "confirmed to have no
  associated representative", which needs a reviewed source record. The base data holds none, a missing row or a
  `Vacant` marker is never read as one, and the reviewer's browser-local change log is not read, parsed or imported.
  There are two locks: `build_overlay.py` has no path that emits the state, and the app (`classification.ts`, applied on
  the server where the manifest is read and again when the layer is joined) shows any `no-representative` unit that
  lacks an approved, in-force record for that very unit as unresolved, in the neutral style, with the reason on screen.
  The legend row says "none yet; needs a reviewed source record". Unresolved and ambiguous records keep the neutral grey.
  The proposed record schema (stable unit identifier and type, the explicit assertion, source and provenance, effective
  date, review status) is in [`docs/no-representative-record.md`](no-representative-record.md) and
  `docs/schemas/no-representative-record.schema.json`. It is a proposal: no record exists, none is fabricated, and the
  tests use synthetic fixtures that are never written anywhere.
- Four blocks are linked by more than one workbook row; they are flagged "contested" and the rows are listed
  separately, not merged.
- The colours do not touch the allocation classifications (`Assigned`, `Vacant`, `Unallocated`,
  `Data Missing / Unknown`); the panel says so and a test keeps those names out of the colour code.

## Texture provenance

All imagery is NASA Earth Observatory. Downloaded once on **2026-10-16 12:35 UTC** with `scripts/globe/fetch_textures.py`
(generic User-Agent `TerritoryIQ-local-prototype/0.1`, one host, no other request). NASA Visible Earth's old
`visibleearth.nasa.gov` pages now redirect to `science.nasa.gov/earth/earth-observatory/`, which is where the
assets are published; the files come from `assets.science.nasa.gov`.

| File served from `public/globe/` | Source | Derivation | SHA-256 | Bytes |
| --- | --- | --- | --- | --- |
| `earth-day-8k.jpg` (8192 x 4096) | Blue Marble: Next Generation with Topography and Bathymetry, July (2004 composite), 21600 x 10800 | Lanczos downsample, JPEG q88 | `d59ef7b5…0054` | 4,275,018 |
| `earth-day-4k.jpg` (4096 x 2048) | same | Lanczos downsample of the above; used when the GPU or device cannot hold 8k | `79a0de4e…e805` | 1,251,618 |
| `earth-clouds.jpg` (2048 x 1024) | Blue Marble 2001 to 2002 global cloud composite, `cloud_combined_2048.jpg` | greyscale | `5e37e4ca…ff8e` | 759,290 |
| `earth-ocean-mask.png` (2048 x 1024) | derived from the day image | ocean where `blue - red > 14`; blurred | `d0068e7b…c4c5` | 215,690 |

Source files (kept outside the project): the 21600 x 10800 JPEG, 27,201,049 bytes, SHA-256
`d225f1f35a6448a4d1d8f6de6e48f3433e470085b70a35800e64f384f269a7b0`, from
`https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407.3x21600x10800.jpg`
(page: `https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry`);
the cloud JPEG, 829,367 bytes, SHA-256 `daddaad84d7a33bbbc86cdda3f591099f57cee8607b7bcf3b67eb7e4f7a1c793`, from
`https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/images/cloud_combined_2048.jpg`
(page: `https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/`).
Full hashes of every file are in `scripts/globe/texture-manifest.json`, and a unit test fails if a file in
`public/globe/` stops matching it.

- **Attribution** (shown on screen): "Earth: NASA Earth Observatory, Blue Marble." The page asks that users "credit
  NASA Earth Observatory"; credits on the pages are Reto Stockli (land, shallow water, clouds), NASA Goddard Space
  Flight Center, with data from MODIS.
- **Licence.** The two asset pages carry no licence text of their own. NASA's media guidelines
  (`https://www.nasa.gov/nasa-brand-center/images-and-media/`) say NASA content is "generally ... not subject to copyright
  in the United States", editorial use is broadly allowed, a commercial use "must not explicitly or implicitly convey
  NASA's endorsement", and third-party material is marked with its holder. No third-party mark was found on these
  two assets. This is the reading of a developer, not legal advice; anyone shipping this beyond a local prototype
  should have the guidelines read for the intended use.
- **What the imagery is not.** The cloud layer is a 2001 composite, not weather. The day image is a 2004 composite,
  not a current photograph. Both are decoration.
- **No regional or higher-resolution imagery.** Not approved for this prototype. An earlier build blended a native
  resolution crop of the same NASA image over eastern India (60 px per degree); that crop, its shader path, its entry in
  the provenance manifest and the file are removed, and a guard test fails if the renderer names any texture other
  than the four above. Imagery for district and block zoom needs its own source, resolution, licence and attribution
  review.

## Outline data provenance

Not a download: generated offline from the workspace's boundary layer and verified by hash. Recorded under
`outlineData` in `scripts/globe/texture-manifest.json`, and checked against the files by a unit test.

| Item | Value |
| --- | --- |
| File | `data/generated/globe-boundaries.json` (server only; not in `public/`), served at `/geo/globe-boundaries.json` |
| Dataset ID, kind | `globe-osm-west-bengal-admin-5-6`, `globe-validated-outlines` |
| SHA-256 | `312522fb1c70bcbf82bb71d04162c7a83acef07bcd8c36efa6e117ef97b21f0a` (571,960 bytes) |
| Content | 332 shapes: 23 districts, 309 blocks; every one passed validation |
| Cut from | `data/generated/boundaries.json`, SHA-256 `0aa9cf109043ee9e56baaadd5675f656da6c44baddec1c27a4ace99f6510a7a6` (574,032 bytes), the workspace's layer, unchanged |
| Source | OpenStreetMap via the public Overpass API, `admin_level` 5 and 6 boundary relations; snapshots 2026-10-15T09:56:24Z, 09:57:29Z, 09:58:31Z |
| Licence and credit | ODbL 1.0; "© OpenStreetMap contributors", shown on screen |
| Status | Provisional, unofficial, community-sourced; ODbL legal review not recorded |

## Reproducing the outline data

`data/` is git-ignored, so a clean checkout has no outline file. It is rebuilt, not downloaded, from inputs that are
pinned by hash, and a copy that does not match is refused at run time:

```text
npm run data:verify                          # the four data-source/ files against their recorded SHA-256 values
npm run data:build                           # data/generated/boundaries.json from data-source/ and data/raw/osm/
python -I scripts/globe/build_overlay.py     # data/generated/globe-boundaries.json and globe-overlay.json
```

- **Inputs that must be supplied.** `data-source/` (confidential workbooks, never committed) and `data/raw/osm/` (the 26
  Overpass responses, fetched once by `npm run data:fetch-osm`, the only network step and not repeated here). Their
  SHA-256 values are recorded in `scripts/lib/sources.ts` (workbooks) and in `boundaries.json` (`meta.rawSha256`, checked: all 26 match). A fresh Overpass
  fetch is a different snapshot and would not reproduce these bytes; supply the 2026-10-15 snapshots instead.
- **Result, checked on 2026-10-17 in a fresh copy.** `data:build` rebuilt `boundaries.json` as SHA-256 `0aa9cf10…a7a6`
  (identical to the file the globe was validated against) and `build_overlay.py` wrote `globe-boundaries.json` as
  `312522fb1c70bcbf82bb71d04162c7a83acef07bcd8c36efa6e117ef97b21f0a`, 571,960 bytes, 332 shapes, matching the
  manifest and `outlineData` above. It contains no build time, so it is byte-stable. `dataset.json` and
  `globe-overlay.json` carry a build time and so differ in hash on every build; nothing else in them changes, and only
  `globe-boundaries.json` is hash-checked at run time.
- **If the file is absent or differs** (not built, another dataset, edited) the route answers 404 or 500 with a code, no
  outline is drawn, and the globe, the place list and the retry strip keep working. Never replace it with the
  workspace's layer: that is refused as another dataset.

## Performance notes

Measured in this environment (software WebGL, so frame rate is not representative of a real GPU).

- **Lazy.** `three` and the renderer are one chunk (630 KB, 159 KB gzipped) loaded only on this route by `next/dynamic`
  with `ssr: false`; the workspace and overview pages do not reference it. WebGL never runs on the server.
- **Textures.** 8k day texture 4.3 MB over the wire, about 170 MB on the GPU with mipmaps; the 4k variant (1.3 MB, about
  45 MB) is used when the GPU's maximum texture size is under 8192 or the device reports 2 GB or less of memory.
  Anisotropy is capped at 8.
- **Pixel ratio** is capped at 2 (1.25 on devices reporting 4 or fewer cores or 4 GB or less) and steps down by 0.25 toward 1
  if frames stay slow while idle.
- **Frames.** Rendering stops when nothing changes: after arrival, with no hover change and no reveal running, the loop
  does no GPU work. It also skips frames while the canvas is off screen or the tab is hidden.
- **Allocation.** Geometry and materials are built once per outline and cached; block outlines are built when a district
  is revealed and released after they fade out. Nothing is created per frame (a few small temporaries aside). On
  unmount, every geometry, material and texture is disposed, the renderer is disposed and its context released, and
  event listeners and observers are removed. Next.js keeps a page you navigate away from hidden; the cleanup runs then, and
  coming back builds a fresh globe (tested).
- **Page weight.** The page carries the 232 KB manifest (names, classification, outline summaries) and no path data.
  The 559 KB outline file is fetched from `/geo/globe-boundaries.json` in parallel with the textures: the globe no longer
  waits for it, and the outlines are revealed only once it has validated and the camera has arrived. The route hashes
  the file on each request (about 0.5 MB, a few milliseconds on this machine).
- **Fidelity limit.** The global texture is about 2 km per pixel at best. Zoomed to a district or block it is soft by
  nature, and now softer over eastern India than in the earlier build, which had the regional crop; the camera never
  goes closer than 1.06 radii. Sharper views need imagery that has been through the review above.

## Accessibility

- The globe stage is focusable. `Enter` flies to West Bengal; once outlines show, arrow keys step through them in
  west-to-east order, `Enter` selects, `Esc` goes back; each step is named on screen and announced in a polite live region.
- Search and the place list are buttons and a search box, and drive everything the pointer does. No information is
  carried by colour alone: the panel states the status in words for every selection.
- Status, errors and the loading state use `role="status"` / `role="alert"`. axe-core (WCAG 2.2 AA and best practice)
  reports no violations on the whole globe, on West Bengal, and on a district.
- Reduced motion is honoured (no idle spin, no flight, no draw-in).

## Verification (isolated copy of `origin/main`, 3acb994)

Run on 2026-10-16 in the isolated copy (`D:\Shakambhari\_iso\globe`), after the outline-endpoint, independent-loading and
record-schema changes:

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx eslint` | clean |
| `npm test` (unit, guards, network guard) | 337 tests, 337 pass, 0 fail, 0 skipped |
| `npm run build` | passes; `/geo/globe-boundaries.json` is dynamic (ƒ), `/geo/boundaries.json` is still static (○) |
| `npm run verify:build` | OK: no staff name or layer dataset ID in public assets or static chunks, and no data file in `public/` |
| `npm run test:e2e` (whole suite, real Chrome, software WebGL) | 99 tests, 99 pass, 0 fail, 0 skipped (the 22 globe tests, including the real-route tampered, swapped and missing file, plus the existing 77 workspace tests) |
| Texture SHA-256 | all four `public/globe` files match `scripts/globe/texture-manifest.json` |
| Outline data SHA-256 | `globe-boundaries.json` and its source layer match the manifest's `outlineData` record and the overlay manifest's `inputs` |

The NASA source downloads themselves were kept outside the project and are no longer on this machine, so their hashes in the
manifest were not re-checked against the files in this pass; the derived textures that are served were.

## Open questions for integration

Decided on 2026-10-16 and reflected above: white stays in the legend with no white polygon until a reviewed source record
exists (the local change log is not read); the outlines come from a dedicated same-origin route,
`/geo/globe-boundaries.json`, that serves only the validated globe dataset, and the network guard allows exactly that
one extra request; the outline data and the textures load independently; no higher-resolution imagery; the globe is the
entry experience and the 2D workspace stays for detailed analysis.

Still open for integration:

1. Approval of the proposed record schema, and the reviewed source it would come from (it would feed `confirmation` in
   the manifest through a reviewed build step, not through the browser). Until then nothing is white.
2. How the globe hands a selection to the workspace (for example by its hash), without changing the workspace.
3. Whether the route should keep re-reading and hashing the file on every request in an integrated build, or read it once
   at start and trade the "altered while running" check for a restart.
