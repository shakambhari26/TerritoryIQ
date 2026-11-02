"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface InfoTipProps {
  /** The accessible name of the button, e.g. "About Block Coverage". */
  label: string;
  children: ReactNode;
  /** Which edge of the button the bubble lines up with. */
  align?: "left" | "right";
}

/**
 * A small "i" button with a short explanation. It opens on hover and on keyboard focus, stays open while the pointer
 * is over it, and closes on Escape (WCAG 1.4.13: dismissible, hoverable, persistent). The bubble is always in the
 * document, hidden, so the button's `aria-describedby` is valid. The button is a 24 px target; the drawn mark is smaller.
 */
export function InfoTip({ label, children, align = "left" }: InfoTipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  };
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:text-primary-ink"
      >
        <span aria-hidden="true" className="flex size-4 items-center justify-center rounded-full border border-current text-[0.625rem] font-semibold leading-none">
          i
        </span>
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className={cn(
          "absolute top-full z-30 mt-1 w-56 rounded-lg border border-line bg-surface p-2.5 text-xs font-normal normal-case leading-5 tracking-normal text-ink-muted shadow-float",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        {children}
      </span>
    </span>
  );
}
