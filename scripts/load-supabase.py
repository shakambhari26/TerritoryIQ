"""Load the built TerritoryIQ data (data/generated) into the Supabase `territory` schema.

    services/visit-intel/.venv/bin/python scripts/load-supabase.py

Reads DATABASE_URL from the environment, else from .env.supabase (git-ignored). Safe to re-run after every `npm run build:data`: territories,
units and boundaries are upserted, and the slots, crosswalk and customers are replaced, all in one transaction.
The allocation change log is never touched, so recorded changes survive a reload.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "data" / "generated"


def database_url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    for line in (ROOT / ".env.supabase").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("DATABASE_URL is missing from .env.supabase")


def main() -> None:
    dataset = json.loads((GEN / "dataset.json").read_text())
    customers = json.loads((GEN / "customers.json").read_text())
    report = json.loads((GEN / "build-report.json").read_text())
    meta = dataset["meta"]
    # Districts first: blocks point at them.
    features = sorted(dataset["features"], key=lambda f: f["kind"] != "district")

    with psycopg.connect(database_url()) as conn, conn.cursor() as cur:
        cur.execute(
            "insert into territory.dataset_builds (generated_at, workbook_file, workbook_sha256, report) values (%s, %s, %s, %s)",
            (meta["generatedAt"], meta["workbook"]["file"], meta["workbook"]["sha256"], Jsonb(report)),
        )
        cur.executemany(
            "insert into territory.sales_territories (id, label) values (%s, %s) on conflict (id) do update set label = excluded.label",
            [(t["id"], t["label"]) for t in dataset["salesTerritories"]],
        )
        cur.executemany(
            """insert into territory.geo_features (id, kind, lgd_code, name, district_id, village_rows, boundary, boundary_gap)
               values (%s, %s, %s, %s, %s, %s, %s, %s)
               on conflict (id) do update set kind = excluded.kind, lgd_code = excluded.lgd_code, name = excluded.name,
                 district_id = excluded.district_id, village_rows = excluded.village_rows, boundary = excluded.boundary,
                 boundary_gap = excluded.boundary_gap""",
            [(f["id"], f["kind"], f["lgdCode"], f["name"], f["districtId"], f["villageRows"],
              Jsonb(f["boundary"]) if f["boundary"] is not None else None,
              Jsonb(f["boundaryGap"]) if f["boundaryGap"] is not None else None) for f in features],
        )
        cur.executemany(
            """insert into territory.units (id, source_row, sales_territory_id, block_label, flags) values (%s, %s, %s, %s, %s)
               on conflict (id) do update set source_row = excluded.source_row, sales_territory_id = excluded.sales_territory_id,
                 block_label = excluded.block_label, flags = excluded.flags""",
            [(u["id"], u["sourceRow"], u["salesTerritoryId"], u["blockLabel"], u["flags"]) for u in dataset["units"]],
        )
        cur.execute("delete from territory.unit_slots")
        cur.executemany(
            "insert into territory.unit_slots (unit_id, role, slot, status, names) values (%s, %s, %s, %s, %s)",
            [(u["id"], s["role"], s["slot"], s["status"], s["names"]) for u in dataset["units"] for s in u["slots"]],
        )
        cur.execute("delete from territory.crosswalk")
        cur.executemany(
            "insert into territory.crosswalk (unit_id, status, feature_id, candidates, reason) values (%s, %s, %s, %s, %s)",
            [(c["unitId"], c["status"], c["featureId"], Jsonb(c["candidates"]), c["reason"]) for c in dataset["crosswalk"]],
        )
        cur.execute("delete from territory.customers")
        cur.executemany(
            """insert into territory.customers (id, type, firm, name, erp_code, block_id, confidence, basis, village, flags)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [(c["id"], c["type"], c.get("firm"), c.get("name"), c.get("erpCode"), block, c.get("confidence"), c.get("basis"),
              Jsonb(c["village"]) if c.get("village") else None, c.get("flags", [])) for block, rows in customers["blocks"].items() for c in rows],
        )
        counts = {t: cur.execute(f"select count(*) from territory.{t}").fetchone()[0]
                  for t in ("sales_territories", "geo_features", "units", "unit_slots", "crosswalk", "customers",
                            "allocation_changes")}
    print(counts)


if __name__ == "__main__":
    main()
