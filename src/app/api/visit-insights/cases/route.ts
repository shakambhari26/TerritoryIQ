import { connection } from "next/server";
import { postCase } from "@/features/visit-insights/client.server";
import { parseCaseForm } from "@/features/visit-insights/forms";
import { back, readHoForm } from "@/features/visit-insights/guard.server";
import { landingHref, visitHref } from "@/features/visit-insights/links";

/**
 * POST /api/visit-insights/cases: head office marks a visit seen, resolves or reopens it, or adds a note, from the card
 * itself. Returns to the same view and card (`return_to`, checked by safeReturn) with what happened.
 */
export async function POST(request: Request) {
  await connection();
  const body = await readHoForm(request);
  if (body instanceof Response) return body;
  const c = parseCaseForm(body);
  if (!c) return back("/visit-insights?done=error");
  const res = await postCase(c);
  const done = res.ok ? c.action : "error";
  return back(c.return_to ? landingHref(c.return_to, done, c.visit_key) : visitHref(c.visit_key, { done }));
}
