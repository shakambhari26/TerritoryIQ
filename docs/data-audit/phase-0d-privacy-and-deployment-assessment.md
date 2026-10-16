# Phase 0D: Privacy and deployment assessment

**Status: RESEARCH FOR COMPANY LEGAL, HR AND SECURITY REVIEW. This is not legal advice.
It does not establish that any design, hosting choice or data practice complies with
Indian law. No approval is given or implied.**

Research date: **2026-10-15**. Primary sources were read from official hosts on that
date (Appendix A). Where a point rests on a secondary source it is labelled so.

Related: [proposed-data-model.md](proposed-data-model.md),
[phase-0c-decision-brief.md](phase-0c-decision-brief.md) (B-03, B-13, B-15, B-16),
[phase-0d-stakeholder-approval.md](phase-0d-stakeholder-approval.md),
[phase-0d-geographic-source-gate.md](phase-0d-geographic-source-gate.md).

## 0. How to read this document

Every point carries one tag:

| Tag | Meaning |
| --- | --- |
| **[L]** | **Legal requirement**, as the primary official text reads. The citation is given. "As read" means this is a plain reading of the text, not a legal opinion. |
| **[E]** | **Engineering recommendation.** A design suggestion. Not a legal requirement unless the same point is also tagged **[L]**. |
| **[Q]** | **Unresolved legal question.** The text or the facts do not settle it. Needs the company's legal owner. |
| **[B]** | **Business decision** or input that the business must supply. |
| **[R]** | **Reported** by a secondary source (law-firm note, news, vendor marketing). Not confirmed against a primary text. |
| **[F]** | **Fact about a vendor or product**, read from the vendor's own public page. Not a contract term unless stated. |

Short forms: "the Act" is the Digital Personal Data Protection Act, 2023; "the Rules"
are the Digital Personal Data Protection Rules, 2025.

---

## 1. Which rules apply, and from when

### 1.1 Timeline, from the Gazette of India

| Date | What takes effect | Source |
| --- | --- | --- |
| **13 Nov 2025** (publication) | Act sections 1(2), 2, 18 to 26, 35, 38 to 43, 44(1) and 44(3); the **Data Protection Board of India is established** (G.S.R. 844(E)) with four members (G.S.R. 845(E)); Rules 1, 2 and 17 to 21 | G.S.R. 843(E); G.S.R. 846(E), Rule 1(2) **[L]** |
| **One year after publication, about 13 Nov 2026** | Act section 6(9) and 27(1)(d) (consent managers); Rule 4 | G.S.R. 843(E) clause (b); Rule 1(3) **[L]** |
| **Eighteen months after publication, about 13 May 2027** | Act sections **3 to 17** (including section 7 legitimate uses, section 8 duties, section 16 transfers), 6(1)-(8) and (10), 27, **28 to 34** (including penalties), 36, 37 and **44(2)**; Rules 3, **5 to 16**, 22, 23 | G.S.R. 843(E) clause (c); Rule 1(4) **[L]** |

Notes:

- **[Q] Exact day.** The Gazette issue is headed "Thursday, November 13, 2025", but the
  e-Gazette file identifiers and digital signatures carry 14 November 2025. Eighteen
  months from publication is therefore **13 May 2027 or 14 May 2027**. Treat 13 May
  2027 as the earliest.
- **[L] What this means for Phase 1.** Until the eighteen-month provisions start, the
  Act's notice, legitimate-use, security, breach, erasure and transfer duties and its
  penalties are **not yet in force**. An application that holds employee data **after**
  that date must meet them. Designing for them now is cheaper than retrofitting.
- **[L] Interim regime.** Section 44(2) of the Act omits section 43A of the
  Information Technology Act, 2000 and clause (ob) of its section 87(2). It starts at
  eighteen months (G.S.R. 843(E)). **[R]** A search result describing the India Code
  copy says the Sensitive Personal Data or Information (SPDI) Rules, 2011 were made
  under those two provisions. **[Q]** If so, the SPDI Rules remain in force until
  then. **Their text could not be retrieved in this phase** (the India Code copy returned HTTP 504; the MeitY URL returned 404), so
  whether any field in this project is "sensitive personal data or information" under
  them is **not assessed**. Names, roles and territory assignments are not obviously
  within that category, but legal should confirm.
