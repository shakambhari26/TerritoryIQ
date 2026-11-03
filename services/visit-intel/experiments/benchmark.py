"""Compare 25+ classifiers on the visit segments, plus elbow method and learning curve.

Usage:  python experiments/benchmark.py
Output: reports/benchmark.csv, reports/benchmark.md, reports/elbow.png,
        reports/learning_curve.png, reports/confusion_best.png
"""
import os
import sys
import time
import warnings
from pathlib import Path

os.environ["PYTHONWARNINGS"] = "ignore"  # also silences the parallel worker processes

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, ClassifierMixin, clone
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.decomposition import TruncatedSVD
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import (AdaBoostClassifier, BaggingClassifier, ExtraTreesClassifier,
                              GradientBoostingClassifier, HistGradientBoostingClassifier,
                              RandomForestClassifier, StackingClassifier, VotingClassifier)
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import (LogisticRegression, PassiveAggressiveClassifier, Perceptron,
                                  RidgeClassifier, SGDClassifier)
from sklearn.metrics import (ConfusionMatrixDisplay, accuracy_score, balanced_accuracy_score,
                             f1_score, silhouette_score)
from sklearn.model_selection import LeaveOneOut, cross_val_predict
from sklearn.naive_bayes import BernoulliNB, ComplementNB, GaussianNB, MultinomialNB
from sklearn.neighbors import KNeighborsClassifier, NearestCentroid
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import FunctionTransformer, LabelEncoder, OneHotEncoder
from sklearn.svm import SVC, LinearSVC
from sklearn.tree import DecisionTreeClassifier, ExtraTreeClassifier
from lightgbm import LGBMClassifier
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data/processed/visits_dataset.csv"
REPORTS = ROOT / "reports"
SEED = 42
sys.path.insert(0, str(ROOT / "src"))
from visit_intel.features import KW_COLS, text_features as features  # noqa: E402

class RulesBaseline(BaseEstimator, ClassifierMixin):
    """Keyword rules in priority order; what a non-ML system would do."""
    RULES = [("kw_meta_text", "UNCLEAR_RECORDING"), ("kw_competitor", "COMPETITOR_PRICE"),
             ("kw_complaint", "COMPLAINT_ESCALATE"), ("kw_order", "HOT_ORDER"),
             ("kw_payment", "PAYMENT"), ("kw_satisfaction", "HAPPY_CUSTOMER"),
             ("kw_technical", "TECH_SUPPORT"), ("kw_new", "NEW_LEAD"), ("kw_site", "SITE_PIPELINE")]

    def fit(self, X, y):
        self.classes_ = np.unique(y)
        return self

    def predict(self, X):
        out = []
        for _, row in X.iterrows():
            label = next((seg for col, seg in self.RULES if row[col] == 1), "LOW_VALUE_VISIT")
            out.append(label)
        return np.array(out)


class XGBAnyLabels(XGBClassifier):
    """XGBoost insists labels are 0..n-1; a fold missing a rare class breaks that, so re-encode per fit."""

    def fit(self, X, y, **kw):
        self._labels, y = np.unique(y, return_inverse=True)
        return super().fit(X, y, **kw)

    def predict(self, X):
        return self._labels[super().predict(X).astype(int)]


DENSE = FunctionTransformer(lambda X: X.toarray() if hasattr(X, "toarray") else X, accept_sparse=True)


def sparse(model):
    return Pipeline([("features", features()), ("model", model)])


def dense(model, svd=None):
    steps = [("features", features())]
    steps.append(("svd", TruncatedSVD(n_components=svd, random_state=SEED)) if svd else ("dense", DENSE))
    steps.append(("model", model))
    return Pipeline(steps)


