# Workbook inventory

**Status: AUDITED, read-only.** Audit date: 2026-10-15 (Phase 0B).

Everything under **Verified** was measured directly from the file. Anything
labelled **Inference** is a reading of the data that the business has not
confirmed. Meanings of columns are never assumed from headers alone; open
points are recorded as questions in
[open-business-decisions.md](open-business-decisions.md).

This document contains no employee names, no employee codes and no pay figures.
It reports counts and distributions only. The workbook has no pay columns (see
section 6).

**Terminology note (added 2026-10-15, after the B-23 clarification).** The project
requester has confirmed that `AREA MAPPING.xlsx` is the company's official sales-team
mapping workbook and that its `DISTRICT` column represents **sales territories or
groupings, not necessarily government administrative districts** (B-23; see
[open-business-decisions.md](open-business-decisions.md) and
[phase-0c-decision-brief.md](phase-0c-decision-brief.md), section 2). This is a
requester statement, not a formal stakeholder approval. In this document, "district",
"workbook district" and "district label" used about the workbook mean **the
sales-territory label**, unless the text says "LGD district" or "official district".
The findings below are preserved as originally written. Any match between a label and an
LGD district is a **name-overlap diagnostic, not a mapping and not a join key**, and
nothing here implies which blocks or wards belong to a sales territory.

## 1. Source file and audit method

| Item | Value |
| --- | --- |
| File | `data-source/AREA MAPPING.xlsx` (git-ignored; see `.gitignore`) |
| Size | 32,894 bytes |
| SHA-256 | `85C7F6A02370562D0E38286F592A71014A61A365E68E9CB05DC10EAC22295FE3` |
| In-file timestamps | Created 2015-06-05, last modified **2026-10-13** (from file properties; author fields deliberately not read) |
| Written by | Microsoft Excel (per file properties) |
| Method | The original was hashed, copied, and the copy marked read-only. The copy's hash matched. All reads used a Python standard-library parser (zip + XML) on the copy, reading cached values **and** formulas. After the audit the original was re-hashed: **unchanged**. |
| Cross-check data | A public mirror of the Local Government Directory (LGD) block list, data dated 2023-03-01, downloaded to a scratch folder outside the project for name matching only (see [geographic-data-assessment.md](geographic-data-assessment.md), S16). It is not stored in the repository. |

## 2. Workbook structure (verified)

| Property | Finding |
| --- | --- |
| Worksheets | **1**, named `Sheet1`, visible. No hidden sheets. |
| Used range | `A1:N359`: 1 header row, **358 data rows**, 14 columns |
| Formula cells | **0**. Every populated cell is a constant. |
| Cell types | **All 2,042 stored cells are text.** No numbers, dates or booleans. |
| Merged cells, hidden rows/columns | None |
| Data validation, conditional formatting, autofilter | None |
| Defined names, external links, macros, tables, pivots, comments | None |
| Layout | Header frozen at row 1. No title rows, no subtotal rows, no blank separator rows. |
| Stored cells vs non-blank | 2,042 stored, **2,016 non-blank**. 26 cells hold only whitespace (see DQ-08). |

**Purpose of `Sheet1` (inference).** One row per geographic unit (a "block" or an
urban unit), with the district it sits under, an area sales manager and several
staff slots per role. It reads as a **block-level staffing matrix**. The sheet
name is generic, so this purpose has not been confirmed (B-05).

*Clarification 2026-10-15:* "the district it sits under" above is the `DISTRICT` label,
which the requester says is a sales territory or grouping, not necessarily an
administrative district. Whether a sales territory is the label or the row is part of
B-05 and is not decided.

## 3. Column inventory

All 14 columns are text. Populated = non-blank. "Vacant" counts the literal marker
`Vacant`. **Headers repeat**: six distinct header texts cover 14 columns. The
slot numbers in the Slot column are this audit's labels, not part of the file.

