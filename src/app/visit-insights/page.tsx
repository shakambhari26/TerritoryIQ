import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { getChatStats, getContacts, getExplore, getInsights, getMessagingStatus, getTaxonomy } from "@/features/visit-insights/client.server";
import { LANDED_TEXT, type CardContext } from "@/features/visit-insights/components/ActionCard";
import { AskPanel, MAX_QUESTION_LENGTH } from "@/features/visit-insights/components/AskPanel";
import { ChatBoard } from "@/features/visit-insights/components/ChatBoard";
import { AdvancedMenu, PeriodPicker, RolePicker, WordsToggle } from "@/features/visit-insights/components/Controls";
import { Inbox, laneOf } from "@/features/visit-insights/components/Inbox";
import { Recommendations } from "@/features/visit-insights/components/Recommendations";
import { AnalystView, DataView, MdView, SupervisorView, VpView } from "@/features/visit-insights/components/RoleViews";
import { Story } from "@/features/visit-insights/components/Story";
import { Icon } from "@/features/visit-insights/components/VisitIcons";
import { viewHref, type View } from "@/features/visit-insights/links";
import {
  DAY_RANGES,
  EXPLORE,
  FILTER_KEYS,
  ROLES,
  type AnalystInsights,
  type DataInsights,
  type Filters,
  type MdInsights,
  type Overview,
  type RoleId,
  type SupervisorInsights,
  type TabId,
  type VpInsights,
} from "@/features/visit-insights/types";
import { readWords } from "@/features/visit-insights/words.server";

export const metadata: Metadata = {
  title: "Visit Insights",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Record<string, string | string[] | undefined>;

const TABS = [...ROLES, EXPLORE];
const VISIT_KEY = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Visit Insights, told as a story: what happened in the period, what needs head office now (every visit as an action
 * card: see it, send the rep a to-do, mark it sorted, with the history on the card), then questions and next steps.
 * Simple / Expert switches the words and the depth. Data comes from the Visit Intelligence service through a
 * server-side client (features/visit-insights/client.server.ts); the browser never sees the API key.
 */
export default function VisitInsightsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Visit Insights"
        description="What your sales team heard in the market, and what to do about it. Read the story, act on each visit, and see it through."
        aside={
          <Suspense fallback={null}>
            <HeaderControls searchParams={searchParams} />
          </Suspense>
        }
      />
      <div className="mt-5 grid grid-cols-1 gap-5">
        <Suspense fallback={<Card className="p-6 text-sm text-ink-muted">Loading visit insights…</Card>}>
          <InsightsBody searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function readView(params: Params): View {
  const tab: TabId = TABS.find((t) => t.id === first(params.role))?.id ?? "md";
  const daysParam = Number(first(params.days));
  const days = (DAY_RANGES as readonly number[]).includes(daysParam) ? daysParam : null;
  const filters: Filters = Object.fromEntries(
    FILTER_KEYS.map((k) => [k, first(params[k])?.slice(0, 100)]).filter(([, v]) => v),
  );
  return { tab, days, filters };
}

async function HeaderControls({ searchParams }: { searchParams: SearchParams }) {
  const [params, words] = await Promise.all([searchParams, readWords()]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <WordsToggle words={words} here={viewHref(readView(params))} />
      <AdvancedMenu />
    </div>
  );
}

async function InsightsBody({ searchParams }: { searchParams: SearchParams }) {
  const [params, words] = await Promise.all([searchParams, readWords()]);
  const view = readView(params);
  const tabInfo = TABS.find((t) => t.id === view.tab)!;
  const question = first(params.ask)?.trim().slice(0, MAX_QUESTION_LENGTH) || null;
  const lane = laneOf(view.filters.status, view.tab === "supervisor" ? "new" : "open");
  const serviceFilters: Filters = { ...view.filters, status: lane === "all" ? undefined : lane };
  const storyRole: RoleId = view.tab === "explore" ? "md" : view.tab;
  const at = first(params.at);
  const done = first(params.done);
  const landed = at && VISIT_KEY.test(at) && done && LANDED_TEXT[done] ? { key: at, done } : null;

  const [insights, explore, messaging, contacts] = await Promise.all([
    getInsights<MdInsights>(storyRole, view.days),
    getExplore(serviceFilters, view.days),
    getMessagingStatus(),
    getContacts(),
  ]);
  if (!insights.ok) return <Unavailable message={insights.message} />;
  if (!explore.ok) return <Unavailable message={explore.message} />;

  const ctx: CardContext = {
    words,
    returnTo: viewHref(view),
    messaging: messaging.ok ? messaging.data : null,
    contacts: contacts.ok ? contacts.data : [],
    landed,
  };
  const simple = words === "simple";

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <RolePicker view={view} />
        <p className="min-w-0 basis-full text-sm text-ink-muted sm:basis-auto sm:flex-1">{tabInfo.question}</p>
        <PeriodPicker view={view} words={words} />
      </div>

      {landed ? (
        <p
          role={LANDED_TEXT[landed.done].ok ? "status" : "alert"}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-3 text-sm",
            LANDED_TEXT[landed.done].ok ? "bg-accent-soft text-accent-ink" : "bg-red-50 text-red-800",
          )}
        >
          <Icon name={LANDED_TEXT[landed.done].ok ? "check" : "alert"} className="h-5 w-5" />
          {LANDED_TEXT[landed.done][words]}
        </p>
      ) : null}

      <Story o={insights.data.overview as Overview} view={view} words={words} />
      <Inbox d={explore.data} view={view} lane={lane} ctx={ctx} />
      <Recommendations items={insights.data.recommendations} view={view} words={words} />
      <AskPanel
        tab={view.tab}
        days={view.days}
        question={question}
        suggestions={insights.data.suggested_questions}
        aiEnabled={insights.data.ai_enabled}
        filters={view.filters}
      />
      {view.tab !== "explore" ? (
        simple ? (
          <Card className="flex flex-wrap items-center gap-3 p-4 text-sm text-ink-muted">
            <Icon name="sparkles" className="h-5 w-5 text-accent-ink" />
            Want the charts, scorecards and tables for {tabInfo.label}? Switch the words to <span className="font-semibold text-ink">Expert</span> at the top of the page.
          </Card>
        ) : (
          <section aria-labelledby="deep-dive" className="grid gap-3">
            <h2 id="deep-dive" className="text-lg font-semibold text-ink">
              Deep dive · {tabInfo.label}
            </h2>
            <DeepDive role={view.tab} insights={insights.data} saved={first(params.saved) ?? null} />
          </section>
        )
      ) : null}
      <ChatBoard role={view.tab} days={view.days} />
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

/** Expert only: the role's own tables and charts, from the same insights call. */
async function DeepDive({ role, insights, saved }: { role: RoleId; insights: unknown; saved: string | null }) {
  switch (role) {
    case "md":
      return <MdView d={insights as MdInsights} />;
    case "vp_sales":
      return <VpView d={insights as VpInsights} />;
    case "supervisor": {
      const taxonomy = await getTaxonomy();
      return <SupervisorView d={insights as SupervisorInsights} taxonomy={taxonomy.ok ? taxonomy.data : null} saved={saved} />;
    }
    case "business_analyst":
      return <AnalystView d={insights as AnalystInsights} />;
    case "data_analyst": {
      const chat = await getChatStats();
      return <DataView d={insights as DataInsights} chat={chat.ok ? chat.data : null} />;
    }
  }
}
