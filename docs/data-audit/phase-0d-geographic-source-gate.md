# Phase 0D: Geographic source and licensing gate

**Status: FINDINGS FOR LEGAL AND SPONSOR REVIEW. This document records evidence. It
approves no source, grants no permission, and is not legal advice.**

A factual scope note from the project requester's input of 2026-10-15 is in section 10.
It records the requester's preferred map extent and the stated meaning of the workbook's
`DISTRICT` column. It changes no finding and no gate status in this document.

Research date: **2026-10-15**. Builds on
[geographic-data-assessment.md](geographic-data-assessment.md) (sources S1 to S16) and
[phase-0c-decision-brief.md](phase-0c-decision-brief.md) (sources S17 to S29, the
licence matrix in section 6.4, and gates 2a and 2b in section 7). New sources in this
document are numbered S30 onward.

## 0. Method, evidence labels and limits

### 0.1 Evidence labels

Every claim below carries one of these labels. Official sources come first. A claim
is only as strong as its label.

| Label | Meaning |
| --- | --- |
| **D (official)** | Read directly from the publishing authority's own host on 2026-10-15 (HTML page or PDF). Hash recorded in Appendix A. |
| **D (structure only)** | The page or catalogue was read. The underlying dataset was **not** opened. |
| **R** | Reported by a secondary source (news, law-firm note, aggregator, wiki). Not confirmed against the primary text. |
| **S** | A search-tool summary or result snippet only. |
| **I** | Inference: a reasonable reading that nobody has confirmed. |
| **U** | Unreachable from this environment on 2026-10-15. |

### 0.2 What was and was not done

- Pages were fetched with plain HTTP requests and read as text (the Phase 0C fetch
  tool returned an extraction; this phase read the page text itself). Legal and
  notification PDFs were saved to a scratch folder **outside the project** and read
  with a PDF text extractor. Two PDFs (Kolkata and Howrah Gazette notifications) have
  OCR-quality text layers, so numbers read from them are cross-checked in the text
  of the notification itself.
- **No boundary dataset was downloaded.** No polygon, shapefile or GeoJSON file was
  fetched in Phase 0D. Nothing was added to the repository. No polygon was drawn or
  invented.
- **No account was registered, no captcha was answered, no purchase was made and no
  portal terms were accepted.** The Survey of India catalogue page was reached by
  replaying a menu navigation (what a click on "Administrative Boundary Database"
  does). No "Download" button was pressed.
- Licence wording quoted here is from the text extraction. **A person should re-read
  each licence at its source before relying on it.**
- OpenStreetMap coverage could not be measured (section 3.9).

---

## 1. Verdict

| Level | Identifier source | Polygon source | Gate status after Phase 0D |
| --- | --- | --- | --- |
| District codes and lists | LGD (S7): **D (official)** | n/a | **Ready, subject to a fresh export and written confirmation of commercial reuse** |
| District polygons | LGD for codes | Survey of India free state-level file (S17): **D (structure only)**. geoBoundaries ADM2 (S8): unofficial | **Not passed.** No official file has been opened. The unofficial file's licence provenance is unresolved |
| Rural block list | LGD "Development Blocks" and "Sub-Districts" lists (S7). Which holds West Bengal's CD blocks is **not established** | n/a | **Ready, subject to the same two conditions and to resolving which list** |
| Rural block polygons | LGD for codes | Survey of India "taluk level" file (S17): **D (structure only)**; equals West Bengal CD blocks? **Unknown**. geoBoundaries ADM3, 2018 (S8b): unofficial | **Not passed.** No authoritative current block layer is verified |
| Urban ward lists | LGD (S7) | n/a | Ready, subject to the same conditions |
| Urban ward polygons | LGD for lists | **None found.** For Kolkata (209) and Howrah (68) the wards exist only as written descriptions in Gazette notifications (S30): **D (official)** | **Not available** |
| Gram panchayat, village | LGD for lists | Survey of India Village Boundary Database (free per price list): **D (structure only)** | Out of scope unless B-06 goes below block |

**Bottom line.** A **tabular** Phase 1 needs only LGD identifiers, a signed crosswalk
(B-26) and written LGD terms. **No polygon source passes the Gate 2b tests today.**
The most promising official route (Survey of India) is concrete enough to ask about but
is unverified in content and carries single-user, no-sale and no-foreign-sharing terms
that need written confirmation.

---

## 2. What changed since Phase 0C

| # | Finding | Label | Effect |
| --- | --- | --- | --- |
| 1 | Notifications No. 1728 and No. 1727 dated 11 September 2026 substitute Schedule II of the Kolkata and Howrah Corporation Acts with **209** and **68** wards, described in words | **D (official)** (S30) | Upgrades Phase 0C "Reported". Settles the Howrah figure at **68**. The 144 and 50 ward vintages are superseded. Still **no geometry** |
| 2 | Survey of India publishes a free state-level administrative-boundary file "up to Taluk level" (1:1M, shapefile, single user), directly downloadable without login | **D (structure only)** (S17) | Makes the official route concrete. Contents unverified |
| 3 | The DST Guidelines (15 Feb 2021) apply to "private organizations" and define "Indian Entity" | **D (official)** (S18) | Resolves a Phase 0C unknown: the Guidelines are not limited to foreign entities |
| 4 | LGD states its content is owned and managed by the Ministry of Panchayati Raj with State departments, and NIC hosts it | **D (official)** (S7) | Identifies who must confirm reuse |
| 5 | GODL-India's Gazette text was read; it permits commercial use but covers only data **published under it** | **D (official)** (S25) | Replaces the secondary reading in Phase 0C |
| 6 | The Census office states administrative units are frozen 01.01.2026 to 31.03.2027 | **D (official)** (S31) | Supports the 23-district baseline into 2027 |
| 7 | data.gov.in currently shows a "sandbox environment" banner and dynamic pages that returned no resource metadata | **D (structure only)** (S7b) | Licence tags there cannot be relied on |
| 8 | State geoportal and State Election Commission timed out; OpenStreetMap counts failed | **U** | Gaps from Phase 0C remain |

