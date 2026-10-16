# Phase 0F: MVP geographic feasibility and go/no-go

**Status: RECOMMENDATION FOR SPONSOR AND LEGAL REVIEW. This document approves nothing, grants no permission and is not legal advice. No application, database, map, Supabase or Power BI work was done, and the original workbook was not touched.**

Date: **2026-10-15** (Phase 0F). Builds on [geographic-crosswalk-review.md](geographic-crosswalk-review.md) (Phase 0E), [phase-0d-geographic-source-gate.md](phase-0d-geographic-source-gate.md) (sources S1 to S33, cited by ID), [phase-0c-decision-brief.md](phase-0c-decision-brief.md) and [open-business-decisions.md](open-business-decisions.md). Question IDs (B-xx, G-xx) point to those files. New sources here are S34 (OpenStreetMap, measured) and S35 (Survey of India, re-read).

**Handling note.** Section 3.3 and Appendix A name official LGD blocks. LGD reuse permission is unverified, so keep this document inside the company until B-18 is answered in writing.

**Evidence labels.** **D** read from the publisher's own host on 2026-10-15. **M** measured in this phase by a script on fetched data. **I** inference. **S** search-result snippet only. **U** unreachable.

## 1. Bottom line

| Question | Answer |
| --- | --- |
| Is a complete, licensed, inspectable boundary dataset for all of West Bengal available today? | **No.** No source inspected covers state, district, block and urban ward with a verified licence and verified contents (section 3). The one official candidate, the Survey of India free file, was deliberately not downloaded because the Download step may present an undertaking that cannot be seen beforehand, and no source at all holds ward polygons. |
| Is there a legally *reviewable* partial route? | **Yes, one.** LGD for identifiers plus OpenStreetMap (ODbL) for geometry, for districts and rural blocks only. It is unofficial and not yet legally approved. |
| What does that route cover? | **M:** 23 of 23 districts join by LGD code. 301 of 345 LGD blocks have exactly one same-named OSM block boundary. In workbook terms, **273 of 358 rows** could be drawn before review (section 3.3). No Kolkata or Howrah ward polygons exist in OSM. |
| Recommended path | **A staged limited pilot** (option C built on option B, section 4), with the official route pursued in parallel as the upgrade path. |
| Verdict | **GO** for polygon-independent application work, on your approval. **CONDITIONAL GO** for a district-and-block pilot map, only after Gate P1 (section 8). **NO-GO** for a complete statewide map including wards until Gate P2 is met. |

Two facts shape everything else. The business unit in the workbook is the **block** (R4: blocks listed under each sales-territory label are its intended membership), so district polygons alone do not show the allocation. And the wards of Kolkata (209) and Howrah (68) exist only as words in the 11 September 2026 notifications (S30), so a statewide map cannot be complete at ward level from any source found.

## 2. What is new since Phase 0D

| # | Finding | Label |
| --- | --- | --- |
| 1 | OSM carries `ref:LGD:district` on its West Bengal district boundaries. All 23 LGD district codes are present, and the code-to-name pairs agree with the LGD district report (only spelling differs: `Maldah`, `Malda`). This is a **code-level** district join, not a name join. | M |
| 2 | OSM block boundaries carry `ref:LGD:subdistrict`, which is **not** the LGD block code. None of the 301 uniquely name-linked blocks has an OSM value equal to its LGD block code. A block join by code is therefore not possible until the LGD sub-district export (not obtained) is mapped to blocks. | M |
| 3 | OSM has no ward-level boundaries for Kolkata or Howrah. | M |
| 4 | Survey of India FAQ 6 and 7 re-read: the Administrative Boundary Database is "available for direct download without registration or login" through Quick Access. Whether an undertaking appears at the Download step is not observable without pressing it. It was not pressed. | D |
| 5 | geoBoundaries metadata is unchanged (ADM2 2021, ADM3 2018, ODbL per file, dead upstream licence host). `basundhara.wb.gov.in` and `wbprd.gov.in` timed out again. | D, U |
| 6 | The LGD Copyright Policy wording is unchanged and still does not mention commercial use or name an open-data licence. | D |
| 7 | A web search found no official West Bengal block-boundary download. Results were restricted academic layers (Princeton, Stanford) and one CC0 settlement dataset that was not assessed. | S |
| 8 | All four files in `data-source/` still match their recorded SHA-256 values. | M |

