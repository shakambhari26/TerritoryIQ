import { connection } from "next/server";
import { postKeyword, setKeywordActive } from "@/features/visit-insights/client.server";
import { parseKeywordForm } from "@/features/visit-insights/forms";
import { back, readHoForm } from "@/features/visit-insights/guard.server";

/** POST /api/visit-insights/keywords: add a keyword to the database, or switch one off / on. */
export async function POST(request: Request) {
  await connection();
  const body = await readHoForm(request);
  if (body instanceof Response) return body;
  const k = parseKeywordForm(body);
  if (!k) return back("/visit-insights/keywords?saved=0");
  const res = k.action === "add" ? await postKeyword(k.keyword) : await setKeywordActive(k.id, k.active);
  const target = k.action === "add" ? `&target=${k.keyword.target}` : "";
  return back(`/visit-insights/keywords?saved=${res.ok ? 1 : 0}${target}`);
}