---

## 3. Source-by-source findings

For each source: what was verified, what is the geographic level, date, identifiers,
licence, commercial suitability, whether it supports district, rural-block or
urban-ward **mapping**, and who must give written confirmation.

### 3.1 Local Government Directory (LGD), S7. Official. Identifiers and lists, no geometry

| | |
| --- | --- |
| **URLs verified** | <https://lgdirectory.gov.in/>, `/downloadDirectory.do`, `/copyRightPolicy.do`, `/termsconditions.do`, `/contactUs.do`, `/aboutLGD.do` (HTTP 200). **D (official)** |
| **Authority** | Pages state "Government of India \| Ministry of Panchayati Raj". Footer: "Site is designed, hosted and maintained by National Informatics Centre. Contents on this website is owned, updated and managed by the Panchayats and State Panchayati Raj Department as a part of e-Panchayat MMP of Ministry of Panchayati Raj." **D (official)** |
| **Geographic level** | The download page lists, among others: all districts of a state; all sub-districts of a state; all development blocks of a state (and with covered villages); urban local bodies of a state; **wards of urban local bodies**; localities of urban local bodies; villages; PRI local bodies; constituency and pincode mappings. Options "Download Directory (one entity at a time)", "Download All Entities of State" and "Download Only Modifications" (with required From and To dates). **No geometry or map option exists.** **D (official)** |
| **Date** | No "as on" date on the download page. The home page shows a "Recent Changes" log whose newest entry was dated **2026-10-14 19:43:23** (a Jammu and Kashmir change). The About page states a Government order must be uploaded for each modification and that old values are archived. West Bengal departments (Rural Development, Panchayati Raj, Urban Development, Revenue, Traditional Body) are listed with maker and checker roles and recent log-in dates. **D (official)**. The vintage of any export is therefore its **download timestamp**, to be recorded |
| **Identifiers** | LGD codes. The About page states "Compliance with Census 2011 codes" and support for linking state-specific codes. **D (official)** |
| **Licence terms (verbatim extract)** | Copyright Policy: "Material featured on this site may be reproduced free of charge in any format or media without requiring specific permission. This is subject to the material being reproduced accurately and not being used in a derogatory manner or in a misleading context. Where the material is being published or issued to others, the source must be prominently acknowledged." It does not extend to third-party material. Terms and Conditions: the content "should not be constructed as a statement of law or used for any legal purposes"; users should "verify/check with the State Departments"; the Ministry is not liable for loss from use of the data. **D (official)** |
| **What is not stated** | Commercial use is not mentioned. No open-data licence (for example GODL) is named on the LGD pages. Access terms for the LGD web services (S32) are not stated on these pages. **D (official)** |
| **Commercial-use suitability** | **Plausible but unconfirmed.** The policy permits reproduction free of charge without specific permission, with conditions. Whether storing LGD codes and names inside a commercial enterprise application, and showing them to distributor staff, is "reproduction" in this sense is a **legal question**. **I** |
| **Supports** | District mapping: **yes (codes, names)**. Rural-block mapping: **yes (lists)**, but whether West Bengal's CD blocks sit in "Development Blocks", "Sub-Districts" or both is **not established**. Urban-ward mapping: **yes (lists)**. Polygons: **no** |
| **Written confirmation from** | **Ministry of Panchayati Raj** as content owner, with the **West Bengal nodal departments** that update the directory. Published contact: Web Information Manager, Ministry of Panchayati Raj, 11th Floor, J.P. Building, Kasturba Gandhi Marg, Connaught Place, New Delhi 110001; email lgdirectory[at]gov[dot]in; telephone 011-24360536. A "Nodal Officer List" link is on the contact page. **D (official)** |

### 3.2 Survey of India Online Maps Portal, S17. Official. District and sub-district boundaries

| | |
| --- | --- |
| **URLs verified** | <https://onlinemaps.surveyofindia.gov.in/> and `AboutPortal.aspx`, `PricingPolicy.aspx`, `FAQs.aspx`, `GeospatialGuidelines.aspx`, `addtocart.aspx`, plus the catalogue page reached from the "Administrative Boundary Database" menu item (HTTP 200). **D (official)** |
| **Authority** | "Content Owned & Maintained by Survey of India"; designed and hosted by NIC. Survey of India is under the Department of Science and Technology. **D (official)** |
| **Product found** | "Administrative Boundary Database", four products, all **Price ₹ 0, type SHAPEFILE, "Content: 1:1 M Sheet"**: OVSF/1M/7 entire country up to district level with HQ; OVSF/1M/6 entire country up to taluk level with HQ; OVSF/1M/9 **state up to district level** with HQ; **OVSF/1M/8 state up to taluk level with HQ**. The About page describes "taluk/sub district" as the third boundary level. The price list shows **"Single"** under "No. of Users" for these products. A Village Boundary Database is also priced ₹ 0. **D (structure only)** |
| **Access** | FAQ 7: the Administrative Boundary Database, Political Maps of India (PDF) and State Maps (PDF) are "available for direct download without registration or login" through Quick Access. FAQ 6: they are free to all users. FAQ 18: no sample or preview of digital vector data exists before purchase. **D (official)** |
| **Terms** | The cart page's undertakings: comply with the Geospatial Data Guidelines (15 Feb 2021) and National Geospatial Policy 2022; "not to share the downloaded data with any foreign individual or foreign entity, except as permitted under applicable laws"; data is "as-is"; "provide due attribution to the Survey of India"; access may be suspended for policy violations; and (paid-product undertakings) "I confirm that I will not sell the downloaded product to any individual or agency" and not republish "the same charts under any different brand name". Whether these undertakings are shown on the free Quick Access route was **not observed** because no download was started. **D (official)** |
| **Not stated anywhere read** | Vintage or epoch; attribute fields (any LGD or Census code); coordinate reference system; whether "taluk / sub district" equals a West Bengal CD block; where urban bodies sit; positional accuracy of the 1:1M product. **Unknown** |
| **Geographic level** | State, district, taluk or sub-district (catalogue statement). Not wards. |
| **Commercial-use suitability** | **Unresolved.** Free of charge is not the same as licensed for commercial or multi-user use. The "Single" user label, the no-sale undertaking, and the no-foreign-sharing undertaking each need a written reading (section 5). The Phase 0C note that a Survey of India clarification allows commercial maps (S19) is relayed by a community member and unofficial. **I** |
| **Supports** | District mapping: **yes, in principle**. Rural-block mapping: **conditional** (equivalence unknown). Urban-ward mapping: **no** |
| **Why it was not downloaded** | The portal's undertakings (above) bind whoever downloads, and may apply on the free route too. A company decision (B-18, B-27) should precede the download, and it should be done by the company's own account holder to a controlled location |
| **Written confirmation from** | **Survey of India, NGDR and UGI Directorate, Dehradun** (named in FAQ 4 as the addressee for whitelisting letters). Published contact: mtr[dot]soi[at]gov[dot]in, telephone +91-135-2970896. **D (official)** |