## 3. Boundary-source assessment

### 3.1 Verdict by geographic level

| Level | Best candidate | Contents inspected? | Licence evidence | Verdict |
| --- | --- | --- | --- | --- |
| State outline, 23 districts | OSM relations (S34); Survey of India OVSF/1M/9 (S35) | OSM: tags, names and LGD codes; district and state geometry not fetched. SoI: no | OSM: ODbL (text read in Phase 0C, S24). SoI: undertakings unresolved | **Feasible through OSM, pending legal.** SoI unverified |
| Rural development blocks | OSM level-6 relations, joined to LGD by name and reviewer sign-off | Names for all, geometry for one sample | ODbL | **Partly feasible**: 301 of 345 uniquely linked, 44 not (Appendix A) |
| Municipalities and corporations as whole units | OSM level 8 | One sample box only | ODbL | **Not established.** The LGD urban-body list was never supplied, so coverage cannot be tested |
| Kolkata and Howrah wards | None | n/a | Gazette text only (S30) | **Not available** |
| Other urban wards | None found | n/a | n/a | **Not available** |

### 3.2 Source register (all accessed 2026-10-15)

| Source and direct URL | Level, coverage, vintage, format | Inspectable? | Licence and commercial-use evidence | Hosting or redistribution | Gaps and risks |
| --- | --- | --- | --- | --- | --- |
| **LGD** (S7), <https://lgdirectory.gov.in/copyRightPolicy.do> and the two reports in `data-source/` | Names and codes: 23 districts, 345 blocks (41,006 village rows). Effective date unprinted. SpreadsheetML `.xls` | Yes, names and codes. **No geometry** | D: "may be reproduced free of charge in any format or media without requiring specific permission", with accurate use and prominent source acknowledgement. Commercial use is not mentioned. No open-data licence is named | The README says hosting is unverified. Third-party material is excluded | Effective date unknown. No sub-district, urban-body or ward lists obtained. Which list holds West Bengal's CD blocks is open (Phase 0D, section 5, row 1c) |
| **OpenStreetMap** (S34), state relation <https://www.openstreetmap.org/relation/1960177>; queried through the public Overpass servers `https://overpass.openstreetmap.fr/api/interpreter` (snapshots 2026-10-15 09:22Z and 09:31Z) and `https://overpass.private.coffee/api/interpreter` (snapshots 2026-05-31 to 2026-07-15) | Districts (level 5), blocks (level 6), whole urban bodies (level 8, partial). Community-drawn and continuously edited. Overpass JSON with tags and geometry | **Yes.** Tags for all levels; geometry for one block | ODbL 1.0 (S24, read in Phase 0C, **not re-read now**): commercial use allowed with attribution; share-alike on publicly used derivative databases. OSM's own copyright page was not read in this phase | ODbL needs attribution and a legal reading of internal multi-user use, including distributor staff (B-15, B-18). The public Overpass servers are shared services. A production build needs a pinned extract (**I**, general knowledge) | **Unofficial.** No accuracy test against an official boundary was run. 44 blocks not uniquely linked. No wards. Block geometry validity untested. A state or national outline may need Survey of India consistency (G-07) |
| **Survey of India** (S17, S35), <https://onlinemaps.surveyofindia.gov.in/FAQs.aspx> and `AboutPortal.aspx` | OVSF/1M/9 state to district, OVSF/1M/8 state to taluk. 1:1M, shapefile, price 0, "Single" user. Vintage and attributes unstated | **No.** Not downloaded | Undertakings seen at the cart (S17, Phase 0D): follow the 2021 Guidelines, no sharing with foreign individuals or entities except as law permits, attribute SoI, do not sell. Terms on the free route not observed | Phase 0D flags GR-2: a foreign-operated host may breach the no-foreign-sharing clause | Unknown: vintage, codes, CRS, whether "taluk" equals a West Bengal CD block, treatment of urban bodies. 1:1M is coarse for block outlines (**I**). The 2022 commercial-use clarification (S19) is relayed, not official |
| **geoBoundaries ADM2, ADM3** (S8, S8b), <https://www.geoboundaries.org/api/current/gbOpen/IND/ADM3/> | District 2021, sub-district 2018. Producer is a private company. GeoJSON | Yes (Phase 0C inspected both) | ODbL per file; the site says CC BY 4.0; the upstream licence host is dead (Phase 0D, 3.6) | As ODbL | No codes in the files. 2018 vintage. Provenance unresolved. **Weaker than OSM on vintage and code evidence** |
| **WB Kolkata and Howrah ward notifications** (S30), <https://udma.wb.gov.in/circular> | 209 and 68 wards, 11 Sept 2026, words only | Text only | No licence statement | Unknown | No geometry. Digitising needs owner maps |
| **State portals** (S27), `basundhara.wb.gov.in`, `wbprd.gov.in` | Unknown | **No** | Unknown | Unknown | Timed out (40 s, 2026-10-15). **U** |
| **Excluded** | GADM, Development Data Lab, Princeton, Stanford, ML InfoMap: non-commercial or restricted. data.gov.in copies: sandbox banner, no verifiable licence. Bhuvan: policy unread | n/a | n/a | n/a | Not used |

