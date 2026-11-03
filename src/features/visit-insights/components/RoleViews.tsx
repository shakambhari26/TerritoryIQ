import { KpiCard } from "@/components/dashboard/KpiCard";
import type {
  AnalystInsights,
  ChatStats,
  DataInsights,
  MdInsights,
  Overview,
  SupervisorInsights,
  Taxonomy,
  VpInsights,
} from "../types";
import { Bars, DataTable, Empty, LabelForm, Section, VisitList } from "./parts";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function KpiRow({ o, extra = [] }: { o: Overview; extra?: { label: string; value: string; caption?: string }[] }) {
  const base = [
    { label: "Visits analysed", value: String(o.visits), caption: `${o.reps} reps · ${o.customers} customers` },
    { label: "Urgent (P0 + P1)", value: String(o.alerts_p0_p1), caption: "Need action within 48 hours" },
    { label: "Tonnes mentioned", value: `${o.tonnes_mentioned} MT`, caption: `${o.tonnes_confirmed} MT confirmed` },
    { label: "Avg. note quality", value: o.avg_note_score === null ? "—" : `${o.avg_note_score}/10`, caption: "5K formula score" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[...base, ...extra].map((k) => (
        <KpiCard key={k.label} label={k.label} value={k.value} caption={k.caption} />
      ))}
    </div>
  );
}

