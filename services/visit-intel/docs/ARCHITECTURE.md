# Visit Intelligence: System Architecture

**Scope.** Frontier (the sales app) owns everything up to the transcript: recording, Gemini speech-to-text,
storage. **We own everything after it:** cleaning, slang mapping, segmentation, analytics, delivery of
insights, and the feedback loop into rep training. Nothing in this design requires changing Frontier.
We only need to *read* its transcripts (export, database read replica, or API).

It is a **two-way system**:
- **Forward:** transcripts become segments, then insights, then decisions.
- **Backward:** the insights also tell us which reps record poor notes, and that feeds the **Field Sales
  Training Program** (`Elegant_Steel_Voice_Note_Training_Program.docx`). Better notes give better ML.

---

## 1. The big picture

```
 FRONTIER (not ours)                     VISIT INTELLIGENCE (ours)
 ┌──────────────────┐   ① INGEST   ┌─────────────────────────────────────────────────────────┐
 │ Rep voice note   │  ─────────►  │ BRONZE  raw transcripts, never edited (append-only)     │
 │ Gemini → text    │  backfill +  │    │                                                    │
 │ Frontier DB      │  every 15min │ ② CLEAN & ENRICH                                        │
 └──────────────────┘              │    language detect → transliterate → slang lexicon      │
                                   │    → entity match (customer, rep, phone, brand)          │
                                   │    → extract facts (MT, ₹, size, dates, competitor)      │
                                   │    ▼                                                    │
                                   │ SILVER  one clean row per visit + extracted facts       │
                                   │    │                                                    │
                                   │ ③ SEGMENT (the "brain"): 4 layers, cheapest first       │
                                   │    L1 rules + lexicon → L2 ML model → L3 LLM judge       │
                                   │    → L4 human review (only when layers disagree/unsure)  │
                                   │    ▼                                                    │
                                   │ GOLD  segment + flags + confidence + risk per visit;    │
                                   │       customer / rep / area segments rolled up daily    │
                                   │    │                                                    │
                                   │ ④ DELIVER                                               │
                                   │    TerritoryIQ "Visit Insights" (role tabs + map)       │
                                   │    Morning WhatsApp/email digest · instant alerts       │
                                   │    │                                                    │
                                   │ ⑤ LEARN                                                 │
                                   │    supervisor 1-tap corrections → new labels → retrain   │
                                   │    rep note-quality score → Training Program coaching   │
                                   └─────────────────────────────────────────────────────────┘
```

**Bronze / Silver / Gold** is the "medallion" pattern big data teams use. Raw data is never overwritten,
so we can always re-run everything with a better model, which is critical for re-segmenting the backlog.

## 2. ① Ingest: old transcripts and new ones, one pipeline

| Mode | What | How |
|---|---|---|
| **Backfill** | All historical transcripts (the "lot of data" you already have) | One-off job reads Frontier export or DB in batches of 1,000, writes to Bronze. Idempotent: re-running never duplicates (key = Frontier visit ID or hash of rep+time+customer). |
| **Incremental** | New visits | Scheduled job every 15 min pulls `updated_since=<last run>`; or a webhook if Frontier can call us later. Same code path as backfill. |
| **Re-segment** | When the model improves | Re-run ③ over Silver for all history; Gold keeps every version with `model_version`. |

Old and new data go through **exactly the same code**, so historical segments are comparable with today's.

## 3. ② Clean & enrich: where slang is handled

