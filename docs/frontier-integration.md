# Connecting Frontier to TerritoryIQ

For the Frontier IT team. There are two independent connections:

| | What Frontier does | What it gets |
|---|---|---|
| **A. Send visits** | Posts each sales visit (with its transcript) to our API | Each visit is classified (order, complaint, competitor risk…) for head office |
| **B. Analytics tab** | Opens TerritoryIQ inside Frontier with a signed sign-in link | Users see the globe, market overview and visit insights without a second login |

Two secrets are sent **separately** (not in this document):

- `VISIT_INTEL_INGEST_KEY`, for A
- `FRONTIER_SSO_SECRET`, for B

Keep both on Frontier's **server** only, never in the mobile app or in browser code.

---

## A. Send visits

**Endpoints** (HTTPS, JSON):

| | Method and URL |
|---|---|
| One visit, sent when a visit is saved | `POST https://visit-intel-production.up.railway.app/v1/visits/segment` |
| Many visits (history, or catching up) | `POST https://visit-intel-production.up.railway.app/v1/visits/batch` with body `{"visits": [ ... ]}`, up to 1,000 per call |
| Connection test (no key needed) | `GET https://visit-intel-production.up.railway.app/health` |

**Header on every call:** `X-API-Key: <VISIT_INTEL_INGEST_KEY>`

This key can **only send** visits. It is refused on every other endpoint.

**A visit**, using Frontier's own column names:

```json
{
  "Visit ID": "FRONTIER-12345",
  "Sales Rep Name": "Rahul Das",
  "Visit Date": "31-10-2026",
  "Visit Time": "10:00:00 AM",
  "Customer Name": "Saha Traders",
  "Contact Person": "Ratan Saha",
  "Contact Number": "9000000000",
  "Visit Category": "DEALER",
  "Transcript / Remarks": "Dealer says rate is high, will order next week..."
}
```

- **Always send `Visit ID`.** Re-sending the same ID updates that visit rather than adding a duplicate, so retries are safe.
- **Dates:** `DD-MM-YYYY` with a 12-hour time, as above. ISO `YYYY-MM-DD HH:MM` also works.
- **Text:** send the Bengali and Hindi transcript as it is, in UTF-8.
- **Keep the rep's headline.** Reps are trained ([rep guides in Bengali, Hindi and English](rep-guide/)) to open every note
  with "Headline:" and one of 9 words (ORDER, PAYMENT, COMPETITOR, COMPLAINT, SITE, NEW CUSTOMER, ENGINEER, HAPPY,
  NO RESULT). If the transcript is summarised before sending, keep those opening words exactly, at the very start:
  they are the rep's own label for the visit and train the classifier.

**Responses:**

| Status | Meaning |
|---|---|
| `200` | The visit was stored and classified. The body holds the result. |
| `401` | The key is missing or wrong. |
| `422` | The transcript is empty or the JSON is invalid. |

On a network error or a `5xx` response, retry with backoff; it's safe because of `Visit ID`.

**What comes back.** The `200` response arrives within about a second, so Frontier can show it to the rep straight
after they save the visit. The fields worth using (the body has more, for our own screens):

```json
{
  "visit_key": "a1b2c3d4e5f6a7b8",
  "segment": { "code": "COMPETITOR_PRICE", "name": "Competitor / Price Fight", "group": "Market & Competition",
               "confidence": 0.85 },
  "urgency": { "level": "P1", "reason": "competitor price pressure" },
  "action": { "owner": "Supervisor", "text": "Ask the rep for brand and price; call the customer within 48h" },
  "note_quality": { "score": 9, "issues": [] },
  "rep_headline": { "word": "COMPETITOR", "segment": "COMPETITOR_PRICE" },
  "extracted": {
    "quantity": { "value_mt": 3.0 },
    "competitors": [ { "brand": "SRMB" } ],
    "follow_up": { "date": "2026-11-05" }
  },
  "needs_human_review": false
}
```

| Field | Meaning | Values |
|---|---|---|
| `segment.code` | What the visit was about | `HOT_ORDER`, `PAYMENT`, `COMPETITOR_PRICE`, `COMPLAINT_ESCALATE`, `SITE_PIPELINE`, `NEW_LEAD`, `TECH_SUPPORT`, `HAPPY_CUSTOMER`, `LOW_VALUE_VISIT`, `UNCLEAR_RECORDING` |
| `urgency.level` | How fast someone must act | `P0` same day, `P1` 24–48 hours, `P2` this week, `P3` for reports |
| `action` | Who should do what next | Free text |
| `note_quality.score` | How complete the rep's note is | 0–10 |
| `note_quality.issues` | What the note is missing | e.g. `"no tonnes or rupees"`, `"no next step with a date"`, `"brand not named"` |
| `rep_headline` | The headline the rep said, if any | `null` when the note does not start with "Headline:" |
| `extracted` | Tonnes, rupees, rival brands and the next date found in the note | Any part can be `null` |
| `needs_human_review` | The system was not sure; a supervisor will check it | `true` / `false` |

