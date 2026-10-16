type ClassValue = string | false | null | undefined;

/** Joins class names, skipping falsy values. Avoids a dependency for a one-liner. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
