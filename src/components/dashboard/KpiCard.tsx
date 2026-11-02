import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import { cn } from "@/lib/cn";

interface KpiCardProps {
  label: string;
  /** Omit until a real data source exists; the card then renders an empty state. */
  value?: string;
  caption?: string;
  /** A short explanation of what the figure counts, shown in a tooltip beside the label. */
  hint?: ReactNode;
  tone?: "primary" | "accent" | "neutral";
}

const TILE: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent-ink",
  neutral: "bg-surface-muted text-ink-muted",
};

/**
 * A figure card: a tinted marker tile (CSS only: the Overview carries no images or SVG) and the label on top, then the figure and what it counts. The label is the `dt`
 * and the figure the first `dd`, so the card reads as a term and its value to assistive technology.
 */
export function KpiCard({ label, value, caption, hint, tone = "primary" }: KpiCardProps) {
  const hasValue = value !== undefined;

  return (
    <Card as="article" className="flex h-full flex-col p-5">
      <dl className="flex h-full flex-col">
        <dt className="flex items-center gap-3 text-sm font-medium text-ink-muted">
          <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-xl", TILE[tone])}>
            <span className="size-3.5 rounded-full border-[3.5px] border-current" />
          </span>
          <span className="flex items-center gap-1">
            {label}
            {hint ? <InfoTip label={`About ${label}`}>{hint}</InfoTip> : null}
          </span>
        </dt>
        <dd className={cn("mt-4 text-4xl font-semibold tracking-tight", hasValue ? "text-ink" : "text-ink-subtle")}>
          {hasValue ? (
            value
          ) : (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">No value yet</span>
            </>
          )}
        </dd>
        {caption ? <dd className="mt-2 text-xs leading-5 text-ink-muted">{caption}</dd> : null}
      </dl>
    </Card>
  );
}
