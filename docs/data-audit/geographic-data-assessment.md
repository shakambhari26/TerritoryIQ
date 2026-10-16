# Geographic data assessment

Research date: **2026-10-15**. Scope: the hierarchy West Bengal → District →
relevant administrative unit → Territory allocation, and whether trustworthy
boundary data exists for it.

**Terminology note (added 2026-10-15, after the B-23 clarification).** In this document
"district", "LGD district" and "official district" mean **government administrative
districts**. The workbook's `DISTRICT` column is different: the project requester has
confirmed it represents **sales territories or groupings, not necessarily
administrative districts** (B-23; see
[open-business-decisions.md](open-business-decisions.md) and
[phase-0c-decision-brief.md](phase-0c-decision-brief.md), section 2). This is a
requester statement, not a formal stakeholder approval. The workbook's labels must
**not** be joined directly to official district polygons, names or codes. Where this
document speaks of joining or rolling up "by district", read it as concerning official
districts reached through a reviewed crosswalk. The original findings are preserved;
dated clarifications follow the entries that could mislead. No block, ward, employee
coverage or territory boundary is inferred here.

**Membership clarification (R4, added 2026-10-15, later the same day).** The requester has
also confirmed that the blocks listed beneath each sales-territory label are that sales
territory's **intended membership** and may be used as the **authoritative business
starting point** for the crosswalk. This is requester-confirmed evidence, **not formal
approval**. It settles which block labels the business puts under each sales territory.
It does **not** settle which official geographic unit a block label is, its official
parent, or any boundary. Those stay to be **matched and validated independently** (GEO-08,
clarification of 2026-10-15, item 5), and the workbook's `DISTRICT` labels are still not
joined to official districts. This document infers no membership beyond the workbook
rows as written.

## How this was researched, and its limits

