# Prompt to paste into Claude Code (open the `elegant-visit-intel` folder in VS Code first)

---

You are helping me build **Visit Intelligence**, a Python service for **Elegant Steel**, a TMT steel
manufacturer in Kolkata, West Bengal. Our sales app **Frontier** records a voice note at the end of every
sales visit. Gemini converts the voice to text. Those notes are often vague, and sometimes Gemini invents
content. Your job is to build the ML layer that segments every visit, flags bad notes, and serves role-based
insights. **This phase is experimentation:** find which algorithm scores best. The production API comes after.

## Read these first
- `docs/ARCHITECTURE.md`: **the target architecture** (Bronze/Silver/Gold, 4-layer segmentation, hierarchical
  segments, backfill + incremental ingest, two-way loop with rep training). Where it differs from older docs, it wins.
- `docs/SOLUTION_GUIDE.md`: business context, the 10 segments, role views.
- `lexicon/slang_lexicon.csv` + `src/visit_intel/lexicon.py`: Bengali/Hindi/English trade-slang mapping (111 terms).
  Use it as a feature source and in L1 rules; never trust `ambiguous` terms alone.
- `experiments/benchmark.py`: the existing 29-model benchmark and elbow method. Extend it, don't rewrite it.
- We cannot change Frontier. Our input is its transcripts (export or read-only DB/API); old and new visits must
  go through the same pipeline.
- `data/processed/visits_dataset.csv`: 34 visits, 42 columns, with seed labels (`segment_primary`,
  `segment_secondary`, `label_confidence`, `follow_up_needed`, `qty_mt`, `transcript_issue`).
- `data/raw/visit_transcripts_raw.csv`: the original export. Never modify it.
- `data/labels/seed_labels_v1.csv`: hand labels. Labels live separately from raw data.
- `scripts/build_dataset.py`: how the processed file is built. Extend it rather than duplicate it.

## The 10 segments (codes are fixed)
HOT_ORDER, PAYMENT, COMPETITOR_PRICE, COMPLAINT_ESCALATE, SITE_PIPELINE, NEW_LEAD, TECH_SUPPORT,
HAPPY_CUSTOMER, LOW_VALUE_VISIT, UNCLEAR_RECORDING. Definitions are in the guide and in the `segments`
sheet of `data/processed/visits_dataset.xlsx`.

## Ground rules
- Python 3.11+, a `pyproject.toml` with pinned versions, `ruff` for linting, `pytest` for tests.
- 34 rows is far too few to trust any score. Build everything so that it **runs end to end on 34 rows now**
  and **scales unchanged to 5,000+ rows** later. Always print the class counts, and warn when a class has
  fewer than 20 examples.
- Never claim a model is "best" from 34 rows. Report mean ± std across folds, and say when the
  difference between models is within noise.
- `contact_number` is personal data. Hash it (salted SHA-256) before any modelling, and never send names
  or phones to an external API. Add `data/` to `.gitignore` except a tiny synthetic sample for tests.
- Everything must be reproducible: fixed random seeds, a config file (`config.yaml`), one command per step.

## Phase 1: Experiment harness (build this first)
Folder layout: `src/visit_intel/` (package), `experiments/`, `reports/`, `tests/`.

1. **Synthetic data augmenter** (`experiments/make_synthetic.py`). Use the 34 real notes as style
   examples and generate about 60 realistic synthetic notes per segment, in Indian-English rep style with
   some Bengali/Hindi words (e.g. "rate besi", "site e kaaj cholche", "dealer ke bola"). Mark every row
   `is_synthetic=1`. Synthetic rows are **only ever used for training, never for testing**. Testing
   always uses real rows. If an `ANTHROPIC_API_KEY` is present, use Claude (`claude-sonnet-5-5`) to
   generate them; otherwise fall back to a template generator.
2. **Feature builders**: (a) TF-IDF on words and character 3-5 grams; (b) multilingual sentence embeddings
   (`sentence-transformers`, `paraphrase-multilingual-MiniLM-L12-v2`, cached to disk); (c) the existing
   `kw_*` flags plus `category_group`, `word_count` and the data-quality columns.
3. **Classifiers to compare** (all as scikit-learn pipelines): Logistic Regression, Linear SVM,
   Multinomial/Complement Naive Bayes (TF-IDF only), Decision Tree, Random Forest, XGBoost, LightGBM,
   KNN (cosine, on embeddings), and a **rules-only baseline**. Also an **LLM zero-shot** baseline
   (Claude, strict JSON output, temperature 0) behind a flag, so it costs nothing unless enabled.
4. **Evaluation** (`experiments/run_benchmark.py`): repeated stratified k-fold (k = min(5, smallest class
   size), with real-only test folds) reporting **macro-F1 (primary)**, weighted-F1, accuracy, per-class
   precision/recall/F1, a confusion matrix, and recall on COMPLAINT_ESCALATE specifically. Write
   `reports/benchmark.csv` and `reports/benchmark.md` with a ranked leaderboard plus confusion-matrix
   PNGs. Tune the top 3 models with a small grid or Optuna search.
5. **Clustering for discovery** (`experiments/run_clustering.py`): K-Means (k = 6..14, choose by
   silhouette), Agglomerative, and HDBSCAN on embeddings. Output a 2-D UMAP plot, the top terms and 3
   example notes per cluster, and a cross-table of clusters vs our 10 labels. Purpose: test whether our
   10 segments are the natural groups, and find missing ones.
6. **Anomaly / hallucination score**: Isolation Forest on embeddings plus rule checks (meta-text like
   "the audio mentions", plan-not-outcome like "instructions for visit", category/text mismatch, invalid or
   shared phone, very short notes). Produce `unclear_score` 0-1, and check it against the
   UNCLEAR_RECORDING and `transcript_issue` labels.
7. **Extractors** (regex first, then optional LLM): quantity in MT, payment status, competitor brand
   (Shyam, SRMB, Captain, Maithan, Rashmi, Kamdhenu, Tata Tiscon, JSW, plus "competitor"), follow-up date,
   and sentiment.
8. **Labelling helper**: a script that pre-labels a new CSV export with the best model or the LLM, and
   writes an Excel review sheet (dropdowns for segment and confidence) so a supervisor can correct labels.
   Corrections are saved as `data/labels/labels_vN.csv`.

## Phase 2: FastAPI service (only after I review the Phase 1 results)
- `POST /v1/visits/classify` takes one visit (same fields as the dataset) and returns
  `segment_primary`, `segment_secondary`, `confidence`, `unclear_score`, `risk_score` (0-100),
  extracted fields, `needs_human_review` (confidence below a threshold), `model_version`.
- `POST /v1/visits/classify-batch`, `GET /v1/insights/{role}` where role is one of
  `md | vp_sales | supervisor | business_analyst | data_analyst` (the role views from the guide),
  `GET /health`.
- Pydantic models, Postgres via SQLAlchemy (SQLite locally), API-key auth, a Dockerfile, deploy to
  Railway. Load the model once at startup. Every prediction is stored with `model_version` for audits.
- A Streamlit dashboard with one tab per role, using plain-language segment names and emoji, readable by
  someone with no technical background.

## How to work with me
- Start by reading the files above, then show me a short plan and the folder structure before writing code.
- After each step, run it and show me the real output. Don't summarise results you didn't run.
- Explain results in simple language. I'm not an ML expert, so explain the "why" behind each choice in one or
  two sentences.
- Ask me before adding paid API calls or anything that sends data outside my machine.
