# Visit Intelligence: Prediction API (v1)

Send the text of a sales visit. You get back the business segment it belongs to, how sure the model is, the other
segments it considered, an urgency level (P0–P3), flags, a recommended next action, and the facts found in the text
(tonnes, amounts, follow-up date, competitors). Text can be English, Bengali or Hindi, in Roman or native script.

The API is **stateless**: nothing you send is stored. The only thing logged per call is your caller name and the
number of visits, never the text.

| | |
|---|---|
| Base URL | `https://visit-intel-production.up.railway.app` |
| Authentication | Header `X-API-Key: <your key>` on every prediction call |
| Interactive docs | [`/docs`](https://visit-intel-production.up.railway.app/docs) (try calls in the browser with your key) |
| Machine-readable contract | [`/openapi.json`](https://visit-intel-production.up.railway.app/openapi.json) (OpenAPI 3.1; generate a client from it) |

## 1. Quick start

```bash
export VI_KEY='<your key>'
curl -sS -X POST https://visit-intel-production.up.railway.app/v1/predict \
  -H "X-API-Key: $VI_KEY" -H "Content-Type: application/json" \
  -d '{"id":"visit-8841","transcript":"Dealer confirmed a 5 MT order and full payment today.","visit_category":"DEALER","visit_date":"03-11-2026"}'
```

A `200` with a JSON body (section 5) means your key and network path work.

## 2. Keep the key on your server

* Call the API **from your back end** (server, serverless function, job), never from browser or mobile-app code: anything
  shipped to a browser can be read by its users. The API does not allow cross-origin browser calls.
* Store the key in an environment variable or secret manager, not in source control.
* One key per consuming application. If a key leaks, tell us: we revoke it and issue a new one, without affecting anyone else.

## 3. Endpoints

| Method and path | Key | What it does |
|---|---|---|
| `POST /v1/predict` | yes | Classify one visit |
| `POST /v1/predict/batch` | yes | Classify 1–200 visits in one call; results come back in the same order |
| `GET /v1/taxonomy` | no | Every segment, urgency level (with its SLA) and flag the API can return |
| `GET /health` | no | Liveness, and the version of the model in use |

Add `?detail=true` to either predict call to also get `evidence` (what each method said) and `explanation`
(step-by-step reasoning). Responses are several times larger, so use it for debugging or audit screens only.

## 4. Request

`POST /v1/predict` takes one visit; `POST /v1/predict/batch` takes `{"visits": [ <visit>, ... ]}`.

| Field | Required | Rules | Notes |
|---|---|---|---|
| `transcript` | **yes** | 1–8000 characters, not only spaces | The visit notes / voice-note transcript |
| `id` | no | up to 64 characters | Your own reference, echoed back unchanged. Use it to match batch results |
| `visit_category` | no | up to 40 characters | `DEALER`, `RETAILER`, `MASON`, `NEW MASON`, `ENGINEER`, `INFLUENCER` or `IHB`. Improves accuracy |
| `visit_date` | no | a real date, `DD-MM-YYYY` | Lets "tomorrow" or "next week" be turned into a calendar date |
| `visit_time` | no | up to 20 characters | e.g. `11:13:00 AM` |
| `customer_name` | no | up to 200 characters | Only used for the note-quality score |
| `contact_number` | no | up to 20 characters | Only checked for a valid 10-digit Indian mobile (`PHONE_INVALID` flag) |

Unknown fields are ignored. The whole request body may be at most 2,000,000 bytes.

## 5. Response

```json
{
  "id": "visit-8841",
  "segment": {
    "code": "HOT_ORDER", "name": "Order Ready", "emoji": "🟢", "group": "Revenue",
    "meaning": "Customer is ordering or about to order",
    "confidence": 0.9, "decided_by": "rules+ml",
    "secondary": {"code": "PAYMENT", "name": "Money to Collect", "emoji": "💰", "group": "Cash",
                  "meaning": "Payment, outstanding or credit discussed"}
  },
  "alternatives": [
    {"code": "PAYMENT", "name": "Money to Collect", "probability": 0.12, "source": "ml"},
    {"code": "NEW_LEAD", "name": "New Opportunity", "probability": 0.04, "source": "ml"}
  ],
  "urgency": {"level": "P2", "reason": "routine business follow-up"},
  "flags": ["FOLLOW_UP", "PAYMENT_RECEIVED"],
  "sentiment": "NEUTRAL",
  "action": {"playbook_id": "PB-20", "owner": "Field rep",
             "text": "Confirm delivery date and payment terms with the customer; update Frontier"},
  "needs_human_review": false,
  "note_quality": {"score": 8, "parts": {"who": 1, "what": 2, "how_much": 2, "brand": 0, "when": 2, "clarity": 1},
                   "issues": ["brand not named"]},
  "extracted": {
    "quantity": {"value_mt": 5.0, "evidence": "Dealer confirmed a 5 MT order"},
    "amount": null, "percent_paid": null, "competitors": [], "grade": null, "sizes_mm": [],
    "construction_stage": null,
    "follow_up": {"date": "2026-11-03", "evidence": "today", "ambiguous": false}
  },
  "model_version": "20261102-120722"
}
```

| Field | Meaning |
|---|---|
| `segment.code` | The predicted business segment. **Branch on this stable code**, never on `name` (wording may change) |
| `segment.confidence` | 0–1, how sure the deciding method was. Not a calibrated probability across all cases |
| `segment.decided_by` | `rules`, `keywords`, `ml`, a combination such as `rules+ml`, or `uncertain` |
| `segment.secondary` | A second topic the visit also touched, or `null` |
| `alternatives[]` | Up to 3 other segments the model considered, most likely first (may be empty). `source` is `ml` (the trained model) or `keywords` |
| `urgency.level` | `P0` act today … `P3` routine. Each level's SLA is in `/v1/taxonomy` |
| `flags[]` | Stable codes such as `FOLLOW_UP`, `PAYMENT_RECEIVED`, `PHONE_INVALID`; full list in `/v1/taxonomy` |
| `sentiment` | `POSITIVE`, `NEUTRAL` or `NEGATIVE` |
| `action` | The recommended next step from the business playbook, and who owns it |
| `needs_human_review` | **If true, show a person before acting automatically.** The methods disagreed or none was sure; the best guess is still returned |
| `note_quality` | 0–10 completeness of the note, its parts, and what is missing |
| `extracted` | Facts found in the text, each with the words it came from (`evidence`). Absent facts are `null` or `[]` |
| `model_version` | Which trained model answered. Store it with each result: it changes when the model is retrained |

Batch response: `{"count": 2, "results": [ <same object as above>, ... ]}`, in request order.

## 6. Examples

### cURL: batch

```bash
curl -sS -X POST https://visit-intel-production.up.railway.app/v1/predict/batch \
  -H "X-API-Key: $VI_KEY" -H "Content-Type: application/json" \
  -d '{"visits":[
        {"id":"a1","transcript":"Payment of 2 lakh is outstanding, will collect tomorrow.","visit_date":"03-11-2026"},
        {"id":"a2","transcript":"Customer asked for a price cut, otherwise will buy from a competitor.","visit_category":"RETAILER"}
      ]}'
```

### JavaScript (`fetch`, Node.js 18+ or any server runtime)

```js
const BASE = "https://visit-intel-production.up.railway.app";

export async function predictVisit(visit, { detail = false, retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}/v1/predict${detail ? "?detail=true" : ""}`, {
      method: "POST",
      headers: { "X-API-Key": process.env.VISIT_INTEL_PREDICT_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(visit),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(`Visit Intelligence ${res.status}: ${JSON.stringify((await res.json().catch(() => ({}))).detail)}`);
    }
    const wait = Number(res.headers.get("Retry-After")) || 2 ** attempt;   // seconds
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

// const p = await predictVisit({ id: "visit-8841", transcript: "Dealer confirmed a 5 MT order", visit_category: "DEALER" });
// if (p.needs_human_review) { /* queue for a person */ } else if (p.segment.code === "HOT_ORDER") { /* ... */ }
```

### Python (`requests`)

```python
import os, time
import requests

BASE = "https://visit-intel-production.up.railway.app"
session = requests.Session()
session.headers.update({"X-API-Key": os.environ["VISIT_INTEL_PREDICT_KEY"]})

def predict(visit: dict, detail: bool = False, retries: int = 3) -> dict:
    for attempt in range(retries + 1):
        r = session.post(f"{BASE}/v1/predict", params={"detail": "true"} if detail else None, json=visit, timeout=30)
        if r.ok:
            return r.json()
        if r.status_code != 429 and r.status_code < 500 or attempt == retries:
            r.raise_for_status()
        time.sleep(int(r.headers.get("Retry-After") or 2 ** attempt))

def predict_many(visits: list[dict]) -> list[dict]:
    """Any number of visits, sent 200 at a time; results in the same order."""
    out = []
    for i in range(0, len(visits), 200):
        r = session.post(f"{BASE}/v1/predict/batch", json={"visits": visits[i:i + 200]}, timeout=120)
        r.raise_for_status()
        out.extend(r.json()["results"])
    return out

p = predict({"id": "visit-8841", "transcript": "Dealer confirmed a 5 MT order", "visit_category": "DEALER"})
print(p["segment"]["code"], p["segment"]["confidence"], p["urgency"]["level"], p["model_version"])
```

## 7. Errors

Every error body is JSON with a `detail` field.

| Status | Meaning | What to do |
|---|---|---|
| `401` | Missing or wrong `X-API-Key` | Check the header name and key; do not retry |
| `413` | Body larger than 2,000,000 bytes | Send fewer visits per batch |
| `422` | The body does not match the schema. `detail` is a list naming each bad field, e.g. `{"loc": ["body","visit_date"], "msg": "visit_date must be a real date written DD-MM-YYYY…"}`. In a batch, one bad visit rejects the whole call | Fix the request; do not retry unchanged |
| `429` | Over your allowance (section 8) | Wait `Retry-After` seconds, then retry |
| `503` | The prediction API is temporarily switched off | Retry later with backoff; contact us if it persists |
| `5xx` | Our side | Retry with exponential backoff (1 s, 2 s, 4 s…) |

## 8. Rate limits

Each key has a **visits-per-minute** allowance over a sliding 60-second window (default 600; a batch of *n* visits
counts as *n*). Every successful response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Over the limit you
get `429` with `Retry-After` (seconds). A single batch larger than your whole allowance gets `429` without
`Retry-After`, because waiting would not help: split it. Rejected calls (401, 422, 429) use none of your allowance.
Ask us if you need a higher limit.

## 9. Versioning and stability

* Everything under `/v1` only ever **gains optional fields**. Ignore fields you do not recognise.
* Codes (`segment.code`, `urgency.level`, `flags[]`) are stable; new codes may be added, so handle unknown codes gracefully.
* Anything that could break you ships under `/v2`, announced in advance.
* `model_version` changes when the model is retrained; predictions for the same text may change with it.

## 10. Health check

`GET /health` needs no key: `{"ok": true, "model": "20261102-120722"}`. Use it for uptime monitoring, not before every call.
