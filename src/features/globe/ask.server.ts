import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ServerManifest } from "./server-types";
import { SUGGESTED_QUESTIONS, TRANSCRIPT_MARK } from "./ask-questions";
import { ROLE_NAME, ROLE_ORDER } from "./staffing";

/**
 * The globe's team assistant. Server only. It answers questions about the sales team from the area-mapping sheet and
 * nothing else, streamed line by line:
 *
 *   - with GEMINI_API_KEY set, Google Gemini (gemini-3.8-flash, or GEMINI_MODEL) answers from a fact sheet built here (every district, every
 *     place with its team, the most stretched people), told to use only those facts;
 *   - without a key, a built-in engine answers the suggested questions and questions that name a district, a place or a
 *     person, from the same facts. It cannot invent anything.
 *
 * The fact sheet holds staff names, so with a key they are sent to Google's Gemini API.
 */


/** Gemini model; override with GEMINI_MODEL. */
const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
/**
 * How long Gemini reasons before answering. "low" answers a sheet lookup in ~3 s instead of ~12 s at the model's
 * default, with the same facts (it only reads the fact sheet). Override with GEMINI_THINKING=high.
 */
const THINKING = process.env.GEMINI_THINKING?.trim().toLowerCase() === "high" ? ThinkingLevel.HIGH : ThinkingLevel.LOW;

interface Person {
  name: string;
  role: string;
}
interface Place {
  id: string;
  name: string;
  district: string;
  people: Person[];
  vacancies: Array<string>;
  staff: number;
  field: number;
}
interface Facts {
  places: Place[];
  districts: Array<{ name: string; places: Place[]; staff: number; average: number; noField: number; vacant: number; roleShare: Record<string, number> }>;
  people: Array<{ name: string; roles: string[]; places: Place[] }>;
  totals: { people: number; places: number; average: number; field: number; vacant: number; noField: number };
  text: string;
}

