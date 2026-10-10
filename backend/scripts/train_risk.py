"""Train the 7-day risk model on synthetic data.

Split is BY PATIENT (30 % held out) and is fixed before any tuning; the decision
threshold is chosen on the training patients only. The test patients are only
touched by scripts/evaluate_ai.py.
"""
import random
from datetime import timedelta

import numpy as np
from sklearn.metrics import roc_curve

from ai import risk
from nawba.settings import rules
from scripts.synthetic import DAYS, DEFAULT_END, generate

SPLIT_SEED = 7


def dataset():
    """Rows of (patient meta, feature vector, label), sampled weekly over the last 10 weeks."""
    data, cfg = generate(), rules()
    by = {k: {p["id"]: [] for p in data["patients"]} for k in ("seizures", "intakes", "reports")}
    for k in by:
        for x in data[k]:
            by[k][x["patient_id"]].append(x)
    meds = {m["patient_id"]: [m] for m in data["medications"]}
    ids = [p["id"] for p in data["patients"]]
    test_ids = set(random.Random(SPLIT_SEED).sample(ids, k=int(0.3 * len(ids))))
    start = DEFAULT_END - timedelta(days=DAYS)
    rows = []
    for p in data["patients"]:
        pid, truth = p["id"], data["truth"][p["id"]]
        for day in range(112, DAYS - 7, 7):
            now = start + timedelta(days=day)
            f = risk.features(by["seizures"][pid], by["intakes"][pid], by["reports"][pid], meds[pid], now)
            rows.append({"pid": pid, "test": pid in test_ids, "x": risk.vector(f), "y": risk.label(by["seizures"][pid], now, cfg),
                         "baseline_score": f["recent_28d"],
                         "child": truth["child"], "sex": p["sex"], "region": p["region"]})
    return rows


def pick_threshold(y, p) -> float:
    fpr, tpr, thr = roc_curve(y, p)
    return float(thr[int(np.argmax(tpr - fpr))])  # Youden's J, on TRAIN data only


def main(quiet=False):
    rows = [r for r in dataset() if not r["test"]]
    X, y = [r["x"] for r in rows], [r["y"] for r in rows]
    model = risk.train(X, y)
    threshold = pick_threshold(y, model.predict_proba(np.array(X))[:, 1])
    risk.save(model, threshold)
    if not quiet:
        print(f"trained {risk.VERSION} on {len(rows)} train rows ({sum(y)} positive); threshold={threshold:.3f}")


if __name__ == "__main__":
    main()