def models():
    lr = LogisticRegression(max_iter=2000, C=10, class_weight="balanced")
    svm = LinearSVC(C=1, class_weight="balanced")
    cnb = ComplementNB(alpha=0.3)
    return {
        "Dummy (most frequent)": sparse(DummyClassifier(strategy="most_frequent")),
        "Keyword rules": RulesBaseline(),
        "Logistic Regression": sparse(lr),
        "Linear SVM": sparse(svm),
        "SVM (RBF kernel)": sparse(SVC(C=10, kernel="rbf", class_weight="balanced")),
        "SGD Classifier": sparse(SGDClassifier(loss="modified_huber", class_weight="balanced", random_state=SEED)),
        "Ridge Classifier": sparse(RidgeClassifier(class_weight="balanced")),
        "Passive Aggressive": sparse(PassiveAggressiveClassifier(class_weight="balanced", random_state=SEED)),
        "Perceptron": sparse(Perceptron(class_weight="balanced", random_state=SEED)),
        "Multinomial Naive Bayes": sparse(MultinomialNB(alpha=0.3)),
        "Complement Naive Bayes": sparse(cnb),
        "Bernoulli Naive Bayes": sparse(BernoulliNB(alpha=0.3)),
        "Gaussian Naive Bayes": dense(GaussianNB()),
        "K-Nearest Neighbors (k=3)": sparse(KNeighborsClassifier(n_neighbors=3, metric="cosine", weights="distance")),
        "Nearest Centroid": sparse(NearestCentroid()),
        "Linear Discriminant Analysis": dense(LinearDiscriminantAnalysis(), svd=20),
        "Decision Tree": sparse(DecisionTreeClassifier(class_weight="balanced", random_state=SEED)),
        "Extra Tree (single)": sparse(ExtraTreeClassifier(class_weight="balanced", random_state=SEED)),
        "Random Forest": sparse(RandomForestClassifier(n_estimators=500, class_weight="balanced", random_state=SEED)),
        "Extra Trees": sparse(ExtraTreesClassifier(n_estimators=500, class_weight="balanced", random_state=SEED)),
        "Bagging (trees)": sparse(BaggingClassifier(n_estimators=100, random_state=SEED)),
        "AdaBoost": sparse(AdaBoostClassifier(n_estimators=200, random_state=SEED)),
        "Gradient Boosting": sparse(GradientBoostingClassifier(random_state=SEED)),
        "Hist Gradient Boosting": dense(HistGradientBoostingClassifier(random_state=SEED)),
        "XGBoost": sparse(XGBAnyLabels(n_estimators=200, max_depth=4, learning_rate=0.1, verbosity=0, random_state=SEED)),
        "LightGBM": sparse(LGBMClassifier(n_estimators=200, min_child_samples=1, verbose=-1, random_state=SEED)),
        "Neural Network (MLP)": sparse(MLPClassifier(hidden_layer_sizes=(64,), max_iter=2000, random_state=SEED)),
        "Voting Ensemble (LR+SVM+NB)": sparse(VotingClassifier([("lr", lr), ("svm", svm), ("nb", cnb)], voting="hard")),
        "Stacking Ensemble": sparse(StackingClassifier([("lr", lr), ("nb", cnb)],
                                                       final_estimator=LogisticRegression(max_iter=2000), cv=2)),
    }


def run_benchmark(df, y_text):
    enc = LabelEncoder().fit(y_text)
    y = enc.transform(y_text)
    rows, preds = [], {}
    for name, model in models().items():
        start = time.time()
        try:
            target = y_text if isinstance(model, RulesBaseline) else y
            pred = cross_val_predict(clone(model), df, target, cv=LeaveOneOut(), n_jobs=-1)
            pred = enc.transform(pred) if isinstance(model, RulesBaseline) else pred
        except Exception as exc:  # report and keep going: one broken model shouldn't stop the run
            rows.append({"model": name, "error": str(exc)[:120]})
            continue
        preds[name] = pred
        rows.append({
            "model": name,
            "macro_f1": f1_score(y, pred, average="macro", zero_division=0),
            "weighted_f1": f1_score(y, pred, average="weighted", zero_division=0),
            "accuracy": accuracy_score(y, pred),
            "balanced_accuracy": balanced_accuracy_score(y, pred),
            "complaint_recall": recall_for(y, pred, enc, "COMPLAINT_ESCALATE"),
            "seconds": round(time.time() - start, 1),
        })
        print(f"  {name:32s} macro-F1 {rows[-1]['macro_f1']:.3f}  accuracy {rows[-1]['accuracy']:.3f}")
    board = pd.DataFrame(rows).sort_values("macro_f1", ascending=False).reset_index(drop=True)
    board.index += 1
    return board, preds, enc, y


def recall_for(y, pred, enc, label):
    if label not in enc.classes_:
        return np.nan
    k = enc.transform([label])[0]
    mask = y == k
    return float((pred[mask] == k).mean()) if mask.any() else np.nan


