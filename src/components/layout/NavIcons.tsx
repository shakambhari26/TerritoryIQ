import type { ReactNode } from "react";

/** Outline icons for the sidebar, drawn on a 24-px grid. Decorative: the link's text is its name. */
function Icon({ children, className }: { children: ReactNode; className?: string }) {
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
      className={className}
    >
      {children}
    </svg>
  );
}

export const NAV_ICONS: Record<string, (props: { className?: string }) => ReactNode> = {
  Overview: (p) => (
    <Icon {...p}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.75" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.75" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.75" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.75" />
    </Icon>
  ),
  Globe: (p) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5Z" />
    </Icon>
  ),
  Workspace: (p) => (
    <Icon {...p}>
      <path d="M9 5 3.5 7v12L9 17l6 2 5.5-2V5L15 7 9 5Z" />
      <path d="M9 5v12M15 7v12" />
    </Icon>
  ),
  "Visit Insights": (p) => (
    <Icon {...p}>
      <path d="M4 5.5h16v10H9.5L5.5 19.5v-4H4z" />
      <path d="M8.5 12.5l2.5-3 2 2 3-4" />
    </Icon>
  ),
  Allocation: (p) => (
    <Icon {...p}>
      <path d="M12 3.5v8.5h8.5" />
      <path d="M20.5 12A8.5 8.5 0 1 1 12 3.5" />
    </Icon>
  ),
  Analytics: (p) => (
    <Icon {...p}>
      <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
    </Icon>
  ),
  "Data Import": (p) => (
    <Icon {...p}>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M4.5 14.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </Icon>
  ),
  Search: (p) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Icon>
  ),
  Menu: (p) => (
    <Icon {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  ),
  Close: (p) => (
    <Icon {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  ),
  Collapse: (p) => (
    <Icon {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </Icon>
  ),
};