### 3.3 DST Guidelines on geospatial data and maps (15 Feb 2021), S18. Official policy

| | |
| --- | --- |
| **URLs verified** | <https://www.geospatial.dst.gov.in/Guidelines.aspx>, `/IndianEntityTermsandCondition.aspx`, `/ForeignEntityTermsandCondition.aspx`; the same Guidelines text on the Survey of India portal. **D (official)** |
| **Text read** (DST F.No.SM/25/02/2020 (Part-I)) | Clause 8(i): the guidelines apply to "government agencies, autonomous bodies, academic and research institutions, **private organizations**, Non-Governmental Organizations and individuals". Clause 8(ii)(1): "there shall be no requirement for prior approval, security clearance, license or any other restrictions on the collection, generation, preparation, dissemination, storage, publication, updating and/or digitization of Geospatial Data and Maps within the territory of India"; "Self-certification will be used to convey adherence". Clause 8(xiii): "For political Maps of India of any scale including national, state and other boundaries, SoI published maps or SoI digital boundary data are the standard to be used, which shall be made easily downloadable for free and their digital display and printing shall be permissible. Others may publish such maps that adhere to these standards." Clauses 8(vii) and 8(ix): data finer than the threshold (one metre horizontal) must be created and owned by Indian Entities and stored and processed in India; coarser data "can be uploaded to the cloud". **D (official)** |
| **Self-certification pages** | Separate "Self Certification of Entities" forms exist for foreign and Indian entities. The Indian-entity form includes the undertaking that "Survey of India digital boundary data shall be used as standard for publishing political Maps of India of any scale including national, state and other boundaries". Whether a company using boundaries in an internal territory tool must file the form, how often, and whether such a tool is a "political Map of India", are **unresolved legal questions**. **D (official)** for text; **I** for the questions |
| **Implications** | (1) The Phase 0C worry that the guidelines bind only foreign entities is resolved: they **are addressed to private organisations**. (2) District and block boundaries are far coarser than the one-metre threshold, so the **India-only storage rule is unlikely to apply** to them. **I**, for legal to confirm. (3) A map that draws the state or national outline should use Survey of India-consistent outlines (8(xiii)). **I** |
| **Written confirmation from** | **Department of Science and Technology**, National Geo-Spatial Service Portal. Published address: Technology Bhavan, New Mehrauli Road, New Delhi; telephone +91-11-26562122 and others listed on the page. **D (official)** |

### 3.4 Government Open Data Licence - India (GODL-India) and data.gov.in, S25 and S7b

| | |
| --- | --- |
| **URL verified** | The Gazette PDF at <https://www.data.gov.in/sites/default/files/Gazette_Notification_OGDL.pdf> (HTTP 200): Gazette of India Extraordinary, Part I Section 1, No. 42, 13 February 2017, MeitY notification dated 10 February 2017, F.No. 8(2)/2013-EG-I. **D (official)** |
| **Terms read** | Section 3: "all users are provided a worldwide, royalty-free, non-exclusive license to use, adapt, publish ... for all lawful commercial and non-commercial purposes". Section 4: attribute provider, source and licence; no implied endorsement; no warranty. Section 6 excludes personal information, non-shareable or sensitive data, official symbols, third-party IP and data withheld under RTI section 8. **D (official)** |
| **Scope limit** | The licence covers "shareable non-sensitive data ... generated using public funds" that is **published under the licence** on the Open Government Data platform. It does not retroactively licence data on other government sites such as LGD. **D (official)**; the last sentence is a reading, **I** |
| **data.gov.in today** | The site footer says content "is owned by the respective Ministries/Departments/Organizations and licensed under the Government Open Data License-India", but each page fetched (home, a resource page, a search page) also displays "This is a sandbox environment created for testing and demonstration purposes only. The content, data, and functionality may be incomplete or inaccurate." The LGD sub-districts resource page returned a page shell with no resource metadata (no licence, date or publisher). **D (structure only)** |
| **Effect** | A GODL tag on a data.gov.in copy of LGD data **cannot be verified** from here. Do not use the data.gov.in copy as the licence basis for LGD data |
| **Written confirmation from** | If a data.gov.in resource is ever used: the **data provider named on that resource** (for LGD, Ministry of Panchayati Raj) and the platform operator (MeitY, hosted by NIC) |

### 3.5 West Bengal ward notifications for Kolkata and Howrah, S30. Official. Text, not geometry

