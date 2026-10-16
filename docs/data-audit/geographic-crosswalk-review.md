# Geographic crosswalk review (Phase 0E)

**Status: DRAFT CANDIDATE CROSSWALK. Candidates were matched against two official Local Government Directory (LGD) reports that the project requester supplied on 2026-10-15. Every reviewer field is blank. This document is not an approved crosswalk, not a boundary source, not an allocation record, and not evidence of any permission to reuse LGD data. It approves nothing.**

Date: **2026-10-15** (Phase 0E, resumed with the two LGD reports). Builds on [workbook-inventory.md](workbook-inventory.md), [data-quality-findings.md](data-quality-findings.md) (especially DQ-15), [geographic-data-assessment.md](geographic-data-assessment.md), [phase-0d-geographic-source-gate.md](phase-0d-geographic-source-gate.md) and [proposed-data-model.md](proposed-data-model.md). Question IDs (B-xx) point to [open-business-decisions.md](open-business-decisions.md).

This document contains no employee names, no employee codes and no pay values. Only the `DISTRICT` and `BLOCK` columns of the workbook were read (section 3). "The brief" below means the Phase 0E task instructions.

**Handling note.** Section 9 quotes official LGD names and codes. The licence for reusing them is **unverified** (section 4.1), so keep this document inside the company until the licence question (B-18, G-06) is answered in writing. The LGD files themselves stay in `data-source/`, which is git-ignored (`.gitignore`, line 44).

## 1. Summary

| Question | Answer |
| --- | --- |
| Rows accounted for | **358 of 358** (workbook rows 2 to 359), each exactly once, in section 9. Original row numbers and labels are verbatim. |
| Official sources used | Two LGD reports supplied by the requester (section 4.1): *All Districts of West Bengal* (23 district rows) and *All Blocks of West Bengal State* with covered villages (41,006 village rows, which are **345 distinct Block Codes** after deduplicating by Block Code, not by name). Both SHA-256 values equal the values in the README. Neither file was edited or copied into the project. |
| Source portal and report time | Both reports print "Local Government Directory" in their first row. Both end with the generated time **`Oct 15, 2026, 1:02 PM`** (no time zone is stated). The portal address (lgdirectory.gov.in) and the Ministry of Panchayati Raj attribution come from the README, which describes a browser screenshot that is not in the project. |
| Dataset effective date | **Unverified.** Neither report prints an effective or "as on" date. The generated time says when the portal produced the report, not what date the data describes. |
| Licence and reuse permission | **Unverified.** The README says commercial reuse and hosting permissions have not been verified and that the files are not licensing approval. Holding the files is not permission to reuse or host them. |
| What the reports do not contain | No boundary polygons and no coordinates. No sub-district, urban local body, ward or gram panchayat list. No unit-type column. |
| Matching | Run on all 358 rows against **every** official district and block in the state. The `DISTRICT` sales-territory label was not an input to matching (section 4.5). |
| Result (candidates, not decisions) | **301** rows have at least one exact-name candidate (tier T1 or T2): 298 with exactly one, 3 with more than one. **43** rows have only weaker candidates (T3 or T4). **14** rows have no candidate at any tier. |
| Row status (protocol of 4.5) | `MANUAL` 40 (underlying result: 22 one candidate, 5 several, 13 none); `CAND-1` 313; `CAND-N` 4; `NONE` 1. The four values sum to 358. |
| Repeated territory listings | 6 labels are listed under two territories (12 rows). All 12 are kept. Four pairs (SH-2, SH-4, SH-5, SH-6) each point at one official block; SH-1 `Sankrail` points at two official blocks that carry that name; SH-3 `Joypur` has only a weak candidate (7.1). |
| Reverse direction | Of 345 official blocks, 297 are an exact-name candidate for at least one workbook row, 40 are candidates only at weaker tiers, and **8 are no row's candidate**, including all 4 Kalimpong blocks (7.9). Those 8 are "not listed in the workbook", allocation state Data Missing / Unknown. |
| Unmatched and ambiguous rows | 14 rows with no candidate: 10 of the 12 urban-looking rows, `Galsi-W`, `Jharkhand-W`, `Medinipur Sadar` and `Nanur`. Their unit type cannot be assessed because no urban local body or ward list was supplied. |
| Reviewer fields | Blank on every row. No decision, name, role or date has been entered. |
| Workbook integrity | SHA-256 before and after equals the Phase 0B baseline (section 11). |
| Remaining blockers | Section 10. The main ones: effective date and licence are unverified; no sub-district, urban body or ward list; no named reviewer; workbook-owner questions are open. |

A candidate is a name-based suggestion with a recorded tier and score. It is not a match, a mapping or an approval. The counts above describe candidate sets, not accuracy.

## 2. Semantic rules in force

These five things stay separate. Nothing in this document moves a row from one to the next.

| Concept | State after Phase 0E |
| --- | --- |
| Intended sales-territory membership | The workbook rows as written (requester-confirmed evidence, R4, not formal approval). Carried verbatim in section 9. |
| Candidate official geographic-unit identity | **Candidates only**, from the two LGD reports, each with tier, score, code, unit type and parent as the report records them (section 9). No candidate is selected. |
| Reviewer-approved geographic crosswalk | **None.** No reviewer has decided anything (B-26). |
| Verified boundary geometry | **None.** The two reports contain no polygons or coordinates (4.2). No boundary file was obtained or opened (Gate 2b, [phase-0d-geographic-source-gate.md](phase-0d-geographic-source-gate.md)). |
| Employee allocation state | **Not touched.** No staff column was read. No row is converted to a vacancy or to confirmed unallocated. |

The `DISTRICT` column is a sales-territory label (B-23). It is shown as context only. The matcher never read it. It is never used to restrict a geographic match, to prove membership, to break a tie, or to join to government district names, codes or polygons. The parent district shown for a block candidate is the district that the official report records; whether it agrees with the sales-territory label is not evidence and is not computed.

The four allocation states are unchanged: **Assigned**, **Vacant approved position**, **Confirmed unallocated**, **Data Missing / Unknown** (see [proposed-data-model.md](proposed-data-model.md)). A blank cell, a missing label, an unmatched unit or an absent employee record is never converted to a vacancy or to confirmed unallocated. Every geographic unit that is not resolved here is **Data Missing / Unknown** for allocation purposes.

## 3. Source handling and integrity

| Item | Value |
| --- | --- |
| Original workbook | `data-source/AREA MAPPING.xlsx` (git-ignored). Opened read-only. Never written. |
| Phase 0B baseline SHA-256 | `85C7F6A02370562D0E38286F592A71014A61A365E68E9CB05DC10EAC22295FE3` ([workbook-inventory.md](workbook-inventory.md), section 1) |
| Hash before this run | `85C7F6A02370562D0E38286F592A71014A61A365E68E9CB05DC10EAC22295FE3`. **Matches the baseline.** Size 32,894 bytes. |
| Hash after this run | See section 11. |
| How it was read | A Python script (standard library only, run with `python -I`) opened the file read-only as a zip archive and walked the worksheet XML. It kept the cell values of columns **A (`DISTRICT`) and B (`BLOCK`) only**; cell elements in every other column were discarded as they were parsed. Header cells A1 and B1 were checked to read `DISTRICT` and `BLOCK`. The shared-string table was decoded only for strings that an A or B cell uses. Values of columns C to N were not extracted, held, printed or analysed. |
| Rows | Header at row 1. Data rows 2 to 359. 358 data rows, no gaps, no blank A or B cell. |
| Employee data | None processed or disclosed. No salary values exist in the workbook (workbook-inventory.md, section 6). |
| Cross-checks against earlier reports (re-run in this session) | 21 territory labels, each a contiguous run; 355 distinct block labels as written; 352 after removing dash and space and folding case; 6 block labels under two territories (12 rows); no block label repeats inside one territory; 18 labels with an en dash; one label (row 343) with a trailing non-breaking space. All agree with DQ-15. The 358 territory and block labels read in this run equal the labels in the previous draft of this register. |
| LGD files | Opened read-only, parsed with the same standard-library approach, never copied into the project, never edited. Hashes before and after are in section 11. |

## 4. Official source files and matching procedure

### 4.1 Provenance record

Facts below are observed in the files or in the README (`data-source/README_provenance.txt`, SHA-256 `4e46ee0fc5333805a0bdcc139d55ceb4b5c9b8147792f945379384650343279b`, size 1,081 bytes). The README is the requester's note, not an official record.

| Field | Districts report | Blocks report |
| --- | --- | --- |
| File | `LGD_West_Bengal_Districts_2026-10-15.xls` | `LGD_West_Bengal_Development_Blocks_with_Covered_Villages_2026-10-15.xls` |
| Size | 27,471 bytes | 31,756,839 bytes |
| SHA-256, computed in this run | `6bfb026b79c85e7c171297c001dacc0f3df61422e28f0442818c222632591ce8` | `e266d8141fbcb2870d757f3cbbb4650e8ace1e553887c9bbb84444eb95fc3a36` |
| SHA-256 stated in the README | Same value. **Matches.** | Same value. **Matches.** |
| Format | SpreadsheetML 2003 XML text with an `.xls` extension (the file starts `<?xml` and `<?mso-application progid="Excel.Sheet"?>`). It is not a binary Excel file. One worksheet, `Report`. | Same |
| Title rows as printed | `Local Government Directory`; `All Districts of West Bengal(State Code:19) State` | `Local Government Directory`; `All Blocks of West Bengal State` |
| Columns | 7: `S. No.`, `District Code`, `District Version`, `District Name (In English)`, `District Name (In Local)`, `Census 2001 Code`, `Census 2011 Code` | 8: `State Code`, `State Name (In English)`, `District Code`, `District Name (In English)`, `Block Code`, `Block Name (In English)`, `Village Code`, `Village Name (In English)` |
| Rows | Header rows 4 and 5; 23 data rows (rows 6 to 28); blank row 29; timestamp row 30 | Header row 5; 41,006 data rows (rows 6 to 41,011); blank row 41,012; timestamp row 41,013 |
| Generated time, in the last row | `Oct 15, 2026, 1:02 PM` | `Oct 15, 2026, 1:02 PM` |

Record of the export, in the form the earlier draft asked for:

| Field | Value |
| --- | --- |
| LGD lists obtained | All districts of West Bengal; all blocks of West Bengal with covered villages. **Not obtained:** sub-districts, urban local bodies, wards. |
| State and scope | West Bengal, State Code 19, as printed in the report titles and in the `State Code` column. |
| Source portal | The first row of both files reads "Local Government Directory". The README adds "lgdirectory.gov.in, Ministry of Panchayati Raj" and says this was shown in a browser screenshot. The screenshot is not in the project, so the address and the Ministry attribution are **the requester's statement, not independently verified from the files**. Earlier probes (Appendix A) did read that site and describe it as Ministry of Panchayati Raj content hosted by NIC. |
| Page or route used, and who exported | **Not recorded.** The README says only that the files were received from the project requester. Which LGD page was used, and the name and role of the person who answered any CAPTCHA, are unknown. |
| Report generated time | `Oct 15, 2026, 1:02 PM` in both files. No time zone is printed. |
| Dataset effective date | **UNVERIFIED.** Neither file prints an effective, "as on" or version date. The districts file has a `District Version` column (values 1, 2 or 3) with no dates. The generated time is not an effective date. The earlier probe of the LGD download page likewise found no "as on" date. Nothing independent of the two files establishes one. |
| Licence and reuse terms | **UNVERIFIED.** The README states that commercial reuse and hosting permissions have not been verified. Phase 0D read the LGD Copyright Policy, which permits free reproduction with acknowledgement and does not mention commercial use ([phase-0d-geographic-source-gate.md](phase-0d-geographic-source-gate.md), section 5, row 1). No written confirmation exists (B-18, G-06). The terms text was not re-read for these two files. |
| Limitations noted | The README: the block report repeats block information on every village row; the files list names and codes and contain no verified block or ward polygons. The LGD Terms and Conditions state that the data "should not be constructed as a statement of law or used for any legal purposes" (read in an earlier probe). |
| Storage | `data-source/`, outside version control (`.gitignore`, line 44). Not copied into `docs/`, `src/` or any other project folder. |

### 4.2 What the reports contain, and what they do not

- **Districts report:** 23 districts with a District Code, a version number, an English name, a "local" name column and two census codes. The "local" column holds Latin-script text in this file, mostly upper case (for example `BANKURA`), not Bengali script. It is blank for Alipurduar.
- **Blocks report:** one row per covered village, each repeating the state, district and block codes and names (hence 41,006 rows for 345 blocks). Village codes and names are present.
- **Not present in either file:** polygons, coordinates or any geometry column; sub-district, urban local body, ward and gram panchayat lists; an effective date; a unit-type column; a population or area figure. **These reports contain no boundary geometry.** Gate 2b is unchanged and still **not met**.
- **Title wording.** The README and the file name call the block report "Development Blocks with Covered Villages". The report's own title is "All Blocks of West Bengal State". This register records the unit type of a block candidate as `Block`, the wording of the report's own columns, and does not qualify it further.
- **Coverage of the block report (Inference, not verified).** A report built from village rows would not list a block that has no covered village. The count of 345 is therefore "distinct Block Codes in this report". It is not asserted to be the number of blocks in West Bengal, and the report does not state such a number.
- **Urban units.** No urban local body, borough or ward appears in either file. Whether LGD records boroughs at all is **not established** by these reports.

### 4.3 Parsing results (verified)

| Check | Result |
| --- | --- |
| District rows | 23. District Codes unique; English names unique. |
| Districts with a blank Census 2001 code and Census 2011 code `000` | Alipurduar, Jhargram, Kalimpong, Paschim Bardhaman (4). Observed only. It is not used as a date. |
| Block-report data rows | 41,006. Every row has all 8 cells filled. State Code is `19` and State Name is `West Bengal` on every row. |
| Village codes | 41,006 distinct. No repeated village code and no repeated whole row. |
| **Distinct Block Codes** | **345.** Each Block Code carries exactly one district code, district name and block name. |
| Distinct block names | 344. One name is carried by two codes: `Sankrail` (2913 under Howrah, 313; 3000 under Jhargram, 703). Deduplicating by name would lose one of them, so the deduplication is by Block Code. |
| Districts in the block report | 22 District Codes, all present in the districts report with identical names. **Kolkata (315) has no block row.** |
| Village rows per block | Smallest 9 (2909 `Bally-Jagacha`); largest 634 (2990 `Keshpur`). |
| Non-ASCII characters in official names | None. |

Blocks per district in the block report: Alipurduar 6, Bankura 22, Birbhum 19, Cooch Behar 12, Dakshin Dinajpur 8, Darjeeling 9, Hooghly 18, Howrah 14, Jalpaiguri 9, Jhargram 8, Kalimpong 4, Malda 15, Murshidabad 26, Nadia 18, North 24 Parganas 22, Paschim Bardhaman 8, Paschim Medinipur 21, Purba Bardhaman 23, Purba Medinipur 25, Purulia 20, South 24 Parganas 29, Uttar Dinajpur 9, Kolkata 0. These sum to 345.

### 4.4 Features of the official names that affect matching

Official names are stored exactly as the reports print them and are never normalised in place. Observed features:

- Roman numerals are title-cased: 75 block names end in `Ii` or `Iii` (for example `Alipurduar-Ii`, `Garbeta-Iii`).
- The numeral separator varies: hyphen (`Kalna-I`), space (`Kalna II`, `Mathurapur I`), space then hyphen (`Galsi -I`, `Gopiballav Pur -Ii`), underscore (`Ketugram_I`) and an Arabic digit (`Karimpur-1`, `Memari-1`).
- Word breaks vary: `Raghunath Pur-I` against `Raghunathpur-Ii` in the same district; `Kak Dwip`, `Jamal Pur`, `Naxal Bari`, `Magra Hat-I`, `Gangajal Ghati`; `Faridpur - Durgapur` with a spaced hyphen.
- Two spellings of one stem occur: `Bhagabangola-Ii` (3004) and `Bhagawangola-I` (3005).
- Official spellings differ from several workbook labels (for example `Garbeta` against the workbook's `Garhbeta`, `Mahishadal` against `Mahisadal`). Which spelling is right is not decided here.

### 4.5 Matching procedure as run

This applies the procedure documented in the earlier draft of this section, with the changes listed in 4.7.

1. **Load unmodified.** Both LGD files and the workbook were opened read-only; hashes were recomputed (section 11).
2. **Derived key** (working field only; the verbatim label stays in the register). Unicode NFKC; non-breaking space to space; en dash, em dash and underscore to hyphen; collapse spaces; trim; case-fold. A trailing numeral (`I`, `II`, `III`, `IV`, `V`, `1` to `4`) that follows a space, a hyphen or both is split off, so that `-I`, ` I`, ` - I`, `_I`, `-1` and `Ii` read as the same numeral. The same derivation is applied to official names.
3. **Pools searched, statewide.** All 345 official blocks and all 23 official districts. No unit list was restricted by any workbook field. A numbered label is not tested against districts, because the district list has no numbered units.
4. **Tiers.**
   - **T1** exact derived key: same name and same numeral.
   - **T2** same name once spaces and punctuation inside it are removed, same numeral.
   - **T3** weaker structural matches: same name with a different or missing numeral; same words in a different order; one name's words are the leading words of the other (shorter name at least 5 letters); the label is a contiguous part of a longer official name.
   - **T4** spelling variant: difflib `SequenceMatcher` ratio of at least 0.80 on names with spaces and punctuation removed (at least 0.85 when the shorter name has 4 letters; no fuzzy test below 4 letters), numerals equal; also a one-word label against a single word of a multi-word official name (at least 0.80).
   The thresholds are working choices. They were not tested against known answers. A row below them can still be a true match (for example `Nanur` and `Nanoor`, 0.73), and a row above them can be a false one.
5. **Precedence.** If a row has any T1 or T2 candidate, T3 and T4 hits are **not** candidates for that row. T4 hits are shown in the Evidence cell as "near, not retained" with their scores (flag `N-NEAR`), and sibling numerals are not shown. If a row has no T1 or T2 candidate, **every** T3 and T4 hit is retained as a candidate. This is a method choice, recorded in 4.7.
6. **Candidate record.** For every retained candidate: the official name verbatim, the code, the unit type (`Block` for the block report, `District` for the district report; neither report has a finer type column), and the parent chain as the report records it (district code and name, then `West Bengal (19)`; for a district, `West Bengal (19)` from the district report's title). All plausible candidates are kept. None is selected.
7. **Nearest names (information only).** For a row with no T1 or T2 candidate, up to three official names with similarity of 0.60 or more that were not retained as candidates are listed, using the whole label or its first word, whichever is closer (first-word scores are marked). They are a similarity listing, often unrelated (for example `Bhangar` for `Bidhannagar`), and are not candidates.
8. **Village-name echo (information only).** For a row with no T1 or T2 candidate, the number of village rows whose name equals the label (after removing a trailing bracketed suffix such as `(Ct)`) is recorded. A village of that name is not a block candidate and is not evidence about what the label means. The suffixes are not interpreted.
9. **Row status**, as in the earlier protocol: `CAND-1` exactly one retained candidate; `CAND-N` more than one; `NONE` no candidate; `MANUAL` a flag of section 5 needs a business decision first. For `MANUAL` rows the underlying result is shown in brackets, for example `MANUAL (CAND-1)`, so no result is hidden.
10. **Reverse direction.** Every official block was checked for at least one workbook row that retains it (7.9).
11. **Re-hash and re-check** (section 11). Counts are recorded only from this run.

### 4.6 The earlier blocked attempt (history)

Earlier on 2026-10-15 (07:14 to 07:15 UTC, plain read-only HTTP GET requests), Phase 0E tried to take the LGD lists directly and found that every page that returns them asks for a CAPTCHA answer (the download page and the public "for citizen" view pages), so nothing could be retrieved by an authorised route in that session. No form was submitted, no CAPTCHA was answered or solved, no account was created, no terms were accepted and no control was bypassed. The routes that were deliberately **not** used were: submitting forms without a CAPTCHA, calling hidden endpoints or automated CAPTCHA solving; the NAPIX web services (new account and terms needed); data.gov.in copies (no verifiable publisher, date or licence); the 2023 third-party India Data Portal mirror and a community dump (not authoritative); a West Bengal Panchayats and Rural Development Department page (not an LGD export, not opened); and Survey of India boundary files (boundary geometry, terms unconfirmed). The probe log is in Appendix A. The requester then supplied the two reports described in 4.1, so the blocker for the district and block lists is lifted. The blocker for sub-district, urban body and ward lists is not.

### 4.7 Changes to the earlier draft protocol, and why

- **`MANUAL` keeps the underlying result in brackets.** The earlier draft listed the four statuses as exclusive. Showing `MANUAL (CAND-1)` keeps the match result visible, so the counts in section 6 can be read either way.
- **Precedence rule (step 5).** An unfiltered prototype pass listed sibling numerals and similar-looking names as extra candidates (`Dantan-II` for `Dantan-I`, `Kashipur` for `Keshpur`) and left 172 rows with more than one candidate. With the precedence rule 9 rows have more than one. Near-neighbour names are not lost; they are named in the Evidence cell.
- **Three structural tests were added to T3 and T4:** a label that is part of a longer official name; a one-word label against one word of a compound official name; and a 4-letter threshold of 0.85.
- **Districts as candidates.** The district list is searched as well as the block list, because the brief asks for all plausible candidates and some labels (for example `Jhargram`) name a district and a block.

## 5. Status vocabulary and flag codes

**Row status** (4.5, step 9): `CAND-1`, `CAND-N`, `NONE`, `MANUAL (...)`. **Best tier** is shown after the status: `best T1`, `best T2`, `best T3`, `best T4` or `best NONE`.

`MANUAL` is set when a row carries any of `SH`, `MU`, `UC`, `XD`, `AN`, `E-STEM` or `E-COMP`: the earlier flags that point to a specific reviewer decision. 40 rows carry one. It is a routing marker and not a finding.

None of the statuses is an approval.

Flags come from three places: the workbook text, flags already reported in DQ-15 and DQ-07, and checks made in Phase 0E. A flag is a reason for reviewer attention. It is not a finding about the real world. The `XD`, `SV`, `UC` and `AN` flags were set in earlier phases from Phase 0B's work, which used the label-constrained test against the 2023 third-party mirror. They are kept as they were. They are earlier diagnostics, not results of this run.

| Flag | Meaning | Origin |
| --- | --- | --- |
| `SH-1` to `SH-6` | The same block label is listed under two sales territories. The partner row is named. Both listings are kept. | DQ-15 flag 1 |
| `MU-B` | Label reads `Borough` plus a number. DQ-15 and the brief treat these as the four KMC borough entries. The workbook text does not say Kolkata. A borough is not a ward. | DQ-15 flag 2 |
| `MU-M` | Label text itself names a municipality, municipal corporation or `MC`. | DQ-15 flag 2 |
| `MU-N` | Reads as an urban unit by name only (no unit-type word in the label). Classified from the label, not checked. | DQ-15 flag 2 |
| `UC` | Unmatched or unclear in Phase 0B (named in DQ-15 flag 3). | DQ-15 flag 3 |
| `XD` | Phase 0B's 2023 mirror placed the block in a different LGD district. Not a conflict by itself, because the label is a sales territory. | DQ-15 flag 4 |
| `SV` | Named as an example of a spelling difference against the 2023 mirror (DQ-07 or DQ-15). Mirror diagnostic only. | DQ-07, DQ-15 |
| `AN` | Named as an ambiguous name in DQ-15 flag 5. | DQ-15 flag 5 |
| `E-STEM` | The name stem is also used by other rows (in another territory, or in numbered and un-numbered form) and is not a DQ-15 shared label. | **New in Phase 0E** |
| `E-ECHO` | The label contains a place name that also appears, in the same or an alternative spelling, in its own sales-territory label (for example `Cooch Behar` in a label under `Coochbehar`). Risk of confusion with a district-level unit. Checked against workbook text only. | **New in Phase 0E** |
| `E-NEAR` | A near-neighbour spelling exists elsewhere in the workbook (similarity 0.84 or more). A fuzzy match could cross to the wrong row. Partner rows named. | **New in Phase 0E** |
| `E-COMP` | Two names joined by a dash inside one label. May match one official unit or more than one. | **New in Phase 0E** |
| `T-ED` | Label contains an en dash (U+2013). Normalised only in the derived key. | DQ-08 |
| `T-HS` | Label uses a spaced hyphen (` - `). | DQ-08 |
| `T-NB` | Label contains a non-breaking space (U+00A0). Row 343. | DQ-08, DQ-15 |

**New in this run (matching flags, prefix `N-`).**

| Flag | Meaning |
| --- | --- |
| `N-WEAK` | The best candidate is T3 or T4. No exact-name candidate exists for the row. |
| `N-NUM` | A retained candidate differs from the label in its numeral (the label has a numeral the candidate lacks, or the reverse, or the numerals differ). |
| `N-TYPE` | The retained candidates are of more than one unit type (a block and a district). |
| `N-DUPNAME` | A retained candidate's official name is carried by more than one official code (`Sankrail`). |
| `N-SHR` | A retained candidate is also retained for another row. Strong pairs (both rows exact) flag both rows. A row whose candidate is only weak is flagged when another row holds the same unit; the exact-name row is not flagged for that reason. Partner rows and tiers are named in the Evidence cell. |
| `N-NEAR` | A T4 near-neighbour name exists in the official lists but was not retained because the row has an exact-name candidate. Named in the Evidence cell. Not the same as `E-NEAR`, which compares workbook labels with each other. |
| `N-ULB` | The label reads as an urban unit (`MU`) and has no exact-name candidate. No urban local body or ward list was supplied, so the missing candidate does not show that no such unit exists. |
| `N-ECHO` | Village rows exist whose name equals the label. Information only (4.5, step 8). |

## 6. Counts

Counts of **candidate sets and flags**. They are not match rates and not accuracy figures.

| Measure | Value |
| --- | ---: |
| Data rows accounted for | 358 |
| Sales-territory labels | 21 |
| Block labels, distinct as written | 355 |
| Block labels, distinct after removing dash and space and folding case | 352 |
| Block labels listed under two territories | 6 labels, 12 rows |
| Rows labelled `Borough` | 4 (rows 204, 205, 206, 207) |
| Official district rows | 23 |
| Official block-report data rows (one per village) | 41,006 |
| Official distinct Block Codes | 345 |
| Rows with an exact-name candidate (T1 or T2) | **301** (T1: 288; T2: 13) |
| of which, exactly one candidate | 298 |
| of which, more than one candidate | 3 (rows 53, 54, 217) |
| Rows with only weaker candidates (T3 or T4) | **43** (best T3: 8; best T4: 35) |
| of which, exactly one candidate | 37 |
| of which, more than one candidate | 6 (rows 21, 65, 104, 108, 269, 319) |
| Rows with no candidate at any tier | **14** (rows 29, 64, 67, 68, 69, 156, 204, 205, 206, 207, 208, 245, 258, 318) |
| Check: 301 + 43 + 14 | 358 |
| Underlying result, all rows: `CAND-1` / `CAND-N` / `NONE` | 335 / 9 / 14 |
| Protocol status: `MANUAL` / `CAND-1` / `CAND-N` / `NONE` | 40 / 313 / 4 / 1 |
| `MANUAL` rows by underlying result: `CAND-1` / `CAND-N` / `NONE` | 22 / 5 / 13 |
| Rows with at least one earlier substantive flag (`SH`, `MU`, `UC`, `XD`, `SV`, `AN`, `E-STEM`, `E-ECHO`, `E-NEAR`, `E-COMP`) | 74 (unchanged) |
| Distinct official units retained as a candidate by any row | 337 blocks and 3 districts (Howrah 313, Jalpaiguri 314, Jhargram 703) |
| Distinct official units that are an exact-name candidate (T1 or T2) | 297 blocks and 1 district (Jhargram 703) |
| Official blocks that are an exact-name candidate for two rows | 6 (2797, 2896, 2897, 2898, 2913, 3000) |
| Official blocks with no candidate row / only weaker candidates / an exact-name candidate | 8 / 40 / 297 (sum 345) |
| New flags: `N-WEAK` / `N-NUM` / `N-TYPE` / `N-DUPNAME` | 43 / 5 / 2 / 2 |
| New flags: `N-SHR` / `N-NEAR` / `N-ULB` / `N-ECHO` | 16 / 34 / 12 / 18 |
| Rows with a reviewer decision | **0** |

The Phase 0B figures (293 exact, 39 variant, 2 in another LGD district, 24 unmatched) came from a test constrained by the label-to-LGD-district overlap against the 2023 mirror. They are diagnostics, they are not carried into this register, and they are **not comparable** with the table above: the source, the date, the scope (statewide, no territory constraint) and the tier rules all differ. A difference between the two sets of figures is not a measure of change over time.

## 7. Exception accounting

Each exception the brief names is accounted for below with its rows and the evidence from the two official reports. All are in the register in section 9. Nothing here is resolved, merged or dropped.

### 7.1 Six labels listed under two sales territories

Each listing is a separate source relationship. Neither is dropped, merged or resolved. Whether shared geographic responsibility is allowed, and any double-counting rule, is a business question (B-23).

| Pair | Row, territory, label as written | Row, territory, label as written | Evidence from the two reports |
| --- | --- | --- | --- |
| SH-1 | 54, JHARGRAM, `Sankrail` | 217, Howrah, `Sankrail` | The block report carries **two** blocks named `Sankrail`: **2913** (district Howrah, 313) and **3000** (district Jhargram, 703). Each row retains **both** at T1. The name cannot narrow either row to one block. Flags `AN`, `N-DUPNAME`, `N-SHR`. |
| SH-2 | 66, WEST BURDWAN, `Ausgram-II` | 71, EAST BURDWAN, `Ausgram II` | Both rows have one T1 candidate: **2797** `Ausgram-Ii` (Purba Bardhaman, 306), the only official block with that name. Row 70 `Ausgram I` (EAST BURDWAN) has 2796 `Ausgram-I`. |
| SH-3 | 110, BANKURA, `Joypur` | 127, PURULIA, `Joypur` | **No exact name exists.** Both rows retain the same single weak candidate, **2782** `Jaypur` (Bankura, 305), T4, similarity 0.83. `Jaipur` (3050, Purulia, 321) scores 0.67, below the rules, and is shown as a near name. Flags `AN`, `N-WEAK`, `N-SHR`. |
| SH-4 | 224, Howrah, `Jangipara` | 243, Hooghly, `Jangipara` | Both rows have one T1 candidate: **2896** `Jangipara` (Hooghly, 312), the only official block with that name. |
| SH-5 | 225, Howrah, `Khanakul-I` | 230, Hooghly, `Khanakul I` | Both rows have one T1 candidate: **2897** `Khanakul-I` (Hooghly, 312). |
| SH-6 | 226, Howrah, `Khanakul-II` | 231, Hooghly, `Khanakul II` | Both rows have one T1 candidate: **2898** `Khanakul-Ii` (Hooghly, 312). |

What this shows and does not show:

- For SH-2, SH-4, SH-5 and SH-6 the two reports hold **one** official unit of that name, so these reports give no second same-named block for the reading "two different places that share a label". The reports do not include sub-districts, urban local bodies or wards, so they **cannot rule out** a same-named unit in those lists.
- For SH-1 the block report itself holds two same-named blocks, so both readings stay open.
- For SH-3 no official unit has the exact name, so neither reading can be tested.
- The parent district beside a candidate is the official one. It is not used to choose between candidates, and agreement or disagreement with the sales-territory label is not computed.
- The 12 rows keep their `SH-1` to `SH-6` flags and are marked `MANUAL`.

### 7.2 Urban units that may be boroughs, municipalities or corporation-level areas rather than wards

The 12 urban-looking rows of DQ-15 flag 2 are kept as membership lines. **Their unit type is not decided.** Neither report lists urban local bodies, boroughs or wards, so the type cannot come from these reports. All 12 rows have **no exact-name candidate**: 10 have no candidate at all and 2 have only a weaker one.

| Row | Territory | Label as written | Flag | Outcome in the two reports |
| ---: | --- | --- | --- | --- |
| 64 | WEST BURDWAN | `Asansol` | `MU-N` | No candidate. No official name within similarity 0.60. |
| 65 | WEST BURDWAN | `Kulti` | `MU-N` | Weaker only: T4 `Kultali` (2763, 0.83) and `Kulpi` (2762, 0.80). Each of those is the exact-name candidate of another row (193 and 192). Two village rows are named `Kulti` (echo only). |
| 69 | WEST BURDWAN | `Durgapur Municipal Corporation` | `MU-M` | No candidate. Row 58 `Faridpur Durgapur` has the T2 candidate 2802 `Faridpur - Durgapur`; the relation between rows 58 and 69 is unknown and not assumed. |
| 156 | North 24 PGS | `Bidhannagar Municipality` | `MU-M` | No candidate. |
| 204 | South 24 PGS | `Borough 10` | `MU-B` | No candidate. No official name within 0.60. |
| 205 | South 24 PGS | `Borough 11` | `MU-B` | Same as row 204. |
| 206 | South 24 PGS | `Borough 7` | `MU-B` | Same as row 204. |
| 207 | South 24 PGS | `BOROUGH 12` | `MU-B` | Same as row 204. |
| 208 | South 24 PGS | `Behala municipality` | `MU-M` | No candidate. |
| 223 | Howrah | `Howrah MC` | `MU-M` | Weaker only: T3 `Howrah` **District** (313) by leading words. A district-level unit for a label that names a corporation-type unit. |
| 245 | Hooghly | `Chandanagar` | `MU-N` | No candidate. One village row is named `Chandanagar` (echo only). Also `SV`. |
| 318 | Darjeeling | `Siliguri` | `MU-N` | No candidate. |

- **The four KMC borough entries** (rows 204 to 207). The brief and DQ-15 call them KMC boroughs. The workbook text holds only `Borough N`. DQ-15 states that a KMC borough is an administrative sub-division containing several wards and is not a ward; that is not re-checked here. Whether LGD records boroughs at all is **not established**: the two reports are not sources for urban bodies.
- **General caution (Inference, from general knowledge, not source-supported).** Many West Bengal development blocks carry the name of a town that is itself an urban local body. A label with no unit-type word can therefore name a block, a municipality, a sub-division, or more than one. A block-name hit in the block report is a name hit only. It does not show that the label means that block, and a missing hit does not show that the label is not a block.
- **Wards.** No label contains the word ward. Ward-level matching, and the ward vintage question (Kolkata 209, Howrah 68; B-11), arise only if a label resolves to a ward. None is assumed. No ward list was supplied.

### 7.3 `Galsi-W` and `Jharkhand-W`

| Row | Territory | Label as written | Result in the two reports | Status |
| ---: | --- | --- | --- | --- |
| 67 | WEST BURDWAN | `Galsi-W` | **No candidate at any tier.** Listed under nearest names, by the label's **first word only**: `Galsi -I` (2803) and `Galsi-Ii` (2804), similarity 1.00 on that first word. That is not a whole-label match. Row 75 (EAST BURDWAN) `Galsi II` has the T1 candidate 2804. No workbook label reads `Galsi I`, and 2803 has no candidate row at any tier (7.9). | `UC`, `AN`, `MANUAL (NONE)` |
| 68 | WEST BURDWAN | `Jharkhand-W` | **No candidate at any tier.** No official name within 0.60. The two reports cover West Bengal only, so the absence does not show where the label belongs. | `UC`, `MANUAL (NONE)` |

The suffix `-W` appears on exactly these two labels in the workbook. Its meaning is not stated anywhere in the workbook or in either report, and it is not inferred here (not "West", not "whole", not "part"). Whether it marks part of a block, a different unit or an out-of-state area is a question for the workbook owner (B-24). No candidate unit is proposed for either row.

### 7.4 Spelling variants and alternative spellings

**Inside the workbook (verified).**

| Pattern | Rows |
| --- | ---: |
| En dash (`T-ED`): 16 before a numeral, 2 joining two names (rows 309, 310) | 18 |
| Tight hyphen | 53 |
| Spaced hyphen (`T-HS`) | 10 |
| Space then numeral | 77 |
| No numeral or other form | 200 |
| Non-breaking space in the label (`T-NB`, row 343) | 1 |

The same name is written two ways at rows 66 and 71 (`Ausgram-II`, `Ausgram II`), 225 and 230 (`Khanakul-I`, `Khanakul I`) and 226 and 231 (`Khanakul-II`, `Khanakul II`). Rows 297 and 298 write `Cooch Behar - I` and `Cooch Behar - II` under the territory label `Coochbehar`.

**Against the official names (this run).** 43 rows have no exact-name candidate but have one or more weaker ones. For these rows the official spelling or numbering differs from the workbook label, or the label is part of, or contains, a longer official name. **No spelling is declared right.** Every candidate is retained and none is selected. The earlier examples named against the 2023 mirror now read as follows in the official reports: `Garhbeta` against official `Garbeta` (rows 30 to 32, T4); `Krishnanagar` against `Krishnagar` (rows 166 and 167, T4); `Mahisadal` against `Mahishadal` (row 9, T4); `Medinipur Sadar` (row 29) has **no candidate**; `Chandanagar` (row 245) has **no candidate**.

| Row | Label as written | Candidates (all retained, none selected) |
| ---: | --- | --- |
| 9 | `Mahisadal` | `Mahishadal` Block (2959), T4 sim 0.95 |
| 21 | `Contai-II` | `Contai-I` Block (2950), T3 numeral differs; `Contai-Iii` Block (2951), T3 numeral differs |
| 27 | `Salboni` | `Salbani` Block (2999), T4 sim 0.86 |
| 30 | `Garhbeta-I` | `Garbeta-I` Block (2981), T4 sim 0.93 |
| 31 | `Garhbeta-II` | `Garbeta-Ii` Block (2982), T4 sim 0.93 |
| 32 | `Garhbeta-III` | `Garbeta-Iii` Block (2983), T4 sim 0.93 |
| 35 | `Keshiari` | `Keshiary` Block (2989), T4 sim 0.88 |
| 55 | `Jamboni` | `Jambani` Block (2987), T4 sim 0.86 |
| 56 | `Andal` | `Ondal` Block (2819), T4 sim 0.80 |
| 65 | `Kulti` | `Kultali` Block (2763), T4 sim 0.83; `Kulpi` Block (2762), T4 sim 0.80 |
| 87 | `Mongalkote` | `Mangolkote` Block (2815), T4 sim 0.80 |
| 97 | `Mejia` | `Mejhia` Block (2785), T4 sim 0.91 |
| 100 | `Khatra` | `Khatra-I` Block (2783), T3 numeral differs |
| 103 | `Ranibandh` | `Ranibundh` Block (2789), T4 sim 0.89 |
| 104 | `Raipur` | `Raipur-I` Block (2788), T3 numeral differs; `Jaipur` Block (3050), T4 sim 0.83 |
| 108 | `Bishnupur` | `Bishnupur-I` Block (2749), T3 numeral differs; `Bishnupur-Ii` Block (2750), T3 numeral differs; `Vishnupur` Block (2795), T4 sim 0.89 |
| 109 | `Indas` | `Indus` Block (2781), T4 sim 0.80 |
| 110 | `Joypur` | `Jaypur` Block (2782), T4 sim 0.83 |
| 124 | `Baghmundi` | `Bagmundi` Block (3045), T4 sim 0.94 |
| 127 | `Joypur` | `Jaypur` Block (2782), T4 sim 0.83 |
| 136 | `Bagdah` | `Bagda` Block (2725), T4 sim 0.91 |
| 137 | `Bangaon` | `Bongaon` Block (2732), T4 sim 0.86 |
| 140 | `Barrackpore I` | `Barrackpur-I` Block (2728), T4 sim 0.86 |
| 141 | `Barrackpore II` | `Barrackpur-Ii` Block (2729), T4 sim 0.86 |
| 157 | `Chakdaha` | `Chakdah` Block (3027), T4 sim 0.93 |
| 166 | `Krishnanagar I` | `Krishnagar-I` Block (3035), T4 sim 0.91 |
| 167 | `Krishnanagar II` | `Krishnagar-Ii` Block (3036), T4 sim 0.91 |
| 213 | `Bally Jagachha` | `Bally-Jagacha` Block (2909), T4 sim 0.96 |
| 223 | `Howrah MC` | `Howrah` District (313), T3 token prefix (official name is the shorter) |
| 237 | `Chinsurah Mogra` | `Chinsurah-Magrah` Block (2891), T4 sim 0.90 |
| 244 | `Sreerampur Uttarpara` | `Sirampur-Uttarpara` Block (2903), T4 sim 0.89 |
| 247 | `Ilambazar` | `Illambazar` Block (2829), T4 sim 0.95 |
| 269 | `Bhagawangola-II` | `Bhagawangola-I` Block (3005), T3 numeral differs; `Bhagabangola-Ii` Block (3004), T4 sim 0.92 |
| 280 | `Jiaganj` | `Murshidabad-Jiagunj` Block (3016), T4 sim 0.86 |
| 291 | `Madarihat-Birpara` | `Madarihat` Block (2926), T3 token prefix (official name is the shorter) |
| 302 | `Mekhliganj` | `Mekliganj` Block (2853), T4 sim 0.95 |
| 311 | `Jorebunglow-Sukhiapokharii` | `Jore Bunglow-Sukiapokhri` Block (2860), T4 sim 0.94 |
| 316 | `Khoribari` | `Kharibari` Block (2863), T4 sim 0.89 |
| 319 | `Jalpaiguri Sadar` | `Jalpaiguri` Block (2923), T3 token prefix (official name is the shorter); `Jalpaiguri` District (314), T3 token prefix (official name is the shorter) |
| 340 | `Kushmundi` | `Kushmandi` Block (2876), T4 sim 0.89 |
| 344 | `Hilli` | `Hili` Block (2874), T4 sim 0.89 |
| 351 | `Manickchak` | `Manikchak` Block (2943), T4 sim 0.95 |
| 353 | `Bamangola` | `Bamongola` Block (2932), T4 sim 0.89 |

Two things about this list. First, a T4 score is a similarity between two spellings and says nothing about whether the two names refer to the same place. Second, in the rows where more than one weak candidate exists (21, 65, 104, 108, 269, 319), the candidates are alternatives for the reviewer, not a ranking. Rows 21 and 269 show the numeral problem: the official list has `Contai-I` and `Contai-Iii` but no `Contai-II`, and has `Bhagawangola-I` (3005) and `Bhagabangola-Ii` (3004) as two different spellings of one stem.

### 7.5 Ambiguous duplicate place names

- **`Sankrail`** (rows 54 and 217). The block report itself carries two blocks with this exact name: 2913 under Howrah and 3000 under Jhargram. Both rows retain both. The name is therefore ambiguous inside the official source, not only in the workbook.
- **`Joypur`** (rows 110 and 127). No exact name. One weak candidate (`Jaypur`, 2782). `Jaipur` (3050) is a near name. Five village rows are named `Joypur` (echo only).
- **`Jhargram`** (row 53). Two exact candidates of different unit types: block **2988** `Jhargram` (district Jhargram) and district **703** `Jhargram`. Flag `N-TYPE`. Which is meant is a reviewer decision. Row 278 `Khargram` is a separate near-neighbour spelling with its own exact candidate (3014).
- **`Jalpaiguri Sadar`** (row 319). Two weak candidates of different types: block 2923 `Jalpaiguri` and district 314 `Jalpaiguri`, both by leading words. The word `Sadar` (rows 29 and 319) is not explained in the workbook or the reports.
- **`Kulti`** (row 65; see 7.2), **`Raipur`** (row 104), **`Bishnupur`** (row 108). `Raipur` has a weak candidate `Raipur-I` (2788, numeral missing) and a T4 `Jaipur` (3050, 0.83). `Bishnupur` has `Bishnupur-I` and `Bishnupur-Ii` (2749, 2750, South 24 Parganas, numeral missing, also the exact candidates of rows 179 and 180) and `Vishnupur` (2795, Bankura, T4 0.89).
- **Same-territory pairs** `Faridpur Durgapur` (row 58) and `Durgapur Municipal Corporation` (row 69). Not assumed to be the same unit or different ones. `Galsi-W` (row 67) and `Galsi II` (row 75) are related names under two territories. The relation is unknown. `Jhargram` (row 53) and `Howrah MC` (row 223) share a word with their own territory label.

### 7.6 Phase 0B leftover and unclear rows

Phase 0B's 24 unmatched rows were 12 urban-looking, 6 leftover pairings and 6 unclear. DQ-15 itemised the 12 urban rows, one leftover (`Medinipur Sadar`, row 29) and two unclear (`Galsi-W`, `Jharkhand-W`). It did **not** itemise the other **5 leftover pairings or the other 4 unclear rows**, so those 9 rows are still **not individually identifiable** from the earlier reports.

The present run does not need them to be identified, because every row now carries its own result. It does give a statewide, unconstrained picture: 57 rows have no exact-name candidate (14 with no candidate at all, 43 with only weaker ones), and all 12 urban-looking rows are among them. That set of 57 is **not** a reconciliation of the earlier 24: the source, date and constraint differ (section 6). A reviewer must not assume that the 9 unitemised rows are among any particular subset.

### 7.7 Exceptions earlier reports did not list (identified in Phase 0E)

Found by reading the 358 labels and comparing them with each other. Workbook text only. No official data and no join to any district name were used to identify them. Official-list evidence for the same rows is in section 9.

| Flag | Finding | Rows |
| --- | --- | --- |
| `E-STEM` | `Bishnupur` is listed un-numbered under BANKURA (108) and as `Bishnupur I` and `Bishnupur II` under South 24 PGS (179, 180). The stem is shared by different labels in two territories. DQ-15 listed only exact-label repeats. | 108, 179, 180 |
| `E-STEM` | `Ausgram I` (70, EAST BURDWAN) shares its stem with the SH-2 pair. EAST BURDWAN lists `Ausgram I` and `Ausgram II`. WEST BURDWAN lists only `Ausgram-II`. | 70 (with 66, 71) |
| `E-ECHO` | Sixteen labels contain a place name that also appears in their own territory label, in the same spelling or an alternative one (`Medinipur` in a label under WEST MIDNAPORE, `Cooch Behar` under `Coochbehar`; other alternative spellings were not sought). DQ-15 listed only `Jhargram` and `Howrah MC`. The rest are `Medinipur Sadar` (WEST MIDNAPORE), `Burdwan I` and `II` (EAST BURDWAN), `Bankura I` and `II` (BANKURA), `Purulia-I` and `II` (PURULIA), `Alipurduar-I` and `II` (Alipurduar), `Cooch Behar - I` and `II` (Coochbehar), `Darjeeling – Pulbazar` (Darjeeling), `Jalpaiguri Sadar` (Jalpaiguri), `Old Malda` (Malda). A naive match could pick a district-level unit instead of a block. The word `Sadar` appears in rows 29 and 319. Its meaning in the workbook is not stated. | 29, 53, 73, 74, 92, 93, 117, 118, 223, 292, 293, 297, 298, 309, 319, 352 |
| `E-COMP` | Four labels join two names with a dash: `Madarihat-Birpara`, `Darjeeling – Pulbazar`, `Rangli – Rangliot`, `Jorebunglow-Sukhiapokharii`. They may match one official unit or several. Keep all candidates. | 291, 309, 310, 311 |
| `E-NEAR` | Near-neighbour spellings inside the workbook (difflib ratio 0.84 or more on the label stem, numerals removed). A fuzzy match could cross between them, so exact tiers must run first. They may be different places. Nothing is implied about which. | see below |

| Stem pair | Ratio | Rows |
| --- | ---: | --- |
| `Kaliaganj` and `Kaliganj` | 0.941 | 330 and 161 |
| `Raiganj` and `Raniganj` | 0.933 | 332 and 62 |
| `Burdwan` and `Burwan` | 0.923 | 73, 74 and 272 |
| `Rajnagar` and `Ramnagar` | 0.875 | 259 and 25, 26 |
| `Nabagram` and `Nayagram` | 0.875 | 281 and 52 |
| `Jhargram` and `Khargram` | 0.875 | 53 and 278 |
| `Raiganj` and `Rajganj` | 0.857 | 332 and 322 |
| `Bundwan` and `Burdwan` | 0.857 | 120 and 73, 74 |
| `Manbazar` and `Mandirbazar` | 0.842 | 121, 122 and 196 |

The four `Borough` labels are also close to one another by edit distance. That is the numeral only and is not listed.

**Official-list check of the near-neighbour pairs.** In this run both sides of each of the nine `E-NEAR` stem pairs above have their own exact-name candidate, and the candidates are different official blocks (for example `Kaliaganj` 2884 and `Kaliganj` 3031; `Raiganj` 2886, `Raniganj` 2825 and `Rajganj` 2931). Those near-neighbour spellings are therefore separate official names, not spelling variants of one block. This does not say which workbook row belongs to which territory.

### 7.8 Every other row

301 rows have an exact-name candidate (T1 or T2); 298 of them have exactly one. They probably include rows that Phase 0B reported as exact matches against the 2023 mirror (it did not itemise them), but this run does not rely on that. They are **not approved**. An exact-name candidate is a name-based suggestion: the unit type is only "Block" (or "District") as the report titles it, the report states no effective date, and whether the intended territory membership equals that official block is for the reviewer to decide. A clean-looking name is a reason to expect an easy review. It is not evidence of a correct match.

### 7.9 Reverse direction: official units that no workbook row resolves to

Each official block was checked against all 358 rows' retained candidates. **8 of 345 blocks are no row's candidate at any tier.** Each is "not listed in the workbook". Its allocation state is **Data Missing / Unknown**, never unallocated and never vacant.

| Official block | District (code) | Village rows | Note |
| --- | --- | ---: | --- |
| 2839 `Nanoor` | Birbhum (307) | 138 | Row 258 `Nanur` has no candidate; `Nanoor` is its nearest name at 0.73, below the candidate rules. |
| 2859 `Gorubathan` | Kalimpong (702) | 38 | No workbook label reads `Kalimpong`; none of the four Kalimpong block names appears as a label. |
| 2861 `Kalimpong-I` | Kalimpong (702) | 51 | Same. |
| 2862 `Lava` | Kalimpong (702) | 28 | Same. |
| 7355 `Pedong` | Kalimpong (702) | 11 | Same. |
| 2993 `Midnapore` | Paschim Medinipur (318) | 271 | Row 29 `Medinipur Sadar` has no candidate. No similarity test in this run links the two. *Lead only (Inference, general knowledge, not source-supported):* `Medinipur` and `Midnapore` can be two spellings of one place name. A reviewer may want to compare row 29 with 2993. |
| 2803 `Galsi -I` | Purba Bardhaman (306) | 88 | The workbook has `Galsi II` (row 75, candidate 2804) and `Galsi-W` (row 67, no candidate) but no `Galsi I`. See 7.3. |
| 2952 `Deshapran` | Purba Medinipur (317) | 169 | Row 21 `Contai-II` has no exact name; the official list has `Contai-I` (2950) and `Contai-Iii` (2951) but no `Contai-II`. *Lead only (Inference, general knowledge, not source-supported):* `Deshapran` may be the block otherwise numbered `Contai-II`. Neither report says so. Check with the workbook owner or the LGD portal. |

Further observations:

- **40 more official blocks** are candidates only at weaker tiers (T3 or T4). They appear in the table in 7.4 and carry `N-WEAK` in section 9. They are not "not listed in the workbook", but their link to the workbook rests on a spelling or numeral difference.
- **6 official blocks** are an exact-name candidate for two workbook rows: 2797, 2896, 2897, 2898, 2913 and 3000 (the repeated listings of 7.1).
- **Kolkata.** The district list has Kolkata (315). The block report has no block under it, and no workbook label reads `Kolkata`. Whatever units the workbook would need for Kolkata would come from urban body or ward lists, which were not supplied. Whether Kolkata and Kalimpong are in scope is B-20 (requester preference: all of West Bengal; not formal approval).
- The reverse check covers blocks and districts only. Sub-district, urban body and ward units cannot be checked in either direction.

## 8. Sales-territory labels (context only)

The 21 labels, verbatim, with their contiguous row ranges. They are **not** joined to any official district name, code or polygon.

| Label as written | Rows | Count |
| --- | --- | ---: |
| EAST MIDNAPORE | 2 to 26 | 25 |
| WEST MIDNAPORE | 27 to 49 | 23 |
| JHARGRAM | 50 to 55 | 6 |
| WEST BURDWAN | 56 to 69 | 14 |
| EAST BURDWAN | 70 to 91 | 22 |
| BANKURA | 92 to 113 | 22 |
| PURULIA | 114 to 133 | 20 |
| North 24 PGS | 134 to 156 | 23 |
| Nadia | 157 to 174 | 18 |
| South 24 PGS | 175 to 208 | 34 |
| Howrah | 209 to 226 | 18 |
| Hooghly | 227 to 245 | 19 |
| Birbhum | 246 to 264 | 19 |
| Murshidabad | 265 to 290 | 26 |
| Alipurduar | 291 to 296 | 6 |
| Coochbehar | 297 to 308 | 12 |
| Darjeeling | 309 to 318 | 10 |
| Jalpaiguri | 319 to 327 | 9 |
| UDP | 328 to 336 | 9 |
| DDP | 337 to 344 | 8 |
| Malda | 345 to 359 | 15 |

No label reads `Kalimpong` or `Kolkata`. That describes labels only. It does not show that those areas are unrepresented, unstaffed or unallocated. The official block report lists 4 blocks under Kalimpong (702) and none under Kolkata (315); none of the 4 Kalimpong blocks is any row's candidate (7.9). Until a reviewed crosswalk exists their allocation state is **Data Missing / Unknown** (DQ-03). Which units in the urban body and ward lists no row resolves to cannot be determined, because those lists were not supplied.

## 9. Row-level candidate register

One row per workbook data row, 358 in all, grouped by sales territory in workbook order. Columns: the original Excel row number; the sales-territory label (context only); the block or area label, verbatim; the five candidate fields; the status and flags (section 5); and the reviewer fields, blank by design.

Column key: **Cand.** = candidate official unit name(s); **Code** = official code (Block Code or District Code); **Type** = unit type as the source report titles it (`Block` or `District`); **Parent** = parent chain as the report records it; **Evidence** = matching evidence.

How to read a row:

- When a row has several candidates, every candidate field lists them in the same order, numbered `1.`, `2.` and so on. Official names are in code spans, verbatim, including odd spacing such as `Galsi -I`.
- **Evidence** begins with the tier of each candidate (`T1` exact; `T2` spacing or punctuation only; `T3` weaker structural match; `T4` spelling variant with its similarity; see 4.5). It may then carry: other rows that retain the same unit; near names that were not retained; nearest names below the candidate rules; and a village-name echo. Those last three are information only.
- `NONE` in the candidate fields means no candidate at any tier in the two reports. It does not mean the unit does not exist.
- **Status and flags** reads: status (with the underlying result in brackets for `MANUAL` rows); the best tier; the earlier flags; then the `N-` flags.
- A label is shown inside a code span so that its characters are visible. En dashes are preserved. At row 343 the label ends with a space and a non-breaking space (U+00A0) in the source; both are preserved inside the code span.
- **The three reviewer columns are blank on every row, by design.** A candidate becomes a crosswalk entry only when a named reviewer enters a decision (B-26).

### EAST MIDNAPORE (rows 2 to 26, 25 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | EAST MIDNAPORE | `Nandakumar` | `Nandakumar` | 2961 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 3 | EAST MIDNAPORE | `Moyna` | `Moyna` | 2960 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 4 | EAST MIDNAPORE | `Tamluk` | `Tamluk` | 2971 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 5 | EAST MIDNAPORE | `Shahid Matangini` | `Shahid Matangini` | 2969 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 6 | EAST MIDNAPORE | `Panskura–I` | `Panskura-I` | 2964 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact<br>near, not retained: `Bankura-I` Block (2774) 0.80 | CAND-1; best T1; T-ED; N-NEAR |  |  |  |
| 7 | EAST MIDNAPORE | `Kolaghat` | `Kolaghat` | 2958 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 8 | EAST MIDNAPORE | `Chandipur` | `Chandipur` | 2949 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 9 | EAST MIDNAPORE | `Mahisadal` | `Mahishadal` | 2959 | Block | Purba Medinipur (317) > West Bengal (19) | T4 spelling variant (sim 0.95)<br>nearest other names below the candidate rules, not candidates: `Matiali` Block (2928) 0.62 | CAND-1; best T4; SV; N-WEAK |  |  |  |
| 10 | EAST MIDNAPORE | `Nandigram–I` | `Nandigram-I` | 2962 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 11 | EAST MIDNAPORE | `Nandigram–II` | `Nandigram-Ii` | 2963 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 12 | EAST MIDNAPORE | `Sutahata` | `Sutahata` | 2970 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 13 | EAST MIDNAPORE | `Haldia` | `Haldia` | 2955 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact<br>near, not retained: `Haldibari` Block (2850) 0.80 | CAND-1; best T1; N-NEAR |  |  |  |
| 14 | EAST MIDNAPORE | `Bhagawanpur–I` | `Bhagawanpur-I` | 2947 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 15 | EAST MIDNAPORE | `Bhagawanpur–II` | `Bhagawanpur-Ii` | 2948 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 16 | EAST MIDNAPORE | `Egra–I` | `Egra-I` | 2953 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 17 | EAST MIDNAPORE | `Egra–II` | `Egra-Ii` | 2954 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 18 | EAST MIDNAPORE | `Patashpur–I` | `Patashpur-I` | 2965 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 19 | EAST MIDNAPORE | `Patashpur–II` | `Patashpur-Ii` | 2966 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 20 | EAST MIDNAPORE | `Contai-I` | `Contai-I` | 2950 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 21 | EAST MIDNAPORE | `Contai-II` | 1. `Contai-I`<br>2. `Contai-Iii` | 1. 2950<br>2. 2951 | 1. Block<br>2. Block | 1. Purba Medinipur (317) > West Bengal (19)<br>2. Purba Medinipur (317) > West Bengal (19) | 1. T3 numeral differs (workbook II, official I)<br>2. T3 numeral differs (workbook II, official III)<br>`Contai-I` (2950) is also a candidate for row 20 (T1)<br>`Contai-Iii` (2951) is also a candidate for row 22 (T1)<br>nearest other names below the candidate rules, not candidates: `Onda` Block (2786) 0.60 | CAND-N; best T3; N-WEAK; N-NUM; N-SHR |  |  |  |
| 22 | EAST MIDNAPORE | `Contai-III` | `Contai-Iii` | 2951 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 23 | EAST MIDNAPORE | `Khejuri–I` | `Khejuri-I` | 2956 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 24 | EAST MIDNAPORE | `Khejuri–II` | `Khejuri-Ii` | 2957 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 25 | EAST MIDNAPORE | `Ramnagar–I` | `Ramnagar-I` | 2967 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact<br>near, not retained: `Raninagar-I` Block (3021) 0.82 | CAND-1; best T1; E-NEAR (row 259); T-ED; N-NEAR |  |  |  |
| 26 | EAST MIDNAPORE | `Ramnagar–II` | `Ramnagar-Ii` | 2968 | Block | Purba Medinipur (317) > West Bengal (19) | T1 exact<br>near, not retained: `Raninagar-Ii` Block (3022) 0.82 | CAND-1; best T1; E-NEAR (row 259); T-ED; N-NEAR |  |  |  |

### WEST MIDNAPORE (rows 27 to 49, 23 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 27 | WEST MIDNAPORE | `Salboni` | `Salbani` | 2999 | Block | Paschim Medinipur (318) > West Bengal (19) | T4 spelling variant (sim 0.86)<br>nearest other names below the candidate rules, not candidates: `Sabang` Block (2998) 0.61<br>village-name echo (not a candidate): 1 village row share the name, e.g. 338755 `Salboni` in block 2999 `Salbani` | CAND-1; best T4; N-WEAK; N-ECHO |  |  |  |
| 28 | WEST MIDNAPORE | `Keshpur` | `Keshpur` | 2990 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact<br>near, not retained: `Kashipur` Block (3053) 0.80 | CAND-1; best T1; N-NEAR |  |  |  |
| 29 | WEST MIDNAPORE | `Medinipur Sadar` | NONE | NONE | NONE | NONE | No candidate at any tier<br>nearest names below the candidate rules, not candidates: `Purba Medinipur` District (317) 0.78 first word; `Paschim Medinipur` District (318) 0.72 first word; `Indpur` Block (2780) 0.67 first word | MANUAL (NONE); best NONE; UC; E-ECHO |  |  |  |
| 30 | WEST MIDNAPORE | `Garhbeta-I` | `Garbeta-I` | 2981 | Block | Paschim Medinipur (318) > West Bengal (19) | T4 spelling variant (sim 0.93)<br>nearest other names below the candidate rules, not candidates: `Gaighata` Block (2734) 0.62; `Arsha` Block (3044) 0.61 | CAND-1; best T4; SV; N-WEAK |  |  |  |
| 31 | WEST MIDNAPORE | `Garhbeta-II` | `Garbeta-Ii` | 2982 | Block | Paschim Medinipur (318) > West Bengal (19) | T4 spelling variant (sim 0.93)<br>nearest other names below the candidate rules, not candidates: `Gaighata` Block (2734) 0.62; `Arsha` Block (3044) 0.61 | CAND-1; best T4; SV; N-WEAK |  |  |  |
| 32 | WEST MIDNAPORE | `Garhbeta-III` | `Garbeta-Iii` | 2983 | Block | Paschim Medinipur (318) > West Bengal (19) | T4 spelling variant (sim 0.93)<br>nearest other names below the candidate rules, not candidates: `Gaighata` Block (2734) 0.62; `Arsha` Block (3044) 0.61 | CAND-1; best T4; SV; N-WEAK |  |  |  |
| 33 | WEST MIDNAPORE | `Debra` | `Debra` | 2980 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 34 | WEST MIDNAPORE | `Pingla` | `Pingla` | 2997 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 35 | WEST MIDNAPORE | `Keshiari` | `Keshiary` | 2989 | Block | Paschim Medinipur (318) > West Bengal (19) | T4 spelling variant (sim 0.88)<br>nearest other names below the candidate rules, not candidates: `Keshpur` Block (2990) 0.67; `Nakashipara` Block (3038) 0.63; `Kashipur` Block (3053) 0.62<br>village-name echo (not a candidate): 1 village row share the name, e.g. 343570 `Keshiari` in block 2989 `Keshiary` | CAND-1; best T4; N-WEAK; N-ECHO |  |  |  |
| 36 | WEST MIDNAPORE | `Dantan-I` | `Dantan-I` | 2976 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 37 | WEST MIDNAPORE | `Dantan-II` | `Dantan-Ii` | 2977 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 38 | WEST MIDNAPORE | `Narayangarh` | `Narayangarh` | 2995 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 39 | WEST MIDNAPORE | `Mohanpur` | `Mohanpur` | 2994 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 40 | WEST MIDNAPORE | `Sabang` | `Sabang` | 2998 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 41 | WEST MIDNAPORE | `Kharagpur-I` | `Kharagpur-I` | 2991 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 42 | WEST MIDNAPORE | `Kharagpur-II` | `Kharagpur-Ii` | 2992 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 43 | WEST MIDNAPORE | `Ghatal` | `Ghatal` | 2984 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 44 | WEST MIDNAPORE | `Chandrakona-I` | `Chandrakona-I` | 2974 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 45 | WEST MIDNAPORE | `Chandrakona-II` | `Chandrakona-Ii` | 2975 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 46 | WEST MIDNAPORE | `Daspur-I` | `Daspur-I` | 2978 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 47 | WEST MIDNAPORE | `Daspur-II` | `Daspur-Ii` | 2979 | Block | Paschim Medinipur (318) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 48 | WEST MIDNAPORE | `Binpur-I` | `Binpur-I` | 2972 | Block | Jhargram (703) > West Bengal (19) | T1 exact<br>near, not retained: `Bishnupur-I` Block (2749) 0.80 | MANUAL (CAND-1); best T1; XD; N-NEAR |  |  |  |
| 49 | WEST MIDNAPORE | `Binpur-II` | `Binpur-Ii` | 2973 | Block | Jhargram (703) > West Bengal (19) | T1 exact<br>near, not retained: `Bishnupur-Ii` Block (2750) 0.80 | MANUAL (CAND-1); best T1; XD; N-NEAR |  |  |  |

### JHARGRAM (rows 50 to 55, 6 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 50 | JHARGRAM | `Gopiballavpur-I` | `Gopiballavpur-I` | 2986 | Block | Jhargram (703) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 51 | JHARGRAM | `Gopiballavpur-II` | `Gopiballav Pur -Ii` | 2985 | Block | Jhargram (703) > West Bengal (19) | T2 spacing/punctuation only | CAND-1; best T2 |  |  |  |
| 52 | JHARGRAM | `Nayagram` | `Nayagram` | 2996 | Block | Jhargram (703) > West Bengal (19) | T1 exact<br>near, not retained: `Nabagram` Block (3017) 0.88 | CAND-1; best T1; E-NEAR (row 281); N-NEAR |  |  |  |
| 53 | JHARGRAM | `Jhargram` | 1. `Jhargram`<br>2. `Jhargram` | 1. 2988<br>2. 703 | 1. Block<br>2. District | 1. Jhargram (703) > West Bengal (19)<br>2. West Bengal (19) | 1. T1 exact<br>2. T1 exact<br>near, not retained: `Khargram` Block (3014) 0.88 | MANUAL (CAND-N); best T1; AN; E-ECHO; E-NEAR (row 278); N-TYPE; N-NEAR |  |  |  |
| 54 | JHARGRAM | `Sankrail` | 1. `Sankrail`<br>2. `Sankrail` | 1. 2913<br>2. 3000 | 1. Block<br>2. Block | 1. Howrah (313) > West Bengal (19)<br>2. Jhargram (703) > West Bengal (19) | 1. T1 exact<br>2. T1 exact<br>`Sankrail` (2913) is also a candidate for row 217 (T1)<br>`Sankrail` (3000) is also a candidate for row 217 (T1) | MANUAL (CAND-N); best T1; SH-1 (with row 217); AN; N-DUPNAME; N-SHR |  |  |  |
| 55 | JHARGRAM | `Jamboni` | `Jambani` | 2987 | Block | Jhargram (703) > West Bengal (19) | T4 spelling variant (sim 0.86) | CAND-1; best T4; N-WEAK |  |  |  |

### WEST BURDWAN (rows 56 to 69, 14 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 56 | WEST BURDWAN | `Andal` | `Ondal` | 2819 | Block | Paschim Bardhaman (704) > West Bengal (19) | T4 spelling variant (sim 0.80)<br>nearest other names below the candidate rules, not candidates: `Pandua` Block (2899) 0.73; `Onda` Block (2786) 0.67; `Chanditala-I` Block (2889) 0.67 | CAND-1; best T4; N-WEAK |  |  |  |
| 57 | WEST BURDWAN | `Barabani` | `Barabani` | 2798 | Block | Paschim Bardhaman (704) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 58 | WEST BURDWAN | `Faridpur Durgapur` | `Faridpur - Durgapur` | 2802 | Block | Paschim Bardhaman (704) > West Bengal (19) | T2 spacing/punctuation only | MANUAL (CAND-1); best T2; AN |  |  |  |
| 59 | WEST BURDWAN | `Jamuria` | `Jamuria` | 2806 | Block | Paschim Bardhaman (704) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 60 | WEST BURDWAN | `Kanksa` | `Kanksa` | 2809 | Block | Paschim Bardhaman (704) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 61 | WEST BURDWAN | `Pandabeswar` | `Pandabeswar` | 2820 | Block | Paschim Bardhaman (704) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 62 | WEST BURDWAN | `Raniganj` | `Raniganj` | 2825 | Block | Paschim Bardhaman (704) > West Bengal (19) | T1 exact<br>near, not retained: `Raiganj` Block (2886) 0.93; `Rajganj` Block (2931) 0.80 | CAND-1; best T1; E-NEAR (row 332); N-NEAR |  |  |  |
| 63 | WEST BURDWAN | `Salanpur` | `Salanpur` | 2826 | Block | Paschim Bardhaman (704) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 64 | WEST BURDWAN | `Asansol` | NONE | NONE | NONE | NONE | No candidate at any tier<br>no official name within the information floor (sim 0.60) | MANUAL (NONE); best NONE; MU-N; N-ULB |  |  |  |
| 65 | WEST BURDWAN | `Kulti` | 1. `Kultali`<br>2. `Kulpi` | 1. 2763<br>2. 2762 | 1. Block<br>2. Block | 1. South 24 Parganas (304) > West Bengal (19)<br>2. South 24 Parganas (304) > West Bengal (19) | 1. T4 spelling variant (sim 0.83)<br>2. T4 spelling variant (sim 0.80)<br>`Kultali` (2763) is also a candidate for row 193 (T1)<br>`Kulpi` (2762) is also a candidate for row 192 (T1)<br>nearest other names below the candidate rules, not candidates: `Suti-I` Block (3025) 0.67; `Suti-Ii` Block (3026) 0.67<br>village-name echo (not a candidate): 2 village rows share the name, e.g. 323693 `Kulti` in block 2737 `Haroa`; 320547 `Kulti` in block 2807 `Kalna II` | MANUAL (CAND-N); best T4; MU-N; N-WEAK; N-SHR; N-ULB; N-ECHO |  |  |  |
| 66 | WEST BURDWAN | `Ausgram-II` | `Ausgram-Ii` | 2797 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact<br>`Ausgram-Ii` (2797) is also a candidate for row 71 (T1) | MANUAL (CAND-1); best T1; SH-2 (with row 71); N-SHR |  |  |  |
| 67 | WEST BURDWAN | `Galsi-W` | NONE | NONE | NONE | NONE | No candidate at any tier<br>nearest names below the candidate rules, not candidates: `Galsi -I` Block (2803) 1.00 first word; `Galsi-Ii` Block (2804) 1.00 first word | MANUAL (NONE); best NONE; UC; AN |  |  |  |
| 68 | WEST BURDWAN | `Jharkhand-W` | NONE | NONE | NONE | NONE | No candidate at any tier<br>no official name within the information floor (sim 0.60) | MANUAL (NONE); best NONE; UC |  |  |  |
| 69 | WEST BURDWAN | `Durgapur Municipal Corporation` | NONE | NONE | NONE | NONE | No candidate at any tier<br>nearest names below the candidate rules, not candidates: `Dubrajpur` Block (2828) 0.82 first word; `Raipur-I` Block (2788) 0.71 first word; `Daspur-I` Block (2978) 0.71 first word | MANUAL (NONE); best NONE; MU-M; AN; N-ULB |  |  |  |

### EAST BURDWAN (rows 70 to 91, 22 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 70 | EAST BURDWAN | `Ausgram I` | `Ausgram-I` | 2796 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | MANUAL (CAND-1); best T1; E-STEM (with rows 66, 71) |  |  |  |
| 71 | EAST BURDWAN | `Ausgram II` | `Ausgram-Ii` | 2797 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact<br>`Ausgram-Ii` (2797) is also a candidate for row 66 (T1) | MANUAL (CAND-1); best T1; SH-2 (with row 66); N-SHR |  |  |  |
| 72 | EAST BURDWAN | `Bhatar` | `Bhatar` | 2799 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 73 | EAST BURDWAN | `Burdwan I` | `Burdwan-I` | 2800 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1; E-ECHO; E-NEAR (rows 120, 272) |  |  |  |
| 74 | EAST BURDWAN | `Burdwan II` | `Burdwan-Ii` | 2801 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1; E-ECHO; E-NEAR (rows 120, 272) |  |  |  |
| 75 | EAST BURDWAN | `Galsi II` | `Galsi-Ii` | 2804 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | MANUAL (CAND-1); best T1; AN |  |  |  |
| 76 | EAST BURDWAN | `Jamalpur` | `Jamal Pur` | 2805 | Block | Purba Bardhaman (306) > West Bengal (19) | T2 spacing/punctuation only | CAND-1; best T2 |  |  |  |
| 77 | EAST BURDWAN | `Kalna I` | `Kalna-I` | 2808 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 78 | EAST BURDWAN | `Kalna II` | `Kalna II` | 2807 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 79 | EAST BURDWAN | `Katwa I` | `Katwa-I` | 2810 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 80 | EAST BURDWAN | `Katwa II` | `Katwa-Ii` | 2811 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 81 | EAST BURDWAN | `Ketugram I` | `Ketugram_I` | 2813 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 82 | EAST BURDWAN | `Ketugram II` | `Ketugram-Ii` | 2812 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 83 | EAST BURDWAN | `Khandaghosh` | `Khandaghosh` | 2814 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 84 | EAST BURDWAN | `Manteswar` | `Manteswar` | 2816 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 85 | EAST BURDWAN | `Memari I` | `Memari-1` | 2817 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 86 | EAST BURDWAN | `Memari II` | `Memari-Ii` | 2818 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 87 | EAST BURDWAN | `Mongalkote` | `Mangolkote` | 2815 | Block | Purba Bardhaman (306) > West Bengal (19) | T4 spelling variant (sim 0.80) | CAND-1; best T4; N-WEAK |  |  |  |
| 88 | EAST BURDWAN | `Purbasthali I` | `Purbasthali-I` | 2821 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 89 | EAST BURDWAN | `Purbasthali II` | `Purbasthali-Ii` | 2822 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 90 | EAST BURDWAN | `Raina I` | `Raina-I` | 2823 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 91 | EAST BURDWAN | `Raina II` | `Raina-Ii` | 2824 | Block | Purba Bardhaman (306) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |

### BANKURA (rows 92 to 113, 22 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 92 | BANKURA | `Bankura I` | `Bankura-I` | 2774 | Block | Bankura (305) > West Bengal (19) | T1 exact<br>near, not retained: `Panskura-I` Block (2964) 0.80 | CAND-1; best T1; E-ECHO; N-NEAR |  |  |  |
| 93 | BANKURA | `Bankura II` | `Bankura-Ii` | 2775 | Block | Bankura (305) > West Bengal (19) | T1 exact | CAND-1; best T1; E-ECHO |  |  |  |
| 94 | BANKURA | `Barjora` | `Barjora` | 2776 | Block | Bankura (305) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 95 | BANKURA | `Chhatna` | `Chhatna` | 2777 | Block | Bankura (305) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 96 | BANKURA | `Gangajalghati` | `Gangajal Ghati` | 2778 | Block | Bankura (305) > West Bengal (19) | T2 spacing/punctuation only | CAND-1; best T2 |  |  |  |
| 97 | BANKURA | `Mejia` | `Mejhia` | 2785 | Block | Bankura (305) > West Bengal (19) | T4 spelling variant (sim 0.91) | CAND-1; best T4; N-WEAK |  |  |  |
| 98 | BANKURA | `Onda` | `Onda` | 2786 | Block | Bankura (305) > West Bengal (19) | T1 exact<br>near, not retained: `Ondal` Block (2819) 0.89 | CAND-1; best T1; N-NEAR |  |  |  |
| 99 | BANKURA | `Saltora` | `Saltora` | 2790 | Block | Bankura (305) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 100 | BANKURA | `Khatra` | `Khatra-I` | 2783 | Block | Bankura (305) > West Bengal (19) | T3 numeral differs (workbook none, official I)<br>nearest other names below the candidate rules, not candidates: `Habra-I` Block (2735) 0.73; `Habra-Ii` Block (2736) 0.73; `Haroa` Block (2737) 0.73<br>village-name echo (not a candidate): 2 village rows share the name, e.g. 329104 `Khatra (Ct)` in block 2783 `Khatra-I`; 323730 `Khatra` in block 2737 `Haroa` | CAND-1; best T3; N-WEAK; N-NUM; N-ECHO |  |  |  |
| 101 | BANKURA | `Indpur` | `Indpur` | 2780 | Block | Bankura (305) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 102 | BANKURA | `Hirbandh` | `Hirbandh` | 2779 | Block | Bankura (305) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 103 | BANKURA | `Ranibandh` | `Ranibundh` | 2789 | Block | Bankura (305) > West Bengal (19) | T4 spelling variant (sim 0.89)<br>nearest other names below the candidate rules, not candidates: `Hirbandh` Block (2779) 0.71; `Raniganj` Block (2825) 0.71; `Raiganj` Block (2886) 0.62<br>village-name echo (not a candidate): 3 village rows share the name, e.g. 329300 `Rani Bandh` in block 2789 `Ranibundh`; 327539 `Rani Bandh` in block 2793 `Sonamukhi` | CAND-1; best T4; N-WEAK; N-ECHO |  |  |  |
| 104 | BANKURA | `Raipur` | 1. `Raipur-I`<br>2. `Jaipur` | 1. 2788<br>2. 3050 | 1. Block<br>2. Block | 1. Bankura (305) > West Bengal (19)<br>2. Purulia (321) > West Bengal (19) | 1. T3 numeral differs (workbook none, official I)<br>2. T4 spelling variant (sim 0.83)<br>nearest other names below the candidate rules, not candidates: `Habibpur` Block (2937) 0.71; `Karimpur-1` Block (3032) 0.71; `Karimpur-Ii` Block (3033) 0.71<br>village-name echo (not a candidate): 12 village rows share the name, e.g. 317829 `Raipur` in block 2827 `Bolpur-Sriniketan`; 317079 `Raipur` in block 2844 `Suri-I` | CAND-N; best T3; N-WEAK; N-NUM; N-ECHO |  |  |  |
| 105 | BANKURA | `Sarenga` | `Sarenga` | 2791 | Block | Bankura (305) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 106 | BANKURA | `Simlapal` | `Simlapal` | 2792 | Block | Bankura (305) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 107 | BANKURA | `Taldangra` | `Taldangra` | 2794 | Block | Bankura (305) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 108 | BANKURA | `Bishnupur` | 1. `Bishnupur-I`<br>2. `Bishnupur-Ii`<br>3. `Vishnupur` | 1. 2749<br>2. 2750<br>3. 2795 | 1. Block<br>2. Block<br>3. Block | 1. South 24 Parganas (304) > West Bengal (19)<br>2. South 24 Parganas (304) > West Bengal (19)<br>3. Bankura (305) > West Bengal (19) | 1. T3 numeral differs (workbook none, official I)<br>2. T3 numeral differs (workbook none, official II)<br>3. T4 spelling variant (sim 0.89)<br>`Bishnupur-I` (2749) is also a candidate for row 179 (T1)<br>`Bishnupur-Ii` (2750) is also a candidate for row 180 (T1)<br>nearest other names below the candidate rules, not candidates: `Indpur` Block (2780) 0.67; `Keshpur` Block (2990) 0.62; `Bhagawanpur-I` Block (2947) 0.60<br>village-name echo (not a candidate): 34 village rows share the name, e.g. 316834 `Bishnupur` in block 2834 `Mohammad Bazar`; 316504 `Bishnupur (Ct)` in block 2842 `Rampurhat-Ii` | MANUAL (CAND-N); best T3; E-STEM (with rows 179, 180); N-WEAK; N-NUM; N-SHR; N-ECHO |  |  |  |
| 109 | BANKURA | `Indas` | `Indus` | 2781 | Block | Bankura (305) > West Bengal (19) | T4 spelling variant (sim 0.80)<br>nearest other names below the candidate rules, not candidates: `Onda` Block (2786) 0.67; `Nawda` Block (3018) 0.60; `Ondal` Block (2819) 0.60<br>village-name echo (not a candidate): 1 village row share the name, e.g. 317498 `Indas` in block 2831 `Labpur` | CAND-1; best T4; N-WEAK; N-ECHO |  |  |  |
| 110 | BANKURA | `Joypur` | `Jaypur` | 2782 | Block | Bankura (305) > West Bengal (19) | T4 spelling variant (sim 0.83)<br>`Jaypur` (2782) is also a candidate for row 127 (T4)<br>nearest other names below the candidate rules, not candidates: `Jaipur` Block (3050) 0.67<br>village-name echo (not a candidate): 5 village rows share the name, e.g. 310492 `Joypur` in block 2876 `Kushmandi`; 325058 `Joypur` in block 2891 `Chinsurah-Magrah` | MANUAL (CAND-1); best T4; SH-3 (with row 127); AN; N-WEAK; N-SHR; N-ECHO |  |  |  |
| 111 | BANKURA | `Patrasayer` | `Patrasayer` | 2787 | Block | Bankura (305) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 112 | BANKURA | `Kotulpur` | `Kotulpur` | 2784 | Block | Bankura (305) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 113 | BANKURA | `Sonamukhi` | `Sonamukhi` | 2793 | Block | Bankura (305) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |

### PURULIA (rows 114 to 133, 20 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 114 | PURULIA | `Arsha` | `Arsha` | 3044 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 115 | PURULIA | `Balarampur` | `Balarampur` | 3046 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 116 | PURULIA | `Hura` | `Hura` | 3049 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 117 | PURULIA | `Purulia-I` | `Purulia-I` | 3059 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1; E-ECHO |  |  |  |
| 118 | PURULIA | `Purulia-II` | `Purulia-Ii` | 3060 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1; E-ECHO |  |  |  |
| 119 | PURULIA | `Barabazar` | `Barabazar` | 3047 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 120 | PURULIA | `Bundwan` | `Bundwan` | 3048 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1; E-NEAR (rows 73, 74) |  |  |  |
| 121 | PURULIA | `Manbazar-I` | `Manbazar-I` | 3054 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1; E-NEAR (row 196) |  |  |  |
| 122 | PURULIA | `Manbazar-II` | `Manbazar-Ii` | 3055 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1; E-NEAR (row 196) |  |  |  |
| 123 | PURULIA | `Puncha` | `Puncha` | 3058 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 124 | PURULIA | `Baghmundi` | `Bagmundi` | 3045 | Block | Purulia (321) > West Bengal (19) | T4 spelling variant (sim 0.94)<br>village-name echo (not a candidate): 1 village row share the name, e.g. 331614 `Baghmundi` in block 3045 `Bagmundi` | CAND-1; best T4; N-WEAK; N-ECHO |  |  |  |
| 125 | PURULIA | `Jhalda-I` | `Jhalda-I` | 3051 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 126 | PURULIA | `Jhalda-II` | `Jhalda-Ii` | 3052 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 127 | PURULIA | `Joypur` | `Jaypur` | 2782 | Block | Bankura (305) > West Bengal (19) | T4 spelling variant (sim 0.83)<br>`Jaypur` (2782) is also a candidate for row 110 (T4)<br>nearest other names below the candidate rules, not candidates: `Jaipur` Block (3050) 0.67<br>village-name echo (not a candidate): 5 village rows share the name, e.g. 310492 `Joypur` in block 2876 `Kushmandi`; 325058 `Joypur` in block 2891 `Chinsurah-Magrah` | MANUAL (CAND-1); best T4; SH-3 (with row 110); AN; N-WEAK; N-SHR; N-ECHO |  |  |  |
| 128 | PURULIA | `Kashipur` | `Kashipur` | 3053 | Block | Purulia (321) > West Bengal (19) | T1 exact<br>near, not retained: `Keshpur` Block (2990) 0.80 | CAND-1; best T1; N-NEAR |  |  |  |
| 129 | PURULIA | `Neturia` | `Neturia` | 3056 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 130 | PURULIA | `Para` | `Para` | 3057 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 131 | PURULIA | `Raghunathpur-I` | `Raghunath Pur-I` | 3061 | Block | Purulia (321) > West Bengal (19) | T2 spacing/punctuation only | CAND-1; best T2 |  |  |  |
| 132 | PURULIA | `Raghunathpur-II` | `Raghunathpur-Ii` | 3062 | Block | Purulia (321) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 133 | PURULIA | `Santuri` | `Santuri` | 3063 | Block | Purulia (321) > West Bengal (19) | T1 exact<br>near, not retained: `Santipur` Block (3041) 0.80 | CAND-1; best T1; N-NEAR |  |  |  |

### North 24 PGS (rows 134 to 156, 23 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 134 | North 24 PGS | `Amdanga` | `Amdanga` | 2723 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 135 | North 24 PGS | `Baduria` | `Baduria` | 2724 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 136 | North 24 PGS | `Bagdah` | `Bagda` | 2725 | Block | North 24 Parganas (303) > West Bengal (19) | T4 spelling variant (sim 0.91)<br>nearest other names below the candidate rules, not candidates: `Balagarh` Block (2888) 0.71; `Bagnan-I` Block (2907) 0.67; `Bagnan-Ii` Block (2908) 0.67 | CAND-1; best T4; N-WEAK |  |  |  |
| 137 | North 24 PGS | `Bangaon` | `Bongaon` | 2732 | Block | North 24 Parganas (303) > West Bengal (19) | T4 spelling variant (sim 0.86)<br>nearest other names below the candidate rules, not candidates: `Bagnan-I` Block (2907) 0.77; `Bagnan-Ii` Block (2908) 0.77; `Bhangar-I` Block (2747) 0.71<br>village-name echo (not a candidate): 3 village rows share the name, e.g. 326500 `Bangaon` in block 2777 `Chhatna`; 317104 `Bangaon` in block 2844 `Suri-I` | CAND-1; best T4; N-WEAK; N-ECHO |  |  |  |
| 138 | North 24 PGS | `Barasat I` | `Barasat-I` | 2726 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 139 | North 24 PGS | `Barasat II` | `Barasat-Ii` | 2727 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 140 | North 24 PGS | `Barrackpore I` | `Barrackpur-I` | 2728 | Block | North 24 Parganas (303) > West Bengal (19) | T4 spelling variant (sim 0.86) | CAND-1; best T4; N-WEAK |  |  |  |
| 141 | North 24 PGS | `Barrackpore II` | `Barrackpur-Ii` | 2729 | Block | North 24 Parganas (303) > West Bengal (19) | T4 spelling variant (sim 0.86) | CAND-1; best T4; N-WEAK |  |  |  |
| 142 | North 24 PGS | `Basirhat I` | `Basirhat-I` | 2730 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 143 | North 24 PGS | `Basirhat II` | `Basirhat-Ii` | 2731 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 144 | North 24 PGS | `Deganga` | `Deganga` | 2733 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 145 | North 24 PGS | `Gaighata` | `Gaighata` | 2734 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 146 | North 24 PGS | `Habra I` | `Habra-I` | 2735 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 147 | North 24 PGS | `Habra II` | `Habra-Ii` | 2736 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 148 | North 24 PGS | `Haroa` | `Haroa` | 2737 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 149 | North 24 PGS | `Hasnabad` | `Hasnabad` | 2738 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 150 | North 24 PGS | `Hingalganj` | `Hingalganj` | 2739 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 151 | North 24 PGS | `Minakhan` | `Minakhan` | 2740 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 152 | North 24 PGS | `Rajarhat` | `Rajarhat` | 2741 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 153 | North 24 PGS | `Sandeshkhali I` | `Sandeshkhali-I` | 2742 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 154 | North 24 PGS | `Sandeshkhali II` | `Sandeshkhali-Ii` | 2743 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 155 | North 24 PGS | `Swarupnagar` | `Swarupnagar` | 2744 | Block | North 24 Parganas (303) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 156 | North 24 PGS | `Bidhannagar Municipality` | NONE | NONE | NONE | NONE | No candidate at any tier<br>nearest names below the candidate rules, not candidates: `Bhangar-I` Block (2747) 0.78 first word; `Bhangar-Ii` Block (2748) 0.78 first word; `Raninagar-I` Block (3021) 0.70 first word | MANUAL (NONE); best NONE; MU-M; N-ULB |  |  |  |

### Nadia (rows 157 to 174, 18 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 157 | Nadia | `Chakdaha` | `Chakdah` | 3027 | Block | Nadia (320) > West Bengal (19) | T4 spelling variant (sim 0.93)<br>nearest other names below the candidate rules, not candidates: `Chanditala-I` Block (2889) 0.67; `Chanditala-Ii` Block (2890) 0.67; `Chanchal-I` Block (2933) 0.62<br>village-name echo (not a candidate): 8 village rows share the name, e.g. 328241 `Chakdaha` in block 2795 `Vishnupur`; 317056 `Chakdaha` in block 2844 `Suri-I` | CAND-1; best T4; N-WEAK; N-ECHO |  |  |  |
| 158 | Nadia | `Chapra` | `Chapra` | 3028 | Block | Nadia (320) > West Bengal (19) | T1 exact<br>near, not retained: `Chopra` Block (2878) 0.83 | CAND-1; best T1; N-NEAR |  |  |  |
| 159 | Nadia | `Hanskhali` | `Hanskhali` | 3029 | Block | Nadia (320) > West Bengal (19) | T1 exact<br>near, not retained: `Dhaniakhali` Block (2892) 0.80 | CAND-1; best T1; N-NEAR |  |  |  |
| 160 | Nadia | `Haringhata` | `Haringhata` | 3030 | Block | Nadia (320) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 161 | Nadia | `Kaliganj` | `Kaliganj` | 3031 | Block | Nadia (320) > West Bengal (19) | T1 exact<br>near, not retained: `Kaliaganj` Block (2884) 0.94; `Mekliganj` Block (2853) 0.82; `Raiganj` Block (2886) 0.80 | CAND-1; best T1; E-NEAR (row 330); N-NEAR |  |  |  |
| 162 | Nadia | `Kalyani` | `Kalyani` | 7115 | Block | Nadia (320) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 163 | Nadia | `Karimpur I` | `Karimpur-1` | 3032 | Block | Nadia (320) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 164 | Nadia | `Karimpur II` | `Karimpur-Ii` | 3033 | Block | Nadia (320) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 165 | Nadia | `Krishnaganj` | `Krishnaganj` | 3034 | Block | Nadia (320) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 166 | Nadia | `Krishnanagar I` | `Krishnagar-I` | 3035 | Block | Nadia (320) > West Bengal (19) | T4 spelling variant (sim 0.91)<br>nearest other names below the candidate rules, not candidates: `Krishnaganj` Block (3034) 0.78; `Rajnagar` Block (2840) 0.70; `Ramnagar-I` Block (2967) 0.70 | CAND-1; best T4; SV; N-WEAK |  |  |  |
| 167 | Nadia | `Krishnanagar II` | `Krishnagar-Ii` | 3036 | Block | Nadia (320) > West Bengal (19) | T4 spelling variant (sim 0.91)<br>nearest other names below the candidate rules, not candidates: `Krishnaganj` Block (3034) 0.78; `Rajnagar` Block (2840) 0.70; `Ramnagar-I` Block (2967) 0.70 | CAND-1; best T4; SV; N-WEAK |  |  |  |
| 168 | Nadia | `Nabadwip` | `Nabadwip` | 3037 | Block | Nadia (320) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 169 | Nadia | `Nakashipara` | `Nakashipara` | 3038 | Block | Nadia (320) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 170 | Nadia | `Ranaghat I` | `Ranaghat-I` | 3039 | Block | Nadia (320) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 171 | Nadia | `Ranaghat II` | `Ranaghat-Ii` | 3040 | Block | Nadia (320) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 172 | Nadia | `Santipur` | `Santipur` | 3041 | Block | Nadia (320) > West Bengal (19) | T1 exact<br>near, not retained: `Santuri` Block (3063) 0.80 | CAND-1; best T1; N-NEAR |  |  |  |
| 173 | Nadia | `Tehatta I` | `Tehatta-I` | 3042 | Block | Nadia (320) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 174 | Nadia | `Tehatta II` | `Tehatta-Ii` | 3043 | Block | Nadia (320) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |

### South 24 PGS (rows 175 to 208, 34 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 175 | South 24 PGS | `Baruipur` | `Baruipur` | 2745 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 176 | South 24 PGS | `Basanti` | `Basanti` | 2746 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 177 | South 24 PGS | `Bhangar I` | `Bhangar-I` | 2747 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 178 | South 24 PGS | `Bhangar II` | `Bhangar-Ii` | 2748 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 179 | South 24 PGS | `Bishnupur I` | `Bishnupur-I` | 2749 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact<br>near, not retained: `Binpur-I` Block (2972) 0.80 | MANUAL (CAND-1); best T1; E-STEM (with rows 108, 180); N-NEAR |  |  |  |
| 180 | South 24 PGS | `Bishnupur II` | `Bishnupur-Ii` | 2750 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact<br>near, not retained: `Binpur-Ii` Block (2973) 0.80 | MANUAL (CAND-1); best T1; E-STEM (with rows 108, 179); N-NEAR |  |  |  |
| 181 | South 24 PGS | `Budge Budge I` | `Budge Budge-I` | 2751 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 182 | South 24 PGS | `Budge Budge II` | `Budge Budge-Ii` | 2752 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 183 | South 24 PGS | `Canning I` | `Canning-I` | 2753 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 184 | South 24 PGS | `Canning II` | `Canning-Ii` | 2754 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 185 | South 24 PGS | `Diamond Harbour I` | `Diamond Harbour-I` | 2755 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 186 | South 24 PGS | `Diamond Harbour II` | `Diamond Harbour-Ii` | 2756 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 187 | South 24 PGS | `Falta` | `Falta` | 2757 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 188 | South 24 PGS | `Gosaba` | `Gosaba` | 2758 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 189 | South 24 PGS | `Jaynagar I` | `Jaynagar-I` | 2759 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 190 | South 24 PGS | `Jaynagar II` | `Jaynagar-Ii` | 2760 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 191 | South 24 PGS | `Kakdwip` | `Kak Dwip` | 2761 | Block | South 24 Parganas (304) > West Bengal (19) | T2 spacing/punctuation only | CAND-1; best T2 |  |  |  |
| 192 | South 24 PGS | `Kulpi` | `Kulpi` | 2762 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 193 | South 24 PGS | `Kultali` | `Kultali` | 2763 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 194 | South 24 PGS | `Magrahat I` | `Magra Hat-I` | 2764 | Block | South 24 Parganas (304) > West Bengal (19) | T2 spacing/punctuation only | CAND-1; best T2 |  |  |  |
| 195 | South 24 PGS | `Magrahat II` | `Magra Hat-Ii` | 2765 | Block | South 24 Parganas (304) > West Bengal (19) | T2 spacing/punctuation only | CAND-1; best T2 |  |  |  |
| 196 | South 24 PGS | `Mandirbazar` | `Mandirbazar` | 2766 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1; E-NEAR (rows 121, 122) |  |  |  |
| 197 | South 24 PGS | `Mathurapur I` | `Mathurapur I` | 2767 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 198 | South 24 PGS | `Mathurapur II` | `Mathurapur-Ii` | 2768 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 199 | South 24 PGS | `Namkhana` | `Namkhana` | 2769 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 200 | South 24 PGS | `Pathar Pratima` | `Pathar Pratima` | 2770 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 201 | South 24 PGS | `Sagar` | `Sagar` | 2771 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 202 | South 24 PGS | `Sonarpur` | `Sonarpur` | 2772 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 203 | South 24 PGS | `Thakurpukur Mahestola` | `Thakurpukur Mahestola` | 2773 | Block | South 24 Parganas (304) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 204 | South 24 PGS | `Borough 10` | NONE | NONE | NONE | NONE | No candidate at any tier<br>no official name within the information floor (sim 0.60) | MANUAL (NONE); best NONE; MU-B; N-ULB |  |  |  |
| 205 | South 24 PGS | `Borough 11` | NONE | NONE | NONE | NONE | No candidate at any tier<br>no official name within the information floor (sim 0.60) | MANUAL (NONE); best NONE; MU-B; N-ULB |  |  |  |
| 206 | South 24 PGS | `Borough 7` | NONE | NONE | NONE | NONE | No candidate at any tier<br>no official name within the information floor (sim 0.60) | MANUAL (NONE); best NONE; MU-B; N-ULB |  |  |  |
| 207 | South 24 PGS | `BOROUGH 12` | NONE | NONE | NONE | NONE | No candidate at any tier<br>no official name within the information floor (sim 0.60) | MANUAL (NONE); best NONE; MU-B; N-ULB |  |  |  |
| 208 | South 24 PGS | `Behala municipality` | NONE | NONE | NONE | NONE | No candidate at any tier<br>nearest names below the candidate rules, not candidates: `Bhatar` Block (2799) 0.67 first word; `Haldia` Block (2955) 0.67 first word; `Jhalda-I` Block (3051) 0.67 first word | MANUAL (NONE); best NONE; MU-M; N-ULB |  |  |  |

### Howrah (rows 209 to 226, 18 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 209 | Howrah | `Amta I` | `Amta-I` | 2905 | Block | Howrah (313) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 210 | Howrah | `Amta II` | `Amta-Ii` | 2906 | Block | Howrah (313) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 211 | Howrah | `Bagnan I` | `Bagnan-I` | 2907 | Block | Howrah (313) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 212 | Howrah | `Bagnan II` | `Bagnan-Ii` | 2908 | Block | Howrah (313) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 213 | Howrah | `Bally Jagachha` | `Bally-Jagacha` | 2909 | Block | Howrah (313) > West Bengal (19) | T4 spelling variant (sim 0.96)<br>nearest other names below the candidate rules, not candidates: `Balagarh` Block (2888) 0.67 | CAND-1; best T4; N-WEAK |  |  |  |
| 214 | Howrah | `Domjur` | `Domjur` | 2910 | Block | Howrah (313) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 215 | Howrah | `Jagatballavpur` | `Jagatballavpur` | 2911 | Block | Howrah (313) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 216 | Howrah | `Panchla` | `Panchla` | 2912 | Block | Howrah (313) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 217 | Howrah | `Sankrail` | 1. `Sankrail`<br>2. `Sankrail` | 1. 2913<br>2. 3000 | 1. Block<br>2. Block | 1. Howrah (313) > West Bengal (19)<br>2. Jhargram (703) > West Bengal (19) | 1. T1 exact<br>2. T1 exact<br>`Sankrail` (2913) is also a candidate for row 54 (T1)<br>`Sankrail` (3000) is also a candidate for row 54 (T1) | MANUAL (CAND-N); best T1; SH-1 (with row 54); AN; N-DUPNAME; N-SHR |  |  |  |
| 218 | Howrah | `Shyampur I` | `Shyampur-I` | 2914 | Block | Howrah (313) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 219 | Howrah | `Shyampur II` | `Shyampur-Ii` | 2915 | Block | Howrah (313) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 220 | Howrah | `Udaynarayanpur` | `Udaynarayanpur` | 2916 | Block | Howrah (313) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 221 | Howrah | `Uluberia I` | `Uluberia-I` | 2917 | Block | Howrah (313) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 222 | Howrah | `Uluberia II` | `Uluberia-Ii` | 2918 | Block | Howrah (313) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 223 | Howrah | `Howrah MC` | `Howrah` | 313 | District | West Bengal (19) | T3 token prefix (official name is the shorter) (sim 0.86)<br>nearest other names below the candidate rules, not candidates: `Chopra` Block (2878) 0.67 first word; `Hura` Block (3049) 0.60 first word | MANUAL (CAND-1); best T3; MU-M; AN; E-ECHO; N-WEAK; N-ULB |  |  |  |
| 224 | Howrah | `Jangipara` | `Jangipara` | 2896 | Block | Hooghly (312) > West Bengal (19) | T1 exact<br>`Jangipara` (2896) is also a candidate for row 243 (T1) | MANUAL (CAND-1); best T1; SH-4 (with row 243); N-SHR |  |  |  |
| 225 | Howrah | `Khanakul-I` | `Khanakul-I` | 2897 | Block | Hooghly (312) > West Bengal (19) | T1 exact<br>`Khanakul-I` (2897) is also a candidate for row 230 (T1) | MANUAL (CAND-1); best T1; SH-5 (with row 230); N-SHR |  |  |  |
| 226 | Howrah | `Khanakul-II` | `Khanakul-Ii` | 2898 | Block | Hooghly (312) > West Bengal (19) | T1 exact<br>`Khanakul-Ii` (2898) is also a candidate for row 231 (T1) | MANUAL (CAND-1); best T1; SH-6 (with row 231); N-SHR |  |  |  |

### Hooghly (rows 227 to 245, 19 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 227 | Hooghly | `Arambagh` | `Arambagh` | 2887 | Block | Hooghly (312) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 228 | Hooghly | `Goghat I` | `Goghat-I` | 2893 | Block | Hooghly (312) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 229 | Hooghly | `Goghat II` | `Goghat-Ii` | 2894 | Block | Hooghly (312) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 230 | Hooghly | `Khanakul I` | `Khanakul-I` | 2897 | Block | Hooghly (312) > West Bengal (19) | T1 exact<br>`Khanakul-I` (2897) is also a candidate for row 225 (T1) | MANUAL (CAND-1); best T1; SH-5 (with row 225); N-SHR |  |  |  |
| 231 | Hooghly | `Khanakul II` | `Khanakul-Ii` | 2898 | Block | Hooghly (312) > West Bengal (19) | T1 exact<br>`Khanakul-Ii` (2898) is also a candidate for row 226 (T1) | MANUAL (CAND-1); best T1; SH-6 (with row 226); N-SHR |  |  |  |
| 232 | Hooghly | `Pursurah` | `Pursurah` | 2901 | Block | Hooghly (312) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 233 | Hooghly | `Haripal` | `Haripal` | 2895 | Block | Hooghly (312) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 234 | Hooghly | `Singur` | `Singur` | 2902 | Block | Hooghly (312) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 235 | Hooghly | `Tarakeswar` | `Tarakeswar` | 2904 | Block | Hooghly (312) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 236 | Hooghly | `Balagarh` | `Balagarh` | 2888 | Block | Hooghly (312) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 237 | Hooghly | `Chinsurah Mogra` | `Chinsurah-Magrah` | 2891 | Block | Hooghly (312) > West Bengal (19) | T4 spelling variant (sim 0.90)<br>nearest other names below the candidate rules, not candidates: `Hura` Block (3049) 0.61 first word | CAND-1; best T4; N-WEAK |  |  |  |
| 238 | Hooghly | `Dhaniakhali` | `Dhaniakhali` | 2892 | Block | Hooghly (312) > West Bengal (19) | T1 exact<br>near, not retained: `Hanskhali` Block (3029) 0.80 | CAND-1; best T1; N-NEAR |  |  |  |
| 239 | Hooghly | `Pandua` | `Pandua` | 2899 | Block | Hooghly (312) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 240 | Hooghly | `Polba Dadpur` | `Polba-Dadpur` | 2900 | Block | Hooghly (312) > West Bengal (19) | T2 spacing/punctuation only | CAND-1; best T2 |  |  |  |
| 241 | Hooghly | `Chanditala I` | `Chanditala-I` | 2889 | Block | Hooghly (312) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 242 | Hooghly | `Chanditala II` | `Chanditala-Ii` | 2890 | Block | Hooghly (312) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 243 | Hooghly | `Jangipara` | `Jangipara` | 2896 | Block | Hooghly (312) > West Bengal (19) | T1 exact<br>`Jangipara` (2896) is also a candidate for row 224 (T1) | MANUAL (CAND-1); best T1; SH-4 (with row 224); N-SHR |  |  |  |
| 244 | Hooghly | `Sreerampur Uttarpara` | `Sirampur-Uttarpara` | 2903 | Block | Hooghly (312) > West Bengal (19) | T4 spelling variant (sim 0.89)<br>nearest other names below the candidate rules, not candidates: `Harirampur` Block (2873) 0.70 first word; `Shyampur-I` Block (2914) 0.67 first word; `Shyampur-Ii` Block (2915) 0.67 first word | CAND-1; best T4; N-WEAK |  |  |  |
| 245 | Hooghly | `Chandanagar` | NONE | NONE | NONE | NONE | No candidate at any tier<br>nearest names below the candidate rules, not candidates: `Chandrakona-I` Block (2974) 0.73; `Chandrakona-Ii` Block (2975) 0.73; `Raninagar-I` Block (3021) 0.70<br>village-name echo (not a candidate): 1 village row share the name, e.g. 315264 `Chandanagar` in block 3013 `Kandi` | MANUAL (NONE); best NONE; MU-N; SV; N-ULB; N-ECHO |  |  |  |

### Birbhum (rows 246 to 264, 19 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 246 | Birbhum | `Bolpur Sriniketan` | `Bolpur-Sriniketan` | 2827 | Block | Birbhum (307) > West Bengal (19) | T2 spacing/punctuation only | CAND-1; best T2 |  |  |  |
| 247 | Birbhum | `Ilambazar` | `Illambazar` | 2829 | Block | Birbhum (307) > West Bengal (19) | T4 spelling variant (sim 0.95)<br>nearest other names below the candidate rules, not candidates: `Manbazar-I` Block (3054) 0.71; `Manbazar-Ii` Block (3055) 0.71; `Barabazar` Block (3047) 0.67<br>village-name echo (not a candidate): 2 village rows share the name, e.g. 326009 `Ilam Bazar` in block 2790 `Saltora`; 318067 `Ilambazar (Ct)` in block 2829 `Illambazar` | CAND-1; best T4; N-WEAK; N-ECHO |  |  |  |
| 248 | Birbhum | `Dubrajpur` | `Dubrajpur` | 2828 | Block | Birbhum (307) > West Bengal (19) | T1 exact<br>near, not retained: `Faridpur - Durgapur` Block (2802) 0.82 | CAND-1; best T1; N-NEAR |  |  |  |
| 249 | Birbhum | `Khoyrasol` | `Khoyrasol` | 2830 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 250 | Birbhum | `Mayureswar I` | `Mayureswar-I` | 2832 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 251 | Birbhum | `Mayureswar II` | `Mayureswar-Ii` | 2833 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 252 | Birbhum | `Labpur` | `Labpur` | 2831 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 253 | Birbhum | `Mohammad Bazar` | `Mohammad Bazar` | 2834 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 254 | Birbhum | `Murarai I` | `Murarai-I` | 2835 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 255 | Birbhum | `Murarai II` | `Murarai-Ii` | 2836 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 256 | Birbhum | `Nalhati I` | `Nalhati-I` | 2837 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 257 | Birbhum | `Nalhati II` | `Nalhati-Ii` | 2838 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 258 | Birbhum | `Nanur` | NONE | NONE | NONE | NONE | No candidate at any tier<br>nearest names below the candidate rules, not candidates: `Nanoor` Block (2839) 0.73; `Bankura` District (305) 0.67; `Bankura-I` Block (2774) 0.67 | NONE; best NONE |  |  |  |
| 259 | Birbhum | `Rajnagar` | `Rajnagar` | 2840 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1; E-NEAR (rows 25, 26) |  |  |  |
| 260 | Birbhum | `Rampurhat I` | `Rampurhat-I` | 2841 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 261 | Birbhum | `Rampurhat II` | `Rampurhat-Ii` | 2842 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 262 | Birbhum | `Sainthia` | `Sainthia` | 2843 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 263 | Birbhum | `Suri I` | `Suri-I` | 2844 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 264 | Birbhum | `Suri II` | `Suri-Ii` | 2845 | Block | Birbhum (307) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |

### Murshidabad (rows 265 to 290, 26 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 265 | Murshidabad | `Beldanga-I` | `Beldanga-I` | 3001 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 266 | Murshidabad | `Beldanga-II` | `Beldanga-Ii` | 3002 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 267 | Murshidabad | `Berhampore` | `Berhampore` | 3003 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 268 | Murshidabad | `Bhagawangola-I` | `Bhagawangola-I` | 3005 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 269 | Murshidabad | `Bhagawangola-II` | 1. `Bhagawangola-I`<br>2. `Bhagabangola-Ii` | 1. 3005<br>2. 3004 | 1. Block<br>2. Block | 1. Murshidabad (319) > West Bengal (19)<br>2. Murshidabad (319) > West Bengal (19) | 1. T3 numeral differs (workbook II, official I)<br>2. T4 spelling variant (sim 0.92)<br>`Bhagawangola-I` (3005) is also a candidate for row 268 (T1)<br>nearest other names below the candidate rules, not candidates: `Bhagawanpur-I` Block (2947) 0.70; `Bhagawanpur-Ii` Block (2948) 0.70; `Bamongola` Block (2932) 0.67 | CAND-N; best T3; N-WEAK; N-NUM; N-SHR |  |  |  |
| 270 | Murshidabad | `Bharatpur-I` | `Bharatpur-I` | 3006 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 271 | Murshidabad | `Bharatpur-II` | `Bharatpur-Ii` | 3007 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 272 | Murshidabad | `Burwan` | `Burwan` | 3008 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1; E-NEAR (rows 73, 74) |  |  |  |
| 273 | Murshidabad | `Domkal` | `Domkal` | 3009 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 274 | Murshidabad | `Farakka` | `Farakka` | 3010 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 275 | Murshidabad | `Hariharpara` | `Hariharpara` | 3011 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 276 | Murshidabad | `Jalangi` | `Jalangi` | 3012 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 277 | Murshidabad | `Kandi` | `Kandi` | 3013 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 278 | Murshidabad | `Khargram` | `Khargram` | 3014 | Block | Murshidabad (319) > West Bengal (19) | T1 exact<br>near, not retained: `Jhargram` Block (2988) 0.88; `Jhargram` District (703) 0.88; `Kumargram` Block (2925) 0.82 | CAND-1; best T1; E-NEAR (row 53); N-NEAR |  |  |  |
| 279 | Murshidabad | `Lalgola` | `Lalgola` | 3015 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 280 | Murshidabad | `Jiaganj` | `Murshidabad-Jiagunj` | 3016 | Block | Murshidabad (319) > West Bengal (19) | T4 spelling variant of one word of the official name (sim 0.86)<br>nearest other names below the candidate rules, not candidates: `Kaliaganj` Block (2884) 0.75; `Rajganj` Block (2931) 0.71; `Raiganj` Block (2886) 0.71 | CAND-1; best T4; N-WEAK |  |  |  |
| 281 | Murshidabad | `Nabagram` | `Nabagram` | 3017 | Block | Murshidabad (319) > West Bengal (19) | T1 exact<br>near, not retained: `Nayagram` Block (2996) 0.88 | CAND-1; best T1; E-NEAR (row 52); N-NEAR |  |  |  |
| 282 | Murshidabad | `Nawda` | `Nawda` | 3018 | Block | Murshidabad (319) > West Bengal (19) | T1 exact<br>near, not retained: `Nadia` District (320) 0.80 | CAND-1; best T1; N-NEAR |  |  |  |
| 283 | Murshidabad | `Raghunathganj-I` | `Raghunathganj-I` | 3019 | Block | Murshidabad (319) > West Bengal (19) | T1 exact<br>near, not retained: `Raghunath Pur-I` Block (3061) 0.82 | CAND-1; best T1; N-NEAR |  |  |  |
| 284 | Murshidabad | `Raghunathganj-II` | `Raghunathganj-Ii` | 3020 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 285 | Murshidabad | `Raninagar-I` | `Raninagar-I` | 3021 | Block | Murshidabad (319) > West Bengal (19) | T1 exact<br>near, not retained: `Ramnagar-I` Block (2967) 0.82 | CAND-1; best T1; N-NEAR |  |  |  |
| 286 | Murshidabad | `Raninagar-II` | `Raninagar-Ii` | 3022 | Block | Murshidabad (319) > West Bengal (19) | T1 exact<br>near, not retained: `Ramnagar-Ii` Block (2968) 0.82 | CAND-1; best T1; N-NEAR |  |  |  |
| 287 | Murshidabad | `Sagardighi` | `Sagardighi` | 3023 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 288 | Murshidabad | `Shamsherganj` | `Shamsherganj` | 3024 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 289 | Murshidabad | `Suti-I` | `Suti-I` | 3025 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 290 | Murshidabad | `Suti-II` | `Suti-Ii` | 3026 | Block | Murshidabad (319) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |

### Alipurduar (rows 291 to 296, 6 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 291 | Alipurduar | `Madarihat-Birpara` | `Madarihat` | 2926 | Block | Alipurduar (664) > West Bengal (19) | T3 token prefix (official name is the shorter) (sim 0.72)<br>nearest other names below the candidate rules, not candidates: `Hariharpara` Block (3011) 0.74; `Banarhat` Block (7483) 0.71 first word; `Rajarhat` Block (2741) 0.71 first word | MANUAL (CAND-1); best T3; E-COMP; N-WEAK |  |  |  |
| 292 | Alipurduar | `Alipurduar-I` | `Alipurduar-I` | 2919 | Block | Alipurduar (664) > West Bengal (19) | T1 exact | CAND-1; best T1; E-ECHO |  |  |  |
| 293 | Alipurduar | `Alipurduar-II` | `Alipurduar-Ii` | 2920 | Block | Alipurduar (664) > West Bengal (19) | T1 exact | CAND-1; best T1; E-ECHO |  |  |  |
| 294 | Alipurduar | `Falakata` | `Falakata` | 2922 | Block | Alipurduar (664) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 295 | Alipurduar | `Kalchini` | `Kalchini` | 2924 | Block | Alipurduar (664) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 296 | Alipurduar | `Kumargram` | `Kumargram` | 2925 | Block | Alipurduar (664) > West Bengal (19) | T1 exact<br>near, not retained: `Khargram` Block (3014) 0.82 | CAND-1; best T1; N-NEAR |  |  |  |

### Coochbehar (rows 297 to 308, 12 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 297 | Coochbehar | `Cooch Behar - I` | `Coochbehar I` | 2847 | Block | Cooch Behar (308) > West Bengal (19) | T2 spacing/punctuation only | CAND-1; best T2; E-ECHO; T-HS |  |  |  |
| 298 | Coochbehar | `Cooch Behar - II` | `Cooch Behar II` | 2846 | Block | Cooch Behar (308) > West Bengal (19) | T1 exact | CAND-1; best T1; E-ECHO; T-HS |  |  |  |
| 299 | Coochbehar | `Dinhata - I` | `Dinhata-I` | 2848 | Block | Cooch Behar (308) > West Bengal (19) | T1 exact | CAND-1; best T1; T-HS |  |  |  |
| 300 | Coochbehar | `Dinhata - II` | `Dinhata-Ii` | 2849 | Block | Cooch Behar (308) > West Bengal (19) | T1 exact | CAND-1; best T1; T-HS |  |  |  |
| 301 | Coochbehar | `Haldibari` | `Haldibari` | 2850 | Block | Cooch Behar (308) > West Bengal (19) | T1 exact<br>near, not retained: `Haldia` Block (2955) 0.80 | CAND-1; best T1; N-NEAR |  |  |  |
| 302 | Coochbehar | `Mekhliganj` | `Mekliganj` | 2853 | Block | Cooch Behar (308) > West Bengal (19) | T4 spelling variant (sim 0.95)<br>nearest other names below the candidate rules, not candidates: `Kaliganj` Block (3031) 0.78; `Kaliaganj` Block (2884) 0.74; `Mejhia` Block (2785) 0.62<br>village-name echo (not a candidate): 1 village row share the name, e.g. 307683 `Mekhliganj` in block 2850 `Haldibari` | CAND-1; best T4; N-WEAK; N-ECHO |  |  |  |
| 303 | Coochbehar | `Sitai` | `Sitai` | 2854 | Block | Cooch Behar (308) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 304 | Coochbehar | `Sitalkuchi` | `Sitalkuchi` | 2855 | Block | Cooch Behar (308) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 305 | Coochbehar | `Tufanganj - I` | `Tufanganj-I` | 2856 | Block | Cooch Behar (308) > West Bengal (19) | T1 exact | CAND-1; best T1; T-HS |  |  |  |
| 306 | Coochbehar | `Tufanganj - II` | `Tufanganj-Ii` | 2857 | Block | Cooch Behar (308) > West Bengal (19) | T1 exact | CAND-1; best T1; T-HS |  |  |  |
| 307 | Coochbehar | `Mathabhanga - I` | `Mathabhanga-I` | 2852 | Block | Cooch Behar (308) > West Bengal (19) | T1 exact | CAND-1; best T1; T-HS |  |  |  |
| 308 | Coochbehar | `Mathabhanga - II` | `Mathabhanga II` | 2851 | Block | Cooch Behar (308) > West Bengal (19) | T1 exact | CAND-1; best T1; T-HS |  |  |  |

### Darjeeling (rows 309 to 318, 10 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 309 | Darjeeling | `Darjeeling – Pulbazar` | `Darjeeling-Pulbazar` | 2858 | Block | Darjeeling (309) > West Bengal (19) | T1 exact | MANUAL (CAND-1); best T1; E-ECHO; E-COMP; T-ED |  |  |  |
| 310 | Darjeeling | `Rangli – Rangliot` | `Rangli Rangliot` | 2869 | Block | Darjeeling (309) > West Bengal (19) | T2 spacing/punctuation only | MANUAL (CAND-1); best T2; E-COMP; T-ED |  |  |  |
| 311 | Darjeeling | `Jorebunglow-Sukhiapokharii` | `Jore Bunglow-Sukiapokhri` | 2860 | Block | Darjeeling (309) > West Bengal (19) | T4 spelling variant (sim 0.94) | MANUAL (CAND-1); best T4; E-COMP; N-WEAK |  |  |  |
| 312 | Darjeeling | `Kurseong` | `Kurseong` | 2864 | Block | Darjeeling (309) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 313 | Darjeeling | `Mirik` | `Mirik` | 2866 | Block | Darjeeling (309) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 314 | Darjeeling | `Matigara` | `Matigara` | 2865 | Block | Darjeeling (309) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 315 | Darjeeling | `Naxalbari` | `Naxal Bari` | 2867 | Block | Darjeeling (309) > West Bengal (19) | T2 spacing/punctuation only | CAND-1; best T2 |  |  |  |
| 316 | Darjeeling | `Khoribari` | `Kharibari` | 2863 | Block | Darjeeling (309) > West Bengal (19) | T4 spelling variant (sim 0.89)<br>nearest other names below the candidate rules, not candidates: `Haldibari` Block (2850) 0.67 | CAND-1; best T4; N-WEAK |  |  |  |
| 317 | Darjeeling | `Phansidewa` | `Phansidewa` | 2868 | Block | Darjeeling (309) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 318 | Darjeeling | `Siliguri` | NONE | NONE | NONE | NONE | No candidate at any tier<br>nearest names below the candidate rules, not candidates: `Singur` Block (2902) 0.71; `Jalpaiguri` District (314) 0.67; `Suri-I` Block (2844) 0.67 | MANUAL (NONE); best NONE; MU-N; N-ULB |  |  |  |

### Jalpaiguri (rows 319 to 327, 9 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 319 | Jalpaiguri | `Jalpaiguri Sadar` | 1. `Jalpaiguri`<br>2. `Jalpaiguri` | 1. 2923<br>2. 314 | 1. Block<br>2. District | 1. Jalpaiguri (314) > West Bengal (19)<br>2. West Bengal (19) | 1. T3 token prefix (official name is the shorter) (sim 0.80)<br>2. T3 token prefix (official name is the shorter) (sim 0.80)<br>nearest other names below the candidate rules, not candidates: `Jamal Pur` Block (2805) 0.67 first word; `Alipurduar` District (664) 0.64; `Alipurduar-I` Block (2919) 0.64 | CAND-N; best T3; E-ECHO; N-WEAK; N-TYPE |  |  |  |
| 320 | Jalpaiguri | `Dhupguri` | `Dhupguri` | 2921 | Block | Jalpaiguri (314) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 321 | Jalpaiguri | `Maynaguri` | `Maynaguri` | 2929 | Block | Jalpaiguri (314) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 322 | Jalpaiguri | `Rajganj` | `Rajganj` | 2931 | Block | Jalpaiguri (314) > West Bengal (19) | T1 exact<br>near, not retained: `Raiganj` Block (2886) 0.86; `Raniganj` Block (2825) 0.80 | CAND-1; best T1; E-NEAR (row 332); N-NEAR |  |  |  |
| 323 | Jalpaiguri | `Mal` | `Mal` | 2927 | Block | Jalpaiguri (314) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 324 | Jalpaiguri | `Matiali` | `Matiali` | 2928 | Block | Jalpaiguri (314) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 325 | Jalpaiguri | `Nagrakata` | `Nagrakata` | 2930 | Block | Jalpaiguri (314) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 326 | Jalpaiguri | `Kranti` | `Kranti` | 7484 | Block | Jalpaiguri (314) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 327 | Jalpaiguri | `Banarhat` | `Banarhat` | 7483 | Block | Jalpaiguri (314) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |

### UDP (rows 328 to 336, 9 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 328 | UDP | `Karandighi` | `Karandighi` | 2885 | Block | Uttar Dinajpur (311) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 329 | UDP | `Itahar` | `Itahar` | 2883 | Block | Uttar Dinajpur (311) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 330 | UDP | `Kaliaganj` | `Kaliaganj` | 2884 | Block | Uttar Dinajpur (311) > West Bengal (19) | T1 exact<br>near, not retained: `Kaliganj` Block (3031) 0.94 | CAND-1; best T1; E-NEAR (row 161); N-NEAR |  |  |  |
| 331 | UDP | `Hemtabad` | `Hemtabad` | 2881 | Block | Uttar Dinajpur (311) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 332 | UDP | `Raiganj` | `Raiganj` | 2886 | Block | Uttar Dinajpur (311) > West Bengal (19) | T1 exact<br>near, not retained: `Raniganj` Block (2825) 0.93; `Rajganj` Block (2931) 0.86; `Kaliganj` Block (3031) 0.80 | CAND-1; best T1; E-NEAR (rows 62, 322); N-NEAR |  |  |  |
| 333 | UDP | `Goalpokhar - I` | `Goalpokhar-I` | 2880 | Block | Uttar Dinajpur (311) > West Bengal (19) | T1 exact | CAND-1; best T1; T-HS |  |  |  |
| 334 | UDP | `Goalpokhar - II` | `Goalpokhar II` | 2879 | Block | Uttar Dinajpur (311) > West Bengal (19) | T1 exact | CAND-1; best T1; T-HS |  |  |  |
| 335 | UDP | `Islampur` | `Islampur` | 2882 | Block | Uttar Dinajpur (311) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 336 | UDP | `Chopra` | `Chopra` | 2878 | Block | Uttar Dinajpur (311) > West Bengal (19) | T1 exact<br>near, not retained: `Chapra` Block (3028) 0.83 | CAND-1; best T1; N-NEAR |  |  |  |

### DDP (rows 337 to 344, 8 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 337 | DDP | `Tapan` | `Tapan` | 2877 | Block | Dakshin Dinajpur (310) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 338 | DDP | `Balurghat` | `Balurghat` | 2870 | Block | Dakshin Dinajpur (310) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 339 | DDP | `Gangarampur` | `Gangarampur` | 2872 | Block | Dakshin Dinajpur (310) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 340 | DDP | `Kushmundi` | `Kushmandi` | 2876 | Block | Dakshin Dinajpur (310) > West Bengal (19) | T4 spelling variant (sim 0.89)<br>village-name echo (not a candidate): 1 village row share the name, e.g. 310398 `Kushmundi` in block 2876 `Kushmandi` | CAND-1; best T4; N-WEAK; N-ECHO |  |  |  |
| 341 | DDP | `Kumarganj` | `Kumarganj` | 2875 | Block | Dakshin Dinajpur (310) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 342 | DDP | `Bansihari` | `Bansihari` | 2871 | Block | Dakshin Dinajpur (310) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 343 | DDP | `Harirampur  ` | `Harirampur` | 2873 | Block | Dakshin Dinajpur (310) > West Bengal (19) | T1 exact | CAND-1; best T1; T-NB |  |  |  |
| 344 | DDP | `Hilli` | `Hili` | 2874 | Block | Dakshin Dinajpur (310) > West Bengal (19) | T4 spelling variant (sim 0.89)<br>village-name echo (not a candidate): 1 village row share the name, e.g. 311005 `Hilli` in block 2874 `Hili` | CAND-1; best T4; N-WEAK; N-ECHO |  |  |  |

### Malda (rows 345 to 359, 15 rows)

| Row | Sales-territory label | Block or area label (verbatim) | Cand. | Code | Type | Parent | Evidence | Status and flags | Reviewer decision | Reviewer name and role | Review date |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 345 | Malda | `English Bazar` | `English Bazar` | 2935 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 346 | Malda | `Gazole` | `Gazole` | 2936 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 347 | Malda | `Habibpur` | `Habibpur` | 2937 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 348 | Malda | `Kaliachak–I` | `Kaliachak-I` | 2940 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 349 | Malda | `Kaliachak–II` | `Kaliachak-Ii` | 2941 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 350 | Malda | `Kaliachak–III` | `Kaliachak-Iii` | 2942 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1; T-ED |  |  |  |
| 351 | Malda | `Manickchak` | `Manikchak` | 2943 | Block | Malda (316) > West Bengal (19) | T4 spelling variant (sim 0.95)<br>nearest other names below the candidate rules, not candidates: `Kaliachak-I` Block (2940) 0.63; `Kaliachak-Ii` Block (2941) 0.63; `Kaliachak-Iii` Block (2942) 0.63 | CAND-1; best T4; N-WEAK |  |  |  |
| 352 | Malda | `Old Malda` | `Old Malda` | 2944 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1; E-ECHO |  |  |  |
| 353 | Malda | `Bamangola` | `Bamongola` | 2932 | Block | Malda (316) > West Bengal (19) | T4 spelling variant (sim 0.89)<br>nearest other names below the candidate rules, not candidates: `Bhagabangola-Ii` Block (3004) 0.76; `Bhagawangola-I` Block (3005) 0.76; `Amdanga` Block (2723) 0.75 | CAND-1; best T4; N-WEAK |  |  |  |
| 354 | Malda | `Harishchandrapur-I` | `Harishchandrapur-I` | 2938 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 355 | Malda | `Harishchandrapur-II` | `Harishchandrapur-Ii` | 2939 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 356 | Malda | `Chanchal-I` | `Chanchal-I` | 2933 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 357 | Malda | `Chanchal-II` | `Chanchal-Ii` | 2934 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 358 | Malda | `Ratua-I` | `Ratua-I` | 2945 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |
| 359 | Malda | `Ratua-II` | `Ratua-Ii` | 2946 | Block | Malda (316) > West Bengal (19) | T1 exact | CAND-1; best T1 |  |  |  |

## 10. Unresolved questions and remaining blockers

Phase 0E stops here. What remains needs decisions, evidence or further official exports, not further matching.

### 10.1 Geographic

| # | Question | Needs |
| --- | --- | --- |
| 1 | The effective date of the two LGD reports. Not printed in either file; the generated time is not an effective date. | The person who took the exports (any vintage evidence the portal showed), or the Ministry of Panchayati Raj. G-04. |
| 2 | Sub-district, urban local body and ward lists for West Bengal. They were not supplied, so the 12 urban-looking rows cannot be typed or matched and the reverse check is incomplete. | A named person with authority to take those exports by hand. G-09, B-24. |
| 3 | Whether the block report is a complete block list. It is built from covered-village rows, its own title is "All Blocks of West Bengal State", and the README calls it "Development Blocks". Which LGD list holds West Bengal's CD blocks (development blocks, sub-districts or both) is also open. | Ministry of Panchayati Raj ([phase-0d-geographic-source-gate.md](phase-0d-geographic-source-gate.md), section 5, row 1c), or inspection of the further exports. |
| 4 | Unit type of the 12 urban-looking rows, and whether LGD records boroughs at all. | The urban body and ward lists. B-24. |
| 5 | Meaning of `-W` (rows 67, 68), and whether `Jharkhand-W` is outside West Bengal. | The workbook owner. B-24. |
| 6 | For SH-1 to SH-6: shared listing allowed or not, double-counting rule, and for SH-1 which of the two official `Sankrail` blocks (2913, 3000) each row means. | The business (B-23), then the reviewer. |
| 7 | The 57 rows with no exact-name candidate, in particular the 14 with none, and the 8 official blocks that no row resolves to (7.9). Leads exist for rows 21 and 2952, 29 and 2993, 258 and 2839, 67 and 2803. They are leads, not findings. | The reviewer and the workbook owner. |
| 8 | Whether Kolkata and Kalimpong are in scope. The 4 Kalimpong blocks are no row's candidate; Kolkata has no block. | Sponsor. B-20. |
| 9 | Verified block and ward geometry. The two reports contain none. | Not addressed here. Gate 2b is unchanged and still **not met**. |

> **Pointer, added 2026-10-16 (documentation only).** Four further LGD exports (blocks, sub-districts, urban local bodies with wards, village to Gram Panchayat) were audited read-only in [lgd-bundle-audit.md](lgd-bundle-audit.md). The table above is kept as written on 2026-10-15. This pointer changes no count, candidate tier, row status or conclusion in this document, and creates no join and no crosswalk row. A candidate is still not a match.
>
> **Verified in that audit**
>
> - Sub-district, urban local body and ward lists were received (row 2 above), and all six exports are readable. They agree on every shared code and name: the same 345 block codes, the same 41,006 village codes and the same 23 district codes (audit section 4).
> - The independent block list carries the same 345 blocks as the block-with-villages report, so the block count is not an artefact of village rows (row 3). It does not show that 345 is the official West Bengal count.
> - The workbook still has no code column. Name overlap against the new lists is a candidate diagnostic only (audit section 8).
>
> **Unresolved (unchanged by that audit)**
>
> - No file links an urban local body to a district, block or sub-district, so the 12 urban-looking rows (row 4) are still not typed or matched. The received urban export has no borough level, and the urban parent link has no source (audit sections 5.4, 8 and 9.2).
> - Effective date (row 1) and licence (B-18, G-06): neither is established. The manifest for the four new files records no hashes.
> - Ward vintage: that export lists Kolkata 144 and Howrah 66 wards, against 209 and 68 in the earlier notifications. The file does not say which is current (audit section 5.4).
> - Geometry (row 9): none of the six files has polygons or coordinates. Gate 2b is unchanged and still **not met**.
> - Allocation states are unchanged. A unit or ward with no workbook row stays Data Missing / Unknown. Vacant and Unallocated are never inferred from a missing record.

### 10.2 Licensing and access

| # | Question | Needs |
| --- | --- | --- |
| 1 | May a company reproduce LGD codes, names and hierarchy inside a commercial enterprise application, and show them to distributor staff? The Copyright Policy permits free reproduction with acknowledgement and does not mention commercial use. The README says commercial reuse and hosting have not been verified. | Written confirmation, Ministry of Panchayati Raj (Phase 0D section 5, row 1). B-18, G-06. |
| 2 | May the two files be stored, hosted or shared beyond the project, and may this document keep quoting official names and codes? | Same letter, and company legal. |
| 3 | How the files were taken: which LGD page, who, and on what terms. Not recorded. Whether a human-taken, CAPTCHA-gated export by company staff is within the site's terms, and whether any automated access is allowed. | The requester to record it; the same letter for the terms. |
| 4 | Terms of the NAPIX LGD web services, if that route is ever chosen. | Not read. An account would be needed. Not created. |
| 5 | Legal review of every source before any file enters a product build. | Company legal (B-18). |

### 10.3 Business

| # | Question | Needs |
| --- | --- | --- |
| 1 | Who is the named crosswalk reviewer, in what role, and what sign-off do they give? | Project sponsor and data owner (see [phase-0d-stakeholder-approval.md](phase-0d-stakeholder-approval.md)). B-26. |
| 2 | What a sales territory is, who owns the list, whether it has codes, and whether it can hold part of a block. | Workbook owner. B-23, B-05. |
| 3 | Whether shared listings (SH-1 to SH-6) are allowed, and the double-counting rule. | Business. B-23. |
| 4 | Is the workbook the final version, and what is its as-of date? | Workbook owner. B-02. |
| 5 | Are Kolkata and Kalimpong in scope? (Requester preference: all of West Bengal; not formal approval.) | Sponsor. B-20. |
| 6 | What evidence and which role may mark an area as confirmed unallocated? | Business. B-12, B-14, B-28. |

## 11. Verification log

| Check | Result |
| --- | --- |
| Workbook SHA-256 before this run | `85C7F6A02370562D0E38286F592A71014A61A365E68E9CB05DC10EAC22295FE3`. Equals the Phase 0B baseline. |
| Workbook SHA-256 after this run | `85C7F6A02370562D0E38286F592A71014A61A365E68E9CB05DC10EAC22295FE3`. **Unchanged.** Size 32,894 bytes. Hashed immediately before and after the read (same script), and again at the end of the session. |
| LGD files before and after | Districts report `6bfb026b79c85e7c171297c001dacc0f3df61422e28f0442818c222632591ce8` (27,471 bytes); blocks report `e266d8141fbcb2870d757f3cbbb4650e8ace1e553887c9bbb84444eb95fc3a36` (31,756,839 bytes). Both equal the README values, before and after. The README is unchanged (`4e46ee0fc5333805a0bdcc139d55ceb4b5c9b8147792f945379384650343279b`). `data-source/` holds exactly four files: the workbook, the two reports and the README. |
| LGD parse | 23 district rows; 41,006 block-report data rows; **345 distinct Block Codes**; 41,006 distinct village codes; 22 districts in the block report, all present in the districts report with identical names; Kolkata has no block row. Facts recomputed by a script that opened the files read-only. |
| Every workbook row accounted for exactly once | **358 rows.** A script parsed section 9 back out of this file: row numbers are exactly 2 to 359, with no duplicate and no gap, in 21 territory sub-tables that sum to 358. |
| Labels preserved exactly | All 358 territory labels and block labels in section 9 equal the values read afresh from columns A and B of the workbook, including the 18 en dashes and the trailing space and non-breaking space at row 343. They also equal the labels in the previous draft of this register. |
| Candidate codes and parents supported by a cited official source | Every candidate in the register (354 entries on 344 rows: 351 blocks, 3 districts) was compared, for official name, code, unit type, and parent district code and name, with the two LGD reports parsed afresh: **0 differences**. |
| Independent re-derivation | A second, separately written normaliser found **no** official unit with the same simplified name that is missing from a row's candidates, and no exact-tier candidate whose simplified name differs from its label. |
| Counts in section 6 | Every figure that depends on the register (status, tier, flag and candidate counts; official blocks with, without and with only weaker candidates; the six blocks shared by two rows) was recomputed from the register parsed back out of this file. All match. |
| Unmatched and ambiguous records remain unresolved | 14 rows read `NONE`; 9 rows have several candidates; 40 rows are `MANUAL`. No row was resolved, merged, dropped or ranked. Candidates are listed in tier order for readability. That order is not a recommendation. |
| Reviewer fields | Decision, name and role, and date are blank on all 358 rows. |
| Employee identities and pay | Only columns A and B were extracted (section 3). This file holds no staff name, employee code or pay value. Its only non-ASCII characters are the en dash and the non-breaking space copied from source labels. |
| Claims not made | This file does not state that the reports hold boundary polygons, that commercial reuse is permitted, what their effective date is, or how many blocks West Bengal has. |
| Files changed in the project | **Five documents edited, nothing else:** this file, `phase-0d-geographic-source-gate.md` (Gate 2a rows and section 11), `geographic-data-assessment.md` (G-04 and G-09 notes), `data-quality-findings.md` (one update row in DQ-15) and `open-business-decisions.md` (one update note). Compared by SHA-256 against a snapshot of all 41 non-dependency, non-build, non-data files taken before the edits. No application file, dependency, configuration file, map, database table, Supabase or Power BI item was created or changed. |
| Data or boundary files added | None by this run. The LGD files were supplied into `data-source/` (git-ignored). The scripts were run from a scratch folder outside the project and are not kept in it; section 4.5 is the reproducible record of the method. |

Checks to re-run after any change: the hash checks above, the section 6 recount, and the register parse-back.

## Appendix A: Probe log (the earlier, blocked attempt)

All GET requests on 2026-10-15 between 07:14 and 07:15 UTC. SHA-256 is of the bytes received. Hashes are not reproducible because every response embeds a fresh anti-forgery token. Files were saved in a scratch folder outside the project and were not added to it.

| Page | HTTP | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `/downloadDirectory.do` | 200 | 125,845 | `59262ada6e6ebc00c9d6c94593852599647ed05f84ef70e9eca6e0b27f4c4f3a` |
| `/` (home) | 200 | 230,886 | `e356ae99d2c9b6fbfb64dbc4048731433be35c1b620d45776f04cc0bbd868f9f` |
| `/globalviewBlockforcitizen.do` | 200 | 80,940 | `df98729c959e42ab050fdae4fd8a2bca5d8719cc012b6bd79f11af9f8fb34f41` |
| `/globalviewsubdistrictforcitizen.do` | 200 | 81,728 | `46b4c6c5b1329313d8807aa5b9a2104aca74095da5168209d06c3bde2327d84a` |
| `/globalViewLocalBodyForCitizen.do` | 200 | 76,292 | `ca1f33932c058d31761cebea36cea2f4903a6b063c05d2a9dc8587b4affcd771` |
| `/viewWard.do` | 200 | 60,025 | `e429f14ab27be1cf6d7e472e426de445bbfaef47c3bbdddf0a74bbfcfa4960f2` |
| `/globalviewdistrictforcitizen.do` | 200 | 78,074 | `e0f95844902ce13e0bd9105aa5e55baf6be5a2ab216d9d0239e0d8a35fff7439` |
| `/robots.txt` | 404 | not recorded | not recorded |