- **[L] In force now regardless of the Act:** the CERT-In Directions of 28 April
  2022 (section 4.3 below).
- **[R] Not verified, to monitor.** Secondary sources report that in January 2026
  MeitY floated cutting the eighteen months to twelve (reportedly aimed at
  significant data fiduciaries), that feedback closed on 4 February 2026, and that no
  amending notification had been found as of September 2026. No primary text of the
  proposal was found. Also reported: the Board's chairperson and members had not been
  reported as appointed as of September 2026, and the Supreme Court issued notice on a
  challenge on 16 February 2026 without a stay. **Nothing in this document depends
  on these reports.** Legal should check the Gazette before relying on any date.

### 1.2 Official guidance

The PIB release of 14 November 2025 (read directly) says the Rules provide an "18-month
phased compliance timeline" and lists the seven principles of the Act: consent and
transparency, purpose limitation, data minimisation, accuracy, storage limitation,
security safeguards, accountability. **No MeitY FAQ or guidance on employer processing
under section 7(i) was found.** A search returned only law-firm commentary. The MeitY
FAQ PDF that surfaced concerns the 2026 intermediary rules, not the Act.

---

## 2. Roles: whose data, and who is responsible

| Question | Reading | Tag |
| --- | --- | --- |
| Is the company a Data Fiduciary? | A Data Fiduciary is "any person who alone or in conjunction with other persons determines the purpose and means of processing of personal data" (section 2(i)). A company deciding to build and run this application for its own allocation purposes fits that description | **[L]** definition; application **[Q]** |
| What is personal data here? | "any data about an individual who is identifiable by or in relation to such data" (section 2(t)). Names with role and territory are personal data. Vacancy flags with no person are not. Account and log data about the application's users are personal data too | **[L]** |
| Does the Act reach a spreadsheet that is later loaded into a database? | It applies to digital personal data, including data "collected in non-digital form and digitised subsequently" (section 3(a)) | **[L]** |
| Who are the Data Principals? | (a) Company employees named in the workbook; (b) staff on a **distributor's** payroll if "DSO" or other slots are that (B-07); (c) the application's own users (managers, HR, analysts) | **[B]** for (a) and (b); **[L]** for (c) |
| Is distributor-payroll staff covered by the employment ground? | Section 7(i) refers to "the purposes of employment" and a benefit "sought by a Data Principal who is an employee". It does not say whose employee. Whether a distributor's staff are covered when the **company** processes them is **not settled by the text** | **[Q]** |
| Is the distributor a separate fiduciary, and on what basis does it pass staff data to the company? | Not answered by the project. Disclosure between fiduciaries also triggers the accuracy duty in section 8(3)(b) | **[Q]** |
| Who are the Data Processors? | Any person processing on the company's behalf (section 2(k)): a hosting provider, a BI service, email or support providers, any developer tooling that sees real data | **[L]** definition |

---

## 3. Information the application actually needs

### 3.1 Legal basis for employee data

- **[L]** Personal data may be processed only for a lawful purpose with the person's
  consent or for a "certain legitimate use" (section 4(1)).
- **[L]** One legitimate use is "for the purposes of employment or those related to
  safeguarding the employer from loss or liability, such as prevention of corporate
  espionage, maintenance of confidentiality of trade secrets, intellectual property,
  classified information or provision of any service or benefit sought by a Data
  Principal who is an employee" (section 7(i)).
- **[Q]** Whether **territory allocation, coverage analytics and vacancy reporting**
  are "purposes of employment" is a question for legal. The text lists examples that are
  mostly protective; allocation of sales areas is a normal employment function but the
  text does not say so.
- **[Q]** The notice duty (section 5, Rule 3) is written for requests for **consent**
  (section 5(1)). Whether any notice is required where only section 7(i) is relied
  on is a legal question. **[E]** A short internal notice describing what is held, why,
  who sees it and how to raise a concern is cheap and builds trust whichever way legal
  decides. **[B]** HR decides how to communicate.
- **[Q]** The rights of access, correction and erasure (sections 11 and 12) are
  written for data principals "to whom she has previously given consent, including
  consent as referred to in clause (a) of section 7". On a plain reading they do not
  name processing under section 7(i). The grievance duty applies generally (sections
  8(10), 13; Rule 14(3): a reasonable period not exceeding ninety days). Legal should
  say what rights employees have here. **[E]** Provide an HR route for correcting
  name and role errors anyway: the accuracy duty below makes it necessary in practice.
