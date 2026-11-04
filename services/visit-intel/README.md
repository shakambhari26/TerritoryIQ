# Visit Intelligence (Elegant Steel)

Reads the sales-visit transcripts that Frontier produces, cleans them, maps Bengali/Hindi trade slang, and gives
every visit a business segment, urgency (P0–P3), flags, extracted facts with evidence, a 5K note-quality score and a
playbook action. Served as an API; the **Visit Insights** page in TerritoryIQ shows one view per role.

Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Training program: `docs/Elegant_Steel_Voice_Note_Training_Program.docx`

## How a visit is decided
Three independent opinions, then a fixed order of trust (`pipeline.decide`):
* **Rules** (`rules.py`), **keyword database** (`keywords.py`, table `keywords`, seeded from `lexicon/keywords.csv`:
  about 1,250 weighted keywords for all 10 segments and 23 sub-segments in English, Bengali and Hindi, Roman and native
  script, with negation handling), **ML model** (`model.py`, Logistic Regression on TF-IDF + keyword scores).
* Human label → rules ≥ 0.85 → 2 of 3 agree (all three, or the surer one > 0.70) → ML ≥ 0.60 → keywords ≥ 0.75 with a
  0.40 lead → otherwise **needs human review** (best guess shown, never silently trusted).
* Every result carries `explanation` (`explain.py`): plain summary plus each step with its formula and numbers, and the
  measured track record of the deciding path with a Wilson 95% interval (`models/layer_accuracy.json`, written by
  `scripts/evaluate.py`). `GET /v1/methodology` explains every dashboard score.

Leave-one-out on the 34 labelled visits (`scripts/evaluate.py`): 79% accuracy overall (was 68%), 90% on the visits it
decides by itself (was 79%), 12% sent to review (was 29%). Still only 34 labels: grow them before trusting these numbers.

## Keyword database
Edit in TerritoryIQ (Visit Insights → Keyword database) or `GET/POST /v1/keywords`, `PATCH /v1/keywords/{id}`,
`POST /v1/keywords/test`. New rows in `lexicon/keywords.csv` are added on start; rows edited in the database are never
overwritten. After changing keywords, `POST /v1/reanalyze` to re-score stored visits, and retrain (`scripts/train.py`).

## Two-way messages (head office ↔ reps)
HO sends suggestions / to-do lists (optionally analysed and drafted by Claude, `messaging.draft`) by in-app, WhatsApp or
email; the rep ticks to-dos and replies through a private link (TerritoryIQ `/r/<token>`). Without WhatsApp/SMTP set up,
each message has "Share on my WhatsApp" / "Email" buttons that open HO's own app with the text and link filled in.

| Variable | For |
|---|---|
| `PUBLIC_BASE_URL` | TerritoryIQ's public address, for reply links |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business Cloud API |
| `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG` | Approved template (body params: title, link) for messages outside the 24-hour window |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Email |
| `REPLY_LINK_SECRET` | Optional; reply-link signing key (default: derived from `VISIT_INTEL_API_KEY`) |
| `ANTHROPIC_API_KEY` | AI analysis/drafts and free-text chat; without it drafts come from the playbook |

