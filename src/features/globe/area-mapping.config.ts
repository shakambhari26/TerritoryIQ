/**
 * How each row of `AREA MAPPING.xlsx` lands on the globe. Read by scripts/globe/build-area-map.mts.
 *
 * The sheet is the single source of truth for who works where. This file only says WHERE on the map each sheet row
 * belongs; it never adds, drops or changes a person. Every rule here is explicit so it can be reviewed line by line.
 *
 *   1. TERRITORY_DISTRICT  The sheet's DISTRICT column is a sales territory label ("EAST MIDNAPORE", "UDP", ...). This
 *                          maps it to the administrative district in which its blocks are looked up first.
 *   2. Automatic match     A sheet BLOCK label is matched to an OpenStreetMap block outline in that district when the
 *                          two names are the same after case, spacing, dashes and the trailing numeral (-I, I, - I) are
 *                          normalised. Exactly one candidate is required; anything else must be listed below.
 *   3. ALIASES             Spelling differences (Mahisadal / Mahishadal, Patashpur / Potashpur, ...), renamed blocks
 *                          (Contai-II is now Deshapran) and rows whose block lies in another district (Jangipara and
 *                          Khanakul under the Howrah territory are Hooghly blocks). Keyed "TERRITORY|Block label"
 *                          exactly as the sheet writes them.
 *   4. AREAS_WITHOUT_OUTLINE  Municipal areas and newer blocks for which OpenStreetMap has no boundary. They are placed
 *                          in their district with their full team and shown as "no outline": no shape is invented.
 *   5. OUTSIDE_STATE       Rows that are not in West Bengal at all (Jharkhand-W). Left out of the globe and all counts.
 *
 * The build fails if any sheet row is not resolved by exactly one of these rules.
 *
 * GUARDRAIL: a row stays in the district its own DISTRICT column names. The only exception is a row whose block has a
 * real outline in another district (map evidence, e.g. Binpur-I under WEST MIDNAPORE is a Jhargram block), and every
 * such row must be listed in MOVED_BY_OUTLINE below. An area without an outline is NEVER moved: there is no evidence.
 */

/** Sheet DISTRICT label → administrative district name (as in the LGD / OpenStreetMap district list). */
export const TERRITORY_DISTRICT: Readonly<Record<string, string>> = {
  "EAST MIDNAPORE": "Purba Medinipur",
  "WEST MIDNAPORE": "Paschim Medinipur",
  JHARGRAM: "Jhargram",
  "WEST BURDWAN": "Paschim Bardhaman",
  "EAST BURDWAN": "Purba Bardhaman",
  BANKURA: "Bankura",
  PURULIA: "Purulia",
  "North 24 PGS": "North 24 Parganas",
  Nadia: "Nadia",
  "South 24 PGS": "South 24 Parganas",
  Howrah: "Howrah",
  Hooghly: "Hooghly",
  Birbhum: "Birbhum",
  Murshidabad: "Murshidabad",
  Alipurduar: "Alipurduar",
  Coochbehar: "Cooch Behar",
  Darjeeling: "Darjeeling",
  Jalpaiguri: "Jalpaiguri",
  UDP: "Uttar Dinajpur",
  DDP: "Dakshin Dinajpur",
  Malda: "Malda",
};

/** A sheet row resolved to one OpenStreetMap block outline: its district and its name in OpenStreetMap. */
export interface OutlineTarget {
  district: string;
  osm: string;
  /** Why this row needed a rule, in plain words. */
  note: string;
}

const spelling = (district: string, osm: string): OutlineTarget => ({ district, osm, note: "spelling differs between the sheet and the map" });