- **[L]** Section 8(3): where personal data is "likely to be used to make a decision
  that affects the Data Principal" or "disclosed to another Data Fiduciary", the
  fiduciary "shall ensure its completeness, accuracy and consistency".
  **[Q]** Is allocating a territory "a decision that affects" an employee? If so,
  **unconfirmed name merges (B-25)** are in tension with this duty.
  **[E]** Keep identity status visible ("unconfirmed", "confirmed"); route disputed
  merges to a named reviewer; do not base an HR action on an unconfirmed identity.
- **[B]** Territory data is **not** to be used for appraisal, incentive or disciplinary
  decisions unless the business decides so and legal and HR review it separately.
  Salary and performance are already out of scope (architecture.md, B-04).

### 3.2 What each field is for

| Item | Needed for | Phase 1 need | Recommendation **[E]** |
| --- | --- | --- | --- |
| Person display name | Showing who holds a territory | Only if B-25 option 2; not needed if an ID lookup is used | Import only if legal and HR approve names. Show it only to roles that need it |
| HR or distributor ID | Exact identity; joins | Preferred key if it exists (B-25) | Prefer over names as the identity key. Still personal data |
| Role or slot group | Allocation | Yes | Keep. A source label until B-08 |
| Territory or block, effective dates, state | Core purpose | Yes | Keep. Dates support history and accuracy |
| Reporting line | Access scoping, hierarchy | Not in the workbook | Add only if B-15 scopes access by reporting line |
| Payroll kind (company or distributor) | Headcount split (B-07) | Yes, once defined | Keep as a coded value |
| Vacancy flag | Vacancy reporting | Yes | No personal data |
| Raw name spellings (`PersonNameVariant`) | Identity review only | Temporary | Keep in a restricted table; delete after merges are signed (retention below) |
| Source row hash and number (`SourceRow`) | Lineage | Yes | Keep the hash and number; **no raw personal data** (already in the model) |
| Audit record (actor, time, action, record IDs) | Accountability | Yes | Store **IDs, not names** (section 4) |
| User account (work identity, role, scope, last sign-in) | Authentication and access | Yes | Use the company identity provider where possible |

### 3.3 What the application does not need

**[E]** Keep these out by allow-list (B-03 and the existing salary exclusion):
salary, incentives, performance ratings; personal phone, personal email, home address;
date of birth or age; Aadhaar, PAN or other government identifiers; bank details;
photographs; caste, religion, health or union data; any device or location tracking
of an individual. The Phase 0B workbook contains none of these. **[E]** Adding any
later should require a fresh review.

---

## 4. Minimisation, retention, security and audit

### 4.1 Retention

**[L]** (as read, from the eighteen-month date):

- **Erasure.** Erase personal data when consent is withdrawn or "as soon as it is
  reasonable to assume that the specified purpose is no longer being served", unless
  retention is necessary to comply with any law (section 8(7)). The processor must
  erase too (section 8(7)(b)). The prescribed inactivity periods in the Third Schedule
  apply only to large e-commerce, gaming and social-media fiduciaries; they do not
  cover an employer (Rule 8(1)).
- **Minimum retention of logs.** Rule 6(1)(e) requires logs and personal data needed
  to detect, investigate and remediate unauthorised access to be retained for **one
  year**. Rule 8(3) separately requires a fiduciary to retain personal data processed,
  "associated traffic data and other logs of the processing for a minimum period of one
  year from the date of such processing", for the purposes in the Seventh Schedule, and
  then erase them unless another law requires longer. The illustration in Rule 8(3)
  includes a private company hosting customer records.

**[Q]** How Rule 8(3)'s one-year minimum sits with section 8(7) erasure, whether it
applies to an employer's own records, and whether it covers the underlying personal
data or only logs, is unresolved. This affects the retention of ended assignments and
of data about people who leave.

**[B]** Retention periods are for HR and legal to set. The Phase 0C open sub-question
under B-13 (retention of ended assignments) is **still unanswered**. **[Q]** HR to say
whether any employment, labour or tax law requires the company to keep records of
who held which territory, and for how long. This phase did not research that.

