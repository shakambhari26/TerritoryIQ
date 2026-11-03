import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { getContacts, getMessages, getMessagingStatus, postDraft } from "@/features/visit-insights/client.server";
import { ContactsTable, DraftAnalysis, DraftForm, MessageThread, Notice, SendForm, SubNav } from "@/features/visit-insights/components/Messaging";
import { Empty, Section } from "@/features/visit-insights/components/parts";
import { LANGUAGES, type SentMessage } from "@/features/visit-insights/types";

export const metadata: Metadata = { title: "Messages · Visit Insights" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const FILTERS: { id: SentMessage["status"] | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sent", label: "Not opened" },
  { id: "read", label: "Opened" },
  { id: "replied", label: "Replied" },
  { id: "done", label: "Done" },
];

/**
 * Two-way messages between head office and field reps: write (optionally AI-analysed) suggestions and to-do lists for
 * a rep's recent work, follow each one from sent to read, replied and done, answer replies, and keep rep contacts.
 */
export default function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader title="Messages to reps" description="Suggestions and to-dos from head office, by in-app, WhatsApp or email, and the reps' replies." />
      <div className="mt-5 grid gap-5">
        <SubNav current="messages" />
        <Suspense fallback={<Card className="p-6 text-sm text-ink-muted">Loading messages…</Card>}>
          <Body searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function Body({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [status, contacts, messages] = await Promise.all([getMessagingStatus(), getContacts(), getMessages(null)]);
  if (!contacts.ok) return <Card role="alert" className="p-6 text-sm">{contacts.message}</Card>;
  const reps = contacts.data.map((c) => c.rep_name);
  const rep = reps.find((r) => r === first(sp.rep)) ?? null;
  const filter = FILTERS.find((f) => f.id === first(sp.status))?.id ?? "all";
  const lang = LANGUAGES.find((l) => l.id === first(sp.lang))?.id ?? "en";
  const kind = first(sp.kind) === "suggestion" ? "suggestion" : "todo";
  const draft =
    rep && first(sp.draft) === "1"
      ? await postDraft({ visit_key: null, rep_name: rep, instruction: (first(sp.instruction) ?? "").slice(0, 500), language: lang, kind })
      : null;
  const all = messages.ok ? messages.data : [];
  const shown = filter === "all" ? all : all.filter((m) => m.status === filter);
  const channels = status.ok ? status.data.channels : null;

  return (
    <>
      <Notice ok={first(sp.sent) ?? null} yes="Sent." no="Not sent. Check the title and pick at least one channel." />
      <Notice ok={first(sp.contact) ?? null} yes="Contact saved." no="Not saved. WhatsApp needs a 10-digit mobile number; email must be valid." />
      <Notice ok={first(sp.noted) ?? null} yes="Answer added; the rep sees it on their link." no="Answer not saved." />
      {channels && (!channels.whatsapp || !channels.email || !channels.reply_links) ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm text-ink-muted">
          Setup on the Visit Intelligence service:{" "}
          {[
            !channels.whatsapp && "WhatsApp (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID)",
            !channels.email && "email (SMTP_HOST, SMTP_FROM)",
            !channels.reply_links && "reply links (PUBLIC_BASE_URL = this site's address)",
          ]
            .filter(Boolean)
            .join(" · ")}{" "}
          not configured. In-app messages work now.
        </p>
      ) : null}

      <Section title="New message" hint="Pick a rep; the AI looks at their last 30 visits and drafts the priorities. You review before sending.">
        <div className="grid gap-4">
          <DraftForm action="/visit-insights/messages" rep={rep} reps={reps} aiEnabled={status.ok && status.data.ai_enabled} />
          {draft && !draft.ok ? <p className="text-sm text-red-800">{draft.message}</p> : null}
          {draft?.ok ? <DraftAnalysis d={draft.data} /> : null}
          {rep ? (
            <SendForm rep={rep} visitKey={null} draft={draft?.ok ? draft.data : null} status={status.ok ? status.data : null} contact={contacts.data.find((c) => c.rep_name === rep) ?? null} />
          ) : (
            <p className="text-sm text-ink-muted">Choose a rep above, or open any visit and use “Send the rep a suggestion”.</p>
          )}
        </div>
      </Section>

      <Section title="Sent messages" hint={`${all.length} sent · ${all.filter((m) => m.status === "done").length} done · ${all.filter((m) => m.status === "sent").length} not opened yet`}>
        <nav aria-label="Filter messages" className="mb-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <a
              key={f.id}
              href={`/visit-insights/messages${f.id === "all" ? "" : `?status=${f.id}`}`}
              aria-current={f.id === filter ? "true" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${f.id === filter ? "border-navy-950 bg-navy-950 text-on-navy" : "border-line-strong text-ink"}`}
            >
              {f.label} ({f.id === "all" ? all.length : all.filter((m) => m.status === f.id).length})
            </a>
          ))}
        </nav>
        {shown.length ? (
          <div className="grid gap-3">
            {shown.map((m) => (
              <MessageThread key={m.id} m={m} />
            ))}
          </div>
        ) : (
          <Empty>No messages here yet.</Empty>
        )}
      </Section>

      <div id="contacts">
        <ContactsTable contacts={contacts.data} />
      </div>
    </>
  );
}
