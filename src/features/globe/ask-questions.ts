/** The team assistant's suggested questions: shown as buttons under the map, answered by ask.server.ts. */
export const SUGGESTED_QUESTIONS = [
  "Which districts need hiring first?",
  "Which blocks have no field staff at all?",
  "Who is the most stretched in the field team?",
  "Where are the vacant positions?",
  "Which roles are missing in which districts?",
  "Give me a summary of the whole sales team.",
] as const;

/** Starts the transcript line at the top of a spoken question's answer stream. */
export const TRANSCRIPT_MARK = "Q:";

/** Splits a spoken question's answer stream into the transcript (its first "Q:" line) and the answer after it. */
export function splitVoice(raw: string): { question: string | null; answer: string } {
  const text = raw.replace(/^[\s\u2063]+/, "");
  if (!text.startsWith(TRANSCRIPT_MARK)) return { question: text.length > 3 ? "" : null, answer: text.length > 3 ? text : "" };
  const rest = text.slice(TRANSCRIPT_MARK.length);
  const end = rest.indexOf("\n");
  if (end < 0) return { question: rest.trim(), answer: "" };
  return { question: rest.slice(0, end).trim(), answer: rest.slice(end + 1).replace(/^\s+/, "") };
}