**[E]** Proposed retention schedule. **Periods are blank because they are
decisions, not research findings.**

| Data class | Mechanism | Period | Decision owner | Status |
| --- | --- | --- | --- | --- |
| Active assignments and positions | Retained while valid | n/a | n/a | n/a |
| Ended assignments (history) | Soft-delete, then scheduled hard-erase or pseudonymise | **Blank** | HR with legal | **Open** |
| Access and audit logs | At least one year online (Rule 6(1)(e), as read); at least 180 days in India now (CERT-In) | **Blank (maximum)** | Security with legal | **Open** |
| Raw name spellings and identity-review records | Delete after merge sign-off plus a stated period | **Blank** | HR | **Open** |
| Person records of people who have left | Reduce to a pseudonymous ID | **Blank** | HR with legal | **Open** |
| Backups | Same as the source; document how erasure reaches backups | **Blank** | Security | **Open** |
| Imported workbook files | Do not store in the application; keep only the hash and row numbers (as designed) | n/a | Data owner | Proposed |

### 4.2 Design consequences for the proposed data model **[E]**

These follow from the tension between "append-only history" and erasure:

1. `ChangeLog` holds `before` and `after` values. If those contain names, an
   erasure request cannot be met without rewriting an "append-only" log.
   **Store person IDs, not names**, in the log. Erase the name in `Person` and the
   history stays interpretable and de-identified.
2. `PersonNameVariant` is the most privacy-heavy table. Restrict it and give it a
   deletion date.
3. `Person.display_name` should be optional (B-25 option 3 works without it).
4. History is useful, but **full history with no limit** (B-13 default) is a retention
   decision, not a technical default. Make the retention period a configuration the
   business sets.
5. Keep `SourceRow` as hash and row number only, as the model already states.
6. Do not copy person-level data into Power BI datasets or exports by default.
   Supply aggregates or pseudonymous IDs unless a need is shown.

### 4.3 Security, breach reporting and logs

| Requirement | Tag | Source |
| --- | --- | --- |
| Protect personal data in the fiduciary's possession or control, including with processors, by "reasonable security safeguards to prevent personal data breach" | **[L]** | Act s.8(5) |
| Safeguards "at the minimum": (a) encryption, obfuscation, masking or virtual tokens; (b) control of access to computer resources; (c) "visibility on the accessing of such personal data, through appropriate logs, monitoring and review" for detecting and investigating unauthorised access; (d) backups and continuity; (e) one-year retention of such logs and data; (f) appropriate security terms in the contract with each processor; (g) technical and organisational measures | **[L]** | Rule 6(1) |
| Appropriate technical and organisational measures to observe the Act | **[L]** | Act s.8(4) |
| On a personal data breach: tell **each affected person** "without delay", in plain language (what happened, consequences, mitigation, safety steps, a contact); tell the **Board** "without delay" and give detailed information **within 72 hours** (or a longer period the Board allows) | **[L]** | Act s.8(6); Rule 7 |
| Statutory maximum penalties: up to ₹250 crore for failing reasonable security safeguards (s.8(5)); ₹200 crore for failing to give breach notice (s.8(6)); ₹50 crore for other breaches. These apply from the eighteen-month date | **[L]** | Act Schedule |
| Publish business contact details for a person who can answer questions; maintain grievance redress | **[L]** | Act s.8(9), 8(10); Rule 9 |
| Report listed cyber incidents (including "Data Breach", "Data Leak", "Unauthorised access of IT systems/data") to CERT-In **within 6 hours** of noticing them; designate a point of contact; synchronise clocks to NIC or NPL time sources | **[L]**, in force now | CERT-In Directions 28 Apr 2022, directions (i)-(iii), Annexure I |
| Enable logs of all ICT systems and keep them **for a rolling 180 days, "maintained within the Indian jurisdiction"** | **[L]**, in force now | CERT-In Directions, direction (iv) |
| The company's own use of cloud, VPS or VPN providers triggers record-keeping duties **for those providers**, not for the company | **[L]** | CERT-In Directions, direction (v) |
| Whether the 180-day "within the Indian jurisdiction" rule reaches logs held by a foreign-operated software-as-a-service provider | **[Q]** | |

