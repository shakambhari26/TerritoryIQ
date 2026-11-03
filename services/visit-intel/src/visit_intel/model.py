"""Layer 2: the trained segment classifier. Train with `python scripts/train.py`."""
from __future__ import annotations

import json
import warnings
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.model_selection import LeaveOneOut, StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline

from .features import model_frame, text_features
from .taxonomy import SEGMENTS

# scikit-learn 1.6 passes an option newer SciPy no longer knows; harmless, but it floods the logs.
warnings.filterwarnings("ignore", message="Unknown solver options")


def _feature_label(name: str) -> str:
    block, _, feat = name.partition("__")
    if block == "words":
        return f'word "{feat}"'
    if block == "chars":
        return f'letters "{feat.strip()}"'
    if block == "cat":
        return "customer type " + feat.replace("visit_category_", "").replace("category_group_", "group ").replace("_", " ")
    if feat.startswith("kwdb_"):
        code = feat[5:].upper()
        return f"keyword score for {SEGMENTS[code][0] if code in SEGMENTS else code}"
    return f"keyword flag: {feat[3:].replace('_', ' ')} words"


def build() -> Pipeline:
    # Logistic Regression: top-3 in the 29-model benchmark and, unlike Ridge, gives probabilities for confidence.
    return Pipeline([("features", text_features()),
                     ("model", LogisticRegression(max_iter=2000, C=10, class_weight="balanced"))])


class SegmentModel:
    def __init__(self, pipeline: Pipeline, meta: dict):
        self.pipeline, self.meta = pipeline, meta

    @property
    def version(self) -> str:
        return self.meta["version"]

    def predict(self, visits: list[dict]) -> list[list[tuple[str, float]]]:
        probs = self.pipeline.predict_proba(model_frame(visits))
        classes = self.pipeline.classes_
        return [sorted(zip(classes, map(float, row)), key=lambda c: -c[1]) for row in probs]

    def contributions(self, visit: dict, segment: str, top: int = 6) -> dict:
        """Why the model leans to `segment`: the features that pushed its score up (or down) the most.

        Logistic regression scores each group as z_g = b_g + sum_j w_gj * x_j and turns scores into probabilities with
        softmax. Feature j's pull toward g, relative to an average group, is x_j * (w_gj - mean_k w_kj).
        """
        features, lr = self.pipeline.named_steps["features"], self.pipeline.named_steps["model"]
        classes = list(lr.classes_)
        if segment not in classes or lr.coef_.shape[0] != len(classes):
            return {"for": [], "against": []}
        x = features.transform(model_frame([visit])).tocsr()
        coef = lr.coef_
        rel = coef[classes.index(segment)] - coef.mean(axis=0)
        names = features.get_feature_names_out()
        pulls = sorted(((float(x.data[k] * rel[j]), names[j]) for k, j in enumerate(x.indices)), key=lambda p: -abs(p[0]))
        pretty = [{"feature": _feature_label(n), "pull": round(p, 3)} for p, n in pulls if abs(p) >= 0.005]
        return {"for": [p for p in pretty if p["pull"] > 0][:top], "against": [p for p in pretty if p["pull"] < 0][:3]}

    @classmethod
    def train(cls, visits: list[dict], labels: list[str]) -> "SegmentModel":
        X, y = model_frame(visits), np.array(labels)
        counts = {c: int((y == c).sum()) for c in np.unique(y)}
        smallest = min(counts.values())
        cv = LeaveOneOut() if len(y) < 200 or smallest < 3 else StratifiedKFold(n_splits=min(5, smallest), shuffle=True, random_state=42)
        held_out = cross_val_predict(build(), X, y, cv=cv)
        pipeline = build().fit(X, y)
        now = datetime.now(timezone.utc)
        meta = {
            "version": now.strftime("%Y%m%d-%H%M%S"),
            "trained_at": now.isoformat(timespec="seconds"),
            "algorithm": "TF-IDF (words + chars) + keyword flags -> Logistic Regression",
            "rows": len(y),
            "class_counts": counts,
            "cv": type(cv).__name__,
            "macro_f1": round(float(f1_score(y, held_out, average="macro", zero_division=0)), 3),
            "accuracy": round(float((held_out == y).mean()), 3),
            "per_class_f1": {c: round(float(f), 3) for c, f in zip(
                sorted(counts), f1_score(y, held_out, average=None, labels=sorted(counts), zero_division=0))},
        }
        return cls(pipeline, meta)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.pipeline, path)
        path.with_suffix(".json").write_text(json.dumps(self.meta, indent=2))

    @classmethod
    def load(cls, path: Path) -> "SegmentModel | None":
        if not path.exists():
            return None
        return cls(joblib.load(path), json.loads(path.with_suffix(".json").read_text()))
