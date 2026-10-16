# Phase 0D: Stakeholder approval package

**Status: FOR STAKEHOLDER DECISION. No decision has been made or recorded. Every
"Decision record" box below is blank on purpose.**

**Requester input, 2026-10-15.** The project requester gave four inputs (section 3A).
They are a **requester preference** (map scope; allocation states) and
**requester-confirmed evidence** (the meaning of the workbook's `DISTRICT` column, and
that the blocks listed under each sales-territory label are that territory's intended
membership). They are **not approvals**, and they complete no Decision record. All six
records stay blank. Formal approval of B-23 and sign-off of the B-26 crosswalk are
outstanding.

Prepared 2026-10-15 from [phase-0c-decision-brief.md](phase-0c-decision-brief.md) and
[open-business-decisions.md](open-business-decisions.md). Where this package adds
evidence found in Phase 0D, it says so and points to the full write-up in
[phase-0d-geographic-source-gate.md](phase-0d-geographic-source-gate.md) or
[phase-0d-privacy-and-deployment-assessment.md](phase-0d-privacy-and-deployment-assessment.md).

This package contains no employee names, codes or pay data. Workbook figures are
counts from the Phase 0B audit.

---

## 1. How to use this package

### 1.1 What counts as an approval

A decision is **approved** only when the Decision record for it contains all of:
the option chosen, any conditions, the approver's **name** and **role**, the date,
and a link to written evidence (an email, signed note or meeting minute).

- A recommendation in this package is a proposal. It is not a decision.
- Silence, a verbal "fine", or "TBD" is not approval.
- A **requester preference** or **requester-confirmed evidence** (marked as such below)
  is not approval either, unless the named approver completes the Decision record.
- An approver may choose an option that is not recommended, or write a new one.
- If an approver does not own the decision, they should name who does. The role
  suggestions below are guesses; the project documents name no individuals.
- Nothing in the project may be built on a decision until its record is complete.

### 1.2 Who approves (sponsor to complete)

| Role | Named person (blank) |
| --- | --- |
| Sponsor | |
| Head of Sales (or workbook owner) | |
| HR head | |
| Legal or data-protection owner | |
| Sales-operations reviewer (crosswalk) | |
| Data owner for the workbook | |

---

## 2. The six decisions at a glance