async function loadFacts(): Promise<Facts | null> {
  let server: ServerManifest;
  try {
    server = JSON.parse(await readFile(path.join(process.cwd(), "data", "generated", "globe-overlay.json"), "utf8")) as ServerManifest;
  } catch {
    return null;
  }
  const districtName = new Map(server.districts.map((d) => [d.id, d.name]));
  const places: Place[] = server.blocks.map((b) => {
    const seen = new Set<string>();
    const people: Person[] = [];
    const vacancies: string[] = [];
    for (const role of ROLE_ORDER) {
      for (const record of b.records) {
        for (const p of record.people) {
          if (p.role !== role) continue;
          if (p.vacant || !p.name) vacancies.push(ROLE_NAME[role]);
          else if (!seen.has(`${role}:${p.name.toLowerCase()}`)) {
            seen.add(`${role}:${p.name.toLowerCase()}`);
            people.push({ name: p.name, role });
          }
        }
      }
    }
    return { id: b.id, name: b.name, district: districtName.get(b.districtId ?? "") ?? "", people, vacancies, staff: b.staff, field: b.fieldStaff };
  });
  const districts = server.districts
    .map((d) => {
      const mine = places.filter((p) => p.district === d.name);
      const share = (role: string) => (mine.length ? mine.filter((p) => p.people.some((x) => x.role === role)).length / mine.length : 0);
      return {
        name: d.name,
        places: mine,
        staff: d.staff,
        average: mine.length ? mine.reduce((n, p) => n + p.staff, 0) / mine.length : 0,
        noField: mine.filter((p) => p.field === 0).length,
        vacant: mine.reduce((n, p) => n + p.vacancies.length, 0),
        roleShare: { PRIMARY: share("PRIMARY"), SECONDARY: share("SECONDARY"), DSO: share("DSO") },
      };
    })
    .filter((d) => d.places.length > 0)
    .sort((a, b) => a.average - b.average);
  const byPerson = new Map<string, { name: string; roles: Set<string>; places: Place[] }>();
  for (const place of places) {
    for (const person of place.people) {
      const entry = byPerson.get(person.name.toLowerCase()) ?? { name: person.name, roles: new Set<string>(), places: [] };
      entry.roles.add(person.role);
      if (!entry.places.includes(place)) entry.places.push(place);
      byPerson.set(person.name.toLowerCase(), entry);
    }
  }
  const people = [...byPerson.values()].map((p) => ({ name: p.name, roles: [...p.roles], places: p.places })).sort((a, b) => b.places.length - a.places.length);
  const totals = {
    people: byPerson.size,
    places: places.length,
    average: places.reduce((n, p) => n + p.staff, 0) / places.length,
    field: places.reduce((n, p) => n + p.field, 0) / places.length,
    vacant: places.reduce((n, p) => n + p.vacancies.length, 0),
    noField: places.filter((p) => p.field === 0).length,
  };

  // The fact sheet the AI answers from. Stable text (no dates, sorted).
  const lines: string[] = [
    `WEST BENGAL SALES TEAM (source: area-mapping sheet). ${totals.people} people, ${totals.places} places (blocks and municipal areas), ${totals.average.toFixed(2)} people per place on average, ${totals.field.toFixed(2)} field staff per place (field staff = everyone except the ASM), ${totals.noField} places with no field staff, ${totals.vacant} vacant positions.`,
    "Roles: ASM = Area Sales Manager (manages the area), PRIMARY = Primary Sales Officer, SECONDARY = Secondary Sales Officer, DSO = Distributor Sales Officer. Headcount bands used on the map: 1-2 people = hire here, 3, 4, 5 or more.",
    "",
    "DISTRICTS (fewest people per place first): name | places | people | people per place | places with no field staff | vacant | share of places with a Primary / Secondary / DSO",
    ...districts.map(
      (d) =>
        `${d.name} | ${d.places.length} | ${d.staff} | ${d.average.toFixed(2)} | ${d.noField} | ${d.vacant} | ${Math.round(d.roleShare.PRIMARY * 100)}% / ${Math.round(d.roleShare.SECONDARY * 100)}% / ${Math.round(d.roleShare.DSO * 100)}%`,
    ),
    "",
    "PLACES: district | place | people | team (role: name) | vacant positions",
    ...[...places]
      .sort((a, b) => a.district.localeCompare(b.district) || a.name.localeCompare(b.name))
      .map((p) => `${p.district} | ${p.name} | ${p.staff} | ${p.people.map((x) => `${x.role}: ${x.name}`).join("; ")} | ${p.vacancies.join(", ") || "none"}`),
  ];
  return { places, districts, people, totals, text: lines.join("\n") };
}

let cached: Promise<Facts | null> | null = null;
const facts = () => (cached ??= loadFacts());

const geminiKey = () => process.env.GEMINI_API_KEY?.trim() || null;

export function aiConfigured(): boolean {
  return geminiKey() !== null;
}

