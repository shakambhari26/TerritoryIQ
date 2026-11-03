# Visit Intelligence for Elegant Steel: Solution Guide

How we turn rep voice notes into segments that bosses, managers and analysts can act on.

---

## 1. The problem in one paragraph

Reps finish a visit and speak a note. Gemini turns the speech into text. Today that text just sits there.
Nobody reads 500 notes a day, and Gemini sometimes invents things. One note says a rep "visited the counter
for a medical check-up". Another describes visit *instructions* instead of what happened.
We want a second system that reads every note, **puts it in a box** (a segment), **flags bad notes**,
and shows each level of the company only the boxes it cares about.

## 2. What the 34 sample visits already tell us

| Finding | Example | Why it matters |
|---|---|---|
| Same phone number on different customers | `9XXXXXXXX1` is on 3 customers; 5 other numbers are shared by 2 | Either the app pre-fills phones or reps copy numbers. Customer history will get mixed up. |
| Invalid phone | `635800000` (9 digits) | Needs validation in the Frontier app, not in ML. |
| Same customer, two spellings | "Rahim Ali Mondal" and "Rohim Ali Mollya", same phone | We need customer matching ("entity resolution") before counting visits per customer. |
| Category doesn't match the text | Category DEALER, but the note says "Met with the Mason" | We can auto-flag this. |
| Transcript describes the audio, not the visit | "The audio mentions a payment follow-up." | Fix the Gemini prompt (see section 7). |
| Likely invented content | "medical check-up and store administration" | Our ML layer should score this as UNCLEAR. |
| Very vague notes | "visited the site for the purpose of ongoing site work" | Probably a lazy rep, not an AI problem. The supervisor should see this. |

**The honest truth:** 34 rows is enough to design the system but **not enough to train a reliable model**.
You need roughly **50 to 100 labelled examples per segment, about 1,000 visits in total**. Frontier already has
months of visits, so pull all of them (section 6).

## 3. The 10 segments (simple enough for anyone)

Every visit gets **one main segment** and optionally **one second segment**.

| # | Segment | In one line | Example from our data |
|---|---|---|---|
| 1 | 🟢 **Order Ready** | They are buying or about to buy | "Confirmed a 5 MT order and full payment today" |
| 2 | 💰 **Money to Collect** | Payment, outstanding or credit came up | "The audio mentions a payment follow-up" |
| 3 | ⚔️ **Competitor / Price Fight** | They use or compare a rival brand or price | "Concern regarding price per kg vs competitor" |
| 4 | 🔴 **Needs Boss Attention** | A complaint about delay, quality or service | "Concern about order delay" |
| 5 | 🏗️ **Upcoming Site Demand** | Construction is running or starting, so steel is needed soon | "Roof construction is starting today" |
| 6 | 🌱 **New Opportunity** | New customer, new site or new interest | "Prospect expressed strong interest, follow-up tomorrow" |
| 7 | 🔧 **Technical Help Needed** | An engineer, site check or tech support is needed | "Secondary support required from technical end" |
| 8 | ⭐ **Happy Customer / Champion** | Loyal or satisfied; ask for referrals | "12 project sites active, all on our brand" |
| 9 | 😴 **Visit With No Result** | Visit happened, nothing useful came out | "Visited the site for ongoing site work" |
| 10 | ❓ **Bad / Unclear Recording** | The note is vague, off-topic or invented | "Visited the counter for medical check-up" |

On top of segments, every visit also gets **flags**: follow-up needed (yes/no), quantity in MT, competitor
name if mentioned, and a **risk score** from 0 to 100.

### Why these 10, for a Kolkata TMT business

West Bengal's TMT market is crowded with strong local and national brands: Shyam Steel, SRMB, Captain Steel,
Maithan, Rashmi, Kamdhenu, Tata Tiscon and JSW Neosteel. Steel here is pulled by **masons and engineers**,
who tell house-builders which brand to buy, and pushed through **dealers and retailers**, who decide on
margin and credit. Rival brands publish district-by-district prices and court dealers with margin offers.
So the decisions Elegant must make every week are:

* where we are losing on **price or schemes** (segment 3),
* which **dealer** needs credit or collection (segment 2),
* which **mason** is a champion to reward or a defector to win back (segments 8 and 3),
* and where **site demand** is about to land (segment 5).

The 10 segments map directly to those decisions.

## 4. One screen per role (the new "Visit Insights" feature in Frontier)

