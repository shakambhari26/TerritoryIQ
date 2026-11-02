import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  /**
   * `neutral` for planned modules and quiet labels; `warning` (muted amber) for provisional and prototype states,
   * which must stay visible without shouting.
   */
  tone?: "neutral" | "warning";
}

/**
 * Compact uppercase label. Used to flag the local-prototype status, provisional data and planned (not yet built)
 * modules, so nothing reads as a working or approved feature. The words carry the meaning, never the colour alone.
 */
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold uppercase leading-4 tracking-wider",
        tone === "neutral" && "border-line bg-surface-muted text-ink-muted",
        tone === "warning" && "border-warn-line bg-warn-soft text-warn-ink",
        className,
      )}
      {...props}
    />
  );
}
