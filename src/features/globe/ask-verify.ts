/**
 * GUARDRAIL for the AI assistant: after an answer is written, every proper name it highlights (**Name**) or writes in
 * Latin capitals is looked up in the sheet's people, places and districts. Anything the sheet does not have is
 * reported, so a made-up name can never pass silently. Pure: no network, no data of its own.
 */

const fold = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, " ").trim();

/** Words that may be capitalised in an answer without being a person or a place. */
const COMMON = new Set(
  fold(
    "West Bengal India Area Sales Manager Primary Secondary Distributor Officer Officers ASM DSO DSOs ASMs Field Staff Team Sheet " +
      "Hire Here Thin Healthy Strong Vacant Vacancy Vacancies District Districts Block Blocks Place Places Municipal Corporation Municipality " +
      "Borough Sadar Recommendation Summary Note Yes No The A An In On And Or Of For To At By With Only Total Average People Person " +
      "North South East West Purba Paschim Uttar Dakshin Gemini AI TerritoryIQ Managing Director Head Sales",
  ).split(" "),
);

export interface KnownNames {
  people: readonly string[];
  places: readonly string[];
  districts: readonly string[];
  /** How many places each person covers: a count the answer states next to their name is checked against it. */
  placesPerPerson?: Readonly<Record<string, number>>;
}

export function unknownNames(answer: string, known: KnownNames): string[] {
  const entities = [...known.people, ...known.places, ...known.districts].map(fold).filter(Boolean);
  const entityWords = entities.map((e) => new Set(e.split(" ")));
  const candidates = new Set<string>();
  // Highlighted spans with no digits (numbers are checked by the fact sheet itself, not here).
  for (const m of answer.matchAll(/\*\*([^*\n]{2,60})\*\*/g)) if (!/[0-9]/.test(m[1]) && /^[A-Z]/.test(m[1].trim())) candidates.add(m[1].trim());
  // Runs of two to four Capitalised Latin words: how a person's or place's name is written.
  for (const m of answer.matchAll(/\b[A-Z][a-z]+(?:[ -][A-Z][a-z]+){1,3}\b/g)) candidates.add(m[0]);

  const unknown: string[] = [];
  for (const raw of candidates) {
    const f = fold(raw);
    if (!f) continue;
    const words = f.split(" ");
    if (words.every((w) => w.length < 2 || COMMON.has(w))) continue;
    if (entities.some((e) => ` ${e} `.includes(` ${f} `))) continue;
    // Leaving out the common words, what is left must belong to ONE name in the sheet ("Bankura District" is fine;
    // "Amit Sarkar" is not, even if an Amit and a Sarkar both exist).
    const rest = words.filter((w) => w.length > 1 && !COMMON.has(w)).map((w) => w.replace(/^(.{3,})s$/, "$1"));
    if (entityWords.some((set) => rest.every((w) => set.has(w) || [...set].some((x) => x.startsWith(w) && w.length >= 4)))) continue;
    unknown.push(raw.replace(/[*_]/g, "").trim());
  }
  return [...new Set(unknown)];
}

/**
 * GUARDRAIL for numbers: on a line that names exactly one person, "N places" (or blocks) must be that person's real
 * number of places. Returns one message per wrong count.
 */
export function wrongCounts(answer: string, known: KnownNames): string[] {
  const counts = known.placesPerPerson ?? {};
  const names = Object.keys(counts);
  const wrong: string[] = [];
  for (const line of answer.split("\n")) {
    const plain = line.replace(/[*_]/g, "");
    const here = names.filter((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(plain));
    // "Santanu Soam and Mohan Rudra each cover 7 places": the count after a person's name is that person's, unless a
    // district is named in between ("Amit Jana manages Bankura, which has 22 places").
    const lower = plain.toLowerCase();
    for (const m of plain.matchAll(/\b(\d{1,3})\s+(?:places|blocks|areas)\b/gi)) {
      const n = Number(m[1]);
      for (const person of here) {
        const at = lower.indexOf(person.toLowerCase());
        if (at < 0 || at > m.index!) continue;
        const between = lower.slice(at + person.length, m.index);
        if (known.districts.some((d) => between.includes(d.toLowerCase()))) continue;
        if (counts[person] !== n) wrong.push(`${person} covers ${counts[person]} ${counts[person] === 1 ? "place" : "places"}, not ${n}`);
      }
    }
  }
  return [...new Set(wrong)];
}

/** The line added under an answer when a check fails; empty when everything is in the sheet. */
export function verifyNote(answer: string, known: KnownNames): string {
  const names = unknownNames(answer, known);
  const counts = wrongCounts(answer, known);
  const parts: string[] = [];
  if (names.length) parts.push(`${names.map((n) => `"${n}"`).join(", ")} ${names.length === 1 ? "is" : "are"} not in the area-mapping sheet`);
  if (counts.length) parts.push(`correction from the sheet: ${counts.join("; ")}`);
  return parts.length ? `\n\n⚠️ Checked against the sheet: ${parts.join(". ")}. Trust the map for the exact numbers.` : "";
}
