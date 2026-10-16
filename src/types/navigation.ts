export type NavItemStatus =
  /** A route that exists today. */
  | "available"
  /** A planned module with no route yet; rendered as non-interactive. */
  | "planned";

export interface NavItem {
  label: string;
  /** Only meaningful for `available` items. */
  href?: string;
  status: NavItemStatus;
}