| | |
| --- | --- |
| **URLs verified** | West Bengal Urban Development and Municipal Affairs department "Notification & Orders" list, <https://udma.wb.gov.in/circular> (fetched with curl; the site rejects some Python TLS clients). Entries: **No. 1728/UDMA-15011(22)/57/2026-LS-MA SEC**, 11-09-2026, "Amendment of Schedule II of the Kolkata Municipal Corporation Act, 1980 consequent upon increase in the number of Wards from 144 to 209"; **No. 1727/...**, 11-09-2026, Howrah, 50 to 68. Both PDFs were retrieved and read. **D (official)** |
| **What the PDFs are** | Kolkata Gazette Extraordinary, Friday 11 September 2026 (Nos. WB(Part-1)/2026/SAR-576 and SAR-575). The Kolkata notice cites the Kolkata Municipal Corporation (Amendment) Act, 2026 (West Ben. Act XIV of 2026) and section 601 of the 1980 Act; the Howrah notice cites the Howrah Municipal Corporation (Amendment) Act, 2026 (West Ben. Act XV of 2026) and section 219. Each substitutes a new Schedule II listing wards with boundaries on the north, south, east and west, in words (named roads, lanes, canals, mouza limits). The Kolkata text lists wards numbered up to 209 (about 212 "On the north" entries found); the Howrah text up to 68. Because both PDFs are OCR-quality, an exact per-ward count was not trusted; the totals are taken from the notification text. **D (official)** |
| **Geographic level** | Urban ward (text). **No coordinates, no map, no ward codes.** |
| **Date** | 11 September 2026. Whether the new wards are in force for administrative use from that date (rather than only for elections) is **not stated**; it is a question for the State. The text sits inside the Census boundary-freeze window (section 3.7) and the freeze's reach over wards is **unknown**. **I** |
| **Licence** | A Gazette is a published legal text. Whether reuse of the Schedule text, or conversion into polygons, needs permission is a question for legal. No licence statement was found on the notice. **Unknown** |
| **Phase 0C items now closed or changed** | Closed: the Howrah notified figure (68); whether Kolkata's schedule exists (it does). The Acts carry Act numbers, which **implies** assent (**I**). Still open: Howrah's Bally separation; whether any GIS files exist |
| **Supports** | Urban-ward **mapping**: **no**, unless the wards are digitised from text (a GIS task needing owner maps, section 5). Ward **versioning** in the data model: **yes**, the new Schedule is the 209 and 68 vintage |
| **Written confirmation from** | **West Bengal Department of Urban Development and Municipal Affairs**, with **Kolkata Municipal Corporation** and **Howrah Municipal Corporation** (the Governor acted "on recommendation of the Corporation"). Who holds ward GIS files is **not established**; the State Election Commission is a candidate (**R**: one press report says it will mark ward boundaries; the notices say otherwise) |

### 3.6 geoBoundaries (William & Mary geoLab), S8 and S8b. Third party. Unofficial

Metadata JSON re-fetched 2026-10-15 from the geoBoundaries API (hashes in Appendix A);
**identical in every field read to Phase 0C**. **D (official to geoBoundaries only)**.

| | ADM2 (District) | ADM3 (Sub-District) |
| --- | --- | --- |
| Year represented | 2021 | **2018** |
| Units (metadata) | 736 | 6,836 |
| Source stated | "Pathways Data Pvt. Ltd., lgdirectory.gov.in" | same |
| Licence in file metadata | "Open Data Commons Open Database License 1.0" | same |
| Licence source and source URL | `geonode.pathwaysdata.com/layers/geonode` | same |
| Source data update / build | 2023-01-19 / 2023-12-12 | same |

- **The upstream host still does not resolve** (DNS lookup failed on 2026-10-15), so
  neither the licence nor the producer's terms can be checked. **D (official to
  geoBoundaries only)**.
- The geoBoundaries site states its data are "provided under the CC BY 4.0 license";
  the project README says "CC BY 4.0 / ODbL"; the per-file metadata says ODbL. This
  conflict is unresolved. **D (official to geoBoundaries only)**.
- No LGD or Census code is carried in the file (Phase 0C inspected contents).
- **It is not an official source.** Its producer is a private company; LGD offers no
  geometry, so how the polygons were derived is **unknown**.
- **Supports:** district mapping, indicative only. Rural-block mapping, indicative
  only, on a **2018** vintage. Urban wards: no.
- **Written confirmation from:** the geoBoundaries maintainers (for provenance) and
  **Pathways Data Pvt. Ltd.** (for the upstream licence). Neither is an authority for
  administrative boundaries.

### 3.7 Census of India, S13 and S31

| | |
| --- | --- |
| **Verified** | PIB release of 30 March 2026 on Census 2027: "All the administrative units have been frozen for the period 01.01.2026 to 31.03.2027. Census 2027 will be conducted in 36 States/UTs, 7,092 sub-districts, 5,128 Statutory towns, 4,580 Census towns and around 6,39,902 villages, as on 01.01.2026." **D (official)** |
| **Not found** | A West Bengal unit list "as on 01.01.2026"; any Census-issued boundary polygons for West Bengal. The Census 2011 catalogue was reachable (HTTP 200) but not read in depth |
| **Effect on B-10** | Supports keeping the **23 notified districts** as the baseline through at least 31 March 2027 (**I**). Secondary reports say States were "requested" not to change boundaries; the Registrar General's letter itself was not read |
| **Written confirmation from** | Registrar General and Census Commissioner, India, if the scope of the freeze over wards matters |

### 3.8 Other official leads, not usable as verified sources

| Source | What was verified | Status |
| --- | --- | --- |
| **West Bengal geoportal "Basundhara"** (S27) | `basundhara.wb.gov.in` timed out on two attempts on 2026-10-15 (Phase 0C: connection refused) | **U.** Owner not established from reachable pages |
| **West Bengal State Election Commission** | `wbsec.gov.in` (with and without www) timed out | **U** |
| **NAPIX LGD APIs** (S32) | The developer portal lists LGD API products and says "Create a new account ... It's free to join". Terms of use were not read; no account was created | **D (structure only).** Terms unknown |
| **Bhuvan Panchayat, ISRO-NRSC** (S33) | A thematic planning portal (land use, drainage, infrastructure, settlements at 1:10,000 for Gram Panchayat planning). No boundary dataset or download terms were identified or read | **Lead only** |
| **Kolkata and Howrah corporation sites** | `kmcgov.in` returned a 441-byte page; the Howrah domains tried did not resolve; not read | **U** |
| **Banglarbhumi** | Returned a 386-byte stub; not read. Phase 0B found only mouza images | Not a boundary source |