// ------------------------------------------------------------- built-in engine --
const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function localAnswer(question: string, f: Facts): string {
  const q = fold(question);
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  // A named place, district or person wins over the general topics.
  const place = [...f.places].sort((a, b) => b.name.length - a.name.length).find((p) => q.includes(fold(p.name)) && fold(p.name).length > 3);
  const district = f.districts.find((d) => q.includes(fold(d.name)));
  const person = f.people.find((p) => q.includes(fold(p.name)));

  if (person) {
    const roles = person.roles.map((r) => ROLE_NAME[r]).join(" and ");
    const byDistrict = new Map<string, string[]>();
    for (const p of person.places) byDistrict.set(p.district, [...(byDistrict.get(p.district) ?? []), p.name]);
    return [
      `**${person.name}** works as ${roles} in **${plural(person.places.length, "place")}**:`,
      ...[...byDistrict].map(([d, names]) => `- ${d}: ${names.sort().join(", ")}`),
      person.places.length >= 6 && !person.roles.includes("ASM") ? `\nThat is a wide area for one field person — a hire nearby would take load off.` : "",
    ].join("\n");
  }
  if (place && !(district && fold(district.name) === fold(place.name) && !has("block"))) {
    return [
      `**${place.name}** (${place.district}) has **${plural(place.staff, "person", "people")}**:`,
      ...place.people.map((p) => `- ${p.name} — ${ROLE_NAME[p.role]}`),
      place.vacancies.length ? `- Vacant: ${place.vacancies.join(", ")}` : "",
      place.field === 0 ? `\nOnly the ASM is listed here: **no field staff**. This is a place to hire.` : place.staff <= 2 ? `\nWith only ${plural(place.staff, "person", "people")}, this place is short of people.` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (district) {
    const sorted = [...district.places].sort((a, b) => a.staff - b.staff);
    const asms = [...new Set(district.places.flatMap((p) => p.people.filter((x) => x.role === "ASM").map((x) => x.name)))];
    const rank = f.districts.indexOf(district) + 1;
    return [
      `**${district.name}**: ${plural(district.staff, "person", "people")} across ${plural(district.places.length, "place")} — **${district.average.toFixed(1)} people per place** (state average ${f.totals.average.toFixed(1)}; rank ${rank} of ${f.districts.length}, fewest first).`,
      `- Area Sales Manager: ${asms.join(", ")}`,
      `- Places with no field staff: ${district.noField}${district.noField ? ` (${district.places.filter((p) => p.field === 0).map((p) => p.name).join(", ")})` : ""}`,
      `- Vacant positions: ${district.vacant}`,
      `- Places with a Primary / Secondary / DSO: ${Math.round(district.roleShare.PRIMARY * 100)}% / ${Math.round(district.roleShare.SECONDARY * 100)}% / ${Math.round(district.roleShare.DSO * 100)}%`,
      "",
      `Fewest people first: ${sorted.slice(0, 6).map((p) => `${p.name} (${p.staff})`).join(", ")}.`,
    ].join("\n");
  }

  if (has("hire", "hiring", "recruit", "less perform", "weak", "under", "need people", "short")) {
    const worst = f.districts.slice(0, 5);
    return [
      `Hire first where there are the fewest people per place. The state average is **${f.totals.average.toFixed(1)}**.`,
      "",
      ...worst.map(
        (d, i) =>
          `${i + 1}. **${d.name}** — ${d.average.toFixed(1)} per place; ${d.places.filter((p) => p.staff <= 2).length} of ${d.places.length} places have only 1–2 people${d.noField ? `, ${d.noField} ${d.noField === 1 ? "has" : "have"} no field staff` : ""}.`,
      ),
      "",
      `Start with the places that have no field staff (${f.totals.noField} in all) — ask "Which blocks have no field staff at all?".`,
    ].join("\n");
  }
  if (has("no field", "field staff", "only asm", "asm only", "nobody", "empty")) {
    const list = f.places.filter((p) => p.field === 0);
    const byDistrict = new Map<string, string[]>();
    for (const p of list) byDistrict.set(p.district, [...(byDistrict.get(p.district) ?? []), p.name]);
    return [
      `**${plural(list.length, "place")}** have only the Area Sales Manager and no field staff:`,
      ...[...byDistrict].map(([d, names]) => `- **${d}**: ${names.sort().join(", ")}`),
      "",
      "These are the first places to put a Primary, Secondary or Distributor Sales Officer.",
    ].join("\n");
  }
  if (has("stretch", "overload", "busy", "most places", "workload", "load", "cover")) {
    const field = f.people.filter((p) => !p.roles.includes("ASM")).slice(0, 8);
    return [
      "Field staff who cover the most places (excluding Area Sales Managers):",
      "",
      ...field.map((p, i) => `${i + 1}. **${p.name}** (${p.roles.map((r) => ROLE_NAME[r]).join(", ")}) — ${plural(p.places.length, "place")} in ${[...new Set(p.places.map((x) => x.district))].join(", ")}`),
      "",
      "A new hire next to the top names would take the most load off.",
    ].join("\n");
  }
  if (has("vacan", "open position", "empty position")) {
    const list = f.places.filter((p) => p.vacancies.length);
    const byDistrict = new Map<string, Place[]>();
    for (const p of list) byDistrict.set(p.district, [...(byDistrict.get(p.district) ?? []), p]);
    return [
      `The sheet marks **${plural(f.totals.vacant, "vacant position")}** in ${plural(list.length, "place")}:`,
      ...[...byDistrict].sort((a, b) => b[1].length - a[1].length).map(([d, ps]) => `- **${d}**: ${ps.map((p) => `${p.name} (${p.vacancies.join(", ")})`).join("; ")}`),
    ].join("\n");
  }
  if (has("role", "missing", "primary", "secondary", "dso", "gap")) {
    const gaps = (role: string) =>
      [...f.districts]
        .sort((a, b) => a.roleShare[role] - b.roleShare[role])
        .slice(0, 4)
        .map((d) => `${d.name} ${Math.round(d.roleShare[role] * 100)}%`)
        .join(", ");
    return [
      "Share of places that have each role — the lowest districts are where that role is missing:",
      "",
      `- **Primary Sales Officer**: ${gaps("PRIMARY")}`,
      `- **Secondary Sales Officer**: ${gaps("SECONDARY")}`,
      `- **Distributor Sales Officer**: ${gaps("DSO")}`,
    ].join("\n");
  }
  if (has("summary", "overview", "whole", "total", "how many", "team")) {
    const best = f.districts.at(-1)!;
    const worst = f.districts[0];
    return [
      `**West Bengal sales team** (from the area-mapping sheet):`,
      `- ${f.totals.people} people across ${f.totals.places} places in ${f.districts.length} districts`,
      `- ${f.totals.average.toFixed(1)} people per place on average; ${f.totals.field.toFixed(1)} of them field staff`,
      `- ${f.totals.noField} places with no field staff; ${f.totals.vacant} vacant positions`,
      `- Fewest people per place: **${worst.name}** (${worst.average.toFixed(1)}); most: **${best.name}** (${best.average.toFixed(1)})`,
    ].join("\n");
  }
  return [
    "I answer from the area-mapping sheet. Try one of these:",
    ...SUGGESTED_QUESTIONS.map((s) => `- ${s}`),
    "- Or name a district, a block or a person, e.g. \"Who works in Patrasayer?\"",
  ].join("\n");
}

// ------------------------------------------------------------------- answer --
const SYSTEM = `You are the sales-team assistant inside TerritoryIQ, used by the managing director and the head of sales of a company selling in West Bengal, India. You answer questions about who works where, using ONLY the fact sheet below (built from the company's area-mapping sheet).

Rules:
- Use only the fact sheet. If it does not contain the answer, say so plainly. Never guess names, numbers or places.
- The sheet has no sales figures. If asked about sales performance, explain that you can only speak to staffing and coverage, and answer that.
- Be short and practical: a one-line answer first, then at most 6 bullet points, then one recommendation line when useful. Use **bold** for key names and numbers. No tables, no headings.
- "Field staff" means everyone except the Area Sales Manager. Fewer people per place means a place to hire.
- Reply in the language of the question: English, Hindi (in Devanagari) or Bengali (in Bengali script). Keep people's and places' names as they are written in the fact sheet, so they can be recognised.
- Sound like a helpful colleague talking, not a report: short sentences, warm and natural.`;

/** The answer as a stream of text chunks. Never throws: failures become a short message. */
export async function* answer(question: string): AsyncGenerator<string> {
  const f = await facts();
  if (!f) {
    yield "The team data has not been built yet.";
    return;
  }
  if (!aiConfigured()) {
    // Built-in engine: send it line by line so it reads like a typed answer.
    for (const line of localAnswer(question, f).split("\n")) {
      yield `${line}\n`;
      await new Promise((resolve) => setTimeout(resolve, 70));
    }
    return;
  }
  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey()! });
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: question }] }],
      config: {
        systemInstruction: `${SYSTEM}\n\nFACT SHEET:\n${f.text}`,
        temperature: 0.2, thinkingConfig: { thinkingLevel: THINKING },
        maxOutputTokens: 4000,
      },
    });
    let any = false;
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        any = true;
        yield text;
      }
    }
    if (!any) yield "I can't answer that one. Try one of the suggested questions.";
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0;
    if (status === 400 || status === 401 || status === 403) yield "The AI key was refused. Ask the admin to check GEMINI_API_KEY.";
    else if (status === 429) yield "The AI is busy right now. Try again in a minute.";
    else yield "The AI could not answer right now.";
    // Whatever happened, still give the built-in answer.
    yield "\n\nFrom the sheet directly:\n" + localAnswer(question, f);
  }
}

