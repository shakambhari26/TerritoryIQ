# Hosted readiness plan

Status: **draft for owner review, 2026-10-18.** Baseline: `origin/main` at `183cfab` (PR #9 merged).

**This plan does not make the app secure, and no hosting approval is implied.** TerritoryIQ is a single-user, localhost-only
prototype. Nothing in this document records an approval by the project owner, IT, the business, legal or security. Where a
decision below says `Open` or `Proposed`, that is exactly the evidence the repository holds. A status moves to `Approved` only
when a decision record links written evidence (the rule in
[data-audit/phase-0d-stakeholder-approval.md](data-audit/phase-0d-stakeholder-approval.md)).

This is a planning document. It changes no code, test, configuration or data. It does not name a hosting provider, an identity
provider or a database, because none has been approved.

## 1. How to use this document

| Reader | Use |
| --- | --- |
| Owners (project, IT, business, legal) | Section 3 lists the decisions you must make, and what each one unblocks. Section 5 lists the gates that stop any hosted use. |
| Engineers | Section 4 splits the work into phases that can be reviewed one at a time. Most phases cannot finish until a decision in section 3 is made. |

Related records: [prototype.md](prototype.md) section 8 (security boundary), [security-notes.md](security-notes.md) (SN-1 to SN-6),
[architecture.md](architecture.md), [data-audit/phase-0d-privacy-and-deployment-assessment.md](data-audit/phase-0d-privacy-and-deployment-assessment.md)
(privacy and deployment assessment, section 6 lists 14 approvals, none obtained) and
[data-audit/open-business-decisions.md](data-audit/open-business-decisions.md) (B-15, B-16, B-25 are the access, hosting and
identity questions).

## 2. Current state

### 2.1 What the app does today

| Area | Position at `183cfab` | Source of the statement |
| --- | --- | --- |
| Where it runs | `npm run dev` and `npm run start` bind `127.0.0.1`; `src/proxy.ts` answers 403 to any non-loopback `Host`. Neither is authentication. A client that can reach a mistakenly exposed server can forge `Host`. | prototype.md section 8, security-notes.md SN-6 |
| Users | One. No accounts, sessions or cookies. | architecture.md ("Explicitly out of scope so far") |
| `/` (Overview) | Receives a name-free `OverviewData`: no name, source row, block label or relation ID. People are replaced by opaque integer keys. The keys are **pseudonymous, not anonymous**: someone who also holds the workbook could re-identify people from them. | security-notes.md SN-5 |
| `/globe` | Page data carries no names. A selected block's records (names, row label, sales territory) are fetched on demand from `POST /api/globe/block-rows`. | security-notes.md SN-5 |
| `/workspace` | **Still exposes every staff name** in its HTML and payload when opened. It has not been minimised. | prototype.md section 8 |
| `POST /api/globe/block-rows` | **No authentication and no per-user authorization.** Its only guard is the loopback `Host` check (in `src/proxy.ts` and again in the handler). Anyone who can reach the server can request any block ID, and IDs can be enumerated. | `src/features/globe/block-rows-route.server.ts`, security-notes.md SN-5 |
| Cache headers | Sensitive pages and `/geo/*` and `/api/*` routes send `Cache-Control: private, no-store` (`next.config.ts`). The Globe boundary route helper (`src/features/globe/layer-integrity.ts`) was aligned to the same value in PR #9. | `next.config.ts`, PR #9 |
| Server-only data modules | `dataset.server.ts` and `overlay.server.ts` carry explicit `import "server-only"` markers, guarded by a test. | PR #8 |
| Rendering | `/`, `/workspace`, `/globe` and `/geo/boundaries.json` are prerendered at build time from files read once at module scope. Prerendered output is the same for every visitor. | architecture.md "Decisions in force" |
| Allocation changes | An append-only change log in the browser's `localStorage`. No shared store, so there is no multi-user editing today. | architecture.md, security-notes.md SN-6 |
| Audit logging | None. | security-notes.md "Open items" |
| Security headers | A baseline is sent on every path (`nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`). There is no script or style CSP, and no HSTS. | `next.config.ts`, `tests/unit/response-headers-config.test.mts` |
| Runtime dependencies | `next`, `react`, `react-dom`, `three`, pinned by `tests/guardrails.test.ts`. | `package.json`, guardrails test |
| Legal basis, retention, residency | Not decided. The Phase 0D assessment states: "Nothing below has been obtained." | phase-0d-privacy-and-deployment-assessment.md section 6 |

The privacy improvements above (names on demand, `private, no-store`, `server-only` markers, a name-free Overview) narrow what a
page load carries and stop a shared cache keeping a copy. They are **not** authentication or authorization. They do not decide who
may ask. They make the app less exposed on one machine. They do not make it approved for hosting.

### 2.2 Dependency audit finding

A previous review reported **five high-severity findings in development dependencies**, in the `eslint-config-next` dependency
chain. The repository's own record is narrower: docs/globe-prototype.md records `npm audit --omit=dev` (runtime dependencies only)
as 0 vulnerabilities, and no repository document records the development-dependency findings. They were **not re-run while writing
this plan** (this task installs nothing and runs nothing). Treat the count as reported, not verified here.

Handling, without a blind major downgrade or an `npm audit fix --force`:

1. Re-run a full `npm audit` in an isolated worktree and record the exact advisories and the paths to them.
2. For each advisory, state whether it is reachable at runtime or only in the developer's tooling and CI.
3. Look for a patched release of the affected package that works with the pinned `next` 16.4.1 and ESLint 9.x. architecture.md
   already records that ESLint 10 needs peer-dependency overrides, so jumping a major is a separate, tested change.
4. If no safe fix exists, record an explicit, dated risk acceptance by the owner of the decision. Do not suppress the finding.

This falls under decision D-11 and phase 9.

### 2.3 Known stale statements to correct (phase 1)

Verified in the repository at `183cfab`:

- architecture.md ("One network use") and security-notes.md ("Dependencies") say the runtime dependencies are exactly `next`,
  `react` and `react-dom`. `package.json` and the guardrails test also include `three` (added for the globe).

No other outstanding documentation or header item was verified while writing this plan. Phase 1 is otherwise done (section 4).

## 3. Decision register

Status values: `Open` (no answer recorded), `Proposed` (a recommendation exists in the repository; nobody has approved it),
`Approved` (written evidence linked) or `Blocked` (cannot proceed until something else is decided). **No decision is `Approved`:
the repository holds no evidence of any.** "Owner needed" names the kind of owner, not a named person or role; the repository
does not assign these, and the Phase 0D approver roles are described there as "guessed".

| ID | Question | Owner needed | Status | Evidence / notes | Work that depends on the answer |
| --- | --- | --- | --- | --- | --- |
| D-01 | Does TerritoryIQ stay local-only, or move to hosted or multi-user use? | Project owner (with business) | **Open** | architecture.md: "a localhost-only prototype"; prototype.md section 8: "nothing is meant to be reachable from another computer". No decision to host is recorded. | Everything in phases 2 to 9. If local-only is chosen, phases 2 to 9 are not needed, but the `/workspace` and block-rows findings still apply to any other user of the same machine (SN-6). |
| D-02 | Which identity mechanism: company SSO (OIDC or SAML) or a trusted identity gateway in front of the app? | IT | **Proposed** | Phase 0D section 4.4 recommends single sign-on through the company identity provider (marked as a recommendation, **[E]**, "not a stated legal minimum"). architecture.md: authentication is "Proposed, not started". No identity system or IT answer is recorded. | Phase 2 (provider choice), phase 3 (session abstraction), phase 4. |
| D-03 | Hosting provider, data residency and database. | IT and legal | **Open** | Phase 0D section 5.3 lists candidate hosting options "for review (none is chosen)"; B-16 (hosted database acceptable?) is "Not set". Section 6 item 7 (hosting and residency approval) is not obtained. architecture.md lists PostgreSQL and PostGIS as "Proposed, not started". | Phase 2, phase 7 (database), phase 8 (hosted-edge checks), and the log-location part of D-09. |
| D-04 | Which capabilities exist, and what territory and user access scopes apply? | Business, with project owner | **Open** | B-15 ("Who may view and who may edit allocations, and may users see data outside their own region or reporting line?") is "Not set". Phase 0D section 4.4 suggests candidate roles and says the scoping basis is "undecided". | Phase 3 (capability model), phase 4 (per-route authorization), phase 7. |
| D-05 | Who may view staff names, edit allocations and access exports? | Business, with legal | **Open** | B-15 and B-25 are open. Phase 0D section 4.4: "Names visible only to roles that need them", and exports of person-level data to be "limited, approved or watermarked". Section 6 item 6 (access model) is not obtained. | Phase 4 (block-rows), phase 6 (workspace name minimization), phase 8 (export controls). |
| D-06 | Legal basis and privacy approval for staff and distributor data. | Legal | **Blocked** | Phase 0D section 6 item 1: a written legal-basis opinion (including distributor-payroll staff) is "not obtained"; B-25 (may names be imported as the identity basis?) is open, and approval sheets exist but record no decision. Blocked on a legal answer outside the project. Names are in the local dataset today, and security-notes.md says they "must stay on this machine". | Any hosted use of real data, phase 6, go-live gate G-10. |
| D-07 | Session lifetime and expiry, MFA, and how fast a leaver's access is revoked. | IT | **Proposed** | Phase 0D section 4.4 recommends MFA for all users, unique named accounts, session time-outs and a joiner, mover, leaver feed with quarterly access review (all **[E]**). No values are set and none is approved. | Phase 3 (session design), phase 8, gate G-04. |
| D-08 | Is multi-user allocation editing required, and so is a shared store needed? | Business, with project owner | **Open** | Allocation changes live only in one browser's `localStorage` today. B-13 (states, history depth, audit detail) is open. | Phase 7 runs only if this is answered yes. If no, hosted use is read-only and phase 7 is skipped. |
| D-09 | Audit-log retention, and the policy for person-level exports. | Legal and IT | **Open** | Phase 0D section 4.1 reads Rule 6(1)(e) as at least one year for logs and cites at least 180 days in India for CERT-In, but the proposed retention schedule leaves periods blank and marks them open ("Periods are blank because they are ... for HR and legal to set"). Those legal readings are the document's own and are not confirmed. | Phase 8 (audit logging), gate G-07. |
| D-10 | Are the Overview's pseudonymous person keys acceptable on a shared or hosted app? | Business and legal | **Open** | SN-5 states they are "pseudonymous, not anonymous" and allow re-identification by someone who holds the workbook. No decision on acceptability is recorded. | Phase 5 and 6 (what `/` may carry), phase 4 (whether the Overview needs authentication). |
| D-11 | Are new runtime dependencies permitted (for example a session or auth library, a rate limiter or an audit client)? And how are the reported development-dependency audit findings handled? | Project owner, with IT | **Open** | Runtime dependencies are pinned to `next`, `react`, `react-dom` and `three` by `tests/guardrails.test.ts`. The guardrails test would have to change for any addition. Section 2.2 covers the audit finding. | Phases 3, 7, 8 and 9. Phase 3 should first test what Next.js built-ins can do. |
| D-12 | Independent security review and go-live approval. | Project owner, IT and legal | **Blocked** | Blocked on D-01 to D-11 and on phases 3 to 9. Phase 0D section 6 items 2, 3, 8 and 10 (Significant Data Fiduciary position, employee notice, incident plan, rights process) are all "not obtained". No review has been commissioned that is recorded in the repository. (security-notes.md SN-5 mentions an "independent review of the Overview change"; that was a review of one change, local-only, and says it is not proof of hosted security.) | Any hosted deployment. |

Also tracked elsewhere and not repeated here: B-18 (legal review of ODbL and LGD reuse for internal multi-user use, not recorded) and
the geography and crosswalk decisions in open-business-decisions.md. B-18 must be answered before hosted use of the boundary data.

## 4. Engineering roadmap

Each phase can be reviewed on its own. A phase that depends on a decision cannot be finalised before that decision; it can be
prototyped in an isolated worktree. Do not put real data into any hosted or external development environment. Phase 0D section 4.4
says production personal data must not be used in development or test.

### Phase 1. P0 documentation and header hygiene

**Done, merged to `main`:** the names-on-demand change for `/globe` (PR #7); `/geo/boundaries.json` aligned to `private, no-store`
and `import "server-only"` on `dataset.server.ts` and `overlay.server.ts` (PR #8); the Globe boundary route helper aligned to
`private, no-store`, with tests (PR #9); `private, no-store` rules for `/`, `/workspace`, `/globe`, `/geo/:path*` and `/api/:path*`
(PR #6); the security-notes.md and prototype.md corrections.

**Verified outstanding:** the dependency-list statement in section 2.3.

- Prerequisites: none.
- Expected outcome: the architecture and security-notes statements match `package.json`.
- Tests: the existing guardrails test already pins the real list; no new test is needed for a wording fix.
- Rollback: revert the documentation commit.

### Phase 2. Identity-provider and hosting decisions

- Prerequisites: D-01 answered "hosted". Then D-02, D-03.
- Expected outcome: a written decision record for each of D-02 and D-03 with evidence links, the chosen mechanism's session and
  logout behaviour, and a list of data-protection terms IT and legal need from any provider. No provider is chosen by this plan.
- Tests: none in code. The check is the decision record itself and review by the owners.
- Rollback: nothing is built, so none. A provider decision can be withdrawn before phase 3 uses it.

### Phase 3. Server-side session abstraction and capability-based authorization

- Prerequisites: D-02, D-04, D-07 (at least proposed), D-11.
- Expected outcome: one server-side module that turns a request into "who is this, with which capabilities and scopes" and fails
  closed (no identity means no data). Routes and pages ask for a capability, never a role name. Identity comes from the approved mechanism and is
  never read from a client-supplied field. The localhost build keeps working through a clearly named development identity that is
  impossible to enable in a production build.
- Tests: unit tests for fail-closed behaviour, expired sessions, revoked users and a missing capability; a test that the
  development identity cannot be switched on in a production build.
- Rollback: the module sits behind one switch that keeps today's localhost behaviour; revert the commit to remove it.

### Phase 4. Authorization of block-rows and all data-bearing geography routes

- Prerequisites: phase 3; D-04 and D-05 answered, because the scoping decides what each user may request.
- Expected outcome: `POST /api/globe/block-rows` checks identity, capability and territory scope on every request, and answers the
  same refusal for "not allowed" and "does not exist" so IDs cannot be enumerated. The same applies to `/geo/boundaries.json` and
  `/geo/globe-boundaries.json` if the owners decide boundary data needs protecting, and to any future data route.
  A route inventory test fails when a new data-bearing route has no authorization check.
- Tests: per-route tests for no identity, wrong scope, right scope and enumeration; an inventory test over `src/app`; the existing
  `tests/e2e/globe-privacy.test.mts` and `tests/e2e/response-headers.test.mts` still pass.
- Rollback: revert; the routes return to the loopback Host check only, which is acceptable on localhost and not on any other host.

### Phase 5. Dynamic authenticated rendering and cache verification (pages, RSC, prefetch)

- Prerequisites: phase 3.
- Expected outcome: pages that show anything user-specific or scoped are rendered per request after the identity check, not
  prerendered. Today `/`, `/workspace` and `/globe` are static and identical for every visitor, so a prerendered page cannot be
  scoped to a user. The work includes the RSC payload and prefetch variants (the existing e2e test already probes them) and
  Next.js route caches. Responses that depend on identity carry `private, no-store` and no shared cache can serve them to someone else.
  The Cache Components and Partial Prefetching settings documented in architecture.md must be re-examined, not assumed safe.
- Tests: extend the response-header e2e test to authenticated and unauthenticated requests across HTML, RSC and prefetch; a
  two-user cache-isolation test (user A's response is never served to user B or to an anonymous request).
- Rollback: revert to prerendered pages; this is only safe while the app is not hosted.

### Phase 6. Workspace name minimization

- Prerequisites: D-05, D-06 (names allowed at all), D-10; phase 4 for the on-demand pattern.
- Expected outcome: `/workspace` stops embedding every staff name. It carries the same kind of structure as the Overview and fetches
  names on demand through an authorized route, only for roles allowed to see them. The decision on whether the Overview's person
  keys stay is made here.
- Tests: extend the name-leak scans (`npm run verify:build`, `tests/e2e/overview-privacy.test.mts`, `tests/e2e/globe-privacy.test.mts`)
  to `/workspace`; zero names in prerendered files and in the initial payload; a name appears only after an authorized request.
- Rollback: revert; `/workspace` returns to embedding names, which holds only while the app is local.

### Phase 7. Shared allocation store (only if multi-user editing is approved)

- Prerequisites: D-08 answered yes; D-03 (database and residency); phases 3 and 4; B-13.
- Expected outcome: allocation changes persist in a shared store with server-side validation, per-user authorization and an
  append-only history, replacing the browser-local log. Scope is enforced on the server (Phase 0D recommends enforcing it in the
  database, not only the interface).
- Tests: concurrent-edit and conflict tests, authorization tests, migration up and down on synthetic data only.
- Rollback: a migration down plus the previous browser-local log; keep the browser-local path until the shared store is accepted.
- If D-08 is answered no, skip this phase and record it as not needed.

### Phase 8. Origin controls, rate limiting, audit logging, CSP and HSTS, hosted-edge checks

- Prerequisites: phases 3 and 4; D-03 (the edge), D-09 (retention).
- Expected outcome:
  - Origin and CSRF validation on every state-changing request. Today the block-rows `POST` has only a Host check.
  - Rate limiting and enumeration limits on data routes, with alerting on bulk reads.
  - Audit logs: who did what to which record IDs, when, with what outcome, for writes and for reads of person-identifying views
    and exports. Log sign-ins, failures, role changes and exports. IDs, not names. The log store is separate from the application
    database and protected from edit.
  - A script and style CSP, designed and tested because the existing config says a restrictive one would break Next's inline scripts
    and styles, and HSTS set at the approved hosted edge.
  - Edge checks: TLS, trusted-proxy handling of `Host` and `X-Forwarded-*`, no direct access to the origin server.
- Tests: forged-origin and missing-origin tests, rate-limit tests, an audit-record test per action, a log-redaction test (no names
  or workbook content in logs), CSP verified in a real browser.
- Rollback: each control ships behind its own flag in a reviewable commit; revert independently. Rolling back audit logging is not
  acceptable once real data is hosted.

### Phase 9. Automated security acceptance tests and independent review

- Prerequisites: phases 3 to 8 (those that apply); D-12.
- Expected outcome: one acceptance suite that runs against a production build and fails on regression: unauthenticated access to
  every data route, wrong-scope access, name-leak scans of every route and RSC variant, cache isolation, origin checks, security
  headers, and dependency audit results recorded with their accepted risk. After it passes, an independent reviewer, not the
  authors, reads the code, the configuration and the results, and writes a report with findings and dispositions.
- Tests: the suite itself, run in CI and on the production build.
- Rollback: not applicable. A failure stops the go-live.

## 5. Deployment gates

**Every item must be satisfied, with evidence linked in the decision register, before any hosted or multi-user deployment, including
a pilot with real data.** Meeting every gate would still not be an approval; approval is decision D-12.

| Gate | Condition | Evidence required |
| --- | --- | --- |
| G-01 | The decision to host (D-01) is made by the project owner in writing. | Linked written decision. |
| G-02 | Authentication through the approved mechanism (D-02). No unauthenticated path returns data; unknown requests are refused. | Acceptance test results (phase 9). |
| G-03 | Per-user authorization on every data-bearing route, including `POST /api/globe/block-rows`, `/geo/boundaries.json` and `/geo/globe-boundaries.json`. A route without a check fails the build. | Route-inventory test and per-route tests. |
| G-04 | Secure sessions: expiry, logout, revocation of a leaver's access, and MFA as decided in D-07; cookies are `Secure`, `HttpOnly` and `SameSite`. | Decision record and session tests. |
| G-05 | Origin and CSRF validation on every state-changing request; rate limiting on data routes. | Phase 8 tests. |
| G-06 | Name-leak scans pass on every route, including `/workspace`, in HTML, RSC payload, prefetch variants, prerendered files and static assets. Staff names appear only after an authorized request. | Scan output from the production build, with the scan itself tested against a known-bad input. |
| G-07 | Audit logging is on, holds IDs not names, is protected from edit, and its retention period is approved (D-09). Logs hold no names or workbook content. | Decision record, log-redaction test, sample log. |
| G-08 | Cache isolation: identity-dependent responses are `private, no-store`, are not prerendered, and a second user or an anonymous request never receives another user's response. | Two-user cache test (phase 5). |
| G-09 | Hosting, residency and the database are approved (D-03), and the hosted-edge checks, CSP and HSTS pass on the real edge. | Decision record and edge test results. |
| G-10 | Legal and privacy approval for staff and distributor data (D-06), the access model (D-04, D-05), and legal review of boundary data licences (B-18). | Written approvals, linked. |
| G-11 | No production personal data in any development or test environment, and no real names pasted into external tooling. | Environment inventory. |
| G-12 | Dependencies: new runtime dependencies approved (D-11); the full `npm audit` re-run and every finding fixed or accepted in writing. | Audit output and the acceptance record. |
| G-13 | An incident process with named owners exists (Phase 0D section 6 item 8). | Written plan. |
| G-14 | An independent security review has been completed, its findings dispositioned, and go-live approved (D-12). | The review report and the approval, linked. |

## 6. Open items for the owners

1. Decide D-01. Everything else follows from it.
2. If hosting: start the written records for D-02, D-03, D-04, D-05, D-06 and D-07 in parallel, because phases 2 to 4 wait on them.
3. Answer D-08. It decides whether the shared store and its database are needed.
4. Provide an owner for the dependency-audit risk (section 2.2).
5. Correct the dependency-list statement (section 2.3), the only verified documentation fix outstanding.

## 7. What this document does not establish

- It does not assert that the app is secure, or that any approval has been given by the project owner, IT, the business, legal or
  security.
- It does not choose a hosting provider, identity provider, database or library.
- The legal readings quoted from the Phase 0D assessment are that document's own, which says it is not legal advice; legal decides
  what applies.
- It reports the development-dependency audit findings as reported by an earlier review and does not re-verify them.
- It describes the repository at `183cfab`. Later commits may change any row of section 2.