### 3.9 OpenStreetMap, S28. Unofficial. Coverage still unmeasured

One of three public Overpass servers answered a lookup of the state relation
(West Bengal, relation 1960177, `admin_level` 4, `ISO3166-2` IN-WB; server data
timestamp 2026-07-24). The follow-up **count** queries for administrative relations at
levels 5 to 10 failed with HTTP 500 on the same server, and one other server also
returned 500. **Coverage of West Bengal blocks and wards is therefore still
unverified.** OSM is licensed under ODbL (S24, read in Phase 0C). **D (structure only)**.

### 3.10 The 2023 third-party block list and the 2018 boundaries

| Item | Status in Phase 0D |
| --- | --- |
| The **2023 block list** (S16, a mirror of LGD data "last updated 2023-03-01" on a third-party portal) | **Not an authoritative current source.** It remains usable **only** for name-matching tests. It was not re-fetched in Phase 0D. Any match rate against it must be repeated against a fresh LGD export (G-09) |
| The **2018 ADM3 boundaries** (S8b) | **Not an authoritative current source.** Producer, licence provenance and fit to current blocks are unverified. Usable, if ever, as an **indicative, labelled** layer after B-18, joined only through a reviewed crosswalk |
| The **2021 ADM2 boundaries** (S8) | Same status, with the same provenance gap |

---

## 4. Licence matrix, updated

"Commercial use" is the test. None of this is legal advice.

| Source | Terms read | Commercial use | Obligations seen | Status |
| --- | --- | --- | --- | --- |
| **LGD** (S7) | Copyright Policy and Terms and Conditions (**D official**) | **Not stated**; free reproduction with acknowledgement | Reproduce accurately; no misleading use; acknowledge source; no reliance as "statement of law" | **Needs written confirmation** (Ministry of Panchayati Raj) |
| **Survey of India free boundary file** (S17) | Cart undertakings and price list (**D official**); free-route terms **not observed** | **Unresolved**: "Single" user; no-sale; no-foreign-sharing | Follow DST Guidelines and NGP 2022; attribute SoI; no sharing with foreign individuals or entities "except as permitted under applicable laws"; no sale | **Needs written confirmation** (Survey of India) |
| **DST Guidelines** (S18) | Full text (**D official**) | Permits sale and sharing of geospatial data and maps within India without licence (8(ii)(1)) | Self-certification; SoI boundary data is the standard for political maps (8(xiii)); India-only storage only for finer-than-threshold data | **Needs legal reading** of self-certification and "political Map" |
| **GODL-India** (S25) | Gazette text (**D official**) | **Yes**, lawful commercial and non-commercial use | Attribution; no endorsement; excludes personal data | Applies only to data actually published under it. **Not established for LGD or SoI** |
| **geoBoundaries ADM2, ADM3** (S8, S8b) | Metadata and site (**D to geoBoundaries only**) | ODbL permits it (S24); the site says CC BY 4.0 | Attribution; share-alike on publicly used derivative databases (S24) | **Provenance unresolved**; unofficial |
| **OpenStreetMap** | ODbL (S24, Phase 0C) | Yes | As above | Coverage unverified |
| **Kolkata and Howrah Gazette Schedules** (S30) | Notification text (**D official**) | Not stated | None stated | **Needs legal reading** if converted to polygons |
| **Development Data Lab, GADM, Princeton, Stanford, ML InfoMap** | Phase 0C | **No** | n/a | **Excluded** (not re-verified in Phase 0D) |
| **Bhuvan** | Not read | Unknown | Phase 0C: reported 2015 single-user policy (**R**) | **Not usable** until the policy is read |

**Questions that interact with hosting (B-16)**, repeated from Phase 0C and sharpened
by the Survey of India text: if a hosted database or Power BI service is operated by a
foreign entity, does it receive "downloaded data" from the Survey of India file, and
would that count as sharing with a foreign entity? The privacy assessment treats the
hosting side. These are **questions for legal**, not conclusions. **I**

---

## 5. Written confirmations to obtain (nothing has been sent)

Each row is an action for a named person at the company. This phase sent no request.

| # | Authority | Ask in writing | Attach | Unblocks |
| --- | --- | --- | --- | --- |
| 1 | **Ministry of Panchayati Raj** (LGD content owner), copying the West Bengal nodal departments | (a) May a company reproduce LGD codes, names and hierarchy inside a commercial enterprise application, with acknowledgement, and show them to its distributors' staff? (b) Is any open-data licence applicable? (c) Which LGD entity list holds West Bengal's CD blocks: development blocks, sub-districts, or both? (d) May a private company use the LGD web services? (e) What is the "as on" date of an export? | Copyright Policy text; the planned export list (section 6) | B-18; Gate 2a |
| 2 | **Survey of India**, NGDR and UGI Directorate | (a) For product OVSF/1M/8: vintage, attribute fields (any LGD or Census code), whether the sub-district level for West Bengal equals CD blocks, treatment of urban bodies, positional accuracy. (b) Does "Single" user limit use inside a company or by distributor staff? (c) Does storing or processing the file on a service operated by a foreign company breach the no-foreign-sharing undertaking? (d) May derived territory maps be shown internally and to distributors? (e) Is there any finer West Bengal block or ward product? | Cart undertakings; price-list line | B-18, B-27; Gate 2b |
| 3 | **Department of Science and Technology** | Does a company using Survey of India boundaries in an internal territory tool need to file the Indian-entity self-certification, and is such a tool a "political Map of India" under clause 8(xiii)? | Guidelines text | G-07; Gate 2b |
| 4 | **West Bengal Urban Development and Municipal Affairs**, **Kolkata Municipal Corporation**, **Howrah Municipal Corporation** | Are GIS files for the 209 and 68 ward boundaries available, in what format and on what terms, and to a private company? Which body holds them? Effective date of the new wards? | Notifications No. 1728 and 1727 | G-02; B-11 |
| 5 | **West Bengal Panchayats and Rural Development, and Land and Land Reforms departments** (owners of block boundaries: **I**, to be confirmed) | Authoritative current CD-block list and any block boundary file, with terms | n/a | G-01 |
| 6 | **geoBoundaries maintainers and Pathways Data Pvt. Ltd.** | Original licence and provenance of the India ADM2 and ADM3 layers | Metadata | Only if the unofficial route is pursued |
| 7 | **Company legal** | Review of the above responses; ODbL reading; written determination per source (B-18) | This document | Gate 2b |

