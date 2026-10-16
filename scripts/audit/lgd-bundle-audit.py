"""
Audit of the West Bengal LGD bundle in data-source/ against AREA MAPPING.xlsx.

AUDIT ONLY. Standard library only. Run with isolation so nothing in the working
directory is imported:

    python -I scripts/audit/lgd-bundle-audit.py [--out summary.json]

What it does not do: it writes nothing under data-source/, imports nothing into
the app, never decides a match, and reads only columns A (DISTRICT) and B (BLOCK)
of the workbook (the staffing columns are skipped while parsing, as in the
Phase 0E crosswalk review). Name comparisons are reported as candidate-overlap
diagnostics; they are not matches and not a crosswalk.

Results are printed as JSON. docs/data-audit/lgd-bundle-audit.md quotes them.
"""
import argparse, collections, hashlib, json, os, re, sys, unicodedata, zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "data-source")
SS = "urn:schemas-microsoft-com:office:spreadsheet"

FILES = {
    "districts": "LGD_West_Bengal_Districts_2026-10-15.xls",
    "bv": "LGD_West_Bengal_Development_Blocks_with_Covered_Villages_2026-10-15.xls",
    "blocks": "blocks_west_bengal.xls",
    "subdistricts": "subdistrict_west_bengal.xls",
    "ulb": "urban_local_body_wards_west_bengal.xls",
    "vgp": "village_gram_panchayat_mapping_west_bengal.xls",
}
# rows before the first data row (title, blank, header, sub-header) and the minimum
# column count a data row must reach
LAYOUT = {"districts": (5, 7), "bv": (5, 8), "blocks": (5, 7), "subdistricts": (5, 9), "ulb": (4, 6), "vgp": (6, 15)}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def spreadsheetml_rows(path):
    """Rows as lists of (type, text) or None per cell; honours ss:Index and MergeAcross."""
    for _, el in ET.iterparse(path, events=("end",)):
        if el.tag.endswith("}Row"):
            out, pos = [], 0
            for c in el:
                if not c.tag.endswith("}Cell"):
                    continue
                idx = c.get("{%s}Index" % SS)
                if idx:
                    while pos < int(idx) - 1:
                        out.append(None)
                        pos += 1
                d = None
                for ch in c:
                    if ch.tag.endswith("}Data"):
                        d = (ch.get("{%s}Type" % SS), ch.text or "")
                out.append(d)
                pos += 1
                for _ in range(int(c.get("{%s}MergeAcross" % SS) or 0)):
                    out.append(None)
                    pos += 1
            yield out
            el.clear()


def txt(c):
    return None if c is None else c[1].strip()


def load(name):
    raw = list(spreadsheetml_rows(os.path.join(SRC, FILES[name])))
    head, minc = LAYOUT[name]
    data = []
    for r in raw[head:]:
        if r and r[0] is not None and any(c is not None and c[1].strip() for c in r[1:minc]):
            data.append([txt(c) for c in r] + [None] * (16 - len(r)))
    # the report timestamp is the last non-empty row
    stamp = next((txt(next(c for c in r if c)) for r in reversed(raw) if any(c and c[1].strip() for c in r)), None)
    return raw, data, stamp


def ic(x):
    """Integer-like code as a string ('2919', '345.0' -> '345'); other text unchanged."""
    if x is None or x == "":
        return None
    return str(int(float(x))) if re.fullmatch(r"\d+(\.0+)?", x) else x


def derived_key(n):
    """Working key only (same rules as the Phase 0E crosswalk review, step 2)."""
    n = unicodedata.normalize("NFKC", n).replace(" ", " ").upper()
    n = n.replace("–", "-").replace("—", "-").replace("_", "-")
    n = re.sub(r"\s+", " ", n).strip()
    m = re.match(r"^(.*?)[\s-]*\b(III|II|I|IV|V|[1-5])$", n)
    num = None
    if m and m.group(1):
        n, num = m.group(1), m.group(2)
    num = {"1": "I", "2": "II", "3": "III", "4": "IV", "5": "V"}.get(num, num)
    return (re.sub(r"[^A-Z0-9]", "", n), num)