No account was created, no terms were accepted, no CAPTCHA was answered, and no unverified third-party file is treated as authoritative.

### 3.3 OpenStreetMap measurements (M)

Method: read-only Overpass queries for tags (no account, no terms click), saved outside the project in the session scratch folder. A name key (case-folded, dashes and spaces removed, trailing numeral unified) linked OSM relations to LGD blocks. This is a **name-level** test. It does not compare geometry and it does not say the polygons are accurate.

| Measure | Result |
| --- | --- |
| Level-5 relations in a state-scale bounding box (West Bengal plus neighbours) | 112, of which 23 carry the LGD district code of a West Bengal district. All 23 LGD districts are covered, names agree apart from spelling |
| Level-6 relations in the same box | 1,096 (includes neighbouring states and countries) |
| LGD blocks (345) with exactly one same-named OSM level-6 relation | **301** (87.2 percent) |
| LGD blocks whose name sits on more than one OSM relation or LGD block | 8: Barrackpur-I, Jamal Pur, Raniganj, Rajnagar, Chandipur, Mohanpur, and the two `Sankrail` blocks (2913, 3000) |
| LGD blocks with no OSM relation of that name | 36 (Appendix A). Some are probably spelling or numbering differences, which is not tested |
| `ref:LGD:subdistrict` on the 301 linked relations | Present on 296. Equal to the LGD block code on **0** |
| Workbook rows (358) whose exact-name single candidate is one of the 301 | **273** (76.3 percent), reaching 269 distinct blocks (four pairs share a block). Before any reviewer decision |
| The other 85 rows | 14 with no candidate, 3 with several exact candidates, 25 with one exact candidate but no unique OSM link, 43 with only weaker candidates |
| Geometry sample | Relation 2774125 (`Nabadwip`): 6 outer ways, 419 vertices. Ring closure and validity not tested. Other geometry not fetched |
| Kolkata and Howrah box (22.45 to 22.70 N, 88.15 to 88.50 E), snapshot 2026-10-15 09:31Z | 30 administrative relations: 1 state, 5 district, 21 level-6, 1 level-7, 2 level-8 (`Kolkata`, `Maheshtala`). **None at level 9 or 10**, so no ward boundaries and no Howrah corporation outline |
| Level 10 in West Bengal (snapshot 2026-05-31) | 38 relations. None is named as a Kolkata or Howrah ward. What they are was not established |
| A single count of 340 level-6 relations in West Bengal (snapshot 2026-06-01) | **Not repeated.** Later queries to that server returned HTTP 500 or an empty list. Treat as unconfirmed |

Reading this honestly: 273 of 358 rows is the ceiling for a first pilot map, and only if a named reviewer confirms each link. It is not an accuracy rate. The urban labels, the 14 rows with no candidate, the 8 official blocks no row resolves to, and everything below block level stay off the map.

## 4. Delivery options compared

| | A. Licensed complete dataset | B. Legally approved hybrid | C. Limited pilot with disclosed gaps |
| --- | --- | --- | --- |
| What it is | One official or purchased layer for state, district, block and ward | LGD identifiers plus OSM geometry for districts and blocks; urban bodies and wards as non-geographic list entries; SoI later as an upgrade or cross-check | The pilot subset of B, with every gap shown on screen |
| Available today? | **No.** SoI file unopened and unproven. No ward source anywhere | **Candidate only.** Needs legal determination, not yet requested | Buildable once B is approved |
| Block coverage | Unknown | 301 of 345 blocks name-linked, 273 of 358 rows | Same, only for reviewer-confirmed links |
| Ward coverage | None | None | None, stated on screen |
| Legal exposure | SoI single-user, no-sale and no-foreign-sharing terms unresolved (GR-2) | ODbL obligations; unofficial provenance; depiction check (G-07) | Same as B, smaller surface |
| Fabrication risk | None | None, if every drawn unit is a real source feature | None. Gaps are listed, never filled |
| Reversible? | n/a | Yes. The boundary layer is a replaceable dataset | Yes |

