import { connection } from "next/server";
import { aiConfigured, answerFromAudio } from "@/features/globe/ask.server";
import { askFail, readOneField, streamText } from "@/features/globe/ask-request.server";

/**
 * POST /api/globe/ask-voice: a spoken question, `{"audio": "<base64 16 kHz mono WAV>"}` (at most about 60 seconds).
 * The stream starts with the transcript line (TRANSCRIPT_MARK), then the answer in the spoken language.
 */
const MAX_BYTES = 3_000_000;

export async function POST(request: Request) {
  await connection();
  const audio = await readOneField(request, "audio", MAX_BYTES);
  if (audio instanceof Response) return audio;
  if (!aiConfigured()) return askFail(503, "Voice questions need the AI to be switched on.");
  // Must be base64 of a RIFF/WAVE file: "UklGR" is base64 for "RIFF".
  if (!/^UklGR[A-Za-z0-9+/]+=*$/.test(audio)) return askFail(400, "The recording must be a WAV file.");
  return streamText(answerFromAudio(audio));
}