| # | Decision | What it blocks | Interim default (applies only until you decide) | Suggested approver (role) | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | **B-23** DISTRICT: administrative district or sales grouping | Schema (whether a sales-grouping entity exists); every district roll-up; crosswalk sign-off | Unanswered posture: keep the sheet's label and the official parent apart; no district roll-up | Head of Sales or workbook owner | **Open** (requester-confirmed evidence recorded, including R4 on membership; not an approval) |
| 2 | **B-20 / B-10** Geographic scope and district list | Denominators of every coverage figure; which LGD exports are needed | Scope = units the workbook represents; 23 notified districts as reference list | Head of Sales (scope); data or GIS lead (list vintage) | **Open** (requester preference recorded; not an approval) |
| 3 | **B-07 / B-08** Meaning of Primary, Secondary, DSO; is DSO on distributor payroll | Responsibility categories; every headcount or coverage figure by role | No categories; the slot group is kept as an unlabelled source value | Head of Sales; HR head; distributor operations | **Open** |
| 4 | **B-12** Meaning of blank cells and of `Vacant` | Vacancy and white-space figures; creation of positions | `Vacant` = vacancy candidate; blank = unspecified; never infer a vacancy | HR or position owner; sales operations | **Open** (requester preference recorded; not an approval) |
| 5 | **B-25** Employee identity | Person identifier column; import allow-list; headcount | Names only, identity "unconfirmed" (needs legal and HR sign-off first); no headcount claimed | HR head with legal or data-protection owner | **Open** |
| 6 | **B-26** Crosswalk review and sign-off | District-to-block table; boundary joins; all KPIs | Drafting may start; no sign-off | Named sales-operations reviewer; data owner accepts | **Open** (requester-confirmed evidence affects the file's scope and, through R4, supplies its membership input; not an approval) |

The requester's allocation-state and KPI rule (section 3A, R2) also bears on **B-28**
(what the allocation and white-space KPIs mean). B-28 is not one of the six decisions
and has no sheet in this package, so its formal approval is open and no approver is
assigned. A sheet can be added when the sponsor schedules it.

---

## 3. New evidence since Phase 0C (affects the sheets below)

1. **Kolkata and Howrah wards are now notified, as text.** The West Bengal
   Urban Development and Municipal Affairs department lists two notifications dated
   11 September 2026 (Nos. 1728 and 1727) that replace Schedule II with **209** Kolkata
   wards and **68** Howrah wards. Both were read in the Kolkata Gazette. They describe
   each ward in words (roads, lanes, mouza limits). They are not map files.
   The earlier "Howrah 50, 66 or 68" question is answered for the notified outcome: **68**.
2. **The district list has not changed.** No notification of the five proposed
   districts was found. The Census office states that administrative units are
   **frozen from 1 January 2026 to 31 March 2027**.
3. **Survey of India lists a free state-level administrative-boundary file** (state
   to sub-district, 1:1,000,000 scale, single-user terms). It was not downloaded.
   Whether its sub-district level equals West Bengal blocks is unknown.
4. **The Digital Personal Data Protection Act's main duties are not yet in force.**
   The government notice (G.S.R. 843(E)) starts them 18 months after 13 November
   2025, about **13 May 2027**. An application going live after that date must meet
   them. This matters most for decision 5. See the privacy assessment. It does not
   establish that any approach is lawful.

---

## 3A. Requester input recorded 2026-10-15

The project requester gave four inputs on 2026-10-15. Section 1.2 names no one, so the
requester is not matched to any role there. **Each input is recorded as the requester's
input, not as approval** by the Head of Sales, the sponsor, the workbook owner or any
other designated approver. The Decision records in section 4 and the log in Appendix B
stay blank. No approver name, role, date or evidence link has been entered or invented.

| # | Input | Label | Sheet | Source of the record |
| --- | --- | --- | --- | --- |
| R1 | The map should cover **all of West Bengal**, including administrative areas the workbook does not represent (the requester's "Option A"; this package numbers scope options 1 to 3 and defines no "Option A") | Requester preference | 2 | Message from the project requester, 2026-10-15; no separate written record attached |
| R2 | Four allocation states stay distinct; missing data is never converted into Vacant or Unallocated; coverage KPIs disclose denominator, completeness and unknown areas; no definitive unallocated percentage before approval | Requester preference | 4, and B-28 (no sheet) | Same |
| R3 | `AREA MAPPING.xlsx` is the company's official sales-team mapping workbook; its `DISTRICT` column holds company sales territories or groupings, not necessarily government administrative districts | Requester-confirmed evidence | 1 and 6 | Same |
| R4 | The blocks listed beneath each sales-territory label in the workbook are the **intended membership** of that sales territory. The mappings may be used as the **authoritative business starting point** for the crosswalk. Refines R3 | Requester-confirmed evidence | 1 and 6 (also touches B-05, B-22, B-24 and B-20, which have no sheet of their own except B-20 in sheet 2) | Same. Not formal approval by the Head of Sales, the sponsor or any other stakeholder, and no separate evidence of one exists |

**The four allocation states (R2).** Same wording as
[phase-0c-decision-brief.md](phase-0c-decision-brief.md), section 4 (B-28), which holds
the full record.

| State | Requester's definition |
| --- | --- |
| **Assigned** | A valid, reviewed assignment exists. |
| **Vacant** | An approved position is known to be vacant. |
| **Unallocated** | Evidence and approved business rules establish that no assignment covers the area. |
| **Data Missing / Unknown** | Allocation evidence is absent, incomplete, ambiguous or not yet verified. |

Missing data, an empty Excel cell, an unmatched place name or an absent employee record
is **never automatically classified as Unallocated or Vacant.** Coverage KPIs disclose
their denominator, data completeness and unknown areas, and **no definitive unallocated
percentage is calculated until the coverage rules and required data are approved.**

**R4 and these states.** Membership is not allocation. A block's listing under a sales
territory does not make it **Assigned**; a listed block with blank staff slots is **Data
Missing / Unknown**; an official block that no listed row resolves to is "not listed in
the workbook" and is **Data Missing / Unknown**, not **Unallocated**. A block listed under
two territories keeps both memberships, and its state is not decided by choosing one.

---

## 4. Decision sheets

### Decision 1: B-23. Is DISTRICT an administrative district or a sales grouping?

**Question for the owner (one sentence).** *"Can a district in this sheet differ from
the government district?"*

**Why it matters.** It decides whether district roll-ups, district polygons and any
statewide figure are valid, and whether the data model needs a sales-grouping entity.

**Evidence** (workbook audit, Phase 0B; counts only):

- All 21 labels map to a government district by block-name overlap with a **2023
  third-party mirror** of the Local Government Directory (LGD). The mirror is not an
  authoritative source. Nine labels are spelled differently from LGD
  (for example `Malda` / `Maldah`; `DDP`, `UDP`, `PGS` are abbreviations).
- For 12 of 21 labels the row count equals the mirror's block count. For 9 it differs:

  | Workbook label | Rows | Mirror blocks |
  | --- | ---: | ---: |
  | Darjeeling | 10 | 9 |
  | EAST BURDWAN | 22 | 23 |
  | Hooghly | 19 | 18 |
  | Howrah | 18 | 14 |
  | JHARGRAM | 6 | 8 |
  | North 24 PGS | 23 | 22 |
  | South 24 PGS | 34 | 29 |
  | WEST BURDWAN | 14 | 8 |
  | WEST MIDNAPORE | 23 | 21 |

  A difference does not prove an error: rows also include urban units and the mirror
  is non-authoritative.
- Six block labels appear under two workbook districts with different staff:
  `Sankrail`, `Joypur`, `Ausgram II`, `Jangipara`, `Khanakul I`, `Khanakul II`.
  Two are two real places sharing a label; for four the mirror places the block in one
  district only.
- `Binpur I` and `II` sit under West Midnapore in the workbook and under Jhargram in
  the mirror. Four Kolkata boroughs sit under South 24 Parganas.

| Option | What it means | Consequences |
| --- | --- | --- |
| **A. Administrative district** | Labels are government districts | Overlaps and the 9 count differences are source errors to correct. Roll-ups are valid once corrected. No new entity. |
| **B. Sales grouping** | Labels are company-defined | Add a `SalesGrouping` entity with its own code and owner. Official parent comes only from the crosswalk. Two roll-ups exist. A block in two groupings needs a double-counting rule. |
| **C. Mixed** | Differs by label | Decide per label in the crosswalk. Roll-ups are valid only for labels confirmed as administrative. |
| **D. Not answered** | Interim posture | Label stored as the sheet's source label; no roll-up; district polygons only as unlabelled reference. |

**Requester-confirmed evidence (2026-10-15; not an approval).** The requester states that
`AREA MAPPING.xlsx` is the company's official sales-team mapping workbook and that its
`DISTRICT` column represents company sales territories or groupings, **not necessarily
government administrative districts** (section 3A, R3). This is a requester statement. It
has not been checked against a company document, and **no approval by the designated
stakeholder is recorded**. The decision brief ([phase-0c-decision-brief.md](phase-0c-decision-brief.md),
section 2, B-23) adopts it as the working interpretation until a formal record exists.
It narrows the question without choosing an option:

- Option A is not the working interpretation. The wording matches option B and does not
  rule out option C (some labels might coincide with a government district). Nothing
  recorded says which, so none is assumed to.
- The `DISTRICT` column is **not** joined to official district polygons, names or codes,
  whether by exact name, fuzzy name or the block-name overlap. The Evidence above (all 21
  labels map to a government district by block-name overlap; the row-count comparison)
  is a diagnostic about how block names resemble an official district's block list. It
  is **not** evidence that a label is that district, and it is not a mapping to use.
- A reviewed crosswalk from the sales territories, and the block labels under them, to
  actual geographic units is required (decision 6). No block or ward membership of any
  territory is inferred.
- **R4 (2026-10-15, requester-confirmed evidence; not an approval).** The requester has
  since confirmed that the blocks listed beneath each sales-territory label are that
  sales territory's **intended membership**, and that the mappings may be used as the
  **authoritative business starting point**. The bullet above is therefore read as:
  membership is taken from the workbook rows as written, and **nothing beyond those rows
  is inferred**. This is the working reading and is **not formal approval**. It also
  says nothing about what a sales territory is, who owns the list, or whether a territory
  holds part of a block. The six shared labels are listed under two territories each, so
  both listings are kept and flagged (decision 6).
- The six shared labels, the two `Binpur` rows and the four Kolkata boroughs may be
  legitimate under this reading. That is not confirmed either way. The 9 count
  differences are not presumed to be source errors.
- The statement does not say this copy is the final version or give an as-of date, so
  B-02 stays partly open.

**Recommendation.** **No option is recommended**, because the evidence cannot show
which labels, if any, coincide with a government district. Only the owner knows. The
recommended *action* is to put the narrower questions below to the owner, attaching the
21 labels, the 6 shared labels and the 9 count differences as inputs to the crosswalk
review. The interim posture, option D, is **tightened** by the requester's statement as
listed above, and stays in force until the Decision record is completed.

**The approver must supply.** The answer (the requester's statement narrows it to B or
C); if B or C, a definition of the grouping and who owns its list. Narrower questions
that remain: which sales territories, if any, coincide with a government district; who
owns the list of sales territories and whether it has codes; whether a block or ward may
sit under two sales territories. *(R4: the workbook already lists six block labels under
two territories, so the question becomes the double-counting rule.)* Also, **in writing**:
that the blocks listed under each label are the territory's intended membership (R4 is
currently only a requester statement).

**Suggested approver.** Head of Sales or whoever maintains the workbook's district
groupings (role guessed).

**Decision record**

| Option chosen | |
| --- | --- |
| Conditions | |
| Approver name | |
| Approver role | |
| Date | |
| Evidence or link | |

---

### Decision 2: B-20 and B-10. Geographic scope and district-list baseline

**Questions.** (a) Are **Kalimpong** and **Kolkata** in scope? (b) Which district list
does the business report on?

**Why it matters.** Scope sets the denominator of every coverage figure. It also
decides whether Kolkata ward data (now notified as text only) or Kalimpong blocks are
needed at all.

**Evidence**:

- The workbook has **21** district labels. There is no Kalimpong row and no Kolkata
  label. Four Kolkata boroughs appear under South 24 Parganas. The 2023 mirror lists 4
  blocks in Kalimpong.
- **23 districts are notified** (all 23 appear in the geoBoundaries file by name).
  Five more (Kolkata reorganisation, Basirhat, Sundarban, Jangipur, Arambagh) were
  announced in the June 2026 budget; press reports give conflicting totals (27 or 28).
  **No notification was found** on 2026-10-15.
- **New in Phase 0D:** the Census office says all administrative units are frozen
  from 1 January 2026 to 31 March 2027 (PIB release, 30 March 2026). **Inference:**
  this makes a change to the district list before April 2027 less likely. It does not
  rule one out.
- **New in Phase 0D:** if Kolkata is in scope, its wards are now **209** (notified
  11 September 2026) and exist only as written descriptions. No boundary map file
  was found.

| Option | Consequences |
| --- | --- |
| **1. Scope = units the workbook represents** | Kalimpong and Kolkata are "not represented", never "unallocated". No statewide claim. Smallest geography need. |
| **2. Statewide: all 23 notified districts** | Both are in scope with no staffing data, so they would show as white space. Pulls Kolkata ward boundaries into Phase 1. *(Qualified 2026-10-15: under the requester's allocation-state rule, an area with no allocation data is **Data Missing / Unknown**, not white space. See below and section 3A.)* |
| **3. Defined business regions** | The business lists the units. The denominator is exactly that list. |
| **District list: 23 notified (proposed ones recorded as `proposed`)** | Stable until notified. A later list needs a gazette notification and a succession mapping. |

**Requester preference (2026-10-15; not an approval).** The requester prefers a map that
covers **all of West Bengal**, including administrative areas the workbook does not
represent (section 3A, R1; the requester's "Option A", not the Option A of decision 1).
This matches **scope option 2** as to the map's extent. **It is not formal business-sponsor
approval.** The scope approval field in the Decision record stays open, and no approver,
role, date or evidence link is entered.

- It differs from the recommendation below. The recommendation is unchanged, because the
  evidence it rests on is unchanged. The approver may choose the requester's preference,
  the recommendation, or a different option.
- The two are not necessarily in conflict. This sheet treated "scope" as one question;
  the preference answers only the **map's extent**. The **denominator** of a coverage
  figure is a second question, undecided. The requester's rule (section 3A, R2) is that
  every coverage figure discloses its denominator, data completeness and unknown areas.
- Under that rule, units with no staffing data in the workbook are **Data Missing /
  Unknown**, never Unallocated and never white space on that ground alone. This
  corrects the "would show as white space" wording in option 2.
- The audit found no row matching Kalimpong blocks and only four Kolkata boroughs. Because
  the `DISTRICT` labels are sales territories (section 3A, R3), the full list of areas
  the workbook does not represent is not yet known. The reviewed crosswalk (decision 6)
  is how it will be learned.
- The district list is not addressed. The 23 notified districts stay the reference list.
- Map depth, source and licence (B-19, B-27, B-18) are not settled. A statewide extent
  brings every West Bengal urban body into the boundary need, including the Kolkata (209)
  and Howrah (68) wards that exist only as text. No polygon source passes the gate
  today ([phase-0d-geographic-source-gate.md](phase-0d-geographic-source-gate.md),
  section 10).

**Recommendation.** **Scope option 1** with a visible scope status on every unit
(`in scope, represented`; `in scope, not represented`; `out of scope`; `unknown`), and
the **23 notified districts** as the reference list. *Why:* it asserts nothing the
evidence does not support, and it can be widened later without rework. *Condition:*
the approver confirms Kalimpong and Kolkata are handled elsewhere or are out of scope,
and says where.

**The approver must supply.** Whether the sheet is the full sales area or a subset;
where Kalimpong and Kolkata staffing is recorded, if anywhere; which district list
reports use; whether the map's extent and the coverage denominator are decided together
or separately.

**Suggested approver.** Head of Sales (scope); data or GIS lead (list vintage).

**Decision record**

| Option chosen (scope) | |
| --- | --- |
| Option chosen (district list) | |
| Conditions | |
| Approver name | |
| Approver role | |
| Date | |
| Evidence or link | |

---

### Decision 3: B-07 and B-08. What Primary, Secondary and DSO mean

**Questions.** (a) Formal definitions of PRIMARY, SECONDARY and DSO (and of ASM).
(b) Is DSO staff on company payroll or the distributor's?

**Why it matters.** It seeds the responsibility categories and every headcount or
coverage figure by role. Payroll status also affects data-protection handling
(decision 5).

**Evidence**:

- The workbook defines no role term. "DSO" is not expanded. There is no payroll-type
  column.
- Populated slots: PRIMARY 395 (67 distinct names), SECONDARY 429 (100), DSO 104 (44),
  ASM 358 cells (20 names). Name counts are distinct name strings, not people.
- **Inference only:** sales usage often reads primary as company-to-distributor and
  secondary as distributor-to-retailer. The workbook does not say so.

| Option | Consequences |
| --- | --- |
| **1. Business supplies written definitions** (template in Appendix A) | Categories and headcount follow the definitions. |
| **2. Industry-standard reading adopted explicitly** | Fast, but the business must sign it as its own definition. |
| **3. No categories; slot group kept as a source label** | Nothing is wrongly classified. No role-based KPI. |
| **DSO on company payroll** | DSO staff count in company headcount. |
| **DSO on distributor payroll** | Excluded from company headcount; reported separately. |

**Recommendation.** **Option 1.** *Why:* it is the only option that produces a defined
KPI, and option 2 rests on an unconfirmed inference. *Until option 1 is complete,
option 3 stays in force*: no role-based figure is reported.

**The approver must supply.** The completed role glossary (Appendix A.1) and the
payroll answer for DSO.

**Suggested approvers.** Head of Sales (definitions); HR head (payroll status);
distributor operations or trade marketing (DSO). Roles guessed.

**Decision record**

| Option chosen | |
| --- | --- |
| DSO payroll answer | |
| Conditions | |
| Approver name(s) | |
| Approver role(s) | |
| Date | |
| Evidence or link | |

---

### Decision 4: B-12. What a blank cell means, and what `Vacant` means

**Why it matters.** It separates a vacancy from missing data, and decides whether 24
rows count as white space.

**Evidence**:

- `Vacant` appears in 30 cells across 22 rows (PRIMARY 13, SECONDARY 17; none in ASM
  or DSO). There is no position ID or approval reference.
- The first PRIMARY slot is blank in 72 of 358 rows, the first SECONDARY in 51, the
  first DSO in 267. 26 cells hold only whitespace and look blank. 24 rows have no
  PRIMARY and no SECONDARY.
- **Inference:** the very different blank rates by group are consistent with different
  meanings per group (for example DSO being optional). Unconfirmed.

| Option | Consequences |
| --- | --- |
| **Blank = not applicable** | Not counted as a gap. White-space figures shrink. |
| **Blank = unfilled seat** | About 3,000 blank slot cells would become vacancies, mostly unused slot capacity. |
| **Blank = not recorded** | Treated as unknown. KPIs carry an "unknown" share. |
| **Different per column group** | The business fills the matrix in Appendix A.2. Most accurate. |
| **`Vacant` = approved open position** | Needs a position ID or approval reference, which the file lacks. |

**Requester preference (2026-10-15; not an approval).** The requester's allocation-state
rule (section 3A, R2) says a blank or whitespace-only cell, an unmatched place name and an
absent employee record are never automatically classified as **Vacant** or
**Unallocated**. Their state is **Data Missing / Unknown**. This agrees with the interim
default below. It is a preference, **not an approval**, and the Decision record stays
blank. Open for the approver:

1. The literal text `Vacant` stays a *vacancy candidate*. It is not counted as the state
   **Vacant** (an approved position known to be vacant) until the approver says what
   evidences an approved position.
2. The 24 rows with no PRIMARY and no SECONDARY are shown as "no operational staff
   recorded". In those slot groups their allocation state is Data Missing / Unknown
   unless evidence establishes another state. They are not Unallocated.
3. The blank-cell matrix (Appendix A.2) is still needed.
4. The wider KPI rules (denominators, completeness, unknown areas, no definitive
   unallocated percentage) sit under B-28, which has no sheet in this package.

**Recommendation.** **"Different per column group"**, completed by the business.
*Why:* the counts show the groups behave differently, so any single rule would
misclassify some of them. *Until then:* `Vacant` = vacancy candidate; blank and
whitespace-only = `unspecified`; never infer a vacancy from blank; show the 24 rows as
"no operational staff recorded", not as gaps.

**The approver must supply.** The completed blank-cell matrix (Appendix A.2); whether
`Vacant` ever means an approved position, and what evidence approves one.

**Suggested approver.** HR or whoever approves positions; sales operations for the
per-column meaning.

**Decision record**

| Option chosen | |
| --- | --- |
| Conditions | |
| Approver name | |
| Approver role | |
| Date | |
| Evidence or link | |

---

### Decision 5: B-25. Employee identity resolution

**Questions.** (a) Does an HR or distributor identifier exist for each person? (b) May
person names be imported as the identity basis? (c) Who confirms merges of
near-duplicate names?

**Why it matters.** Headcount and dual-role figures rest on identity. Importing names
is also a data-protection question that the business has not yet reviewed.

**Evidence**:

- The workbook holds names only: 225 distinct normalised name strings; 3
  near-duplicate pairs; 2 names in more than one raw spelling; 3 with stray
  whitespace; 5 single-word names; 6 names in more than one role group; 16 in more
  than one district. No employee identifier exists in the file. Whether one exists
  elsewhere is **unknown**.
- **New in Phase 0D (not legal advice):** the Digital Personal Data Protection Act
  allows an employer to process employee data without consent "for the purposes of
  employment" (section 7(i)), but whether territory allocation and analytics fit that
  phrase, and whether it covers distributor-payroll staff, are **unresolved legal
  questions**. The Act also requires personal data used to make decisions about
  individuals to be complete, accurate and consistent (section 8(3)). Unconfirmed name
  merges are in tension with that. The main duties start about 13 May 2027. See the
  privacy assessment, sections 3 and 8.

| Option | Consequences |
| --- | --- |
| **1. An HR or distributor ID exists and is imported** | Exact identity. Best headcount. Needs a join source and permission to use it. |
| **2. Names only, identity `unconfirmed`, merges reviewed** | Works now. Headcount is "distinct names, unconfirmed" with an unknown error band. Needs legal and HR to confirm names may be imported. |
| **3. Do not import names; pseudonymous IDs with a manual map** | Lowest privacy exposure. Much more manual work; users cannot read names. |

**Recommendation.** **Option 1 if an ID exists.** *Why:* it removes both the
accuracy problem and the need to rely on names. If none exists, **option 2 only after
legal and HR confirm in writing that names may be imported**; otherwise option 3.
*Neither is recommended over the other without the answer to (a).* In every case,
headcount stays labelled "distinct names, unconfirmed" until merges are signed.

**The approver must supply.** Whether an ID exists and where; written legal/HR
position on names; the name of the person who signs merges.

**Suggested approver.** HR head, with the legal or data-protection owner. Merge
sign-off by someone who knows the field staff.

**Decision record**

| Option chosen | |
| --- | --- |
| Where the ID lives (if option 1) | |
| Legal or HR position (link) | |
| Conditions | |
| Approver name(s) | |
| Approver role(s) | |
| Date | |
| Evidence or link | |

---

### Decision 6: B-26. Crosswalk review and sign-off responsibility

**Question.** Who signs the mapping from the workbook's labels to official units?

**Why it matters.** Official codes cannot be assigned automatically. Every join to
geography, boundaries and KPIs rests on this file.

**Evidence** (Phase 0B, against the 2023 mirror, which is not authoritative):

- 293 of 358 rows match exactly after normalising case, spaces and dashes; 39 match
  as spelling variants (7 very close, 12 close, 20 weaker); 2 match a block the mirror
  places in another district; 24 are unmatched.
- Review workload: 63 rows plus 2 cross-district rows, 6 of the 45 pairings being
  inferences from leftovers rather than name matches, plus 21 district labels
  (9 spelled differently from LGD) and the 24 unusual rows (B-24).
- Two features in a public boundary file are both named `Sankrail`, so a join on name
  alone is unsafe even in official data.
- **New in Phase 0D:** the Local Government Directory download page offers, per state,
  lists of districts, sub-districts, development blocks, urban local bodies and wards.
  Exports are manual (a captcha is required) and have no CSV option. LGD states that
  its content is owned and updated by the Ministry of Panchayati Raj with State
  departments. **No fresh official export has been taken yet**, so no match rate
  against official data exists.

**Two parts, which can be decided separately:**

1. **Assign responsibility now:** name the reviewer, the data owner who accepts the
   file, and who performs the LGD exports.
2. **Sign the file later:** only after the name test is repeated against a fresh
   official export. A crosswalk signed against the 2023 mirror would need re-review.

| Option | Consequences |
| --- | --- |
| **One named reviewer signs every pairing and unclear row** | Simple and accountable. Needs someone who knows the field geography. |
| **Auto-accept only exact-after-normalisation matches; review the rest** | Less work. The 293 exact matches are still unconfirmed names, so this is a shortcut, not proof. |
| **Two-person review for weaker pairings (the 20 weaker plus 6 leftovers)** | Highest confidence; slowest. |

**Requester-confirmed evidence (2026-10-15; not an approval).** Because the `DISTRICT`
column holds company sales territories or groupings (section 3A, R3), the "21 district
labels" in the evidence above are **sales-territory labels**. Signing them is **not** a
spelling check against LGD district names. The file to be signed must record, for each
label and each block label under it, which actual geographic unit it corresponds to, or
that it is excluded or held. Territory membership is **not** inferred from official
boundaries, names, counts or overlap, and an unmatched place name is never assigned
automatically to a unit, a territory or an allocation state (section 3A, R2). Questions
for the approver, not answered here: is the workbook's list of block rows under each
label itself the authoritative membership of that territory, and at what level (whole
block or part of one)? Does the field list in Appendix A.3 need more fields, for example
the reviewer's evidence for each membership?

**Requester-confirmed evidence, R4 (2026-10-15; not an approval).** The first question
above now has a **requester answer**: the blocks listed beneath each sales-territory label
are that territory's intended membership, and the rows may be used as the authoritative
business starting point (section 3A, R4). It is not a formal approval, and nobody has
recorded one. The effect on this decision:

- **The reviewer's job is geographic validation, not a membership decision.** Each
  workbook row is a membership line, copied as written (labels verbatim, source row
  number, file hash). The reviewer does not add, remove, merge or move a line. A suspected
  error goes to the business as a change request.
- **Matching is independent.** Each block label is matched to official units from official
  data without using the sales-territory label as a district: not to narrow candidates,
  not to break a tie. Every candidate is recorded. The Phase 0B counts used a
  label-constrained test and must be re-run without it on a fresh LGD export.
- **Flag, never resolve silently.** Unmatched, ambiguous, mixed-unit and conflicting
  records go to review. The known ones: 6 block labels under two territories (12 rows);
  12 labels that may be an urban ward, borough, municipality or corporation (a KMC
  `Borough` is not a ward); the 24 Phase 0B unmatched rows, including `Galsi-W` and
  `Jharkhand-W`; 39 spelling variants and the two `Binpur` rows; and ambiguous spellings
  such as `Sankrail`. The list with workbook row numbers is DQ-15 in
  [data-quality-findings.md](data-quality-findings.md).
- **No row is dropped.** Every one of the 358 rows appears in the file whatever its
  status. An exclusion needs a business reason.
- **Still for the approver:** whether R4 is accepted as the membership input, in writing;
  whether a territory can hold part of a block (not stated; none assumed); the
  double-counting rule for a block under two territories; and the sign-off itself, which
  stays **outstanding**.

**Recommendation.** **One named reviewer signs a crosswalk file** (fields in Appendix
A.3), after a re-run on a fresh official LGD export. *Why:* it is accountable and
proportionate to 63 rows. The reviewer may escalate the 26 weakest pairings to a
second person at their discretion. **Responsibility (part 1) can be approved now.**

**The approver must supply.** The reviewer's name and role; the person who takes the
LGD exports (with the data owner's authority to use the portal); the acceptance rule.
*(R4: also, who decides each flagged record, that is, who at the business may answer a
change request on a membership line.)*

**Suggested approver.** A named sales-operations reviewer, with the data owner
accepting the file.

**Decision record**

| Option chosen | |
| --- | --- |
| Named reviewer | |
| Person who performs LGD exports | |
| Conditions | |
| Approver name | |
| Approver role | |
| Date | |
| Evidence or link | |

---

## 5. Suggested order

1. **Decisions 1 and 2** together: they set scope and what DISTRICT means.
2. **Decisions 3 and 4** together: role definitions and blank-cell meaning, using the
   Appendix A forms.
3. **Decision 5**, after legal and HR have read the privacy assessment.
4. **Decision 6, part 1** immediately; **part 2** after decisions 1, 2 and the LGD export.

Decisions 1 to 6 are the Tier 1 decisions of the Phase 0C brief. Approving all six
still does **not** satisfy Gate 1 or Gate 4 in that brief. Other approvals remain
(B-05, B-22, B-13, B-09, B-21, B-06, B-15, B-16, B-18, B-19 and others).

---

## Appendix A: Forms for the business to complete

These are blank on purpose. Nothing in them is an answer.

### A.1 Role glossary (decision 3)

| Term | Business definition | Performed by | Payroll (company, distributor, other) | Counts in company headcount? | Counts toward coverage of |
| --- | --- | --- | --- | --- | --- |
| PRIMARY | | | | | |
| SECONDARY | | | | | |
| DSO (expansion) | | | | | |
| ASM | | | | | |

### A.2 Blank-cell matrix (decision 4)

| Column group | Does `Vacant` mean an approved open position? | Does blank mean: not applicable, unfilled, or not recorded? |
| --- | --- | --- |
| PRIMARY | | |
| SECONDARY | | |
| DSO | | |
| ASM | | |

### A.3 Crosswalk file fields (decision 6)

Source label; source district label; official unit name; official LGD code; unit type;
match kind (exact, variant, inferred, manual); reviewer; review date; LGD export date;
note.

*Update 2026-10-15.* "Source district label" holds the workbook's sales-territory label.
It is not an official district. **R4 adds**, as proposed fields: workbook row number; the
sales-territory label and the block label **verbatim**; file hash; membership source
("workbook row, requester-confirmed 2026-10-15; not formally approved"); all candidate
official units; official parent (from LGD, not from the label); review flag or flags
(conflict, mixed unit, unmatched, ambiguous name, spelling variant, possibly out of state,
inferred pairing); and review status (open, confirmed, held, excluded with a business
reason). The first group is copied from the workbook and never edited.

**Sign-off checklist** (reviewer, before signing): every in-scope row is matched,
explicitly excluded, or held with a reason; every block label listed under more than one
sales territory, and every spelling that could refer to more than one official unit, is
flagged and reviewed individually (*changed 2026-10-15: this line used to read "resolved
using the district"; the sales-territory label is not an official district and is not
used to resolve them*); every workbook row appears in the file with its source row number
and none is silently dropped; the LGD export date is recorded; a second person has seen
the weaker pairings if escalated.

## Appendix B: Combined decision log (blank)

| ID | Decision | Option chosen | Conditions | Approver name | Role | Date | Evidence or link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B-23 | | | | | | | |
| B-20 / B-10 | | | | | | | |
| B-07 / B-08 | | | | | | | |
| B-12 | | | | | | | |
| B-25 | | | | | | | |
| B-26 | | | | | | | |
