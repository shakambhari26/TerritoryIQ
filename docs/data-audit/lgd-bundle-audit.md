# LGD West Bengal bundle audit

**Status: AUDIT ONLY, read-only.** Audit date: 2026-10-16. Nothing in this document imports, matches, approves or publishes anything. The LGD files were not copied, edited or loaded into the app, no map behaviour was touched, and Supabase was not connected. Every count below was measured by [`scripts/audit/lgd-bundle-audit.py`](../../scripts/audit/lgd-bundle-audit.py), which is standard-library Python, writes nothing under `data-source/`, and can be re-run with `python -I scripts/audit/lgd-bundle-audit.py`.

Builds on [geographic-crosswalk-review.md](geographic-crosswalk-review.md) (Phase 0E), [geographic-data-assessment.md](geographic-data-assessment.md) and [proposed-data-model.md](proposed-data-model.md). Where this document says "candidate", it means a name-overlap diagnostic. **A candidate is not a match, and no name-only match is accepted anywhere here** (rule carried over from Gate P0 and Phase 0E).

**Handling note.** Sections 5 to 8 and the appendices quote official LGD names and codes. LGD reuse terms are still unverified (B-18, G-06), so keep this document inside the company, as with the Phase 0E register.

## 1. Summary

| Question | Answer |
| --- | --- |
| What arrived | Four new LGD exports (blocks, sub-districts, urban local bodies with wards, village to Gram Panchayat mapping), generated 16 Oct 2026 11:16 AM, plus the two 15 Oct 2026 exports already audited in Phase 0E. All six are readable and structurally clean. |
| Do they agree with each other? | Yes where they overlap. The new block list and the old block-with-villages report carry **the same 345 block codes with identical names and districts**. The new village mapping carries **the same 41,006 village codes** as the old block report, with identical names and districts. District codes and names agree across all six files. |
| Is there a clean tree? | **Not one.** LGD gives three overlapping views of rural areas (block, sub-district, Gram Panchayat) that share only the village code, and urban areas (ULB, ward) that are not linked to any district, block or sub-district in the files supplied. See section 7. |
| Biggest gaps | (1) No ULB-to-district parent link exists in any file. (2) Village to Gram Panchayat is many-to-many for 369 villages and absent for 272. (3) Blocks and sub-districts are different code spaces with different spellings; no direct crosswalk. (4) The workbook has no code column, so none of these codes can be attached to a workbook row without a reviewed crosswalk. |
| Compatibility with `AREA MAPPING.xlsx` | The workbook has only two geographic columns (`DISTRICT`, `BLOCK`) and no codes. Exact-key name overlap (candidates only): **301** of 358 rows with an LGD block, **299** with a sub-district, **32** with an urban local body; **316** with at least one; **42** with none. 28 rows overlap both a block and an urban body, so a name alone cannot say which level a row means (section 8). |
| Licence, effective date, geometry | Unchanged. Licence **unverified**. No effective date printed in any file. **No file contains polygons or coordinates.** Gate 2b is unchanged and still not met. |
| Safe next step | Section 9: a typed, versioned unit graph where **the village is the join atom**, with each edge carrying its source file and evidence, loaded only after the licence and a named crosswalk reviewer exist. |

## 2. Source handling and provenance

I read `README_manifest.txt` and `README_provenance.txt` first, as asked.

