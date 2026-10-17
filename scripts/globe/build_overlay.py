"""Builds and validates the globe prototype's overlay manifest. Offline: reads generated files only.

    python -I scripts/globe/build_overlay.py            # writes data/generated/globe-overlay.json and globe-boundaries.json
    python -I scripts/globe/build_overlay.py --check    # validate and print the report, write nothing

Inputs (both produced by `npm run data:build`, both git-ignored):
    data/generated/boundaries.json   provisional OpenStreetMap outlines in the layer's planar coordinates
    data/generated/dataset.json      workbook rows, official LGD units, and the unreviewed crosswalk

What it does, in order
  1. Decodes every shape's path data with the same rule as src/features/geo/layer.ts (decodePath) and converts
     the layer coordinates to longitude / latitude (WGS84 degrees) with the inverse of the layer's spherical
     Mercator, written independently of src/features/geo/projection.ts. tests/unit/globe-overlay.test.mts
     checks the two implementations agree.
  2. Validates the geometry. A shape that fails any check is NOT drawn on the globe; it is listed with the reason.
       - every coordinate is finite and inside the West Bengal search envelope used to fetch the layer
       - every ring has at least 3 distinct points and a non-zero area
       - the feature ID exists in the official LGD feature list and has the right kind
       - a block's label anchor lies inside its parent district's outline (a spatial check of the parent
         relationship that does not rely on names)
  3. Classifies each unit for the colour rule. This is about a provisional name-based link between a workbook
     row and an official block, never about allocation (Assigned / Vacant / Unallocated / Data Missing):
       represented         a row is linked to this block (exact name, unreviewed) and lists at least one named
                           person. District: at least one of its blocks is in that state.
       no-representative   only on a reviewed source record that confirms "no representative". The base data holds
                           none and this script reads no other source (the reviewer's browser-local change log
                           is deliberately not read), so it never emits this state: nothing is white. It is never
                           inferred from a missing row or a vacant marker. The app also refuses the state without
                           a record (src/features/globe/classification.ts).
       unresolved          everything else: no row linked, a linked row with no named person, a candidate only
                           for an ambiguous or weak row, or geometry that failed validation or is missing.
  4. Writes a manifest of validated shapes with their classification and the evidence behind it. The manifest
     carries each validated outline's summary (bounding box, label point, vertex count) but NOT its path data.
  5. Writes the globe's own outline file, data/generated/globe-boundaries.json: exactly the shapes that passed
     step 2, in the layer's own path format, under its own dataset identity (`meta.datasetId`, `meta.kind`) and
     a `derivedFrom` record naming the workspace layer it was cut from. The manifest records its SHA-256, dataset
     ID and shape count. The same-origin route /geo/globe-boundaries.json serves that file and nothing else, and
     only if it still matches that record (src/features/globe/layer-integrity.ts); the browser joins it to the
     manifest and refuses any outline that does not match its summary (src/features/globe/layer-merge.ts). The
     workspace's /geo/boundaries.json route and its file are not touched.

Nothing here contacts a network, writes outside data/generated/, or touches the source workbooks.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GENERATED = ROOT / "data" / "generated"
LAYER_SCALE = 10_000
GLOBE_LAYER_FILE = "globe-boundaries.json"
GLOBE_LAYER_KIND = "globe-validated-outlines"
# The Overpass bounding box the layer was fetched with (south, west, north, east). See data/raw/osm/manifest.json.
ENVELOPE = {"south": 21.4, "west": 85.7, "north": 27.4, "east": 90.0}
# West Bengal's centre-line extents are well inside the envelope; used only to describe the state target.
PATH_RING = re.compile(r"M(-?\d+) (-?\d+)l([^z]*)z")

PROVISIONAL_STATUS = (
    "Provisional. Community-sourced OpenStreetMap outlines, simplified, not an official boundary. The link from a "
    "workbook row to an official block is an unreviewed exact-name match. A coloured shape means a provisional link "
    "to a named representative, not that the area is covered, verified or officially approved."
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def layer_to_lnglat(x: float, y: float) -> tuple[float, float]:
    """Inverse of the layer's projection: x = lng * 1e4, y = -(Mercator ordinate in degrees) * 1e4."""
    ordinate = -y / LAYER_SCALE
    lat = math.degrees(2 * math.atan(math.exp(math.radians(ordinate))) - math.pi / 2)
    return x / LAYER_SCALE, lat


def decode_rings(d: str) -> list[list[tuple[int, int]]]:
    rings = []
    for match in PATH_RING.finditer(d):
        x, y = int(match.group(1)), int(match.group(2))
        ring = [(x, y)]
        numbers = [int(n) for n in match.group(3).split()]
        for i in range(0, len(numbers) - 1, 2):
            x += numbers[i]
            y += numbers[i + 1]
            ring.append((x, y))
        rings.append(ring)
    return rings