### 4.4 Authentication, authorisation and audit **[E]**

None of the following is a stated legal minimum beyond Rule 6 above. Each is a
recommendation for the design to be reviewed by security and legal.

- **Authentication.** Single sign-on through the company identity provider; multi-factor
  authentication for all users; unique named accounts; no shared accounts; session
  time-outs.
- **Authorisation.** Role-based access with least privilege. Candidate roles: scoped
  viewer, scoped editor, HR data steward (identity review), auditor (read-only logs),
  system administrator. **The scoping basis (region, reporting line or none) is
  undecided (B-15).** Enforce scope **in the database** (row-level), not only in the
  interface. Names visible only to roles that need them.
- **Privileged access.** Separate administrator accounts, multi-factor, time-limited
  elevation; no routine direct database access by users.
- **Audit.** Log who did what to which record IDs, when and with what outcome, for
  writes **and for reads of person-identifying views and exports**; log sign-ins and
  failures, role changes and exports. Keep the audit store separate from the
  application database and protect it from edit. Alert on bulk reads and exports.
- **Exports.** Limit, approve or watermark exports of person-level data.
- **Lifecycle.** A joiner, mover, leaver feed from HR; quarterly access review.
- **Environments.** No production personal data in development or test. Use synthetic or
  pseudonymised data. **Do not paste real names or identifiers into external AI
  coding or analysis tools.** The Phase 0B and 0D documents contain counts and place
  names only.
- **Operations.** Encrypt at rest and in transit; encrypted, restore-tested backups;
  secrets management; independent security test before go-live; an incident runbook
  that names owners and carries the 6-hour CERT-In clock and the Board's 72-hour
  clock.

---

## 5. Hosting, external processing and transfers

### 5.1 The legal frame

| Point | Tag | Source |
| --- | --- | --- |
| The Central Government may, by notification, **restrict transfer** of personal data for processing to notified countries (a negative-list model). Higher protection or restriction under other Indian law is not displaced | **[L]** | Act s.16 |
| Transfers outside India are permitted "subject to the restriction that the Data Fiduciary shall meet such requirements as the Central Government may, by general or special order, specify in respect of making such personal data available to any foreign State, or to any person or entity under the control of or any agency of such a State" | **[L]** | Rule 15 |
| Significant Data Fiduciaries must keep certain categories of personal data and related traffic data in India if the Government so specifies | **[L]** | Rule 13(4) |
| A fiduciary may involve a processor "only under a valid contract" (the text is framed for activities related to offering goods or services) | **[L]** as read | Act s.8(2) |
| Security terms must be in the processor contract "wherever applicable" | **[L]** | Rule 6(1)(f) |
| Whether any country has been notified under section 16: **none was found.** Secondary sources say none as of mid-2026. Not checked exhaustively against the Gazette. Section 16 is in the eighteen-month group | **[R]** | |
| Whether the company is, or will be, a Significant Data Fiduciary. The Government notifies these. No notification naming the company was looked for | **[Q]** | Act s.10 |
| Whether the Act's exemption for notified classes such as start-ups (section 17(3)) could apply. Needs notification; none considered | **[Q]** | |
| **No general data-localisation duty for employee data was found in the Act or Rules** beyond section 16 and Rule 13(4) as above. Other sector laws and the CERT-In log rule are separate | **[L]** as read; **[Q]** for other laws | |

### 5.2 Candidate platforms: what the vendors state (not contract terms)

No account was created and no terms were accepted. These are public pages read on
2026-10-15.

**Supabase (hosted Postgres).**

- **[F]** Each project is deployed to one primary region. The region list includes
  **South Asia (Mumbai) `ap-south-1`** and others including Singapore, Frankfurt and
  US regions. The page says the region "determines where your primary project data is
  stored" and that "Region selection is a data-location control, not proof of
  regulatory compliance". A general region such as "Southeast Asia" may land in a
  different country than expected; a specific region should be chosen.