export function MdView({ d }: { d: MdInsights }) {
  return (
    <div className="grid gap-5">
      <KpiRow o={d.overview} extra={[
        { label: "Competitor mentioned", value: String(d.overview.competitor_visits), caption: "Visits naming a rival or price" },
        { label: "Payment discussed", value: String(d.overview.payment_visits), caption: "Collection, dues or credit" },
      ]} />
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Section title="Red list" hint="P0 and P1 visits, most urgent first. Each has an owner and an action.">
          <VisitList visits={d.alerts} empty="Nothing urgent in this period." />
        </Section>
        <div className="grid content-start gap-5">
          <Section title="Where the visits went" hint="Business area of each visit">
            <Bars rows={d.groups.map((g) => ({ key: g.group, label: g.group, value: g.count }))} />
          </Section>
          <Section title="Competitors mentioned" hint="“Unnamed” means the rep did not say which brand">
            {d.competitors.length ? (
              <Bars rows={d.competitors.map((c) => ({ key: c.brand, label: c.brand, value: c.visits }))} />
            ) : (
              <Empty>No competitor mentioned.</Empty>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

export function VpView({ d }: { d: VpInsights }) {
  return (
    <div className="grid gap-5">
      <KpiRow o={d.overview} />
      <Section title="Rep scorecard" hint="Result rate = share of visits that produced an order, payment, lead, site demand or customer feedback.">
        <DataTable
          head={["Rep", "Visits", "Result rate", "Note score", "Orders", "Tonnes", "New leads", "Competitor", "No result", "Urgent"]}
          rows={d.reps.map((r) => [r.rep_name, r.visits, pct(r.result_rate), `${r.avg_note_score}/10`, r.orders, r.tonnes, r.new_leads, r.competitor_visits, r.no_result, r.alerts])}
        />
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Pipeline" hint="Orders, upcoming site demand and new opportunities">
          <VisitList visits={d.pipeline} empty="No pipeline visits in this period." />
        </Section>
        <Section title="Competitor visits" hint="Where rival brands came up">
          <VisitList visits={d.competitor_visits} empty="No competitor mentioned." />
        </Section>
      </div>
    </div>
  );
}

export function SupervisorView({ d, taxonomy, saved }: { d: SupervisorInsights; taxonomy: Taxonomy | null; saved: string | null }) {
  return (
    <div className="grid gap-5">
      {saved === "1" ? <p role="status" className="rounded-lg border border-teal-200 bg-accent-soft px-4 py-2 text-sm text-accent-ink">Saved. The system will learn from this correction at the next retrain.</p> : null}
      {saved === "0" ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">That correction could not be saved. Try again.</p> : null}
      <KpiRow o={d.overview} extra={[{ label: "Waiting for review", value: String(d.overview.needs_review), caption: "System was not sure" }]} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Do today" hint="P0 and P1: complaints, stock-outs, competitor pressure, big pending orders">
          <VisitList visits={d.urgent} empty="Nothing urgent. Good." />
        </Section>
        <Section title="Follow-ups" hint="Promised next steps, earliest date first">
          <VisitList visits={d.follow_ups} empty="No follow-ups due." />
        </Section>
        <Section title="Check and correct" hint="The system was not sure. Pick the right group; every correction teaches it.">
          {taxonomy ? (
            <VisitList visits={d.review_queue} empty="Nothing waiting for review.">
              {(v) => <LabelForm v={v} taxonomy={taxonomy} />}
            </VisitList>
          ) : (
            <Empty>Review is unavailable: the group list could not be loaded.</Empty>
          )}
        </Section>
        <Section title="Ask the rep to re-record" hint="Unclear notes, or a note score of 3 or less">
          <VisitList visits={d.re_record} empty="Every note is usable." />
        </Section>
      </div>
      <Section title="Reps to coach" hint="Average note score under 5 out of 10. Use the 5K formula from the training program.">
        {d.coach.length ? (
          <DataTable head={["Rep", "Avg note score", "Notes"]} rows={d.coach.map((c) => [c.rep_name, `${c.avg_note_score}/10`, c.notes])} />
        ) : (
          <Empty>No rep is below 5.</Empty>
        )}
      </Section>
    </div>
  );
}

export function AnalystView({ d }: { d: AnalystInsights }) {
  const segCodes = d.segments.filter((s) => s.count > 0);
  return (
    <div className="grid gap-5">
      <KpiRow o={d.overview} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Visits by group">
          <Bars rows={d.segments.map((s) => ({ key: s.code, label: <><span aria-hidden="true">{s.emoji} </span>{s.name}</>, value: s.count }))} />
        </Section>
        <div className="grid content-start gap-5">
          <Section title="Urgency">
            <Bars rows={(Object.entries(d.urgency) as [string, number][]).map(([k, v]) => ({ key: k, label: k, value: v }))} />
          </Section>
          <Section title="Customer mood">
            <Bars rows={Object.entries(d.sentiment).map(([k, v]) => ({ key: k, label: k.toLowerCase(), value: v }))} />
          </Section>
        </div>
      </div>
      <Section title="Groups by customer type" hint="Who generates which business">
        <DataTable
          head={["Customer type", ...segCodes.map((s) => s.name)]}
          rows={d.by_stakeholder.map((r) => [r.stakeholder, ...segCodes.map((s) => Number(r[s.code] ?? 0))])}
        />
      </Section>
      <Section title="Flags raised" hint="Extra signals found in the notes">
        {d.flags.length ? <Bars rows={d.flags.map((f) => ({ key: f.flag, label: f.name, value: f.count }))} /> : <Empty>No flags.</Empty>}
      </Section>
    </div>
  );
}

export function DataView({ d, chat }: { d: DataInsights; chat: ChatStats | null }) {
  const m = d.model;
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Model macro-F1" value={m ? m.macro_f1.toFixed(2) : undefined} caption={m ? `${m.cv}, ${m.rows} labelled visits` : "No model: rules only"} />
        <KpiCard label="Model accuracy" value={m ? pct(m.accuracy) : undefined} caption="On visits it was not trained on" />
        <KpiCard label="Avg. confidence" value={d.avg_confidence === null ? undefined : pct(d.avg_confidence)} />
        <KpiCard label="Waiting for review" value={String(d.overview.needs_review)} />
      </div>
      {m && m.rows < 200 ? (
        <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          The model has only {m.rows} labelled visits. Treat its scores as a first signal; export the historical transcripts and add reviewer labels to make it reliable.
        </p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="F1 per group" hint="1.00 is perfect. Low groups need more labelled examples.">
          {m ? (
            <DataTable head={["Group", "Examples", "F1"]} rows={Object.entries(m.per_class_f1).map(([k, f]) => [k, m.class_counts[k] ?? 0, f.toFixed(2)])} />
          ) : (
            <Empty>Train a model with scripts/train.py.</Empty>
          )}
        </Section>
        <Section title="Who decided each group" hint="rules · ml · rules+ml · human · uncertain (sent to review)">
          <Bars rows={Object.entries(d.decided_by).map(([k, v]) => ({ key: k, label: k, value: v }))} />
        </Section>
        <Section title="Data quality">
          <DataTable
            head={["Check", "Visits"]}
            rows={[
              ["Invalid phone numbers", d.quality.invalid_phones],
              ["Phones shared by different customers", d.quality.shared_phones.length],
              ["Customer type does not match the note", d.quality.category_mismatch],
              ["Unclear recordings", d.quality.unclear_recordings],
              ...Object.entries(d.quality.ambiguous_slang).map(([k, v]) => [`Ambiguous word “${k}”`, v]),
            ]}
          />
        </Section>
        <Section title="Note quality scores" hint="How many notes scored 0 to 10">
          <Bars rows={d.note_score_distribution.map((s) => ({ key: String(s.score), label: `${s.score}/10`, value: s.visits }))} />
        </Section>
      </div>
      {chat ? (
        <Section title="Chat and AI usage" hint="How questions were answered. Only “ai” answers call the paid API; everything else is computed locally.">
          {chat.questions ? (
            <DataTable
              head={["Measure", "Value"]}
              rows={[
                ["Questions asked", chat.questions],
                ["Answered without the API", chat.answered_without_api === null ? "—" : pct(chat.answered_without_api)],
                ...Object.entries(chat.by_mode).map(([k, v]) => [`Answered by: ${k}`, v]),
                ["AI tokens used (in / out)", `${chat.ai_input_tokens.toLocaleString("en-IN")} / ${chat.ai_output_tokens.toLocaleString("en-IN")}`],
                ["Average local answer time", `${chat.avg_latency_ms_local} ms`],
                ["AI model (when used)", chat.model],
              ]}
            />
          ) : (
            <Empty>No chat questions yet.</Empty>
          )}
        </Section>
      ) : null}
      {d.quality.shared_phones.length ? (
        <Section title="Shared phone numbers" hint="The same number recorded for different customers">
          <DataTable head={["Phone", "Customers"]} rows={d.quality.shared_phones.map((s) => [s.phone, s.customers.join(", ")])} />
        </Section>
      ) : null}
    </div>
  );
}