| Item | Finding |
| --- | --- |
| Manifest scope | Covers the four new files only. It says they were extracted from a supplied ZIP and renamed only to use Windows-safe filenames, contents unmodified. It records each original archive filename. |
| Provenance scope | Covers the two 15 Oct files only, with SHA-256 values and the licence caveat ("commercial reuse and hosting permissions have not been verified"). |
| What is missing | The manifest records **no SHA-256 values** for the four new files, no source portal or page name, no name of who took the exports, and no hash of the ZIP. The manifest's closing note says the files do not establish polygon geometry or validated joins. Both notes agree with this audit. |
| Report time | The two older files print `Oct 15, 2026, 1:02 PM`. The four new files print `Oct 16, 2026, 11:16 AM`, which matches the time inside the original archive filenames (11:16:03 to 11:16:12). No time zone is stated, and no file prints an effective ("as on") date. |
| Cross-vintage check | The two sets were exported about 22 hours apart. They agree on every shared code and name (section 4), so they behave as one vintage. That is an observation, not a guarantee. |
| Format | All six are **SpreadsheetML 2003 XML** with an `.xls` extension, not binary Excel. A binary `.xls` reader will fail on them. Each has one worksheet, title rows, a two-row header (English then local name), the data, one empty row and a timestamp row. |
| Read-only handling | Files were opened for reading only. SHA-256 of all seven files was computed before and after the run (below), and the two recorded hashes (provenance) and the workbook hash (workbook inventory) match. |

First-sight hashes recorded by this audit (there was no earlier baseline for the four new files, so these start the baseline; they do not prove the files equal what the portal produced):

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `blocks_west_bengal.xls` | 237,505 | `25917eb941abb7d5d59f472bb23ab371ea71593b3f11040152fff27482d1eeb7` |
| `subdistrict_west_bengal.xls` | 294,183 | `d2d3a3f8a87b5ab442e71ecd505cfa2ec43e1f7942ee053717eae428cc84346d` |
| `urban_local_body_wards_west_bengal.xls` | 1,830,943 | `ce688a8f2b788a93698e70ffd6884d35c568d179c5051362ede11809973b214b` |
| `village_gram_panchayat_mapping_west_bengal.xls` | 58,117,208 | `0b69fe56b2d1fdd10854264ff687364e1d6ebe136b0c17e0c5ed6d2762ed1a82` |
| `README_manifest.txt` | 782 | `cef9e17d5442b15a96c7b82d9ae55f85dcf114bb7e2cb88096f0d217de032139` |

Already recorded and re-verified unchanged: `LGD_West_Bengal_Districts_2026-10-15.xls` (`6bfb026b…`), `LGD_West_Bengal_Development_Blocks_with_Covered_Villages_2026-10-15.xls` (`e266d814…`), `README_provenance.txt` (`4e46ee0f…`), `AREA MAPPING.xlsx` (`85c7f6a0…`).

`npm run data:verify` ([scripts/verify-sources.mts](../../scripts/verify-sources.mts)) still checks only the original four files. It does not yet cover the new ones. Extending it is a code change, so it is proposed in section 10, not made.

## 3. Schemas and row counts

All identifiers below are as printed. Codes are stored as numbers in some files and as zero-padded text in others (for example sub-district `2173` against census `02173`); the audit keeps them as text and never strips zeros.

| File | Data rows | Columns (as printed) | Notes |
| --- | ---: | --- | --- |
| Districts (15 Oct) | 23 | S. No., District Code, District Version, District Name (English), District Name (Local), Census 2001 Code, Census 2011 Code | Local name is Latin script, blank for Alipurduar. Census 2011 code is `000` for Alipurduar, Jhargram, Kalimpong, Paschim Bardhaman (all four also have no 2001 code). |
| Block with covered villages (15 Oct) | 41,006 | State Code, State Name, District Code, District Name, Block Code, Block Name, Village Code, Village Name | Every cell filled on every row. 345 distinct block codes. |
| **Blocks** (new) | 345 | S.No., District Code, District Name, Block Code, Block Version, Block Name (English), Block Name (Local) | Local name blank on 342 rows; the 3 filled are upper-case Latin (`BANARHAT`, `KRANTI`, `KALYANI`). |
| **Sub-districts** (new) | 346 | S.No., District code, District Name, Subdistrict Code, Subdistrict Version, Name (English), Name (Local), Census 2001 Code, Census 2011 Code | Local name filled on 12 rows (7 Bengali script). Five rows have Census 2011 `00000` and a blank 2001 code (section 5). |
| **Urban local bodies and wards** (new) | 3,033 | S.No., Local Body Code, Local Body Name, Ward Code, Ward Number, Ward Name | **No district, block or sub-district column.** 128 distinct local bodies. S.No. is text with a thousands separator on the last rows (`3,033`). |
| **Village to Gram Panchayat** (new) | 41,416 | S.No., District Code, District Name, District Census 2011, District Census 2001, Subdistrict Code, Subdistrict Name, Subdistrict Census 2011, Subdistrict Census 2001, Village Code, Village Name, Village Census 2011, Village Census 2001, Local Body Code, Local Body Name | **No block column.** One row per village-to-local-body pair, not per village. |

