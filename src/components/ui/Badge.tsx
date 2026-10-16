import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  /** Which surface family the badge sits on, so contrast holds on both. */
  tone?: "light" | "navy";
}

/**
 * Small dashed-outline label. Used to flag design-only placeholders and
 * planned (not yet built) modules, so nothing reads as a working feature.
 */
export function Badge({ tone = "light", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-dashed px-2 py-0.5 text-[0.6875rem] font-medium uppercase leading-4 tracking-wide",
        tone === "light" &&
          "border-line-strong bg-surface-muted text-ink-muted",
        tone === "navy" &&
          "border-white/25 bg-white/5 text-on-navy-muted",
        className,
      )}
      {...props}
    />
  );
}
