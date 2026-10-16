"use client";

import { useId, useState, type FormEvent } from "react";
import { useRecordedBy } from "@/features/allocation/overlay-store";
import type { Change, EffectiveUnit } from "@/features/allocation/overlay";
import type { EffectiveLink } from "../state";
import { ROLE_TITLE, TIER_LABEL } from "../format";
import {
  ROLE_CAPACITY,
  ROLE_LABEL,
  STAFF_ROLES,
  type CrosswalkEntry,
  type GeoFeature,
  type StaffRole,
} from "../types";
import { Field, Note, Problems, buttonClass, inputClass, primaryButtonClass } from "./ui";

/** Validates and stores a change. Returns the problems, or none when it was saved. */
export type SubmitChange = (change: Change) => string[];

type ChangeDraft =
  | { kind: "set-slot"; role: StaffRole; slot: number; names: string[] }
  | { kind: "mark-slot-vacant"; role: StaffRole; slot: number }
  | { kind: "clear-slot"; role: StaffRole; slot: number }
  | { kind: "confirm-unallocated"; evidence: string }
  | { kind: "withdraw-confirmation" }
  | { kind: "review-link"; decision: "confirmed" | "held" | "excluded"; featureId: string | null };

function makeChange(unitId: string, recordedBy: string, reason: string, draft: ChangeDraft): Change {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, at: new Date().toISOString(), recordedBy, unitId, reason, ...draft } as Change;
}

function RecordedBy({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field
      label="Recorded by"
      htmlFor={id}
      hint="A name or role. Kept only in this browser, never sent anywhere. Please do not enter an email address."
    >
      <input id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" maxLength={120} />
    </Field>
  );
}

function Saved({ message }: { message: string | null }) {
  return (
    <p role="status" className="min-h-4 text-xs font-medium text-accent-ink">
      {message}
    </p>
  );
}

// ------------------------------------------------------------------ staffing --