- **[F]** The Data Processing Addendum is with **Supabase Pte. Ltd.** Its definition of
  "Applicable Data Protection Laws" lists the GDPR, Swiss law and US laws "including
  (without limitation)". **India is not named.** Standard Contractual Clauses are
  provided for GDPR and Swiss transfers. Supabase "may Process Covered Data anywhere
  that Supabase or its Sub-processors maintain facilities", but where the customer
  directs a region it will store and "primarily Process" data there "unless otherwise
  required to comply with Customer's additional instructions, applicable law or as
  necessary to provide Services". The customer must not direct a region where that
  would violate law and agrees to indemnify Supabase if it does. Security incidents are
  notified "without undue delay, and where feasible, within forty-eight (48) hours".
  A sub-processor list is published as a linked document (dated 12 October 2026; **not
  read**).
- **[R]** (vendor marketing, not verified by this project) SOC 2 Type 2, ISO 27001 and
  HIPAA attestations; AES-256 at rest and TLS in transit. Reports are said to be
  available to certain paid tiers.
- **[Q]** Do these terms give the company what the Act's section 8(2), Rule 6(1)(f)
  and Rule 7 need? In particular, a vendor 48-hour "where feasible" notice does not
  match the company's own **6-hour** CERT-In clock, which starts when the company is
  "brought to notice".

**Power BI.**

- **[F]** The Microsoft documentation says a tenant's home region is "the Azure
  datacenter region linked to your Fabric tenant, chosen when your tenant was
  created", that the "Your data is stored in" value is the default storage region, and
  that workspaces may use capacities in other regions. Power BI metadata is held in
  Azure SQL Database. **Where the company's tenant lives is not known to this project.**
- **[E]** Give Power BI aggregates or pseudonymous IDs, not person-level names (section
  4.2). That reduces how much of this question matters.

**Development and AI tooling.**

- **[E]** Treat any AI assistant, code-review service or analytics SaaS as an external
  processor. Do not give it real names, IDs or the workbook. The Phase 0B and 0D audits
  used counts and place names only.

**Survey of India boundary data (cross-reference).** The Survey of India undertaking
not to share downloaded boundary data "with any foreign individual or foreign entity,
except as permitted under applicable laws" is a geographic-data term, not a privacy
term. It still interacts with where the database is hosted and who operates it. See
[phase-0d-geographic-source-gate.md](phase-0d-geographic-source-gate.md), sections 3.2
and 4. **[Q]**

### 5.3 Hosting options, for review (none is chosen)

| Option | What the privacy review must settle | Open items |
| --- | --- | --- |
| **A. Hosted Postgres in an Indian region** (for example Supabase `ap-south-1`) | Processor contract and sub-processors; whether the DPA fits Indian law; support-staff access from abroad; backups and log location; CERT-In clocks | Legal reading of the vendor DPA; location of logs |
| **B. Hosted Postgres in a non-Indian region** | Everything in A, plus any section 16 or Rule 15 restriction once in force; CERT-In 180-day in-India logs; the Survey of India foreign-entity undertaking if its data is stored there | Heaviest review |
| **C. Self-managed Postgres/PostGIS on an Indian cloud or company infrastructure** | Security operations burden; who administers; backups | Capacity of IT to run it |
| **D. Company data-centre or on-premises** | Same as C; remote access design | Capacity of IT |

**[E]** Keep the logical schema portable (as architecture.md already says), prefer an
Indian region with logs kept in India, keep person-level data out of third-party
analytics, and **do not provision any database holding real employee data until B-16
and B-15 are approved** (Phase 0C guardrail).

### 5.4 Questions for the hosting review **[Q]**

1. Which region, and is the DPA acceptable under Indian law given it names none?
2. Who are the sub-processors and where do they operate? Do any receive personal data?
3. Can vendor staff outside India access production data (support, operations)?
4. Where are backups and logs stored? Do they satisfy the CERT-In "within the Indian
   jurisdiction" log rule?
5. How will the company meet the 6-hour CERT-In and the Board's 72-hour clocks if the
   vendor's notice is 48 hours "where feasible"?
6. What happens to the data on termination, and how is erasure propagated to backups
   and sub-processors (section 8(7)(b))?
7. If distributor staff can log in, is that a disclosure to another fiduciary, on
   what basis, and with what contract?
8. Will any person-level data reach Power BI or other tools, and in which region does
   the tenant sit?
9. Does using a foreign-operated service for Survey of India boundary data breach the
   no-foreign-sharing undertaking (geographic gate, row 2)?

---

## 6. Approvals required from company legal, HR and security

Nothing below has been obtained.