Serial numbers run 1 to n without gaps in every file. No file has a repeated whole row. No cell is whitespace-padded except ten rows of one Gram Panchayat name (section 6).

## 4. Cross-file agreement (verified)

| Check | Result |
| --- | --- |
| District code to name, in every file that carries one | 0 disagreements against the district list (23 codes, 23 names, all unique). |
| New block list against the old block-with-villages report | Same 345 block codes. 0 codes only in one file. 0 codes with a different name or district. |
| Village sets | 41,006 distinct village codes in both the old block report and the new village mapping. 0 only in one. 0 name differences. 0 district disagreements. Old report has no repeated village code. |
| Sub-district codes in the village mapping | 0 not found in the sub-district list. 0 name or district mismatches. 0 Census 2011 mismatches. |
| Districts with rural data | 22 of 23. **Kolkata (315)** has no block, no sub-district and no village. |
| Block and sub-district code spaces | **0 codes in common.** Even the same-named unit has a different code in each (for example `Kranti`: block 7484, sub-district 7119). |

Consequence for the earlier open question about completeness of the block list: the independent block list now lists exactly the 345 blocks that the village-derived report did, so the block count is not an artefact of village rows. It still does not prove 345 is the official West Bengal count, because no file states one.

## 5. Findings per file

### 5.1 Districts and blocks

- Districts and blocks: no duplicate codes, no duplicate (district, name) pair, no orphan district code.
- One duplicated block name: `Sankrail` (2913 Howrah, 3000 Jhargram), as found in Phase 0E. Block versions range from 1 to 13, which matters for effective dating, not for identity.
- Blocks per district match the Phase 0E counts (South 24 Parganas 29, Murshidabad 26, Purba Medinipur 25, and so on; Kalimpong 4; Kolkata 0).

### 5.2 Sub-districts

- 346 rows against 345 blocks. Kalimpong has 5 sub-districts and 4 blocks.
- `Lavaold` (7050, Kalimpong) has **no village** in the mapping. It sits next to `Lava` (2157). The files do not say it is retired; treat it as unresolved, not as an error to drop.
- Five rows carry the sentinel Census 2011 code `00000` and no 2001 code: Banarhat (7118), Kalyani (6966), Kranti (7119), Lavaold (7050), Pedong (7051). Their 2001 and 2011 census codes are absent, which suggests units created after the 2011 census (inference; the files do not say). 341 of 346 sub-district codes equal the census code, so for older units the LGD code is the census code.
- Names differ from the block list in spelling and numerals: within a district, 317 sub-districts share a derived name key with a block, 29 sub-districts and 28 blocks do not (`Andal`/`Ondal`, `Mahisadal`/`Mahishadal`, `Goalpokher - I`/`Goalpokhar-I`, `Bally Jagachha`/`Bally-Jagacha`). Spelling alone therefore cannot link the two lists.
- `Sankrail` is duplicated here too (2404, 2459).

### 5.3 Villages and Gram Panchayats

