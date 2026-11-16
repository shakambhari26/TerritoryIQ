import { connection } from "next/server";
import { aiConfigured, speak } from "@/features/globe/ask.server";
import { ASK_HEADERS, askFail, readOneField } from "@/features/globe/ask-request.server";

/** POST /api/globe/speak: `{"text": "..."}` (at most 1,200 characters) read aloud by Gemini's voice, as WAV audio. */
export async function POST(request: Request) {
  await connection();
  const text = await readOneField(request, "text", 8192);
  if (text instanceof Response) return text;
  if (text.length > 1200) return askFail(400, "The text is too long to read aloud.");
  if (!aiConfigured()) return askFail(503, "Spoken answers need the AI to be switched on.");
  const audio = await speak(text);
  if (!audio) return askFail(502, "The voice could not be made. Try again.");
  return new Response(Buffer.from(audio.bytes), { headers: { ...ASK_HEADERS, "Content-Type": audio.mimeType } });
}
