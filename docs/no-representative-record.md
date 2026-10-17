# Reviewed "no representative" record (PROPOSED, schema version 1)

Status as of 2026-10-16: a **proposal** for the globe prototype, awaiting review. **No record exists.** Nothing in the
repository, the generated data or the app contains one, the reviewer's local change log has not been read and is not
read by anything, and no white polygon is drawn. Unresolved and ambiguous records stay neutral grey.

Machine-readable schema: [`docs/schemas/no-representative-record.schema.json`](schemas/no-representative-record.schema.json).
The check the app applies is `confirmationProblem` in `src/features/globe/classification.ts`; the tests are in
`tests/unit/globe-reviewed-record.test.mts` and use synthetic fixtures only.

## What white means, and the only thing that can make a unit white

White means: *a reviewed source says that no representative is associated with this unit.* That is a stronger and
different claim from "we found no representative". It is never inferred. A missing workbook row, a `Vacant` marker, a
failed or ambiguous name match, an unmatched block, a missing outline and a statement made in chat or kept in a browser
are all **unresolved**, which is grey and means "not known", not "none". The allocation classifications (Assigned,
Vacant, Unallocated, Data Missing / Unknown) are not touched and are not shown on the globe.

A unit may be white only when a **record** of the kind below exists for exactly that unit, is **approved**, and is **in
force**. One record, one unit, one assertion.

## The record

| Field | Required | Meaning |
| --- | --- | --- |
| `schemaVersion` | yes | `1`. |
| `recordId` | yes | Stable ID of the record itself. Never reused. |
| `supersedes` | no | The `recordId` this record replaces. An approved record is superseded by a new record, never edited. |
| `unit.type` | yes | `district` or `block`. |
| `unit.id` | yes | The app's stable feature ID for the unit (derived from its official LGD code). |
| `unit.lgdCode` | yes | The official Local Government Directory code. All three `unit` fields must agree with the generated dataset, or the record is ignored. |
| `assertion` | yes | Exactly `no-representative-associated`. No other value is accepted: not `vacant`, not `unallocated`, not `unknown`. |
| `source.kind` | yes | What sort of source it is (a signed register, a written confirmation from the responsible manager, an approved master list). |
| `source.reference` | yes | Title, document number or message identifier a reviewer can find again. |
| `source.location` | yes | Where in the source: sheet and row, page and line. |
| `source.retrievedAt` | yes | When the source was read. |
| `source.sha256` | recommended | SHA-256 of the source file as read, when it is a file. |
| `provenance.recordedBy` | yes | Who put the record in the repository. Not the reviewer. |
| `provenance.recordedAt` | yes | When. |
| `effectiveDate` | yes | `YYYY-MM-DD`: the date from which the assertion holds. A future date is not yet in force. |
| `review.status` | yes | `pending`, `approved`, `rejected` or `superseded`. Only `approved` counts. |
| `review.reviewedBy` | for `approved` | The approving reviewer; should be a different person from `provenance.recordedBy`. |
| `review.reviewedAt` | for `approved` | When it was approved. |
| `review.notes` | no | Free text for the reviewer. |

Rules the app applies (`confirmationProblem`), each tested: schema version 1; a `recordId`; `unit.type`, `unit.id`
and `unit.lgdCode` all equal to the unit being drawn; the exact assertion; a source with kind, reference, location and
a valid date (and a valid hash when one is given); provenance; a valid effective date that is not after today; review
status `approved` with a reviewer and a review date. Anything else is refused with the reason, and the unit is shown as
unresolved.

## Where it would live, and how it would be reviewed (proposal)

- **One version-controlled file**, for example `data/reviewed/no-representative-records.json`, holding
  `{ "schemaVersion": 1, "records": [ ... ] }`. It would be under review like code: every addition is a pull request
  that shows the record, the source reference and the reviewer's approval in the diff. It is **not** created now, because
  an empty file would invite filling it before the source has been approved.
- **Review.** A record is added as `pending` by whoever has the source and approved by a different person after they have
  opened the source. Corrections are new records that supersede the old one, so the history stays readable.
- **Consumption (not built).** `scripts/globe/build_overlay.py` would read that file, validate each record with the same
  rules, require every `unit` to match the dataset, and only then attach the record to the unit and set its state. The
  browser would not read it. The app's second lock (`neutraliseUnreviewed`) would still refuse a `no-representative` state
  whose record does not pass.
- **Not acceptable as a source:** the reviewer's browser-local change log, a statement that a row is missing, a vacant
  marker, a name that failed to match, a screenshot, a message with no reference.

## What is deliberately not done in this phase

- No record is created, imported or invented, and none is used as an example in code or data. The tests build synthetic
  records for a synthetic unit inside the test file and never write them anywhere.
- The reviewer's local log is not read, parsed, imported or referenced by the builder or the app, and a test checks that
  neither touches browser storage.
- The builder still has no path that emits `no-representative`, and the legend row for white says "none yet; needs a
  reviewed source record".

## Template (placeholders, not a record)

```text
{
  "schemaVersion": 1,
  "recordId": "<stable id, never reused>",
  "unit": { "type": "<district|block>", "id": "<feature id from the generated dataset>", "lgdCode": <official LGD code> },
  "assertion": "no-representative-associated",
  "source": { "kind": "<kind>", "reference": "<document or message id>", "location": "<sheet/row or page/line>", "retrievedAt": "<date>", "sha256": "<64 hex, if a file>" },
  "provenance": { "recordedBy": "<person>", "recordedAt": "<date>" },
  "effectiveDate": "<YYYY-MM-DD>",
  "review": { "status": "approved", "reviewedBy": "<a different person>", "reviewedAt": "<date>" }
}
```
