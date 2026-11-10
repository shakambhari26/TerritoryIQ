"""Issue an API key for one caller of the prediction API.

    python scripts/make_predict_key.py hr-app
prints `hr-app:<random key>`. Give the caller only the part after the colon. Add the whole `name:key` entry to
VISIT_INTEL_PREDICT_KEYS (comma-separated) in .env.predict and redeploy; remove the entry to revoke the caller.
"""
import re
import secrets
import sys

if len(sys.argv) != 2 or not re.fullmatch(r"[A-Za-z0-9._-]{1,40}", sys.argv[1]):
    sys.exit("usage: make_predict_key.py <caller-name>   (letters, digits, . _ - only; this name appears in the logs)")
print(f"{sys.argv[1]}:{secrets.token_urlsafe(32)}")
