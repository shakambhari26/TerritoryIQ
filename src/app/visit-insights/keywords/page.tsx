import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { getKeywords, testKeywords } from "@/features/visit-insights/client.server";
import { Notice, SubNav } from "@/features/visit-insights/components/Messaging";
import { DataTable, Section } from "@/features/visit-insights/components/parts";
import type { KeywordList, KeywordScore } from "@/features/visit-insights/types";

export const metadata: Metadata = { title: "Keyword database · Visit Insights" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const LANGS = [
  { id: "en", label: "English" },
  { id: "bn", label: "Bengali (Roman)" },
  { id: "bn-Beng", label: "Bengali script" },
  { id: "hi", label: "Hindi (Roman)" },
  { id: "hi-Deva", label: "Devanagari" },
  { id: "brand", label: "Brand" },
  { id: "mixed", label: "Mixed" },
];
const input = "mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink";
const label = "block text-xs font-medium text-ink-muted";

/**
 * The keyword database: every word (English, Bengali, Hindi, both scripts) that counts as evidence for a segment or
 * sub-segment, with its weight. Head office can see coverage, add keywords, switch them off, and test a sentence.
 */
export default function KeywordsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader title="Keyword database" description="The words the AI listens for in every visit note, in English, Bengali and Hindi, and how much each one counts." />
      <div className="mt-5 grid gap-5">
        <SubNav current="keywords" />
        <Suspense fallback={<Card className="p-6 text-sm text-ink-muted">Loading keywords…</Card>}>
          <Body searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function Body({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const target = first(sp.target)?.match(/^[A-Z_]{3,40}$/)?.[0] ?? "";
  const language = LANGS.find((l) => l.id === first(sp.language))?.id ?? "";
  const q = (first(sp.q) ?? "").slice(0, 60);
  const test = (first(sp.test) ?? "").slice(0, 1000);
  const [list, scored] = await Promise.all([getKeywords({ target, language, q }), test ? testKeywords(test) : null]);
  if (!list.ok) return <Card role="alert" className="p-6 text-sm">{list.message}</Card>;
  const d = list.data;
  const limit = target || language || q ? 400 : 60;
  const name = (code: string) => d.targets[code]?.name ?? code;

  return (
    <>
      <Notice ok={first(sp.saved) ?? null} yes="Saved. New scores apply to new visits; re-analyse to update old ones." no="Not saved. It may already exist, or a field is invalid." />
      <TestBox test={test} scored={scored?.ok ? scored.data : null} name={name} />
      <Coverage d={d} />
      <Section title="Add a keyword" hint="Weight: 3 decisive · 2 strong · 1 supporting · 0.5 a hint. End a word with * to match any ending (complain* → complained, complaints).">
        <form method="post" action="/api/visit-insights/keywords" className="grid gap-3 sm:grid-cols-6 sm:items-end">
          <label className={`${label} sm:col-span-2`}>
            Word or phrase
            <input name="term" required minLength={2} maxLength={120} className={input} placeholder="e.g. rod er dam beshi" />
          </label>
          <label className={label}>
            Language
            <select name="language" className={input} defaultValue="bn">
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`${label} sm:col-span-2`}>
            Evidence for
            <select name="target" className={input} defaultValue={target || "HOT_ORDER"}>
              <optgroup label="Segments">
                {Object.entries(d.targets)
                  .filter(([, t]) => t.kind === "segment")
                  .map(([code, t]) => (
                    <option key={code} value={code}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Sub-segments">
                {Object.entries(d.targets)
                  .filter(([, t]) => t.kind === "flag")
                  .map(([code, t]) => (
                    <option key={code} value={code}>
                      {t.name}
                      {t.parent ? ` (${name(t.parent)})` : ""}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          <label className={label}>
            Weight
            <input name="weight" type="number" min="0.5" max="5" step="0.5" defaultValue="2" className={input} />
          </label>
          <label className={`${label} sm:col-span-3`}>
            Meaning in English (for others)
            <input name="meaning" maxLength={200} className={input} />
          </label>
          <label className={label}>
            Status
            <select name="status" defaultValue="draft" className={input}>
              <option value="verified">Verified</option>
              <option value="draft">Draft</option>
              <option value="ambiguous">Ambiguous (half weight)</option>
            </select>
          </label>
          <button type="submit" className="h-9 rounded-md bg-navy-950 px-4 text-sm font-semibold text-on-navy hover:bg-navy-800 sm:col-span-2">
            Add keyword
          </button>
        </form>
      </Section>
      <Section title={`Keywords (${d.total})`} hint={`Source: ${d.source}. Switched-off keywords stay listed but do not count.`}>
        <form method="get" action="/visit-insights/keywords" className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className={label}>
            Segment / sub-segment
            <select name="target" defaultValue={target} className={input}>
              <option value="">All</option>
              {Object.entries(d.targets).map(([code, t]) => (
                <option key={code} value={code}>
                  {t.kind === "flag" ? "↳ " : ""}
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Language
            <select name="language" defaultValue={language} className={input}>
              <option value="">All</option>
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Search
            <input name="q" defaultValue={q} maxLength={60} className={input} />
          </label>
          <button type="submit" className="h-9 rounded-md border border-line-strong px-4 text-sm font-medium text-ink">
            Filter
          </button>
        </form>
        <DataTable
          head={["Keyword", "Language", "Evidence for", "Weight", "Status", ""]}
          rows={d.keywords.slice(0, limit).map((k) => [
            <span key="t" className={k.active ? "" : "text-ink-subtle line-through"} title={k.meaning || undefined}>
              {k.term}
              {k.added_by === "auto-learner" ? (
                <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[0.6875rem] font-medium text-violet-800 ring-1 ring-violet-200">Auto-learned</span>
              ) : null}
              {k.meaning ? <span className="block text-xs text-ink-subtle">{k.meaning}</span> : null}
            </span>,
            k.language,
            name(k.target),
            k.weight,
            k.status,
            <form key="f" method="post" action="/api/visit-insights/keywords">
              <input type="hidden" name="action" value="toggle" />
              <input type="hidden" name="id" value={k.id} />
              <input type="hidden" name="active" value={k.active ? "0" : "1"} />
              <button type="submit" className="text-xs text-accent-ink underline">
                {k.active ? "Switch off" : "Switch on"}
              </button>
            </form>,
          ])}
        />
        {d.keywords.length > limit ? <p className="mt-2 text-xs text-ink-muted">Showing {limit} of {d.keywords.length}; pick a segment or language to see the rest.</p> : null}
      </Section>
    </>
  );
}

function Coverage({ d }: { d: KeywordList }) {
  const langs = ["en", "bn", "bn-Beng", "hi", "hi-Deva"];
  return (
    <Section title="Coverage" hint="Keywords per segment and language. Thin cells are where the AI is most likely to miss something.">
      <DataTable
        head={["Segment / sub-segment", "Total", "English", "Bengali (Roman)", "Bengali script", "Hindi (Roman)", "Devanagari"]}
        rows={Object.entries(d.targets)
          .filter(([code]) => d.coverage[code])
          .map(([code, t]) => [
            <Link key="l" href={`/visit-insights/keywords?target=${code}`} className="text-accent-ink underline">
              {t.kind === "flag" ? "↳ " : ""}
              {t.name}
            </Link>,
            d.coverage[code].total,
            ...langs.map((l) => <span key={l} className={(d.coverage[code][l] ?? 0) < 2 ? "font-semibold text-amber-800" : ""}>{d.coverage[code][l] ?? 0}</span>),
          ])}
      />
    </Section>
  );
}

function TestBox({ test, scored, name }: { test: string; scored: KeywordScore | null; name: (c: string) => string }) {
  return (
    <Section title="Test a sentence" hint="Type what a rep might say, in any language. See which keywords fire and the score each group gets.">
      <form method="get" action="/visit-insights/keywords" className="flex flex-wrap gap-2">
        <input name="test" defaultValue={test} maxLength={1000} className={`${input} mt-0 min-w-0 flex-1`} placeholder="e.g. dealer bollo dam beshi, onno company nebe" aria-label="Sentence to test" />
        <button type="submit" className="h-9 rounded-md border border-line-strong px-4 text-sm font-medium text-ink">
          Score it
        </button>
      </form>
      {scored ? (
        <div className="mt-4 grid gap-3 text-sm">
          <p className="text-ink">
            Top group: <span className="font-semibold">{name(scored.top)}</span> ({Math.round(scored.top_probability * 100)}%, {Math.round(scored.margin * 100)}% ahead).
            {scored.flags.length ? ` Sub-segments: ${scored.flags.map(name).join(", ")}.` : ""}
          </p>
          <DataTable
            head={["Heard", "Language", "Evidence for", "Weight", "Counted"]}
            rows={scored.matches.map((m) => [m.matched, m.language, name(m.target), m.weight, m.negated_by ? `0 (negated by “${m.negated_by}”)` : m.effective])}
          />
          <p className="text-xs text-ink-muted">
            {scored.probabilities.slice(0, 4).map((p) => `${name(p.segment)} ${Math.round(p.probability * 100)}% (S=${scored.segment_scores[p.segment]})`).join(" · ")}
          </p>
        </div>
      ) : null}
    </Section>
  );
}
