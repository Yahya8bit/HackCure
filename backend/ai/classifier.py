"""Caregiver description classifier (advisory, clinician-only).

Character n-gram TF-IDF + logistic regression. Character n-grams (2-5 letters,
within word boundaries) cope with Arabizi spelling variation: "yortoch",
"yorto3ch" and "yertoch" share most of their n-grams, so they look alike to the model.

The suggestion is stored on the seizure and shown ONLY in the clinician
dashboard, with a confidence and the words that pushed the score up. Below the
configured confidence threshold the suggestion is "unclear".
"""
import csv
import re
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

from nawba.settings import ROOT, rules

DATA = ROOT / "data" / "descriptions_labeled.csv"
MODEL_DIR = Path(__file__).parent / "models"
VERSION = "desc-clf-0.1.0"


def load_rows(path: Path = DATA) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [r for r in csv.DictReader(line for line in f if not line.startswith("#"))]


def build():
    return make_pipeline(
        TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), lowercase=True, sublinear_tf=True, min_df=1),
        LogisticRegression(max_iter=2000, C=5.0, class_weight="balanced"),
    )


def train(texts, labels):
    model = build()
    model.fit(texts, labels)
    return model


def save(model, version: str = VERSION) -> Path:
    MODEL_DIR.mkdir(exist_ok=True)
    path = MODEL_DIR / f"{version}.joblib"
    joblib.dump({"model": model, "version": version}, path)
    return path


_cache: dict = {}


def load_model():
    """Load the newest saved model, or train one from the CSV on first use."""
    if "m" not in _cache:
        # ponytail: lexical order of version labels; switch to a semver sort past x.9
        files = sorted(MODEL_DIR.glob("desc-clf-*.joblib"))
        if files:
            _cache["m"] = joblib.load(files[-1])
        else:
            rows = load_rows()
            _cache["m"] = {"model": train([r["text"] for r in rows], [r["label"] for r in rows]), "version": VERSION}
    return _cache["m"]


def explain(model, text: str, label: str, top: int = 4) -> list[str]:
    """Words whose character n-grams contributed most to `label` (coefficient x tf-idf)."""
    vec, clf = model.named_steps["tfidfvectorizer"], model.named_steps["logisticregression"]
    coef = clf.coef_[list(clf.classes_).index(label)]
    scores = []
    for word in set(re.findall(r"\w+", text.lower())):
        x = vec.transform([word])
        scores.append((float(x.dot(coef)[0]), word))
    return [w for s, w in sorted(scores, reverse=True)[:top] if s > 0]


def suggest(text: str) -> dict:
    m = load_model()
    model = m["model"]
    probs = model.predict_proba([text])[0]
    best = int(np.argmax(probs))
    label, conf = model.classes_[best], float(probs[best])
    threshold = rules()["classifier"]["min_confidence"]
    return {
        "category": label if conf >= threshold else "unclear",
        "model_top": label,
        "confidence": round(conf, 3),
        "highlights": explain(model, text, label),
        "model_version": m["version"],
        "below_threshold": conf < threshold,
    }
