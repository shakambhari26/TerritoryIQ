/**
 * A spoken question: a same-origin POST of `{ audio }` (base64 WAV) to `/api/globe/ask-voice`. The URL is a literal; the
 * transcript and then the answer arrive as a plain-text stream, handed to `onText` piece by piece.
 */

const VOICE_URL = "/api/globe/ask-voice";

export async function askByVoice(audio: string, onText: (text: string) => void, signal: AbortSignal): Promise<void> {
  const response = await fetch(VOICE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio }),
    signal,
    cache: "no-store",
  });
  if (!response.ok || !response.body) {
    let message = "The assistant could not hear the question. Try again.";
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
