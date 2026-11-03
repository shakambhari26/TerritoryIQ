/**
 * Validation for POST /api/visit-insights/chat. Pure functions, no imports, so the unit tests can drive them. Only the
 * fields the service needs pass through; `previous` (the last answer's filters, for follow-ups such as "what about only
 * dealers") is reduced to short string lists.
 */

export const MAX_CHAT_BYTES = 4096;
export const MAX_MESSAGE_LENGTH = 300;

const ROLE = /^(md|vp_sales|supervisor|business_analyst|data_analyst|explore)$/;
const PREVIOUS_KEYS = ["segments", "flags", "urgency", "categories", "brands", "reps", "customers"] as const;

export interface ChatSubmission {
  message: string;
  role: string;
  days: number | null;
  previous: Record<string, string[]> | null;
}

export function parseChatBody(text: string): ChatSubmission | null {
  if (text.length > MAX_CHAT_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) return null;
  const role = typeof b.role === "string" && ROLE.test(b.role) ? b.role : "md";
  const days = typeof b.days === "number" && [7, 30, 90].includes(b.days) ? b.days : null;
  let previous: Record<string, string[]> | null = null;
  if (typeof b.previous === "object" && b.previous !== null) {
    previous = {};
    for (const key of PREVIOUS_KEYS) {
      const v = (b.previous as Record<string, unknown>)[key];
      if (Array.isArray(v)) previous[key] = v.filter((x): x is string => typeof x === "string" && x.length <= 100).slice(0, 10);
    }
  }
  return { message, role, days, previous };
}