| # | Item | Approver (role, guessed) | Why | Blocks |
| --- | --- | --- | --- | --- |
| 1 | Written legal-basis opinion: section 7(i) for employees; position on **distributor-payroll staff**; and on application users | Legal or data-protection owner | Sections 3.1 and 2 | B-25; any import |
| 2 | Confirm whether the company is, or may be notified as, a Significant Data Fiduciary; name the point of contact (and any Data Protection Officer) | Legal | Act s.8(9), s.10; Rule 9, 13 | Go-live |
| 3 | Employee communication approach, and whether any notice is mandatory | HR with legal | Section 3.1 | Go-live |
| 4 | Retention schedule (section 4.1), including ended assignments, logs, identity-review data, leavers, backups | HR with legal | Act s.8(7); Rule 6(1)(e), 8(3) | B-13 retention sub-question |
| 5 | Import allow-list with explicit exclusions (section 3.3) | HR with security | Minimisation | B-03; import design |
| 6 | Access model: roles, scoping basis, who sees names | Head of Sales, HR, security | Section 4.4 | B-15; authentication work |
| 7 | Hosting and residency: region, DPA review, sub-processors, log location | Legal, security, IT | Section 5 | B-16; any real-data database |
| 8 | Incident response plan with named owners and the 6-hour and 72-hour clocks | Security with legal | Section 4.3 | Go-live |
| 9 | Processor agreements, including Power BI | Legal, IT | Act s.8(2); Rule 6(1)(f) | B-17; any BI use |
| 10 | Rights and grievance process (and what employees may request) | HR with legal | Act s.8(10); Rule 14 | Go-live |
| 11 | Whether to run a voluntary impact assessment (required by law only for Significant Data Fiduciaries) | Security, legal | Rule 13(1) | **[E]** |
| 12 | Written use restriction: territory data is not used for appraisal or discipline | Head of Sales, HR | Section 3.1 | Scope control |
| 13 | Rules for AI and developer tooling touching real data | Security | Section 4.4 | Development |
| 14 | A named person to watch for amending notifications and the Gazette dates | Legal | Section 1.1 | Planning |

---

## 7. Unresolved legal questions (consolidated)

| ID | Question |
| --- | --- |
| Q-1 | Is allocation analytics a "purpose of employment" under section 7(i)? |
| Q-2 | Does section 7(i) reach distributor-payroll staff the company processes? What is the basis if not? |
| Q-3 | Is notice required where only section 7(i) is relied on? |
| Q-4 | Do access, correction and erasure rights (sections 11 and 12) apply to section 7(i) processing? |
| Q-5 | Is allocating a territory "a decision that affects" the employee for section 8(3)? |
| Q-6 | How does Rule 8(3)'s one-year minimum retention interact with section 8(7) erasure, and does it reach an employer's records? |
| Q-7 | Is the company a Data Fiduciary jointly with distributors for any data? Is there a lawful basis for distributor-to-company disclosure? |
| Q-8 | Is any field "sensitive personal data or information" under the SPDI Rules while they remain in force? (Text not read.) |
| Q-9 | Does the CERT-In "within the Indian jurisdiction" 180-day rule reach logs held by a foreign-operated vendor? |
| Q-10 | Is the vendor DPA (which names no Indian law) a sufficient processor contract? |
| Q-11 | Could the company be notified as a Significant Data Fiduciary, or fall under a section 17(3) class? |
| Q-12 | Does any employment, labour or tax law require retention of assignment records? |
| Q-13 | Does hosting or processing Survey of India boundary data on a foreign-operated service breach its foreign-sharing undertaking? |
| Q-14 | Is the eighteen-month date 13 May 2027 or 14 May 2027, and has any amending notification changed it? |

---

## 8. What this document does not establish

- It does **not** establish that any proposed practice, platform or design **complies**
  with the Act, the Rules, the IT Act, the SPDI Rules, the CERT-In Directions or any
  sector, labour or tax law.
- It did not read the SPDI Rules, any labour or employment statute, any Significant
  Data Fiduciary notification, any section 16 notification, any vendor contract, or the
  Supabase sub-processor list.
- It did not assess whether the workbook as already held by the company complies with
  anything today.
- It gives no opinion on whether employee consent, notice or any Board filing is
  legally required. Those are marked **[Q]** for the company's legal owner.