| Col | Header | Slot | Populated | Blank | Notes |
| --- | --- | --- | ---: | ---: | --- |
| A | DISTRICT | | 358 | 0 | 21 distinct labels |
| B | BLOCK | | 358 | 0 | 355 distinct labels; mixes administrative blocks and urban units (DQ-04) |
| C | ASM | | 358 | 0 | 19 distinct cell values; 37 cells hold two names separated by `/` |
| D | PRIMARY | 1 | 286 | 72 | 7 are `Vacant` |
| E | PRIMARY | 2 | 96 | 262 | 6 are `Vacant`; 4 of the blanks are whitespace-only |
| F | PRIMARY | 3 | 13 | 345 | |
| G | SECONDARY | 1 | 307 | 51 | 3 `Vacant`; 1 whitespace-only |
| H | SECONDARY | 2 | 96 | 262 | 14 `Vacant`; 1 whitespace-only |
| I | SECONDARY | 3 | 16 | 342 | |
| J | SECONDARY | 4 | 7 | 351 | |
| K | SECONDARY | 5 | 3 | 355 | |
| L | DSO | 1 | 91 | 267 | **20 of the blanks are whitespace-only** |
| M | DSO | 2 | 10 | 348 | |
| N | DSO | 3 | 3 | 355 | |

Slot behaviour (verified): within PRIMARY and SECONDARY, **no row skips a slot**
(slot 2 is never filled while slot 1 is blank). DSO has 1 row with a gap. 96 rows
have two or more PRIMARY entries and 96 have two or more SECONDARY entries.

## 4. Content summary (verified unless marked)

### Geography

| Fact | Value |
| --- | --- |
| District labels | **21** |
| Rows per district | 6 to 34 (median about 19) |
| Each district's rows are contiguous | Yes (21 runs for 21 labels) |
| Block labels used under more than one district | 6 (see DQ-05) |
| Blocks vs a public LGD block list | 293 exact, 39 spelling variants, 2 placed in a different district, **24 unmatched** of 358 (see geographic assessment, GEO-08) |

District labels, row counts and the district each overlaps in the LGD snapshot
(the mapping was derived from block-name overlap, not assumed):

| Workbook label | Rows | LGD district (2023 snapshot) | LGD blocks |
| --- | ---: | --- | ---: |
| Alipurduar | 6 | Alipurduar | 6 |
| BANKURA | 22 | Bankura | 22 |
| Birbhum | 19 | Birbhum | 19 |
| Coochbehar | 12 | Coochbehar | 12 |
| DDP | 8 | Dinajpur Dakshin | 8 |
| Darjeeling | 10 | Darjeeling | 9 |
| EAST BURDWAN | 22 | Purba Bardhaman | 23 |
| EAST MIDNAPORE | 25 | Medinipur East | 25 |
| Hooghly | 19 | Hooghly | 18 |
| Howrah | 18 | Howrah | 14 |
| JHARGRAM | 6 | Jhargram | 8 |
| Jalpaiguri | 9 | Jalpaiguri | 9 |
| Malda | 15 | Maldah | 15 |
| Murshidabad | 26 | Murshidabad | 26 |
| Nadia | 18 | Nadia | 18 |
| North 24 PGS | 23 | 24 Paraganas North | 22 |
| PURULIA | 20 | Purulia | 20 |
| South 24 PGS | 34 | 24 Paraganas South | 29 |
| UDP | 9 | Dinajpur Uttar | 9 |
| WEST BURDWAN | 14 | Paschim Bardhaman | 8 |
| WEST MIDNAPORE | 23 | Medinipur West | 21 |

*Clarification 2026-10-15:* the third column shows which LGD district's block names the
rows under a label resemble in a **2023 third-party mirror** (not an authoritative
source). It is a diagnostic only. It does **not** say that a label is that district, it
is **not** a mapping, and it must **not** be used to join the `DISTRICT` column to
official district names, codes or polygons. A difference between "Rows" and "LGD blocks"
is no longer to be read as a possible source error, because a sales territory need not
follow district lines. Whether it is one is unconfirmed.

No workbook label corresponds to **Kalimpong** (4 blocks in the LGD snapshot) or
**Kolkata** (no administrative blocks; only 4 KMC "Borough" rows appear, filed
under South 24 Parganas). **Inference:** the missing districts are either
covered under other labels or deliberately out of scope (B-20).

*Clarification 2026-10-15:* "No workbook label corresponds to" describes labels and
block-name matches only. It does **not** show that the geography of Kalimpong or Kolkata
is unrepresented, unstaffed or unallocated; a sales territory could cover it under
another label or spelling. Until a reviewed crosswalk exists, that state is **data
missing or unknown** (see
[proposed-data-model.md](proposed-data-model.md), "The four concepts, kept apart").

### People (names only; counted after case and whitespace normalisation)