---

## 6. What an official route requires, step by step (for people, not code)

1. **LGD exports** by the data owner (manual; captcha), for West Bengal only, each with
   download timestamp recorded: all districts; all sub-districts; all development
   blocks (with covered villages if wanted); urban local bodies; and wards of
   in-scope urban bodies. Optionally "Download Only Modifications" over the period since
   the last export, to record vintage. Store outside the repository until row 1 of
   section 5 is answered.
2. **Repeat the name test** against those exports; record rates (Gate 2a).
3. **Only after legal review** (B-18) and a decision on route (B-27): the company's
   account holder downloads the Survey of India file to a controlled location and
   inspects it against a checklist: coordinate reference system; attribute fields;
   vintage; feature counts per West Bengal district against LGD; whether Kalimpong and
   Jhargram are separate; whether "taluk" equals CD block; geometry validity;
   generalisation at 1:1M.
4. **Wards:** obtain GIS from the State bodies in row 4, or record a decision to show
   each urban body as one unit (B-06, B-11).

---

## 7. Gate checklist after Phase 0D

### Gate 2a (tabular hierarchy and crosswalk)

| Requirement (Phase 0C section 7) | Status |
| --- | --- |
| Official LGD exports for districts, the block or sub-district list, urban bodies, wards, with dates | **Partly met** *(updated 2026-10-15, see section 11).* Two reports were received: all districts, and all blocks with covered villages, both generated `Oct 15, 2026, 1:02 PM`. No sub-district, urban body or ward export. The dataset effective date is unverified |
| Name test repeated on those exports | **Partly met** *(updated 2026-10-15, see section 11).* Run statewide, with no territory constraint, on the district and block reports only. The results are candidate sets, not decisions |
| Every in-scope row mapped to one official unit or a documented exception | **Not met.** All 358 rows now have a candidate set or a documented exception in [geographic-crosswalk-review.md](geographic-crosswalk-review.md), but none is mapped: no reviewer decision exists |
| Written LGD terms for commercial reuse (B-18, G-06) | **Not met** |
| Approvals B-23, B-20, B-10, B-24, B-06, B-26 | **None recorded** |

### Gate 2b (cartographic map)

| Requirement | Status |
| --- | --- |
| Licence text from the original publisher, per polygon layer | **Not met** for any polygon layer: SoI free-route terms were not observed; geoBoundaries' licence host is dead. (Policy texts of DST, GODL-India and LGD were read, but they are not licences for a polygon file) |
| Documented provenance and vintage | **Not met** for any polygon source |
| Coverage check: units per district equal the official count | **Not met** (no polygon file opened) |
| Code join proven through the signed crosswalk | **Not met** |
| Geometry validity | **Not met** (not tested) |
| Urban wards: official polygons or a decision to use whole bodies | **Not met.** Text only (Kolkata 209, Howrah 68) |
| Written legal determination (B-18) and depiction check (G-07) | **Not met** |

**Conclusion: neither Gate 2a nor Gate 2b is met.** Phase 0D narrowed the questions and
named the authorities; it did not close either gate.

---

## 8. Remaining geographic and licensing risks

| ID | Risk | Severity | Mitigation (owner) |
| --- | --- | --- | --- |
| GR-1 | No authoritative, verified block polygons; the official file's content is unknown | High for a block map; none for a tabular Phase 1 | Section 5 row 2; keep Phase 1 tabular (B-19) |
| GR-2 | Survey of India "Single" user, no-sale and no-foreign-sharing terms may conflict with a multi-user, hosted application | High if the SoI route is chosen | Written answer (section 5 row 2); legal (B-18) |
| GR-3 | LGD commercial reuse is not stated | Medium | Section 5 row 1 |
| GR-4 | Ward boundaries exist only as text; the Kolkata and Howrah wards changed on 11 September 2026 | High for ward maps; low if whole bodies are used | Section 5 row 4; B-06 and B-11 decisions |
| GR-5 | Unofficial layers have a dead provenance link and mixed licence statements | High if used outside a labelled prototype | Do not use for production; legal (B-18) |
| GR-6 | The workbook's names match a 2023 mirror, not an official current export | Medium | Fresh export (section 6 step 1) |
| GR-7 | The district list could change (five proposed districts); Census freeze to 31 March 2027 | Low to medium | Model `proposed` status; revisit after the freeze |
| GR-8 | Whether Basundhara or the State Election Commission can supply data is unknown | Medium | Letter from the sponsor (B-27) |
| GR-9 | Data.gov.in licence tagging cannot be verified | Low if LGD is taken from lgdirectory.gov.in | Do not rely on it |

---

## 9. Phase 0C items updated by this document

| Phase 0C item | Update |
| --- | --- |
| Section 1.4 item 5 and B-11: Kolkata schedule "Reported" | **Verified (direct)**: notification No. 1728, 11 Sept 2026; 209 wards; text only |
| B-11: Howrah 66 or 68; "whether Bill 4 was overtaken" | The notified figure is **68** (No. 1727; Howrah Act XV of 2026). Whether Bill 4 (66) was overtaken remains a historical question; it no longer affects the data |
| 6.2.6 and 6.4: DST page "titled for foreign entities; binding on domestic company Unknown" | Guidelines apply to private organisations (clause 8(i)); a separate Indian-entity form exists |
| 6.4: GODL "official text not retrieved" | Retrieved and read (S25) |
| 6.2.1: LGD owner | Ministry of Panchayati Raj owns the content; NIC hosts |
| 6.2.3: Survey of India "price or free status not stated" | Free (₹ 0); single user; 1:1M; directly downloadable per FAQ; contents unverified |