- 41,416 rows, **41,006 distinct villages**: 369 villages appear more than once (337 twice, 27 three times, 3 four times, 1 five, 1 seven), 410 extra rows. In every repeated village all rows share one sub-district and differ in Gram Panchayat. So **village to Gram Panchayat is many-to-many**, which is consistent with a village divided between panchayats. The file does not say that; it is the only reading the data supports and it is an inference.
- **272 villages have no local body** (blank code and name together on every one; none also appears with a body). Murshidabad 70, Malda 46, South 24 Parganas 27, Dakshin Dinajpur 24, Nadia 23, Jhargram 20, Darjeeling 18, Cooch Behar 11 are the largest. Whether these are urban, uninhabited or unmapped is not stated.
- 3,339 distinct local body codes; each code has exactly one name. **150 names are shared by more than one code** (largest case: one name on 8 codes), so a Gram Panchayat name is not an identifier.
- No local body spans two districts. **22 span more than one sub-district and 9 span more than one block** (listed in appendix B).
- **0 of the 128 urban local body codes appear in the village mapping.** The two files use disjoint local body code ranges, so there is no overlap to join on. 864 village names end in `(Ct)` (census town) and are still mapped to a Gram Panchayat; the file gives no reason, so no inference is drawn.
- Census columns: village Census 2011 code equals the LGD village code on 41,387 rows and is `000000` on 29 (all 29 carry a `9xxxxx` LGD code, which suggests villages added after the census; inference). Village Census 2001 code is blank on 37 rows, sub-district Census 2001 is blank on 154 rows, district Census 2001 is blank (and Census 2011 `000`) on 3,904 rows (the four newest districts).
- One name has a leading non-breaking space (`Haripalashutosh`, 10 rows). An exact comparison would miss it; this audit's derived key trims it, the stored value is untouched.

### 5.4 Urban local bodies and wards

- 128 local bodies, 3,033 wards. Ward codes are unique. Ward numbers are unique within each local body. No ward name repeats within a body. Ward numbers are all numeric.
- **No parent link.** The file has no district, sub-district or block, and none of its local body codes occur anywhere else in the bundle. An urban body can currently be placed under a district only by name, which is not allowed.
- Ward name text is not uniform: 129 names break the `Name (M) - Ward No.N` pattern, and in 29 bodies (422 wards) the name prefix differs from the local body name (`Burdwan` against `Barddhaman (M)`, `Purulia` against `Puruliya (M)`). Name-based joins from wards to bodies therefore fail; use the code.
- Sixteen bodies mix ward types: ordinary municipal wards plus `OG` (outgrowth) or `CT` wards, whose names carry the neighbouring unit's name (for example `Joka (OG) - Ward No.142` under `Maheshtala`).
- Three internal oddities, none resolved here: `Uluberia` ward code 2897601 has Ward Number 31 but its name says `Ward No.30` (another ward is genuinely 30); `Maheshtala` has 36 wards numbered up to 142; `Bansberia` has 24 wards numbered up to 25.
- Largest: Kolkata 144, Asansol 106, Howrah 66, Siliguri 47, Durgapur 43, Bidhannagar 41. Smallest: Mekliganj 9, Mirik 9. There is **no borough level**: Kolkata is a single local body with 144 wards.
- **Vintage warning.** The earlier assessment ([geographic-data-assessment.md](geographic-data-assessment.md), GEO-03; [phase-0d-geographic-source-gate.md](phase-0d-geographic-source-gate.md), section 3.5) records Schedule II notifications of 11 Sept 2026 that set Kolkata at 209 wards and Howrah at 68. This export lists 144 and 66. Either the portal has not caught up or the export predates the notifications; the file cannot say which. Ward units must therefore be versioned, not frozen.

## 6. Missing codes, duplicates and format hazards (all files)

