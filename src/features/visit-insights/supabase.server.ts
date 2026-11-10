import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Fetched } from "./client.server";
import type { KeywordSubmission } from "./forms";
import type {
  AnalystInsights,
  Common,
  DataInsights,
  ExploreData,
  Filters,
  KeywordList,
  KeywordRow,
  MdInsights,
  Methodology,
  Overview,
  Recommendation,
  RepRow,
  RoleId,
  SegmentCount,
  SupervisorInsights,
  Taxonomy,
  Urgency,
  VisitBrief,
  VisitDetail,
  VpInsights,
} from "./types";

/**
 * Visit Insights read straight from the Supabase project, for when no Visit Intelligence service is configured.
 * Server only: SUPABASE_SECRET_KEY bypasses row-level security, so it is read here and nowhere else, and the browser
 * only ever receives the rendered result.
 *
 *   SUPABASE_URL          the project URL
 *   SUPABASE_SECRET_KEY   a secret (sb_secret_...) key, never the publishable one: RLS is on and has no policies
 *
 * Everything shown is what the service already stored: `public.visits` (the notes) and `public.analyses` (its
 * segment, urgency, flags, action and step-by-step explanation per visit). Nothing is re-scored here, and the
 * numbers on the role views are plain counts of those rows. Features that need the service itself (free-text Ask,
 * chat, drafting and sending messages, scoring a sentence, supervisor corrections) stay unavailable.
 */

const NOT_AVAILABLE = "This needs the Visit Intelligence service, which is not connected. The stored visits and analyses are shown from Supabase.";

export function supabaseConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SECRET_KEY?.trim());
}

