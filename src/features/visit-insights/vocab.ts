import type { CaseEventKind, CaseState, CaseStatus, Urgency } from "./types.ts";

/**
 * Two vocabularies for the same data. "simple" is for anyone (the owner, a new joiner, someone who never used the
 * software): everyday words, no codes or percentages. "expert" is the trade's own terms, with the codes and SLAs.
 * `kid` is one sentence a child would follow, shown under a name in simple mode. The service's own names stay the
 * fallback, so a new segment from the service still shows up before it is added here.
 */
export type Words = "simple" | "expert";
export const WORDS_COOKIE = "tiq_vi_words";
export const parseWords = (v: string | null | undefined): Words => (v === "expert" ? "expert" : "simple");

interface Term {
  simple: string;
  expert: string;
  kid: string;
}

export const SEGMENT_TERMS: Record<string, Term> = {
  HOT_ORDER: { simple: "Ready to buy", expert: "Hot order · conversion-ready", kid: "The customer wants to buy now." },
  PAYMENT: { simple: "Money to collect", expert: "Collections & receivables", kid: "Someone owes us money, or just paid it." },
  COMPETITOR_PRICE: { simple: "Another brand is tempting them", expert: "Competitive threat · price objection", kid: "A rival brand is cheaper or closer." },
  COMPLAINT_ESCALATE: { simple: "Customer is upset", expert: "Service escalation · delivery / quality", kid: "Something went wrong and they are not happy." },
  SITE_PIPELINE: { simple: "Building work coming soon", expert: "Project pipeline · site demand", kid: "A house or building will need steel soon." },
  NEW_LEAD: { simple: "Chance of a new customer", expert: "New lead · prospect", kid: "Someone new might start buying from us." },
  TECH_SUPPORT: { simple: "Needs an expert's help", expert: "Technical service request", kid: "They need an engineer to look at something." },
  HAPPY_CUSTOMER: { simple: "Happy customer", expert: "Advocate · loyal account", kid: "They like us and may tell their friends." },
  LOW_VALUE_VISIT: { simple: "Visit got nothing", expert: "Non-productive call", kid: "The rep went, but nothing came of it." },
  UNCLEAR_RECORDING: { simple: "Note is hard to understand", expert: "Low-quality / unverifiable note", kid: "We can't tell what happened from the note." },
};

export const GROUP_TERMS: Record<string, Term> = {
  Revenue: { simple: "Sales", expert: "Revenue", kid: "Customers who want to buy." },
  Cash: { simple: "Money", expert: "Cash", kid: "Money owed to us, or paid." },
  "Market & Competition": { simple: "Rivals & prices", expert: "Market & Competition", kid: "Other brands trying to win our customers." },
  "Service & Supply": { simple: "Problems to fix", expert: "Service & Supply", kid: "Late deliveries, bad material, or help needed." },
  "Demand Pipeline": { simple: "Future business", expert: "Demand Pipeline", kid: "New customers and building work coming up." },
  "Relationship & Channel": { simple: "Good relationships", expert: "Relationship & Channel", kid: "Customers who are happy with us." },
  "Visit Quality": { simple: "Visit quality", expert: "Visit Quality", kid: "Visits that went nowhere, or unclear notes." },
};

export const URGENCY_TERMS: Record<Urgency, Term> = {
  P0: { simple: "Fix today", expert: "P0 · Critical · same-day SLA", kid: "Drop everything." },
  P1: { simple: "Fix in 1–2 days", expert: "P1 · High · 24–48 h SLA", kid: "Soon, before it gets worse." },
  P2: { simple: "This week", expert: "P2 · Medium · weekly", kid: "Sometime this week." },
  P3: { simple: "Just for info", expert: "P3 · Low · trend only", kid: "Good to know." },
};