| Hazard | Where | Handling |
| --- | --- | --- |
| Codes stored as number in one file and zero-padded text in another | Sub-district, village, census columns | Keep codes as text. Never cast to integer for storage. |
| `ss:Index` gaps and merged trailer cells | All | Parse by cell index. Reject the timestamp row as data. |
| Thousands separator in text serial (`3,033`) | ULB file | Serial is not an identifier. Do not parse it. |
| Sentinels `000`, `00000`, `000000`, blank | Census columns | Treat as "no census code", never as a code. |
| Leading non-breaking space | One Gram Panchayat name | Trim in the working key only. |
| Same name, different units | `Sankrail` (blocks and sub-districts); 150 Gram Panchayat names; 32 names that are both a block and an urban body | Join by code only. |
| Mixed numeral styles (`Ii`, `II`, `-1`, ` - I`) | Block and sub-district names | Already handled in the Phase 0E derived key. |

No missing identifier was found in any identifier column of any file. The only missing codes are the 272 blank local bodies, the sentinel census codes above, and the blank local names.

## 7. How the hierarchy actually fits together

```
State 19
 └─ District (23) ───────────────────────────────── Kolkata has no rural data
     ├─ Block (345)        ── village (41,006) ──┐
     ├─ Sub-district (346) ── village (41,006) ──┤   the village code is the only key
     └─ Gram Panchayat (3,339, many-to-many) ────┘   shared by all three views
 Urban local body (128) ── Ward (3,033)         no link to District, Block or Sub-district
```

- **Block ← village:** each village belongs to exactly one block (old block report, all 41,006).
- **Sub-district ← village:** each village belongs to exactly one sub-district.
- **Block vs sub-district:** derived through shared villages, 320 of 345 blocks pair one-to-one with a sub-district. Fourteen blocks contain villages from a second or third sub-district and sixteen sub-districts hold villages from a second block (appendix A). In total 32 villages sit in a sub-district other than their block's main one. So a block is not simply a renamed sub-district.
- **Gram Panchayat ← village:** many-to-many (369 villages in more than one), and absent for 272 villages.
- **Block to Gram Panchayat:** only derivable through villages. Every block has between 4 and 23 Gram Panchayats and 65 blocks also have at least one village without one. Nine Gram Panchayats sit in two blocks (appendix B), mostly through one or two villages.

## 8. Compatibility with `AREA MAPPING.xlsx`

Method: only columns A (`DISTRICT`) and B (`BLOCK`) were read; staffing columns were discarded as parsed, as in Phase 0E. The territory label was never used as an input. Official names were compared with the Phase 0E derived key (Unicode NFKC, dash and underscore unified, numeral separators and Roman or Arabic numerals unified, case folded, punctuation and spaces removed). The block result reproduces Phase 0E exactly, which is a regression check on the method.

| Measure | Rows (of 358) |
| --- | ---: |
| Exact-key candidate among the 345 LGD blocks | **301** (same as Phase 0E) |
| Exact-key candidate among the 346 LGD sub-districts | 299 |
| Exact-key candidate among the 128 urban local bodies | 32 |
| Exact-key candidate among the 23 districts | 1 (`Jhargram`) |
| At least one candidate in any list | **316** |
| No exact-key candidate in any list | **42** (57 before this bundle; 15 gained a sub-district or urban candidate) |
| Candidate only in the sub-district list (spelling follows census style) | 11 (rows 9, 55, 56, 100, 103, 104, 213, 269, 340, 344, 353) |
| Candidate only in the urban list | 4 (rows 64 `Asansol`, 108 `Bishnupur`, 157 `Chakdaha`, 318 `Siliguri`) |
| Candidate in both the block and the urban list | **28** (appendix C) |

What this means:

