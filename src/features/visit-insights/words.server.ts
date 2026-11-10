import { cookies } from "next/headers";
import { WORDS_COOKIE, parseWords, type Words } from "./vocab";

/** The Simple / Expert choice, saved by /api/visit-insights/words. Simple until someone switches. */
export async function readWords(): Promise<Words> {
  return parseWords((await cookies()).get(WORDS_COOKIE)?.value);
}
