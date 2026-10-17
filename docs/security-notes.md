# Security notes

Records security-relevant events and the safeguards in place. It is not legal advice. Privacy duties are assessed in [data-audit/phase-0d-privacy-and-deployment-assessment.md](data-audit/phase-0d-privacy-and-deployment-assessment.md), and company legal and security decide what applies.

Last updated: 2026-10-15 (Gate P0 code removal and final local verification). SN-2 is resolved. SN-4's
binding is corrected going forward, but **the earlier exposure is not resolved retrospectively**: what
reached that server then is undetermined. SN-6 now records the tooling's network use and corrects an
earlier statement about it. SN-1 is unchanged and SN-3 has an update. The current boundary is summarised
in [prototype.md](prototype.md), section 8.

## SN-1. Company email address sent in a User-Agent header

| Item | Record |
| --- | --- |
| What happened | The first five availability probes to public Overpass servers carried the requester's company email address in the `User-Agent` request header, by mistake. No later request did. Source: [data-audit/phase-0f-mvp-feasibility.md](data-audit/phase-0f-mvp-feasibility.md), section 10. |
| When | Phase 0F, 2026-10-15 |
| Data disclosed | One company email address, which identifies one person. The address is deliberately not repeated in this repository. |
| Disclosed to | The operators of the public Overpass servers, and any proxy or log between them. Their logs may retain it, and we cannot recall it. |
| Not disclosed | Workbook content, employee data, credentials, or the LGD files. The requests were read-only queries for map-feature tags. |
| Severity (our reading) | Low: one business address, no content. Irreversible: it may sit in third-party logs. Whether any notification duty applies is for company legal and security. |
| Detected | Reported in Phase 0F section 10 |

### Mitigation

| # | Measure | Status |
| --- | --- | --- |
| 1 | Stop sending it: later requests did not carry it | **Done.** Recorded in Phase 0F. The earlier requests cannot be re-tested |
| 2 | The application code sets no `User-Agent`, makes one same-origin request and loads nothing from outside the app (no tiles, fonts, scripts) | **In place.** The `User-Agent` rule is enforced by `tests/guardrails.test.ts`, the network rules by `tests/unit/local-boundary.test.mts` (the Gate P0 code this row first described was removed on 2026-10-15). Also seen in a browser run: every request went to the app's own origin. This covers the app, not the Next.js tooling (SN-6) |
| 3 | No email address may appear in code, tests, scripts, docs or root configuration | **In place.** Enforced by `tests/guardrails.test.ts`. The check is an email pattern, so it also stops a new address being added by hand |
| 4 | The fetch script written later by another session sets a generic `User-Agent` (`TerritoryIQ-local-prototype/0.1`) | **Observed**, not audited. Not part of Gate P0 |
| 5 | Tell the requester, and the company's security and legal contacts, that this happened, so they can decide whether anything further applies | **Recommended. Not done.** Nothing has been sent |
| 6 | Decide whether to ask the Overpass operators about log retention. No deletion is guaranteed, and no operator has been contacted | **Recommended. Not done** |
| 7 | Rule for any future outbound request: the `User-Agent` is the project name and version only. A contact address, if an operator requires one, is a role mailbox, never a person. The value lives in one constant | **Recommended.** Adopt before Gate P1 tooling is written |
| 8 | Send all future outbound HTTP through one helper that sets headers, so a guard test can inspect it | **Recommended**, for Gate P1 design |

## SN-2. Real boundary data in `public/`, served by the app. Resolved 2026-10-15

Observed during Gate P0, after another Claude session started work in the same directory under a brief with no approval gates. It bore on Gate P0 criterion 2 and on hosting.

| Item | Observation then | Now |
| --- | --- | --- |
| `public/geo/boundaries.json` (562,281 bytes) | OpenStreetMap district and block outlines in a folder Next serves verbatim at a URL, in `next start` and in any deployment | **Moved.** The layer is `data/generated/boundaries.json` (server only) and is delivered by the route handler `src/app/geo/boundaries.json/route.ts`. The old file was byte-identical (SHA-256 `A49939B7…6CC952`) and was removed; `public/` is empty |
| `data/raw/osm/` (about 25 MB), `data/raw/fetch-osm.log` | Raw OpenStreetMap responses | Unchanged: server only, git-ignored |
| `data/generated/dataset.json` | Generated dataset from `AREA MAPPING.xlsx`; holds staff names (B-25 open) | Unchanged: server only. It reaches the browser only inside the `/workspace` page and the globe manifest the local server renders; the Overview now receives a name-free subset (SN-5) |
| Git ignore | `/data/` and `/public/geo/` ignored, which does not stop `next start` serving `public/geo/` | The ignore entries stay as a backstop; the guard test now fails if any data file is in `public/` at all |