**Recommendation: C built on B, with A pursued in parallel.**

1. Evidence does not support waiting for A. Nothing found delivers a complete layer, and the official route needs letters and a company decision (B-27) with no known response time.
2. Among sources that can be inspected today, OSM is the only one with a stated licence text from a stable publisher, a current snapshot, and LGD district codes on its features. geoBoundaries is weaker on all three.
3. A pilot that shows only reviewer-confirmed, source-backed units, and lists everything else as Data Missing / Unknown, never misrepresents geography. That follows the requester's allocation-state preference (R2).
4. If legal declines OSM, nothing built in Stage 0 is wasted. The map stays in its empty state and the pilot runs from the tabular crosswalk (the Phase 0C default, B-19, choice d).

The requester prefers mapping all of West Bengal (R1). That is a preference about extent. For this MVP it is met by **listing** every district and block with its state, and **drawing** only what a source supports. It is not met by drawing wards that no source holds.

## 5. What can be built now, and what must wait

| Can proceed now (no polygon needed) | Must wait |
| --- | --- |
| Shell and styling changes, enabling the Territory Map route | Any real polygon on screen (Gate P1) |
| Map component against an empty-state contract (section 6) | District or block roll-ups, coverage percentages, white-space figures |
| Zoom, fit-to-screen and layer controls, tested on non-geographic fixtures | Kolkata and Howrah ward drawing (Gate P2) |
| Selection architecture keyed on internal unit IDs | Allocation persistence (Supabase, B-15, B-16) |
| Context panel and allocation-form layout, as design only | Importing employee names (B-25) |
| A reviewer sheet for the crosswalk, from the existing register (Appendix A.3 of [phase-0d-stakeholder-approval.md](phase-0d-stakeholder-approval.md)) | Power BI |
| Letters to MoPR, SoI, DST, the State and legal (Phase 0D, section 5) | Statewide completeness claims |

**Never:** synthetic or hand-drawn boundaries, a district shaded from the workbook's `DISTRICT` label, or a map that looks like West Bengal but is not sourced.

## 6. Application work that can proceed in parallel

These are options to recommend, not permission. None starts in this phase.

| Work item | Independent of polygons? | Guardrails | Waits on |
| --- | --- | --- | --- |
| Dashboard shell and premium styling | **Yes** | Keep the "design only" badges until data is real | Nothing |
| Map integration (MapLibre GL JS is the proposed engine) | **Yes, behind a data contract** | A `BoundaryLayer` input that carries dataset ID, level, licence, attribution, vintage, retrieval time and SHA-256, with features keyed by an internal unit ID and an optional LGD code. With no approved layer, show "No approved boundary layer" instead of a map. Use a plain canvas with no external basemap tiles, so no tile-provider terms arise. Check the library licence at implementation | Gate P1 to load real data |
| Zoom and fit-to-screen | **Yes** | Fit to the loaded layer's bounds. Tests use abstract shapes marked "Test fixture, not geography" that cannot ship to production | Nothing |
| District and block selection | **Yes** | Select by unit ID, never by name. Never select or shade by the `DISTRICT` label. The sales-territory view is a **group of block units** from the signed crosswalk | B-26 sign-off for real data |
| Allocation detail panel and basic form design | **Layout only** | Show the four states as provisional configuration. Roles and cardinality are data, not code (B-08, B-09). No persistence | B-12, B-28, B-08, B-15, B-16 for fields and storage |

Before any code, read the version-matched guides in `node_modules/next/dist/docs/` as [AGENTS.md](../../AGENTS.md) requires. The app runs Next.js 16.4.1 with Cache Components enabled, and those guides were not read in this phase because no code was written. No test runner exists yet ([architecture.md](../architecture.md)).

## 7. Blockers

### 7.1 Business inputs that materially block the first MVP release

