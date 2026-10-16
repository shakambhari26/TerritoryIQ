# Data-quality findings

**Status: AUDITED** against `data-source/AREA MAPPING.xlsx` (SHA-256 recorded in
[workbook-inventory.md](workbook-inventory.md)). Audit date: 2026-10-15.

Each finding separates **Verified** (measured), **Inference** (reasonable
reading, not confirmed), **Unresolved** (needs business input) and **Action**.
No personal names, employee codes or pay values appear here. Question IDs (B-xx)
point to [open-business-decisions.md](open-business-decisions.md).

**Terminology note (added 2026-10-15, after the B-23 clarification).** The project
requester has confirmed that the workbook's `DISTRICT` column represents **sales
territories or groupings, not necessarily government administrative districts** (B-23;
see [open-business-decisions.md](open-business-decisions.md) and
[phase-0c-decision-brief.md](phase-0c-decision-brief.md), section 2). This is a
requester statement, not a formal stakeholder approval. In this document "district"
about the workbook means the **sales-territory label** unless the text says "LGD
district" or "official district". The original findings are preserved. Where a finding
or action could now mislead, a dated clarification follows it. In particular: a match
between a label and an LGD district is a **name-overlap diagnostic, not a mapping or a
join key**; no block or ward membership, employee coverage or territory boundary is
inferred anywhere in this document.

**Membership clarification (R4, added 2026-10-15, later the same day).** The requester
has also confirmed that the blocks listed beneath each sales-territory label are that
sales territory's **intended membership**, and that the mappings may be used as the
**authoritative business starting point** for the crosswalk. This is
**requester-confirmed evidence, not formal approval** by the Head of Sales, the sponsor
or any other stakeholder. This document therefore takes membership from the workbook rows
as written and **infers nothing beyond them**. It does not make the rows a geographic
fact: block labels still have to be matched to official units, and boundaries validated,
independently (never through the sales-territory label). Records that are unmatched,
ambiguous, mixed-unit or in conflict are flagged for review and not resolved silently
(DQ-15). The workbook was not modified, and no row is dropped. Formal approval of B-23
and sign-off of the B-26 crosswalk remain outstanding.

## Summary

| ID | Finding | Severity for import |
| --- | --- | --- |
| DQ-01 | No identifiers for people, positions, territories or places | High |
| DQ-02 | District labels use abbreviations and legacy names | Medium |
| DQ-03 | Kalimpong absent; Kolkata only partly present | High (scope) |
| DQ-04 | BLOCK column mixes unit types | High |
| DQ-05 | Same block listed under two districts; DISTRICT may not be the administrative district | High |
| DQ-06 | People identified by name only | High |
| DQ-07 | Block spellings differ from official names | Medium |
| DQ-08 | Whitespace-only cells, stray characters, mixed dash styles | Medium |
| DQ-09 | Vacancy is partly explicit, mostly ambiguous | High |
| DQ-10 | Repeated headers and wide layout | Medium |
| DQ-11 | ASM cell holds two names in 37 rows | Medium |
| DQ-12 | Rows with no operational staff | Medium |
| DQ-13 | Role meanings (including DSO) not stated | High |
| DQ-14 | Possible dual roles | Medium |
| DQ-15 | Crosswalk review queue under the membership clarification (R4) | High (crosswalk) |

What was **not** found: formulas, merged cells, hidden rows, duplicate rows, a
person listed twice within one row, or skipped slots in PRIMARY and SECONDARY.

---

## DQ-01: No identifiers

| | |
| --- | --- |
| **Verified** | The 14 columns hold no employee code, position code, territory code, or district, block, LGD or Census code. Rows have no key. |
| **Inference** | The sheet was built for reading, not for system import. |
| **Unresolved** | Whether the business has identifiers elsewhere (HR system, distributor master) that can be joined (B-22, B-25). |
| **Action** | Generate internal IDs on import and store the original sheet row reference. Map places to LGD codes through a reviewed crosswalk. Resolve people through a reviewed identity step (DQ-06). |

