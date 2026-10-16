# Phase 0F Gate P0: completion record

> **Superseded in part, 2026-10-15 (later).** The project moved to a localhost-only prototype
> with no P0/P1/P2 approval gates, and the Gate P0 map and the prototype were reconciled into one
> implementation (`/workspace`). The `/territory-map` route now redirects there, the boundary layer
> moved out of `public/` so the guard test described in section 6, item 1 passes, and the rule
> that no boundary data may exist no longer applies to the local prototype. This record is kept as
> written below, as the account of what Gate P0 built and verified at the time. For the current
> state see [../prototype.md](../prototype.md), sections 8 and 10, and
> [../security-notes.md](../security-notes.md).

**Status: Gate P0 build delivered for the approved scope. One Gate P0 guardrail test fails, because of files this work did not create (section 6, item 1). Gate P1 has not begun. Gate P2 remains no-go.** This record approves nothing and is not legal advice.

Date: 2026-10-15. Builds on [phase-0f-mvp-feasibility.md](phase-0f-mvp-feasibility.md) (section 5, section 6 and the Gate P0 table in section 8). Security events are in [../security-notes.md](../security-notes.md).

## 1. Approval as received

The project requester's instruction in the working session, 2026-10-15, was: approve Phase 0F Gate P0 only; proceed with polygon-independent work (the map component and empty-state data contract, zoom and fit controls, selection by internal ID, the territory details panel, and the allocation form layout); leave the four files in `data-source/`, their recorded hashes and existing allocation business logic alone; keep Gate P1 conditional and do not start geographic data integration until the licence and legal review, source approval, geometry validation and the workbook-to-geography crosswalk review are complete, with name-only matches never sufficient; keep Gate P2 at no-go and never present statewide geography, including Kolkata and Howrah wards, as complete or verified; keep allocated, confirmed unallocated, missing or unverified, and conflicting data distinct; record the User-Agent email disclosure and its mitigation; report before declaring P0 complete; and do not begin P1 automatically.

No approver is named. As with every earlier phase, this is requester input and not a recorded formal decision. The sponsor should name themself in the decision log.

**Existing allocation business logic:** the repository had none before this work (no allocation code existed under `src/`), so none was modified. The allocation-state code here is new.

## 2. What was built

| Work item | Where | Notes |
| --- | --- | --- |
| Map component | `src/features/map/components/TerritoryMap.tsx` | Dependency-free SVG renderer. No external tiles, fonts or scripts, and nothing is fetched. Draws only the abstract coordinate space. With no layer it shows "No approved boundary layer" |
| Empty-state data contract | `src/features/map/types.ts`, `boundary-layer.ts`, `approved-layer.ts` | A layer is either a labelled `test-fixture` or an `approved-source` with required provenance (dataset ID, level, licence, attribution, vintage, retrieval time, SHA-256). Features are keyed by an internal unit ID with an optional LGD code. A longitude-latitude layer is refused because there is no projection. `getBoundaryLayerState()` is the only production source of a layer and returns "unavailable" |
| Zoom and fit | `viewport.ts`, `MapControls.tsx` | Zoom in and out (50% to 25,600% of fit), fit to screen, pan buttons, keyboard (plus, minus, 0, arrows, Escape), mouse drag, Control or Command plus wheel. A plain wheel is left to the page |
| Selection by internal ID | `selection.ts` | Exact ID match only: no name, case folding or trimming. Two units that share a label are told apart by ID. A unit list is the keyboard and screen-reader route to selection |
| Territory details panel | `TerritoryDetailsPanel.tsx`, `UnitList.tsx` | Shows ID, level, LGD code ("Not linked", with the name-only warning), geometry source, allocation state with its reason, confirmation record, conflicting claims. Sales-territory membership shows "Not available" until a signed-off crosswalk exists (B-26) |
| Allocation form layout | `AllocationFormLayout.tsx` | Layout only. Every control sits in a disabled fieldset, nothing is stored, there is no assignee or employee field, and responsibility categories are an empty list (data, not code: B-08) |
| Four-plus-one allocation states | `allocation-state.ts`, `state-appearance.tsx`, `AllocationStateBadge.tsx`, `MapLegend.tsx` | Assigned, Vacant approved position, Confirmed unallocated, Data missing / unverified, and Conflicting. Each has a name, a fill pattern and an outline, not only a colour |
| Coverage disclosure | `coverage.ts`, `CoverageDisclosure.tsx` | Always on screen. Statewide and urban-ward coverage are "Not established" in every case |
| Route and navigation | `src/app/territory-map/page.tsx`, `NavLink.tsx`, `site.ts` | `/territory-map` enabled. The old nav marked every available link as the current page, so `NavLink` marks only the matching one |
| Development-only preview | `src/app/territory-map/fixture-preview/page.tsx`, `tests/fixtures/abstract-layer.ts` | Ten abstract shapes marked "Test fixture, not geography". Returns 404 in production |

