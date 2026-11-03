import Link from "next/link";
import { cn } from "@/lib/cn";
import { CHANNELS, LANGUAGES, type Contact, type Draft, type MessagingStatus, type SentMessage } from "../types";
import { visitHref } from "../links";
import { Section } from "./parts";

const input = "mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink";
const label = "block text-xs font-medium text-ink-muted";
const primary = "inline-flex h-9 items-center rounded-md bg-navy-950 px-4 text-sm font-semibold text-on-navy hover:bg-navy-800";
const secondary = "inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:border-ink-subtle";

export function SubNav({ current }: { current: "insights" | "messages" | "keywords" | "how" }) {
  const items = [
    { id: "insights", href: "/visit-insights", label: "Insights" },
    { id: "messages", href: "/visit-insights/messages", label: "Messages to reps" },
    { id: "keywords", href: "/visit-insights/keywords", label: "Keyword database" },
    { id: "how", href: "/visit-insights/how-it-works", label: "How the AI scores" },
  ];
  return (
    <nav aria-label="Visit Insights sections" className="flex flex-wrap gap-1 border-b border-line">
      {items.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          aria-current={i.id === current ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            i.id === current ? "border-navy-950 text-ink" : "border-transparent text-ink-muted hover:text-ink",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function Notice({ ok, yes, no }: { ok: string | null; yes: string; no: string }) {
  if (ok === null) return null;
  return (
    <p
      role={ok === "1" ? "status" : "alert"}
      className={cn("rounded-lg px-4 py-3 text-sm", ok === "1" ? "bg-accent-soft text-accent-ink" : "bg-red-50 text-red-800")}
    >
      {ok === "1" ? yes : no}
    </p>
  );
}

/**
 * Step 1 of sending: ask the AI (or, without AI, the playbook) to analyse the case and draft a solution. A plain GET
 * form, so the draft is rendered on the server into the send form below; nothing is sent until head office presses Send.
 */
export function DraftForm({
  action,
  visitKey,
  rep,
  reps,
  aiEnabled,
}: {
  action: string;
  visitKey?: string;
  rep: string | null;
  reps?: string[];
  aiEnabled: boolean;
}) {
  return (
    <form method="get" action={action} className="grid gap-3 rounded-xl border border-dashed border-line-strong p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="draft" value="1" />
      {visitKey ? <input type="hidden" name="key" value={visitKey} /> : null}
      {reps ? (
        <label className={label}>
          Rep
          <select name="rep" defaultValue={rep ?? ""} required className={input}>
            <option value="" disabled>
              Choose a rep
            </option>
            {reps.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label className={label}>
        Type
        <select name="kind" defaultValue="todo" className={input}>
          <option value="todo">To-do list</option>
          <option value="suggestion">Suggestion</option>
        </select>
      </label>
      <label className={label}>
        Language
        <select name="lang" defaultValue="en" className={input}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <label className={cn(label, reps ? "sm:col-span-3" : "sm:col-span-1")}>
        Your instruction to the AI (optional)
        <input name="instruction" maxLength={500} placeholder="e.g. offer a mason meet, be firm on payment" className={input} />
      </label>
      <button type="submit" className={secondary}>
        {aiEnabled ? "✨ Analyse & draft with AI" : "Draft from playbook"}
      </button>
    </form>
  );
}

export function DraftAnalysis({ d }: { d: Draft }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted p-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
        {d.source === "ai" ? "AI analysis of the solution" : "Playbook draft"} · review before sending
      </p>
      {d.note ? <p className="mt-1 text-xs text-ink-muted">{d.note}</p> : null}
      <p className="mt-2 text-ink">
        <span className="font-semibold">Situation: </span>
        {d.analysis}
      </p>
      {d.options.length ? (
        <div className="mt-2">
          <p className="font-semibold text-ink">Options considered</p>
          <ol className="ml-5 list-decimal text-ink">
            {d.options.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ol>
        </div>
      ) : null}
      <p className="mt-2 text-ink">
        <span className="font-semibold">Recommended: </span>
        {d.recommendation}
      </p>
    </div>
  );
}

function channelHint(id: string, status: MessagingStatus | null, contact: Contact | null): string | null {
  if (id === "in_app") return "Rep's inbox + reply link";
  if (status && !status.channels[id as "whatsapp" | "email"]) return "Not set up on the server yet";
  if (id === "whatsapp" && !contact?.has_whatsapp) return "No number saved for this rep";
  if (id === "email" && !contact?.has_email) return "No email saved for this rep";
  return id === "whatsapp" ? `To ${contact?.whatsapp}` : `To ${contact?.email}`;
}

/** Step 2: review, edit and send. Plain form post to /api/visit-insights/messages. */
export function SendForm({
  rep,
  visitKey,
  draft,
  status,
  contact,
}: {
  rep: string;
  visitKey: string | null;
  draft: Draft | null;
  status: MessagingStatus | null;
  contact: Contact | null;
}) {
  return (
    <form method="post" action="/api/visit-insights/messages" className="grid gap-3">
      <input type="hidden" name="rep_name" value={rep} />
      {visitKey ? <input type="hidden" name="visit_key" value={visitKey} /> : null}
      <input type="hidden" name="ai_drafted" value={draft?.source === "ai" ? "1" : "0"} />
      <input type="hidden" name="kind" value={draft?.kind ?? "todo"} />
      <p className="text-sm text-ink">
        To <span className="font-semibold">{rep}</span>
      </p>
      <label className={label}>
        Title
        <input name="title" required minLength={2} maxLength={200} defaultValue={draft?.title ?? ""} className={input} />
      </label>
      <label className={label}>
        Message
        <textarea name="body" rows={4} maxLength={4000} defaultValue={draft?.message ?? ""} className={input} />
      </label>
      <label className={label}>
        To-dos (one per line; the rep ticks them off)
        <textarea name="todos" rows={4} defaultValue={draft?.todos.join("\n") ?? ""} className={input} />
      </label>
      <fieldset>
        <legend className={label}>Send by</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {CHANNELS.map((c) => {
            const hint = channelHint(c.id, status, contact);
            const usable = c.id === "in_app" || (status?.channels[c.id] && (c.id === "whatsapp" ? contact?.has_whatsapp : contact?.has_email));
            return (
              <label key={c.id} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <input type="checkbox" name="channels" value={c.id} defaultChecked={Boolean(usable)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-ink">{c.label}</span>
                  {hint ? <span className="block text-xs text-ink-subtle">{hint}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div>
        <button type="submit" className={primary}>
          Send to {rep.split(" ")[0]}
        </button>
      </div>
    </form>
  );
}

const STATUS_STYLE: Record<SentMessage["status"], string> = {
  sent: "bg-surface-muted text-ink-muted",
  read: "bg-amber-50 text-amber-900",
  replied: "bg-accent-soft text-accent-ink",
  done: "bg-green-50 text-green-800",
};
const DELIVERY_ICON: Record<string, string> = { delivered: "✓", sent: "✓", failed: "✕", not_configured: "–", skipped: "–" };

export function MessageThread({ m }: { m: SentMessage }) {
  const done = m.todos.filter((t) => t.done).length;
  return (
    <article id={`m${m.id}`} className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", STATUS_STYLE[m.status])}>{m.status}</span>
        <span className="text-sm font-semibold text-ink">{m.title}</span>
        {m.ai_drafted ? <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">AI-drafted</span> : null}
        <span className="ml-auto text-xs text-ink-subtle">
          to {m.rep_name} · {m.created_at ? new Date(m.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
        </span>
      </div>
      {m.body ? <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{m.body}</p> : null}
      {m.todos.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          <li className="text-xs text-ink-muted">
            To-dos: {done}/{m.todos.length} done
          </li>
          {m.todos.map((t, i) => (
            <li key={i} className={cn("text-ink", t.done && "text-ink-subtle line-through")}>
              {t.done ? "☑" : "☐"} {t.text}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-xs text-ink-subtle">
        {Object.entries(m.deliveries)
          .map(([ch, d]) => `${CHANNELS.find((c) => c.id === ch)?.label ?? ch} ${DELIVERY_ICON[d.status] ?? ""} ${d.status.replace("_", " ")}${d.detail && d.status !== "sent" && d.status !== "delivered" ? ` (${d.detail})` : ""}`)
          .join(" · ")}
        {m.visit_key ? (
          <>
            {" · "}
            <Link href={visitHref(m.visit_key)} className="text-accent-ink underline">
              the visit
            </Link>
          </>
        ) : null}
      </p>
      <p className="mt-2 flex flex-wrap gap-2 text-xs">
        <a href={m.share.whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-md border border-line-strong px-2 py-1 font-medium text-ink hover:border-ink-subtle">
          Share on my WhatsApp
        </a>
        <a href={m.share.email} className="rounded-md border border-line-strong px-2 py-1 font-medium text-ink hover:border-ink-subtle">
          Email from my mail app
        </a>
        {m.reply_link ? (
          <a href={m.reply_link} target="_blank" rel="noopener noreferrer" className="rounded-md px-2 py-1 text-accent-ink underline">
            Rep&rsquo;s reply page
          </a>
        ) : null}
      </p>
      {m.replies.length ? (
        <div className="mt-3 grid gap-2 border-t border-line pt-3">
          {m.replies.map((r, i) => (
            <p key={i} className={cn("rounded-lg px-3 py-2 text-sm", r.author === "rep" ? "bg-accent-soft text-accent-ink" : "bg-surface-muted text-ink")}>
              <span className="block text-xs font-semibold">{r.author === "rep" ? m.rep_name : "Head office"}</span>
              {r.text}
            </p>
          ))}
        </div>
      ) : null}
      <form method="post" action="/api/visit-insights/notes" className="mt-3 flex gap-2">
        <input type="hidden" name="id" value={m.id} />
        <input name="text" required maxLength={2000} placeholder="Answer the rep…" aria-label={`Answer ${m.rep_name}`} className={cn(input, "mt-0")} />
        <button type="submit" className={secondary}>
          Add
        </button>
      </form>
    </article>
  );
}

export function ContactsTable({ contacts }: { contacts: Contact[] }) {
  return (
    <Section title="Rep contacts" hint="WhatsApp and email used for messages. Stored by the Visit Intelligence service; shown masked.">
      <div className="grid gap-2">
        {contacts.map((c) => (
          <form key={c.rep_name} method="post" action="/api/visit-insights/contacts" className="grid items-end gap-2 sm:grid-cols-[minmax(0,14rem)_1fr_1fr_auto]">
            <input type="hidden" name="rep_name" value={c.rep_name} />
            <span className="text-sm font-medium text-ink">{c.rep_name}</span>
            <label className={label}>
              WhatsApp {c.whatsapp ? <span className="text-ink-subtle">(now {c.whatsapp})</span> : null}
              <input name="whatsapp" inputMode="tel" maxLength={20} placeholder="10-digit mobile" className={input} />
            </label>
            <label className={label}>
              Email {c.email ? <span className="text-ink-subtle">(now {c.email})</span> : null}
              <input name="email" type="email" maxLength={200} className={input} />
            </label>
            <button type="submit" className={secondary}>
              Save
            </button>
          </form>
        ))}
      </div>
    </Section>
  );
}