1. **Language detection** per sentence: English, Bengali, Hindi or mixed (Bengali/Hindi typed in English letters).
2. **Transliteration**: Bengali/Hindi script to Roman letters, so "দাম বেশি" and "dam beshi" become the same token.
3. **Slang lexicon** (`lexicon/slang_lexicon.csv`, 111 terms to start, `src/visit_intel/lexicon.py`):
   maps "dam beshi / rate zyada / mehenga" to COMPETITOR_PRICE, "baki / udhaar / dhar" to PAYMENT,
   "chhad dhalai / lenter" to SITE_PIPELINE, "maal nei / stock khatam" to STOCK_OUT, plus competitor brands
   and units (MT, quintal, bundle, sut).
   * Every term carries `review_status` (draft / verified / **ambiguous**). Ambiguous words like
     **"kal"** (tomorrow *or* yesterday) and **"Shyam"** (a brand *or* a person's name) are never trusted alone.
   * **The lexicon grows itself.** Weekly, the system lists frequent words it doesn't know. A sales
     manager tags them in 10 minutes, and they're added to the CSV. No code change is needed.
4. **Entity resolution**: match "Rahim Ali Mondal" and "Rohim Ali Mollya" to one customer using
   phone + fuzzy name + area. Flag invalid phones and phones shared across customers.
5. **Fact extraction**: quantity in MT (converting quintal and bundle), ₹ amounts, bar sizes,
   competitor brand, follow-up date (converting "kal" or "Friday" into a real date using the visit date),
   construction stage (foundation, column, lintel, roof).

## 4. ③ The segmentation brain: why 4 layers

No single algorithm is reliable on noisy multilingual sales notes. Layers are cheap-to-expensive, and each
one only handles what the previous one couldn't:

| Layer | What | Handles | Cost |
|---|---|---|---|
| **L1 Rules + lexicon** | Clear patterns: "5 MT order confirmed", "gaadi nahi aayi" | About 40–50% of notes with near-certain answers | Free, instant |
| **L2 ML classifier** | Multilingual sentence embeddings + the best model from the 29-model benchmark (`experiments/benchmark.py`), with **calibrated** probabilities | Most of the rest | Free after training |
| **L3 LLM judge** | Claude with strict JSON output, the segment definitions and 20 labelled examples | Only notes where L1 and L2 disagree or L2 confidence is below 0.8 | Small: paid only for about 10–20% of notes |
| **L4 Human review** | Supervisor sees the note plus the top 2 suggestions and taps one | Only where all layers disagree, or segments with high business impact (complaints, lost-to-competitor) | Minutes per day |

### "100% accurate": what is honestly achievable
No ML model is 100% accurate, and anyone who promises that is wrong. What we *can* guarantee:
* **Every segment shown to management is either machine-confident (≥ 90–95% measured precision) or
  human-confirmed.** Uncertain notes are never silently guessed. They go to L3 and L4.
* The share of notes needing a human **shrinks every month**, because every human correction becomes
  training data (**active learning**: we label the notes the model is *most confused* about, which
  improves accuracy fastest per label).
* Accuracy is **measured, not claimed**: a frozen "golden set" of 300 human-verified visits is re-scored
  after every retrain. A new model is only deployed if macro-F1 doesn't drop on it.

## 5. Segment design: hierarchical, the way this industry manages

A two-level tree is easier to get right than 25 flat segments. Level 1 alone is very accurate and is what
the MD needs; Level 2 gives managers detail.

| Level 1 (MD view) | Level 2 segments (VP / Supervisor view) |
|---|---|
| 💰 **Revenue** | Order Ready · Bulk / Project Deal · Government / Institution Lead · Reorder Due |
| 💸 **Cash** | Money to Collect · Credit Request · Payment Received · Credit Risk (cheque bounce, repeated delay) |
| ⚔️ **Market & Competition** | Lost to Competitor · Switch Risk · Won From Competitor · Price Objection · Local / Unbranded Steel Threat |
| 🏗️ **Demand Pipeline** | Upcoming Site Demand (by stage: foundation, column, lintel, roof) · New Opportunity · Construction Paused (rain, labour, funds, festival) |
| 🛠️ **Service & Supply** | Delivery Problem · Dealer Stock-Out · Quality Complaint (rust, cracking) · Quality Proof Asked · Technical Help |
| 🤝 **Relationship & Channel** | Happy Customer / Champion · Referral Given · Scheme / Gift Ask · Branding Needed · New Dealer Interest · Mason Training Interest |
| 🔍 **Visit Quality** | Visit With No Result · Bad / Unclear Recording · Suspicious Visit |

A visit can carry **1 primary + several flags** (multi-label), e.g. Order Ready + Credit Request + Quality Proof Asked.

### What TMT management actually watches
In this business (West Bengal: strong brands like Shyam, SRMB, Captain, Maithan, Rashmi, Kamdhenu, Tata, JSW,
plus cheap local rod), management's questions are almost always one of these:
1. **Tonnage**: how many MT this week vs target, and what's coming (site pipeline by stage)?
2. **Cash**: dealer outstanding, credit exposure, collection this week?
3. **Price**: where are we losing on rate, and to which brand?
4. **Influencers**: which masons and engineers are loyal, which are being poached?
5. **Channel**: which dealers are out of stock, growing, or going quiet?
6. **Service**: delivery delays and quality complaints, which kill repeat orders?
7. **Field force**: who produces results and who only produces visits?

Every Level 1 segment maps to one of these.

### Roll-up segments (computed daily from Gold, rules only, no ML)
* **Customer**: Champion · Sleeping Giant · At Risk · Lost · New & Growing · Price Hunter · Credit Hungry
* **Rep**: Star · Busy-No-Results · Poor Recorder · Comfort Zone · Suspicious Visits
* **Area** (on the TerritoryIQ map): Hot Zone · Competitor Stronghold · Untapped · Cooling

## 6. ④ Deliver: push, don't wait for logins

| Role | Channel | Contents |
|---|---|---|
| MD / ED | 7 am WhatsApp/email (5 lines) + TerritoryIQ | Tonnage, cash, top 3 red alerts, competitor heat |
| VP Sales | Digest + dashboard | Rep results, pipeline MT, competitor losses by area |
| Supervisor | Digest + **to-do list** | Follow-ups due, open complaints over 48h, notes to re-record |
| Business Analyst | Dashboard + CSV export | Trends, objection reasons, scheme impact |
| Data Analyst | Model-health page | F1 per segment, review queue, drift, lexicon gaps |
| Trainer | Weekly rep note-quality report | Who needs which training module |

**Instant alerts**: quality complaint, lost to competitor, bulk deal above 10 MT, cheque bounce.

## 7. ⑤ Learn: the two-way loop

* **Model loop:** corrections from L4 go to `labels_vN`, then a monthly retrain, then golden-set check, then deploy.
* **People loop:** each note gets a **Voice Note Quality Score (0–10)**, the same rubric as the training
  document (who, what, how much, which brand, when next, plus clarity). Reps under 5 for a week are assigned
  the matching training module, and their score trend shows whether training worked.

## 8. Technology choices

| Part | Choice | Why |
|---|---|---|
| Language | Python 3.11 | Best ML ecosystem |
| API | FastAPI | Fast, typed, auto-generated API docs |
| Database | PostgreSQL + **pgvector** | One database for data, labels, embeddings and similar-visit search |
| Jobs | Railway cron (later Celery/RQ + Redis) | Backfill, 15-min sync, nightly roll-ups, monthly retrain |
| Embeddings | `intfloat/multilingual-e5-small` or `paraphrase-multilingual-MiniLM-L12-v2` | Handles Bengali, Hindi and English; runs on CPU |
| Classifier | Best from the 29-model benchmark (likely Logistic Regression or LightGBM on embeddings) + calibration | Measured, not assumed |
| LLM judge | Claude (`claude-sonnet-5-5`), JSON schema output | Only for uncertain notes; names and phones removed first |
| Experiment tracking | MLflow | Which model, which data, which score |
| Front end | TerritoryIQ (Next.js), new "Visit Insights" section | Already deployed, already has login and the map |
| Hosting | Railway: `visit-intel-api`, `visit-intel-worker`, Postgres | Same project as TerritoryIQ; private network between services |

## 9. Data model (core tables)

```
raw_transcripts   (bronze)  frontier_visit_id PK, payload JSON, ingested_at, source
visits            (silver)  visit_id PK, rep_id, customer_id, visit_at, category, transcript_clean,
                            language_mix, lexicon_hits JSON, qty_mt, amount_inr, competitor[], follow_up_date
visit_segments    (gold)    visit_id, model_version, l1_segment, l2_segment, flags[], confidence,
                            risk_score, unclear_score, decided_by (rules|ml|llm|human), created_at
labels                      visit_id, segment, flags[], labeller, source (seed|review|golden), created_at
customer_segments           customer_id, segment, as_of_date
rep_scores                  rep_id, week, note_quality_avg, result_rate, suspicious_count
lexicon_terms               mirrors slang_lexicon.csv + who added/verified it
```

## 10. API (what TerritoryIQ and future Frontier integrations call)

| Endpoint | Purpose |
|---|---|
| `POST /v1/visits/segment` | Segment one visit (real time) |
| `POST /v1/jobs/backfill` | Start a historical batch run |
| `GET /v1/insights/{role}?from&to&area` | Data for each role tab |
| `GET /v1/review-queue` · `POST /v1/labels` | Human review and 1-tap correction |
| `GET /v1/reps/{id}/note-quality` | Training coaching data |
| `GET /v1/model/health` | F1 per segment, drift, review-queue size |
| `GET /health` | Railway health check |

## 11. Security and privacy
* Names and phones are personal data. They're stored in Postgres only, **hashed or removed before any
  LLM call**, and never in Git.
* API keys for every service; the ML API is reachable only on Railway's private network, with TerritoryIQ
  calling it server-side.
* Every segment records *who decided it* (rules, ML, LLM or human) and which model version, so it can be audited.

## 12. Build order

| Phase | Weeks | Deliverable | Done when |
|---|---|---|---|
| 0 | 1 | Export historical transcripts; verify the lexicon with 2 senior reps; label the 300-visit golden set | Golden set agreed by 2 people |
| 1 | 2–3 | Bronze/Silver pipeline + lexicon + extraction; backfill all history | Every historical visit cleaned |
| 2 | 3–5 | L1–L4 brain; benchmark on real data; calibrate thresholds | ≥ 90% precision on auto-labelled visits |
| 3 | 5–7 | FastAPI + Postgres on Railway; Visit Insights pages in TerritoryIQ | MD/VP/Supervisor tabs live |
| 4 | 7–8 | Morning digest, alerts, review queue, rep note-quality report | Supervisors act on the digest daily |
| 5 | Ongoing | Monthly retrain, lexicon growth, training program rollout, forecasting (MT per area) | Unclear notes below 10%; review queue shrinking |