export const OWNER_TERMS: Record<string, Term> = {
  "Area Sales Manager": { simple: "Area manager", expert: "Area Sales Manager", kid: "The boss of this area." },
  "VP Sales": { simple: "Sales head", expert: "VP Sales", kid: "The boss of all sales." },
  "Depot / Dispatch": { simple: "Warehouse & delivery team", expert: "Depot / Dispatch", kid: "The people who send the steel." },
  Supervisor: { simple: "Team leader", expert: "Supervisor", kid: "The rep's team leader." },
  "Field rep": { simple: "The sales rep", expert: "Field rep", kid: "The person who visited." },
  "Technical team": { simple: "Engineers", expert: "Technical team", kid: "Our steel experts." },
};

export const STATUS_TERMS: Record<CaseStatus, Term> = {
  new: { simple: "Not looked at yet", expert: "New · unacknowledged", kid: "Nobody at head office has seen this." },
  seen: { simple: "Head office has seen it", expert: "Acknowledged", kid: "Someone read it." },
  waiting: { simple: "Waiting for the rep", expert: "Assigned · awaiting rep", kid: "We asked the rep to do something." },
  resolved: { simple: "Sorted", expert: "Resolved · closed", kid: "All done." },
};

export const EVENT_TERMS: Record<CaseEventKind, { simple: string; expert: string }> = {
  visit: { simple: "Rep visited and recorded a note", expert: "Visit logged" },
  seen: { simple: "Head office saw it", expert: "Acknowledged by HO" },
  message: { simple: "Head office sent the rep a message", expert: "Task assigned to rep" },
  rep_read: { simple: "Rep opened the message", expert: "Read receipt" },
  rep_replied: { simple: "Rep replied", expert: "Rep response" },
  note: { simple: "Note added", expert: "HO note" },
  rep_done: { simple: "Rep finished the to-dos", expert: "Rep marked complete" },
  resolved: { simple: "Marked as sorted", expert: "Case resolved" },
  reopened: { simple: "Opened again", expert: "Case reopened" },
};

const pick = (table: Record<string, Term>, key: string, words: Words, fallback = key) => table[key]?.[words] ?? fallback;

export const segmentTerm = (code: string, words: Words, fallback?: string) => pick(SEGMENT_TERMS, code, words, fallback);
export const groupTerm = (group: string, words: Words) => pick(GROUP_TERMS, group, words);
export const ownerTerm = (owner: string, words: Words) => pick(OWNER_TERMS, owner, words);
export const urgencyTerm = (u: Urgency, words: Words) => URGENCY_TERMS[u][words];
export const statusTerm = (s: CaseStatus, words: Words) => STATUS_TERMS[s][words];
export const kidLine = (table: Record<string, Term>, key: string) => table[key]?.kid ?? null;

/** The one next step on a visit, by where it stands. This is the "what do I do now?" line on every card. */
export function nextStep(c: CaseState | null | undefined, rep: string, words: Words): string {
  const who = rep.split(" ")[0] ? titleCase(rep.split(" ")[0]) : "the rep";
  const status = c?.status ?? "new";
  const simple = words === "simple";
  if (status === "new") return simple ? "Read this, then tell us you've seen it, or send the rep a to-do." : "Acknowledge, or assign a task to the rep.";
  if (status === "seen") return simple ? `Send ${who} a to-do, or mark it sorted if nothing more is needed.` : `Assign ${who} a task, or resolve.`;
  if (status === "resolved") return simple ? "All sorted. Open it again if the problem comes back." : "Closed. Reopen on recurrence.";
  switch (c?.rep_state) {
    case "replied":
      return simple ? `${who} replied. Read it, then mark it sorted or send another message.` : `${who} responded. Review, then resolve or follow up.`;
    case "done":
      return simple ? `${who} says it's done. Check, then mark it sorted.` : `${who} marked complete. Verify and resolve.`;
    case "read":
      return simple ? `${who} opened your message. Their reply will show here.` : `Read by ${who}; awaiting response.`;
    default:
      return simple ? `Waiting for ${who} to open your message.` : `Delivered to ${who}; unread.`;
  }
}

export const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s.'-])\p{L}/gu, (m) => m.toUpperCase());
