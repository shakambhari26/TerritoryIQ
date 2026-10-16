import { Card } from "@/components/ui/Card";

interface KpiCardProps {
  label: string;
  /** Omit until a real data source exists; the card then renders an empty state. */
  value?: string;
  caption?: string;
}

export function KpiCard({ label, value, caption }: KpiCardProps) {
  const hasValue = value !== undefined;

  return (
    <Card as="article" className="relative overflow-hidden p-5">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 bg-accent"
      />
      <dl>
        <dt className="text-sm font-medium text-ink-muted">{label}</dt>
        <dd
          className={
            hasValue
              ? "mt-2 text-3xl font-semibold tracking-tight text-ink"
              : "mt-2 text-3xl font-semibold tracking-tight text-ink-subtle"
          }
        >
          {hasValue ? (
            value
          ) : (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">No value yet</span>
            </>
          )}
        </dd>
        {caption ? (
          <dd className="mt-1 text-xs text-ink-subtle">{caption}</dd>
        ) : null}
      </dl>
    </Card>
  );
}