def workbook_a_b(path):
    """DISTRICT and BLOCK only. Cells in every other column are discarded while parsing."""
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    z = zipfile.ZipFile(path)
    strings = [
        "".join(t.text or "" for t in si.iter(ns + "t"))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(ns + "si")
    ]
    rows = []
    for row in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).iter(ns + "row"):
        d = {}
        for c in row.findall(ns + "c"):
            col = re.match(r"[A-Z]+", c.get("r")).group()
            if col not in ("A", "B"):
                continue
            v = c.find(ns + "v")
            if v is not None:
                d[col] = strings[int(v.text)] if c.get("t") == "s" else v.text
        rows.append((int(row.get("r")), d.get("A"), d.get("B")))
    return rows


def typed_profile(raw, name):
    head, minc = LAYOUT[name]
    ncol = {"districts": 5, "bv": 8, "blocks": 7, "subdistricts": 7, "ulb": 6, "vgp": 15}[name]
    rows = [r for r in raw[head:] if r and r[0] is not None and any(c is not None and c[1].strip() for c in r[1:minc])]
    out = []
    for i in range(ncol):
        types, blank, pad, nonascii, lead0 = collections.Counter(), 0, 0, 0, 0
        for r in rows:
            c = r[i] if i < len(r) else None
            if c is None:
                types["absent"] += 1
                blank += 1
                continue
            types[c[0]] += 1
            t = c[1]
            blank += t.strip() == ""
            pad += t != t.strip()
            nonascii += any(ord(ch) > 127 for ch in t)
            lead0 += bool(re.match(r"^0\d", t))
        out.append({"col": i + 1, "types": dict(types), "blank": blank, "padded": pad, "non_ascii": nonascii, "leading_zero": lead0})
    return len(rows), out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out")
    args = ap.parse_args()
    S = {}  # summary

    # ---- integrity ------------------------------------------------------
    S["files"] = {}
    for k, f in FILES.items():
        p = os.path.join(SRC, f)
        S["files"][f] = {"bytes": os.path.getsize(p), "sha256": sha256(p)}
    wbp = os.path.join(SRC, "AREA MAPPING.xlsx")
    S["files"]["AREA MAPPING.xlsx"] = {"bytes": os.path.getsize(wbp), "sha256": sha256(wbp)}

    raws, D, stamps = {}, {}, {}
    for k in FILES:
        raws[k], D[k], stamps[k] = load(k)
    S["report_timestamps"] = stamps
    S["row_counts"] = {k: len(v) for k, v in D.items()}
    S["profile"] = {}
    for k in FILES:
        n, cols = typed_profile(raws[k], k)
        S["profile"][k] = {"data_rows": n, "columns": cols}

    dist, blk, sub, ulb, vgp, bv = (D[k] for k in ("districts", "blocks", "subdistricts", "ulb", "vgp", "bv"))

    def serial_ok(rows):
        return [int(float(r[0].replace(",", ""))) for r in rows] == list(range(1, len(rows) + 1))

    S["serial_contiguous"] = {k: serial_ok(D[k]) for k in ("districts", "blocks", "subdistricts", "ulb", "vgp")}
    S["serial_has_thousands_separator"] = {k: any("," in r[0] for r in D[k]) for k in ("subdistricts", "ulb", "vgp")}

    # ---- districts ------------------------------------------------------
    DIST = {ic(r[1]): r for r in dist}
    S["districts"] = {
        "rows": len(dist),
        "unique_codes": len(DIST),
        "unique_names": len({r[3] for r in dist}),
        "census2011_000": [r[3] for r in dist if r[6] == "000"],
        "blank_local_name": [r[3] for r in dist if not r[4]],
    }

    # ---- blocks ---------------------------------------------------------
    bkc = collections.Counter(ic(r[3]) for r in blk)
    bvb = {}
    for r in bv:
        bvb.setdefault(ic(r[4]), (ic(r[2]), r[5], r[3]))
    bkd = {ic(r[3]): (ic(r[1]), r[5], r[2]) for r in blk}
    S["blocks"] = {
        "rows": len(blk),
        "duplicate_codes": [k for k, v in bkc.items() if v > 1],
        "duplicate_names": [(k, v) for k, v in collections.Counter(r[5] for r in blk).items() if v > 1],
        "duplicate_district_name_pairs": [k for k, v in collections.Counter((ic(r[1]), r[5]) for r in blk).items() if v > 1],
        "district_code_not_in_districts": [r[1] for r in blk if ic(r[1]) not in DIST],
        "district_name_mismatch": sum(1 for r in blk if ic(r[1]) in DIST and DIST[ic(r[1])][3] != r[2]),
        "per_district": dict(collections.Counter(r[2] for r in blk)),
        "local_name_non_blank": sum(1 for r in blk if r[6]),
        "versions": dict(collections.Counter(r[4] for r in blk)),
        "vs_block_village_report": {
            "bv_distinct_block_codes": len(bvb),
            "codes_only_in_blocks_file": sorted(set(bkd) - set(bvb)),
            "codes_only_in_bv_report": sorted(set(bvb) - set(bkd)),
            "codes_with_different_name_or_district": sum(1 for k in bkd if k in bvb and bkd[k] != bvb[k]),
        },
    }

    # ---- subdistricts ---------------------------------------------------
    SUB = {ic(r[3]): r for r in sub}
    sbc = collections.Counter(r[8] for r in sub)
    S["subdistricts"] = {
        "rows": len(sub),
        "duplicate_codes": [k for k, v in collections.Counter(ic(r[3]) for r in sub).items() if v > 1],
        "duplicate_names": [(k, v) for k, v in collections.Counter(r[5] for r in sub).items() if v > 1],
        "district_code_not_in_districts": [r[1] for r in sub if ic(r[1]) not in DIST],
        "district_name_mismatch": sum(1 for r in sub if ic(r[1]) in DIST and DIST[ic(r[1])][3] != r[2]),
        "per_district": dict(collections.Counter(r[2] for r in sub)),
        "census2011_sentinel_00000": [(ic(r[3]), r[5], r[2]) for r in sub if r[8] == "00000"],
        "code_equals_census2011": sum(1 for r in sub if r[8] and str(int(r[8])) == ic(r[3])),
        "local_name_non_blank": sum(1 for r in sub if r[6]),
        "local_name_bengali_script": sum(1 for r in sub if r[6] and any("ঀ" <= ch <= "৿" for ch in r[6])),
        "code_overlap_with_block_codes": len(set(SUB) & set(bkc)),
        "subdistrict_with_no_village": [(k, SUB[k][5], SUB[k][2]) for k in SUB if k not in {ic(r[5]) for r in vgp}],
    }

    # ---- villages and gram panchayats ----------------------------------
    vc = collections.Counter(ic(r[9]) for r in vgp)
    bvv = {ic(r[6]) for r in bv}
    bvc = collections.Counter(ic(r[6]) for r in bv)
    vn = collections.defaultdict(set)
    for r in vgp:
        vn[ic(r[9])].add(r[10])
    bvn = {ic(r[6]): r[7] for r in bv}
    grp = collections.defaultdict(list)
    for r in vgp:
        grp[ic(r[9])].append(r)
    lbname = collections.defaultdict(set)
    for r in vgp:
        if r[13]:
            lbname[ic(r[13])].add(r[14])
    byname = collections.defaultdict(set)
    for k, v in lbname.items():
        for n in v:
            byname[n].add(k)
    gp_span = collections.defaultdict(lambda: [set(), set()])
    bvv2b = {ic(r[6]): ic(r[4]) for r in bv}
    bvd = {ic(r[6]): ic(r[2]) for r in bv}
    gp_blocks = collections.defaultdict(collections.Counter)
    for r in vgp:
        if r[13]:
            gp_span[ic(r[13])][0].add(ic(r[1]))
            gp_span[ic(r[13])][1].add(ic(r[5]))
            if ic(r[9]) in bvv2b:
                gp_blocks[ic(r[13])][bvv2b[ic(r[9])]] += 1
    ULBC = {ic(r[1]) for r in ulb}
    nbsp = [(ic(r[13][1]), r[14][1]) for r in raws["vgp"][6:] if len(r) > 14 and r[14] and r[14][1] != r[14][1].strip()]
    S["villages_gp"] = {
        "rows": len(vgp),
        "distinct_village_codes": len(vc),
        "villages_with_more_than_one_row": sum(1 for v in vc.values() if v > 1),
        "extra_rows_from_repeats": len(vgp) - len(vc),
        "rows_per_village": dict(sorted(collections.Counter(vc.values()).items())),
        "full_duplicate_rows": sum(v - 1 for v in collections.Counter(tuple(r[1:15]) for r in vgp).values() if v > 1),
        "village_with_more_than_one_name": sum(1 for v in vn.values() if len(v) > 1),
        "multi_row_villages_spanning_subdistricts": sum(1 for g in grp.values() if len(g) > 1 and len({x[5] for x in g}) > 1),
        "district_code_or_name_not_in_districts": sum(1 for r in vgp if ic(r[1]) not in DIST or DIST[ic(r[1])][3] != r[2]),
        "subdistrict_code_not_in_subdistricts": sum(1 for r in vgp if ic(r[5]) not in SUB),
        "subdistrict_name_or_district_mismatch": sum(
            1 for r in vgp if ic(r[5]) in SUB and (SUB[ic(r[5])][5] != r[6] or ic(SUB[ic(r[5])][1]) != ic(r[1]))
        ),
        "subdistrict_census2011_mismatch": sum(1 for r in vgp if ic(r[5]) in SUB and SUB[ic(r[5])][8] != r[7]),
        "districts_with_villages": len({ic(r[1]) for r in vgp}),
        "districts_without_villages": [DIST[k][3] for k in DIST if k not in {ic(r[1]) for r in vgp}],
        "village_census2011_equals_code": sum(1 for r in vgp if r[11] == r[9]),
        "village_census2011_000000": sum(1 for r in vgp if r[11] == "000000"),
        "village_census2001_blank": sum(1 for r in vgp if not r[12]),
        "subdistrict_census2001_blank_rows": sum(1 for r in vgp if not r[8]),
        "district_census2011_000_rows": sum(1 for r in vgp if r[3] == "000"),
        "village_set_equals_block_village_report": {
            "vgp_only": len(set(vc) - bvv),
            "bv_only": len(bvv - set(vc)),
            "bv_duplicate_village_codes": sum(1 for v in bvc.values() if v > 1),
            "village_name_mismatch": sum(1 for k in bvn if k in vn and {bvn[k]} != vn[k]),
            "district_disagreement": sum(1 for r in vgp if bvd.get(ic(r[9])) not in (None, ic(r[1]))),
        },
        "no_local_body": {
            "rows": sum(1 for r in vgp if not r[13]),
            "code_without_name_or_reverse": sum(1 for r in vgp if bool(r[13]) != bool(r[14])),
            "villages_also_listed_with_a_local_body": len({ic(r[9]) for r in vgp if not r[13]} & {ic(r[9]) for r in vgp if r[13]}),
            "top_districts": collections.Counter(r[2] for r in vgp if not r[13]).most_common(8),
        },
        "local_bodies": {
            "distinct_codes": len(lbname),
            "code_with_more_than_one_name": sum(1 for v in lbname.values() if len(v) > 1),
            "names_shared_by_several_codes": sum(1 for v in byname.values() if len(v) > 1),
            "max_codes_for_one_name": max(len(v) for v in byname.values()),
            "spanning_more_than_one_district": sum(1 for v in gp_span.values() if len(v[0]) > 1),
            "spanning_more_than_one_subdistrict": sum(1 for v in gp_span.values() if len(v[1]) > 1),
            "spanning_more_than_one_block": sum(1 for v in gp_blocks.values() if len(v) > 1),
            "codes_in_ulb_file": len(ULBC & set(lbname)),
            "leading_nbsp_names": sorted({n for _, n in nbsp}),
            "leading_nbsp_rows": len(nbsp),
        },
        "census_town_suffix_rows_ct": sum(1 for r in vgp if re.search(r"\(Ct\)\s*$", r[10])),
    }

    # ---- block <-> subdistrict via shared villages ---------------------
    bs = collections.defaultdict(collections.Counter)
    sb = collections.defaultdict(collections.Counter)
    for r in vgp:
        b = bvv2b.get(ic(r[9]))
        if b:
            bs[b][ic(r[5])] += 1
            sb[ic(r[5])][b] += 1
    impure_blocks = []
    for b, c in bs.items():
        if len(c) > 1:
            impure_blocks.append(
                {
                    "block": bkd[b][1],
                    "block_code": b,
                    "district": bkd[b][2],
                    "villages": sum(c.values()),
                    "subdistricts": [[SUB[s][5], n] for s, n in c.most_common()],
                }
            )
    strict = sum(1 for b, c in bs.items() if len(c) == 1 and len(sb[next(iter(c))]) == 1)
    S["block_subdistrict"] = {
        "blocks_with_villages": len(bs),
        "subdistricts_with_villages": len(sb),
        "strict_one_to_one_pairs": strict,
        "blocks_with_more_than_one_subdistrict": sum(1 for c in bs.values() if len(c) > 1),
        "subdistricts_with_more_than_one_block": sum(1 for c in sb.values() if len(c) > 1),
        "villages_in_minor_subdistrict_of_their_block": sum(
            sum(c.values()) - c.most_common(1)[0][1] for c in bs.values() if len(c) > 1
        ),
        "impure_blocks": sorted(impure_blocks, key=lambda x: x["block"]),
    }

    # derived-key agreement between the two LGD lists, within a district
    bset, sset = collections.defaultdict(dict), collections.defaultdict(dict)
    for r in blk:
        bset[ic(r[1])].setdefault(derived_key(r[5]), []).append((ic(r[3]), r[5]))
    for r in sub:
        sset[ic(r[1])].setdefault(derived_key(r[5]), []).append((ic(r[3]), r[5]))
    same = sum(1 for d in bset for k in bset[d] if k in sset[d])
    S["block_subdistrict"]["name_key_agreement_within_district"] = {
        "same_key": same,
        "block_only": sum(1 for d in bset for k in bset[d] if k not in sset[d]),
        "subdistrict_only": sum(1 for d in sset for k in sset[d] if k not in bset[d]),
    }

    # gram panchayats per block, and villages without a GP per block
    gpb = collections.defaultdict(set)
    nogp = collections.Counter()
    for r in vgp:
        b = bvv2b.get(ic(r[9]))
        if b is None:
            continue
        if r[13]:
            gpb[b].add(ic(r[13]))
        else:
            nogp[b] += 1
    S["gp_per_block"] = {
        "blocks_with_no_gp": sum(1 for b in bkd if not gpb.get(b)),
        "min": min(len(v) for v in gpb.values()),
        "max": max(len(v) for v in gpb.values()),
        "blocks_with_villages_without_gp": len(nogp),
        "cross_block_gps": sorted(
            [
                {"gp_code": g, "gp_name": next(iter(lbname[g])), "blocks": [[bkd[b][1], n] for b, n in c.most_common()]}
                for g, c in gp_blocks.items()
                if len(c) > 1
            ],
            key=lambda x: x["gp_code"],
        ),
    }

    # ---- urban local bodies and wards ----------------------------------
    wardc = collections.Counter(ic(r[3]) for r in ulb)
    ulbn = collections.defaultdict(set)
    for r in ulb:
        ulbn[ic(r[1])].add(r[2])
    pat = re.compile(r"^(.*) \(([^)]*)\) - Ward No\.\s*(\S+)$")
    wno = collections.defaultdict(collections.Counter)
    for r in ulb:
        wno[ic(r[1])][r[4]] += 1
    ut = collections.defaultdict(set)
    for r in ulb:
        m = pat.match(r[5])
        if m:
            ut[ic(r[1])].add(m.group(2))
    cnt = collections.Counter(ic(r[1]) for r in ulb)
    gaps = []
    for k, c in wno.items():
        nums = sorted(int(x) for x in c if x.isdigit())
        if nums != list(range(1, len(nums) + 1)):
            gaps.append({"ulb": next(iter(ulbn[k])), "wards": len(nums), "highest_number": nums[-1]})
    S["ulb"] = {
        "rows": len(ulb),
        "distinct_ulb_codes": len(ulbn),
        "duplicate_ward_codes": sum(1 for v in wardc.values() if v > 1),
        "full_duplicate_rows": sum(v - 1 for v in collections.Counter(tuple(r[1:6]) for r in ulb).values() if v > 1),
        "ulb_code_with_more_than_one_name": sum(1 for v in ulbn.values() if len(v) > 1),
        "duplicate_ward_numbers_within_ulb": sum(1 for c in wno.values() if any(v > 1 for v in c.values())),
        "duplicate_ward_names_within_ulb": sum(1 for v in collections.Counter((ic(r[1]), r[5]) for r in ulb).values() if v > 1),
        "ward_number_non_numeric": sum(1 for r in ulb if not re.fullmatch(r"\d+", r[4])),
        "ward_name_not_standard_pattern": sum(1 for r in ulb if not pat.match(r[5])),
        "ward_number_differs_from_name": [
            {"ulb": r[2], "ward_code": ic(r[3]), "number_column": r[4], "name": r[5]}
            for r in ulb
            if pat.match(r[5]) and pat.match(r[5]).group(3) != r[4]
        ],
        "ward_name_prefix_differs_from_ulb_name_rows": sum(1 for r in ulb if pat.match(r[5]) and pat.match(r[5]).group(1) != r[2]),
        "ward_name_prefix_differs_ulbs": len({ic(r[1]) for r in ulb if pat.match(r[5]) and pat.match(r[5]).group(1) != r[2]}),
        "ward_type_tokens": dict(collections.Counter(pat.match(r[5]).group(2) for r in ulb if pat.match(r[5]))),
        "ulbs_with_more_than_one_ward_type_token": len([1 for v in ut.values() if len(v) > 1]),
        "ward_numbers_not_1_to_n": gaps,
        "largest": [[next(iter(ulbn[k])), c] for k, c in cnt.most_common(6)],
        "smallest": [[next(iter(ulbn[k])), c] for k, c in sorted(cnt.items(), key=lambda x: x[1])[:4]],
        "header_columns": ["S.No.", "Local Body Code", "Local Body Name", "Ward Code", "Ward Number", "Ward Name"],
        "has_district_block_or_subdistrict_column": False,
        "ulb_codes_found_in_village_gp_file": len(ULBC & set(lbname)),
        "ulb_name_equal_to_a_block_name_key": 0,  # filled below
    }

    # ---- workbook compatibility (name-overlap diagnostics, NOT matches) --
    W = workbook_a_b(wbp)
    S["workbook"] = {"header": list(W[0][1:]), "data_rows": len(W) - 1, "first_row": W[1][0], "last_row": W[-1][0]}
    W = W[1:]
    pools = {"block": {}, "subdistrict": {}, "ulb": {}, "district": {}}
    for r in blk:
        pools["block"].setdefault(derived_key(r[5]), []).append((ic(r[3]), r[5]))
    for r in sub:
        pools["subdistrict"].setdefault(derived_key(r[5]), []).append((ic(r[3]), r[5]))
    seen = set()
    for r in ulb:
        if ic(r[1]) in seen:
            continue
        seen.add(ic(r[1]))
        pools["ulb"].setdefault(derived_key(r[2]), []).append((ic(r[1]), r[2]))
    for r in dist:
        pools["district"].setdefault(derived_key(r[3]), []).append((ic(r[1]), r[3]))
    hits = [(rn, a, b, {p: pools[p].get(derived_key(b), []) for p in pools}) for rn, a, b in W]
    cnt_h = lambda p: sum(1 for x in hits if x[3][p])
    S["ulb"]["ulb_name_equal_to_a_block_name_key"] = len(set(pools["ulb"]) & set(pools["block"]))
    S["workbook_overlap"] = {
        "note": "Exact derived-key name overlap only. Candidate sets, not matches. DISTRICT label never used.",
        "rows_with_exact_key_candidate": {p: cnt_h(p) for p in pools},
        "block_candidates_more_than_one": sum(1 for x in hits if len(x[3]["block"]) > 1),
        "block_or_subdistrict": sum(1 for x in hits if x[3]["block"] or x[3]["subdistrict"]),
        "any_pool": sum(1 for x in hits if any(x[3].values())),
        "no_candidate_in_any_pool": [[x[0], x[2]] for x in hits if not any(x[3].values())],
        "subdistrict_only_candidate": [[x[0], x[2], [h[1] for h in x[3]["subdistrict"]]] for x in hits if x[3]["subdistrict"] and not x[3]["block"]],
        "ulb_only_candidate": [[x[0], x[2], [h[1] for h in x[3]["ulb"]]] for x in hits if x[3]["ulb"] and not x[3]["block"] and not x[3]["subdistrict"]],
        "rows_with_both_block_and_ulb_candidate": [[x[0], x[2]] for x in hits if x[3]["block"] and x[3]["ulb"]],
        "workbook_rows_labelled_borough": [[x[0], x[2]] for x in hits if "borough" in (x[2] or "").lower()],
        "lgd_block_ulb_name_key_collisions": len(set(pools["block"]) & set(pools["ulb"])),
        "lgd_block_key_collisions_within_lgd": [v for v in pools["block"].values() if len(v) > 1],
        "lgd_subdistrict_key_collisions_within_lgd": [v for v in pools["subdistrict"].values() if len(v) > 1],
    }
    text = json.dumps(S, indent=2, ensure_ascii=False, default=list)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        print(text)


if __name__ == "__main__":
    main()