### MD / ED: "Is the business healthy, and where must I step in?"
Shows: tonnage ordered and in pipeline this week, money collected vs pending, the **red list** (Needs Boss
Attention plus Competitor Fight with high risk), and a competitor heat map by area.
**Decisions:** approve a price or scheme response in an area, change credit policy for a dealer group,
personally call a key dealer who is complaining.

### VP Sales: "Which reps and areas are winning or losing?"
Shows: per-rep **result rate** (share of visits that are Order, Money, Site Demand or New Opportunity
vs. No Result), new-lead funnel (lead, then follow-up, then order), competitor losses by rep and area,
and the top champion masons.
**Decisions:** move reps between territories, set weekly targets, launch a mason or dealer scheme,
reward champions.

### Supervisor: "What must my team do today?"
Shows: a **to-do list**: follow-ups due today, complaints older than 48 hours, reps with 3+
"No Result" visits this week, and recordings to redo.
**Decisions:** call the rep, re-visit the customer, send technical help, ask the rep to re-record.

### Business Analyst: "Why is this happening?"
Shows: segment trends over weeks, segments by customer type (mason / dealer / retailer / IHB),
how often price is the objection, and whether schemes change the Competitor Fight rate.
**Decisions:** recommend pricing, scheme design, which customer type to focus on, and product mix.

