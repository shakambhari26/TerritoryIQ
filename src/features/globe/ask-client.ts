/**
 * The globe's team assistant: a same-origin POST of `{ question }` to `/api/globe/ask` (src/app/api/globe/ask/route.ts).
 * The URL is a literal; the answer arrives as a plain-text stream and is handed to `onText` piece by piece.
 */

const ASK_URL = "/api/globe/ask";

export async function askTeam(question: string, onText: (text: string) => void, signal: AbortSignal): Promise<void> {
  const response = await fetch(ASK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
    cache: "no-store",
  });
  // An expired session is refused before the route runs (plain text, not JSON): say so plainly.
  if (response.status === 401) throw new Error("Your sign-in has expired. Reload the page to sign in again.");
  if (!response.ok || !response.body) {
    let message = "The assistant could not answer. Try again.";
    try {
      const value = ((await response.json()) as { error?: unknown } | null)?.error;
      if (typeof value === "string" && value.length < 120) message = value;
    } catch {
      /* keep the default */
    }
    throw new Error(message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onText(decoder.decode(value, { stream: true }));
  }
}