export const ALIASES: Readonly<Record<string, OutlineTarget>> = {
  // Purba Medinipur
  "EAST MIDNAPORE|Shahid Matangini": spelling("Purba Medinipur", "Sahid Matangini"),
  "EAST MIDNAPORE|Panskura–I": { district: "Purba Medinipur", osm: "Panskura", note: "Panskura-I is the block now named Panskura (Panskura-II became Kolaghat)" },
  "EAST MIDNAPORE|Bhagawanpur–I": spelling("Purba Medinipur", "Bhagwanpur-I"),
  "EAST MIDNAPORE|Bhagawanpur–II": spelling("Purba Medinipur", "Bhagwanpur-II"),
  "EAST MIDNAPORE|Patashpur–I": spelling("Purba Medinipur", "Potashpur-I"),
  "EAST MIDNAPORE|Patashpur–II": spelling("Purba Medinipur", "Potashpur-II"),
  "EAST MIDNAPORE|Contai-II": { district: "Purba Medinipur", osm: "Deshopran", note: "Contai-II is the block officially renamed Deshapran" },
  // Paschim Medinipur
  "WEST MIDNAPORE|Salboni": spelling("Paschim Medinipur", "Salbani"),
  "WEST MIDNAPORE|Medinipur Sadar": { district: "Paschim Medinipur", osm: "Midnapore", note: "Medinipur Sadar is the Midnapore block" },
  "WEST MIDNAPORE|Garhbeta-I": spelling("Paschim Medinipur", "Garbeta-I"),
  "WEST MIDNAPORE|Garhbeta-II": spelling("Paschim Medinipur", "Garbeta-II"),
  "WEST MIDNAPORE|Garhbeta-III": spelling("Paschim Medinipur", "Garbeta-III"),
  "WEST MIDNAPORE|Keshiari": spelling("Paschim Medinipur", "Keshiary"),
  // Paschim Medinipur blocks Binpur-I and Binpur-II are in Jhargram district since the 2017 split.
  "WEST MIDNAPORE|Binpur-I": { district: "Jhargram", osm: "Binpur-I", note: "Binpur-I lies in Jhargram district" },
  "WEST MIDNAPORE|Binpur-II": { district: "Jhargram", osm: "Binpur-II", note: "Binpur-II lies in Jhargram district" },
  // Jhargram
  "JHARGRAM|Jamboni": spelling("Jhargram", "Jamboni"),
  // Paschim Bardhaman
  "WEST BURDWAN|Andal": spelling("Paschim Bardhaman", "Ondal"),
  "WEST BURDWAN|Asansol": { district: "Paschim Bardhaman", osm: "Asansol Kulti Township", note: "Asansol and Kulti share one municipal-corporation outline" },
  "WEST BURDWAN|Kulti": { district: "Paschim Bardhaman", osm: "Asansol Kulti Township", note: "Asansol and Kulti share one municipal-corporation outline" },
  "WEST BURDWAN|Ausgram-II": { district: "Purba Bardhaman", osm: "Ausgram - II", note: "Ausgram-II lies in Purba Bardhaman district" },
  "WEST BURDWAN|Galsi-W": { district: "Purba Bardhaman", osm: "Galsi - I", note: "the sheet's Galsi-W (west) is Galsi-I, the western Galsi block" },
  // Purba Bardhaman
  "EAST BURDWAN|Mongalkote": spelling("Purba Bardhaman", "Mangolkote"),
  // Bankura
  "BANKURA|Mejia": spelling("Bankura", "Mejhia"),
  "BANKURA|Ranibandh": spelling("Bankura", "Ranibundh"),
  "BANKURA|Bishnupur": spelling("Bankura", "Vishnupur"),
  "BANKURA|Indas": spelling("Bankura", "Indus"),
  "BANKURA|Joypur": spelling("Bankura", "Jaypur"),
  // Purulia
  "PURULIA|Baghmundi": spelling("Purulia", "Bagmundi"),
  "PURULIA|Joypur": spelling("Purulia", "Jaipur"),
  // North 24 Parganas
  "North 24 PGS|Bagdah": spelling("North 24 Parganas", "Bagda"),
  "North 24 PGS|Bangaon": spelling("North 24 Parganas", "Bongaon"),
  "North 24 PGS|Barrackpore I": spelling("North 24 Parganas", "Barrackpur - I"),
  "North 24 PGS|Barrackpore II": spelling("North 24 Parganas", "Barrackpur - II"),
  // Nadia
  "Nadia|Krishnanagar I": spelling("Nadia", "Krishnagar-I"),
  "Nadia|Krishnanagar II": spelling("Nadia", "Krishnagar-II"),
  // South 24 Parganas
  "South 24 PGS|Pathar Pratima": spelling("South 24 Parganas", "Patharpratima"),
  "South 24 PGS|Thakurpukur Mahestola": spelling("South 24 Parganas", "Thakurpukur Maheshtala"),
  // Howrah
  "Howrah|Bally Jagachha": spelling("Howrah", "Bally Jagachha"),
  "Howrah|Howrah MC": { district: "Howrah", osm: "Haora", note: "Howrah Municipal Corporation is the Haora outline" },
  "Howrah|Jangipara": { district: "Hooghly", osm: "Jangipara", note: "Jangipara lies in Hooghly district; it is listed under both territories" },
  "Howrah|Khanakul-I": { district: "Hooghly", osm: "Khanakul - I", note: "Khanakul-I lies in Hooghly district; it is listed under both territories" },
  "Howrah|Khanakul-II": { district: "Hooghly", osm: "Khanakul - II", note: "Khanakul-II lies in Hooghly district; it is listed under both territories" },
  // Hooghly
  "Hooghly|Arambagh": spelling("Hooghly", "Arambag"),
  "Hooghly|Pursurah": spelling("Hooghly", "Pursura"),
  "Hooghly|Chinsurah Mogra": spelling("Hooghly", "Chinsurah - Magra"),
  "Hooghly|Polba Dadpur": spelling("Hooghly", "Polba - Dadpur"),
  "Hooghly|Sreerampur Uttarpara": spelling("Hooghly", "Serampur Uttarpara"),
  // Birbhum
  "Birbhum|Ilambazar": spelling("Birbhum", "Illambazar"),
  "Birbhum|Nanur": spelling("Birbhum", "Nanoor"),
  // Murshidabad
  "Murshidabad|Bhagawangola-I": spelling("Murshidabad", "Bhagawangola - I"),
  "Murshidabad|Bhagawangola-II": spelling("Murshidabad", "Bhagawangola - II"),
  "Murshidabad|Jiaganj": { district: "Murshidabad", osm: "Murshidabad Jiaganj", note: "Jiaganj is the Murshidabad-Jiaganj block" },
  "Murshidabad|Shamsherganj": spelling("Murshidabad", "Samserganj"),
  // Alipurduar
  "Alipurduar|Madarihat-Birpara": { district: "Alipurduar", osm: "Madarihat", note: "Madarihat-Birpara is the Madarihat block" },
  // Cooch Behar
  "Coochbehar|Mekhliganj": spelling("Cooch Behar", "Mekliganj"),
  // Darjeeling
  "Darjeeling|Darjeeling – Pulbazar": spelling("Darjeeling", "Darjeeling Pulbazar"),
  "Darjeeling|Rangli – Rangliot": spelling("Darjeeling", "Rangli Rangliot"),
  "Darjeeling|Jorebunglow-Sukhiapokharii": spelling("Darjeeling", "Jorebunglow Sukiapokhri"),
  "Darjeeling|Kurseong": { district: "Darjeeling", osm: "Kurseong Subdivision", note: "the map's Kurseong outline is the subdivision (the block and its town)" },
  "Darjeeling|Mirik": { district: "Darjeeling", osm: "Mirik Subdivision", note: "the map's Mirik outline is the subdivision (the block and its town)" },
  "Darjeeling|Matigara": spelling("Darjeeling", "Matigara block"),
  "Darjeeling|Naxalbari": spelling("Darjeeling", "Naxalbari block"),
  "Darjeeling|Khoribari": spelling("Darjeeling", "Kharibari"),
  // Jalpaiguri
  "Jalpaiguri|Jalpaiguri Sadar": { district: "Jalpaiguri", osm: "Jalpaiguri", note: "Jalpaiguri Sadar is the Jalpaiguri block" },
  // Uttar Dinajpur
  "UDP|Kaliaganj": spelling("Uttar Dinajpur", "Kaliyaganj"),
  // Dakshin Dinajpur
  "DDP|Kushmundi": spelling("Dakshin Dinajpur", "Kushmundi"),
  // Malda
  "Malda|Manickchak": spelling("Malda", "Manikchak"),
  "Malda|Old Malda": { district: "Malda", osm: "Maldah (Old)", note: "Old Malda is written Maldah (Old) on the map" },
  "Malda|Harishchandrapur-I": spelling("Malda", "Harischandrapur - I"),
  "Malda|Harishchandrapur-II": spelling("Malda", "Harischandrapur - II"),
};