### How the allocation states are kept apart

- **No record is not an allocation.** A unit with no record, a blank state, or any unrecognised state, including the decision brief's short names "vacant" and "unallocated", shows as Data missing / unverified.
- **Confirmed unallocated needs its stored confirmation** (who, when, evidence, per the proposed data model). A claim without one is shown as Data missing / unverified, with the reason on screen.
- **Conflicting is its own state.** It lists every claim and is never resolved to one of them. Fewer than two claims still shows as Conflicting, with a note.
- **Allocated** (Assigned) and Vacant approved position have no evidence rule yet (B-12). They are shown as supplied. Nothing in this phase derives them from the workbook, and no data source feeds them.
- **Conflicting is an addition.** The requester's recorded four states (R2, B-28) do not include it, and the decision brief folds "ambiguous" evidence into Data Missing / Unknown. The Gate P0 instruction names conflicting data as a separate distinction, so it is built as a fifth, provisional state. B-28 needs amending to record it. Every state definition is flagged provisional in code and on screen.

### Choices made, for the sponsor to confirm or change

| Choice | Reason | Cost |
| --- | --- | --- |
| SVG renderer instead of MapLibre GL JS | No new dependency and no licence or WebGL question for a phase with no real data. The contract is engine-neutral | The map engine is decided again in Gate P1, when real geometry volume is known |
| No touch drag or pinch. Touch users pan with buttons | A drag handler would trap page scroll on phones. The buttons also satisfy WCAG 2.5.7 | Touch panning is less fluid |
| Abstract fixture lives in `tests/`, loaded only by a dev route | Gate P0 criterion 3 | The preview needs the dev server |
| `.ts` extensions in imports inside `src/features/map/*.ts` | Lets the unit tests run those files directly under Node, with no test-runner dependency | Slightly unusual import style, set in `tsconfig.json` |

## 3. Gate P0 criteria

| Criterion (phase-0f section 8) | Status |
| --- | --- |
| Sponsor approves this report and names the work items | **Requester instruction received** (section 1). Approver name not recorded |
| No geometry, real boundary or place data enters the repository | **Met by the Gate P0 changes.** Not met by the working tree as a whole: see section 6, item 1 |
| Fixtures are abstract, labelled, and excluded from production | **Met.** Evidence in section 4 |
| No Supabase and no employee data | **Met by the Gate P0 changes.** See section 6, item 2 for a data pipeline outside Gate P0 |

## 4. Verification

### Automated tests (`node --test`, no dependency added)

| Suite | Tests | Result |
| --- | --- | --- |
| `tests/viewport.test.ts` | 19 | pass |
| `tests/boundary-layer.test.ts` | 34 | pass |
| `tests/allocation-state.test.ts` | 24 | pass |
| `tests/selection.test.ts` | 10 | pass |
| `tests/coverage.test.ts` | 10 | pass |
| `tests/fixture.test.ts` | 7 | pass |
| `tests/guardrails.test.ts` | 14 | **13 pass, 1 fail** |
| **Gate P0 suites total** | **118** | **117 pass, 1 fail** |

The one failure is "nothing served from public/ can be boundary data", which reports `public/geo/boundaries.json`. It is a correct failure: see section 6, item 1. The other session's 75 unit tests in `tests/unit/` also pass; they were not written or reviewed here.

Covered: pan and zoom maths including anchor-point stability, clamping and degenerate sizes; the layer contract, including duplicate IDs, unclosed rings, non-finite coordinates, missing provenance, a bad SHA-256, a bad timestamp and a refused longitude-latitude layer; selection by ID with duplicate labels, near-miss IDs and stale IDs; every absence-to-allocation case; the coverage disclosure never claiming completeness; the fixture's labels and ranges; and guardrails for no geography files, no external URL, no network call, no map library, runtime dependencies exactly `next`, `react` and `react-dom`, no email address anywhere, no `User-Agent` header, and the fixture imported only in the non-production branch of the preview route.