Requester preferences and requester-confirmed evidence are shown apart from formal decisions. **No formal decision is recorded for any row**, and no approver is named.

| # | Input needed | Status today | Requester input, not approval | Formal decision |
| --- | --- | --- | --- | --- |
| 1 | **Crosswalk review and acceptance** (B-26, with B-23): a named reviewer and sign-off rule. 358 rows: 298 single exact candidates, 3 several, 43 weaker only, 14 none; 40 rows are `MANUAL` | Reviewer fields blank on all rows | R4: workbook rows are the intended membership | **Outstanding.** For the pilot, sign off only the rows to be drawn |
| 2 | **Meaning of `-W` and ambiguous labels** (B-24): `Galsi-W`, `Jharkhand-W`, `Sadar`, 4 `Borough` rows, 8 other urban labels | The meaning of `-W` is not stated anywhere and is not inferred | None | **Outstanding.** The 14 no-candidate rows can be held as Data Missing / Unknown, if the workbook owner accepts that |
| 3 | **Rule for a unit under several territories** (B-23): 6 labels, 12 rows. `Sankrail` also matches two official blocks | Both listings kept | None | **Outstanding.** Needed: allowed or not, the double-counting rule, and which `Sankrail` each row means |
| 4 | **Kolkata and Kalimpong in initial scope** (B-20) | Kalimpong's 4 blocks are no row's candidate. Kolkata has no block, and no ward polygons exist | R1: map all of West Bengal | **Outstanding.** Needed: scope status per unit, and whether Kolkata is one whole unit in the MVP (B-06) |
| 5 | **Allocation states and KPI denominators** (B-12, B-28, B-14, B-06) | No percentage is defined | R2: four states, missing data never becomes Vacant or Unallocated | **Outstanding.** Needed: formal definitions, who may mark Confirmed unallocated and on what evidence, and which units form the denominator |

### 7.2 Approvals that are not business definitions

| Approval | Why it blocks | Status |
| --- | --- | --- |
| **B-18** legal determination: OSM (ODbL), LGD reuse, depiction (G-07) | Gate P1 | Not requested |
| **B-27** boundary-source route | Gate P1 | Not approved |
| **B-19** map depth | Scope of the pilot | Open |
| Written LGD confirmation of commercial reuse and hosting | Gate P1, and any import of LGD codes | Not requested |
| **B-15, B-16** access and hosting | Before Supabase | Open |

## 8. Go/no-go criteria

Thresholds below are **proposals for the approver**, not approved rules.

### Gate P0: polygon-independent application work

| Criterion | Status |
| --- | --- |
| Sponsor approves this report and names the work items from section 6 | Open |
| No geometry, real boundary or place data enters the repository | Required |
| Fixtures are abstract, labelled, and excluded from production | Required |
| No Supabase and no employee data | Required |

**GO** when all four hold. **NO-GO** if any item needs a real polygon or stored personal data.

### Gate P1: district-and-block pilot map

| # | Criterion | Status today |
| --- | --- | --- |
| 1 | Written legal determination on OSM (ODbL) for internal multi-user use, including distributor staff, with attribution and share-alike handling (B-18) | **Not met** |
| 2 | Written LGD confirmation, or legal's documented acceptance of the Copyright Policy, for storing LGD codes and names (B-18, G-06) | **Not met** |
| 3 | Sponsor approves route B-27 and the label "indicative, community-sourced boundaries" | **Not met** |
| 4 | A pinned extract from a stable source, hashed, snapshot date recorded. Not live Overpass | **Not met** |
| 5 | Districts: 23 of 23 joined by LGD code in the pinned extract | **Evidenced (M)**, to repeat on the extract |
| 6 | Blocks: each drawn block has a reviewer-confirmed link to its LGD code, either by name or through the LGD sub-district export mapped to blocks. No unreviewed name-only link is drawn | **Not met.** 301 of 345 linkable, none reviewed |
| 7 | Geometry validity checked on every drawn feature | **Not met** |
| 8 | Crosswalk signed (B-26) for every row drawn | **Not met** |
| 9 | Depiction check for the state outline (G-07) | **Not met** |
| 10 | On-screen disclosure: attribution, snapshot date, and a list of unmapped units with state Data Missing / Unknown | Design only |

