import { connection } from "next/server";
import { answer } from "@/features/globe/ask.server";
import { askFail, readOneField, streamText } from "@/features/globe/ask-request.server";

/**
 * POST /api/globe/ask: one typed question to the globe's team assistant, `{"question": "..."}` (at most 300 characters),
 * answered as a plain-text stream in the question's language (features/globe/ask.server.ts).
 */
export async function POST(request: Request) {
  await connection();
  const question = await readOneField(request, "question", 2048);
  if (question instanceof Response) return question;
  if (question.length > 300) return askFail(400, "Ask a question of up to 300 characters.");
  return streamText(answer(question.trim()));
}
