/**
 * Validation for the supervisor's one-tap correction form (POST /api/visit-insights/labels). Pure functions, no
 * imports, so the unit tests can drive them directly. Values are checked against fixed patterns and never echoed.
 */

export const MAX_LABEL_FORM_BYTES = 2048;

const VISIT_KEY = /^[A-Za-z0-9_-]{1,64}$/;
const SEGMENT = /^[A-Z_]{3,40}$/;
const URGENCY = /^P[0-3]$/;

export interface LabelSubmission {
  visit_key: string;
  segment: string;
  urgency: string | null;
}

export function parseLabelForm(body: string): LabelSubmission | null {
  if (body.length > MAX_LABEL_FORM_BYTES) return null;
  const form = new URLSearchParams(body);
  const visitKey = form.get("visit_key") ?? "";
  const segment = form.get("segment") ?? "";
  const urgency = form.get("urgency") ?? "";
  if (!VISIT_KEY.test(visitKey) || !SEGMENT.test(segment)) return null;
  if (urgency !== "" && !URGENCY.test(urgency)) return null;
  return { visit_key: visitKey, segment, urgency: urgency || null };
}

/**
 * A cross-site form must not change labels. Same rule as POST /login (src/app/login/route.ts): Sec-Fetch-Site decides
 * when the browser sends it; otherwise a named Origin must be this host.
 */
export function isSameOrigin(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin" || site === "none";
  const origin = headers.get("origin");
  if (origin === null) return true;
  try {
    return new URL(origin).host === headers.get("host");
  } catch {
    return false;
  }
}