## DQ-02: District labels use abbreviations and legacy names

| | |
| --- | --- |
| **Verified** | 21 labels. 7 are ALL-CAPS, 14 mixed case. `DDP`, `UDP` and `PGS` are abbreviations. 9 of 21 labels differ from the LGD district names (for example `Malda`/`Maldah`, `EAST BURDWAN`/`Purba Bardhaman`, `EAST MIDNAPORE`/`Medinipur East`). |
| **Inference** | The expansion of every label was derived from **block-name overlap** with the LGD snapshot, not from the label text, and agrees for all 21. `DDP` and `UDP` correspond to the two Dinajpur districts. Confidence is high; it is still a mapping the business should sign off. |
| **Unresolved** | Whether the labels follow a company convention that should be preserved. |
| **Action** | Keep the original label as source data. Add a curated alias table to official district codes, confirmed once by the business. |

*Clarification 2026-10-15 (supersedes the Action above).* Do **not** build an alias
table from `DISTRICT` labels to official district names or codes: the labels are
sales-territory labels, so such a table would be a direct join. Keep each label as
source data (`source_district_label`). The relation between a label and actual
geographic units goes only through the reviewed crosswalk (B-26). The "expansion" of
`DDP`, `UDP` and `PGS`, and the claim that every label "agrees" with an LGD district,
are name-overlap diagnostics and are not confirmed meanings. Whether the abbreviations
are company conventions is still unconfirmed.

*Update 2026-10-15 (R4).* What a label contains is now the business's statement: the
blocks listed beneath it are its intended membership. That still says nothing about
which official district, if any, a label corresponds to. Keep each label verbatim.

## DQ-03: District coverage gaps

| | |
| --- | --- |
| **Verified** | No row maps to **Kalimpong** (4 blocks in the LGD snapshot). Its area is not under Darjeeling either (Darjeeling has 10 rows, none Kalimpong-named). No row is labelled **Kolkata**. Only 4 Kolkata Municipal Corporation boroughs (numbers 7, 10, 11, 12) appear, filed under South 24 Parganas. |
| **Inference** | Kolkata has 144 wards in 16 boroughs per a search-result summary of its administrative structure, so the workbook shows only part of it. Either Kolkata and Kalimpong are handled elsewhere, or this sheet is deliberately partial. |
| **Unresolved** | Are Kolkata and Kalimpong in scope, and where is their staffing recorded? (B-20) |
| **Action** | Do not report statewide coverage from this sheet until scope is confirmed. Mark Kalimpong and Kolkata as "not represented", not "unallocated". |

*Clarification 2026-10-15.* "No row maps to Kalimpong", "no row is labelled Kolkata" and
"its area is not under Darjeeling" describe **labels and block-name matches only**. A
sales territory need not follow district lines, so a missing label does **not** prove
that the geography is unrepresented, unstaffed or unallocated. Read "not represented" in
the Action as **data missing or unknown** until a reviewed crosswalk exists. Do not
label either area "confirmed unallocated" without a recorded confirmation. The four
states (assigned, vacant approved position, confirmed unallocated, data missing or
unknown) are set out in [proposed-data-model.md](proposed-data-model.md). The requester
has also stated a preference for mapping all of West Bengal (B-20; a preference, not a
formal approval).