### Other checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass (strict, with the stricter `verbatimModuleSyntax` and `erasableSyntaxOnly` the other session added) |
| `npm run lint` | 0 errors. 2 warnings, both unused variables in the other session's `src/features/geo/geometry.ts` |
| `npm run build` | Pass. `/territory-map` and `/territory-map/fixture-preview` prerender |
| `npm run verify:build` (new) | Pass: 204 files in `.next/static` and `.next/server` scanned for the fixture's dataset ID and every label (10 markers): none found. A test proves the scanner does find a planted marker |
| Production server, real browser (Chrome, headless), 30 checks | **30 of 30 pass.** Empty state; controls present but unavailable; no map group or shape; unit list, details and form say why; disclosure rows; form controls all in a disabled fieldset; one nav link `aria-current`; fixture route returns 404 and its page holds no fixture; only same-origin requests; no horizontal overflow at 360, 390, 768, 1024 and 1280 px; axe-core (WCAG 2.0 to 2.2 A and AA plus best practice) 0 violations at 1280 and 360 px |
| Development server, fixture preview, 46 checks | **46 of 46 pass.** Zoom, limits, fit, pan buttons, keyboard, Control-wheel, plain wheel left alone; selection by click and by list; twin units told apart by ID; confirmed claim without confirmation shown as Data missing; conflicting claims listed; clearing by button, empty click and Escape; drag pans and does not select; axe 0 violations with and without a selection; no hydration or console errors; no external request |

Browser checks were run from a script kept outside the repository (the session scratch folder), so they are not repeatable from the repo. The unit tests and `verify:build` are.

### Source-file hashes

All four files in `data-source/` match their recorded SHA-256 values, read read-only after all work and with unchanged sizes and modification times. Recorded in [geographic-crosswalk-review.md](geographic-crosswalk-review.md) and [workbook-inventory.md](workbook-inventory.md).

| File | SHA-256 | Result |
| --- | --- | --- |
| `AREA MAPPING.xlsx` | `85c7f6a02370562d0e38286f592a71014a61a365e68e9cb05dc10eac22295fe3` | unchanged |
| `LGD_West_Bengal_Development_Blocks_with_Covered_Villages_2026-10-15.xls` | `e266d8141fbcb2870d757f3cbbb4650e8ace1e553887c9bbb84444eb95fc3a36` | unchanged |
| `LGD_West_Bengal_Districts_2026-10-15.xls` | `6bfb026b79c85e7c171297c001dacc0f3df61422e28f0442818c222632591ce8` | unchanged |
| `README_provenance.txt` | `4e46ee0fc5333805a0bdcc139d55ceb4b5c9b8147792f945379384650343279b` | unchanged |

`data-source/` now also holds `~$AREA MAPPING.xlsx`, an Excel lock file (security-notes SN-3). The workbook is open in Excel. Close it without saving, because saving changes its hash.

## 5. Changed files

Measured against a snapshot of every project file taken before any change. There is no git repository here.

### Gate P0 work (this session)

Added:

- `src/features/map/`: `types.ts`, `allocation-state.ts`, `boundary-layer.ts`, `approved-layer.ts`, `coverage.ts`, `selection.ts`, `viewport.ts`
- `src/features/map/components/`: `TerritoryMap.tsx`, `TerritoryWorkbench.tsx`, `TerritoryDetailsPanel.tsx`, `UnitList.tsx`, `AllocationFormLayout.tsx`, `CoverageDisclosure.tsx`, `MapControls.tsx`, `MapEmptyState.tsx`, `MapLegend.tsx`, `AllocationStateBadge.tsx`, `state-appearance.tsx`
- `src/app/territory-map/page.tsx`, `src/app/territory-map/fixture-preview/page.tsx`
- `src/components/layout/NavLink.tsx`
- `tests/viewport.test.ts`, `boundary-layer.test.ts`, `allocation-state.test.ts`, `selection.test.ts`, `coverage.test.ts`, `fixture.test.ts`, `guardrails.test.ts`, `tests/fixtures/abstract-layer.ts`
- `scripts/verify-build-output.mjs`
- `docs/security-notes.md`, `docs/data-audit/phase-0f-gate-p0-completion.md`

Modified:

- `src/components/dashboard/MapWorkspace.tsx` (optional footer slot, taller minimum map area)
- `src/components/layout/TopNav.tsx` (uses `NavLink`, badge now reads "Pre-release · No data connected")
- `src/components/layout/AppShell.tsx` (footer text)
- `src/lib/site.ts` (Territory Map enabled)
- `package.json` (`test` and `verify:build` scripts; see below for shared edits)
- `tsconfig.json` (`allowImportingTsExtensions`; a duplicate key was removed)
- `README.md`, `docs/architecture.md`, `docs/ui-foundation.md`, `tests/README.md`, `src/features/README.md`

Not touched: `data-source/`, every earlier document in `docs/data-audit/`, `next.config.ts`, `src/app/page.tsx`, `src/app/layout.tsx`.

### Not from Gate P0 (another Claude session in the same directory)

A second session started work in this tree under a brief that says to continue without approval gates and to integrate district and block data locally. Its changes are listed so they are not mistaken for Gate P0. They were not written or reviewed here, and none was edited or deleted.

