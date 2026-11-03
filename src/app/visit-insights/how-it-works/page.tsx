import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { getMethodology } from "@/features/visit-insights/client.server";
import { SubNav } from "@/features/visit-insights/components/Messaging";
import { Section } from "@/features/visit-insights/components/parts";

export const metadata: Metadata = { title: "How the AI scores · Visit Insights" };

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** How every score on Visit Insights is calculated: plain words and the formula, from the service's own definitions. */
export default function HowItWorksPage() {
  return (
    <>
      <PageHeader title="How the AI scores" description="Every number on Visit Insights, what it means, and exactly how it is calculated." />
      <div className="mt-5 grid gap-5">
        <SubNav current="how" />
        <Suspense fallback={<Card className="p-6 text-sm text-ink-muted">Loading…</Card>}>
          <Body />
        </Suspense>
      </div>
    </>
  );
}

async function Body() {
  const m = await getMethodology();
  if (!m.ok) return <Card role="alert" className="p-6 text-sm">{m.message}</Card>;
  const t = m.data.thresholds;
  return (
    <>
      <Section title="How one visit is decided" hint="Three independent methods; a fixed order of trust; a person when they disagree.">
        <ol className="ml-5 list-decimal space-y-2 text-sm text-ink">
          <li>A supervisor&rsquo;s correction always wins.</li>
          <li>Business rules decide alone when at least {pct(t.rules)} sure (e.g. “order confirmed”, “the audio says”).</li>
          <li>
            Otherwise, if 2 of the 3 methods (rules, keyword database, ML model) agree, and all three agree or the surer one is above {pct(t.agree)}, that
            group is taken.
          </li>
          <li>Otherwise the ML model decides if at least {pct(t.ml)} sure.</li>
          <li>
            Otherwise the keyword database decides if at least {pct(t.keywords)} sure and {pct(t.keywords_margin)} ahead of the next group.
          </li>
          <li>Otherwise the visit is sent to a supervisor (“Needs review”) with the best guess shown. Nothing uncertain is silently guessed.</li>
        </ol>
        <p className="mt-3 text-xs text-ink-muted">
          Sub-segments are raised at a keyword score of {t.flag}. Each extra keyword for the same group counts {t.decay}× the one before.
        </p>
      </Section>
      <Section title="Every score">
        <div className="grid gap-3">
          {m.data.scores.map((s) => (
            <article key={s.score} className="rounded-xl border border-line p-4">
              <h3 className="text-sm font-semibold text-ink">{s.score}</h3>
              <p className="mt-1 text-sm text-ink">{s.plain}</p>
              <p className="mt-2 rounded-md bg-surface-muted px-3 py-2 font-mono text-xs leading-relaxed text-ink-muted">{s.math}</p>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