*Update 2026-10-15 (R4).* The workbook's listed blocks are the business's stated
membership. After validation, an official block that no listed row resolves to (the 2023
mirror's four Kalimpong blocks are the known case) is "not listed in the workbook". Its
state is **data missing or unknown**, not unallocated, until evidence and approved rules
say otherwise. This is a statement about what the workbook lists, not about the ground.

## DQ-04: BLOCK column mixes unit types

| | |
| --- | --- |
| **Verified** | Of 358 rows, **334 match a public LGD block name** (exact or spelling variant). The other 24 break down as: **12 entries that read as urban units by name** (4 KMC boroughs, Behala, Howrah, Durgapur, Asansol, Kulti, Bidhannagar, Chandannagar, Siliguri; some labelled "MC", "Municipal Corporation" or "municipality"; classified from the label, not checked against an official list); **6 that pair with an unmatched LGD block in the same district** (see DQ-07); **6 unclear** (see DQ-05 and below). |
| **Inference** | The sheet is mainly a **CD-block list plus a handful of urban units**. The urban entries cover only a small fraction of West Bengal's municipalities and corporations. |
| **Unresolved** | What the labels `Galsi-W` and `Jharkhand-W` denote. `Jharkhand-W` is not a West Bengal block name and may mean an out-of-state area (B-24). Whether `Behala municipality` and `Bidhannagar Municipality` are the right unit types (both may be corporation areas). |
| **Action** | Give each row an explicit unit type (block, borough, ward, municipality, corporation, other) during import. Do not treat the column as all blocks. |

*Clarification 2026-10-15 (R4).* The 12 urban-looking rows are listed by the business
under sales territories like every other row, so they stay recorded as membership lines
and are **not dropped**. Their geographic unit type is held for review, not decided from
the label. A KMC `Borough` is an administrative sub-division of the corporation, not a
ward (see DQ-03), and a label such as `Siliguri` or `Chandanagar` could refer to a
corporation, a municipality, a sub-division or a block. "Explicit unit type" in the
Action means a type set from official data in the reviewed crosswalk. See DQ-15 for the
rows.

## DQ-05: Same block under two districts; DISTRICT may be a sales grouping

| | |
| --- | --- |
| **Verified** | Six block labels appear under two workbook districts: `Sankrail` (Jhargram and Howrah), `Joypur` (Bankura and Purulia), `Ausgram II` (East and West Burdwan), `Jangipara` (Howrah and Hooghly), `Khanakul I` and `Khanakul II` (Howrah and Hooghly). In every pair the **staff listed differ**. For `Sankrail` the LGD snapshot has a block in each district. For `Joypur` it has two differently spelled blocks (`Jaypur` in Bankura, `Jaipur` in Purulia), so these are two real places sharing one label. For the other four (`Ausgram II`, `Jangipara`, `Khanakul I`, `Khanakul II`) the snapshot places the block in **one** district only. Separately, `Binpur I` and `II` sit under West Midnapore while the snapshot places them in Jhargram, and 4 KMC boroughs sit under South 24 Parganas. |
| **Inference** | Either **DISTRICT is an operational/sales grouping** rather than the administrative district, or some rows are errors. A block listed under two districts with different staff suggests overlapping or duplicated responsibility for the same area. |
| **Unresolved** | What DISTRICT means, and whether the overlaps are intended (B-23). |
| **Action** | Store `source_district_label` separately from the official parent district. Flag every row where the two differ. Do not roll up by DISTRICT as if it were the administrative district until B-23 is answered. |

*Clarification 2026-10-15.* The first alternative in the Inference, that DISTRICT is an
operational or sales grouping, is now the requester's **working interpretation** (B-23;
formal sign-off is not recorded). So the six shared labels, the `Binpur` rows and the
four boroughs **may be legitimate**; that is not confirmed either way, and a block that
appears under two sales territories still needs a double-counting rule and crosswalk
review. Read the Action accordingly: a difference between a sales label and the official
parent is **expected information**, to be carried into the crosswalk review, not
automatically an error. The instruction not to roll up by DISTRICT as if it were
administrative stands, and the column must not be joined to official district polygons,
names or codes.

*Clarification 2026-10-15 (R4).* The workbook lists each of the six shared block labels
under two sales territories, and the requester treats the listed rows as intended
membership. **Both listings of each label are kept as recorded membership and each pair
is flagged as a conflict for review. Neither is dropped, merged or resolved silently.**
Two readings stay open and are not chosen here: one official block shared by two
territories (overlap, with a double-counting rule still to be decided), or two places that
share a label. Which one applies is decided by the business and by the unit-level match,
never by assuming the sales-territory label is a district. The staff listed differ in
every pair (Phase 0B). That does not tell which reading is right. See DQ-15 for the 12
rows.

