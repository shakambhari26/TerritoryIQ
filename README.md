# TerritoryIQ — Sales Territory Intelligence Platform

Web platform for sales territory mapping, allocation and analytics.

**Status: localhost-only prototype. Not deployed, not for deployment.** One working
implementation, built from real company and Local Government Directory (LGD) data:

- `/` — overview: real counts from the workbook and the LGD lists, with the four
  allocation states (allocated, confirmed unallocated, missing / unverified, conflicting)
  kept apart. Under the heading, an "Explore on the globe" card links to `/globe` (provisional,
  unofficial outlines) and to the 2D workspace; it is shown whether or not the data is built.
- `/workspace` — the map and the work around it: a light state, district and block map (23 named districts, their blocks on drill-down, three layers, search), provisional OpenStreetMap outlines for 23
  districts and 309 of 345 blocks, an explicit workbook-row-to-official-unit crosswalk, a details
  panel, searchable lists of all 358 rows and 345 official blocks, and local allocation and
  review forms.
- `/geo/boundaries.json` — the boundary layer, served by a route handler (not a static file).
- `/territory-map` — retired. It redirects to `/workspace`. See [Reconciliation](#reconciliation).

Outlines are **provisional**: community-sourced, linked to official blocks by exact name,
unreviewed, and shown with OpenStreetMap attribution. Unresolved matches and geographic gaps are
kept and shown, never filled in. Details, limits and open decisions:
[docs/prototype.md](docs/prototype.md).

## Getting started

Requires Node.js `>=20.9.0` (developed on Node 24, npm 11; the `.ts` tests need Node 22.18+).

```bash
npm install
npm run data:verify   # the four data-source/ files against their recorded SHA-256 values
npm run data:build    # build data/generated/ from data-source/ and data/raw/osm/
npm run dev           # http://127.0.0.1:3000  (bound to this machine only)
```

`data/` is git-ignored: it holds staff names from the workbook. Restart the server after
`data:build`; for a production build, run `npm run build` again.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server, bound to `127.0.0.1` only |
| `npm run build` | Production build |
| `npm run start` | Serve the production build, bound to `127.0.0.1` only |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`, strict mode) |
| `npm test` | The canonical non-browser suite: unit, data-integrity and guard tests (Node built-in runner) |
| `npm run check` | Typecheck, lint and `npm test` |
| `npm run test:e2e` | Browser tests against the production build (installed Chrome or Edge); needs `data:build` and `build` first. Set `E2E_BASE_URL` to test a running server instead |
| `npm run verify:build` | After `build`: no staff name, layer ID or data file is a public asset. The same check as `verify:assets`, kept under the name the docs have always used (the Gate P0 fixture scan it used to include was removed with the fixture) |
| `npm run verify:assets` | The public-asset scan on its own |
| `npm run data:verify` | Check the four `data-source/` files against their recorded SHA-256 values |
| `npm run data:fetch-osm` | Download district and block outlines once (the only script that uses the network) |
| `npm run data:build` | Build `data/generated/` from the sources. Writes nothing to `data-source/` or `public/` |

**Network use by the tooling (not the app).** The app itself makes no external request. The build and
dev tools do, and none carries project data: `next build` fetches the Geist fonts from Google Fonts
(`next/font/google` in `src/app/layout.tsx`; needs the network on a cold build, not on a cached one),
and both `next build` and `next dev` contact the npm registry (a security-advisory and version check).
Next.js telemetry is switched off for this project by `.env` (`NEXT_TELEMETRY_DISABLED=1`). What each
request is, what it sends, what happens offline and how to turn each off:
[docs/prototype.md](docs/prototype.md), section 8.

## Stack

Next.js 16 (App Router, Turbopack, Cache Components) · React 19 · TypeScript (strict) ·
Tailwind CSS 4 · ESLint 9. The map is a dependency-free SVG renderer. Everything else in the
architecture doc (MapLibre, PostGIS/Supabase, Power BI, Excel import, authentication) is
**proposed, not implemented**.

## Layout

```text
src/app/         Routes (/, /workspace, /globe, /geo/boundaries.json, /geo/globe-boundaries.json), layout, design tokens
src/proxy.ts     Refuses any request whose Host header is not loopback
src/components/  Reusable UI (layout/, ui/, dashboard/)
src/features/    territory/ (domain, model, UI), geo/ (matching, geometry, OSM linking), allocation/ (local change log)
src/lib/         Site config, navigation, loopback host check
scripts/         Data pipeline: verify sources, fetch outlines, build the dataset; build-output scans
data/            Generated and fetched data (git-ignored; holds staff names)
.env             Local settings (git-ignored): turns Next.js telemetry off. No secrets belong here
data-source/     The four original files (read-only; hashes recorded in scripts/lib/sources.ts)
docs/            Prototype, architecture, security notes, data audit
tests/           unit/ (canonical suite), e2e/ (browser), guardrails.test.ts
```

## Reconciliation

Two implementations had been built side by side. They shared no domain code:

| | Kept | Retired |
| --- | --- | --- |
| Map and workspace | `/workspace` (`src/features/territory`, `geo`, `allocation`): real data, provisional outlines, selection, zoom and pan, lists, forms | `/territory-map` (the Gate P0 data-free layout preview, `src/features/map`) |
| Data | The pipeline in `scripts/`, with the crosswalk and the four allocation states | Gate P0's abstract test layer and its five-state display |
| Tests | `tests/unit`, `tests/e2e`, plus the new localhost-boundary tests | Gate P0's map tests |

From the Gate P0 work, the "never imply full coverage" disclosure now sits under the map, the
`zoomAt` edge cases were added to the viewport tests and code, and the guard on `public/` was
kept and enforced (generated data moved to `data/generated/`).

**Removed on 2026-10-15** (29 files, with the owner's explicit approval): `src/features/map/`,
`src/app/territory-map/`, `src/components/dashboard/{MapPlaceholder,ContextPanel}.tsx`,
`tests/fixtures/` and the six Gate P0 unit-test files at the top of `tests/`. Nothing in the
prototype imported any of it. A copy of every removed file, with SHA-256 values, is outside the
project at `D:\Shakambhari\TerritoryIQ-backups\gate-p0-removal-2026-10-15\` (the project is not under
version control, so keep it). `/territory-map` still answers with a redirect to `/workspace`
(`next.config.ts`). What else changed because of the removal, and one script that is now an
orphan, are in [docs/prototype.md](docs/prototype.md), section 10.

## Documentation

- [docs/prototype.md](docs/prototype.md) — the prototype: data flow, crosswalk, boundaries, states, security boundary, limitations
- [docs/architecture.md](docs/architecture.md) — what is implemented, what is proposed
- [docs/ui-foundation.md](docs/ui-foundation.md) — design tokens, layout areas, accessibility notes
- [docs/security-notes.md](docs/security-notes.md) — security events and safeguards
- [tests/README.md](tests/README.md) — what each test file covers and how to run it
- [docs/data-audit/](docs/data-audit/) — the Phase 0 audit records (historical)

## Note for contributors and coding agents

This Next.js version differs from older releases. [AGENTS.md](AGENTS.md) points to the
version-matched docs bundled in `node_modules/next/dist/docs/`; read the relevant guide before
changing framework-level code.
