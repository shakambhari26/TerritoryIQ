/**
 * The white rule, enforced where the manifest enters the app.
 *
 * White ("confirmed to have no associated representative") may be drawn only for a unit that carries a reviewed
 * source record: an APPROVED record in the proposed schema (docs/no-representative-record.md) that names this very
 * unit, asserts exactly "no-representative-associated", cites a source, and is in force. The base data holds none
 * and scripts/globe/build_overlay.py never emits the state, and the reviewer's browser-local change log is
 * deliberately not read. This is the second lock: if a manifest ever names a unit as "no-representative" without
 * such a record (a hand edit, a later script, a mistake, a record that is pending, rejected, for another unit or not
 * yet in force), the unit is treated as unresolved, which keeps the neutral style and says so, instead of drawing a
 * claim nobody reviewed.
 */

import type { Confirmation, GlobeManifest, UnitState, UnitType } from "./types.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const REVIEW_STATUSES = ["pending", "approved", "rejected", "superseded"];

const text = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Why `record` does not confirm that this unit has no associated representative, or null when it does.
 * `asOf` is the date it must already be in force on (YYYY-MM-DD); it defaults to today.
 */
export function confirmationProblem(record: unknown, unit: { id: string; lgdCode: number }, kind: UnitType, asOf: string = today()): string | null {
  if (!isObject(record)) return "there is no record";
  if (record.schemaVersion !== 1) return "the record is not schema version 1";
  if (!text(record.recordId)) return "the record has no stable record ID";
  const subject = record.unit;
  if (!isObject(subject)) return "the record does not identify a unit";
  if (subject.type !== kind) return `the record is for a ${String(subject.type)}, not a ${kind}`;
  if (subject.id !== unit.id || subject.lgdCode !== unit.lgdCode) return "the record is for a different unit";
  if (record.assertion !== "no-representative-associated") return 'the record does not assert "no-representative-associated"';
  const source = record.source;
  if (!isObject(source) || !text(source.kind) || !text(source.reference) || !text(source.location)) return "the record cites no source (kind, reference and location are required)";
  if (typeof source.retrievedAt !== "string" || !TIMESTAMP.test(source.retrievedAt)) return "the record has no valid source retrieval date";
  if (source.sha256 !== undefined && (typeof source.sha256 !== "string" || !SHA256.test(source.sha256))) return "the record's source hash is not a SHA-256";
  const provenance = record.provenance;
  if (!isObject(provenance) || !text(provenance.recordedBy) || typeof provenance.recordedAt !== "string" || !TIMESTAMP.test(provenance.recordedAt)) return "the record has no provenance (who recorded it, and when)";
  if (typeof record.effectiveDate !== "string" || !DATE.test(record.effectiveDate)) return "the record has no valid effective date";
  if (record.effectiveDate > asOf) return `the record is not in force until ${record.effectiveDate}`;
  const review = record.review;
  if (!isObject(review) || typeof review.status !== "string" || !REVIEW_STATUSES.includes(review.status)) return "the record has no review status";
  if (review.status !== "approved") return `the record's review status is "${review.status}", not "approved"`;
  if (!text(review.reviewedBy) || typeof review.reviewedAt !== "string" || !TIMESTAMP.test(review.reviewedAt)) return "the approval names no reviewer or review date";
  return null;
}

export function hasReviewedConfirmation(unit: { id: string; lgdCode: number; confirmation?: Confirmation | null }, kind: UnitType, asOf?: string): boolean {
  return confirmationProblem(unit.confirmation, unit, kind, asOf) === null;
}

const NOT_HONOURED = "A 'no representative' state was supplied without an approved, reviewed source record for this unit, so it is not shown. Unresolved, not confirmed as unrepresented.";

function settle<T extends { id: string; lgdCode: number; state: UnitState; reason: string; confirmation?: Confirmation | null }>(unit: T, kind: UnitType): T {
  if (unit.state !== "no-representative" || hasReviewedConfirmation(unit, kind)) return unit;
  return { ...unit, state: "unresolved", reason: NOT_HONOURED };
}

export function neutraliseUnreviewed(manifest: GlobeManifest): GlobeManifest {
  const districts = manifest.districts.map((d) => settle(d, "district"));
  const blocks = manifest.blocks.map((b) => settle(b, "block"));
  return {
    ...manifest,
    districts,
    blocks,
    meta: {
      ...manifest.meta,
      counts: {
        ...manifest.meta.counts,
        blocksNoRepresentativeConfirmed: blocks.filter((b) => b.state === "no-representative").length,
        blocksUnresolved: blocks.filter((b) => b.state === "unresolved").length,
      },
    },
  };
}