## DQ-06: People identified by name only

| | |
| --- | --- |
| **Verified** | 225 distinct normalised name strings. 3 candidate near-duplicate pairs (similarity 0.88 to 0.92). 2 names appear in more than one raw spelling (case or spacing only). 3 names carry stray whitespace. 5 names are a single word. 6 names appear in more than one role group; 16 appear in more than one district. |
| **Inference** | Some pairs are likely the same person spelled two ways; some repeated names could be different people with the same name. Headcount from this file is **an estimate with an unknown error band**. |
| **Unresolved** | Which of the 3 pairs are the same person; whether a unique employee ID exists in another source (B-25). |
| **Action** | Keep a person-identity review step with confirmed merges recorded. Report headcount as "distinct names, unconfirmed" until then. |

## DQ-07: Block spellings differ from official names

| | |
| --- | --- |
| **Verified** | 39 workbook labels match an LGD block only after spelling-variant pairing (7 very close, 12 close, 20 weaker). Examples of the kind of difference: `Garhbeta` vs `Garbeta`, `Krishnanagar` vs `Krishnagar`, `Mahisadal` vs `Mahishadal`. 6 more rows are left over after pairing, each alongside one unmatched LGD block in the same district (for example `Medinipur Sadar` with `Midnapore`); the pairing is an inference from those leftovers, not a name match. |
| **Inference** | The 39 pairings are probably correct, especially above 0.90 similarity, but the 20 weaker ones need human review. |
| **Unresolved** | Confirmation of all 45 pairings (B-26). |
| **Action** | Match on LGD code after one reviewed crosswalk. Never auto-accept below a confirmed threshold. |

*Clarification 2026-10-15.* "In the same district" above (and in DQ-04) used the
Phase 0B label-to-LGD-district overlap, which is a diagnostic. The six leftover pairings
therefore stay **unconfirmed inferences** and are no stronger than before. They are not
evidence that a block belongs to a sales territory. Membership is for the business to
confirm in the crosswalk.

*Update 2026-10-15 (R4).* Membership is now taken from the workbook rows as written, so
the question for these 45 pairings is only which **official unit** a block label refers
to. That must be matched against a fresh official LGD export **without** using the
sales-territory label as a district, and every candidate recorded. All 45 pairings,
including the 39 spelling variants, stay unconfirmed and are flagged for review (DQ-15).

## DQ-08: Whitespace-only cells, stray characters, mixed dash styles

| | |
| --- | --- |
| **Verified** | 26 cells contain only whitespace (column L: 20, E: 4, G: 1, H: 1) and **look blank but are not**. Leading or trailing spaces: ASM 6, SECONDARY slot 1 (4), DSO slot 1 (2). One block label has a non-breaking space. Dash styles in block labels: en dash 18, tight hyphen 53, spaced hyphen 10, space-plus-numeral 77. |
| **Inference** | Copy-paste origins. A naive "non-empty" test would overcount DSO entries by up to 20. |
| **Unresolved** | None. |
| **Action** | Trim, collapse and map dashes on import. Treat whitespace-only as empty and record that it was. |

## DQ-09: Vacancy is partly explicit, mostly ambiguous

| | |
| --- | --- |
| **Verified** | The marker `Vacant` (always that spelling) appears in 30 cells across 22 rows (PRIMARY 13, SECONDARY 17). No ASM or DSO slot says `Vacant`. Separately, 72 rows have no first PRIMARY and 51 no first SECONDARY with **no marker at all**. There is no position ID, no approval reference. |
| **Inference** | `Vacant` is a deliberate statement; blank is something else, but what is unknown. |
| **Unresolved** | Does blank mean "not applicable here", "not yet filled" or "not recorded"? Does `Vacant` mean an approved open position? (B-12) |
| **Action** | Import `Vacant` as a vacancy candidate and blank as `unspecified`. Never infer a vacancy from blank. |

## DQ-10: Repeated headers and wide layout