1. **Structural incompatibility.** The workbook has no code column and no unit-type column. Nothing in it can reference a block, sub-district, Gram Panchayat, village, urban body or ward code. Every attachment needs a reviewed crosswalk row (B-26). Nothing here creates one.
2. **The crosswalk must name the LGD list.** A workbook label can resemble a block spelling or a sub-district spelling: 317 of 345 blocks and sub-districts share a spelling, but for 11 workbook rows only the sub-district spelling matches. A crosswalk row must therefore record the target unit type and code, not a name.
3. **Name alone cannot choose the level.** 32 names are both a block and an urban body in LGD (for example `Kalyani`, `Haldia`, `Raiganj`, `Berhampore`, `Kurseong`), and 28 workbook rows hit both. These must go to the reviewer with both candidates and no default.
4. **Urban rows are still unresolved.** Of the earlier urban-looking rows: `Borough 10`, `Borough 11`, `Borough 7`, `BOROUGH 12` (rows 204 to 207) have no LGD counterpart because this export has no borough level; `Behala municipality`, `Bidhannagar Municipality`, `Durgapur Municipal Corporation`, `Howrah MC`, `Chandanagar` have no exact-key candidate, although an urban body with a related stem exists in the list. A related stem is a lead, not a match.
5. **The workbook has no ward-level row.** No row can be resolved to a ward. Ward drill-down would show LGD wards with no workbook claim, which the allocation rules map to **Data Missing / Unknown**, never to vacant or unallocated.
6. **Territory label.** `DISTRICT` is a sales-territory label (B-23). It is still not compared with LGD district names or codes, and no district is derived from it.

The 42 rows with no exact-key candidate are listed in appendix D for the reviewer queue.

## 9. Proposed validated geographic hierarchy

This is a proposal for review. It changes no code and loads nothing.

### 9.1 Design rules

1. **Typed units and typed edges, not a fixed tree.** Extend the self-referencing `AdminUnit` idea in [proposed-data-model.md](proposed-data-model.md): a unit has a type (`district`, `block`, `subdistrict`, `gram_panchayat`, `village`, `urban_local_body`, `ward`) and an LGD code; relationships are separate edge records, because several are not one-parent.
2. **The primary key is `(unit type, LGD code)`.** Name is a label and a search aid only. Codes stay as text.
3. **Every edge records its evidence:** source file, report time, and the rule that produced it (`direct` from a column, or `via-village`).
4. **Village is the join atom.** Block, sub-district and Gram Panchayat memberships are edges to villages. Block-to-Gram-Panchayat is a derived edge with a village count.
5. **Edges carry no allocation meaning.** A geographic edge never creates, moves or implies an employee allocation (rules in [phase-0f-gate-p0-completion.md](phase-0f-gate-p0-completion.md), section 2).
6. **Version everything.** Units and edges get `valid_from`, `valid_to` and a source vintage (block versions reach 13; ward counts are changing, section 5.4).

### 9.2 Drill-down paths

| Path | Status | Why |
| --- | --- | --- |
| State → District → **Block** → Village | **Validated for structure** | One parent per level, 0 orphans, two independent files agree on all 345 blocks and 41,006 villages. Geometry is not covered. |
| Block → **Gram Panchayat** → Village | **Validated with qualifications** | Derived through villages. Show a "No Gram Panchayat recorded" bucket (272 villages). List the 9 two-block Gram Panchayats under each block with partial counts; never move a village. |
| District → **Sub-district** → Village | **Validated, optional parallel view** | Clean parent edges. Use only if census alignment is wanted. Do not equate with block (section 7). |
| **Urban local body** → Ward | **Internally validated, unattached** | Unique codes, no orphans, but no parent. The ULB cannot be placed under a district without a source that lists it. |
| District → Urban local body | **Not established** | No file supplies it. The earlier assessment (GEO-04, S7) records that LGD offers an urban-local-bodies-with-coverage download, which is the likely source. Request it from the same exporter. Do not infer from names. |
| Kolkata | Wards only | District 315 has no rural units and one urban body with 144 wards (see the vintage warning). |

### 9.3 Validation rules to apply before any future load (all pass today except where marked)