### Data Analyst: "Can we trust the data and the model?"
Shows: data-quality dashboard (invalid or shared phones, category mismatches, unclear recordings per
rep), model accuracy (F1 per segment), low-confidence predictions waiting for review, and drift
(this week's notes look different from training data).
**Decisions:** retrain the model, fix the Gemini prompt, add validation to the Frontier form, label more data.

## 5. Machine learning in plain words

### First: three different jobs, three different tools

| Job | Plain meaning | Needs answers ("labels") to learn? | How we measure it |
|---|---|---|---|
| **Classification** | Put each visit in one of our 10 boxes | Yes. We show it labelled examples. | **Accuracy, F1 score** |
| **Clustering** | Let the computer find its own groups, and we look at what they are | No | Silhouette score, plus a human checking whether the groups make sense |
| **Regression** | Predict a *number*, e.g. "how many MT will this site order?" | Yes | Error in MT (MAE) |

**Important:** F1 score only exists for classification. K-Means has no F1, because it doesn't know our 10
boxes; it invents its own groups. So the plan is:
* **Clustering = discovery.** Run it first on all historical notes to see whether our 10 segments are the
  right ones. Maybe it finds an 11th, like "delivery/transport issues".
* **Classification = the product.** Train it to put each new visit in our 10 boxes, and compare
  algorithms by F1.

### Step zero: computers can't read, so text becomes numbers
* **TF-IDF**: counts important words. Fast, simple, works well for short notes.
* **Sentence embeddings**: a small AI model turns each note into numbers that capture *meaning*, so
  "price is high" and "rate too much" land close together. Use a multilingual model
  (`paraphrase-multilingual-MiniLM-L12-v2` or `intfloat/multilingual-e5-small`) because reps mix
  Bengali, Hindi and English.

### The algorithms to test

| Algorithm | Layman explanation | Good for us? |
|---|---|---|
| **Logistic Regression** | Weighs each word for or against each box | ✅ Strong baseline; often wins on short text |
| **Linear SVM** | Draws the cleanest line between boxes | ✅ Usually the best on TF-IDF text |
| **Naive Bayes** | Counts which words show up in which box | ✅ Fast baseline, works with little data |
| **Decision Tree** | A flowchart of yes/no questions | ⚠️ Easy to explain but weak alone |
| **Random Forest** | 500 flowcharts vote | ✅ Good on embeddings plus flags |
| **XGBoost / LightGBM** | Flowcharts that learn from each other's mistakes | ✅ Often the most accurate on structured features |
| **K-Nearest Neighbors** | "Find the 5 most similar past visits and copy their box" | ✅ Good with embeddings, and easy to explain ("similar to these visits") |
| **K-Means** | Split notes into K groups by similarity | 🔍 Discovery only |
| **HDBSCAN** | Finds groups of any shape and marks odd notes as "noise" | 🔍 Discovery, and very good at finding hallucinated or odd notes |
| **Isolation Forest** | Spots notes that look unusual | 🔍 For the "Bad / Unclear Recording" flag |
| **LLM zero-shot (Claude/Gemini with strict JSON)** | Ask an AI to pick the box, with rules | ✅ Use to *pre-label* data, and as a comparison |

**My recommendation:** a **hybrid**. Clear keyword rules catch the obvious cases ("5 MT order"), an
embeddings model plus classifier (likely Logistic Regression or LightGBM) handles the rest, and anything with
low confidence goes to a human review queue. That combination beats any single algorithm, and every
decision can be explained.

### How we test fairly
* **Macro-F1** is the main score. It treats rare boxes like "Needs Boss Attention" as equally important as
  common ones. Accuracy alone lies when one box is 40% of the data.
* **Stratified 5-fold cross-validation**: test on 5 different slices so one lucky split doesn't fool us.
* A **confusion matrix** shows which boxes get mixed up (e.g. Site Demand vs New Opportunity).
* Per-class precision and recall. For "Needs Boss Attention", **recall** matters most: missing a complaint
  is worse than a false alarm.

## 6. How to get enough labelled data (the real bottleneck)

1. Export **all** historical visits from Frontier (aim for 3,000+).
2. **Pre-label with an LLM** (Claude or Gemini, strict JSON, the 10 segment definitions plus examples).
3. Humans review a random 300 to 500. Have a sales supervisor and an analyst both label 100 of the same
   visits and check agreement. If two humans agree only 70% of the time, no model will reach 95%.
4. Train classical models on the reviewed data and compare F1 against the LLM labels.
5. Every week, low-confidence predictions are reviewed, and the model is retrained monthly.

## 7. About the hallucination problem (be realistic)

ML after the fact can **detect** bad notes but can't recover what was really said. The biggest fixes are upstream:
* Ask Gemini for **two outputs**: (a) a verbatim transcript in the original language, and (b) a structured
  summary in JSON with fixed fields (customer type, order MT, payment, competitor, complaint, follow-up date).
  Tell it to output `null` when something wasn't said, never to guess.
* **Keep the audio file** and the verbatim transcript, so a supervisor can check a flagged visit.
* Our service then cross-checks: is the category consistent with the text? Is the quantity plausible? Is the
  phone valid and unique? Does the note sound like a template?

## 8. Architecture options

| Option | What it is | When |
|---|---|---|
| **A. Notebook + Excel** | Python scripts that train and print F1 scores and write an Excel file | **Week 1 to 2: now** |
| **B. FastAPI service** ✅ | A small web service. Frontier sends a visit note; it returns segment, confidence, flags and risk. Results are stored in Postgres. A simple dashboard shows the role views. | **Week 3 to 6** |
| **C. Full MLOps** | Adds a job queue, scheduled retraining, model registry (MLflow) and drift monitoring | When more than about 5,000 visits a month |

```
Rep speaks ─► Frontier app ─► Gemini (speech → text + JSON)
                    │
                    ▼  POST /v1/visits/classify
            Visit Intelligence API (FastAPI, Python)
              ├─ cleaning + validation (phone, category, names)
              ├─ rules (obvious cases)
              ├─ embeddings + classifier (10 segments + confidence)
              ├─ anomaly score (bad/unclear recording)
              └─ save to Postgres
                    │
                    ▼  GET /v1/insights/{role}
            "Visit Insights" tab in Frontier (MD · VP Sales · Supervisor · BA · Data)
```

Railway is already used for TerritoryIQ, so the FastAPI service can be deployed there too.

## 9. Data privacy

The dataset holds real names and phone numbers. Keep `data/` out of public Git repos, hash phone numbers
before training (the model doesn't need them), and don't send personal data to third-party AI APIs
without your company's approval.

---
Sources: [SRMB Steel – TMT brand West Bengal](https://www.srmbsteel.com/tmt-brand-west-bengal) ·
[SRMB – dealership in West Bengal](https://www.srmbsteel.com/tmt-dealership-west-bengal-why-choose-srmb-and-what-to-know) ·
[Shyam Steel – West Bengal retail prices](https://shyamsteel.com/retail-price/west-bengal/) ·
[Captain Steel](https://captainsteel.com/pages/best-tmt-bar-manufacturer-in-india) ·
[Tata Nexarc – TMT bars in West Bengal](https://www.tatanexarc.com/steel/tmt-bars/tmt-bars-in-west-bengal/) ·
[Infralens – Kolkata steel prices](https://infralens.in/prices/steel/kolkata)
(Market claims are from the brands' own pages and are unverified.)
