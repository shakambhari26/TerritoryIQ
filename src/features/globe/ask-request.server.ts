import "server-only";
import { isRequestAuthorized } from "@/lib/auth";
import { isSameOrigin } from "@/features/visit-insights/label-form";

/**
 * Shared checks for the team assistant's routes (ask, ask-voice, speak): signed in, same site, JSON, size-capped, and a
 * body that is exactly `{ "<key>": "<string>" }`. Returns the string, or the error Response to send.
 */
export const ASK_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;
export const askFail = (status: number, error: string) => Response.json({ error }, { status, headers: ASK_HEADERS });

export async function readOneField(request: Request, key: string, maxBytes: number): Promise<string | Response> {
  if (!isRequestAuthorized(request.headers)) return askFail(401, "Sign in required.");
  if (!isSameOrigin(request.headers)) return askFail(403, "Cross-site request refused.");
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return askFail(415, "The request must be application/json.");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return askFail(413, "The request is too large.");
  const text = await request.text();
  if (text.length > maxBytes) return askFail(413, "The request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return askFail(400, "The request body is not valid JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, key)) {
    return askFail(400, `The request must hold exactly one key, ${key}.`);
  }
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== "string" || !value.trim()) return askFail(400, `${key} must be a non-empty string.`);
  return value;
}

/** A text stream response from an async generator of strings. */
export function streamText(chunks: AsyncGenerator<string>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { headers: { ...ASK_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}