def elbow(df):
    """K-Means on text: inertia (elbow) and silhouette for k = 2..15."""
    X = features().fit_transform(df)
    X = TruncatedSVD(n_components=min(20, X.shape[1] - 1), random_state=SEED).fit_transform(X)
    ks = list(range(2, min(16, len(df))))
    inertia, sil = [], []
    for k in ks:
        km = KMeans(n_clusters=k, n_init=20, random_state=SEED).fit(X)
        inertia.append(km.inertia_)
        sil.append(silhouette_score(X, km.labels_))
    # Kneedle-style elbow: the point furthest from the straight line between the first and last k.
    p1, p2 = np.array([ks[0], inertia[0]]), np.array([ks[-1], inertia[-1]])
    pts = np.column_stack([ks, inertia])
    dist = np.abs(np.cross(p2 - p1, p1 - pts)) / np.linalg.norm(p2 - p1)
    k_elbow, k_sil = ks[int(dist.argmax())], ks[int(np.argmax(sil))]

    fig, ax1 = plt.subplots(figsize=(8, 4.5))
    ax1.plot(ks, inertia, "o-", color="#1f6feb", label="Inertia (lower = tighter groups)")
    ax1.axvline(k_elbow, color="#1f6feb", ls="--", alpha=0.6)
    ax1.set_xlabel("Number of clusters (k)")
    ax1.set_ylabel("Inertia")
    ax2 = ax1.twinx()
    ax2.plot(ks, sil, "s-", color="#d97706", label="Silhouette (higher = better separated)")
    ax2.set_ylabel("Silhouette")
    fig.legend(loc="upper right", bbox_to_anchor=(0.88, 0.88))
    ax1.set_title(f"Elbow method: elbow at k={k_elbow}, best silhouette at k={k_sil}")
    fig.tight_layout()
    fig.savefig(REPORTS / "elbow.png", dpi=130)
    plt.close(fig)
    return k_elbow, k_sil, dict(zip(ks, sil))


def learning_curve(df, y, names):
    """Macro-F1 vs number of training rows, to estimate how much data 90% needs."""
    all_models = models()
    rng = np.random.RandomState(SEED)
    sizes = [s for s in (10, 15, 20, 25, 30) if s < len(df)]
    fig, ax = plt.subplots(figsize=(8, 4.5))
    for name in names:
        scores = []
        for size in sizes:
            reps = []
            for _ in range(10):
                train = rng.choice(len(df), size, replace=False)
                test = np.setdiff1d(np.arange(len(df)), train)
                try:
                    m = clone(all_models[name]).fit(df.iloc[train], y[train])
                    reps.append(f1_score(y[test], m.predict(df.iloc[test]), average="macro", zero_division=0))
                except Exception:
                    pass
            scores.append(np.mean(reps) if reps else np.nan)
        ax.plot(sizes, scores, "o-", label=name)
    ax.axhline(0.9, color="green", ls="--", alpha=0.6, label="90% target")
    ax.set_xlabel("Training rows")
    ax.set_ylabel("Macro-F1 on held-out rows")
    ax.set_ylim(0, 1)
    ax.set_title("Learning curve: does more data help?")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(REPORTS / "learning_curve.png", dpi=130)
    plt.close(fig)


def main():
    REPORTS.mkdir(exist_ok=True)
    df = pd.read_csv(DATA)
    y_text = df["segment_primary"].values
    counts = pd.Series(y_text).value_counts()
    print(f"{len(df)} visits, {counts.size} segments")
    small = counts[counts < 20]
    if len(small):
        print(f"WARNING: {len(small)} segments have fewer than 20 examples; scores are not reliable yet.")

    print("\nClassifiers (leave-one-out cross-validation):")
    board, preds, enc, y = run_benchmark(df, y_text)
    board.to_csv(REPORTS / "benchmark.csv")

    best = board.dropna(subset=["macro_f1"]).iloc[0]["model"]
    fig, ax = plt.subplots(figsize=(9, 8))
    ConfusionMatrixDisplay.from_predictions(enc.inverse_transform(y), enc.inverse_transform(preds[best]),
                                            xticks_rotation=60, ax=ax, colorbar=False)
    ax.set_title(f"Confusion matrix: {best}")
    fig.tight_layout()
    fig.savefig(REPORTS / "confusion_best.png", dpi=130)
    plt.close(fig)

    print("\nElbow method (K-Means):")
    k_elbow, k_sil, sil = elbow(df)
    print(f"  elbow at k={k_elbow}, best silhouette k={k_sil} ({sil[k_sil]:.3f})")

    top3 = [m for m in board.dropna(subset=["macro_f1"])["model"] if m not in ("Keyword rules", "Dummy (most frequent)")][:3]
    learning_curve(df, y, top3)

    with open(REPORTS / "benchmark.md", "w") as f:
        f.write(f"# Benchmark: {len(df)} visits, {counts.size} segments\n\n")
        f.write("Segment counts:\n\n" + counts.to_markdown() + "\n\n")
        f.write("## Leaderboard (leave-one-out, sorted by macro-F1)\n\n")
        f.write(board.round(3).to_markdown() + "\n\n")
        f.write(f"## Elbow method\n\nElbow at **k={k_elbow}**, best silhouette at **k={k_sil}** "
                f"(silhouette {sil[k_sil]:.3f}; above 0.25 means real structure).\n\n")
        f.write("![elbow](elbow.png)\n\n![learning curve](learning_curve.png)\n\n![confusion](confusion_best.png)\n")
    print(f"\nTop 5:\n{board.head(5)[['model', 'macro_f1', 'accuracy']].round(3).to_string()}")
    print(f"\nReports written to {REPORTS}")


if __name__ == "__main__":
    main()
