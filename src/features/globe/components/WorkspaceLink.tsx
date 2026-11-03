import Link from "next/link";

/**
 * The hand-off to the 2D workspace: a plain link to a URL built from validated IDs (workspace-link.ts). It is not
 * disabled while the globe flies or when the outlines or textures failed, because it needs neither.
 *
 * It never prefetches. Workspace's payload carries every staff name, and Next would otherwise request it as soon as this
 * link is on screen, which would hand the names to a visitor who has only opened the globe. A click still navigates.
 */
export function WorkspaceLink({ href, label = "Open in 2D workspace", testId = "globe-open-workspace" }: { href: string; label?: string; testId?: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      data-testid={testId}
      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary-ink hover:border-primary"
    >
      {label}
      <span aria-hidden="true">{"→"}</span>
    </Link>
  );
}
