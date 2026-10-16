# UI foundation

The Phase 0A shell: tokens, layout areas and conventions. The shell and tokens are unchanged; the
pages built on them now show real data (see [prototype.md](prototype.md)). Sections below say which
parts are shared shell and which are the prototype's.

## Surfaces

The interface mixes two surface families on a light page canvas:

- **Navy**: the top navigation bar and the whole map workspace (frame, toolbar, search, controls, legend).
- **Light**: KPI cards, the details panel, lists and the page canvas.

There is no OS dark-mode variant (`color-scheme: light` on the page). The map frame opts into navy with
the `.map-theme` class in `globals.css`, which redefines the surface, line and ink variables for everything
inside it, so the toolbar, search, controls and legend need no second set of classes. The map itself is a
deep-navy canvas with a soft lifted centre (`MAP_BACKDROP`, a CSS gradient: no image, no request), an
approximate scale bar, an optional latitude and longitude grid (hidden by default; the grid button in the map
controls, or the G key on the map, shows it), pale names with a navy halo, subtle teal
for assigned areas (`#14B8A6`), blue for confirmed unallocated, and navy-hatched or amber-hatched patterns
for missing and conflicting data. **Molten Orange (`#E8622A`) is reserved for the selection and the
representative pins**, so it means nothing else: on a selected region, a soft orange halo (two wide, faint
strokes behind the outline, with no blur filter so zooming stays cheap), then a faint orange wash, a navy casing
and the orange line on top. The glow never takes a click and exists only while something is selected. Its colours live in `features/territory/map-style.ts`.

## Tokens

Defined in `src/app/globals.css` under `@theme` and usable as Tailwind
utilities (`bg-navy-950`, `text-ink-muted`, ...).

| Token                 | Value     | Use                                         |
| --------------------- | --------- | ------------------------------------------- |
| `navy-950`            | `#0B1220` | Primary navy: nav bar, map workspace        |
| `ember` / `ember-soft` | `#E8622A` / `#F08A5D` | Molten Orange: selection and representative pins only (5.5:1 on navy-950) |
| `navy-900/800/700`    | `#111A2E` / `#18233B` / `#223152` | Navy elevations               |
| `accent`              | `#14B8A6` | Teal accent: fills, graphics, text on navy  |
| `accent-ink`          | `#0F766E` | Teal text on light surfaces                 |
| `gold-400` / `gold-700` / `gold-50` | `#E2B93B` / `#8A6508` / `#FBF5E4` | Selection highlight only |
| `canvas`, `surface`, `surface-muted` | `#F4F6FA`, `#FFFFFF`, `#F8FAFC` | Light surfaces |
| `ink`, `ink-muted`, `ink-subtle` | `#0B1220`, `#475569`, `#64748B` | Text on light |
| `on-navy`, `-muted`, `-subtle` | `#FFFFFF`, `#CBD5E1`, `#94A3B8` | Text on navy |

Rules that keep contrast valid (ratios computed against WCAG 2.x):

- Never use `accent` (`#14B8A6`) as text on light: 2.5:1. Use `accent-ink` (5.5:1 on white).
- `ink-subtle` only on `surface` / `surface-muted` (4.5–4.8:1), never on `canvas`.
- Gold is for *selected* state only, and stays restrained.

## Layout areas

| Area | Component | Notes |
| --- | --- | --- |
| Page frame | `layout/AppShell` | Skip link, nav, `<main id="main">`, footer |
| Top navigation | `layout/TopNav` | Driven by `NAV_ITEMS` in `src/lib/site.ts`. Only built routes are links; planned modules are non-interactive text |
| Page heading | `layout/PageHeader` | Title, description, optional aside |
| KPI cards | `dashboard/KpiCard` | Omit `value` for an empty state, never fake one |
| Map frame | `dashboard/MapWorkspace` | Navy (`.map-theme`) frame with a toolbar, a footer strip, and the map surface as `children`; takes most of the viewport height from `lg` |
| Map toolbar | `features/territory/components/MapToolbar` | Breadcrumb, level, back, layer switch, Representatives pin toggle, district and block search (`MapSearch`), details toggle |
| Overview | `features/territory/components/OverviewDashboard` | Counts by allocation state, territory table, link statuses, known gaps, provenance |
| Territory map | `features/territory/components/GeoMap` | SVG map of the validated boundary layer; an explicit empty state if the layer is missing, refused or unloaded |
| Map legend | `features/territory/components/MapLegend` | Three tiers. First what the colours mean (the layer's states or confidence levels, the dotted gap, selection, the pin when shown); then the provisional wording and OpenStreetMap attribution; then the coverage warning, set apart by an amber rule. Always visible |
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
  deployment") and on each page.

## Responsive behaviour

- Navigation shares a row with the brand and status badge from `xl` (1280px).
  Below that it takes its own row; on phones it scrolls horizontally.
- KPI cards: 1 column, then 2 (`sm`), then 4 (`xl`).
- Map and details panel sit side by side from `lg` (1024px), stacked below.

## Gotcha

Inside a scroll container (`overflow-x-auto`), absolutely positioned children
such as `sr-only` text escape its clipping unless the container is positioned.
`TopNav`'s `<nav>` is `relative` for this reason; removing that widens the page
by hundreds of pixels on phones.

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