---

## Appendix A: Sources

All accessed 2026-10-15 from the publishing host. SHA-256 is of the bytes received.
"Read" means the text was extracted and read.

| ID | Source | Verification | URL and SHA-256 |
| --- | --- | --- | --- |
| P1 | **Digital Personal Data Protection Act, 2023**, Gazette of India Extraordinary No. 25, 11 Aug 2023 (Act 22 of 2023) | **Read in full.** Byte-identical to the copy on prsindia.org | <https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf> `4deb23981d3010c8225a2ff6149e7243dc2268455b299e283afebdd7b72a7d15` |
| P2 | **Digital Personal Data Protection Rules, 2025**, G.S.R. 846(E), 13 Nov 2025 | **Read** (Rules 1 to 16, Schedules 2, 3, 7, and the commencement rule). The e-Gazette and MeitY copies are byte-identical | <https://egazette.gov.in/WriteReadData/2025/267650.pdf> and <https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf> `eabc7d05e013144615d78ddc0e8b9c9aac1920e814f4fad38ce6560951f5aa08` |
| P3 | **G.S.R. 843(E)**, commencement of the Act, 13 Nov 2025 | **Read in full** | <https://egazette.gov.in/WriteReadData/2025/267647.pdf> `6df25cd8c76ac8eb18cae81835d51d51128ffbf2ed13262843395efddf0998e5` |
| P4 | **G.S.R. 844(E)**, establishment of the Data Protection Board | **Read in full** | <https://egazette.gov.in/WriteReadData/2025/267648.pdf> `5cc76d1fedf9f93655ef92a297dd7e590a78a145ba0d25a40fe2190faecae65b` |
| P5 | **G.S.R. 845(E)**, Board of four members | **Read in full** | <https://egazette.gov.in/WriteReadData/2025/267649.pdf> `812fe0ce802fe78f0bcbb0c032f74a5110ce23417e9b78889d21a6b7b77ba6a7` |
| P6 | PIB release, "Government notifies DPDP Rules", 14 Nov 2025 | **Read** | <https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014> `703ad0363109c389c026b9f64788b1a9ec2ba6c5fec322783a9ba627f35534da` |
| P7 | **CERT-In Directions** No. 20(3)/2022-CERT-In, 28 Apr 2022, under IT Act s.70B(6) | **Read** | <https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf> `202c2f3953d792dcfb3ecb3634fc82ab75437ee596de89b8d59a211e8e42431f` |
| P8 | Supabase regions page | Read (vendor, **[F]**) | <https://supabase.com/docs/guides/platform/regions> `5a8c6c6f0d09eb8646d40a6e2dace06a5582387501adddcb9dbe2d72ee202e02` |
| P9 | Supabase Data Processing Addendum | Read (vendor, **[F]**; not accepted) | <https://supabase.com/legal/customer-resources/data-processing-addendum> `dd922e269b16111e12bfe3c44745985b79775699370917f58081d67c930d0466` |
| P10 | Supabase security page | Read (vendor marketing, **[R]**) | <https://supabase.com/security> `85d9d13adaaf1b1c1c40d22143b52af001af03421304d389f3d08737294d5bd3` |
| P11 | Microsoft Learn: Fabric home region; Power BI security | Read (vendor, **[F]**) | <https://learn.microsoft.com/en-us/fabric/admin/find-fabric-home-region> `bf2aed12269b158c7b184c044eb41e094a3f6f804f67f76c37d9cddad715a90d`; <https://learn.microsoft.com/en-us/fabric/enterprise/powerbi/service-admin-power-bi-security> `a2d333c4264fba0a2ee9e3b8851633ccc40ad1909d697a3ae017940e3242426a` |
| S-1 | Search summaries and law-firm notes on the 12-month proposal, Supreme Court notice, Board appointments, section 16 status and section 7(i) commentary | **[R]**. Not opened as primary sources | n/a |
| U-1 | **SPDI Rules, 2011 (G.S.R. 313(E))** | **Not read.** MeitY URL returned 404; India Code returned 504 | n/a |
| U-2 | MeitY DPDP page; India Code DPDP page | **Not read.** Dynamic page shell; timeout | n/a |
| U-3 | Supabase sub-processor list (linked document) | **Not read** | n/a |
