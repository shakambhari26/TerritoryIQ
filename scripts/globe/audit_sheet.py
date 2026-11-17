#!/usr/bin/env python3
"""
Independent audit: does the globe show exactly what AREA MAPPING.xlsx says, and nothing else?

This shares NO code with the app. It reads the .xlsx itself (Python standard library only: zipfile + XML) and checks
data/generated/globe-overlay.json against it, row by row and person by person. It exits 1 on any mismatch.

    python3 scripts/globe/audit_sheet.py [path/to/AREA MAPPING.xlsx] [path/to/globe-overlay.json]

What it checks
  1. Rows      every sheet row is on the globe exactly once, in its own row order, with its own DISTRICT label;
               the only row left out is the one outside West Bengal (Jharkhand-W).
  2. People    every name and every "vacant" in every row is shown in the same role and slot; nobody is added. A name
               may differ from the cell only by a cleaning this audit re-derives from the sheet itself (capitals and
               spaces, an accidentally doubled surname, a first name written alone that is the one full name in that
               territory starting with it, or one letter different from another spelling in that territory). Every
               such correction is printed.
  3. District  each row is shown in the district its DISTRICT column names. The only exceptions are the rows listed in
               MOVED_BY_OUTLINE here, and each must be a block with a real outline (map evidence).
  4. Counts    every headcount on the globe (per place, per district, the state total, roles, vacancies) is recounted
               from the rows and must match.
  5. Nothing invented: a place or district with no sheet row has no people.
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
XLSX = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "AREA MAPPING.xlsx"
OVERLAY = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "data" / "generated" / "globe-overlay.json"

# The sheet's DISTRICT label -> the administrative district. Written out again here on purpose (not imported).
TERRITORY_DISTRICT = {
    "EAST MIDNAPORE": "Purba Medinipur", "WEST MIDNAPORE": "Paschim Medinipur", "JHARGRAM": "Jhargram",
    "WEST BURDWAN": "Paschim Bardhaman", "EAST BURDWAN": "Purba Bardhaman", "BANKURA": "Bankura", "PURULIA": "Purulia",
    "North 24 PGS": "North 24 Parganas", "Nadia": "Nadia", "South 24 PGS": "South 24 Parganas", "Howrah": "Howrah",
    "Hooghly": "Hooghly", "Birbhum": "Birbhum", "Murshidabad": "Murshidabad", "Alipurduar": "Alipurduar",
    "Coochbehar": "Cooch Behar", "Darjeeling": "Darjeeling", "Jalpaiguri": "Jalpaiguri", "UDP": "Uttar Dinajpur",
    "DDP": "Dakshin Dinajpur", "Malda": "Malda",
}
# Rows shown in another district because their block's real outline lies there. Nothing else may move.
MOVED_BY_OUTLINE = {
    "WEST MIDNAPORE|Binpur-I": "Jhargram", "WEST MIDNAPORE|Binpur-II": "Jhargram",
    "WEST BURDWAN|Ausgram-II": "Purba Bardhaman", "WEST BURDWAN|Galsi-W": "Purba Bardhaman",
    "Howrah|Jangipara": "Hooghly", "Howrah|Khanakul-I": "Hooghly", "Howrah|Khanakul-II": "Hooghly",
}
OUTSIDE_STATE = {"WEST BURDWAN|Jharkhand-W"}
ROLE_COLUMNS = [("C", "ASM", 1), ("D", "PRIMARY", 1), ("E", "PRIMARY", 2), ("F", "PRIMARY", 3), ("G", "SECONDARY", 1),
                ("H", "SECONDARY", 2), ("I", "SECONDARY", 3), ("J", "SECONDARY", 4), ("K", "SECONDARY", 5),
                ("L", "DSO", 1), ("M", "DSO", 2), ("N", "DSO", 3)]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

problems = []
def problem(text):
    problems.append(text)


# ------------------------------------------------------------------ read the sheet --
def read_sheet(path):
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows = {}
    for row in sheet.iter(f"{{{NS['m']}}}row"):
        cells = {}
        for c in row.findall("m:c", NS):
            col = re.match(r"[A-Z]+", c.get("r")).group(0)
            t = c.get("t")
            if t == "inlineStr":
                value = "".join(x.text or "" for x in c.iter(f"{{{NS['m']}}}t"))
            else:
                v = c.find("m:v", NS)
                if v is None:
                    continue
                value = shared[int(v.text)] if t == "s" else v.text
            cells[col] = value
        rows[int(row.get("r"))] = cells
    return rows


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace(" ", " ")).strip()


def fold(s):
    return clean(s).lower()


def letters_apart(a, b):
    """Edit distance, capped at 2."""
    if abs(len(a) - len(b)) > 1:
        return 2
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return min(prev[-1], 2)


sheet = read_sheet(XLSX)
header = sheet.get(1, {})
expected_header = {"A": "DISTRICT", "B": "BLOCK", **{c: r for c, r, _ in ROLE_COLUMNS}}
for col, name in expected_header.items():
    if clean(header.get(col)) != name:
        problem(f"header {col}: '{header.get(col)}' (expected {name})")

data_rows = []
for n in sorted(k for k in sheet if k > 1):
    cells = sheet[n]
    if not clean(cells.get("A")) and not clean(cells.get("B")):
        continue
    people = []
    for col, role, slot in ROLE_COLUMNS:
        raw = clean(cells.get(col))
        if not raw:
            continue
        if raw.lower() == "vacant":
            people.append((role, slot, None))
            continue
        for part in (raw.split("/") if role == "ASM" else [raw]):
            if clean(part):
                people.append((role, slot, clean(part)))
    data_rows.append({"row": n, "territory": cells.get("A", ""), "label": clean(cells.get("B")), "people": people})

# Every name written in each territory: what a correction may legitimately resolve to.
names_in_territory = defaultdict(set)
for r in data_rows:
    for _, _, name in r["people"]:
        if name:
            names_in_territory[r["territory"]].add(fold(name))


def allowed_correction(raw, shown, territory):
    """Is `shown` a cleaning of `raw` that the sheet itself justifies? Returns the reason, or None."""
    a, b = fold(raw), fold(shown)
    if a == b:
        return "same"
    words = a.split(" ")
    if len(words) >= 3 and words[-1] == words[-2] and " ".join(words[:-1]) == b:
        return "doubled surname dropped"
    pool = names_in_territory[territory]
    if " " not in a and b.startswith(a + " ") and b in pool:
        matches = [n for n in pool if n.startswith(a + " ")]
        if len(matches) == 1:
            return "first name written alone, the one full name in this territory starting with it"
    if letters_apart(a, b) == 1 and b in pool:
        return "one letter different from another spelling in this territory"
    return None


# ------------------------------------------------------------------ read the globe --
overlay = json.loads(OVERLAY.read_text())
district_name = {d["id"]: d["name"] for d in overlay["districts"]}
records = {}
for block in overlay["blocks"]:
    for rec in block.get("records", []):
        if rec["unitId"] in records:
            problem(f"{rec['unitId']} is on two places")
        records[rec["unitId"]] = (block, rec)

# ------------------------------------------------------------------ 1-3: row by row --
corrections = {}
entries = 0
seen_units = set()
for index, r in enumerate(data_rows):
    unit = f"TU-{index + 1:03d}"
    key = f"{r['territory']}|{r['label']}"
    where = f"sheet row {r['row']} ({r['territory']} / {r['label']})"
    if key in OUTSIDE_STATE:
        if unit in records:
            problem(f"{where} is outside West Bengal but is on the globe")
        continue
    if unit not in records:
        problem(f"{where} is not on the globe")
        continue
    seen_units.add(unit)
    block, rec = records[unit]
    if rec["territory"] != r["territory"]:
        problem(f"{where}: shown with territory '{rec['territory']}'")
    # 3. district
    shown = district_name.get(block["districtId"])
    want = MOVED_BY_OUTLINE.get(key, TERRITORY_DISTRICT.get(r["territory"]))
    if shown != want:
        problem(f"{where}: shown in {shown}, the sheet says {TERRITORY_DISTRICT.get(r['territory'])}")
    if key in MOVED_BY_OUTLINE and not block.get("geometry"):
        problem(f"{where}: moved to {shown} without an outline (no map evidence)")
    # 2. people, slot by slot
    want_people = sorted((role, slot, name) for role, slot, name in r["people"])
    got_people = sorted((p["role"], p["slot"], None if p["vacant"] else p["name"]) for p in rec["people"])
    if len(want_people) != len(got_people):
        problem(f"{where}: {len(want_people)} entries in the sheet, {len(got_people)} on the globe")
        continue
    by_slot = defaultdict(list)
    for role, slot, name in got_people:
        by_slot[(role, slot)].append(name)
    for role, slot, name in want_people:
        shown_names = by_slot[(role, slot)]
        if name is None:
            if None in shown_names:
                shown_names.remove(None)
                entries += 1
            else:
                problem(f"{where}: {role} {slot} is vacant in the sheet but not on the globe")
            continue
        match = next((s for s in shown_names if s is not None and allowed_correction(name, s, r["territory"])), None)
        if match is None:
            problem(f"{where}: {role} {slot} '{name}' is not shown (globe has {shown_names})")
            continue
        shown_names.remove(match)
        entries += 1
        reason = allowed_correction(name, match, r["territory"])
        if reason != "same":
            corrections[(name, match)] = reason

# ------------------------------------------------------------------ 4-5: counts --
all_people = set()
for block in overlay["blocks"]:
    names = {fold(p["name"]) for rec in block.get("records", []) for p in rec["people"] if not p["vacant"]}
    all_people |= names
    if block["staff"] != len(names):
        problem(f"place {block['name']}: headcount {block['staff']}, recount {len(names)}")
    roles = defaultdict(set)
    for rec in block.get("records", []):
        for p in rec["people"]:
            if not p["vacant"]:
                roles[p["role"]].add(fold(p["name"]))
    for role, count in (block.get("roleCounts") or {}).items():
        if count != len(roles[role]):
            problem(f"place {block['name']}: {role} count {count}, recount {len(roles[role])}")
    vacant = sum(1 for rec in block.get("records", []) for p in rec["people"] if p["vacant"])
    if block.get("vacancies", 0) != vacant:
        problem(f"place {block['name']}: vacancies {block.get('vacancies')}, recount {vacant}")
    if not block.get("records") and block["staff"]:
        problem(f"place {block['name']} has people but no sheet row")
for d in overlay["districts"]:
    mine = [b for b in overlay["blocks"] if b.get("districtId") == d["id"] and b.get("records")]
    names = {fold(p["name"]) for b in mine for rec in b["records"] for p in rec["people"] if not p["vacant"]}
    if d["staff"] != len(names) or d["blockCount"] != len(mine):
        problem(f"district {d['name']}: shows {d['staff']} people / {d['blockCount']} places, recount {len(names)} / {len(mine)}")
sheet_people = {fold(n) for r in data_rows if f"{r['territory']}|{r['label']}" not in OUTSIDE_STATE for _, _, n in r["people"] if n}
corrected_away = {fold(raw) for raw, _ in corrections} - {fold(shown) for _, shown in corrections}
meta = overlay["meta"]["sheet"]
if meta["rows"] != len(data_rows):
    problem(f"the globe says the sheet has {meta['rows']} rows; it has {len(data_rows)}")
if meta["staff"] != len(all_people):
    problem(f"the globe's total {meta['staff']} people, recount {len(all_people)}")
if len(sheet_people - corrected_away) != len(all_people):
    problem(f"{len(sheet_people - corrected_away)} distinct people in the sheet (after the corrections below), {len(all_people)} on the globe")
extra = all_people - sheet_people
unexplained = {n for n in extra if not any(fold(shown) == n for _, shown in corrections)}
if unexplained:
    problem(f"people on the globe who are not in the sheet: {sorted(unexplained)}")

# ------------------------------------------------------------------ report --
print(f"Sheet: {XLSX.name}, {len(data_rows)} rows. Globe: {len(seen_units)} rows placed, {entries} names/vacancies checked, {len(all_people)} people.")
moved = [f"{k.split('|')[1]} -> {v}" for k, v in MOVED_BY_OUTLINE.items()]
print(f"Rows shown in another district (real outline there): {', '.join(moved)}")
print("Name corrections (each justified by the sheet itself):")
for (raw, shown), reason in sorted(corrections.items()):
    print(f"  {raw!r} -> {shown!r}: {reason}")
if problems:
    print(f"\nFAIL: {len(problems)} mismatch(es)")
    for p in problems:
        print(f"  - {p}")
    sys.exit(1)
print("\nPASS: the globe matches the sheet exactly. No row, person or number that is not in the sheet.")