let cached: SupabaseClient | null = null;
function db(): SupabaseClient {
  cached ??= createClient(process.env.SUPABASE_URL!.trim(), process.env.SUPABASE_SECRET_KEY!.trim(), {
    // Fetches are uncached by default in this Next, so every page view reads the current rows.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export const unavailable = (): Fetched<never> => ({ ok: false, kind: "not-configured", message: NOT_AVAILABLE });
const failed = (): Fetched<never> => ({ ok: false, kind: "upstream", message: "The visit data could not be read from Supabase." });

// ---------- loading ----------

interface Res {
  segment: { code: string; name: string; emoji: string; group: string; confidence: number; decided_by: string };
  urgency: { level: Urgency; reason: string };
  flags: string[];
  action: { playbook_id: string; owner: string; text: string };
  extracted?: {
    quantity?: { value_mt?: number } | null;
    competitors?: { brand?: string | null }[];
    follow_up?: { date: string | null; evidence: string; ambiguous: boolean } | null;
  };
  sentiment?: string;
  stakeholder?: string;
  note_quality: { score: number; issues: string[] };
  needs_human_review: boolean;
  explanation?: NonNullable<VisitDetail["result"]["explanation"]> & { steps: { id: string; plain?: string; note?: string }[] };
  evidence?: { lexicon?: { lex_ambiguous?: ({ term?: string } | string)[] } };
  model_version?: string;
}

interface Row {
  key: string;
  at: string | null;
  rep: string;
  customer: string;
  contact: string;
  phone: string;
  category: string;
  transcript: string;
  res: Res;
}

async function all<T>(table: string, columns: string): Promise<T[] | null> {
  const out: T[] = [];
  // PostgREST returns at most 1000 rows a call; page until a short page comes back.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from(table).select(columns).order("visit_key").range(from, from + 999);
    if (error || !data) return null;
    out.push(...(data as unknown as T[]));
    if (data.length < 1000) return out;
  }
}

async function loadRows(days: number | null): Promise<Row[] | null> {
  const [visits, analyses] = await Promise.all([
    all<{ visit_key: string; rep_name: string; visit_at: string | null; customer_name: string; contact_person: string | null; contact_number: string | null; visit_category: string; transcript: string }>(
      "visits",
      "visit_key,rep_name,visit_at,customer_name,contact_person,contact_number,visit_category,transcript",
    ),
    all<{ visit_key: string; result: Res }>("analyses", "visit_key,result"),
  ]);
  if (!visits || !analyses) return null;
  const byKey = new Map(analyses.map((a) => [a.visit_key, a.result]));
  const since = days ? Date.now() - days * 86_400_000 : null;
  const rows: Row[] = [];
  for (const v of visits) {
    const res = byKey.get(v.visit_key);
    if (!res) continue; // a visit with no analysis yet has nothing to show
    if (since !== null && (!v.visit_at || new Date(v.visit_at).getTime() < since)) continue;
    rows.push({
      key: v.visit_key,
      at: v.visit_at,
      rep: v.rep_name,
      customer: v.customer_name,
      contact: v.contact_person ?? "",
      phone: v.contact_number ?? "",
      category: v.visit_category,
      transcript: v.transcript,
      res,
    });
  }
  return rows;
}

// ---------- helpers ----------

const URGENCY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const pretty = (code: string) => code.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
const count = <T,>(items: T[], key: (item: T) => string | null | undefined) => {
  const m = new Map<string, number>();
  for (const i of items) {
    const k = key(i);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};
const byCountDesc = ([, a]: [string, number], [, b]: [string, number]) => b - a;

const isCompetitor = (r: Row) => r.res.segment.code === "COMPETITOR_PRICE" || (r.res.extracted?.competitors?.length ?? 0) > 0;
const isPayment = (r: Row) => r.res.segment.code === "PAYMENT" || r.res.flags.some((f) => f.startsWith("PAYMENT_") || f.startsWith("CREDIT_"));
const qty = (r: Row) => r.res.extracted?.quantity?.value_mt ?? null;

function brief(r: Row): VisitBrief {
  const s = r.res.segment;
  return {
    visit_key: r.key,
    visit_at: r.at,
    rep_name: r.rep,
    customer_name: r.customer,
    contact: r.contact,
    visit_category: r.category,
    segment: s.code,
    segment_name: s.name,
    emoji: s.emoji,
    group: s.group,
    confidence: s.confidence,
    decided_by: s.decided_by,
    urgency: r.res.urgency.level,
    urgency_reason: r.res.urgency.reason,
    flags: r.res.flags,
    qty_mt: qty(r),
    follow_up: r.res.extracted?.follow_up ?? null,
    note_score: r.res.note_quality.score,
    note_issues: r.res.note_quality.issues,
    action: r.res.action,
    needs_review: r.res.needs_human_review,
    transcript: r.transcript,
    why: r.res.explanation?.summary ?? null,
  };
}

/** Most urgent first, then newest. */
const triage = (a: Row, b: Row) =>
  (URGENCY_ORDER[a.res.urgency.level] ?? 9) - (URGENCY_ORDER[b.res.urgency.level] ?? 9) || (b.at ?? "").localeCompare(a.at ?? "");
const briefs = (rows: Row[], limit = 100) => [...rows].sort(triage).slice(0, limit).map(brief);

function overview(rows: Row[]): Overview {
  const dates = rows.map((r) => r.at).filter((d): d is string => Boolean(d)).sort();
  const quantities = rows.map((r) => ({ r, q: qty(r) })).filter((x): x is { r: Row; q: number } => x.q !== null);
  const scores = rows.map((r) => r.res.note_quality.score);
  return {
    visits: rows.length,
    reps: new Set(rows.map((r) => r.rep)).size,
    customers: new Set(rows.map((r) => r.customer)).size,
    tonnes_confirmed: round(quantities.filter((x) => x.r.res.segment.code === "HOT_ORDER").reduce((n, x) => n + x.q, 0)),
    tonnes_mentioned: round(quantities.reduce((n, x) => n + x.q, 0)),
    alerts_p0_p1: rows.filter((r) => r.res.urgency.level === "P0" || r.res.urgency.level === "P1").length,
    competitor_visits: rows.filter(isCompetitor).length,
    payment_visits: rows.filter(isPayment).length,
    needs_review: rows.filter((r) => r.res.needs_human_review).length,
    avg_note_score: scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    date_from: dates[0] ?? null,
    date_to: dates.at(-1) ?? null,
  };
}

// ---------- names: taken from the stored analyses, so they are the service's own ----------

/** The segment code the keyword table uses that no stored analysis has needed yet. The name is the service's own, from its explanations. */
const KNOWN_EXTRA_SEGMENTS: Taxonomy["segments"] = {
  PAYMENT: { name: "Money to Collect", emoji: "💰", group: "Revenue", meaning: "Payment due, promised or being chased" },
};

function segmentsFrom(rows: Row[]): Taxonomy["segments"] {
  const out: Taxonomy["segments"] = { ...KNOWN_EXTRA_SEGMENTS };
  for (const r of rows) {
    const s = r.res.segment;
    out[s.code] = { name: s.name, emoji: s.emoji, group: s.group, meaning: (s as { meaning?: string }).meaning ?? "" };
  }
  return out;
}

/** Flag names: each stored explanation lists the raised flags' names in the same order as the flag codes. */
function flagNamesFrom(rows: Row[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const r of rows) {
    const plain = r.res.explanation?.steps.find((s) => s.id === "flags")?.plain;
    const listed = plain?.replace(/\.$/, "").split(", ");
    if (listed && listed.length === r.res.flags.length) r.res.flags.forEach((code, i) => (names[code] ??= listed[i]));
  }
  for (const r of rows) for (const code of r.res.flags) names[code] ??= pretty(code);
  return names;
}

const URGENCY_INFO: Taxonomy["urgency"] = {
  P0: { name: "Critical", sla: "Same day" },
  P1: { name: "High", sla: "24–48 hours" },
  P2: { name: "Medium", sla: "This week" },
  P3: { name: "Low", sla: "For trend reports" },
};

export async function getTaxonomy(): Promise<Fetched<Taxonomy>> {
  const rows = await loadRows(null);
  if (!rows) return failed();
  const names = flagNamesFrom(rows);
  return {
    ok: true,
    data: { segments: segmentsFrom(rows), urgency: URGENCY_INFO, flags: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, { name: v, parent: null }])) },
  };
}