- Added: `public/geo/boundaries.json`; `scripts/build-data.mts`, `fetch-osm.mts`, `verify-sources.mts`, `scripts/lib/*` (7 files); `src/features/geo/*` (7 files); `src/features/territory/*` (3 files); `src/features/allocation/overlay.ts`; `tests/unit/*` (5 files); `data/` (git-ignored, about 25 MB raw OpenStreetMap responses plus generated output)
- Modified: `.gitignore`, `package.json` (`"type": "module"`, `data:*`, `check` and `test:e2e` scripts, loopback-only `dev` and `start`, `playwright-core` and `axe-core` dev dependencies, the merged `test` script), `package-lock.json`, `tsconfig.json` (`verbatimModuleSyntax`, `erasableSyntaxOnly`), `next-env.d.ts` (regenerated by Next)

## 6. Conflicts and facts that need the sponsor

1. **Real boundary data is in the app's `public/` folder.** `public/geo/boundaries.json` (562 KB of OpenStreetMap outlines) is served by Next. This breaks the Gate P0 criterion that no real boundary data enters the app, and it is Gate P1 work (legal review, source approval, geometry validation and crosswalk review are all unmet). `tests/guardrails.test.ts` fails on it on purpose. The other session says its brief tells it to proceed without gates, and it has agreed not to wire anything into the Gate P0 map. **Decision needed:** which brief is current. Until then nothing was moved or deleted.
2. **A data pipeline reads the workbook.** The other session reports a `data:build` step that writes staff names into `data/generated/` (git-ignored). Employee names are held back by B-25, and Gate P0 excludes employee data. That file was not opened here.
3. **`src/features/geo/crosswalk.ts`** exists and is name-based. The Gate P0 instruction says name-only matches are never sufficient.
4. **The Excel lock file** above.

## 7. Remaining gates and blockers (separate from the above)

### Gate P1: district-and-block pilot map. Not begun, conditional

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Written legal determination on OSM (ODbL) for internal multi-user use, with attribution and share-alike (B-18) | Not met |
| 2 | Written LGD confirmation, or legal's documented acceptance of the Copyright Policy (B-18, G-06) | Not met |
| 3 | Sponsor approves route B-27 and the label "indicative, community-sourced boundaries" | Not met |
| 4 | A pinned, hashed extract from a stable source with its snapshot date. Not live Overpass | Not met |
| 5 | Districts: 23 of 23 joined by LGD code in the pinned extract | Evidenced in Phase 0F, to repeat on the extract |
| 6 | Blocks: each drawn block has a reviewer-confirmed link to its LGD code. No unreviewed name-only link is drawn | Not met |
| 7 | Geometry validity checked on every drawn feature | Not met. The contract checks structure only |
| 8 | Crosswalk signed (B-26) for every row drawn | Not met |
| 9 | Depiction check for the state outline (G-07) | Not met |
| 10 | On-screen disclosure: attribution, snapshot date, list of unmapped units | Layout built here; no data behind it |

### Gate P2: statewide map including urban areas. No-go

Gate P1 unmet. No official or licensed ward polygons for Kolkata (209 wards) or Howrah (68 wards), and no recorded decision to show each as one unit (B-06, B-11). LGD urban-body and ward lists not obtained. Whole-body outlines for in-scope urban bodies not measured. B-20 scope not formally decided. **Nothing in this build says otherwise.**

### Business inputs (phase-0f section 7.1)

1. Crosswalk review and acceptance, with a named reviewer (B-26, B-23)
2. Meaning of `-W` and the ambiguous urban labels (B-24)
3. Rule for a unit listed under several territories (B-23)
4. Kolkata and Kalimpong in initial scope (B-20)
5. Allocation states and KPI denominators (B-12, B-28, B-14, B-06), now including whether **Conflicting** is adopted as a fifth state

### Approvals that are not business definitions (section 7.2)

B-18 legal determination; B-27 boundary-source route; B-19 map depth; written LGD confirmation of commercial reuse and hosting; B-15 and B-16 access and hosting (before any Supabase).

### Still waiting on, from earlier phases

Letters to MoPR, Survey of India, DST and the State (Phase 0D section 5); the LGD sub-district, urban-body and ward exports; security-notes items 5 to 8; B-25 before any employee name enters the system; Power BI.

## 8. Limits

- No legal advice. No licence was assessed.
- The map has only been drawn with abstract fixture shapes. Behaviour with 345 real blocks (list length, hit-testing, performance, label clutter) is untested.
- The browser checks used one browser (Chrome) at the widths listed. No Safari, Firefox or real touch device. No touch drag or pinch by design.
- axe-core reported "needs review" for colour contrast on the map surface; text over the decorative grid and the map fills were not evaluated automatically.
- The other session's code and data were not reviewed.