/**
 * The ONLY sheet rows shown in a different district than their DISTRICT column, each because its block's real outline
 * lies there. The build fails if any other row changes district, or if a row listed here does not.
 */
export const MOVED_BY_OUTLINE: readonly string[] = [
  "WEST MIDNAPORE|Binpur-I",
  "WEST MIDNAPORE|Binpur-II",
  "WEST BURDWAN|Ausgram-II",
  "WEST BURDWAN|Galsi-W",
  "Howrah|Jangipara",
  "Howrah|Khanakul-I",
  "Howrah|Khanakul-II",
];

/** An area the sheet lists that has no boundary on the map. Placed in its district, never given an invented shape. */
export interface AreaWithoutOutline {
  /** A stable key for the area; rows with the same key are one area. */
  key: string;
  name: string;
  district: string;
  note: string;
}

const municipal = (key: string, name: string, district: string): AreaWithoutOutline => ({
  key,
  name,
  district,
  note: "municipal area: OpenStreetMap has no boundary for it",
});

export const AREAS_WITHOUT_OUTLINE: Readonly<Record<string, AreaWithoutOutline>> = {
  "WEST BURDWAN|Durgapur Municipal Corporation": municipal("durgapur-mc", "Durgapur Municipal Corporation", "Paschim Bardhaman"),
  "North 24 PGS|Bidhannagar Municipality": municipal("bidhannagar", "Bidhannagar Municipality", "North 24 Parganas"),
  "South 24 PGS|Borough 7": municipal("kmc-borough-7", "Kolkata Borough 7", "South 24 Parganas"),
  "South 24 PGS|Borough 10": municipal("kmc-borough-10", "Kolkata Borough 10", "South 24 Parganas"),
  "South 24 PGS|Borough 11": municipal("kmc-borough-11", "Kolkata Borough 11", "South 24 Parganas"),
  "South 24 PGS|BOROUGH 12": municipal("kmc-borough-12", "Kolkata Borough 12", "South 24 Parganas"),
  "South 24 PGS|Behala municipality": municipal("behala", "Behala", "South 24 Parganas"),
  "Hooghly|Chandanagar": municipal("chandannagar", "Chandannagar", "Hooghly"),
  "Darjeeling|Siliguri": municipal("siliguri", "Siliguri", "Darjeeling"),
  "Jalpaiguri|Banarhat": { key: "banarhat", name: "Banarhat", district: "Jalpaiguri", note: "newer block (carved from Dhupguri): OpenStreetMap has no boundary for it yet" },
  "Jalpaiguri|Kranti": { key: "kranti", name: "Kranti", district: "Jalpaiguri", note: "newer block (carved from Mal): OpenStreetMap has no boundary for it yet" },
};

