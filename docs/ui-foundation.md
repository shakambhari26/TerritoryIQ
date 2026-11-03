# UI foundation

The Phase 0A shell: tokens, layout areas and conventions. The light-theme redesign replaced the earlier navy surfaces and tokens; the
pages built on them show real data (see [prototype.md](prototype.md)). Sections below say which
parts are shared shell and which are the prototype's.

## Surfaces

One light theme on every page (`color-scheme: light`; there is no OS dark-mode variant). Three surface levels: the page
`canvas` (#F5F8FC), white `surface` cards with a 1px `line` border and a 16px radius, and `surface-muted` wells
(#EFF4F8) for segmented controls and status strips. Shadows stay faint (`shadow-card`, `shadow-float` for floating map
controls); there is no glass or blur. The top navigation is white with a bottom border; the active page is a light-blue
pill with an underline.

The map is a light geographic canvas (`MAP_BACKDROP`, a CSS gradient: no image, no request) with an approximate scale
bar, an optional latitude and longitude grid (hidden by default; the grid button, or the G key on the map, shows it),
dark names with a white halo, white strokes between shaded blocks and slate district outlines. Colours live in
`features/territory/map-style.ts`: teal for allocated, blue for confirmed unallocated, grey hatch for missing or
unverified, amber cross-hatch for conflicting data. **Primary blue (`#2563EB`) is the selection** (a faint blue halo,
a white casing and the blue line) and **orange (`#EA580C`) is reserved for representative pins**, so neither means
anything else. The Globe keeps its realistic Earth on a soft sky gradient behind a transparent canvas; its selected
outline is white because it is drawn on satellite imagery under blue, orange and grey fills.

## Tokens

Defined in `src/app/globals.css` under `@theme` and usable as Tailwind utilities (`bg-primary`, `text-ink-muted`, ...).

| Token | Value | Use |
| --- | --- | --- |
| `canvas`, `surface`, `surface-muted` | `#F5F8FC`, `#FFFFFF`, `#EFF4F8` | Page, cards, secondary wells |
| `line`, `line-strong` | `#DCE5EF`, `#C5D2E1` | 1px borders, input borders |
| `ink`, `ink-muted`, `ink-subtle` | `#172B4D`, `#475569`, `#64748B` | Primary text; secondary text (also on tinted surfaces); small captions on white only |
| `primary`, `primary-hover`, `primary-soft`, `primary-ink` | `#2563EB`, `#1D4ED8`, `#EAF1FF`, `#1D4ED8` | Actions, active navigation, selection; text on light |
| `accent`, `accent-ink`, `accent-soft` | `#0F8B78`, `#0B6B5D`, `#E3F4F1` | Teal: allocated; teal text on light |
| `warn`, `warn-ink`, `warn-soft`, `warn-line` | `#D97706`, `#92400E`, `#FEF3E2`, `#F3D09B` | Provisional states, conflicts, warnings only |
| `status-allocated/confirmed/missing/conflict` | `#0F8B78`, `#3973D6`, `#94A3B8`, `#D97706` | Data-status colours |
| `marker`, `selected` | `#EA580C`, `#2563EB` | Representative pins; selected outline |

Rules that keep contrast valid (ratios computed against WCAG 2.x):

- `ink-subtle` (4.8:1) only on white `surface`; on `canvas` or `surface-muted` use `ink-muted` (6.6:1 or better).
- Never use `accent` (`#0F8B78`, 4.2:1) as text: use `accent-ink`. Never use `warn` as text: use `warn-ink`.
- Amber means provisional, conflicting or warning. Orange means a representative pin. Nothing else uses them.
- Status is never shown by colour alone: each allocation state has a name, a fill pattern and an outline.

## Layout areas

| Area | Component | Notes |
| --- | --- | --- |
| Page frame | `layout/AppShell` | Skip link, the sidebar, `<main id="main">`, footer |
| Sidebar | `layout/Sidebar`, `layout/NavLink`, `layout/NavIcons` | The one `<nav aria-label="Primary">`. Driven by `NAV_ITEMS` in `src/lib/site.ts`: Overview, Globe, Workspace, then the planned modules (Allocation, Analytics, Data Import, each marked Soon). Only built routes are links; planned modules are non-interactive text. `NavLink` marks the one current page with `aria-current`. From `lg` it is a persistent left sidebar, 16 rem wide, or a 4.75 rem icon rail. Until the visitor chooses, the width decides, the same on every page: the rail from `lg` to below `2xl` (so a laptop's map keeps its width) and the labelled sidebar from `2xl`. The Collapse button makes the choice, which is kept in `localStorage` and applies on every page and reload. The rule is the `rail:` variant in `globals.css`, driven by `data-rail` on the `<aside>` (`on`, `off`, `auto`), so there is no flash on first paint. Below `lg` the same element is an off-canvas drawer opened from a slim top bar (Escape, the scrim or any link, including the current page's own, closes it; the page behind does not scroll; closed, it takes no focus). Its search field filters the page list and is a plain text input, not `type="search"`, because each page's own place or area search is the page's one `searchbox` |
| Globe page | `app/globe`, `features/globe/components/` | The 3D globe (lazy, browser-only). The page carries the "Local prototype · not for deployment" badge and a standing notice that outlines are provisional, unofficial OpenStreetMap geometry and not official boundaries. The details panel's "Open in 2D workspace" link hands a selected place to the workspace by URL hash. See [globe-prototype.md](globe-prototype.md) |
| Globe entry card | `dashboard/GlobeEntryCard` | Server component on the Overview, between the page heading and the dashboard, and the Overview's main geographic visual. Heading "Explore on the globe", a "Provisional outlines" badge, a permanent notice (unofficial OpenStreetMap geometry, not official boundaries, no complete district or block coverage) and two links: "Explore on the globe" to `/globe` and "Go to the 2D workspace" to `/workspace`. The Earth beside the text is a small still picture (a CSS background) with `RotatingEarth` turning over it: a 2D canvas drawing a sphere from one 54 KB world map, one turn in two minutes, stopped off screen, in a hidden tab and under reduced motion (the still picture stays). No SVG, no data, no Three.js, so it says nothing about any place. Stacked below `lg` with full-width links under `sm` (each at least 44 px high); from `lg`, text on the left and the sphere on a pale-blue panel on the right |
| Page heading | `layout/PageHeader` | Title, description, optional aside; `compact` is one slim line (the workspace uses it so the map starts higher) |
| KPI cards | `dashboard/KpiCard` | Omit `value` for an empty state, never fake one |
| Map frame | `dashboard/MapWorkspace` | White card with a toolbar, a status strip, an optional left `rail`, the map surface as `children` and a footer strip (the legend); takes the viewport height under the compact page heading from `lg` |
| District navigator | `features/territory/components/DistrictNavigator` | The 23 districts with outlined-block counts and a mini allocation bar. A 256 px left panel in the map frame when the frame is 900 px or wider (1500 px of grid with the details panel open, so from a window of about 1565 px), else a list in the details panel (CSS container queries, `layout-classes.ts`); hover or focus outlines the district on the map |
| Map toolbar | `features/territory/components/MapToolbar` | Breadcrumb, level, back, layer switch, Representatives pin toggle, district and block search (`MapSearch`), details toggle |
| Overview | `features/territory/components/OverviewDashboard` | Counts by allocation state, territory table, link statuses, known gaps, provenance |
| Territory map | `features/territory/components/GeoMap` | SVG map of the validated boundary layer; an explicit empty state if the layer is missing, refused or unloaded |
| Map legend | `features/territory/components/MapLegend` | A compact white strip that can be folded away ("Hide key"). Three tiers. First what the colours mean (the layer's states or confidence levels, the dotted gap, selection, the pin when shown); then the provisional wording and OpenStreetMap attribution; then the coverage warning, set apart by an amber rule. The key starts open; the provisional wording and attribution are always visible |
| Representative pins | `features/territory/components/RepresentativePins`, `RepresentativesPanel` | Pins are real `<button>`s over the map (keyboard, accessible name, at least 24 px); a click opens a non-modal dialog that takes focus and returns it to the pin on Escape. Rules in `features/territory/representatives.ts` |
| Lists | `features/territory/components/AreaList` | Searchable, filterable rows and official blocks; the keyboard route to selection |
| Details panel | `features/territory/components/DetailsPanel` | Selected row, official unit or sales territory, with the allocation state and the reason |
| Forms | `features/territory/components/forms`, `LocalChangesBar` | Staffing, confirmed unallocated, geography-link review; local, append-only, with export, import and reset |

## Conventions

- Planned modules in the nav carry a "Soon" `Badge` and are non-interactive text, not links, until
  their route exists. Flip `status` to `"available"` and add an `href` to enable.
- KPI values render `—` with screen-reader text "No value yet" when there is no value. Never
  fake one.
- Allocation states are never shown by colour alone: each has a name, a fill pattern and an
  outline (legend, lists, details panel, bars).
- Motion follows `prefers-reduced-motion`: the global rule shortens every transition, and the map also stops
  its fly-to, its fades and the pins' entrance when the visitor asks for less (`lib/use-reduced-motion.ts`).
- An area with no boundary is a hatched gap with a stated reason, never a drawn guess. Outlines are
  always called provisional, with the OpenStreetMap attribution and the coverage line on screen.
- The app is a localhost prototype and says so in the top bar ("Local prototype · not for
  deployment") and on each page. The globe page repeats it and adds the provisional-outline notice; neither the badge nor the
  notice may be dropped while the geography is unofficial and the app is not approved for deployment.

## Responsive behaviour

- Navigation shares a row with the brand and status badge from `xl` (1280px).
  Below that it takes its own row; on phones it scrolls horizontally. Globe comes first, so it is on screen at 390px.
- KPI cards: 1 column, then 2 (`sm`), then 4 (`xl`).
- Map and details panel sit side by side from `lg` (1024px), stacked below.

## Gotcha

Inside a scroll container (`overflow-x-auto`), absolutely positioned children
such as `sr-only` text escape its clipping unless the container is positioned.
The sidebar's `<nav>` is `relative` for this reason; removing that lets the planned items' hidden text widen the page.

## Map controls and accessibility (`/workspace`)

- Buttons (top right): zoom in, zoom out, fit entire state, fit selected district, fit selected block,
  reset view (to the current level), and a "Pan map" group of four arrow buttons (bottom left) that move
  the view by the same step and in the same directions as the arrow keys. The map itself is a focusable
  group; keys on it are plus, minus, 0 (fit the state), the arrow keys (pan) and Escape (up one level).
  The controls are smaller below 560px, and the label placer keeps names clear of them.
- The breadcrumb, the Back button, the layer switch and the search box sit above the map. Search is a
  combobox (arrow keys, Enter, Escape) and, inside a district, is limited to that district's blocks until
  "Only in …" is cleared. On a phone the details panel opens below the map (a "Details ↓" button scrolls to it).
- The drawn graphic is hidden from assistive technology. The searchable area list and the details
  panel are the equivalent route to every selection, and selecting from them moves the map.
- Pointer: drag pans, two-finger pinch zooms, and the mouse wheel zooms at the pointer.
  **Trade-offs:** the page does not scroll while the pointer is over the map (wheel) or a finger
  is on it (touch). Panning without dragging used to rely on the arrow keys alone, because the pan
  buttons of the retired Gate P0 map were not carried over (the WCAG 2.5.7 gap). The "Pan map" buttons
  close that gap; a browser test covers their step, direction, keyboard use and that they select
  nothing. They are checked by axe and by eye at 1440 and 390 px wide (no overlap with the zoom
  buttons), not by a person using an assistive technology.
- Selection lives in the URL hash (`#unit=`, `#feature=`, `#territory=`), so a view can be shared and
  reloaded.

## Verification

Phase 0A (shell), recorded then:

- Typecheck, ESLint and production build pass.
- Rendered at 360, 390, 768, 820, 1024, 1280 and 1440px: no horizontal page
  overflow.
- axe-core (WCAG 2.0/2.1/2.2 A/AA + best practices): 0 violations.

The browser tests (`npm run test:e2e`) now repeat the checks that can be automated on the built
app: axe with no serious or critical violation on `/` and `/workspace` (the details and forms
disclosures opened), and no horizontal overflow at 390px. They do not cover contrast over the map,
screen-reader behaviour or WCAG 2.5.7.
