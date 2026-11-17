"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ROLE_COLOUR, ROLE_NAME } from "../staffing";
import { CHANGE_ROLES, KIND_INFO, REASONS, type ChangeKind, type ChangeRole, type Cover, type TeamChangeRequest } from "../team-change";
import { sendTeamChange } from "../team-clients/change";
import { fetchTeamPeople } from "../team-clients/people";
import type { ChangeOutcome, TeamPerson } from "../team-types";
import type { ManifestBlock, ManifestDistrict } from "../types";
import { ChangeLists } from "./TeamUpdates";

/**
 * "Make a team change": the guided way to record that someone joined, left, moved area or changed role, the way a
 * sales-operations desk does it. Five short steps: what happened → who → where (and who covers the places they
 * leave) → why (one or more reasons) and from when → check exactly what changes on the map, then save. Every change is a
 * new version, shows to everyone at once, and can be undone from the change history.
 */

const STEPS = ["What happened", "Who", "Where", "Why & when", "Check & save"] as const;

export const KIND_ICON: Record<ChangeKind, ReactNode> = {
  join: <path d="M8 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 17c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M15.5 6.5v5M13 9h5" />,
  exit: <path d="M8 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 17c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M13 9h5" />,
  move: <path d="M10 17.5s5.5-5.2 5.5-9.5a5.5 5.5 0 0 0-11 0c0 4.3 5.5 9.5 5.5 9.5zM10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
  role: <path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" />,
};
export const KIND_TONE: Record<ChangeKind, string> = { join: "#184f95", exit: "#c62828", move: "#5b5fc7", role: "#b26a00" };

export function KindIcon({ kind, size = 20 }: { kind: ChangeKind; size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {KIND_ICON[kind]}
    </svg>
  );
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function RolePick({ value, onChange, only, label }: { value: ChangeRole | null; onChange: (r: ChangeRole) => void; only?: string[]; label: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {CHANGE_ROLES.filter((r) => !only || only.includes(r)).map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={value === r}
            onClick={() => onChange(r)}
            className={cn("flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ring-1 transition", value === r ? "bg-primary-soft ring-2 ring-primary" : "bg-white ring-line hover:ring-ink/30")}
          >
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: ROLE_COLOUR[r] }} />
            <span className="font-medium text-ink">{ROLE_NAME[r]}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PlacePicker({ blocks, districts, chosen, onToggle, exclude }: { blocks: readonly ManifestBlock[]; districts: readonly ManifestDistrict[]; chosen: string[]; onToggle: (id: string) => void; exclude?: Set<string> }) {
  const [district, setDistrict] = useState("");
  const [query, setQuery] = useState("");
  const districtName = useMemo(() => new Map(districts.map((d) => [d.id, d.name])), [districts]);
  const withBlocks = useMemo(() => districts.filter((d) => blocks.some((b) => b.districtId === d.id)).sort((a, b) => a.name.localeCompare(b.name)), [blocks, districts]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blocks
      .filter((b) => !exclude?.has(b.id) && (!district || b.districtId === district) && (!q || b.name.toLowerCase().includes(q) || (districtName.get(b.districtId ?? "") ?? "").toLowerCase().includes(q)))
      .sort((a, b) => (districtName.get(a.districtId ?? "") ?? "").localeCompare(districtName.get(b.districtId ?? "") ?? "") || a.name.localeCompare(b.name))
      .slice(0, 120);
  }, [blocks, district, districtName, exclude, query]);
  return (
    <div className="rounded-xl ring-1 ring-line">
      <div className="flex flex-wrap gap-2 border-b border-line p-2">
        <select value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District" className="h-9 rounded-lg bg-white px-2 text-sm ring-1 ring-line">
          <option value="">All districts</option>
          {withBlocks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a block…" aria-label="Search a block" className="h-9 min-w-[8rem] flex-1 rounded-lg bg-white px-3 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <ul className="max-h-56 overflow-y-auto p-1" aria-label="Places">
        {list.map((b) => {
          const on = chosen.includes(b.id);
          return (
            <li key={b.id}>
              <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm", on ? "bg-primary-soft" : "hover:bg-surface-muted")}>
                <input type="checkbox" checked={on} onChange={() => onToggle(b.id)} className="h-4 w-4 accent-[#184f95]" />
                <span className="flex-1 text-ink">
                  {b.name} <span className="text-ink-muted">· {districtName.get(b.districtId ?? "") ?? ""}</span>
                </span>
                <span className={cn("rounded-full px-1.5 text-[0.6875rem] tabular-nums", b.staff <= 2 ? "bg-[#c62828]/10 text-[#c62828]" : "bg-surface-muted text-ink-muted")} title="People working there now">
                  {b.staff} {b.staff === 1 ? "person" : "people"}
                </span>
              </label>
            </li>
          );
        })}
        {!list.length ? <li className="px-2 py-3 text-sm text-ink-muted">No place matches.</li> : null}
      </ul>
    </div>
  );
}

function CoverChoice({ cover, onCover, handoverTo, onHandover, people, exceptName, count }: { cover: Cover; onCover: (c: Cover) => void; handoverTo: string; onHandover: (n: string) => void; people: TeamPerson[]; exceptName: string; count: number }) {
  const options: Array<{ id: Cover; title: string; help: string }> = [
    { id: "vacant", title: "Keep as vacant posts", help: "Recommended. The places show as a hiring need on the map." },
    { id: "handover", title: "Hand over to a colleague", help: "Someone already in the team takes over the dealers and places." },
    { id: "none", title: "Just remove", help: "No post is kept (for example, a duplicate or a mistake)." },
  ];
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">
        Who looks after the {count === 1 ? "place" : `${count} places`} they leave?
      </legend>
      <div className="space-y-2">
        {options.map((o) => (
          <label key={o.id} className={cn("flex cursor-pointer gap-3 rounded-xl p-3 ring-1", cover === o.id ? "bg-primary-soft ring-2 ring-primary" : "ring-line hover:ring-ink/30")}>
            <input type="radio" name="cover" checked={cover === o.id} onChange={() => onCover(o.id)} className="mt-0.5 accent-[#184f95]" />
            <span>
              <span className="block text-sm font-semibold text-ink">{o.title}</span>
              <span className="block text-xs text-ink-muted">{o.help}</span>
            </span>
          </label>
        ))}
      </div>
      {cover === "handover" ? (
        <select value={handoverTo} onChange={(e) => onHandover(e.target.value)} aria-label="Hand over to" className="mt-2 h-10 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-line">
          <option value="">Choose a colleague…</option>
          {people
            .filter((p) => p.name.toLowerCase() !== exceptName.toLowerCase())
            .map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} · {p.roles.map((r) => ROLE_NAME[r] ?? r).join(" & ")} · {p.places.length} {p.places.length === 1 ? "place" : "places"}
              </option>
            ))}
        </select>
      ) : null}
    </fieldset>
  );
}

