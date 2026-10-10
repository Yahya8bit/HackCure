"""7-day elevated-seizure-period risk estimate (dashboard only, advisory).

Logistic regression on a handful of readable features. Each patient's
explanation = coefficient x standardised feature value, so "top 3 factors" is
exact arithmetic, not an approximation.

Inputs use the same plain-dict format as the alert engine
(see nawba.alert_service.load). Trained on SYNTHETIC data only: it mostly
re-learns the rules used to generate that data and proves the pipeline,
not clinical validity.
"""
from datetime import datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

VERSION = "risk-0.1.0"
MODEL_PATH = Path(__file__).parent / "models" / f"{VERSION}.joblib"

FEATURES = {
    "recent_28d": "seizures in the last 4 weeks",
    "last_7d": "seizures in the last 7 days",
    "ratio_vs_baseline": "recent rate compared with the patient's own baseline",
    "missed_14d": "missed doses in the last 2 weeks",
    "poor_sleep_14d": "poor-sleep nights reported in the last 2 weeks",
    "trigger_tags_28d": "seizures with a logged trigger in the last 4 weeks",
    "completeness_14d": "share of scheduled doses that were logged",
}


def _count(items, key, start, end):
    return sum(1 for x in items if start < x[key] <= end)


def features(seizures, intakes, reports, medications, now: datetime) -> dict:
    d = lambda n: now - timedelta(days=n)  # noqa: E731
    recent = _count(seizures, "started_at", d(28), now)
    baseline_per_28 = _count(seizures, "started_at", d(112), d(28)) / 3
    expected = 14 * sum(len(m["times"]) for m in medications) or 1
    return {
        "recent_28d": recent,
        "last_7d": _count(seizures, "started_at", d(7), now),
        "ratio_vs_baseline": recent / (baseline_per_28 + 1),  # +1 avoids divide-by-zero for seizure-free baselines
        "missed_14d": sum(1 for i in intakes if d(14) < i["scheduled_at"] <= now and i["status"] == "missed"),
        "poor_sleep_14d": sum(1 for r in reports if d(14) < r["at"] <= now and r["kind"] == "poor_sleep"),
        "trigger_tags_28d": sum(1 for s in seizures if d(28) < s["started_at"] <= now and s["triggers"]),
        "completeness_14d": min(_count(intakes, "scheduled_at", d(14), now) / expected, 1.0),
    }


def label(seizures, now: datetime, cfg: dict) -> int:
    """1 if the next 7 days hold an elevated number of seizures for THIS patient."""
    baseline_weekly = _count(seizures, "started_at", now - timedelta(days=84), now) / 12
    nxt = _count(seizures, "started_at", now, now + timedelta(days=cfg["risk"]["horizon_days"]))
    return int(nxt >= max(2, cfg["risk"]["elevated_factor"] * baseline_weekly))


def vector(f: dict) -> list[float]:
    return [f[k] for k in FEATURES]


def train(X, y):
    model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
    model.fit(np.array(X), np.array(y))
    return model


def save(model, threshold: float):
    MODEL_PATH.parent.mkdir(exist_ok=True)
    joblib.dump({"model": model, "version": VERSION, "threshold": threshold}, MODEL_PATH)


_cache: dict = {}


def load():
    if "m" not in _cache:
        if not MODEL_PATH.exists():
            from scripts.train_risk import main as train_main  # trains on synthetic data (~seconds)
            train_main(quiet=True)
        _cache["m"] = joblib.load(MODEL_PATH)
    return _cache["m"]


def estimate(seizures, intakes, reports, medications, now, cfg) -> dict:
    m = load()
    f = features(seizures, intakes, reports, medications, now)
    model = m["model"]
    p = float(model.predict_proba([vector(f)])[0, 1])
    scaler, lr = model.named_steps["standardscaler"], model.named_steps["logisticregression"]
    contrib = lr.coef_[0] * scaler.transform([vector(f)])[0]
    top = sorted(zip(contrib, FEATURES), reverse=True)[:3]
    band = "high" if p >= cfg["risk"]["band_high"] else "medium" if p >= cfg["risk"]["band_medium"] else "low"
    return {
        "band": band,
        "probability": round(p, 2),
        "factors": [f"{FEATURES[k]}: {f[k]:.2g} ({'raises' if c > 0 else 'lowers'} the estimate)" for c, k in top],
        "features": f,
        "model_version": m["version"],
        "wording": "Statistical estimate from logged data, not a prediction or a diagnosis.",
        "low_data": f["completeness_14d"] < cfg["confidence"]["medium_min_completeness"],
    }
