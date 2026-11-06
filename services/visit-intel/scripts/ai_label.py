"""AI-label every visit with Claude, accurately, at scale — with human override kept intact.

Why this exists
---------------
The segment model and keyword lexicon were trained on long Bengali/Hindi voice-note
transcripts. The real Elegant API delivers short English *summaries*, a different
distribution, so on real data the pipeline sends ~50% of visits to human review and its
measured accuracy no longer holds. We have no hand labels on this distribution to retrain
on. This script closes that gap: Claude reads each real visit and assigns one of the 10
segments, so every visit gets a confident label instead of a review backlog.

How it stays honest and safe
----------------------------
* AI labels are written with labeller "ai:<model>". In the pipeline a human label ALWAYS
  beats an AI label (db.latest_label), so a supervisor's correction is never overwritten by
  a later AI pass — manual override is first-class.
* AI labels show as decided_by="ai" (not "human"), so the provenance is never disguised.
* Nothing contaminates the accuracy metric: scripts/evaluate.py scores only the CSV gold
  set, never DB labels. To *train* on the AI labels (distillation), opt in explicitly with
  `scripts/train.py --with-db-labels`.
* The costly review cases are handled first with --review-only.

Model & cost
------------
Defaults to the service's VISIT_INTEL_AI_MODEL (claude-opus-5-5) for accuracy. Uses the
**Message Batches API** (async, ~50% cheaper) — right for 12k–25k visits. Pass --model
claude-sonnet-5-5 (or claude-haiku-5-5) to cut cost; --dry-run prints a token/cost estimate
on a sample and submits nothing.

Usage
-----
  export ANTHROPIC_API_KEY=...
  python scripts/ai_label.py --dry-run --limit 50          # estimate cost, write nothing
  python scripts/ai_label.py --review-only                 # label the ~50% review backlog first
  python scripts/ai_label.py --all                         # label every visit without a human label
  python scripts/ai_label.py --collect <batch_id>          # resume: fetch a submitted batch's results
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

import anthropic  # noqa: E402
from anthropic.types.messages.batch_create_params import Request  # noqa: E402
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from visit_intel import config  # noqa: E402
from visit_intel.ask import AI_MODEL  # noqa: E402
from visit_intel.db import Analysis, Label, SessionLocal, Visit, init_db  # noqa: E402
from visit_intel.model import SegmentModel  # noqa: E402
from visit_intel.service import reanalyze  # noqa: E402
from visit_intel.taxonomy import SEGMENTS  # noqa: E402

VALID = set(SEGMENTS)  # the 10 segment codes
PRICING = {  # $ per 1M tokens (batch = 50% of these), input/output
    "claude-opus-5-5": (4.0, 20.0), "claude-sonnet-5-5": (2.0, 10.0), "claude-haiku-5-5": (0.10, 0.50),
}

SYSTEM = (
    "You classify a single sales-visit note from a TMT steel-bar field sales team in West Bengal, India. "
    "The note is a short English summary of what happened on the visit (often one or two sentences). "
    "Assign exactly ONE segment from this list, by its CODE:\n\n"
    + "\n".join(f"- {code}: {name} — {meaning}" for code, (name, _emoji, _grp, meaning) in SEGMENTS.items())
    + "\n\nGuidance:\n"
    "- Judge the business outcome of the visit, not the customer type.\n"
    "- HOT_ORDER = an order is placed or imminent. SITE_PIPELINE = construction demand coming. "
    "NEW_LEAD = a new customer/site/interest. PAYMENT = money/credit/collection. "
    "COMPETITOR_PRICE = a rival brand or price fight. COMPLAINT_ESCALATE = a complaint about delay/quality/service. "
    "TECH_SUPPORT = engineer/site-check/technical help. HAPPY_CUSTOMER = clearly satisfied/loyal. "
    "LOW_VALUE_VISIT = a courtesy/greeting visit with no real business outcome. "
    "UNCLEAR_RECORDING = too vague, off-topic, or likely invented to judge.\n"
    "- A short generic note like 'discussed products' with no outcome is LOW_VALUE_VISIT, not a guess at something richer.\n\n"
    "Respond with ONLY a JSON object, no prose: "
    '{"segment": "<CODE>", "confidence": <0.0-1.0>, "reason": "<≤12 words>"}'
)

STATE_DIR = ROOT / "data" / "ai_labels"


def target_visits(review_only: bool, limit: int | None, refresh: bool) -> list[dict]:
    """Visits to label: those with no human label. Skip ones already AI-labelled unless --refresh.
    --review-only keeps just the visits the pipeline currently sends to human review."""
    out = []
    with SessionLocal() as s:
        rows = s.execute(select(Visit, Analysis).join(Analysis, Analysis.visit_key == Visit.visit_key)).all()
        for v, a in rows:
            labels = s.scalars(select(Label).where(Label.visit_key == v.visit_key)).all()
            if any(not (lb.labeller or "").startswith("ai:") for lb in labels):
                continue  # a human has labelled this — never touch it
            if labels and not refresh:
                continue  # already AI-labelled
            if review_only and not a.result.get("needs_human_review"):
                continue
            if not (v.transcript or "").strip():
                continue
            out.append({"visit_key": v.visit_key, "transcript": v.transcript,
                        "category": v.visit_category, "customer": v.customer_name})
    return out[:limit] if limit else out


def build_request(v: dict, model: str) -> Request:
    user = (f"Visit category: {v['category'] or 'unknown'}\nCustomer: {v['customer'] or 'unknown'}\n"
            f"Note: {v['transcript']}")
    return Request(
        custom_id=v["visit_key"],
        params=MessageCreateParamsNonStreaming(
            model=model,
            max_tokens=200,
            output_config={"effort": "low"},  # classification: no deep reasoning needed
            system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
        ),
    )


def parse_label(text: str) -> tuple[str, float, str] | None:
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        return None
    try:
        d = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    seg = str(d.get("segment", "")).strip().upper()
    if seg not in VALID:
        return None
    try:
        conf = float(d.get("confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    return seg, max(0.0, min(1.0, conf)), str(d.get("reason", ""))[:200]


def apply_results(client: anthropic.Anthropic, batch_id: str, model: str, min_conf: float) -> dict:
    labeller = f"ai:{model}"
    applied = skipped_lowconf = errored = invalid = 0
    keys_to_refresh: list[str] = []
    with SessionLocal() as s:
        for r in client.messages.batches.results(batch_id):
            if r.result.type != "succeeded":
                errored += 1
                continue
            text = next((b.text for b in r.result.message.content if b.type == "text"), "")
            parsed = parse_label(text)
            if not parsed:
                invalid += 1
                continue
            seg, conf, _reason = parsed
            if conf < min_conf:
                skipped_lowconf += 1  # leave to the normal pipeline / human review
                continue
            # one AI label per visit: drop any prior AI label, keep human labels untouched
            s.execute(delete(Label).where(Label.visit_key == r.custom_id, Label.labeller.startswith("ai:")))
            s.add(Label(visit_key=r.custom_id, segment=seg, urgency=None, labeller=labeller))
            keys_to_refresh.append(r.custom_id)
            applied += 1
        s.commit()
    # re-run analysis for the relabelled visits so the dashboard reflects the AI label
    model_obj = SegmentModel.load(config.MODEL_PATH)
    for i in range(0, len(keys_to_refresh), 500):
        with SessionLocal() as s:
            reanalyze(s, model_obj, keys_to_refresh[i:i + 500])
    return {"applied": applied, "skipped_lowconf": skipped_lowconf, "errored": errored, "invalid": invalid}


def estimate(client: anthropic.Anthropic, visits: list[dict], model: str) -> None:
    sample = visits[:50]
    reqs = [build_request(v, model) for v in sample]
    tin = tout = 0
    for req in reqs[:10]:
        p = req["params"]
        ct = client.messages.count_tokens(model=model, system=p["system"], messages=p["messages"])
        tin += ct.input_tokens
    avg_in = tin / max(1, min(10, len(reqs)))
    avg_out = 40  # ~40 output tokens for the small JSON
    pin, pout = PRICING.get(model, (4.0, 20.0))
    n = len(visits)
    cost = (avg_in * n * pin + avg_out * n * pout) / 1_000_000 * 0.5  # batch = 50%
    print(f"[dry-run] model={model}  visits={n}  ~{avg_in:.0f} in + {avg_out} out tok/visit")
    print(f"[dry-run] estimated batch cost: ${cost:,.2f}  (first-party rates; cache reduces input further)")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--all", action="store_true", help="label every visit without a human label (default)")
    g.add_argument("--review-only", action="store_true", help="label only visits the pipeline sends to review")
    p.add_argument("--collect", metavar="BATCH_ID", help="resume: fetch and apply an already-submitted batch")
    p.add_argument("--model", default=AI_MODEL, help=f"Claude model (default {AI_MODEL})")
    p.add_argument("--limit", type=int, help="cap the number of visits (testing)")
    p.add_argument("--refresh", action="store_true", help="re-label visits that already have an AI label")
    p.add_argument("--min-confidence", type=float, default=0.0,
                   help="skip applying AI labels below this confidence (they stay in review)")
    p.add_argument("--dry-run", action="store_true", help="estimate cost on a sample, submit nothing")
    args = p.parse_args()

    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        sys.exit("Set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) first.")
    init_db()
    client = anthropic.Anthropic()

    if args.collect:
        print(f"Collecting batch {args.collect} …")
        print(apply_results(client, args.collect, args.model, args.min_confidence))
        return

    visits = target_visits(args.review_only, args.limit, args.refresh)
    print(f"Visits to label: {len(visits)}  (model={args.model}, review_only={args.review_only})")
    if not visits:
        return
    if args.dry_run:
        estimate(client, visits, args.model)
        return

    requests = [build_request(v, args.model) for v in visits]
    batch = client.messages.batches.create(requests=requests)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    (STATE_DIR / f"{batch.id}.json").write_text(json.dumps({"id": batch.id, "count": len(requests), "model": args.model}))
    print(f"Submitted batch {batch.id} with {len(requests)} visits. Polling (Ctrl-C is safe — resume with --collect {batch.id}).")

    while True:
        b = client.messages.batches.retrieve(batch.id)
        if b.processing_status == "ended":
            break
        done = sum(getattr(b.request_counts, k, 0) for k in ("succeeded", "errored", "canceled", "expired"))
        print(f"  … {b.processing_status}: {done}/{len(requests)} done")
        time.sleep(15)
    print("Batch ended. Applying labels …")
    print(apply_results(client, batch.id, args.model, args.min_confidence))


if __name__ == "__main__":
    main()