interface Props {
  initialKind: ChangeKind | null;
  blocks: readonly ManifestBlock[];
  districts: readonly ManifestDistrict[];
  onClose: () => void;
  onSaved: (summary: string) => void;
}

export function TeamChangeWizard({ initialKind, blocks, districts, onClose, onSaved }: Props) {
  const [step, setStep] = useState(initialKind ? 1 : 0);
  const [kind, setKind] = useState<ChangeKind | null>(initialKind);
  const [people, setPeople] = useState<TeamPerson[] | null>(null);
  const [peopleError, setPeopleError] = useState("");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<ChangeRole | null>(null);
  const [newRole, setNewRole] = useState<ChangeRole | null>(null);
  const [addPlaces, setAddPlaces] = useState<string[]>([]);
  const [dropPlaces, setDropPlaces] = useState<string[]>([]);
  const [cover, setCover] = useState<Cover>("vacant");
  const [handoverTo, setHandoverTo] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [by, setBy] = useState("");
  const [check, setCheck] = useState<ChangeOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchTeamPeople(controller.signal).then(setPeople, (e: unknown) => {
      if (!controller.signal.aborted) setPeopleError(e instanceof Error ? e.message : "The team list could not be loaded.");
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("[data-step-focus]")?.focus();
  }, [step]);

  const person = useMemo(() => people?.find((p) => p.name.toLowerCase() === name.trim().toLowerCase()) ?? null, [name, people]);
  const placesInRole = useMemo(() => (person && role ? person.places.filter((p) => person.rolesAt[p.blockId]?.includes(role)) : []), [person, role]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (people ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.places.some((x) => x.place.toLowerCase().includes(q) || x.district.toLowerCase().includes(q))).slice(0, 60);
  }, [people, search]);

  const chooseKind = (k: ChangeKind) => {
    setKind(k);
    setReasons([]);
    setName("");
    setRole(null);
    setNewRole(null);
    setAddPlaces([]);
    setDropPlaces([]);
    setCover("vacant");
    setHandoverTo("");
    setCheck(null);
    setStep(1);
  };
  const pickPerson = (p: TeamPerson) => {
    setName(p.name);
    setRole(p.roles.length === 1 ? (p.roles[0] as ChangeRole) : null);
    setNewRole(null);
    setDropPlaces([]);
    setAddPlaces([]);
  };
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const request = (dryRun: boolean): TeamChangeRequest | null =>
    kind && role
      ? {
          kind,
          name: name.trim(),
          role: kind === "exit" ? ((person?.roles[0] as ChangeRole) ?? role) : role,
          newRole: kind === "role" ? newRole : null,
          addPlaces: kind === "join" || kind === "move" ? addPlaces : [],
          dropPlaces: kind === "move" ? dropPlaces : [],
          cover: kind === "exit" || (kind === "move" && dropPlaces.length) ? cover : "none",
          handoverTo: cover === "handover" && (kind === "exit" || (kind === "move" && dropPlaces.length)) ? handoverTo || null : null,
          reasons,
          note: note.trim(),
          effectiveDate,
          by: by.trim(),
          dryRun,
        }
      : null;

  // What is still missing before the next step, in plain words (shown under the Next button).
  const missing = (() => {
    if (step === 1) {
      if (!kind) return "Choose what happened.";
      if (kind === "join") return name.trim().length < 2 ? "Write their full name." : !role ? "Choose their role." : "";
      if (!person) return peopleError || "Choose the person from the list.";
      if (kind !== "exit" && !role) return "Choose which of their roles this is about.";
      return "";
    }
    if (step === 2) {
      if (kind === "join" && !addPlaces.length) return "Choose at least one place.";
      if (kind === "move" && !addPlaces.length && !dropPlaces.length) return "Choose places to add or to take away.";
      if (kind === "role" && (!newRole || newRole === role)) return "Choose the new role.";
      const leaving = kind === "exit" || (kind === "move" && dropPlaces.length > 0);
      if (leaving && cover === "handover" && !handoverTo) return "Choose the colleague who takes over.";
      return "";
    }
    if (step === 3) {
      if (!reasons.length) return "Choose at least one reason.";
      if (reasons.includes("other") && note.trim().length < 3) return "Write a short note for “Other reason”.";
      if (!effectiveDate) return "Choose the date it takes effect.";
      if (by.trim().length < 2) return "Write your name.";
      return "";
    }
    return "";
  })();

  const next = async () => {
    setError("");
    if (step === 3) {
      const req = request(true);
      if (!req) return;
      setBusy(true);
      try {
        setCheck(await sendTeamChange(req));
        setStep(4);
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not work.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 1 && kind === "exit" && person) setRole(person.roles[0] as ChangeRole);
    setStep((s) => s + 1);
  };
  const save = async () => {
    const req = request(false);
    if (!req) return;
    setBusy(true);
    setError("");
    try {
      const done = await sendTeamChange(req);
      onSaved(done.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const tone = kind ? KIND_TONE[kind] : "#184f95";
  const leavingCount = kind === "exit" ? (person?.places.length ?? 0) : dropPlaces.length;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-3 backdrop-blur-[2px]" data-testid="team-change-wizard">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="team-change-title" className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-float">
        {/* header + steps */}
        <div className="border-b border-line p-4" style={{ background: `linear-gradient(135deg, ${tone}14, #ffffff 60%)` }}>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ background: tone }}>
              {kind ? <KindIcon kind={kind} /> : <KindIcon kind="join" />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="team-change-title" className="text-base font-semibold text-ink">
                {kind ? KIND_INFO[kind].title : "Make a team change"}
              </h2>
              <p className="text-xs text-ink-muted">Step {step + 1} of 5 · {STEPS[step]}</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="-m-1 rounded-lg p-1 text-ink-muted hover:bg-surface-muted hover:text-ink">
              <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="m5.5 5.5 9 9m0-9-9 9" />
              </svg>
            </button>
          </div>
          <ol className="mt-3 grid grid-cols-5 gap-1.5" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} className="min-w-0">
                <span className="block h-1.5 rounded-full transition-colors" style={{ background: i <= step ? tone : "#e3e8f0" }} />
                <span className={cn("mt-1 hidden truncate text-[0.625rem] sm:block", i === step ? "font-semibold text-ink" : "text-ink-muted")}>{s}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {step === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(KIND_INFO) as ChangeKind[]).map((k, i) => (
                <button
                  key={k}
                  type="button"
                  {...(i === 0 ? { "data-step-focus": true } : {})}
                  onClick={() => chooseKind(k)}
                  className="group flex gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-card hover:ring-2"
                  data-testid={`team-change-kind-${k}`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${KIND_TONE[k]}14`, color: KIND_TONE[k] }}>
                    <KindIcon kind={k} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{KIND_INFO[k].title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-ink-muted">{KIND_INFO[k].help}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {step === 1 && kind === "join" ? (
            <>
              <label className="block text-sm font-semibold text-ink">
                Full name
                <input data-step-focus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="As it should appear on the map" className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-base font-normal ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-primary" data-testid="team-change-name" />
              </label>
              {person ? <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-ink">{person.name} is already in the team. To give them new places use “Change area”; for a new role, “Change role”.</p> : null}
              <RolePick label="Role" value={role} onChange={setRole} />
            </>
          ) : null}

          {step === 1 && kind && kind !== "join" ? (
            <>
              <input data-step-focus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a name, block or district…" aria-label="Search the team" className="h-11 w-full rounded-xl bg-white px-3 text-base ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-primary" data-testid="team-change-search" />
              {peopleError ? <p className="text-sm text-warn-ink">{peopleError}</p> : null}
              {!people && !peopleError ? <p className="text-sm text-ink-muted">Loading the team…</p> : null}
              <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label="People">
                {matches.map((p) => {
                  const on = person?.name === p.name;
                  return (
                    <li key={p.name}>
                      <button type="button" onClick={() => pickPerson(p)} aria-pressed={on} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ring-1", on ? "bg-primary-soft ring-2 ring-primary" : "ring-transparent hover:bg-surface-muted")}>
                        <span className="flex gap-0.5">
                          {p.roles.map((r) => (
                            <span key={r} aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_COLOUR[r] }} />
                          ))}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink">{p.name}</span>
                          <span className="block truncate text-xs text-ink-muted">
                            {p.roles.map((r) => ROLE_NAME[r] ?? r).join(" & ")} · {[...new Set(p.places.map((x) => x.district))].join(", ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                          {p.places.length} {p.places.length === 1 ? "place" : "places"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {person && kind !== "exit" && person.roles.length > 1 ? <RolePick label={`Which of ${person.name}'s roles?`} value={role} onChange={setRole} only={person.roles} /> : null}
            </>
          ) : null}

          {step === 2 && kind === "join" ? (
            <>
              <p className="text-sm font-semibold text-ink">Which places will {name.trim() || "they"} cover?</p>
              <PlacePicker blocks={blocks} districts={districts} chosen={addPlaces} onToggle={(id) => toggle(addPlaces, setAddPlaces, id)} />
              <p className="text-xs text-ink-muted">A vacant {role ? ROLE_NAME[role] : ""} post in a chosen place is filled first. Red counts show places short of people.</p>
            </>
          ) : null}

          {step === 2 && kind === "exit" && person ? (
            <>
              <div className="rounded-xl bg-surface-muted p-3">
                <p className="text-sm font-semibold text-ink">
                  {person.name} covers {person.places.length} {person.places.length === 1 ? "place" : "places"}
                </p>
                <p className="mt-1 text-xs text-ink-muted">{person.places.map((x) => `${x.place} (${x.district})`).join(", ")}</p>
              </div>
              <CoverChoice cover={cover} onCover={setCover} handoverTo={handoverTo} onHandover={setHandoverTo} people={people ?? []} exceptName={person.name} count={leavingCount} />
            </>
          ) : null}

          {step === 2 && kind === "move" && person && role ? (
            <>
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">
                  Places {person.name} covers now as {ROLE_NAME[role]} <span className="font-normal text-ink-muted">(tick to take away)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {placesInRole.map((x) => {
                    const off = dropPlaces.includes(x.blockId);
                    return (
                      <button key={x.blockId} type="button" aria-pressed={off} onClick={() => toggle(dropPlaces, setDropPlaces, x.blockId)} className={cn("rounded-full px-2.5 py-1 text-xs ring-1", off ? "bg-[#c62828]/10 text-[#c62828] line-through ring-[#c62828]/40" : "bg-white text-ink ring-line hover:ring-ink/30")}>
                        {x.place} <span className="opacity-70">· {x.district}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">New places to add</p>
                <PlacePicker blocks={blocks} districts={districts} chosen={addPlaces} onToggle={(id) => toggle(addPlaces, setAddPlaces, id)} exclude={new Set(placesInRole.map((x) => x.blockId))} />
              </div>
              {dropPlaces.length ? <CoverChoice cover={cover} onCover={setCover} handoverTo={handoverTo} onHandover={setHandoverTo} people={people ?? []} exceptName={person.name} count={leavingCount} /> : null}
            </>
          ) : null}

          {step === 2 && kind === "role" && person && role ? (
            <>
              <p className="rounded-xl bg-surface-muted p-3 text-sm text-ink">
                {person.name} is <strong>{ROLE_NAME[role]}</strong> in {placesInRole.length} {placesInRole.length === 1 ? "place" : "places"}. The places stay the same; only the role changes.
              </p>
              <RolePick label="New role" value={newRole} onChange={setNewRole} only={CHANGE_ROLES.filter((r) => r !== role)} />
            </>
          ) : null}

          {step === 3 && kind ? (
            <>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">
                  Why? <span className="font-normal text-ink-muted">Choose all that apply.</span>
                </legend>
                <div className="flex flex-wrap gap-2" data-testid="team-change-reasons">
                  {REASONS[kind].map((r, i) => {
                    const on = reasons.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        {...(i === 0 ? { "data-step-focus": true } : {})}
                        aria-pressed={on}
                        onClick={() => toggle(reasons, setReasons, r.id)}
                        className={cn("rounded-full px-3 py-1.5 text-sm ring-1", on ? "text-white ring-transparent" : "bg-white text-ink ring-line hover:ring-ink/30")}
                        style={on ? { background: tone } : undefined}
                      >
                        {on ? "✓ " : ""}
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <label className="block text-sm font-semibold text-ink">
                Note <span className="font-normal text-ink-muted">{reasons.includes("other") ? "(needed for “Other reason”)" : "(optional: notice period, replacement plan, dealer handover…)"}</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm font-normal ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-primary" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-ink">
                  Takes effect from
                  <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm font-normal ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-primary" />
                </label>
                <label className="block text-sm font-semibold text-ink">
                  Your name
                  <input value={by} onChange={(e) => setBy(e.target.value)} maxLength={60} autoComplete="name" placeholder="Shown as who recorded this" className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm font-normal ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-primary" data-testid="team-change-by" />
                </label>
              </div>
            </>
          ) : null}

          {step === 4 && check ? (
            <>
              <div className="rounded-xl p-3 text-sm text-ink" style={{ background: `${tone}0d`, boxShadow: `inset 0 0 0 1px ${tone}55` }}>
                <p className="font-semibold">This will be saved:</p>
                <p className="mt-1">{check.summary}</p>
              </div>
              <ChangeLists changes={check.changes} onShow={() => undefined} />
              {check.changes.vacancies.before !== check.changes.vacancies.after ? (
                <p className="text-xs text-ink-muted">
                  Vacant posts: {check.changes.vacancies.before} → <strong className="text-ink">{check.changes.vacancies.after}</strong>
                </p>
              ) : null}
              <p className="text-xs text-ink-muted">Everyone with the map open sees this within 30 seconds. It can be undone from Change history.</p>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-ink" data-testid="team-change-error">
              {error}
            </p>
          ) : null}
        </div>

        {/* footer */}
        <div className="flex items-center gap-2 border-t border-line p-4">
          {step > 0 ? (
            <button type="button" onClick={() => (setError(""), setStep((s) => (s === 1 && initialKind ? 0 : s - 1)))} disabled={busy} className="h-10 rounded-xl px-4 text-sm font-semibold text-ink hover:bg-surface-muted">
              Back
            </button>
          ) : null}
          <p className="min-w-0 flex-1 truncate text-right text-xs text-ink-muted" aria-live="polite">
            {step > 0 && step < 4 ? missing : ""}
          </p>
          {step > 0 && step < 4 ? (
            <button type="button" onClick={() => void next()} disabled={busy || !!missing} className="h-10 shrink-0 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: tone }} data-testid="team-change-next">
              {busy ? "Checking…" : step === 3 ? "Check the change" : "Next"}
            </button>
          ) : null}
          {step === 4 ? (
            <button type="button" onClick={() => void save()} disabled={busy} className="h-10 shrink-0 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: tone }} data-testid="team-change-save">
              {busy ? "Saving…" : "Save this change"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