| | |
| --- | --- |
| **Verified** | 6 distinct header texts for 14 columns: PRIMARY ×3, SECONDARY ×5, DSO ×3. Up to 3 PRIMARY, 5 SECONDARY and 3 DSO entries per row. No skipped slots within PRIMARY and SECONDARY; 1 row skips within DSO. |
| **Inference** | The numbered slots are interchangeable positions in a list, but order might carry meaning (lead first). |
| **Unresolved** | Whether slot order is meaningful (B-08, B-09). |
| **Action** | Import by column position. Preserve slot order as a field. |

## DQ-11: ASM cell holds two names in 37 rows

| | |
| --- | --- |
| **Verified** | 37 rows (all rows of Alipurduar, Coochbehar, Darjeeling and Jalpaiguri) hold two ASM names separated by `/`. The same two names appear on every such row of that district. |
| **Inference** | Two ASMs share these districts. |
| **Unresolved** | Joint responsibility, area split, or handover? (B-21) |
| **Action** | Split into two ASM assignments per row and record the shared status. Do not count it as one ASM. |

## DQ-12: Rows with no operational staff

| | |
| --- | --- |
| **Verified** | 24 rows have no PRIMARY and no SECONDARY entry (blank, not `Vacant`). 15 rows have an ASM and nothing else. |
| **Inference** | These are candidates for "unallocated" areas, but blank is ambiguous (DQ-09). |
| **Unresolved** | Are they uncovered, or covered through another route (distributor, DSO, ASM directly)? |
| **Action** | Show them as "no operational staff recorded", not as proven gaps, until B-12 is answered. |

*Clarification 2026-10-15.* "Candidates for unallocated areas" means **data missing or
unknown**, not "confirmed unallocated". These rows stay in the data-missing state until
someone with authority confirms otherwise. What evidence and which role may confirm an
area as unallocated is not yet decided (B-12, B-14, B-28).

*Update 2026-10-15 (R4).* These rows are still listed by the business under their sales
territories, so they remain membership lines. A block's listing is not an allocation: with
no PRIMARY or SECONDARY recorded, the state stays data missing or unknown.

## DQ-13: Role meanings, including DSO, are not stated

| | |
| --- | --- |
| **Verified** | The file defines no role term. DSO is not expanded. There is no payroll-type column. |
| **Inference** | Common sales usage may apply (primary: company to distributor; secondary: distributor to retailer), but it is not evidenced. |
| **Unresolved** | Definitions of primary, secondary and DSO; whether DSO staff are on distributor payroll (B-07, B-08). |
| **Action** | Create no responsibility categories until the business defines them. Keep slot group labels as source values. |

## DQ-14: Possible dual roles

| | |
| --- | --- |
| **Verified** | 6 names appear in two role groups (2 ASM/PRIMARY, 1 ASM/SECONDARY, 2 PRIMARY/SECONDARY, 1 DSO/SECONDARY). Every one of these relies on a name match alone. |
| **Inference** | Plausible dual responsibilities, or same-name collisions. |
| **Unresolved** | Which are real (B-09, B-25). |
| **Action** | Model one person with several assignments (see [proposed-data-model.md](proposed-data-model.md)). Count each person once. |

## DQ-15: Crosswalk review queue under the membership clarification (R4)