Decision: the project's direction is a localhost-only prototype that may show provisional OpenStreetMap outlines, with attribution and a clear provisional status. The Gate P0 rule that no boundary data may exist is retired for the prototype. What the guard test protects is that data is never a static public asset, and that is kept.

## SN-3. Excel lock file in `data-source/`

`data-source/~$AREA MAPPING.xlsx` (165 bytes, 2026-10-15 15:28) was an Excel owner-lock file: it meant someone had the workbook open, and **saving it from Excel would change its hash**. It was not created by this work.

Update, later on 2026-10-15: the lock file is no longer in `data-source/`, and the four source files match their recorded hashes (`npm run data:verify`; modification times 10:44 and 13:07, before this reconciliation). The risk returns whenever the workbook is opened in Excel, so open a copy.

## SN-4. A development server on all interfaces. Binding corrected 2026-10-15; the exposure itself is not resolved

| Item | Record |
| --- | --- |
| What happened | A `next dev` for this project (PID 26400, started 11:16 on 2026-10-15 by `npm run dev` before the script gained `-H 127.0.0.1`) was listening on `::`, that is every interface. The Next.js default hostname is `0.0.0.0`. The pages it served include the staff names from the workbook |
| Evidence | The listener's command line was `node …\TerritoryIQ\node_modules\next\dist\server\lib\start-server.js`, its parent `next dev` with no `-H`, its grandparent `npm run dev`. At inspection its only connection was the local browser (Chrome's network service, over `::1`). No external connection was seen at that moment |
| Action | The process tree was stopped, and the server restarted with `npm run dev`, which now listens on `127.0.0.1:3000` only (checked with `Get-NetTCPConnection`) |
| Whether anything reached it | Not determined. There is no access log for the period. Windows Firewall rules were not inspected, so exposure to the local network cannot be ruled out for those hours |
| Prevention | `dev` and `start` bind `127.0.0.1`; `src/proxy.ts` refuses any other Host; tests check both (`tests/unit/local-boundary.test.mts`, browser tests) |
| Re-check, later on 2026-10-15 | After the Gate P0 removal the dev server was restarted with `npm run dev` (`next dev -H 127.0.0.1`). `Get-NetTCPConnection` and `netstat` showed exactly one listener on port 3000, `127.0.0.1`. A TCP connection to the machine's own LAN address on port 3000 and to `[::1]` was actively refused. `Host` checks over loopback: 200 for `localhost`, `127.0.0.1` and `[::1]`; 403 for any other name, a LAN address, a look-alike (`127.0.0.1.evil.example`) and an empty `Host`, on `/` and on `/geo/boundaries.json` |
| What this does not show | It describes the server as it is now. It says nothing about the earlier hours: there is still no access log, and the firewall was not inspected, so whether anything on the network reached the server then is undetermined. Do not read this entry as closing the incident |

## SN-5. Staff names are present in served pages