| ID | Rule | Today |
| --- | --- | --- |
| V-01 | Every district code is in the district list and its name matches. | Pass |
| V-02 | Block codes unique; each block's district exists. | Pass |
| V-03 | Every village has exactly one block and exactly one sub-district. | Pass |
| V-04 | Village sets in the block report and the village mapping are identical. | Pass |
| V-05 | Every Gram Panchayat code has one name and one district. | Pass |
| V-06 | Village to Gram Panchayat multiplicity is recorded, not collapsed. | Needs rule (369 villages) |
| V-07 | Villages without a local body are listed, not assigned. | Needs rule (272 villages) |
| V-08 | Ward codes unique; ward belongs to one urban body. | Pass |
| V-09 | Every urban body has a district parent from an official source. | **Fail: no source** |
| V-10 | Block and sub-district are never joined by code or by name alone. | Rule (0 shared codes; 25 blocks differ) |
| V-11 | A workbook row links to a unit only through a reviewed crosswalk row naming the unit type and code. | Not started (B-26) |
| V-12 | Ward version recorded; 144 and 66 are not treated as current. | Needs rule |

## 10. Documentation and follow-up

Documentation written by this work:

- This document (new) and the audit script `scripts/audit/lgd-bundle-audit.py` (new). No other file was created or changed.

Proposed, **not** done (each needs a separate release, because it touches shared code or earlier documents):

0. Add short dated pointers to [geographic-crosswalk-review.md](geographic-crosswalk-review.md) (section 10.1) and [geographic-data-assessment.md](geographic-data-assessment.md) (GEO-10, G-04, G-09), saying which earlier blockers this bundle answers (sub-district, urban body and ward lists received; block-list completeness evidence) and which remain (urban parent link, effective date, licence, geometry). **Pending a separate release. Those two documents are unchanged and still describe the sub-district, urban body and ward lists as missing.**
1. Record the four new hashes in [scripts/lib/sources.ts](../../scripts/lib/sources.ts) so `npm run data:verify` covers all bundle files, and add `README_manifest.txt` to the manifest check.
2. Ask the requester to add SHA-256 values, the source portal page, who exported them and when, and the ZIP hash to `README_manifest.txt`.
3. Request the LGD export that lists urban local bodies with their parent district or sub-district coverage, and the Gram Panchayat directory if its type and status fields are wanted.
4. Ask the workbook owner (B-23, B-24) what the `Borough` rows and the `-W` rows mean.
5. Name the crosswalk reviewer (B-26). The reviewer queue is the 42 rows in appendix D plus the 28 block-or-urban rows in appendix C.
6. Resolve the licence (B-18, G-06) before any import.

## 11. What this audit did not do

- No import, no copy of LGD files into the repository or any server, no change to `data/`, `src/`, `public/`, tests, map behaviour, the gap-only UI or the independent verification work.
- No Supabase connection, network call or external service.
- No name-only match accepted. Section 8 reports overlap counts only. No crosswalk row, status or approval was created.
- No geometry. None of the six files contains a polygon or coordinate.
- No claim that 345 blocks, 128 urban bodies, or any ward list is the official or current count.

## Appendix A: blocks whose villages sit in more than one sub-district

Village counts per sub-district, from the village mapping joined to the block report by village code. Block names as printed in the block report.

| Block (code, district) | Villages | Sub-districts (villages) |
| --- | ---: | --- |
| Amta-I (2905, Howrah) | 83 | Amta - I 82, Uluberia - I 1 |
| Coochbehar I (2847, Cooch Behar) | 149 | Cooch Behar - I 148, Mekliganj 1 |
| Goalpokhar-I (2880, Uttar Dinajpur) | 160 | Goalpokher - I 159, Goalpokher - II 1 |
| Kandi (3013, Murshidabad) | 95 | Kandi 93, Berhampore 2 |
| Kharibari (2863, Darjeeling) | 77 | Kharibari 74, Phansidewa 2, Matigara 1 |
| Kranti (7484, Jalpaiguri) | 49 | Kranti 40, Mal 9 |
| Kurseong (2864, Darjeeling) | 76 | Kurseong 74, Matigara 1, Rangli Rangliot 1 |
| Nanoor (2839, Birbhum) | 139 | Nanoor 138, Labpur 1 |
| Naxal Bari (2867, Darjeeling) | 96 | Naxalbari 95, Phansidewa 1 |
| Pandabeswar (2820, Paschim Bardhaman) | 34 | Pandabeswar 29, Andal 3, Jamuria 2 |
| Phansidewa (2868, Darjeeling) | 113 | Phansidewa 110, Kharibari 2, Naxalbari 1 |
| Raghunathganj-I (3019, Murshidabad) | 69 | Raghunathganj - I 68, Raghunathganj - II 1 |
| Rangli Rangliot (2869, Darjeeling) | 29 | Rangli Rangliot 28, Kurseong 1 |
| Sitalkuchi (2855, Cooch Behar) | 75 | Sitalkuchi 74, Dinhata - II 1 |

