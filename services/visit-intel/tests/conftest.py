import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

# Must be set before visit_intel.config is imported anywhere.
TEST_DB = ROOT / "tests" / ".test.db"
TEST_DB.unlink(missing_ok=True)
# VISIT_INTEL_TEST_DATABASE_URL runs the suite against an empty Postgres database instead (as on Supabase).
os.environ["DATABASE_URL"] = os.environ.get("VISIT_INTEL_TEST_DATABASE_URL") or f"sqlite:///{TEST_DB}"
os.environ["VISIT_INTEL_API_KEY"] = "test-key"
os.environ["VISIT_INTEL_MODEL_PATH"] = str(ROOT / "tests" / "no-model.joblib")  # rules-only: tests don't depend on training