`/workspace` embeds the dataset so the counts, lists and forms work in the browser. `/globe`
(until the Phase 1 route move, `/globe-prototype`) embeds the globe manifest, whose block records list the workbook staff
names for the details panel; its outline file is served separately by `/geo/globe-boundaries.json` and holds no names. The names
are therefore in the page HTML and payload (historical counts from earlier builds, not current: 8 files under `.next/server`
in the build of 2026-10-15; 24 of 259 in the Phase 1 build of 2026-10-17, before the Overview change, which counted the
`/globe` pages and the route cache as well; the current build's result is in the evidence note below),
not in `public/` or in any script, style, font or image (scanned: `npm run verify:build`, plus a
browser test over what the page downloads). With the bind address and Host check, only this machine
can read them. This is not acceptable for any shared or hosted setting: before then, send each view
only what it needs, and add authentication and access control (B-15, B-16, B-25).

**Overview (`/`): minimised.** The homepage no longer carries a staff name. `OverviewDashboard` receives an `OverviewData`
(`src/features/territory/overview-data.ts`): row, slot and crosswalk structure, the few geography fields the page prints, and
source-file provenance, with every person replaced by an opaque integer key (the order of first appearance, not derived from
the name). It carries no name, source row, block label, relation ID or review reason. The page still recomputes every figure
in the browser, because the reviewer's browser-local change log is applied to all of them, and the keys keep the distinct-name
count exact when a local change clears or overwrites a slot. `tests/unit/overview-data.test.mts` (synthetic names, and the real
build, reporting counts only) and `tests/e2e/overview-privacy.test.mts` (homepage HTML, RSC payload, prerendered files, with
`/workspace` as the positive control) guard it. **Known limit:** the browser cannot tell that a name a reviewer types in a
local change equals a workbook name, so the distinct-name figure counts it as one more than the Workspace model would. Every
other figure is identical. `/workspace` and `/globe` are unchanged and still send names; each needs its own review.
The person keys are pseudonymous, not anonymous: they show which rows share a person and how many people a slot lists, so
someone who also holds the workbook could re-identify people from them.

**Evidence note, 2026-10-17 (independent review of the Overview change, build of that date).** Local build and scan results
only; they are not proof that any production or hosted deployment is secure, and the app remains localhost-only with no
authentication.

- The homepage's HTML, RSC and prerendered files under `.next/server/app` contained zero matches for the 227-name detector
  (every distinct name in the dataset; the detector also matches JSON-escaped and HTML-escaped forms and any letter case).
- `npm run verify:assets` found zero staff names across 34 public files (`public/` and `.next/static`) and no data file in `public/`.
- `npm run verify:build` found staff names in 16 of 259 files under `.next/server`. They were confined to the `/workspace` and
  `/globe` route output, including their route-cache copies, as designed. None was in the homepage output.
- `/workspace` and `/globe` therefore still expose staff names in their page data; only the Overview is name-free.

## SN-6. What the localhost boundary does not protect against

- Another user or process on the same machine can connect to `127.0.0.1`.
- A process on the network that can reach a server started on all interfaces can forge a `Host`
  header; the check is a second layer, mainly against DNS rebinding.
- `npx next dev` or `npx next start` run by hand, without `-H 127.0.0.1`, bypasses the npm scripts.
- The browser's `localStorage`, where local allocation changes are kept, is readable by anyone using
  that browser profile.
- **The Next.js tooling makes its own requests** (measured 2026-10-15; full table in
  [prototype.md](prototype.md), section 8): `next build` fetches the Geist fonts from
  `fonts.googleapis.com` and `fonts.gstatic.com` on a cold build and fails without them;
  `next build` and `next dev` contact `registry.npmjs.org` (a security-advisory and version check, on
  by default in Next.js 16.4); telemetry to `telemetry.nextjs.org` is off through `.env`. None of these
  carries project data. An earlier statement that the dev server made no outbound connection was wrong
  and has been corrected: the registry check was missed. The registry check was left on, as a security
  feature, pending a decision.
- Telemetry is off only through the git-ignored `.env`; it must be recreated on a fresh checkout, and
  the `next dev` launcher process does not read it (limits in prototype.md, section 8).

## Security position of the prototype

| Area | Position |
| --- | --- |
| Network | Two same-origin requests from the app, each by one named file to its own literal URL: the workspace's boundary layer (`/geo/boundaries.json`) and the globe's validated outline file (`/geo/globe-boundaries.json`, only when WebGL is available); the network guard allows exactly these. `scripts/fetch-osm.mts` is the only project code that contacts an external service, with a generic User-Agent and a geographic query only. The details panel links to `openstreetmap.org/relation/<id>`, followed only if a person clicks it, with `noopener noreferrer`. The Next.js tooling also contacts Google Fonts (cold build) and the npm registry (build and dev); telemetry is off (SN-6) |
| Binding | `127.0.0.1` only, and a loopback Host check |
| Storage | `localStorage` for local allocation changes; no database, no cookies set |
| Personal data | Staff names from the workbook, server side and in served pages (SN-5). No salary data. No email address anywhere in code, tests, scripts or docs (tested) |
| Source files | The four in `data-source/` are hash-checked before and after every build and never written |
| Secrets | None |
| Dependencies | No runtime dependency beyond `next`, `react` and `react-dom`; pinned by a test |
| Public assets | `public/` is empty and a test fails if a data file appears; build scan finds no staff name or layer ID in `.next/static` |
| Fixture exposure | None possible: the Gate P0 test fixture and the code that used it were removed on 2026-10-15 (backup outside the project; see prototype.md, section 10) |

## Open items

Authentication and access control, a Content-Security-Policy, security headers, hosting and residency, and the incident process are not started. They are tracked in the Phase 0D assessment (approvals 6 to 8) and matter only if the prototype leaves this machine.