/** Rows that are not in West Bengal. Reported by the build; nothing is drawn for them. */
export const OUTSIDE_STATE: Readonly<Record<string, string>> = {
  "WEST BURDWAN|Jharkhand-W": "a territory in Jharkhand state, outside West Bengal",
};

/**
 * Place names as the globe shows them. Every sheet label is first tidied (spacing, dashes and the trailing numeral
 * written one way: "Cooch Behar - I", "Ausgram I" and "Panskura–I" become "Cooch Behar-I", "Ausgram-I", "Panskura-I").
 * Then these corrections apply, keyed by the tidied label: spelling mistakes in the hand-typed sheet, and a few names
 * that need their full or current form.
 */
export const PLACE_NAME_FIXES: Readonly<Record<string, string>> = {
  "Contai-II": "Deshapran (Contai-II)",
  "Galsi-W": "Galsi-I",
  "Jorebunglow-Sukhiapokharii": "Jorebunglow-Sukhiapokhri",
  "Thakurpukur Mahestola": "Thakurpukur-Maheshtala",
  Mongalkote: "Mangalkote",
  Manickchak: "Manikchak",
  Khoribari: "Kharibari",
  "Pathar Pratima": "Patharpratima",
  Jiaganj: "Murshidabad-Jiaganj",
  Shamsherganj: "Samserganj",
  "Chinsurah Mogra": "Chinsurah-Magra",
  "Sreerampur Uttarpara": "Serampore-Uttarpara",
  "Polba Dadpur": "Polba-Dadpur",
  "Bally Jagachha": "Bally-Jagachha",
  "Bolpur Sriniketan": "Bolpur-Sriniketan",
  "Faridpur Durgapur": "Faridpur-Durgapur",
  "Howrah MC": "Howrah Municipal Corporation",
  "Bidhannagar Municipality": "Bidhannagar",
  "Asansol / Kulti": "Asansol & Kulti",
};