API: `GET/PUT /v1/contacts` · `POST /v1/messages/draft` · `POST/GET /v1/messages` · `POST /v1/messages/{id}/note` ·
`GET /v1/inbox?rep=` and `POST /v1/inbox/{id}/respond` (for Frontier's in-app inbox) · `GET/POST /v1/inbox/t/{token}`.

## Run locally
```bash
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python scripts/build_dataset.py          # data/raw -> data/processed (+ Excel)
.venv/bin/python scripts/train.py                  # -> models/segment_model.joblib (+ .json with scores)
.venv/bin/python scripts/backfill.py data/raw/*.csv
VISIT_INTEL_API_KEY=<key> .venv/bin/uvicorn visit_intel.api:app --app-dir src --port 8100
# Public docs (Prediction API only): http://127.0.0.1:8100/docs
# Full internal contract: curl -H "X-API-Key: <key>" http://127.0.0.1:8100/v1/internal/openapi.json
```
In TerritoryIQ, set `VISIT_INTEL_URL=http://127.0.0.1:8100` and `VISIT_INTEL_API_KEY=<key>` in `.env.local`.

## Measure
```bash
.venv/bin/python -m pytest -q                      # unit + API tests
.venv/bin/python scripts/evaluate.py               # whole-app accuracy, leave-one-out -> reports/app_evaluation.md
.venv/bin/python experiments/benchmark.py          # 29 models + elbow + learning curve -> reports/
.venv/bin/python experiments/test_taxonomy.py      # urgency/intent/sentiment taxonomy test
```

## Improve
* Export more Frontier transcripts → `scripts/backfill.py` (safe to re-run; never duplicates).
* Supervisors correct the review queue in TerritoryIQ.
* `scripts/train.py --with-db-labels`, then `POST /v1/reanalyze` (or restart).
* Grow `lexicon/slang_lexicon.csv` and the `PLAYBOOK` in `taxonomy.py`. Business-owned, no model change needed.

## API (all except /health and /v1/taxonomy need `X-API-Key`)
`POST /v1/visits/segment` · `POST /v1/visits/batch` · `POST /v1/visits/import-csv` · `GET /v1/visits` ·
`GET /v1/visits/{key}` · `GET /v1/review-queue` · `POST /v1/labels` · `POST /v1/reanalyze` ·
`GET /v1/insights/{md|vp_sales|supervisor|business_analyst|data_analyst}?days=` · `GET /v1/model/health`

## Prediction API for outside callers
`POST /v1/predict` and `POST /v1/predict/batch` (max 200), served by the same service and the same loaded model
(`predict_api.py`, included by `api.py`). Stateless: no database writes, no visit reads. Separate keys only: the
internal and ingest keys are refused there, and prediction keys are refused everywhere else. Public `/docs` and
`/openapi.json` show only this surface plus `/health` and `/v1/taxonomy`. Hand consumers
[docs/PREDICTION_API.md](docs/PREDICTION_API.md).

* Issue a key: `python scripts/make_predict_key.py <caller>` prints `<caller>:<key>`; append it to the service variable
  `VISIT_INTEL_PREDICT_KEYS` (comma-separated) and give the caller only the part after the colon. Revoke by removing it.
  Changing the variable restarts the service; nothing else is affected.
* Limits: `VISIT_INTEL_PREDICT_RATE_PER_MIN` (default 600 visits/min per caller), `VISIT_INTEL_PREDICT_LIMITS`
  (`caller=1200,...`). In-memory per instance: exact on one replica.
* Unset or invalid prediction settings only switch these two routes off (503, reason in the log); the rest of the
  service starts as before.
* `VISIT_INTEL_REQUIRE_MODEL=1` makes the service refuse to start without `models/segment_model.joblib`, so a deploy
  that lost the model fails its health check and the running deployment stays live.

## Deploy (Railway + Supabase)
Lives in the TerritoryIQ repo at `services/visit-intel`; the database is the TerritoryIQ Supabase project (Mumbai), whose
`public` schema holds these tables (created and locked with row-level security on startup).

* Deploy or redeploy: `zsh scripts/deploy_railway.sh`. It creates the `visit-intel` service in the TerritoryIQ Railway
  project the first time (keys from `.env.production`, database URL from the repo's `.env.supabase`, both git-ignored),
  then uploads with `--no-gitignore` so `models/` goes up while `.railwayignore` keeps `data/`, `*.db` and keys out.
* Public address: `https://visit-intel-production.up.railway.app`. TerritoryIQ calls it with `VISIT_INTEL_API_KEY`;
  Frontier gets only `VISIT_INTEL_INGEST_KEY`, which works on `POST /v1/visits/segment`, `/batch` and `/import-csv`
  and is refused everywhere else. Never give Frontier `VISIT_INTEL_API_KEY`.
* Copy a local database across once: `scripts/copy_db.py sqlite:///visit_intel.db "<DATABASE_URL>"` (refuses if the
  target already has visits).
* Test against Postgres: `VISIT_INTEL_TEST_DATABASE_URL=<empty database> .venv/bin/python -m pytest`.

Data contains customer names and phone numbers: keep `data/` out of Git; phones are masked in every insights view.