---

## 10. Scope notes from requester input (2026-10-15)

This section records two inputs from the project requester as they bear on the geographic
facts above. **No new research was done for it, no source was fetched, and it changes no
finding, label or gate status.** Neither input is formal approval. The formal approvals
(B-20, B-10, B-23, B-26, B-19, B-27, B-18) remain open; see
[phase-0d-stakeholder-approval.md](phase-0d-stakeholder-approval.md), section 3A, and
[phase-0c-decision-brief.md](phase-0c-decision-brief.md), sections 1.5 to 4.

### 10.1 Preferred map extent: all of West Bengal (requester preference)

- **What was stated.** The requester prefers a map covering all of West Bengal, including
  administrative areas that the workbook does not represent. It is a preference for the
  map's **extent**. It does not set the KPI denominator, the district list or the map's
  depth.
- **Gate status.** Gates 2a and 2b stay **not met** (section 7). A statewide extent adds
  no source, licence, boundary file or export.
- **Identifier needs.** The LGD export list in section 6 step 1 already covers all West
  Bengal districts, sub-districts, development blocks and urban local bodies. Its ward
  export is limited to "in-scope urban bodies", which under a statewide extent would mean
  the wards of every urban body in West Bengal.
- **Polygon facts for areas the workbook does not represent** (from Phase 0C, not
  re-checked here). geoBoundaries ADM2 lists Kalimpong and Kolkata among the 23 districts
  (Phase 0C section 6.2.2). ADM3 carries about five Kalimpong features and a single
  feature named `Kolkata`, with no borough or ward features (Phase 0C section 6.2.3 and
  Appendix A). Both layers are unofficial (section 3.6), and no Survey of India file has
  been opened (section 3.2).
- **Wards.** Kolkata (209) and Howrah (68) wards exist only as written descriptions in the
  11 September 2026 notifications (section 3.5). A statewide map would put that ward gap,
  and risk GR-4 in section 8, in scope.
- **Which areas the workbook does not represent.** The Phase 0B audit found no row
  matching Kalimpong blocks and only four Kolkata boroughs (DQ-03). The full list is not
  yet known, because the workbook's `DISTRICT` labels are sales territories (10.2) and
  the crosswalk (B-26) has not been signed.

### 10.2 Meaning of the workbook's DISTRICT column (requester-confirmed evidence)

- **What was stated.** The requester confirms `AREA MAPPING.xlsx` is the company's
  official sales-team mapping workbook and that its `DISTRICT` column represents company
  sales territories or groupings, **not necessarily government administrative
  districts**. This is a requester statement. It has not been checked against a company
  document.
- **"District" in this document** means an official administrative district (LGD, the
  notified list, or a district polygon), never the workbook's `DISTRICT` label.
- **No join on DISTRICT.** The workbook's `DISTRICT` value is not joined to any district
  polygon, LGD district code or district name in this document, by exact or fuzzy name or
  by block-name overlap. Any district-level view or roll-up depends on an approved,
  reviewed crosswalk from sales territories to administrative units (B-23, B-26). Territory
  membership is not inferred.
- **No source carries sales territories.** The polygon files inspected in Phase 0C carry
  only `shapeName`, `shapeISO`, `shapeID`, `shapeGroup` and `shapeType`, with no LGD or
  Census code and no sales-territory attribute. No source in this document carries
  company sales-territory boundaries.
- **Gate 2b, "code join proven through the signed crosswalk"** stays **not met**. The
  crosswalk it refers to must also carry the reviewed link from each sales territory to
  the administrative units it covers.
- **Block and ward polygon and licensing limitations are unchanged** (sections 3, 4 and 8).

## 11. Phase 0E status note (2026-10-15, updated when the LGD reports arrived)

This section updates status only. It changes no finding or evidence label above. The one
gate change is in the Gate 2a checklist in section 7, marked there.

- Earlier on 2026-10-15 Phase 0E tried to take the LGD exports listed in section 6,
  step 1. Every LGD page that returns the lists asks for a CAPTCHA answer: the download
  page (already noted above) and also the public "for citizen" view pages. No export was
  taken then. No CAPTCHA was answered, no account was created, no terms were accepted and
  no access control was bypassed.
- **Update.** The project requester then supplied two LGD reports: *All Districts of West
  Bengal* and *All Blocks of West Bengal State* with covered villages. Both end with the
  generated time `Oct 15, 2026, 1:02 PM`; both SHA-256 values match the requester's
  README. They are kept in `data-source/` (git-ignored) and were not edited. Provenance,
  contents and limits are in section 4 of
  [geographic-crosswalk-review.md](geographic-crosswalk-review.md).
- **Still unverified:** the dataset effective date (neither report prints one) and the
  licence and reuse permission (the README says commercial reuse and hosting are not
  verified). Section 5 row 1 is unchanged: no written confirmation exists.
- **Not obtained:** sub-district, urban local body and ward lists. The two reports contain
  no boundary polygons or coordinates.
- The name test was run on the district and block reports, statewide, without the
  sales-territory label. The register in
  [geographic-crosswalk-review.md](geographic-crosswalk-review.md) now holds candidate
  units, codes, unit types and parents for 344 of 358 rows and no candidate for 14. Every
  reviewer field is blank, so no row is mapped.
- Gate 2a: its first two checklist rows are **partly met**, and its third row stays **not
  met** (section 7). Gate 2b, the licensing questions in section 5 and the risks in
  section 8 are unchanged. No boundary file and no licensed external dataset was added to
  the project.

## Appendix A: Verification log