**Suggested feature in the Frontier app: a "note check" card.** Right after the rep saves a visit, show:

- the score as stars or a bar, e.g. "Your note: 9/10";
- each item in `note_quality.issues` as a tip, e.g. "Add the tonnes or rupees next time";
- the group and the next step, e.g. "Competitor / Price Fight · Supervisor will call within 48 hours";
- if `rep_headline` is `null`, a reminder: "Start your next note with Headline: and one of the 9 words".

This teaches reps the format from the [rep guides](rep-guide/) at the moment it matters, and better notes make the
classification more accurate for everyone.

**Try it:**

```bash
curl -X POST https://visit-intel-production.up.railway.app/v1/visits/segment \
  -H "X-API-Key: $VISIT_INTEL_INGEST_KEY" -H "Content-Type: application/json" \
  -d '{"Visit ID":"TEST-1","Sales Rep Name":"Test Rep","Visit Date":"03-11-2026","Visit Time":"11:00:00 AM","Customer Name":"Test Dealer","Contact Number":"9000000000","Visit Category":"DEALER","Transcript / Remarks":"Dealer says rate is high, will switch if not reduced."}'
```

Please tell us the `Visit ID` of any test visits, so we can delete them.

---

## B. Analytics tab inside Frontier

When a user opens the tab, Frontier's **server** creates a one-time link. The app then opens that link in a WebView (Android or iOS) or in an iframe (web).

```
https://territoryiq-production.up.railway.app/sso?token=<token>&next=/globe
```

**`next`: the page to open**

| `next` | Page |
|---|---|
| `/globe` | Globe and market overview |
| `/` | Territory overview |
| `/workspace` | 2D map |
| `/visit-insights` | Visit insights |

The link opens in **embed mode**: TerritoryIQ hides its own menu, so it sits inside Frontier's screen. Add `&embed=0` to open the full site instead, for example in a new browser tab.

**The token** is `<payload>.<signature>`, built on the server:

1. `payload`: this JSON, encoded as base64url without padding:
   `{"sub": "<user id>", "name": "<display name>", "role": "<role>", "iat": <now, unix seconds>, "exp": <now + 60>, "jti": "<random, 32 hex characters>"}`
2. `signature`: HMAC-SHA256 of the **payload string from step 1**, keyed with `FRONTIER_SSO_SECRET`, encoded as base64url without padding.

**Rules for the token:**

- **Lifetime:** 5 minutes at most. 60 seconds is recommended.
- **One use:** each token works once, so a copied link cannot be reused.
- **Roles:** for now only these roles can sign in: `HO`, `MD`, `ADMIN`. Tell us which role names Frontier uses. More roles (ASM, sales officer) will be added once TerritoryIQ limits each person to their own area.

**Python:**

```python
import base64, hashlib, hmac, json, secrets, time

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def territoryiq_link(user_id: str, name: str, role: str, secret: str, page: str = "/globe") -> str:
    now = int(time.time())
    payload = {"sub": user_id, "name": name, "role": role, "iat": now, "exp": now + 60, "jti": secrets.token_hex(16)}
    body = b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = b64url(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
    return f"https://territoryiq-production.up.railway.app/sso?token={body}.{sig}&next={page}"
```

**Node.js:**

```js
const crypto = require("crypto");

function territoryIqLink(user, secret, page = "/globe") {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: user.id, name: user.name, role: user.role, iat: now, exp: now + 60, jti: crypto.randomBytes(16).toString("hex") };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `https://territoryiq-production.up.railway.app/sso?token=${body}.${sig}&next=${encodeURIComponent(page)}`;
}
```

Java, Kotlin, PHP or another language: follow steps 1 and 2 above, using the platform's base64url encoder (no padding) and HMAC-SHA256.

**Opening the link:**

- **Mobile app (WebView):** load the link. Enable JavaScript and WebGL, which the globe needs, and keep cookies on.
- **Web app (iframe):** send us Frontier's web address, for example `https://frontier.example.com`. TerritoryIQ refuses to be framed by any other site. Add `&framed=1` to the link, so the sign-in cookie works inside the frame.

If the link is invalid or expired, the user sees "This sign-in link is not valid or has expired." Opening the tab again creates a fresh link.

---

## What we need from you

1. **App type:** is Frontier an Android or iOS app, a website, or both?
2. **Address:** if it's a website, its address, for the frame setting.
3. **Roles:** the role names Frontier uses, and which ones should see the Analytics tab.
4. **Test visits:** the `Visit ID` values of any test visits you send.