// ---------- recommendations: fixed rules over the rows, never invented ----------

function recommendations(rows: Row[]): Recommendation[] {
  const out: Recommendation[] = [];
  const n = (pred: (r: Row) => boolean) => rows.filter(pred).length;
  const add = (r: Omit<Recommendation, "count"> & { count: number }) => r.count > 0 && out.push(r);
  for (const level of ["P0", "P1"] as const) {
    add({
      id: `urgent-${level}`,
      priority: "high",
      title: `${n((r) => r.res.urgency.level === level)} ${level === "P0" ? "critical" : "high-urgency"} visit${n((r) => r.res.urgency.level === level) === 1 ? "" : "s"} to act on`,
      why: "Rated by the fixed urgency rules: complaints, delivery problems, competitor price pressure, big unconfirmed orders or construction starting now.",
      action: level === "P0" ? "Contact the customer today." : "Contact the customer within 24–48 hours.",
      owner: "Supervisor",
      filter: { urgency: level },
      count: n((r) => r.res.urgency.level === level),
    });
  }
  add({
    id: "review",
    priority: "medium",
    title: "Visits the system was not sure about",
    why: "No method was confident enough, so these were sent to a person instead of being guessed.",
    action: "Read each note and confirm or correct the group.",
    owner: "Supervisor",
    filter: { review: "1" },
    count: n((r) => r.res.needs_human_review),
  });
  add({
    id: "follow-up",
    priority: "medium",
    title: "Follow-ups promised to customers",
    why: "The rep said they would come back, call or send something.",
    action: "Check each follow-up has a date and is on the rep's list.",
    owner: "Field rep",
    filter: { flag: "FOLLOW_UP" },
    count: n((r) => r.res.flags.includes("FOLLOW_UP")),
  });
  add({
    id: "competitor",
    priority: "medium",
    title: "Competitor and price pressure",
    why: "Customers mentioned a rival or a price fight.",
    action: "Agree a response on price or scheme before the next visit.",
    owner: "VP Sales",
    filter: { segment: "COMPETITOR_PRICE" },
    count: n((r) => r.res.segment.code === "COMPETITOR_PRICE"),
  });
  add({
    id: "re-record",
    priority: "low",
    title: "Notes that must be re-recorded",
    why: "The recording was unclear, so nothing reliable could be read from it.",
    action: "Ask the rep to record the visit again.",
    owner: "Field rep",
    filter: { segment: "UNCLEAR_RECORDING" },
    count: n((r) => r.res.segment.code === "UNCLEAR_RECORDING"),
  });
  return out;
}

