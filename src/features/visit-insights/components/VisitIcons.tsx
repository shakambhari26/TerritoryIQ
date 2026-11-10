import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Outline icons for Visit Insights, on the same 24-px grid as the sidebar (components/layout/NavIcons.tsx). No icon
 * library: the guardrails pin the runtime dependencies. Decorative: the text beside each icon is its name.
 */
function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {children}
    </svg>
  );
}

const PATHS = {
  cart: (
    <>
      <path d="M3.5 4.5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.1l1.5-6.3H6.6" />
      <circle cx="10" cy="19.5" r="1.25" />
      <circle cx="17" cy="19.5" r="1.25" />
    </>
  ),
  rupee: (
    <>
      <path d="M7 4.5h10M7 9h10" />
      <path d="M9.5 4.5c3.3 0 5 1.3 5 4.5s-2.4 4.5-6.5 4.5h-1l7.5 7" />
    </>
  ),
  swords: (
    <>
      <path d="m4 4 9.5 9.5M4 4v3.5M4 4h3.5" />
      <path d="M20 4 10.5 13.5M20 4v3.5M20 4h-3.5" />
      <path d="m8 16-3 3M16 16l3 3M6.5 13.5l4 4M17.5 13.5l-4 4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 21 19.5H3L12 4Z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  crane: (
    <>
      <path d="M6 20.5V4.5h0l12 3M6 7.5h12M18 7.5v4" />
      <path d="M16.5 11.5h3v2.5h-3z" />
      <path d="M3.5 20.5h6M6 11l3-3.5M6 15l3-3.5" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 20.5V11" />
      <path d="M12 11c0-3.6-2.4-6-6.5-6 0 3.6 2.4 6 6.5 6Z" />
      <path d="M12 13.5c0-3 2-5 5.5-5 0 3-2 5-5.5 5Z" />
    </>
  ),
  wrench: <path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 1-2-2Zm0 0L17 4" />,
  star: <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8L12 4Z" />,
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />,
  micOff: (
    <>
      <path d="M9 9v2a3 3 0 0 0 5 2.2M15 10V6a3 3 0 0 0-5.8-1" />
      <path d="M5.5 11a6.5 6.5 0 0 0 10.6 5M18.5 11c0 .7-.1 1.3-.3 1.9M12 17.5V20M4 4l16 16" />
    </>
  ),
  send: (
    <>
      <path d="M20.5 3.5 10 14" />
      <path d="m20.5 3.5-6.5 17-4-6.5-6.5-4 17-6.5Z" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </>
  ),
  rotate: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
      <path d="M4.5 4.5V9H9" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </>
  ),
  filter: <path d="M4 5.5h16l-6.2 7.3v5.5l-3.6 1.7v-7.2L4 5.5Z" />,
  sparkles: (
    <>
      <path d="M10 4.5 11.6 9l4.4 1.6-4.4 1.6L10 16.5l-1.6-4.3L4 10.6 8.4 9 10 4.5Z" />
      <path d="M17.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </>
  ),
  chevron: <path d="m7 9.5 5 5 5-5" />,
  note: (
    <>
      <path d="M5.5 4.5h13v11l-4 4h-9v-15Z" />
      <path d="M14.5 19.5v-4h4M8.5 9h7M8.5 12.5h4" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V20.5" />
    </>
  ),
  reply: <path d="M10 8.5 5 13l5 4.5M5 13h9a5 5 0 0 1 5 5v1" />,
  inbox: (
    <>
      <path d="M3.5 13.5 6 5.5h12l2.5 8v5h-17v-5Z" />
      <path d="M3.5 13.5h5l1 2.5h5l1-2.5h5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>
  ),
  book: (
    <>
      <path d="M4.5 5.5c2.8-1 5.3-.8 7.5.8v13c-2.2-1.6-4.7-1.8-7.5-.8v-13Z" />
      <path d="M19.5 5.5c-2.8-1-5.3-.8-7.5.8v13c2.2-1.6 4.7-1.8 7.5-.8v-13Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <Svg className={className}>{PATHS[name]}</Svg>;
}

export const SEGMENT_ICON: Record<string, IconName> = {
  HOT_ORDER: "cart",
  PAYMENT: "rupee",
  COMPETITOR_PRICE: "swords",
  COMPLAINT_ESCALATE: "alert",
  SITE_PIPELINE: "crane",
  NEW_LEAD: "sprout",
  TECH_SUPPORT: "wrench",
  HAPPY_CUSTOMER: "star",
  LOW_VALUE_VISIT: "moon",
  UNCLEAR_RECORDING: "micOff",
};

export const GROUP_ICON: Record<string, IconName> = {
  Revenue: "cart",
  Cash: "rupee",
  "Market & Competition": "swords",
  "Service & Supply": "alert",
  "Demand Pipeline": "crane",
  "Relationship & Channel": "star",
  "Visit Quality": "mic",
};

/** One colour per business area: the icon disc, the tile and the card's left edge. */
export const GROUP_TONE: Record<string, { disc: string; edge: string; soft: string }> = {
  Revenue: { disc: "bg-emerald-100 text-emerald-800", edge: "border-l-emerald-500", soft: "bg-emerald-50" },
  Cash: { disc: "bg-amber-100 text-amber-900", edge: "border-l-amber-500", soft: "bg-amber-50" },
  "Market & Competition": { disc: "bg-orange-100 text-orange-800", edge: "border-l-orange-500", soft: "bg-orange-50" },
  "Service & Supply": { disc: "bg-red-100 text-red-800", edge: "border-l-red-500", soft: "bg-red-50" },
  "Demand Pipeline": { disc: "bg-sky-100 text-sky-800", edge: "border-l-sky-500", soft: "bg-sky-50" },
  "Relationship & Channel": { disc: "bg-violet-100 text-violet-800", edge: "border-l-violet-500", soft: "bg-violet-50" },
  "Visit Quality": { disc: "bg-slate-200 text-slate-700", edge: "border-l-slate-400", soft: "bg-slate-50" },
};
export const NEUTRAL_TONE = { disc: "bg-surface-muted text-ink-muted", edge: "border-l-line-strong", soft: "bg-surface-muted" };
export const toneOf = (group: string) => GROUP_TONE[group] ?? NEUTRAL_TONE;
