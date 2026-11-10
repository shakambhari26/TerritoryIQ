"""Settings from the environment. Every value has a safe local default except the API key."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _db_url() -> str:
    url = os.environ.get("DATABASE_URL", f"sqlite:///{ROOT / 'visit_intel.db'}")
    # Railway hands out postgres:// or postgresql://; SQLAlchemy needs the psycopg driver named.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = _db_url()
API_KEY = os.environ.get("VISIT_INTEL_API_KEY", "").strip()
# Send-only key for Frontier: accepted by the three ingest endpoints, refused by everything else.
INGEST_KEY = os.environ.get("VISIT_INTEL_INGEST_KEY", "").strip()
MODEL_PATH = Path(os.environ.get("VISIT_INTEL_MODEL_PATH", ROOT / "models/segment_model.joblib"))

# Decision thresholds (see docs/ARCHITECTURE.md section 4).
RULES_CONFIDENT = float(os.environ.get("VISIT_INTEL_RULES_CONFIDENT", 0.85))
ML_CONFIDENT = float(os.environ.get("VISIT_INTEL_ML_CONFIDENT", 0.60))
KEYWORDS_CONFIDENT = float(os.environ.get("VISIT_INTEL_KEYWORDS_CONFIDENT", 0.75))
KEYWORDS_MARGIN = float(os.environ.get("VISIT_INTEL_KEYWORDS_MARGIN", 0.40))
AGREE_CONFIDENT = float(os.environ.get("VISIT_INTEL_AGREE_CONFIDENT", 0.70))
# Confidence shown for an AI-assigned label (labeller "ai:…"). Not a measured accuracy —
# provenance ("decided_by": "ai") is the honest signal; a human label supersedes it.
AI_LABEL_CONFIDENCE = float(os.environ.get("VISIT_INTEL_AI_LABEL_CONFIDENCE", 0.90))