All fetched 2026-10-15. "Official" means the publisher's own host. Files were saved
outside the project. SHA-256 is of the bytes received.

| ID | Source and URL | Result | SHA-256 |
| --- | --- | --- | --- |
| S7 | LGD home <https://lgdirectory.gov.in/> | 200 | `600c1ca0104bbb176750d1c05e378c83c6a45d8bcc7b0fb8898b146eb5a44ae0` |
| S7 | LGD download page `/downloadDirectory.do` | 200 | `6ce6a1cfb8644cd695e8deb6acbaf868367593f7003ee4a3ccfff3f1bce43778` |
| S7 | LGD copyright policy `/copyRightPolicy.do` | 200 | `b7339ee60f165515beb9e9016a4cc05e0bf4ee5a32a32aab5f9fa6cb7f394fc2` |
| S7 | LGD terms `/termsconditions.do` | 200 | `cb616eb1730c02c765ab3416fa731ef8de7e1accddbc5776b1da18f33ca37780` |
| S7 | LGD contact `/contactUs.do` | 200 | `1d009b5dac0c8c010411c584de1d9c91f0abb9d60e6c907f69ae15fcac95f46c` |
| S7 | LGD about `/aboutLGD.do` | 200 | `b531ecf4bff0b06f83bf5ef5f82338a519694d0b30c86e91ce65fc3374b024aa` |
| S17 | SoI portal home <https://onlinemaps.surveyofindia.gov.in/> | 200 | `e080edeeef1b94be869d8312801c7b8c6b47beffa4aca30b066d64956aae97d3` |
| S17 | SoI About `AboutPortal.aspx` | 200 | `624010f5071167822be8219b2dcdd46ddfc90a5f4b5d55e9cdd38140b481022c` |
| S17 | SoI cart undertakings `addtocart.aspx` | 200 | `06e8551638745e01f308829c9c785257e50ebea96336f387aaf2ba282e1700d6` |
| S17 | SoI Pricing Policy `PricingPolicy.aspx` | 200 | `6579d6f32dfd62412a74309fe60514e3dc9e3d5d6cbe492ce63067be7b0b42fb` |
| S17 | SoI FAQs `FAQs.aspx` | 200 | `8b63165f4db51e13c615b6928e20f29cd6c3c9ea01d2152e578d5633e3cabf0e` |
| S17 | SoI Geospatial Guidelines `GeospatialGuidelines.aspx` | 200 | `42edac295db5f15e181f1a26386d655048eb2f071066b05b4c98becde084338c` |
| S17 | SoI catalogue page (Administrative Boundary Database), reached by menu navigation | 200 | `a75a999d7563952b6ec00ebcffd68198a84d11c24a07ce5cc8586202668bf66c` |
| S18 | DST Guidelines <https://www.geospatial.dst.gov.in/Guidelines.aspx> | 200 | `a05f818eba017659dce7f98237eeb63566723023e1240382732b5f041dcd3fbe` |
| S18 | DST Indian-entity self-certification `IndianEntityTermsandCondition.aspx` | 200 | `393e7fd3b8dadf381678501e4d6e52b014dea246eec35b517257436d8fddd96c` |
| S18 | DST foreign-entity self-certification `ForeignEntityTermsandCondition.aspx` | 200 | `e0f13cd90ec6d6718b42ab60e106c00fd2333acbf2d2b2b080605ee266ae0b65` |
| S25 | GODL-India Gazette PDF, data.gov.in | 200 | `b338e0cfacc9cdc83a40950feaaf5ac9d2396b43d3105f99f7d494921c7e3ebe` |
| S7b | data.gov.in home (sandbox banner) | 200 | `a783e3f6d3f8a2b9d0a53f93178283f62b67670035d7e3e0b820d17053f30c7b` |
| S8 | geoBoundaries API, India ADM1 | 200 | `c694a090b75394aa80214c04de4eb74325a9769fa128a317746d33bf193643d0` |
| S8 | geoBoundaries API, India ADM2 | 200 | `facae06e1656838ebcbd6fc9198cdba8dd568ca2aec19d69759b3263a1511962` |
| S8b | geoBoundaries API, India ADM3 | 200 | `7dc8e3f41533eeb5144d0284cb372bb0f39863aa12cf196910b5d303a1676cee` |
| S30 | UDMA notification list <https://udma.wb.gov.in/circular> | 200 | `bf8443181fa4a49fbbb20ae52be646403bdc716614df3c0cb69c9efb9ee737c6` (home page) |
| S30 | UDMA notification No. 1728 (Kolkata), `/uploads/circular_pdf/1790762626_1728orderma_.pdf` | 200 | `2c6dd0a83e514d9d86bca0c9a619a6cdebb98f6596e3efb2cf9689c5515d1922` |
| S30 | UDMA notification No. 1727 (Howrah), `/uploads/circular_pdf/1790762237_1127orderma.pdf` | 200 | `47dd858a09b23fba16ab4ab5bf2aabcb5909e27c1cd57bab266ccbeee68379b3` |
| S31 | PIB, Census 2027 press conference, 30 Mar 2026 (PRID 2246847) | 200 | `b41b2a0494b09d0f2cf917832691bdbebf28fd9c82ca87422822badfb94113dc` |
| S33 | Bhuvan Panchayat <https://bhuvan-panchayat3.nrsc.gov.in/> | 200 | `44148fc1e47ef21c8308cf443e6ce75042599c1910097ef4e438b3355eb2bf39` |
| S32 | NAPIX LGD developer portal <https://dev.napix.gov.in/nic/lgd/> | 200 | not recorded |
| S27 | `basundhara.wb.gov.in` (two URLs) | **Timed out** | n/a |
| n/a | `wbsec.gov.in`, `www.wbsec.gov.in` | **Timed out** | n/a |
| S28 | Overpass `overpass.private.coffee` state-relation lookup | 200 (lookup); **count queries HTTP 500** | n/a |
| S8 | `geonode.pathwaysdata.com` | **DNS failure** | n/a |