def ring_area(ring: list[tuple[float, float]]) -> float:
    total = 0.0
    for i, (x0, y0) in enumerate(ring):
        x1, y1 = ring[(i + 1) % len(ring)]
        total += x0 * y1 - x1 * y0
    return total / 2


def point_in_ring(x: float, y: float, ring: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_rings_even_odd(x: float, y: float, rings: list[list[tuple[float, float]]]) -> bool:
    return sum(point_in_ring(x, y, ring) for ring in rings) % 2 == 1


def named_people(unit: dict) -> int:
    count = 0
    for slot in unit["slots"]:
        if slot["status"] == "named" and any(str(n).strip() for n in slot["names"]):
            count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate and report; write nothing")
    args = parser.parse_args()

    layer_path = GENERATED / "boundaries.json"
    dataset_path = GENERATED / "dataset.json"
    for path in (layer_path, dataset_path):
        if not path.exists():
            print(f"missing {path}; run `npm run data:build` first", file=sys.stderr)
            return 2
    layer = json.loads(layer_path.read_text(encoding="utf-8"))
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))

    features = {f["id"]: f for f in dataset["features"]}
    units = {u["id"]: u for u in dataset["units"]}
    territories = {t["id"]: t for t in dataset["salesTerritories"]}

    # ---------------------------------------------------------------- geometry --
    shapes: dict[str, dict] = {}
    rejected: dict[str, str] = {}
    duplicates = 0
    for shape in layer["shapes"]:
        fid = shape["featureId"]
        if fid in shapes or fid in rejected:
            duplicates += 1
            rejected[fid] = "duplicate shape for one feature ID"
            shapes.pop(fid, None)
            continue
        feature = features.get(fid)
        if feature is None:
            rejected[fid] = "feature ID is not in the official LGD feature list"
            continue
        rings = decode_rings(shape["d"])
        if not rings:
            rejected[fid] = "no ring could be decoded from the path data"
            continue
        problem = None
        lnglat_rings = []
        for ring in rings:
            if len(set(ring)) < 3:
                problem = "a ring has fewer than 3 distinct points"
                break
            ll = [layer_to_lnglat(x, y) for x, y in ring]
            if any(not (math.isfinite(a) and math.isfinite(b)) for a, b in ll):
                problem = "a coordinate is not finite"
                break
            if any(not (ENVELOPE["west"] <= a <= ENVELOPE["east"] and ENVELOPE["south"] <= b <= ENVELOPE["north"]) for a, b in ll):
                problem = "a coordinate lies outside the West Bengal search envelope"
                break
            if abs(ring_area(ll)) < 1e-9:
                problem = "a ring has zero area"
                break
            lnglat_rings.append(ll)
        if problem:
            rejected[fid] = problem
            continue
        anchor = shape.get("anchor")
        shapes[fid] = {
            "feature": feature,
            "d": shape["d"],
            "rings": lnglat_rings,
            "anchor": layer_to_lnglat(anchor[0], anchor[1]) if anchor else None,
            "anchorRadiusLayer": anchor[2] if anchor else None,
        }

    # Parent relationship: a block's anchor must lie inside its parent district outline (even-odd).
    parent_failures: dict[str, str] = {}
    for fid, shape in list(shapes.items()):
        feature = shape["feature"]
        if feature["kind"] != "block":
            continue
        parent_id = feature["districtId"]
        parent = shapes.get(parent_id) if parent_id else None
        if parent is None:
            parent_failures[fid] = "parent district has no validated outline"
        elif shape["anchor"] is None:
            parent_failures[fid] = "no label anchor to test against the parent district"
        elif not point_in_rings_even_odd(shape["anchor"][0], shape["anchor"][1], parent["rings"]):
            parent_failures[fid] = "label anchor lies outside the parent district outline"
    for fid, reason in parent_failures.items():
        rejected[fid] = reason
        shapes.pop(fid)

    # --------------------------------------------------------------- crosswalk --
    rows_by_block: dict[str, list[str]] = {}
    ambiguous_candidates: dict[str, list[str]] = {}
    for entry in dataset["crosswalk"]:
        if entry["status"] == "provisional" and entry["featureId"]:
            rows_by_block.setdefault(entry["featureId"], []).append(entry["unitId"])
        elif entry["status"] in ("ambiguous", "weak"):
            for candidate in entry["candidates"]:
                ambiguous_candidates.setdefault(candidate["featureId"], []).append(entry["unitId"])

    def records_for(block_id: str) -> list[dict]:
        out = []
        for unit_id in rows_by_block.get(block_id, []):
            unit = units[unit_id]
            people = []
            for slot in unit["slots"]:
                if slot["status"] == "vacant":
                    people.append({"role": slot["role"], "slot": slot["slot"], "name": None, "vacant": True})
                    continue
                for name in slot["names"]:
                    if str(name).strip():
                        people.append({"role": slot["role"], "slot": slot["slot"], "name": " ".join(str(name).split()), "vacant": False})
            out.append(
                {
                    "unitId": unit_id,
                    "blockLabel": unit["blockLabel"].strip(),
                    "territory": territories[unit["salesTerritoryId"]]["label"],
                    "people": people,
                    "namedPeople": named_people(unit),
                }
            )
        return out

    blocks_by_district: dict[str, list[str]] = {}
    for f in dataset["features"]:
        if f["kind"] == "block" and f["districtId"]:
            blocks_by_district.setdefault(f["districtId"], []).append(f["id"])

    def block_state(block_id: str) -> tuple[str, str, list[dict]]:
        records = records_for(block_id)
        if any(r["namedPeople"] > 0 for r in records):
            return "represented", "A workbook row is linked to this block by exact name (unreviewed) and lists a named person.", records
        if records:
            return "unresolved", "A workbook row is linked by exact name but lists no named person (blank or vacant markers only). Not confirmed as unrepresented.", records
        if block_id in ambiguous_candidates:
            return "unresolved", "Only an ambiguous or weak workbook match points here. Not linked.", []
        return "unresolved", "No workbook row is linked to this block.", []

    # ------------------------------------------------------------------ output --
    def geometry_for(fid: str) -> dict | None:
        shape = shapes.get(fid)
        if shape is None:
            return None
        lngs = [p[0] for ring in shape["rings"] for p in ring]
        lats = [p[1] for ring in shape["rings"] for p in ring]
        return {
            "bbox": [round(min(lngs), 5), round(min(lats), 5), round(max(lngs), 5), round(max(lats), 5)],
            "anchor": [round(shape["anchor"][0], 5), round(shape["anchor"][1], 5)] if shape["anchor"] else None,
            "vertices": sum(len(r) for r in shape["rings"]),
        }

    out_blocks = []
    for f in dataset["features"]:
        if f["kind"] != "block":
            continue
        state, reason, records = block_state(f["id"])
        geometry = geometry_for(f["id"])
        if geometry is None:
            geometry_note = rejected.get(f["id"]) or "no outline in the provisional layer"
            if state == "represented":
                reason += " No outline is drawn: " + geometry_note + "."
        else:
            geometry_note = None
        out_blocks.append(
            {
                "id": f["id"],
                "name": f["name"],
                "lgdCode": f["lgdCode"],
                "districtId": f["districtId"],
                "state": state,
                "reason": reason,
                "contested": len(records) > 1,
                "records": records,
                "geometry": geometry,
                "noGeometryReason": geometry_note,
            }
        )

    block_state_by_id = {b["id"]: b["state"] for b in out_blocks}
    out_districts = []
    for f in dataset["features"]:
        if f["kind"] != "district":
            continue
        block_ids = blocks_by_district.get(f["id"], [])
        represented = [b for b in block_ids if block_state_by_id.get(b) == "represented"]
        geometry = geometry_for(f["id"])
        out_districts.append(
            {
                "id": f["id"],
                "name": f["name"],
                "lgdCode": f["lgdCode"],
                "state": "represented" if represented else "unresolved",
                "reason": (
                    f"{len(represented)} of {len(block_ids)} blocks in the current reference list have a provisional link to a named representative. Not a statement that the district is covered."
                    if represented
                    else "No block in this district has a provisional link to a named representative."
                ),
                "blockCount": len(block_ids),
                "representedBlockCount": len(represented),
                "drawnBlockCount": sum(1 for b in block_ids if b in shapes),
                "geometry": geometry,
                "noGeometryReason": None if geometry else (rejected.get(f["id"]) or "no outline in the provisional layer"),
            }
        )

    drawn_districts = [d for d in out_districts if d["geometry"]]
    boxes = [d["geometry"]["bbox"] for d in drawn_districts]
    state_bbox = [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)] if boxes else None

    counts = {
        "districts": len(out_districts),
        "districtsDrawn": len(drawn_districts),
        "districtsRepresented": sum(d["state"] == "represented" for d in out_districts),
        "blocks": len(out_blocks),
        "blocksDrawn": sum(b["geometry"] is not None for b in out_blocks),
        "blocksRepresented": sum(b["state"] == "represented" for b in out_blocks),
        "blocksRepresentedAndDrawn": sum(b["state"] == "represented" and b["geometry"] is not None for b in out_blocks),
        "blocksNoRepresentativeConfirmed": sum(b["state"] == "no-representative" for b in out_blocks),
        "blocksUnresolved": sum(b["state"] == "unresolved" for b in out_blocks),
        "blocksContested": sum(b["contested"] for b in out_blocks),
        "shapesRejected": len(rejected),
        "parentFailures": len(parent_failures),
        "duplicateShapes": duplicates,
    }

    # The globe's own outline file: exactly the shapes that passed validation, under its own dataset identity. The
    # bytes are fixed here so the manifest can record their SHA-256; nothing in it depends on the build time.
    layer_meta = layer["meta"]
    globe_shapes = [s for s in layer["shapes"] if s["featureId"] in shapes]
    globe_layer = {
        "meta": {
            "datasetId": f"globe-{layer_meta['datasetId']}",
            "kind": GLOBE_LAYER_KIND,
            "title": "Validated provisional outlines for the globe prototype (OpenStreetMap, community-sourced)",
            "source": layer_meta["source"],
            "licence": layer_meta["licence"],
            "attribution": layer_meta["attribution"],
            "snapshots": layer_meta["snapshots"],
            "retrievedAt": layer_meta["retrievedAt"],
            "projection": layer_meta["projection"],
            "simplificationDegrees": layer_meta["simplificationDegrees"],
            "status": layer_meta["status"],
            "derivedFrom": {"file": "boundaries.json", "datasetId": layer_meta["datasetId"], "sha256": sha256(layer_path)},
            "counts": {
                "shapes": len(globe_shapes),
                "districts": sum(1 for s in globe_shapes if features[s["featureId"]]["kind"] == "district"),
                "blocks": sum(1 for s in globe_shapes if features[s["featureId"]]["kind"] == "block"),
            },
        },
        "viewBox": layer["viewBox"],
        "shapes": globe_shapes,
    }
    globe_layer_bytes = json.dumps(globe_layer, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    manifest = {
        "meta": {
            "schema": 1,
            "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "inputs": {
                "boundaries.json": {"sha256": sha256(layer_path), "datasetId": layer["meta"]["datasetId"]},
                "dataset.json": {"sha256": sha256(dataset_path), "generatedAt": dataset["meta"]["generatedAt"]},
                GLOBE_LAYER_FILE: {
                    "sha256": hashlib.sha256(globe_layer_bytes).hexdigest(),
                    "datasetId": globe_layer["meta"]["datasetId"],
                    "kind": GLOBE_LAYER_KIND,
                    "shapes": len(globe_shapes),
                },
            },
            "crs": "Shapes keep the layer's planar path data; coordinates convert to WGS84 longitude/latitude with the inverse spherical Mercator (x/1e4 = longitude; y = -ordinate*1e4). Bounding boxes and anchors here are already degrees.",
            "layerSource": layer["meta"]["source"],
            "licence": layer["meta"]["licence"],
            "attribution": layer["meta"]["attribution"],
            "snapshots": layer["meta"]["snapshots"],
            "status": PROVISIONAL_STATUS,
            "colourRule": {
                "district": "royal blue when at least one block has a provisional link to a named representative; white only with a reviewed source record (none exists yet); otherwise unresolved",
                "block": "orange when linked to a named representative (provisional); white only with a reviewed source record confirming 'no representative' (none exists yet); otherwise unresolved",
                "unresolved": "unknown, ambiguous, unmatched, or missing or unvalidated geometry",
            },
            "counts": counts,
        },
        "state": {
            "id": "WB",
            "name": "West Bengal",
            "bbox": state_bbox,
            "centre": [round((state_bbox[0] + state_bbox[2]) / 2, 5), round((state_bbox[1] + state_bbox[3]) / 2, 5)] if state_bbox else None,
            "basis": "Union of the validated district outline bounding boxes. No state polygon exists in the layer, so none is drawn.",
        },
        "districts": out_districts,
        "blocks": out_blocks,
        "rejected": [{"id": fid, "reason": reason} for fid, reason in sorted(rejected.items())],
    }

    print(json.dumps({"counts": counts, "stateBbox": state_bbox, "rejected": manifest["rejected"][:10], "globeLayer": manifest["meta"]["inputs"][GLOBE_LAYER_FILE]}, indent=2))
    if not args.check:
        GENERATED.mkdir(parents=True, exist_ok=True)
        # write_bytes, not write_text: the recorded hash is of exactly these bytes, whatever the platform's newline rule.
        layer_target = GENERATED / GLOBE_LAYER_FILE
        layer_target.write_bytes(globe_layer_bytes)
        target = GENERATED / "globe-overlay.json"
        target.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {layer_target.relative_to(ROOT)} ({layer_target.stat().st_size} bytes)")
        print(f"wrote {target.relative_to(ROOT)} ({target.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
