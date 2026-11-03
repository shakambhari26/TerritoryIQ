import { connection } from "next/server";
import { isRequestAuthorized } from "@/lib/auth";
import { MAX_CHAT_BYTES, parseChatBody } from "@/features/visit-insights/chat-form";
import { postChat } from "@/features/visit-insights/client.server";
import { isSameOrigin } from "@/features/visit-insights/label-form";

/**
 * POST /api/visit-insights/chat: one chat message from the Visit Insights chat window. Checks the session again (the
 * proxy already did), refuses cross-site posts, validates the body, and forwards it to the Visit Intelligence service
 * server-side. The service answers locally (no AI cost) whenever it can; see rag.py there.
 */
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;
const fail = (status: number, error: string) => Response.json({ error }, { status, headers: HEADERS });

export async function POST(request: Request) {
  await connection();
  if (!isRequestAuthorized(request.headers)) return fail(401, "Sign in required.");
  if (!isSameOrigin(request.headers)) return fail(403, "Cross-site request refused.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_CHAT_BYTES) return fail(413, "Message too long.");

  const body = parseChatBody(await request.text());
  if (!body) return fail(400, "Write a question of up to 300 characters.");
  const res = await postChat(body);
  if (!res.ok) return fail(502, res.message);
  return Response.json(res.data, { headers: HEADERS });
}
