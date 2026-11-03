import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { getContacts, getMessages, getMessagingStatus, getVisit, postDraft } from "@/features/visit-insights/client.server";
import { ExplanationView } from "@/features/visit-insights/components/ExplanationView";
import { DraftAnalysis, DraftForm, MessageThread, Notice, SendForm, SubNav } from "@/features/visit-insights/components/Messaging";
import { Section, UrgencyPill } from "@/features/visit-insights/components/parts";
import { LANGUAGES } from "@/features/visit-insights/types";

export const metadata: Metadata = { title: "Visit · Visit Insights" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const VISIT_KEY = /^[A-Za-z0-9_-]{1,64}$/;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * /visit-insights/visit?key=<visit key>. (A query string, not a [key] segment, like the rest of Visit Insights, so the
 * prerendered shell and its navigation never wait on an unknown path.) One visit: what the rep said, why the system grouped it the way it did (with the maths), and a form to send the rep a
 * suggestion or to-do list, optionally analysed and drafted by the AI first.
 */
export default function VisitPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader title="Visit" description="Why the AI scored this visit, and what head office asks the rep to do next." />
      <div className="mt-5 grid gap-5">
        <SubNav current="insights" />
        <Suspense fallback={<Card className="p-6 text-sm text-ink-muted">Loading the visit…</Card>}>
          <Body searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function Body({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const key = first(sp.key) ?? "";
  if (!VISIT_KEY.test(key)) return <Card className="p-6 text-sm">No such visit.</Card>;
  const [visit, status, contacts, history] = await Promise.all([getVisit(key), getMessagingStatus(), getContacts(), getMessages(null)]);
  if (!visit.ok) return <Card role="alert" className="p-6 text-sm">{visit.message}</Card>;
  const v = visit.data;
  const r = v.result;
  const lang = LANGUAGES.find((l) => l.id === first(sp.lang))?.id ?? "en";
  const kind = first(sp.kind) === "suggestion" ? "suggestion" : "todo";
  const draft =
    first(sp.draft) === "1"
      ? await postDraft({ visit_key: key, rep_name: null, instruction: (first(sp.instruction) ?? "").slice(0, 500), language: lang, kind })
      : null;
  const contact = contacts.ok ? (contacts.data.find((c) => c.rep_name === v.rep_name) ?? null) : null;
  const sent = history.ok ? history.data.filter((m) => m.visit_key === key) : [];

  return (
    <>
      <Notice ok={first(sp.sent) ?? null} yes="Sent. The rep's reply will appear below and on the Messages page." no="Not sent. Check the title and pick at least one channel." />
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <UrgencyPill level={r.urgency.level} />
          <span className="text-base font-semibold text-ink">
            <span aria-hidden="true">{r.segment.emoji} </span>
            {r.segment.name}
          </span>
          <span className="text-sm text-ink-muted">
            {Math.round(r.segment.confidence * 100)}% · decided by {r.segment.decided_by}
          </span>
          {r.needs_human_review ? (
            <Link href="/visit-insights?role=supervisor" className="rounded-full border border-dashed border-line-strong px-2 py-0.5 text-xs text-ink-muted">
              Needs review →
            </Link>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-ink">
          <span className="font-medium">{v.customer_name}</span>
          <span className="text-ink-muted">
            {" "}
            · {v.visit_category.toLowerCase()} · rep {v.rep_name}
            {v.visit_at ? ` · ${new Date(v.visit_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
        </p>
        <blockquote className="mt-3 rounded-lg bg-surface-muted px-4 py-3 text-sm text-ink">“{v.transcript}”</blockquote>
        <p className="mt-3 text-sm text-ink">
          <span className="font-semibold">{r.action.owner}:</span> {r.action.text}
        </p>
      </Card>

      {r.explanation ? <ExplanationView e={r.explanation} /> : <Card className="p-5 text-sm text-ink-muted">Re-analyse the visits to get an explanation (POST /v1/reanalyze).</Card>}

      <Section title="Send the rep a suggestion or to-do list" hint="Analyse first (optional), review, then send by in-app, WhatsApp or email. The rep replies through a private link." className="scroll-mt-4">
        <div id="send" className="grid gap-4">
          <DraftForm action="/visit-insights/visit#send" visitKey={key} rep={v.rep_name} aiEnabled={status.ok && status.data.ai_enabled} />
          {draft && !draft.ok ? <p className="text-sm text-red-800">{draft.message}</p> : null}
          {draft?.ok ? <DraftAnalysis d={draft.data} /> : null}
          <SendForm rep={v.rep_name} visitKey={key} draft={draft?.ok ? draft.data : null} status={status.ok ? status.data : null} contact={contact} />
        </div>
      </Section>

      {sent.length ? (
        <Section title="Messages about this visit">
          <div className="grid gap-3">
            {sent.map((m) => (
              <MessageThread key={m.id} m={m} />
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}