// -------------------------------------------------------------------- voice --

/**
 * A spoken question (16 kHz mono WAV, base64): Gemini hears it in any language, writes what was said on the first line
 * after TRANSCRIPT_MARK, then answers in the same language. One call, streamed, so the answer starts quickly.
 */
export async function* answerFromAudio(wavBase64: string): AsyncGenerator<string> {
  const f = await facts();
  const key = geminiKey();
  if (!f || !key) {
    yield "Voice questions need the AI to be switched on.";
    return;
  }
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "audio/wav", data: wavBase64 } },
            {
              text: `This recording is a question about the sales team, spoken in English, Hindi or Bengali (or a mix). First write exactly one line: "${TRANSCRIPT_MARK}" followed by what was said, word for word, in the script of the language spoken. Then, on the next line, answer it following your rules, in the language that was spoken. If the recording has no clear speech, write "${TRANSCRIPT_MARK} …" and then ask the person to try again.`,
            },
          ],
        },
      ],
      config: { systemInstruction: `${SYSTEM}\n\nFACT SHEET:\n${f.text}`, temperature: 0.2, thinkingConfig: { thinkingLevel: THINKING }, maxOutputTokens: 4000 },
    });
    for await (const chunk of stream) if (chunk.text) yield chunk.text;
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0;
    yield status === 429 ? "The AI is busy right now. Try again in a minute." : "The AI could not hear the question. Try again, or type it.";
  }
}

