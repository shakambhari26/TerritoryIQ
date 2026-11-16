/** A spoken answer: a same-origin POST of `{ text }` to `/api/globe/speak`, returning the audio. The URL is a literal. */

const SPEAK_URL = "/api/globe/speak";

export async function fetchSpeech(text: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(SPEAK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("The voice could not be made.");
  return response.blob();
}
