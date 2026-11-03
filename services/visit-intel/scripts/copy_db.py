"""Copy every table from one database to another, e.g. the local SQLite file to Supabase.

    .venv/bin/python scripts/copy_db.py sqlite:///visit_intel.db "<target DATABASE_URL>"

The target's tables are created (and locked, on Postgres) first. Refuses to run if the target already has visits, so
it cannot overwrite live data; the keyword table the target seeded from the CSV is replaced by the source's, which
carries any edits made through the app.
"""
from __future__ import annotations

import os
import sys

from sqlalchemy import create_engine, delete, func, insert, select, text

if len(sys.argv) != 3:
    sys.exit(__doc__)
os.environ["DATABASE_URL"] = sys.argv[2]
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from visit_intel import db  # noqa: E402  (config reads DATABASE_URL on import)

source = create_engine(sys.argv[1])
db.init_db()
with db.engine.begin() as dst:
    if dst.scalar(select(func.count()).select_from(db.Visit.__table__)):
        sys.exit("Target already has visits; not copying.")
    for table in db.Base.metadata.sorted_tables:
        with source.connect() as src:
            rows = [dict(r._mapping) for r in src.execute(select(table))]
        dst.execute(delete(table))
        if rows:
            dst.execute(insert(table), rows)
        print(f"{table.name}: {len(rows)}")
    if db.engine.dialect.name == "postgresql":  # copied ids were explicit; move each sequence past them
        for table in db.Base.metadata.sorted_tables:
            col = table.c.get("id")
            if col is not None and col.autoincrement is True:
                dst.execute(text(f"SELECT setval(pg_get_serial_sequence('{table.name}', 'id'), "
                                 f"COALESCE((SELECT MAX(id) FROM \"{table.name}\"), 0) + 1, false)"))
