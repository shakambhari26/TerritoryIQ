import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { getChatStats, getExplore, getInsights, getTaxonomy } from "@/features/visit-insights/client.server";
import { AskPanel, MAX_QUESTION_LENGTH } from "@/features/visit-insights/components/AskPanel";
import { ChatBoard } from "@/features/visit-insights/components/ChatBoard";
import { ExploreView } from "@/features/visit-insights/components/ExploreView";
import { SubNav } from "@/features/visit-insights/components/Messaging";
import { Recommendations } from "@/features/visit-insights/components/Recommendations";
import { AnalystView, DataView, MdView, SupervisorView, VpView } from "@/features/visit-insights/components/RoleViews";
import { tabHref } from "@/features/visit-insights/links";
import {
  DAY_RANGES,
  EXPLORE,
  FILTER_KEYS,
  ROLES,
  type AnalystInsights,
  type Common,
  type DataInsights,
  type Filters,
  type MdInsights,
  type RoleId,
  type SupervisorInsights,
  type TabId,
  type VpInsights,
} from "@/features/visit-insights/types";

export const metadata: Metadata = {
  title: "Visit Insights",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = [...ROLES, EXPLORE];

/**
 * Visit Insights: every sales-visit voice note from Frontier, segmented by the Visit Intelligence service (rules, then
 * an ML model, then human review when unsure), shown as one view per role plus an All-visits admin list. Every view
 * has recommended next steps and an Ask AI box. Data comes from the service at request time through a server-side
 * client (features/visit-insights/client.server.ts); the browser never sees the API key.
 */
export default function VisitInsightsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Visit Insights"
        description="What happened in every sales visit, sorted into business groups with an urgency, an owner and an action. Pick your role, filter all visits, or ask a question."
        aside={<Badge>Pilot</Badge>}
      />
      <div className="mt-5 grid gap-5">
        <SubNav current="insights" />
        <Suspense fallback={<Card className="p-6 text-sm text-ink-muted">Loading visit insights…</Card>}>
          <InsightsBody searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function InsightsBody({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const tab: TabId = TABS.find((t) => t.id === first(params.role))?.id ?? "md";
  const daysParam = Number(first(params.days));
  const days = (DAY_RANGES as readonly number[]).includes(daysParam) ? daysParam : null;
  const question = first(params.ask)?.trim().slice(0, MAX_QUESTION_LENGTH) || null;
  const filters: Filters = Object.fromEntries(
    FILTER_KEYS.map((k) => [k, first(params[k])?.slice(0, 100)]).filter(([, v]) => v),
  );
  const tabInfo = TABS.find((t) => t.id === tab)!;
  const periodHref = (d: number | null) => tabHref(tab, d, tab === "explore" ? (filters as Record<string, string>) : {});

  return (
    <div className="grid gap-5">
      <nav aria-label="View" className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id, days)}
            aria-current={t.id === tab ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium",
              t.id === tab ? "border-navy-950 bg-navy-950 text-on-navy" : "border-line-strong bg-surface text-ink hover:border-ink-subtle",
              t.id === "explore" && t.id !== tab && "border-dashed",
            )}
          >
            {t.id === "explore" ? "☰ " : ""}
            {t.label}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-1 text-sm text-ink-muted">
          Period:
          {[...DAY_RANGES, null].map((d) => (
            <Link
              key={d ?? "all"}
              href={periodHref(d)}
              aria-current={d === days ? "true" : undefined}
              className={cn("rounded-md px-2 py-1", d === days ? "bg-surface font-semibold text-ink shadow-card" : "hover:text-ink")}
            >
              {d ? `${d} days` : "All"}
            </Link>
          ))}
        </span>
      </nav>
      <p className="text-sm text-ink-muted">{tabInfo.question}</p>
      {tab === "explore" ? (
        <ExploreData filters={filters} days={days} question={question} />
      ) : (
        <RoleData role={tab} days={days} question={question} saved={first(params.saved) ?? null} />
      )}
      <ChatBoard role={tab} days={days} />
    </div>
  );
}

function Unavailable({ message }: { message: string }) {
  return (
    <Card role="alert" className="p-6">
      <p className="font-semibold text-ink">Visit insights are not available</p>
      <p className="mt-1 text-sm text-ink-muted">{message}</p>
    </Card>
  );
}

function Shared({ tab, days, question, data, filters }: { tab: TabId; days: number | null; question: string | null; data: Common; filters?: Filters }) {
  return (
    <>
      <AskPanel tab={tab} days={days} question={question} suggestions={data.suggested_questions} aiEnabled={data.ai_enabled} filters={filters} />
      <Recommendations items={data.recommendations} days={days} />
    </>
  );
}

async function ExploreData({ filters, days, question }: { filters: Filters; days: number | null; question: string | null }) {
  const result = await getExplore(filters, days);
  if (!result.ok) return <Unavailable message={result.message} />;
  return (
    <div className="grid gap-5">
      <Shared tab="explore" days={days} question={question} data={result.data} filters={filters} />
      <ExploreView d={result.data} days={days} />
    </div>
  );
}

async function RoleData({ role, days, question, saved }: { role: RoleId; days: number | null; question: string | null; saved: string | null }) {
  const result = await getInsights<Common>(role, days);
  if (!result.ok) return <Unavailable message={result.message} />;
  const view = await (async () => {
    switch (role) {
      case "md":
        return <MdView d={result.data as MdInsights} />;
      case "vp_sales":
        return <VpView d={result.data as VpInsights} />;
      case "supervisor": {
        const taxonomy = await getTaxonomy();
        return <SupervisorView d={result.data as SupervisorInsights} taxonomy={taxonomy.ok ? taxonomy.data : null} saved={saved} />;
      }
      case "business_analyst":
        return <AnalystView d={result.data as AnalystInsights} />;
      case "data_analyst": {
        const chat = await getChatStats();
        return <DataView d={result.data as DataInsights} chat={chat.ok ? chat.data : null} />;
      }
    }
  })();
  return (
    <div className="grid gap-5">
      <Shared tab={role} days={days} question={question} data={result.data} />
      {view}
    </div>
  );
}