/** Gemini's text-to-speech voice; override with GEMINI_TTS_MODEL / GEMINI_TTS_VOICE. */
const TTS_MODEL = process.env.GEMINI_TTS_MODEL?.trim() || "gemini-3.8-flash-tts";
const TTS_VOICE = process.env.GEMINI_TTS_VOICE?.trim() || "Kore";

/** Answer text as spoken audio (WAV bytes), or null when it cannot be made. Markdown is removed first. */
export async function speak(text: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const key = geminiKey();
  if (!key) return null;
  const plain = text
    .replace(/\*\*/g, "")
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/^\s*(\d+)\.\s+/gm, "$1. ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ role: "user", parts: [{ text: plain }] }],
      config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } } },
    });
    const data = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!data?.data) return null;
    const bytes = Uint8Array.from(Buffer.from(data.data, "base64"));
    const mime = (data.mimeType || "").toLowerCase();
    // Raw 16-bit PCM ("audio/L16;rate=24000" or "audio/pcm") gets a WAV header so every browser can play it.
    if (mime.startsWith("audio/l16") || mime.startsWith("audio/pcm")) {
      const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
      return { bytes: wavFromPcm(bytes, rate), mimeType: "audio/wav" };
    }
    return { bytes, mimeType: mime || "audio/wav" };
  } catch {
    return null;
  }
}

function wavFromPcm(pcm: Uint8Array, rate: number): Uint8Array {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Uint8Array.from(Buffer.concat([header, Buffer.from(pcm)]));
}
