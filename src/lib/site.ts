import type { NavItem } from "@/types/navigation";

export const SITE = {
  name: "TerritoryIQ",
  tagline: "Sales Territory Intelligence Platform",
  description:
    "Sales territory intelligence: geographic territory mapping, allocation and analytics.",
} as const;

/**
 * Top-level navigation. Only routes that exist are `available`; everything else
 * is a planned module and must not link anywhere until it is built.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Overview", href: "/", status: "available" },
  { label: "Workspace", href: "/workspace", status: "available" },
  { label: "Allocation", status: "planned" },
  { label: "Analytics", status: "planned" },
  { label: "Data Import", status: "planned" },
];
