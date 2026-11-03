/**
 * Shapes returned by the Visit Intelligence API (the Python service in the elegant-visit-intel repo,
 * `GET /v1/insights/{role}`). Only the fields the pages read are typed.
 */

export const ROLES = [
  { id: "md", label: "MD / ED", question: "Is the business healthy, and where must I step in?" },
  { id: "vp_sales", label: "VP Sales", question: "Which reps and areas are winning or losing?" },
  { id: "supervisor", label: "Supervisor", question: "What must my team do today?" },
  { id: "business_analyst", label: "Business Analyst", question: "Why is this happening?" },
  { id: "data_analyst", label: "Data Analyst", question: "Can we trust the data and the model?" },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

/** The admin list of every visit, with a dropdown for each segment level. Not a role view, so it has its own fetch. */
export const EXPLORE = { id: "explore", label: "All visits", question: "Every visit, filtered any way you like." } as const;
export type TabId = RoleId | typeof EXPLORE.id;

export const DAY_RANGES = [7, 30, 90] as const;

export type Urgency = "P0" | "P1" | "P2" | "P3";

export interface VisitBrief {
  visit_key: string;
  visit_at: string | null;
  rep_name: string;
  customer_name: string;
  contact: string;
  visit_category: string;
  segment: string;
  segment_name: string;
  emoji: string;
  group: string;
  confidence: number;
  decided_by: string;
  urgency: Urgency;
  urgency_reason: string;
  flags: string[];
  qty_mt: number | null;
  follow_up: { date: string | null; evidence: string; ambiguous: boolean } | null;
  note_score: number;
  note_issues: string[];
  action: { playbook_id: string; owner: string; text: string };
  needs_review: boolean;
  transcript: string;
  /** One-sentence reason for the group and urgency (explain.py in the service). */
  why: string | null;
  /** Head office's follow-through (cases.py in the service). Absent only on an older service. */
  case?: CaseState | null;
  /** Which words decided it, as non-overlapping spans of `transcript` (highlight.py in the service). */
  highlights?: Highlight[];
}

export interface Highlight {
  start: number;
  end: number;
  kind: "decisive" | "other" | "flag" | "negated" | "ml";
  target: string;
  weight: number;
  by: "keywords" | "ml";
  negated_by: string | null;
}

export const CASE_STATUSES = ["new", "seen", "waiting", "resolved"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const CASE_ACTIONS = ["seen", "resolve", "reopen", "note"] as const;
export type CaseAction = (typeof CASE_ACTIONS)[number];

export type CaseEventKind = "visit" | "seen" | "message" | "rep_read" | "rep_replied" | "note" | "rep_done" | "resolved" | "reopened";

export interface CaseEvent {
  kind: CaseEventKind;
  at: string | null;
  actor: string;
  text: string;
  todos?: number;
  message_id?: number;
}

/** GET/POST /v1/cases/{key}. "waiting" is derived from the visit's messages; `rep_state` is the latest one's status. */
export interface CaseState {
  status: CaseStatus;
  rep_state: "sent" | "read" | "replied" | "done" | null;
  seen_at: string | null;
  seen_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  messages: number;
  events: CaseEvent[];
}

export interface Recommendation {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  why: string;
  action: string;
  owner: string;
  filter: Record<string, string>;
  count: number | null;
}

export interface SuggestedQuestion {
  id: string;
  question: string;
}

/** Fields every role view and the All-visits view carry. */
export interface Common {
  recommendations: Recommendation[];
  suggested_questions: SuggestedQuestion[];
  ai_enabled: boolean;
}

export const FILTER_KEYS = ["group", "segment", "urgency", "flag", "rep", "stakeholder", "review", "status", "category", "q"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Partial<Record<FilterKey, string>>;

export interface ExploreData extends Common {
  filters: Filters;
  total: number;
  all: number;
  facets: Record<Exclude<FilterKey, "review" | "q">, { value: string; count: number }[]>;
  visits: VisitBrief[];
  segments: { code: string; name: string; emoji: string; group: string }[];
  flag_names: Record<string, string>;
  overview: Overview;
}

export interface Overview {
  visits: number;
  reps: number;
  customers: number;
  tonnes_confirmed: number;
  tonnes_mentioned: number;
  alerts_p0_p1: number;
  competitor_visits: number;
  payment_visits: number;
  needs_review: number;
  avg_note_score: number | null;
  date_from: string | null;
  date_to: string | null;
  followup?: Partial<Record<CaseStatus, number>>;
  groups?: Record<string, number>;
}

export interface SegmentCount {
  code: string;
  name: string;
  emoji: string;
  group: string;
  count: number;
}

export interface MdInsights extends Common {
  overview: Overview;
  groups: { group: string; count: number }[];
  competitors: { brand: string; visits: number }[];
  alerts: VisitBrief[];
  segments: SegmentCount[];
}

export interface RepRow {
  rep_name: string;
  visits: number;
  result_rate: number;
  avg_note_score: number;
  orders: number;
  tonnes: number;
  new_leads: number;
  competitor_visits: number;
  no_result: number;
  alerts: number;
}

export interface VpInsights extends Common {
  overview: Overview;
  reps: RepRow[];
  pipeline: VisitBrief[];
  competitor_visits: VisitBrief[];
}

export interface SupervisorInsights extends Common {
  overview: Overview;
  urgent: VisitBrief[];
  follow_ups: VisitBrief[];
  re_record: VisitBrief[];
  review_queue: VisitBrief[];
  coach: { rep_name: string; avg_note_score: number; notes: number }[];
}

export interface AnalystInsights extends Common {
  overview: Overview;
  segments: SegmentCount[];
  by_stakeholder: ({ stakeholder: string } & Record<string, number | string>)[];
  sentiment: Record<string, number>;
  urgency: Record<Urgency, number>;
  flags: { flag: string; name: string; count: number }[];
}

export interface ModelMeta {
  version: string;
  trained_at: string;
  algorithm: string;
  rows: number;
  cv: string;
  macro_f1: number;
  accuracy: number;
  per_class_f1: Record<string, number>;
  class_counts: Record<string, number>;
}

export interface DataInsights extends Common {
  overview: Overview;
  model: ModelMeta | null;
  decided_by: Record<string, number>;
  avg_confidence: number | null;
  quality: {
    invalid_phones: number;
    shared_phones: { phone: string; customers: string[] }[];
    category_mismatch: number;
    unclear_recordings: number;
    ambiguous_slang: Record<string, number>;
  };
  note_score_distribution: { score: number; visits: number }[];
}

export interface Taxonomy {
  segments: Record<string, { name: string; emoji: string; group: string; meaning: string }>;
  urgency: Record<Urgency, { name: string; sla: string }>;
  flags: Record<string, { name: string; parent: string | null }>;
}

/** One step of a visit's explanation: plain words, the calculation, and the numbers behind it. */
export interface ExplanationStep {
  id: string;
  title: string;
  plain: string;
  math?: string | null;
  note?: string | null;
  table?: { head: string[]; rows: (string | number)[][] };
  numbers?: { label: string; score?: number; probability: number }[];
}

export interface Explanation {
  summary: string;
  steps: ExplanationStep[];
  reliability: { correct: number; n: number; rate: number; low: number; high: number } | null;
}

/** GET /v1/visits/{key}: the visit and its full analysis. */
export interface VisitDetail {
  visit_key: string;
  rep_name: string;
  visit_at: string | null;
  customer_name: string;
  visit_category: string;
  transcript: string;
  result: {
    segment: { code: string; name: string; emoji: string; group: string; confidence: number; decided_by: string };
    urgency: { level: Urgency; reason: string };
    flags: string[];
    action: { playbook_id: string; owner: string; text: string };
    needs_human_review: boolean;
    note_quality: { score: number; issues: string[] };
    explanation?: Explanation;
  };
}

export interface Methodology {
  scores: { score: string; plain: string; math: string }[];
  thresholds: Record<string, number>;
}

export const CHANNELS = [
  { id: "in_app", label: "In-app" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "Email" },
] as const;
export type ChannelId = (typeof CHANNELS)[number]["id"];

export interface MessagingStatus {
  channels: Record<ChannelId | "reply_links", boolean>;
  ai_enabled: boolean;
}

export interface Contact {
  rep_name: string;
  whatsapp: string;
  email: string;
  has_whatsapp: boolean;
  has_email: boolean;
}

export interface SentMessage {
  id: number;
  created_at: string | null;
  sender: string;
  rep_name: string;
  visit_key: string | null;
  kind: "suggestion" | "todo";
  title: string;
  body: string;
  todos: { text: string; done: boolean }[];
  channels: ChannelId[];
  deliveries: Record<string, { status: string; detail: string; at: string }>;
  ai_drafted: boolean;
  status: "sent" | "read" | "replied" | "done";
  read_at: string | null;
  done_at: string | null;
  replies: { author: "rep" | "ho"; text: string; at: string }[];
  /** The rep's private page (null until PUBLIC_BASE_URL is set on the service). */
  reply_link: string | null;
  /** Open head office's own WhatsApp / mail app with the message filled in: works with no WhatsApp or SMTP setup. */
  share: { whatsapp: string; email: string };
}

/** POST /v1/messages/draft. `source` says whether the AI wrote it or the playbook did (AI off or unavailable). */
export interface Draft {
  rep_name: string;
  visit_key: string | null;
  kind: "suggestion" | "todo";
  analysis: string;
  options: string[];
  recommendation: string;
  title: string;
  message: string;
  todos: string[];
  source: "ai" | "playbook";
  note?: string;
}

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "bn", label: "Bengali" },
  { id: "hi", label: "Hindi" },
] as const;

export interface KeywordRow {
  id: number;
  term: string;
  language: string;
  target: string;
  kind: "segment" | "flag";
  weight: number;
  status: "verified" | "draft" | "ambiguous";
  meaning: string;
  active: boolean;
  added_by: string;
}

export interface KeywordList {
  total: number;
  keywords: KeywordRow[];
  coverage: Record<string, { total: number } & Record<string, number>>;
  targets: Record<string, { kind: "segment" | "flag"; name: string; parent?: string | null }>;
  source: string;
}

export interface KeywordScore {
  matches: { term: string; matched: string; target: string; weight: number; effective: number; language: string; negated_by: string | null }[];
  probabilities: { segment: string; probability: number }[];
  segment_scores: Record<string, number>;
  flags: string[];
  flag_scores: Record<string, number>;
  top: string;
  top_probability: number;
  margin: number;
  entropy: number;
}

/** POST /v1/chat. `mode` says whether the answer cost an AI call ("ai") or was free ("calculated", "local", "cached"). */
export interface ChatReply {
  mode: "calculated" | "local" | "cached" | "ai";
  confidence: "high" | "medium" | "low";
  answer: string;
  visits: VisitBrief[];
  intent: string;
  filters: Record<string, string[] | string>;
  explore_filter: Record<string, string>;
  matched_question?: string;
  suggestions: SuggestedQuestion[];
  note?: string;
  ai_enabled: boolean;
}

export interface ChatStats {
  questions: number;
  by_mode: Record<string, number>;
  answered_without_api: number | null;
  ai_input_tokens: number;
  ai_output_tokens: number;
  avg_latency_ms_local: number;
  model: string;
}