**GO** when 1 to 10 are met. **NO-GO triggers:** legal declines OSM or requires Survey of India consistency that the SoI terms do not allow; SoI or MoPR replies restrict multi-user or hosted use; the pinned extract fails item 5; no named reviewer exists.

### Gate P2: statewide map including urban areas

| Criterion | Status today |
| --- | --- |
| Gate P1 met | Not met |
| Official or licensed ward polygons for Kolkata (209) and Howrah (68) at the notified vintage, or a recorded decision to show each as one unit (B-06, B-11) | **Not met.** No source |
| LGD urban-body and ward lists obtained, with dates | **Not met** |
| Whole-body outlines for every in-scope urban body from an approved source | **Not met.** Not measured |
| Formal B-20 scope decision | Open |

**NO-GO today.** It becomes possible only if the State bodies or Survey of India supply boundaries, or the business accepts whole-body units.

## 9. Next actions for people

Nothing has been sent.

1. **Sponsor:** approve or amend the route (section 4) and the section 6 work items.
2. **Legal:** read the ODbL for internal multi-user use, and the LGD policy, against Gate P1 items 1 and 2.
3. **Authorised LGD exporter:** take the LGD sub-district, urban-body and ward lists (CAPTCHA, by hand), and record the page used, the person and the time. The sub-district list is what could turn name links into code links.
4. **Letters** in Phase 0D section 5 (MoPR, SoI, DST, the State). One new question for SoI: what undertaking applies at the free Quick Access download, and does it allow multi-user internal use?
5. **Workbook owner and sponsor:** answer the five items in section 7.1.

## 10. Verification and limits

| Check | Result |
| --- | --- |
| Not done | No SoI file downloaded; no account; no CAPTCHA; no terms accepted; no form submitted. No boundary file was added to the project |
| Project files changed | This report only. No source, configuration, database or workbook file |
| Source file hashes | `AREA MAPPING.xlsx` `85c7f6a0…5fe3`, both LGD reports and the README: **all equal the recorded values** |
| Overpass responses saved (scratch folder, outside the project; first 8 and last 4 hex characters of each SHA-256) | Level 5 `d64f5b05…0c87`; level 6 `7eeba3e1…8cfe`; level 8 `f5a38e9f…acef`; level 9 `961993af…7510`; level 10 `58a63d5c…0a1a`; Kolkata and Howrah box `88fe32bf…32e0`; block geometry sample `97c5503d…032f` |
| Privacy | Only the workbook's place columns were read in earlier phases. The register was read for codes and tiers only. No employee data was read. **The first five availability probes to public Overpass servers carried the requester's company email address in the User-Agent header by mistake.** No later request did |
| Limits | OSM is community data, measured at name level only. Geometry accuracy, validity and urban-body coverage were not tested. The public Overpass servers were unreliable (HTTP 500, 502, empty replies), so the 340 count is unconfirmed. OSM and ODbL licence pages were not re-read. Not legal advice |

## Appendix A: 44 LGD blocks with no unique OSM name link

Official names as the LGD report prints them. Each needs reviewer attention before it could be drawn.

**8 names on more than one OSM relation or LGD block:** `Barrackpur-I` (North 24 Parganas), `Jamal Pur` (Purba Bardhaman), `Raniganj` (Paschim Bardhaman), `Rajnagar` (Birbhum), `Sankrail` (Howrah, 2913), `Sankrail` (Jhargram, 3000), `Chandipur` (Purba Medinipur), `Mohanpur` (Paschim Medinipur).

**36 with no OSM relation of that name:** Arambagh, Bally-Jagacha, Bamongola, Banarhat, Bhagabangola-Ii, Bhagawanpur-I, Bhagawanpur-Ii, Chakdah, Chinsurah-Magrah, Deshapran, Harishchandrapur-I, Harishchandrapur-Ii, Hili, Jambani, Kaliaganj, Khatra-I, Kranti, Kurseong, Kushmandi, Lava, Mahishadal, Matigara, Mirik, Murshidabad-Jiagunj, Naxal Bari, Old Malda, Panskura-I, Patashpur-I, Patashpur-Ii, Pedong, Pursurah, Raipur-I, Shahid Matangini, Shamsherganj, Sirampur-Uttarpara, Thakurpukur Mahestola.

Kalimpong's `Lava` and `Pedong` are in this list. These names appear only in the LGD report. A match that fails here may be a spelling or numbering difference, and none of these is declared absent from OSM.