export function StaffForm({ effective, submit }: { effective: EffectiveUnit; submit: SubmitChange }) {
  const uid = useId();
  const [recordedBy, setRecordedBy] = useRecordedBy();
  const [action, setAction] = useState<"assign" | "vacant" | "clear">("assign");
  const [role, setRole] = useState<StaffRole>("PRIMARY");
  const [slot, setSlot] = useState(1);
  const [names, setNames] = useState("");
  const [reason, setReason] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);

  const current = effective.slots.find((s) => s.role === role && s.slot === slot);
  const currentText = !current ? "blank" : current.status === "vacant" ? "marked Vacant" : current.names.join(" / ");

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const unitId = effective.unit.id;
    const people = (role === "ASM" ? names.split("/") : [names]).map((n) => n.trim()).filter((n) => n.length > 0);
    const draft: ChangeDraft =
      action === "assign"
        ? { kind: "set-slot", role, slot, names: people }
        : action === "vacant"
          ? { kind: "mark-slot-vacant", role, slot }
          : { kind: "clear-slot", role, slot };
    const result = submit(makeChange(unitId, recordedBy.trim(), reason.trim(), draft));
    setProblems(result);
    if (result.length === 0) {
      setSaved(`Saved: ${ROLE_TITLE[role]} slot ${slot} ${action === "assign" ? "assigned" : action === "vacant" ? "marked vacant" : "cleared"}.`);
      setNames("");
      setReason("");
    } else {
      setSaved(null);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label="Update staffing for this row" data-testid="staff-form">
      <fieldset>
        <legend className="text-xs font-semibold text-ink">Action</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {(
            [
              ["assign", "Assign a person"],
              ["vacant", "Mark vacant"],
              ["clear", "Clear slot (blank)"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5">
              <input type="radio" name={`${uid}-action`} value={value} checked={action === value} onChange={() => setAction(value)} />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-muted">Blank is not vacant: only an explicit “Mark vacant” records a vacancy.</p>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Role" htmlFor={`${uid}-role`}>
          <select
            id={`${uid}-role`}
            className={inputClass}
            value={role}
            onChange={(e) => {
              setRole(e.target.value as StaffRole);
              setSlot(1);
            }}
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Slot" htmlFor={`${uid}-slot`}>
          <select id={`${uid}-slot`} className={inputClass} value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
            {Array.from({ length: ROLE_CAPACITY[role] }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-xs text-ink-muted">
        Now: <span className="font-medium text-ink">{currentText}</span>
      </p>

      {action === "assign" ? (
        <Field
          label={role === "ASM" ? "Name (two names separated by /)" : "Name"}
          htmlFor={`${uid}-name`}
        >
          <input id={`${uid}-name`} className={inputClass} value={names} onChange={(e) => setNames(e.target.value)} autoComplete="off" maxLength={240} />
        </Field>
      ) : null}

      <Field label="Reason" htmlFor={`${uid}-reason`} hint="Why this change is being made.">
        <textarea id={`${uid}-reason`} className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </Field>
      <RecordedBy id={`${uid}-by`} value={recordedBy} onChange={setRecordedBy} />
      <Problems items={problems} />
      <div className="flex items-center gap-3">
        <button type="submit" className={primaryButtonClass}>
          Save change
        </button>
        <Saved message={saved} />
      </div>
    </form>
  );
}

// --------------------------------------------------- confirmed unallocated --

export function UnallocatedForm({
  effective,
  namedSlots,
  submit,
}: {
  effective: EffectiveUnit;
  namedSlots: number;
  submit: SubmitChange;
}) {
  const uid = useId();
  const [recordedBy, setRecordedBy] = useRecordedBy();
  const [text, setText] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const confirmation = effective.confirmation;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const unitId = effective.unit.id;
    const draft: ChangeDraft = confirmation ? { kind: "withdraw-confirmation" } : { kind: "confirm-unallocated", evidence: text.trim() };
    const result = submit(makeChange(unitId, recordedBy.trim(), text.trim(), draft));
    setProblems(result);
    if (result.length === 0) {
      setSaved(confirmation ? "Confirmation withdrawn." : "Confirmation recorded.");
      setText("");
    } else {
      setSaved(null);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label="Confirmed unallocated" data-testid="unallocated-form">
      {confirmation ? (
        <Note>
          Confirmed unallocated by <strong>{confirmation.confirmedBy}</strong> on {confirmation.at.slice(0, 10)}. Evidence: {confirmation.evidence}
        </Note>
      ) : (
        <Note>
          Use this only when someone has established, with evidence, that nobody covers this row. A missing or blank record is
          never treated as unallocated.
        </Note>
      )}
      {!confirmation && namedSlots > 0 ? (
        <Note tone="warn">
          {namedSlots} named {namedSlots === 1 ? "person is" : "people are"} listed for this row. Saving will mark it as
          conflicting until the records are reconciled.
        </Note>
      ) : null}
      <Field
        label={confirmation ? "Reason for withdrawing" : "Evidence"}
        htmlFor={`${uid}-text`}
        hint={confirmation ? undefined : "What establishes that nobody covers this area?"}
      >
        <textarea id={`${uid}-text`} className={inputClass} rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
      </Field>
      <RecordedBy id={`${uid}-by`} value={recordedBy} onChange={setRecordedBy} />
      <Problems items={problems} />
      <div className="flex items-center gap-3">
        <button type="submit" className={primaryButtonClass}>
          {confirmation ? "Withdraw confirmation" : "Record confirmation"}
        </button>
        <Saved message={saved} />
      </div>
    </form>
  );
}

// ----------------------------------------------------------- geography review --

export function LinkReviewForm({
  unitId,
  entry,
  link,
  review,
  featureOf,
  hasShape,
  districtName,
  submit,
}: {
  unitId: string;
  entry: CrosswalkEntry;
  link: EffectiveLink;
  review: EffectiveUnit["review"];
  featureOf: (featureId: string) => GeoFeature | undefined;
  hasShape: (featureId: string) => boolean;
  districtName: (districtId: string | null) => string;
  submit: SubmitChange;
}) {
  const uid = useId();
  const [recordedBy, setRecordedBy] = useRecordedBy();
  const [decision, setDecision] = useState<"confirmed" | "held" | "excluded">("confirmed");
  const [featureId, setFeatureId] = useState<string>(link.featureId ?? entry.candidates[0]?.featureId ?? "");
  const [note, setNote] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);

  const canConfirm = entry.candidates.length > 0;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const draft: ChangeDraft = {
      kind: "review-link",
      decision,
      featureId: decision === "confirmed" ? featureId || null : null,
    };
    const result = submit(makeChange(unitId, recordedBy.trim(), note.trim(), draft));
    setProblems(result);
    if (result.length === 0) {
      setSaved(`Saved: ${decision === "confirmed" ? "link confirmed" : decision === "held" ? "link held for evidence" : "row excluded from geography"}.`);
      setNote("");
    } else {
      setSaved(null);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label="Review the geography link" data-testid="link-review-form">
      {review.status !== "open" ? (
        <Note>
          Last review: <strong>{review.status}</strong> by {review.reviewer} on {review.at?.slice(0, 10)}. {review.note}
        </Note>
      ) : null}
      <fieldset>
        <legend className="text-xs font-semibold text-ink">Decision</legend>
        <div className="mt-1 space-y-1 text-sm">
          <label className="flex items-start gap-1.5">
            <input
              type="radio"
              name={`${uid}-decision`}
              className="mt-1"
              checked={decision === "confirmed"}
              disabled={!canConfirm}
              onChange={() => setDecision("confirmed")}
            />
            <span>Confirm which official unit this row refers to{canConfirm ? "" : " (no candidates to choose from)"}</span>
          </label>
          <label className="flex items-start gap-1.5">
            <input type="radio" name={`${uid}-decision`} className="mt-1" checked={decision === "held"} onChange={() => setDecision("held")} />
            <span>Hold: more evidence is needed (the link stays as it is)</span>
          </label>
          <label className="flex items-start gap-1.5">
            <input type="radio" name={`${uid}-decision`} className="mt-1" checked={decision === "excluded"} onChange={() => setDecision("excluded")} />
            <span>Exclude this row from geography (it keeps its allocation data)</span>
          </label>
        </div>
      </fieldset>

      {decision === "confirmed" && canConfirm ? (
        <Field label="Official unit" htmlFor={`${uid}-feature`}>
          <select id={`${uid}-feature`} className={inputClass} value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
            {entry.candidates.map((candidate) => {
              const feature = featureOf(candidate.featureId);
              return (
                <option key={candidate.featureId} value={candidate.featureId}>
                  {feature?.name ?? candidate.featureId} · {feature?.kind === "district" ? "district" : districtName(feature?.districtId ?? null)} ·{" "}
                  {TIER_LABEL[candidate.tier]} · {hasShape(candidate.featureId) ? "has outline" : "no outline"}
                </option>
              );
            })}
          </select>
        </Field>
      ) : null}

      <Field label="Note" htmlFor={`${uid}-note`} hint="The evidence or reasoning behind the decision.">
        <textarea id={`${uid}-note`} className={inputClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
      <RecordedBy id={`${uid}-by`} value={recordedBy} onChange={setRecordedBy} />
      <Problems items={problems} />
      <div className="flex items-center gap-3">
        <button type="submit" className={primaryButtonClass}>
          Save review
        </button>
        <Saved message={saved} />
      </div>
    </form>
  );
}

export function ChangeList({ changes, onUndoLast }: { changes: readonly Change[]; onUndoLast?: () => void }) {
  if (changes.length === 0) return <p className="text-xs text-ink-muted">No local changes to this row.</p>;
  return (
    <div className="space-y-2">
      <ol className="space-y-1.5" data-testid="change-list">
        {changes.map((change) => (
          <li key={change.id} className="rounded-md border border-line bg-surface-muted px-3 py-2 text-xs leading-5">
            <span className="font-semibold text-ink">{describeChange(change)}</span>
            <span className="block text-ink-muted">
              {change.recordedBy} · {change.at.slice(0, 16).replace("T", " ")} UTC · {change.reason}
            </span>
          </li>
        ))}
      </ol>
      {onUndoLast ? (
        <button type="button" className={buttonClass} onClick={onUndoLast}>
          Undo the most recent change (any row)
        </button>
      ) : null}
    </div>
  );
}

export function describeChange(change: Change): string {
  switch (change.kind) {
    case "set-slot":
      return `${ROLE_TITLE[change.role]} ${change.slot}: assigned ${change.names.join(" / ")}`;
    case "mark-slot-vacant":
      return `${ROLE_TITLE[change.role]} ${change.slot}: marked vacant`;
    case "clear-slot":
      return `${ROLE_TITLE[change.role]} ${change.slot}: cleared`;
    case "confirm-unallocated":
      return "Confirmed unallocated";
    case "withdraw-confirmation":
      return "Confirmation withdrawn";
    case "review-link":
      return `Geography link: ${change.decision}`;
  }
}