- Method: web search plus direct reads of the primary pages listed under
  [Sources](#sources). No boundary file was downloaded or opened, so geometry
  quality, attribute names and West Bengal coverage are **not verified**.
- Each source is marked **read** (page content read directly) or **search-only**
  (seen in search-result summaries; the page could not be fetched in this
  environment, mostly TLS certificate errors on news sites). Treat search-only
  items as leads to confirm, not as established fact.
- Joinability to the workbook was tested in the second part of Phase 0B, using
  the workbook's DISTRICT and BLOCK columns against a public LGD block list
  (S16, dated 2023-03-01). Results are in GEO-08. No people columns were used.
- Several figures come from secondary compilations (a bankers' committee profile,
  Wikipedia, news). The authoritative bodies are the West Bengal Government
  gazette, the Local Government Directory and the Census; these were not
  obtainable in machine-readable form here.

## Summary

| # | Topic | Verdict |
| --- | --- | --- |
| GEO-01 | Hierarchy and unit counts | Established (as of 2020, secondary source) |
| GEO-02 | District list is changing | **Unresolved**: 23 notified; 5 more proposed in June 2026 |
| GEO-03 | Kolkata and Howrah ward counts are changing | **Unresolved**: bills passed; Kolkata's new ward schedule reported notified (see Phase 0C update); no ward polygons found |
| GEO-04 | Lowest-level unit differs by area | Established; **the workbook itself mixes blocks and urban units** |
| GEO-05 | District assignment is not coverage evidence | Policy requirement |
| GEO-06 | Boundary sources | District polygons obtainable; block, ward and GP polygons **not confirmed** |
| GEO-07 | Licensing | Mixed; one source ruled out |
| GEO-08 | Join to Excel | **Feasible by name with review; no codes in the workbook.** 334 of 358 rows pair to LGD blocks; 24 need human decisions. *(2026-10-15: the `DISTRICT` column is a sales-territory label and must not be joined to official districts; see GEO-08. R4: the workbook rows are the membership input and geography is validated independently.)* |
| GEO-09 | PIN codes as an alternative unit | Possible, not nested in administrative units |
| GEO-10 | Unresolved dependencies | See list at the end |

## GEO-01: Hierarchy and counts

| | |
| --- | --- |
| **Verified** (read, S1) | A State Level Bankers' Committee profile as of March 2020 gives: 23 districts, 66 sub-divisions, 342 blocks, 127 municipalities, 6 municipal corporations, 3,354 gram panchayats, 37,945 inhabited villages. |
| **Search-only** (S2) | Later profiles (Dec 2025, Mar 2026) reportedly give the same except **7** municipal corporations. The PDF text could not be read here. |
| **Inference** | The working hierarchy is State → (Division) → District → Sub-division → CD Block (rural) or Municipality/Corporation (urban) → Gram Panchayat or Ward → Mouza/village. Divisions (5) are administrative groupings and are not needed for allocation. |
| **Unresolved** | Authoritative current counts from the State Government and LGD. |
| **Action** | Reload counts from an LGD export (S7) and record its download date as the geography vintage. |

## GEO-02: The district list is changing

| | |
| --- | --- |
| **Verified** (read, S3) | Wikipedia states 27 districts "as of 2026" but is internally inconsistent: other passages still say 23. It cites a **22 June 2026 budget announcement** of five new districts (Kolkata reorganisation, Basirhat, Sundarban, Jangipur, Arambagh), and a **1 August 2022 cabinet approval** of seven new districts that it says is "yet to be formally notified". |
| **Search-only** (S4, S5) | News reports describe the 2026 five as **proposals set to be created if the plan receives final approval**, not as operating districts. Totals are reported variously as 27 or 28. A search for a gazette notification found none. |
| **Inference** | **23 notified districts is the safe operating baseline** today. Proposed districts would be carved out of existing ones (North 24 Parganas, South 24 Parganas, Murshidabad, Hooghly), which would change which blocks sit under which district. |
| **Verified (workbook)** | The workbook uses **21 district labels**: none for Kalimpong or Kolkata. Its district list is therefore neither the 23 notified districts nor any proposed list, and its labels include legacy forms (East/West Burdwan, East/West Midnapore). See GEO-08. |
| **Unresolved** | Whether and when the new districts are notified; whether the workbook's DISTRICT is the administrative district or a sales grouping (B-23). |
| **Action** | Model districts with validity dates and a `notified / proposed` status. Do not hard-code a district list. Ask the business which list the workbook follows (B-10). |

*Clarification 2026-10-15.* The requester has said the workbook's `DISTRICT` labels are
sales territories or groupings. So the workbook does not "follow" an administrative
district list, and the 21 labels are not a district list in the official sense. B-10 now
concerns only the **official reference list** (23 notified; proposed ones recorded as
`proposed`). The row above that compares 21 labels with 23 districts is a count of
labels, not evidence about geographic coverage.

Also relevant: Census 2011 listed **19** districts (codes 327–345; search-only, S13),
and four more were created afterwards (Alipurduar, Kalimpong, Jhargram, and the
Bardhaman split into Purba and Paschim). **Inference** from general
background, to be confirmed against LGD. Any boundary or statistics file with
2011 vintage will therefore not match the current 23-district list.

## GEO-03: Kolkata and Howrah ward counts are changing

| | |
| --- | --- |
| **Search-only** (S6, several outlets) | The Assembly passed bills on **12 August 2026** to raise Kolkata Municipal Corporation wards from **144 to 209** and Howrah from **50 to 68** (an earlier item mentions 66 for Howrah). Reports say the changes depend on gubernatorial assent; ward boundaries, population and voter parameters are still **to be determined** by a later delimitation exercise. Bally is reported to be separated from Howrah. Both corporations are run by administrators; elections are expected around year-end. |
| **Correction (Phase 0C, 2026-10-15)** | Gazette text read directly: Bill 19 of 2026 raises Kolkata from 144 to 209 councillors; Bill 4 of 2026 (5 Feb 2026) raises Howrah from 50 to **66**; Bill 18 of 2026 ("Second Amendment", 7 Aug 2026) raises it from 50 to **68**. Both Howrah bills give the current statutory number as **50**, so the "50 vs 66" ambiguity above is two successive bills, not two baselines. None of the three bills sets out boundaries. **Reported (secondary, dated 2026-09-30):** a notification substituted a new Schedule II of the KMC Act listing 209 wards and their boundaries; the Gazette text was not retrieved. The statement above that ward boundaries are "still to be determined" is therefore out of date for Kolkata. No downloadable ward polygon was found for either city. Details and sources: [phase-0c-decision-brief.md](phase-0c-decision-brief.md), section 6.2.4. **Phase 0D update (2026-10-15):** the Kolkata (No. 1728) and Howrah (No. 1727) Schedule II notifications of 11 September 2026 were read in the Kolkata Gazette: 209 and 68 wards, described in words only; the notified Howrah figure is 68. See [phase-0d-geographic-source-gate.md](phase-0d-geographic-source-gate.md), section 3.5. |
| **Inference** | Existing 144-ward polygons (where they exist) will become obsolete. A Schedule of wards is probably a text description of boundaries, not geometry, so polygons would still have to be obtained or digitised. A ward-level territory model built on today's wards needs succession tracking. |
| **Unresolved** | Governor's assent; whether Bill 4 was superseded by Bill 18; Howrah ward boundaries; the final Kolkata figure and Gazette text; whether the next polls use 144 or 209 wards. |
| **Action** | Treat wards as **versioned** units with `valid_from/valid_to` and a succession mapping (old ward → new wards). Do not freeze a ward geography before the business decides which vintage the allocation reflects (B-11). |

## GEO-04: The lowest-level unit differs by area

| Area type | Appropriate unit | Evidence level |
| --- | --- | --- |
| Rural areas | **CD Block**, optionally Gram Panchayat below it | Counts verified (S1); block polygons **not confirmed** (GEO-06) |
| Municipal corporations (Kolkata, Howrah, Siliguri, Asansol, Durgapur, Bidhannagar, …) | **Ward** | Ward lists exist in LGD (S7, read); ward polygons only partly found |
| Municipalities | Whole municipality, or ward if polygons are confirmed | Ward lists in LGD; polygons not found |
| Sub-division | Intermediate grouping only | Counts verified (S1) |
| Other urban forms (census towns, notified areas, development-authority areas) | **Not resolved** | Not researched in depth |

| | |
| --- | --- |
| **Verified** (read) | LGD offers separate downloads for development blocks with covered villages and for urban local bodies with coverage and ward detail (S7). OSM's India tagging scheme places district at level 5, subdistrict at 6, block/revenue circle at 7 and revenue village at 9 (S11). |
| **Verified** (workbook) | The workbook's BLOCK column is **mixed**: 334 of 358 labels match an LGD block name; 12 read as urban units (4 KMC boroughs, Behala, Howrah, Durgapur, Asansol, Kulti, Bidhannagar, Chandannagar, Siliguri); 12 are aliases or unclear. **Inference:** the allocation grain of this sheet is block (plus a few urban units), not district; the business has not confirmed that this is how territories are defined (B-05). |
| **Inference** | A single district contains **both** rural blocks and urban bodies, so the correct lowest-level unit is a property of each *area*, not each district. CD blocks cover rural areas, with urban bodies outside them; this should be confirmed against the LGD coverage exports. Kolkata is a single district whose useful unit is the ward. |
| **Unresolved** | At what level the company actually defines territories (district, block, ward, PIN code, or beat) and whether that level differs between districts (B-05, B-06). |
| **Action** | Use a typed, self-referencing administrative-unit model (see `proposed-data-model.md`) rather than fixed district/block/ward tables. Record a per-area **territory building block** decision. Provisional default for the business to confirm: corporation wards → ward; municipalities → whole municipality; rural → CD block. |

*Clarification 2026-10-15.* "Territories" and "district" above refer to the geographic
building block and to official districts. If the sales territory is the workbook's
`DISTRICT` label, a territory may be a grouping of rows rather than one row (B-05, not
decided). Either way, the allocation grain is recorded per block row, and which blocks
belong to a sales territory is information the business supplies through the
crosswalk. It is not inferred from official district boundaries. *(R4: the business has
now supplied it. The workbook rows are the intended membership, taken as written. The
rows still have to be resolved to official units and, later, boundaries; see GEO-08.)*

## GEO-05: District-level assignment is not proof of coverage

| | |
| --- | --- |
| **Verified** | Nothing in public data shows what an employee covers on the ground. |
| **Inference** | A district-level assignment says the district is *nominally* owned, not that every block, ward or village is visited or served. |
| **Unresolved** | What evidence counts as verified ground coverage, and who verifies it (B-14). |
| **Action** | Keep "assigned", "vacant approved position", "unallocated" and "verified coverage" as four separate concepts in the model. Never derive verified coverage from an assignment. A map must not shade an area as "served" because its district has an assignee. |

*Clarification 2026-10-15.* For allocation status the requester prefers (a preference,
not a formal approval) that four states stay distinct: **assigned**, **vacant approved position**, **confirmed unallocated** and
**data missing or unknown**. "Unallocated" above is therefore split: an area with no
assignment in the imported data is **data missing or unknown** unless an authorised
confirmation records it as unallocated. These are allocation states. **Verified
coverage** remains a separate evidence concept (B-14). See
[proposed-data-model.md](proposed-data-model.md).

## GEO-06: Boundary data sources

No file listed here was downloaded; "coverage" reflects the source's own description.

| Source | Level | Coverage and vintage | Format | Licence | Assessment |
| --- | --- | --- | --- | --- | --- |
| **Local Government Directory** (S7, read) | Codes, names and hierarchy for states, districts, sub-districts, blocks, villages, urban local bodies, wards, with coverage mappings | National; each export is dated | PDF, HTML, XLS, ODT (no CSV option); captcha per request | Not confirmed (check portal terms) | **Best authority for codes and names. The download page offers no geometry option.** Exports are manual, one request at a time. |
| **geoBoundaries, India ADM2 = District** (S8, read) | District, 736 units nationally | **2021** vintage; source data updated Jan 2023; listed sources are Pathways Data Pvt. Ltd. and lgdirectory.gov.in (whether the polygons carry LGD codes is not verified) | GeoJSON, TopoJSON, zip | **ODbL 1.0** (per-file metadata) | Good district-level candidate. Predates the 2026 proposals. West Bengal count and names not verified. Site-wide page says CC BY 4.0; per-file metadata governs, so confirm before shipping. |
| **geoBoundaries, India ADM1 = State** (S8, read) | State, 36 units | 2011 vintage; DataMeet and Election Commission sources | GeoJSON, TopoJSON, zip | CC BY 2.5 India | State outline only. |
| **DataMeet community maps** (S9, read) | Districts, states, constituencies, municipalities, villages | Vintage and sources not stated; "many errors both in data and boundaries" | GeoJSON or Shapefile (WGS84) | Per project; municipal data CC BY 4.0, village boundaries reported as ODbL | Municipal set covers five cities, **none in West Bengal** (Ahmedabad, Bangalore, Bhopal, Bhubaneswar, Pune). Not a source for Kolkata or Howrah wards. |
| **OpenStreetMap** (S11, read) | Admin levels 4–9 in principle | West Bengal completeness **not checked**; wiki last edited Jan 2023 | Extracts via Overpass or planet files | ODbL | Possible gap-filler for blocks and wards. Quality varies; needs a coverage check before use. |
| **Department of Posts PIN code boundaries** (S12, read) | PIN code | Half-yearly granularity; listing dated mid-2025 | GeoJSON | "Open Government License, India" | Official-origin. Metadata is inconsistent (file size shown as 0). data.gov.in returned 403. Verify the actual file. |
| **GADM** (S10, read) | Districts and below | Not assessed | Shapefile, GeoPackage | "Redistribution or commercial use is not allowed without prior permission" | **Ruled out** for a company platform. |
| **Census of India 2011** (S13, search-only) | Data to district, sub-district, village, town, ward | 2011; state code 19; **19 districts** | Tabular (PCA, handbooks) | Government data | Valuable for names and codes. Boundary polygons not confirmed as an official download. Out of date vs the 23-district list. |
| **Banglarbhumi mouza maps** (S15, third-party) | Mouza / cadastral | Digitisation incomplete per guides | Images; no bulk vector download found | Not confirmed | Not usable as a bulk administrative layer. |
| **Gram panchayat polygons** | GP | **No source found** | - | - | **Unresolved dependency.** |
| **Kolkata and Howrah ward polygons** | Ward | **No open source confirmed** | - | - | **Unresolved dependency**, and the wards are about to change (GEO-03). |

| | |
| --- | --- |
| **Reasonable inference** | District polygons (geoBoundaries ADM2 plus LGD codes) are obtainable now and can show a **district roll-up**. But the workbook allocates staff **per block** (GEO-04), so a map that shows the actual allocation needs block polygons, which are **not confirmed** (G-01). A district-only map would hide the allocation detail the business keeps. |
| **Unresolved** | Authoritative, current polygons for CD blocks (now a priority), urban wards, boroughs and gram panchayats; whether the State (Municipal Affairs, SEC, KMC) will supply ward and borough shapes. |
| **Action** | Treat block polygons as the **critical geographic dependency** for any allocation map (G-01). Until they are confirmed, Phase 1 can use LGD codes and tabular allocation, with district polygons for a roll-up only. Urban units in the workbook (boroughs, municipal corporations) need their own boundary decision (G-02). |

*Clarification 2026-10-15.* "District roll-up" above means a roll-up of **official
districts** whose members are known through the reviewed crosswalk. The workbook's
`DISTRICT` labels are sales-territory labels and must **not** be joined to these
polygons or shaded on them. A district map built from the labels would present sales
territories as if they were government districts.

**Map depiction rule (not verified).** India's geospatial rules set requirements
for how national and external boundaries are depicted. The 2021 guidelines and
2022 National Geospatial Policy reportedly relaxed approvals for domestic use,
but only secondary summaries were read (S14). Confirm any external-boundary
depiction requirement against the DST/Survey of India text before building maps.

## GEO-07: Licensing and update limits

| | |
| --- | --- |
| **Verified** (read) | GADM bars commercial use and redistribution without permission. geoBoundaries India ADM2 is ODbL (share-alike on derived databases; attribution required). DataMeet municipal data is CC BY 4.0; DataMeet village boundaries are ODbL. OSM is ODbL. The PIN code dataset is listed as "Open Government License, India". |
| **Inference** | ODbL permits commercial use with attribution and obligations on publicly shared derived **databases**. An internal dashboard is likely fine, but this should be confirmed by the company's legal owner before any redistribution. |
| **Unresolved** | LGD usage terms; licence terms of any State-supplied ward data. |
| **Action** | Record source, licence, retrieved date, and checksum with every boundary dataset. Display attribution in the app. |

## GEO-08: Can geography be joined reliably to the Excel data?

| | |
| --- | --- |
| **Verified** (S7) | LGD codes are the national standard identifiers and exist for every unit type of interest. No official Census-2011-to-LGD crosswalk was found. |
| **Verified** (workbook) | The workbook has **no codes of any kind** (no LGD, Census, district or block code). It carries names only. |
| **Verified** (test, S16) | Against an LGD block list dated 2023-03-01 (345 West Bengal blocks, 22 districts): **district labels**: all 21 map to an LGD district, shown by block-name overlap rather than assumed, with every label agreeing with its expected district. **Blocks**: 293 of 358 rows match exactly after normalising case, spaces and dashes; 39 more match as same-district spelling variants (7 very close, 12 close, 20 weaker); 2 match a block that LGD places in another district (`Binpur I`, `II`); **24 remain unmatched**: 12 read as urban units, 6 pair with a leftover same-district LGD block (inference), 6 are unclear. Only 11 of the 345 LGD blocks have no workbook counterpart: **4 in Kalimpong** (no workbook district) and 7 elsewhere (one each in Alipurduar, Birbhum, East Midnapore, West Midnapore, Murshidabad, Purba Bardhaman, Purulia), six of which line up with a leftover workbook row in the same district. **No block name is duplicated inside one workbook district.** |
| **Inference** | A name-based join to LGD **is feasible at district and block level** (about 93% of rows pair automatically, 82% by exact name) but cannot be silent: 63 rows (the 24 unmatched plus the 39 variant spellings) need a human decision or sign-off. Ward-level and gram-panchayat joins cannot be tested because the workbook goes no lower than block. |
| **Unresolved** | The meaning of DISTRICT (DQ-05, B-23); `Galsi-W` and `Jharkhand-W` (B-24); confirmation of the 45 block pairings (B-26). The LGD snapshot is a **2023 third-party mirror**, so the test shows name behaviour, not current official status. |
| **Action** | Run the same comparison against a fresh official LGD export (G-04) before treating match rates as final. Use one reviewed crosswalk (workbook label → LGD code), stored with the reviewer and date. |

*Clarification 2026-10-15.* Four points, with the original findings above unchanged:

1. **Do not join the `DISTRICT` column to official districts.** "All 21 map to an LGD
   district ... every label agreeing with its expected district" and "feasible at
   district and block level" describe a **name-overlap test**. They are not a mapping and
   not a join key. The Inference holds for **block** labels only, and only through a
   reviewed crosswalk.
2. **The "same-district" checks are weaker than they looked.** The 39 variant pairings,
   the 2 cross-district blocks and the 6 leftover pairings were constrained by the
   label-to-LGD-district overlap. Under the working interpretation that constraint is not
   proof. All 45 pairings stay **unconfirmed** and need review (B-26).
3. **The crosswalk's job is wider.** "Workbook label → LGD code" is correct for `BLOCK`
   labels. For `DISTRICT` labels the crosswalk records which actual geographic units the
   business says belong to each sales territory. That information comes from the
   business. It is **not inferred** here from official boundaries or name similarity.
   *(R4: that information is the workbook's listed rows, which the requester has
   confirmed as the intended membership.)*
4. **Unresolved, updated.** The meaning of DISTRICT is now a requester-confirmed working
   interpretation (sales territory or grouping); formal sign-off is not recorded (B-23).

*Clarification 2026-10-15 (R4, later the same day).* The requester has confirmed that the
blocks listed beneath each sales-territory label are the intended membership of that
territory and may be the authoritative business starting point. Two more points follow.

5. **Geographic validation that remains necessary.** The workbook rows give membership,
   not geography. Each of these is still to be done, and none has been:
   1. A fresh **official LGD export** (districts, sub-districts, development blocks,
      urban local bodies and wards), with its download date recorded (G-04, G-09). The
      2023 mirror is not authoritative.
   2. The **name test repeated against that export across the whole state**, with no
      restriction to the "district" a sales-territory label resembles. Phase 0B's 293, 39,
      2 and 24 came from a label-constrained test and stay diagnostics only.
   3. **Every candidate unit recorded** for each block label, not only the best one. A
      name that matches more than one unit (`Sankrail`, with two official blocks and two
      boundary features) is ambiguous and goes to review.
   4. **Unit type set from official lists.** The 12 urban-looking rows (four KMC boroughs,
      which are not wards, and eight corporation, municipality or town labels) are not
      classified from their labels.
   5. **LGD code and official parent taken from LGD**, never from the sales-territory
      label.
   6. **Ward vintage** chosen before any Kolkata or Howrah ward is used (B-11; 209 and 68
      wards are notified as text only).
   7. **Completeness in both directions.** Every workbook row is accounted for, and every
      official block in scope is either listed under a sales territory or marked "not
      listed in the workbook" (data missing or unknown, never unallocated).
   8. **Boundaries**, only at gate 2b: a verified block layer, a legal determination for
      its licence, a code join proven through the signed crosswalk (never by name alone),
      and geometry validity. No polygon source passes today, and none exists for wards.
   9. **Named-reviewer sign-off** and acceptance by the data owner (B-26). Outstanding.
6. **Flagged, not resolved.** Unmatched, ambiguous, mixed-unit and conflicting records
   (the six block labels under two sales territories, the 12 urban-looking rows,
   `Galsi-W`, `Jharkhand-W`, the 39 variants and ambiguous names) are flagged for review.
   They are listed with workbook row numbers in
   [data-quality-findings.md](data-quality-findings.md) (DQ-15). A conflict is not resolved
   by picking the sales territory whose name resembles the unit's district. Both listings
   are kept.

## GEO-09: PIN codes as an alternative territory unit

| | |
| --- | --- |
| **Verified** | Official PIN boundary polygons are published (S12, with caveats above). |
| **Inference** | PIN codes are delivery areas. They do not nest cleanly inside blocks, wards or districts. If the business defines territories by PIN code, a separate unit type with its own overlap rules would be needed. |
| **Unresolved** | Whether territories are ever defined by PIN code (B-05). |
| **Action** | Do not adopt PIN as a unit unless the business confirms it. |

## GEO-10: Unresolved dependencies

| ID | Dependency | Blocks |
| --- | --- | --- |
| G-01 | Authoritative current CD-block polygons for West Bengal | Block-level map and allocation |
| G-02 | Ward polygons for municipal corporations and municipalities (current and post-delimitation) | Urban ward-level map and allocation |
| G-03 | Gram panchayat polygons (only if GP-level territories are needed) | GP-level allocation |
| G-04 | A current LGD export for West Bengal, with its download date recorded. *(Update 2026-10-15, Phase 0E: **partly received.** Districts and blocks-with-covered-villages reports, both generated `Oct 15, 2026, 1:02 PM`. Effective date and licence unverified. No sub-district, urban body or ward export. See [geographic-crosswalk-review.md](geographic-crosswalk-review.md), section 4.1.)* | Code and name baseline, alias table |
| G-05 | Status of proposed new districts and Howrah/Kolkata ward changes | Which geography version is current |
| G-06 | Legal confirmation of ODbL use; LGD terms | Production use of boundary data |
| G-07 | External-boundary depiction requirements (DST/Survey of India) | Any public-facing or embedded map |
| G-08 | ~~The workbook (to test joinability)~~ **Received and tested.** Residual: a reviewed workbook-to-LGD crosswalk (63 rows to confirm). *(2026-10-15, R4: the workbook rows are the authoritative membership input, so the crosswalk is drafted from all 358 rows. The 63 was a label-constrained count and may change on the unconstrained re-run.)* | Import design |
| G-09 | A current official LGD block and urban-body export to repeat the name test (the test used a 2023 mirror). *(Update 2026-10-15, Phase 0E: the test was repeated statewide, without the territory constraint, on the block and district reports. Candidate sets only, no reviewer decision. The urban-body export is still missing. See [geographic-crosswalk-review.md](geographic-crosswalk-review.md), section 6.)* | Final match rates |
| G-10 | Business answer on whether Kolkata and Kalimpong are in scope (B-20). *Requester preference recorded 2026-10-15: map all of West Bengal. It is a preference, not a formal approval.* | Whether geography needs Kolkata wards or Kalimpong blocks at all |

## Sources

Access date for all: 2026-10-15. **read** = page read directly. **search-only** =
appeared in search results; content not fetched.

- S1 (read), SLBC West Bengal State Profile, as of March 2020 (secondary): <https://slbcbengal.pnb.bank.in/StateProfile_31032020.asp>
- S2 (search-only), SLBC profiles Dec 2025 / Mar 2026: <https://slbcbengal.pnb.bank.in/pdf/State%20Profile%2031-03-2026.pdf>
- S3 (read, partial), Districts of West Bengal (secondary, internally inconsistent): <https://en.wikipedia.org/wiki/Districts_of_West_Bengal>
- S4 (search-only), ThePrint, budget and new districts: <https://theprint.in/india/governance/bjps-maiden-budget-in-west-bengal-has-big-announcement-5-new-districts-including-kolkata/2966655/>
- S5 (search-only), UNI, budget and new districts: <http://www.uniindia.com/west-bengal-budget-2026-27-proposes-5-new-districts-to-strengthen-administration/east/news/3884854.html>
- S6 (search-only), ward bills, 12 Aug 2026: <https://www.theweek.in/news/india/2026/08/12/kmc-wards-to-jump-to-209-hmc-to-68-as-west-bengal-passes-delimitation-bills.html>, <https://www.deccanherald.com/amp/story/india/west-bengal/kolkata-to-get-209-wards-howrah-68-as-bengal-assembly-passes-bills-4108634>, <https://www.millenniumpost.in/bengal/bengal-clears-bill-to-raise-kmc-wards-to-209-howrah-to-68-672131>, <https://thefederal.com/category/states/east/west-bengal/bengal-assembly-clears-bills-raise-civic-body-wards-kolkata-howrah-253325>
- S7 (read), Local Government Directory download page: <https://lgdirectory.gov.in/downloadDirectory.do>
- S8 (read), geoBoundaries API, India ADM2 and ADM1: <https://www.geoboundaries.org/api/current/gbOpen/IND/ADM2/>, <https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/>; site licence statement: <https://www.geoboundaries.org/>
- S9 (read), DataMeet maps index and municipal data: <https://projects.datameet.org/maps/>, <https://projects.datameet.org/Municipal_Spatial_Data/>, <https://github.com/datameet/Municipal_Spatial_Data>
- S10 (read), GADM licence: <https://gadm.org/license.html>
- S11 (read), OSM India administrative boundaries: <https://wiki.openstreetmap.org/wiki/India/Administrative_Boundaries>
- S12 (read; data.gov.in returned 403), PIN code boundaries: <https://aikosh.indiaai.gov.in/home/datasets/details/delivery_post_office_pincode_boundary.html>, <https://data.gov.in/resource/delivery-post-office-pincode-boundary>
- S13 (search-only), Census of India 2011 catalogue: <https://censusindia.gov.in/nada/index.php/catalog/1344>
- S14 (search-only, secondary), National Geospatial Policy 2022 summaries: <https://www.indiaenvironmentportal.org.in/reports-and-documents/national-geospatial-policy-2022>
- S15 (third-party, unofficial), Banglarbhumi mouza maps guide: <https://1acre.in/guides/west-bengal/banglarbhumi-mouza-map>
- S16 (read; downloaded to a scratch folder outside the project, not stored in the repo), Block LGD codes, India Data Portal mirror of lgdirectory.gov.in data, "Data last updated 2023-03-01"; 345 West Bengal blocks in 22 districts; columns `id, block_name, block_code, district_name, district_code, state_name, state_code`; licence not verified; used for name matching only: <https://ckandev.indiadataportal.com/dataset/lgd-codes/resource/bdf22015-a213-4e23-b693-ca40bec4346e>
