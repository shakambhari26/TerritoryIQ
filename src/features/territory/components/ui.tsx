import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-accent-ink";

export const buttonClass =
  "inline-flex items-center justify-center rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50";

export const primaryButtonClass =
  "inline-flex items-center justify-center rounded-md bg-navy-950 px-3 py-2 text-sm font-semibold text-on-navy hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50";

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-line pt-4", className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      <div className="mt-2 space-y-2 text-sm text-ink">{children}</div>
    </section>
  );
}

export function Problems({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <ul role="alert" className="space-y-0.5 rounded-md border border-red-700/30 bg-red-50 px-3 py-2 text-xs text-red-900">
      {items.map((problem) => (
        <li key={problem}>{problem}</li>
      ))}
    </ul>
  );
}

export function Note({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <p
      className={cn(
        "rounded-md border px-3 py-2 text-xs leading-5",
        tone === "warn" ? "border-amber-700/30 bg-amber-50 text-amber-900" : "border-line bg-surface-muted text-ink-muted",
      )}
    >
      {children}
    </p>
  );
}