## Appendix B: Gram Panchayats that appear in two blocks

Counts are villages in each block.

| Code | Name | Blocks (villages) |
| --- | --- | --- |
| 107937 | Atpukur | Minakhan 4, Haroa 1 |
| 108188 | Lakshmikantapur | Magra Hat-I 6, Mandirbazar 1 |
| 108578 | Shyamla | Jamuria 4, Pandabeswar 1 |
| 108699 | Ukhra | Pandabeswar 1, Ondal 1 |
| 108897 | Sahapur | Rampurhat-Ii 18, Rampurhat-I 1 |
| 109956 | Beernagar-I | Kaliachak-Iii 4, Kaliachak-I 1 |
| 109957 | Beernagar-Ii | Kaliachak-I 1, Kaliachak-Iii 1 |
| 110046 | Marishda | Contai-Iii 11, Deshapran 1 |
| 110115 | Naichanpur-Ii | Moyna 2, Nandakumar 1 |

A further 13 Gram Panchayats span two or more sub-districts without spanning two blocks (22 in all).

## Appendix C: workbook rows with both a block and an urban-body candidate

Rows (workbook row number and label, as written): 13 Haldia, 43 Ghatal, 53 Jhargram, 113 Sonamukhi, 135 Baduria, 160 Haringhata, 162 Kalyani, 168 Nabadwip, 172 Santipur, 175 Baruipur, 235 Tarakeswar, 248 Dubrajpur, 262 Sainthia, 267 Berhampore, 273 Domkal, 277 Kandi, 294 Falakata, 301 Haldibari, 312 Kurseong, 313 Mirik, 320 Dhupguri, 321 Maynaguri, 323 Mal, 330 Kaliaganj, 332 Raiganj, 338 Balurghat, 345 English Bazar, 352 Old Malda. Row 53 also overlaps the Jhargram district name.

## Appendix D: workbook rows with no exact-key candidate in any LGD list

Row and label as written in the workbook (42 rows): 21 Contai-II, 27 Salboni, 29 Medinipur Sadar, 30 Garhbeta-I, 31 Garhbeta-II, 32 Garhbeta-III, 35 Keshiari, 65 Kulti, 67 Galsi-W, 68 Jharkhand-W, 69 Durgapur Municipal Corporation, 87 Mongalkote, 97 Mejia, 109 Indas, 110 Joypur, 124 Baghmundi, 127 Joypur, 136 Bagdah, 137 Bangaon, 140 Barrackpore I, 141 Barrackpore II, 156 Bidhannagar Municipality, 166 Krishnanagar I, 167 Krishnanagar II, 204 Borough 10, 205 Borough 11, 206 Borough 7, 207 BOROUGH 12, 208 Behala municipality, 223 Howrah MC, 237 Chinsurah Mogra, 244 Sreerampur Uttarpara, 245 Chandanagar, 247 Ilambazar, 258 Nanur, 280 Jiaganj, 291 Madarihat-Birpara, 302 Mekhliganj, 311 Jorebunglow-Sukhiapokharii, 316 Khoribari, 319 Jalpaiguri Sadar, 351 Manickchak.

These are rows for a person to resolve. The Phase 0E register holds the nearest-name leads for most of them; the sub-district and urban lists add no exact-key candidate for any of these 42.