| Fact | Value |
| --- | --- |
| Distinct person names across all staff columns | **225** |
| By role group (a name can be in more than one) | ASM 20, PRIMARY 67, SECONDARY 100, DSO 44 |
| Names appearing in two role groups | **6** (2 ASM and PRIMARY, 1 ASM and SECONDARY, 2 PRIMARY and SECONDARY, 1 DSO and SECONDARY) |
| Names appearing in more than one district | 16 (15 in two districts, 1 in four) |
| Blocks (rows) per name | 1 to 37; most names appear on 2 to 6 rows |
| Staff slots populated | ASM 358, PRIMARY 395, SECONDARY 429, DSO 104 |
| Person listed twice in the same row | 0 |
| Rows with no PRIMARY and no SECONDARY at all | 24 |
| Rows with an ASM and no other staff | 15 |

**These are counts of distinct name strings, not of people.** The workbook has no
employee identifier, so two people sharing a name merge and one person spelled
two ways splits (DQ-06). Headcount cannot be derived from this file with
confidence.

### Hierarchy (what the file shows)

- Each row has exactly one ASM cell; there is **no layer above ASM** and **no
  explicit reporting link** from any person to a manager. The hierarchy is
  implied by being on the same row (inference).
- 15 of 21 districts have a single ASM name throughout. The other 6 show two
  ASM names: in 4 districts (Alipurduar, Coochbehar, Darjeeling, Jalpaiguri)
  **every** row names both, separated by `/` (37 rows in total); in the other 2,
  different rows name different ASMs. Whether the `/` form means joint
  responsibility or a handover is unknown (B-21).
- 3 names appear as ASM and also in PRIMARY or SECONDARY slots. This could be a
  dual role, or two different people sharing a name (B-09).

### Primary, secondary and DSO mappings

- PRIMARY, SECONDARY and DSO are three groups of staff slots attached to the row
  (verified). Their definitions are **not stated** in the file.
- **Inference (not confirmed):** in sales usage, "primary" often means
  company-to-distributor and "secondary" distributor-to-retailer. The workbook
  does not say this (B-08).
- **"DSO" is not expanded anywhere** in the file. Whether DSO staff are on
  distributor payroll is **unknown** (B-07). The workbook has no payroll-type
  column, so distributor-payroll personnel cannot be identified from it.

### Vacant and open positions

- The literal marker `Vacant` appears in **30 cells** across **22 rows**:
  PRIMARY 13, SECONDARY 17, none in ASM or DSO. The spelling is consistent.
- No row consists only of `Vacant` markers.
- Many other slots are simply blank (for example 72 rows have no first PRIMARY,
  51 have no first SECONDARY). Whether blank means "not applicable", "unfilled" or
  "not yet entered" is **unknown** (B-12).
- There is no position identifier or approval reference, so "approved vacancy"
  cannot be evidenced from this file.

## 5. Identifiers

**None exist.** No employee code, position code, territory code, district code,
block code or LGD/Census code. Rows are identified only by their position in the
sheet. Names are the only handle for people, and name labels are the only
handle for places.

## 6. Salary and other sensitive fields

| Question | Finding (verified) |
| --- | --- |
| Salary or pay-related column present? | **No.** None of the 14 headers relates to pay, incentives or compensation. |
| Employee code, phone, email or similar present? | **No.** |
| Out of scope for Phase 1 | Salary is out of scope; nothing was read, analysed or recorded about it. |
| Personal data present | Person names in columns C to N. Names are not reproduced in these documents. |

## 7. Formula columns and import limitations

- **No formulas**, so no hidden calculation logic and no stale cached values.
- **All values are text.** Any numeric or date interpretation downstream would
  be invented, not read.
- **Duplicate header names** make a header-keyed import impossible. Columns
  must be read by position, with slot meaning defined by the business.
- **Wide layout.** Each row holds up to 3 PRIMARY, 5 SECONDARY and 3 DSO slots,
  so an import must unpivot to one record per row and slot.
- **Invisible characters.** One block label contains a non-breaking space; 26
  cells are whitespace-only; 18 block labels use an en dash while others use a
  hyphen or none.
- **No keys.** Re-importing a changed sheet cannot reliably tell an edited row
  from a new one unless a key is agreed (B-02, B-22).

## 8. Not verified

- The business meaning of every column header (see questions above).
- Whether the sheet is the complete national or state picture, or a subset.
- Whether names in different columns refer to the same individual.
- Any comparison against official current data beyond the 2023 LGD snapshot
  (the snapshot is a third-party mirror; its currency is limited).