| | |
| --- | --- |
| **Verified** | Read directly on 2026-10-15 from a copy of the workbook, **columns A and B only** (no staff column was read). The workbook's SHA-256 is unchanged from the baseline in [workbook-inventory.md](workbook-inventory.md). 358 rows and 21 sales-territory labels; the rows of each label are contiguous. 352 distinct block labels after normalising case, spaces and dashes (355 raw). **No block label repeats inside one sales territory.** 6 block labels appear under two territories (12 rows). 12 labels read as urban units (classified from the label only). 18 block labels contain an en dash and 1 (row 343) a non-breaking space. |
| **Inference** | A listing is the business's statement of intended membership (R4). It is not evidence of an official geographic unit. The Phase 0B match results (293 exact, 39 variants, 2 cross-district, 24 unmatched) came from a test constrained by the label-to-LGD-district overlap and a 2023 third-party mirror, so they may change when re-run unconstrained on a fresh official export. |
| **Unresolved** | Whether any official block is genuinely under two sales territories, and the double-counting rule (B-23). What a sales territory is, who owns the list, and whether it has codes (B-23, B-05). Whether a territory holds part of a block (not stated; none assumed). The unit type of the mixed-unit rows (B-24). The match for every row (B-26). |
| **Action** | Keep every row as a membership line with its verbatim labels and source row number. Flag each record below. Record **every** candidate official unit. Resolve none silently, and do not use the sales-territory label as a district to break a tie. Send a suspected workbook error to the business as a change request. No row is dropped. |
| **Update 2026-10-15 (Phase 0E, LGD reports received)** | The unconstrained re-run has been done on two official LGD reports (districts; blocks with covered villages), statewide, without the sales-territory label. Result: 301 rows with an exact-name candidate, 43 with only weaker candidates, 14 with none; 8 of 345 official blocks that no row resolves to. These figures are **not comparable** with the Phase 0B counts above (different source, date, scope and rules). The 9 leftover and unclear rows that Phase 0B did not itemise are still not individually identifiable. The reports' effective date and licence are **unverified**, no urban body or ward list was supplied, and no reviewer has decided anything. See [geographic-crosswalk-review.md](geographic-crosswalk-review.md). The flags and tables below are unchanged. |

Row numbers are the workbook's own row numbers (header = row 1). Labels are as written;
the plain hyphen or space shown may stand for an en dash in the file.

### Flag 1, conflict: a block label listed under more than one sales territory

| Rows | Sales territories | Block label | Note |
| --- | --- | --- | --- |
| 54, 217 | JHARGRAM, Howrah | `Sankrail` | The 2023 mirror has a `Sankrail` block in each of Howrah and Jhargram, and boundary file ADM3 has two features of that name. Also flag 5 |
| 66, 71 | WEST BURDWAN, EAST BURDWAN | `Ausgram-II`, `Ausgram II` | Same label once the dash is normalised. The mirror places the block in one district only (Phase 0B) |
| 110, 127 | BANKURA, PURULIA | `Joypur` | The mirror has two differently spelled blocks (`Jaypur`, `Jaipur`), which suggests two places. Also flag 5 |
| 224, 243 | Howrah, Hooghly | `Jangipara` | The mirror places the block in one district only (Phase 0B) |
| 225, 230 | Howrah, Hooghly | `Khanakul-I`, `Khanakul I` | As above |
| 226, 231 | Howrah, Hooghly | `Khanakul-II`, `Khanakul II` | As above |

The staff listed differ in every pair (Phase 0B). **That does not show which reading is
right** (one official block shared, or two places sharing a label).

### Flag 2, mixed unit: a label that may be an urban ward, borough, municipality or corporation

| Row | Sales territory | Block label | Note |
| --- | --- | --- | --- |
| 206 | South 24 PGS | `Borough 7` | KMC borough. A borough contains several wards and is **not** a ward |
| 204 | South 24 PGS | `Borough 10` | As above |
| 205 | South 24 PGS | `Borough 11` | As above |
| 207 | South 24 PGS | `BOROUGH 12` | As above; upper case differs from the other three |
| 208 | South 24 PGS | `Behala municipality` | Unit type uncertain; may be a corporation area (DQ-04) |
| 223 | Howrah | `Howrah MC` | The same name as the sales territory it sits under (also flag 5) |
| 69 | WEST BURDWAN | `Durgapur Municipal Corporation` | Sits beside `Faridpur Durgapur` (row 58; flag 5) |
| 64 | WEST BURDWAN | `Asansol` | Appears as a feature in the ADM3 boundary file (Phase 0C) |
| 65 | WEST BURDWAN | `Kulti` | Unit type not checked against an official list |
| 156 | North 24 PGS | `Bidhannagar Municipality` | Unit type uncertain; may be a corporation area (DQ-04) |
| 245 | Hooghly | `Chandanagar` | Spelling differs from the usual `Chandannagar`; unit type not checked |
| 318 | Darjeeling | `Siliguri` | Could be a corporation, a sub-division or a block |

