# Open business decisions

Audit date: 2026-10-15. These are questions the evidence could not answer.
Nothing here is assumed. The "provisional default" column is a suggestion for
the decision-maker to accept or replace, not a decision already made.

IDs are cited from the other documents in this folder. Owner and decision-date
columns are left for the business to complete.

## Status since the workbook audit (2026-10-15)

| ID | Status |
| --- | --- |
| B-01 | **Answered.** The workbook was supplied as `data-source/AREA MAPPING.xlsx`. |
| B-02 | **Partly answered.** File hash recorded; in-file last-modified date is 2026-10-13. Business to confirm it is the final version. (The requester's 2026-10-15 statement that this is the company's official sales-team mapping workbook is recorded under B-23, and R4 treats its listed rows as the authoritative business starting point; neither confirms the version or an as-of date. SHA-256 re-checked read-only on 2026-10-15: unchanged.) |
| B-03 | **Narrowed.** The workbook has only places, role slots and names (no codes, pay or contact columns). Confirm names may be imported (see B-25). |
| B-04 | **Answered in the audit instruction** (salary excluded) and **verified**: the workbook has no salary column. |
| B-05 to B-19 | Still open, with workbook evidence added below. |
| B-20 to B-26 | **New** from the workbook audit (section F). |
| **B-23** | **Requester-confirmed evidence, 2026-10-15, adopted as the working interpretation. Not an approval.** The requester confirmed (1) `AREA MAPPING.xlsx` is the company's official sales-team mapping workbook, and (2) its `DISTRICT` column represents **sales territories or groupings, not necessarily government administrative districts**. This is a requester statement only. **No approval by a Head of Sales, the workbook owner, the sponsor or another formal stakeholder is recorded**; formal approval by the designated stakeholder is **outstanding**. The `DISTRICT` column **must not be directly joined to official administrative district polygons, names or codes**. A **reviewed crosswalk** from sales-territory labels to actual geographic units is **still required**. **No block or ward membership of any sales territory is inferred** *(read with the "B-23 / B-26 (R4)" row below: membership is taken from the workbook rows as written, and nothing beyond them is inferred)*. Statement (1) does not say the file is final or give an as-of date, so B-02 stays partly open. See section F and [phase-0c-decision-brief.md](phase-0c-decision-brief.md), section 2. |
| **B-23 / B-26 (R4)** | **Requester-confirmed evidence, 2026-10-15 (not an approval), refining the B-23 row above:** the blocks listed beneath each sales-territory label in `AREA MAPPING.xlsx` are the **intended membership** of that sales territory, and may be used as the **authoritative business starting point** for the sales-territory-to-geographic-unit crosswalk. This is **not** approval by the Head of Sales, the sponsor or another stakeholder, and none is recorded. The `DISTRICT` labels are still **not** joined to official district names, codes or polygons. Geographic identifiers and boundaries are **matched and validated independently**. Unmatched, ambiguous, mixed-unit and conflicting records are **flagged for review, never resolved silently**. The workbook rows and labels are preserved as source evidence; nothing is inferred beyond them and no row is dropped. **Formal B-23 approval and B-26 crosswalk sign-off remain outstanding.** See the "R4" rows of section F and section G, [phase-0c-decision-brief.md](phase-0c-decision-brief.md) section 2, and DQ-15 in [data-quality-findings.md](data-quality-findings.md). |
| **B-20 / B-10** | **Requester preference, 2026-10-15 (not an approval):** the map should cover **all of West Bengal**, including administrative areas the workbook does not represent (the requester's "Option A"). Formal approval of scope and of the district list is **outstanding**. The KPI denominator is not decided. See section G and [phase-0c-decision-brief.md](phase-0c-decision-brief.md), section 3. |
| **B-12 / B-28** | **Requester preference, 2026-10-15 (not an approval):** four allocation states stay distinct (Assigned, Vacant, Unallocated, Data Missing / Unknown); missing data is never converted into Vacant or Unallocated; coverage KPIs disclose denominator, data completeness and unknown areas; no definitive unallocated percentage before the coverage rules and data are approved. Formal approval of B-12 and of B-28 (defined in the decision brief, not yet a row in this register) is **outstanding**. See section G and the decision brief, section 4. |
| Phase 0D | **No formal decision recorded** (the B-23, B-23 / B-26 (R4), B-20 / B-10 and B-12 / B-28 rows above are requester inputs, not formal approvals). Approval sheets for B-23, B-20/B-10, B-07/B-08, B-12, B-25 and B-26 are in [phase-0d-stakeholder-approval.md](phase-0d-stakeholder-approval.md). B-11 evidence changed (below). Geographic and privacy findings: [phase-0d-geographic-source-gate.md](phase-0d-geographic-source-gate.md), [phase-0d-privacy-and-deployment-assessment.md](phase-0d-privacy-and-deployment-assessment.md). |

## A. Source and scope

| ID | Question | Why it matters | Provisional default | Owner / date |
| --- | --- | --- | --- | --- |
| **B-01** | Where is the intended original workbook? | Needed before audit. | **Answered** (see status). | |
| **B-02** | Is `AREA MAPPING.xlsx` (modified 2026-10-13) the authoritative and final version, and as of what date does it describe staffing? | Re-imports and change tracking need a baseline. The file has no as-of date field. | Treat the file as the baseline; record the hash. | |
| **B-03** | Which fields may be imported? The file holds district, block, ASM and staff names in slots; nothing else. | The import must be an allow-list so excluded data never enters the system. | Import places and role slots. Person names under B-25. | |
| **B-04** | Confirm salary and compensation are out of scope for all phases. | [architecture.md](../architecture.md) excludes it. | Confirmed out of scope. The workbook contains none. | |

## B. Territory and geography definitions

| ID | Question | Why it matters | Provisional default | Owner / date |
| --- | --- | --- | --- | --- |
| **B-05** | What is a "territory" in business terms: a named existing object with its own code, or just a district (or block, ward, PIN code, beat) owned by someone? | Decides whether Territory is imported or constructed, and whether PIN codes are a unit (GEO-09). **Workbook evidence:** no territory code; one row per block or urban unit with staff slots, so each row looks like a territory. | Treat each workbook row as a territory candidate (block or urban unit). Business to confirm. *(Update 2026-10-15: may need revisiting. If the sales territory is the `DISTRICT` label, a territory may be a grouping of rows rather than one row. See B-23. Not decided.)* *(Update 2026-10-15, R4: the requester calls the `DISTRICT` value a sales-territory label and the blocks beneath it that territory's intended membership. The working reading is therefore **a sales territory = a label, with its listed rows as membership lines**, which supersedes "each row is a territory" as the working reading. Not a decision: no territory definition or code was supplied, and formal approval is outstanding. The row-level membership lines are kept as written whichever grain is chosen.)* | |
| **B-06** | For each area, what is the **building block** below which territories are not split: district, CD block, ward, whole municipality? | Defines what "unallocated" means and which boundary data is needed (GEO-04). | Corporation wards → ward; municipalities → whole municipality; rural → CD block. *(Update 2026-10-15: "unallocated" here now means "confirmed unallocated" only, never inferred from missing data; see the "B-12 / B-28" row in the status table and section G.)* | |
| **B-10** | Which district list does the workbook follow: the 23 notified districts, an older list, or a planned future list? When do proposed districts (Basirhat, Sundarban, Jangipur, Arambagh, Kolkata reorganisation) become relevant? | Wrong list breaks the join and the totals (GEO-02). | Use the 23 notified districts until a gazette notification exists. *(Update 2026-10-15: the workbook's `DISTRICT` labels are, per the requester, sales territories or groupings rather than an administrative district list, so this question now concerns only the official reference list. See B-23.)* *(Update 2026-10-15, requester preference: the map should cover all of West Bengal; the district list itself was not addressed. Not an approval. See section G.)* | |
| **B-11** | Which ward geography does Kolkata and Howrah allocation follow: the current 144 (Kolkata) and 50 (Howrah) wards, or the new 209 and 68? (Howrah's 66 was an earlier February 2026 bill; whether it was superseded is unconfirmed.) | Wards are changing and no ward polygons for either geography were found (GEO-03, Phase 0C update). **Phase 0D update:** the new ward schedules (209 Kolkata, 68 Howrah) were notified on 11 September 2026 as written descriptions, so 144 and 50 are superseded. Still no polygons. | Use the current wards, and record succession when the new wards are notified. **Phase 0D:** the 209 and 68 wards are now the notified vintage; hold the corporations as whole units until boundary files are obtained. *(Update 2026-10-15, requester preference: a map of all of West Bengal includes Kolkata and Howrah, so ward vintage matters for the map's extent. Not an approval. See section G.)* | |
| **B-19** | How deep must Phase 1 go geographically: district only, or block/ward as well? | District polygons are obtainable now. Block and ward polygons are not confirmed (GEO-06). **Workbook evidence:** allocation is recorded per block (334 of 358 rows are LGD-matching blocks), so a district-only map would hide it. | Block-level allocation in tabular form first; a block-level map only after G-01 and G-02 are resolved. District polygons for roll-up only. *(Update 2026-10-15: official districts only, reached through the reviewed crosswalk. Never by joining the workbook's `DISTRICT` label to a district polygon. See B-23.)* *(Update 2026-10-15, requester preference: all of West Bengal concerns the map's extent, not its depth; B-19 stays open. See section G.)* | |

## C. People, positions and responsibilities

| ID | Question | Why it matters | Provisional default | Owner / date |
| --- | --- | --- | --- | --- |
| **B-07** | Are distributor-payroll personnel part of company headcount, a separate headcount, or outside the platform? | Changes every headcount KPI. **Workbook evidence:** "DSO" is not expanded and no payroll-type column exists, so distributor-payroll staff cannot be identified from the file (DQ-13). | Store them, flag them, and report them separately from company staff once the business says which role they are. | |
| **B-08** | What are the formal definitions of primary sales and secondary sales responsibilities, and of each role level (representative, ASM, others)? | Seeds the responsibility categories and the reporting tree. Column meanings must not be guessed from headers. | None. Business to define. | |
| **B-09** | Can one territory have several people for the same responsibility? Can one person hold several territories and responsibilities, and how should such dual roles show on the map and in headcount? | Fixes assignment cardinality and the headcount rule. | Allow both. Count each person once in headcount, and each assignment once in coverage counts. | |
| **B-12** | How are vacant approved positions evidenced: a position ID, a sanction list, a blank row, a "vacant" marker? Who approves a position? | Needed to separate a vacancy from missing data. **Workbook evidence:** `Vacant` is written in 30 slots (22 rows); other slots are blank with no marker; there is no position ID or approval reference (DQ-09). | Treat `Vacant` as a vacancy candidate and blank as `unspecified`. Never infer a vacancy from blank. *(Update 2026-10-15, requester preference: a blank or whitespace-only cell, an unmatched place name or an absent employee record is never classified Vacant or Unallocated automatically; its state is Data Missing / Unknown. The text `Vacant` stays a vacancy candidate until this decision is approved. See section G.)* | |

## D. Allocation status, history and evidence

| ID | Question | Why it matters | Provisional default | Owner / date |
| --- | --- | --- | --- | --- |
| **B-13** | Which allocation states are needed (planned, active, ended, other), how far back must history go, and what audit detail is required? | Shapes effective dating and the change log. | Planned, active, ended; full history kept; every change logged with actor and reason. | |
| **B-14** | What counts as **verified ground coverage** and who may verify it? | Prevents an assignment from being read as proof of service (GEO-05). | Leave empty until evidence rules are set. No inference from assignments. | |

## E. Platform, access and compliance

| ID | Question | Why it matters | Provisional default | Owner / date |
| --- | --- | --- | --- | --- |
| **B-15** | Who may view and who may edit allocations, and may users see data outside their own region or reporting line? | Gates authentication design. Raised in [architecture.md](../architecture.md), item 6. | Not set. | |
| **B-16** | Is a hosted database such as Supabase acceptable given employee data, residency and access-control needs? | Raised in architecture.md, item 4. Not decided in this phase. | Not set. | |
| **B-17** | How should Power BI relate to the app: embedded, linked, or separate, and which system is the source of truth for territory data? | Raised in architecture.md, item 5. | Not set. | |
| **B-18** | Who approves use of boundary data under ODbL and Government licences, and who confirms external-boundary depiction rules for maps (G-06, G-07)? | Legal exposure for any shared or embedded map. | Legal/compliance owner to confirm before production use. | |

## F. Raised by the workbook audit

| ID | Question | Evidence | Why it matters | Provisional default | Owner / date |
| --- | --- | --- | --- | --- | --- |
| **B-20** | Are **Kalimpong** and **Kolkata** in scope? If so, where is their staffing recorded? | No Kalimpong rows; no Kolkata label; only 4 KMC boroughs, filed under South 24 Parganas (DQ-03) | Statewide coverage figures would be wrong; "absent" could be misread as "unallocated". | Treat both as "not represented" until confirmed. *(Update 2026-10-15: a missing `DISTRICT` label no longer shows missing geography, because a sales territory need not follow district lines. Whether Kalimpong or Kolkata blocks or wards appear under other labels is unknown until the crosswalk exists. The default is to be revisited, not applied as fact. See B-23.)* *(Requester preference 2026-10-15: map all of West Bengal, the requester's "Option A". It matches scope choice 2 as to the map's extent only. A preference, not formal approval; the KPI denominator is not decided. See the "B-20 / B-10" row in the status table and section G.)* *(Update 2026-10-15, R4: once the crosswalk is validated, official units that no listed workbook row resolves to are "not listed in the workbook". Their state is Data Missing / Unknown, not Unallocated. This is evidence about what the workbook lists, not a scope decision.)* | |
| **B-21** | What does `A / B` in the ASM cell mean: joint responsibility, area split, or handover? | 37 rows in 4 districts (DQ-11) | Decides how ASM assignments and counts are stored. | Two ASM assignments marked shared. | |
| **B-22** | What stable key identifies a row, a position and a territory for re-import? | The sheet has no key (DQ-01) | Without one, a changed sheet cannot be reconciled with earlier imports. | Generated internal ID plus stored source row and file hash. *(Update 2026-10-15: a natural key of label plus block label would now rest on a sales-territory label, which can change if the business redraws territories. See B-23.)* *(Update 2026-10-15, R4: a membership line is source evidence. Identify it by generated ID plus source row number, verbatim labels and file hash. A key from the labels alone is also not unique: six block labels occur under two territories.)* | |
| **B-23** | Is DISTRICT the administrative district or an operational sales grouping? | Six block labels under two districts; `Binpur` and Kolkata boroughs under districts that differ from LGD (DQ-05) | Decides whether district roll-ups are valid. | Keep the workbook label separate from the official parent; do not roll up on it yet. **Working interpretation (project requester, 2026-10-15):** DISTRICT is a sales territory or grouping, not necessarily an administrative district. Never join it directly to official district polygons, names or codes; a reviewed crosswalk to geographic units is still required. **R4 (2026-10-15):** the blocks listed under each label are that territory's intended membership and the starting input for the crosswalk; infer no membership beyond the rows as written. The six shared labels, the `Binpur` rows and the Kolkata boroughs may be legitimate under this reading, which is unconfirmed either way; each is flagged for review and none is resolved silently. | **Owner and decision date not recorded.** Requester-confirmed evidence only (2026-10-15); formal approval is outstanding. Still to supply: which sales territories (if any) coincide with a government district; who owns the list of sales territories and whether it has codes; the double-counting rule for a block listed under two territories. |
| **B-24** | What are the rows `Galsi-W`, `Jharkhand-W`, `Medinipur Sadar` and each urban entry (boroughs, `Howrah MC`, `Behala municipality`, `Asansol`, `Kulti`, `Siliguri` and similar)? Is `Jharkhand-W` outside West Bengal? | DQ-04 | These rows may not be administrative blocks, and one may not be in West Bengal. | Give each an explicit unit type; hold unclear rows in review. *(Update 2026-10-15, R4: each row stays recorded as a membership line under the territory the workbook lists it under. Only its geographic unit is held. No row is dropped, and a `Borough` is not treated as a ward.)* | |
| **B-25** | Is there an HR or distributor identifier for each person elsewhere, and may names be imported as the identity basis? | Names only; 3 near-duplicate pairs; 6 cross-role names (DQ-06, DQ-14) | Headcount and dual-role analysis depend on identity. | Import names, flag identity "unconfirmed", review merges. | |
| **B-26** | Who confirms the 45 block-name pairings (39 spelling variants and 6 same-district leftovers) and the 12 aliased-or-unclear rows? | GEO-08, DQ-07 | Needed for a reliable crosswalk to official codes. | One business reviewer signs off a crosswalk file. *(Update 2026-10-15: the crosswalk is still required and now maps sales-territory labels, and the block labels under them, to actual geographic units, using information the business supplies. The reviewer must not infer sales-territory membership from official boundaries or name similarity. See B-23.)* *(Update 2026-10-15, R4: the membership input is the workbook rows as written. The reviewer validates geography, records every candidate official unit without using the sales-territory label as a district, flags unmatched, ambiguous, mixed-unit and conflicting records, and does not add, remove or move a membership line. Sign-off is outstanding.)* | |

## G. Requester inputs recorded 2026-10-15

The project requester gave four inputs on 2026-10-15. The documents do not name the
requester or say whether they hold an approver role. Each input is recorded as the
requester's input. **None is a formal approval, every formal approval field stays open,
and the decision log has no entry for any of them.** Full wording and effects are in
[phase-0c-decision-brief.md](phase-0c-decision-brief.md), sections 1.5 to 4.

| Ref | Input | Label | Entries touched | Formal approval (outstanding) |
| --- | --- | --- | --- | --- |
| R1 | The map should cover **all of West Bengal**, including administrative areas the workbook does not represent (the requester's "Option A") | Requester preference | B-20, B-10; notes on B-11, B-19 | B-20 and B-10 (scope, district list). Also open and not settled by R1: B-19, B-27, B-18 |
| R2 | Four allocation states stay distinct; missing data is never converted into Vacant or Unallocated; coverage KPIs disclose denominator, data completeness and unknown areas; no definitive unallocated percentage before approval | Requester preference | B-12, B-28; note on B-06 | B-12; B-28 (no decision sheet and no assigned approver yet) |
| R3 | `AREA MAPPING.xlsx` is the company's official sales-team mapping workbook; its `DISTRICT` column holds sales territories or groupings, not necessarily administrative districts | Requester-confirmed evidence | B-23, B-26, B-05, B-02 | B-23 and B-26. B-05 and B-02 (final version, as-of date) are touched but not settled |
| R4 | The blocks listed beneath each sales-territory label are the **intended membership** of that sales territory; the mappings may be used as the **authoritative business starting point** for the crosswalk. Refines R3 | Requester-confirmed evidence | B-23, B-26, B-05, B-22, B-24, B-20; note on B-28 | B-23 and B-26 (crosswalk sign-off). B-05, B-24 and B-02 are touched but not settled |

"Option A" is the requester's label. This register numbers scope choices 1 to 3 and
defines no "Option A". The requester's description matches B-20 choice 2 (statewide) as
to the extent of the map; the KPI denominator is a separate, undecided question.

### The four allocation states (R2)

| State | Requester's definition |
| --- | --- |
| **Assigned** | A valid, reviewed assignment exists. |
| **Vacant** | An approved position is known to be vacant. |
| **Unallocated** | Evidence and approved business rules establish that no assignment covers the area. |
| **Data Missing / Unknown** | Allocation evidence is absent, incomplete, ambiguous or not yet verified. |

- Missing data, an empty Excel cell, an unmatched place name or an absent employee record
  is **never automatically classified as Unallocated or Vacant**.
- The map covers all of West Bengal, but every coverage KPI discloses its denominator,
  its data completeness and its unknown areas.
- No definitive unallocated percentage is calculated until the coverage rules and the
  required data have been approved.
- These states are separate from the assignment lifecycle states in B-13 and from the
  scope status in B-20.

### What R4 treats as authoritative, and what it does not

| Authoritative business starting point | Still needs independent validation or a decision |
| --- | --- |
| For each workbook row as written, the block label is intended to belong to the sales territory named in the `DISTRICT` column (358 rows, 21 territories) | The official geographic unit each block label refers to: LGD code, unit type, official parent |
| The rows as the starting input for the crosswalk | Boundaries and geometry (none in the workbook; gate 2b) |
| | What a sales territory is, who owns the list, whether it has codes (B-23, B-05) |
| | Whether a territory holds part of a block (not stated; none assumed) |
| | Every allocation state (below) |
| | Formal approval, and the file's version or as-of date |

**Records to review, never to resolve silently** (full list with workbook row numbers in
DQ-15 of [data-quality-findings.md](data-quality-findings.md)): 6 block labels listed under
two sales territories (12 rows); 12 labels that may be an urban ward, borough,
municipality or corporation; the 24 rows that did not match in the Phase 0B name test
(including `Galsi-W` and `Jharkhand-W`); 39 spelling variants plus `Binpur-I` and
`Binpur-II`; and spellings that could refer to more than one unit (for example
`Sankrail`). Phase 0B's counts came from a label-constrained test and must be re-run
without that constraint on a fresh official LGD export. *(Update 2026-10-15: re-run on the
LGD district and block reports; candidate sets are in
[geographic-crosswalk-review.md](geographic-crosswalk-review.md). Still open: reviewer
decisions, urban body and ward lists, the reports' effective date and their licence.)*

**Allocation states stay separate.** A block's listing under a sales territory does not
make it Assigned. A listed block with blank staff slots is Data Missing / Unknown. An
official block that no listed row resolves to is "not listed in the workbook" and is Data
Missing / Unknown. Neither is Vacant or Unallocated without evidence and approved rules.

### What these inputs do not do

No application code, map, database, migration, Supabase or Power BI work was done. The
original workbook was not edited or reprocessed; its SHA-256 was re-checked read-only on
2026-10-15 and is unchanged, and only the two place columns were re-read for R4. No
relationship between a sales territory and any administrative unit was invented.
Territory membership is taken only from the workbook rows as written (R4) and is not
inferred beyond them.

## Suggested order for the next conversation

1. **B-20, B-23, B-24**: settle scope and what DISTRICT and the unusual rows
   mean. They shape every roll-up. (B-23: working interpretation recorded
   2026-10-15 by the project requester; formal approval outstanding.)
2. **B-05, B-06, B-10**: confirm that a block-level row is the territory grain,
   and on which district list the business reports.
3. **B-07, B-08, B-09, B-12, B-21**: define primary, secondary, DSO, vacancy
   and the two-ASM cells.
4. **B-22, B-25, B-26**: agree keys, identity handling and the crosswalk review.
5. **B-02, B-11, B-13 to B-19**: needed before design is finalised.