const common = (rows: Row[]): Common => ({ recommendations: recommendations(rows), suggested_questions: [], ai_enabled: false });

// ---------- role views ----------

function segmentCounts(rows: Row[]): SegmentCount[] {
  const names = segmentsFrom(rows);
  const counts = count(rows, (r) => r.res.segment.code);
  return Object.entries(names)
    .map(([code, s]) => ({ code, name: s.name, emoji: s.emoji, group: s.group, count: counts.get(code) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function repRows(rows: Row[]): RepRow[] {
  const reps = new Map<string, Row[]>();
  for (const r of rows) reps.set(r.rep, [...(reps.get(r.rep) ?? []), r]);
  return [...reps.entries()]
    .map(([rep_name, rs]) => {
      const noResult = rs.filter((r) => r.res.segment.code === "LOW_VALUE_VISIT").length;
      return {
        rep_name,
        visits: rs.length,
        result_rate: round(1 - noResult / rs.length, 2),
        avg_note_score: round(rs.reduce((n, r) => n + r.res.note_quality.score, 0) / rs.length),
        orders: rs.filter((r) => r.res.segment.code === "HOT_ORDER").length,
        tonnes: round(rs.reduce((n, r) => n + (qty(r) ?? 0), 0)),
        new_leads: rs.filter((r) => r.res.segment.code === "NEW_LEAD").length,
        competitor_visits: rs.filter(isCompetitor).length,
        no_result: noResult,
        alerts: rs.filter((r) => r.res.urgency.level === "P0" || r.res.urgency.level === "P1").length,
      };
    })
    .sort((a, b) => b.visits - a.visits || a.rep_name.localeCompare(b.rep_name));
}

const isAlert = (r: Row) => r.res.urgency.level === "P0" || r.res.urgency.level === "P1";

/** "20261102-120722" -> an ISO timestamp, or null. */
const versionTime = (v: string | undefined) => {
  const m = v?.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : "";
};

function dataInsights(rows: Row[]): DataInsights {
  const ml = rows.map((r) => r.res.explanation?.steps.find((s) => s.id === "ml")).find((s) => s?.note && s.plain);
  const metrics = ml?.note?.match(/accuracy (\d+)%, macro-F1 ([\d.]+)/);
  const trained = ml?.plain?.match(/learned from (\d+)/);
  const version = rows.find((r) => r.res.model_version)?.res.model_version;
  const phones = new Map<string, Set<string>>();
  for (const r of rows) if (r.phone) phones.set(r.phone, (phones.get(r.phone) ?? new Set()).add(r.customer));
  const slang = new Map<string, number>();
  for (const r of rows) for (const a of r.res.evidence?.lexicon?.lex_ambiguous ?? []) {
    const term = typeof a === "string" ? a : a.term;
    if (term) slang.set(term, (slang.get(term) ?? 0) + 1);
  }
  const scores = count(rows, (r) => String(r.res.note_quality.score));
  const confidences = rows.map((r) => r.res.segment.confidence);
  return {
    ...common(rows),
    overview: overview(rows),
    model:
      metrics && trained && version
        ? {
            version,
            trained_at: versionTime(version),
            algorithm: "Logistic regression on TF-IDF word and letter patterns plus keyword scores",
            rows: Number(trained[1]),
            cv: "each visit predicted by a model that never saw it",
            macro_f1: Number(metrics[2]),
            accuracy: Number(metrics[1]) / 100,
            per_class_f1: {},
            class_counts: Object.fromEntries(count(rows, (r) => r.res.segment.code)),
          }
        : null,
    decided_by: Object.fromEntries([...count(rows, (r) => r.res.segment.decided_by)].sort(byCountDesc)),
    avg_confidence: confidences.length ? round(confidences.reduce((a, b) => a + b, 0) / confidences.length, 2) : null,
    quality: {
      invalid_phones: rows.filter((r) => r.res.flags.includes("PHONE_INVALID")).length,
      shared_phones: [...phones].filter(([, who]) => who.size > 1).map(([phone, who]) => ({ phone, customers: [...who] })),
      category_mismatch: rows.filter((r) => r.res.flags.includes("CATEGORY_MISMATCH")).length,
      unclear_recordings: rows.filter((r) => r.res.segment.code === "UNCLEAR_RECORDING").length,
      ambiguous_slang: Object.fromEntries(slang),
    },
    note_score_distribution: Array.from({ length: 11 }, (_, score) => ({ score, visits: scores.get(String(score)) ?? 0 })),
  };
}

export async function getInsights<T>(role: RoleId, days: number | null): Promise<Fetched<T>> {
  const rows = await loadRows(days);
  if (!rows) return failed();
  const base = { ...common(rows), overview: overview(rows) };
  let data: unknown;
  switch (role) {
    case "md": {
      const comps = count(rows.flatMap((r) => r.res.extracted?.competitors ?? []), (c) => c.brand ?? "Brand not named");
      data = {
        ...base,
        groups: [...count(rows, (r) => r.res.segment.group)].sort(byCountDesc).map(([group, n]) => ({ group, count: n })),
        competitors: [...comps].sort(byCountDesc).map(([brand, visits]) => ({ brand, visits })),
        alerts: briefs(rows.filter(isAlert)),
        segments: segmentCounts(rows),
      } satisfies MdInsights;
      break;
    }
    case "vp_sales":
      data = {
        ...base,
        reps: repRows(rows),
        pipeline: briefs(rows.filter((r) => r.res.segment.group === "Demand Pipeline" || r.res.segment.code === "HOT_ORDER")),
        competitor_visits: briefs(rows.filter(isCompetitor)),
      } satisfies VpInsights;
      break;
    case "supervisor": {
      const coach = repRows(rows).filter((r) => r.avg_note_score < 5);
      data = {
        ...base,
        urgent: briefs(rows.filter(isAlert)),
        follow_ups: briefs(rows.filter((r) => r.res.flags.includes("FOLLOW_UP") || r.res.extracted?.follow_up?.date)),
        re_record: briefs(rows.filter((r) => r.res.segment.code === "UNCLEAR_RECORDING")),
        review_queue: briefs(rows.filter((r) => r.res.needs_human_review)),
        coach: coach.map((r) => ({ rep_name: r.rep_name, avg_note_score: r.avg_note_score, notes: r.visits })),
      } satisfies SupervisorInsights;
      break;
    }
    case "business_analyst": {
      const segments = segmentCounts(rows);
      const names = flagNamesFrom(rows);
      const stakeholders = [...new Set(rows.map((r) => r.res.stakeholder ?? "OTHER"))].sort();
      data = {
        ...base,
        segments,
        by_stakeholder: stakeholders.map((stakeholder) => ({
          stakeholder,
          ...Object.fromEntries(count(rows.filter((r) => (r.res.stakeholder ?? "OTHER") === stakeholder), (r) => r.res.segment.code)),
        })),
        sentiment: Object.fromEntries(count(rows, (r) => r.res.sentiment ?? "NEUTRAL")),
        urgency: { P0: 0, P1: 0, P2: 0, P3: 0, ...Object.fromEntries(count(rows, (r) => r.res.urgency.level)) },
        flags: [...count(rows.flatMap((r) => r.res.flags.map((flag) => ({ flag }))), (x) => x.flag)]
          .sort(byCountDesc)
          .map(([flag, n]) => ({ flag, name: names[flag] ?? pretty(flag), count: n })),
      } satisfies AnalystInsights;
      break;
    }
    case "data_analyst":
      data = dataInsights(rows);
      break;
  }
  return { ok: true, data: data as T };
}

// ---------- all visits ----------

export async function getExplore(filters: Filters, days: number | null): Promise<Fetched<ExploreData>> {
  const base = await loadRows(days);
  if (!base) return failed();
  const q = filters.q?.toLowerCase();
  const matches = (r: Row, skip?: keyof Filters) =>
    (skip === "group" || !filters.group || r.res.segment.group === filters.group) &&
    (skip === "segment" || !filters.segment || r.res.segment.code === filters.segment) &&
    (skip === "urgency" || !filters.urgency || r.res.urgency.level === filters.urgency) &&
    (skip === "flag" || !filters.flag || r.res.flags.includes(filters.flag)) &&
    (skip === "rep" || !filters.rep || r.rep === filters.rep) &&
    (skip === "stakeholder" || !filters.stakeholder || (r.res.stakeholder ?? "OTHER") === filters.stakeholder) &&
    (skip === "category" || !filters.category || r.category === filters.category) &&
    // No case tracking here, so every stored visit is still "new" (and so "open").
    (skip === "status" || !filters.status || filters.status === "new" || filters.status === "open") &&
    (!filters.review || r.res.needs_human_review) &&
    (!q || [r.customer, r.rep, r.transcript].some((t) => t.toLowerCase().includes(q)));
  const shown = base.filter((r) => matches(r));
  // Each dropdown's counts ignore its own filter, so the other choices stay visible with what they would give.
  const facet = (key: keyof ExploreData["facets"], values: (r: Row) => (string | undefined)[]) =>
    [...count(base.filter((r) => matches(r, key)).flatMap((r) => values(r).map((value) => ({ value }))), (x) => x.value)]
      .sort(byCountDesc)
      .map(([value, n]) => ({ value, count: n }));
  const segments = segmentsFrom(base);
  return {
    ok: true,
    data: {
      ...common(shown),
      filters,
      total: shown.length,
      all: base.length,
      facets: {
        group: facet("group", (r) => [r.res.segment.group]),
        segment: facet("segment", (r) => [r.res.segment.code]),
        urgency: facet("urgency", (r) => [r.res.urgency.level]),
        flag: facet("flag", (r) => r.res.flags),
        rep: facet("rep", (r) => [r.rep]),
        stakeholder: facet("stakeholder", (r) => [r.res.stakeholder ?? "OTHER"]),
        status: facet("status", () => ["new"]),
        category: facet("category", (r) => [r.category]),
      },
      visits: briefs(shown, 200),
      segments: Object.entries(segments).map(([code, s]) => ({ code, name: s.name, emoji: s.emoji, group: s.group })),
      flag_names: flagNamesFrom(base),
      overview: overview(base),
    },
  };
}

// ---------- one visit ----------

export async function getVisit(key: string): Promise<Fetched<VisitDetail>> {
  const [visit, analysis] = await Promise.all([
    db().from("visits").select("visit_key,rep_name,visit_at,customer_name,visit_category,transcript").eq("visit_key", key).maybeSingle(),
    db().from("analyses").select("result").eq("visit_key", key).maybeSingle(),
  ]);
  if (visit.error || analysis.error) return failed();
  if (!visit.data || !analysis.data) return { ok: false, kind: "upstream", message: "No such visit." };
  const v = visit.data as { visit_key: string; rep_name: string; visit_at: string | null; customer_name: string; visit_category: string; transcript: string };
  const r = analysis.data.result as Res;
  return {
    ok: true,
    data: {
      visit_key: v.visit_key,
      rep_name: v.rep_name,
      visit_at: v.visit_at,
      customer_name: v.customer_name,
      visit_category: v.visit_category,
      transcript: v.transcript,
      result: {
        segment: r.segment,
        urgency: r.urgency,
        flags: r.flags,
        action: r.action,
        needs_human_review: r.needs_human_review,
        note_quality: r.note_quality,
        explanation: r.explanation,
      },
    },
  };
}

// ---------- how the AI scores: the service's own definitions, as they appear in every stored explanation ----------

export function getMethodology(): Fetched<Methodology> {
  return {
    ok: true,
    data: {
      thresholds: { rules: 0.85, agree: 0.7, ml: 0.6, keywords: 0.75, keywords_margin: 0.4, flag: 2.0, decay: 0.8 },
      scores: [
        {
          score: "Keyword score and probability",
          plain: "Each keyword heard counts for a group. The strongest counts in full and each extra one counts a little less. The scores are turned into a probability for every group.",
          math: "Score S(group) = prior + Σ weightᵢ × 0.8^(i−1) (strongest first, ambiguous words × 0.5). Probability P(group) = e^S(group) ÷ Σ e^S(all groups)  (softmax).",
        },
        {
          score: "Business rules",
          plain: "Fixed patterns written with the sales team, such as “order confirmed”. A rule that is sure enough decides on its own.",
          math: "A rule result is trusted alone at ≥ 85%.",
        },
        {
          score: "Machine-learning model",
          plain: "A model that learned from visits a person had already labelled, and says how likely each group is.",
          math: "Logistic regression on TF-IDF word and letter patterns + keyword scores: z(group) = b + Σ wⱼ·xⱼ, P(group) = softmax(z). TF-IDF weight of a word = (count in note) × log(total notes ÷ notes with the word).",
        },
        {
          score: "Final decision",
          plain: "The methods are trusted in a fixed order, and a person decides when they disagree.",
          math: "Order of trust: human label → rules ≥ 85% → 2-of-3 agreement (all three, or the surest > 70%) → ML ≥ 60% → keywords ≥ 75% with a 40% lead → otherwise human review.",
        },
        {
          score: "Sub-segments (flags)",
          plain: "Smaller facts about a visit, such as a promised payment or a delivery problem.",
          math: "A sub-segment is raised when its keyword score reaches 2.0 (one strong word or two weaker ones), or when a business rule finds it (dates, tonnes, phone checks).",
        },
        {
          score: "Urgency",
          plain: "How soon someone must act: P0 critical, P1 high, P2 medium, P3 low.",
          math: "The first matching rule wins: P0 unresolved quality complaint / customer may switch / bulk deal waiting → P1 complaint or delivery problem / stock-out / credit risk / competitor price pressure / big unconfirmed order / construction starting now → P2 routine follow-up or re-record → P3 information only.",
        },
        {
          score: "Note quality",
          plain: "How complete the rep's note is, out of 10.",
          math: "Sum of the 5K rubric (training Module 11): who (0-2) + what happened (0-2) + how much (0-2) + brand (0-1) + when next (0-2) + clarity (0-1).",
        },
        {
          score: "How far to trust a decision",
          plain: "How often decisions made this way were right on visits a person had checked, with a range that narrows as more are checked.",
          math: "Wilson 95% interval: (p + z²/2n ± z·√(p(1−p)/n + z²/4n²)) / (1 + z²/n), with z = 1.96",
        },
      ],
    },
  };
}

// ---------- keyword database ----------

export async function getKeywords(filter: { target?: string; language?: string; q?: string }): Promise<Fetched<KeywordList>> {
  const { data, error } = await db().from("keywords").select("id,term,language,target,kind,weight,status,meaning,active,added_by").order("target").order("id").range(0, 4999);
  if (error || !data) return failed();
  const everything = data as KeywordRow[];
  const rows = await loadRows(null);
  const segs = rows ? segmentsFrom(rows) : KNOWN_EXTRA_SEGMENTS;
  const flags = rows ? flagNamesFrom(rows) : {};
  const targets: KeywordList["targets"] = {};
  for (const k of everything) {
    targets[k.target] ??= k.kind === "flag" ? { kind: "flag", name: flags[k.target] ?? pretty(k.target) } : { kind: "segment", name: segs[k.target]?.name ?? pretty(k.target) };
  }
  const coverage: KeywordList["coverage"] = {};
  for (const k of everything) {
    const c = (coverage[k.target] ??= { total: 0 });
    c.total += 1;
    c[k.language] = (c[k.language] ?? 0) + 1;
  }
  const needle = filter.q?.toLowerCase();
  const keywords = everything.filter(
    (k) => (!filter.target || k.target === filter.target) && (!filter.language || k.language === filter.language) && (!needle || k.term.toLowerCase().includes(needle)),
  );
  return { ok: true, data: { total: keywords.length, keywords, coverage, targets, source: "Supabase (public.keywords)" } };
}

export async function postKeyword(k: KeywordSubmission, addedBy: string): Promise<Fetched<unknown>> {
  const kind = (await db().from("keywords").select("kind").eq("target", k.target).limit(1).maybeSingle()).data?.kind;
  if (!kind) return { ok: false, kind: "upstream", message: "Unknown segment or sub-segment." };
  const { error } = await db().from("keywords").insert({ ...k, kind, active: true, added_by: addedBy });
  return error ? failed() : { ok: true, data: null };
}

export async function setKeywordActive(id: number, active: boolean): Promise<Fetched<unknown>> {
  const { error } = await db().from("keywords").update({ active }).eq("id", id);
  return error ? failed() : { ok: true, data: null };
}