These are the 12 urban-looking rows of DQ-04, identified from the label and not checked
against an official list.

### Flag 3, unmatched or unclear

| Row | Sales territory | Block label | Note |
| --- | --- | --- | --- |
| 68 | WEST BURDWAN | `Jharkhand-W` | Not a West Bengal block name. **May be outside West Bengal** (B-24) |
| 67 | WEST BURDWAN | `Galsi-W` | Meaning of the `-W` suffix is unknown; it may mark part of a block or a different unit. Not inferred. Also flag 5 |
| 29 | WEST MIDNAPORE | `Medinipur Sadar` | The one named example of a leftover pairing (with the mirror's `Midnapore`; DQ-07) |

The 24 unmatched rows of Phase 0B are these plus the 12 mixed-unit rows above and the
other leftover and unclear rows. **Phase 0B did not itemise the other five leftover
pairings or the other four unclear rows**, so they cannot be listed here and must be
re-derived when the name test is re-run on a fresh official export.

### Flag 4, spelling variant, and a block the mirror places in another LGD district

| Rows | Sales territory | Block label | Note |
| --- | --- | --- | --- |
| 48, 49 | WEST MIDNAPORE | `Binpur-I`, `Binpur-II` | The mirror places both blocks in Jhargram district. Under R4 this is not by itself a conflict, because the label is a sales territory. Record the official parent from LGD |
| (not itemised) | various | 39 labels | 7 very close, 12 close, 20 weaker spelling pairings (DQ-07). All unconfirmed |

### Flag 5, ambiguous name: a spelling that could refer to more than one unit

| Rows | Block label | Why ambiguous |
| --- | --- | --- |
| 54, 217 | `Sankrail` | Two official blocks and two boundary features carry the name |
| 110, 127 | `Joypur` | Two differently spelled official blocks (`Jaypur`, `Jaipur`) |
| 58, 69 | `Faridpur Durgapur`, `Durgapur Municipal Corporation` | Both are listed under WEST BURDWAN. One reads as a block name and one as a corporation. They are not assumed to be the same unit, or different ones |
| 67, 75 | `Galsi-W` (WEST BURDWAN), `Galsi II` (EAST BURDWAN) | Related names under two territories. The relation is unknown |
| 53 | `Jhargram` (under JHARGRAM) | The block label, the sales-territory label and an official district name are the same word |
| 223 | `Howrah MC` (under Howrah) | The corporation and the sales-territory label share a name |

The full set of ambiguous names is known only after the unconstrained re-run, because
ambiguity depends on how many official units match a spelling across the whole state.

### The other direction: official blocks not listed in the workbook

Phase 0B found 11 of 345 blocks in the 2023 mirror with no workbook counterpart: 4 in
Kalimpong and 7 elsewhere, of which 6 line up with a leftover workbook row (GEO-08). After
validation, any official block that no listed row resolves to is "not listed in the
workbook". Its state is **data missing or unknown**, never unallocated. The set must be
re-derived against the fresh official export.

### Source text to preserve

18 block labels contain an en dash, and the label at row 343 has a trailing non-breaking
space. Keep the verbatim text in the source record. Any normalised form is a derived field
and never replaces it.

## Import limitations summary

- No formulas, so no stale-cache risk. All cells are text, so no date or number parsing is possible or needed.
- Imports must be positional, unpivoted and keyed by generated IDs plus a stored source row number.
- Official-code joins need a reviewed crosswalk. LGD-code assignment cannot be automatic.
- *(R4, 2026-10-15.)* An import takes the sales-territory-to-block membership from the
  rows as written and carries every row, with verbatim labels and the source row number,
  whatever its review status. Geographic identity is a separate, reviewed step (DQ-15).
- The workbook has no salary or contact columns. The import allow-list (B-03) can therefore exclude everything except places, role slots and names (names handled under B-25).
