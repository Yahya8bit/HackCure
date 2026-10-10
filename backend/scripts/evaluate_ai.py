"""Honest evaluation of both AI models, written to reports/ai_evaluation.md.

Classifier (check 26/27): fixed stratified 70/30 split of data/descriptions_labeled.csv
  (seed 0, made before any tuning; hyper-parameters were never tuned on the test side).
  Reports per-class precision/recall, confusion matrix, and accuracy by script.
Risk model (check 28/29): held-out synthetic PATIENTS (see scripts/train_risk.py).
  ROC AUC, Brier score, sensitivity and false-alarm rate at the threshold chosen on
  TRAIN data, for the model AND for a non-AI baseline (seizure count in last 4 weeks).
Subgroups (check 30): child/adult, sex, rural/urban for risk; script for the classifier.

Run:  python -m scripts.evaluate_ai
"""
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.metrics import (brier_score_loss, classification_report, confusion_matrix, roc_auc_score)
from sklearn.model_selection import train_test_split

from ai import classifier, risk
from nawba.settings import ROOT, rules
from scripts.train_risk import dataset, pick_threshold

REPORT = Path(__file__).resolve().parents[1] / "reports" / "ai_evaluation.md"
FLAG_GAP = 0.10  # flag a subgroup whose sensitivity/accuracy is >10 points below overall


def classifier_split():
    rows = classifier.load_rows(ROOT / "data" / "descriptions_labeled.csv")
    train, test = train_test_split(rows, test_size=0.3, random_state=0, stratify=[r["label"] for r in rows])
    return train, test


def eval_classifier(lines):
    train, test = classifier_split()
    model = classifier.train([r["text"] for r in train], [r["label"] for r in train])
    thr = rules()["classifier"]["min_confidence"]
    probs = model.predict_proba([r["text"] for r in test])
    pred = [model.classes_[i] if p[i] >= thr else "unclear" for p, i in zip(probs, probs.argmax(1))]
    y = [r["label"] for r in test]
    labels = sorted(set(y) | set(pred))
    lines += ["## Description classifier (check 26, 27)", "",
              f"Data: `data/descriptions_labeled.csv` — {len(train) + len(test)} rows (**placeholder written by the AI assistant, "
              f"not clinician-reviewed**), split 70/30 stratified, seed 0 → train {len(train)}, test {len(test)}.",
              f"Predictions below confidence {thr} are reported as `unclear` (what the clinician would see).", "",
              "```", classification_report(y, pred, labels=labels, zero_division=0), "```", "",
              "Confusion matrix (rows = true, columns = predicted):", "", "| true \\ pred | " + " | ".join(labels) + " |",
              "|---" * (len(labels) + 1) + "|"]
    for lab, row in zip(labels, confusion_matrix(y, pred, labels=labels)):
        lines.append(f"| {lab} | " + " | ".join(str(v) for v in row) + " |")
    raw = model.predict([r["text"] for r in test])
    raw_acc = float(np.mean([a == b for a, b in zip(y, raw)]))
    lines += ["", f"Without the `unclear` threshold (raw top choice), test accuracy = {raw_acc:.3f}. "
              f"The gap shows how often the model is not confident enough on this tiny training set."]
    overall = np.mean([a == b for a, b in zip(y, pred)])
    lines += ["", f"Overall test accuracy: {overall:.3f} (n={len(y)})", "", "### Accuracy by script (check 30)", "",
              "| script | n | accuracy | flag |", "|---|---|---|---|"]
    by = defaultdict(list)
    for r, p in zip(test, pred):
        by[r["script"]].append(r["label"] == p)
    for script, hits in sorted(by.items()):
        acc = float(np.mean(hits))
        flag = "**worse**" if acc < overall - FLAG_GAP else ""
        lines.append(f"| {script} | {len(hits)} | {acc:.3f} | {flag} |")
    lines += ["", f"With only {len(y)} test examples, each example moves accuracy by {1 / len(y):.1%}; "
              "subgroup numbers are indicative only.", ""]


def metrics(y, p, thr):
    y, p = np.array(y), np.array(p)
    pred = p >= thr
    pos, neg = y == 1, y == 0
    return {"auc": roc_auc_score(y, p) if len(set(y)) > 1 else float("nan"), "brier": brier_score_loss(y, p),
            "sens": pred[pos].mean() if pos.any() else float("nan"), "far": pred[neg].mean() if neg.any() else float("nan"),
            "n": len(y), "pos": int(pos.sum())}


def eval_risk(lines):
    rows = dataset()
    train, test = [r for r in rows if not r["test"]], [r for r in rows if r["test"]]
    m = risk.load()
    model, thr = m["model"], m["threshold"]
    # Non-AI baseline: probability = share of positive TRAIN rows with the same 4-week count (lookup table).
    table = defaultdict(list)
    for r in train:
        table[min(r["baseline_score"], 10)].append(r["y"])
    base_p = lambda r: float(np.mean(table.get(min(r["baseline_score"], 10), [np.mean([t["y"] for t in train])])))  # noqa: E731
    base_thr = pick_threshold([r["y"] for r in train], [base_p(r) for r in train])

    p_model = model.predict_proba(np.array([r["x"] for r in test]))[:, 1]
    p_base = [base_p(r) for r in test]
    y = [r["y"] for r in test]
    mm, mb = metrics(y, p_model, thr), metrics(y, p_base, base_thr)
    lines += ["## Seizure-risk estimate (check 28, 29)", "",
              f"Held-out synthetic patients: {len({r['pid'] for r in test})} (train: {len({r['pid'] for r in train})}). "
              f"Rows = one weekly snapshot per patient over the last 10 weeks: test n={mm['n']} ({mm['pos']} positive).",
              f"Thresholds chosen on TRAIN only (Youden J): model {thr:.3f}, baseline {base_thr:.3f}.", "",
              "| | ROC AUC | Brier (lower = better) | sensitivity | false-alarm rate |", "|---|---|---|---|---|",
              f"| model {m['version']} | {mm['auc']:.3f} | {mm['brier']:.3f} | {mm['sens']:.3f} | {mm['far']:.3f} |",
              f"| baseline: seizures in last 4 weeks | {mb['auc']:.3f} | {mb['brier']:.3f} | {mb['sens']:.3f} | {mb['far']:.3f} |", ""]
    # Rows from the same patient are correlated, so resample PATIENTS (1000x) for a 95 % interval.
    rng, pids = np.random.default_rng(0), sorted({r["pid"] for r in test})
    rows_of = {pid: [i for i, r in enumerate(test) if r["pid"] == pid] for pid in pids}
    diffs = []
    for _ in range(1000):
        idx = [i for pid in rng.choice(pids, len(pids)) for i in rows_of[pid]]
        yy = [y[i] for i in idx]
        if len(set(yy)) > 1:
            diffs.append(roc_auc_score(yy, [p_model[i] for i in idx]) - roc_auc_score(yy, [p_base[i] for i in idx]))
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    beats = lo > 0 and mm["brier"] < mb["brier"]
    lines += [f"AUC difference model − baseline: {mm['auc'] - mb['auc']:+.3f}, 95 % patient-bootstrap interval "
              f"[{lo:+.3f}, {hi:+.3f}]; Brier difference {mm['brier'] - mb['brier']:+.3f}.", "",
              f"**Does the model beat the baseline?** {'Yes' if beats else 'No — not demonstrably'}: "
              + ("the interval excludes zero." if beats else "the interval includes zero, so the difference may be noise.") + " "
              + (f"Both are close to chance (AUC 0.5) on this task. " if max(mm["auc"], mb["auc"]) < 0.6 else
                 f"Both rank patients moderately well (AUC {mm['auc']:.2f} vs {mb['auc']:.2f}) — the simple count already captures most of the signal. ") +
              "This is synthetic data generated with known rules; a model trained on it mostly recovers those rules. "
              "It proves the pipeline works, not that it is clinically valid.", "",
              "### Risk model by subgroup (check 30)", "",
              "| subgroup | n | positives | AUC | sensitivity | false-alarm rate | flag |", "|---|---|---|---|---|---|---|"]
    groups = {"child": lambda r: r["child"], "adult": lambda r: not r["child"], "female": lambda r: r["sex"] == "F",
              "male": lambda r: r["sex"] == "M", "rural": lambda r: r["region"] == "rural", "urban": lambda r: r["region"] == "urban"}
    for name, keep in groups.items():
        idx = [i for i, r in enumerate(test) if keep(r)]
        g = metrics([y[i] for i in idx], [p_model[i] for i in idx], thr)
        flag = "**worse**" if (g["sens"] < mm["sens"] - FLAG_GAP or g["auc"] < mm["auc"] - FLAG_GAP) else ""
        lines.append(f"| {name} | {g['n']} | {g['pos']} | {g['auc']:.3f} | {g['sens']:.3f} | {g['far']:.3f} | {flag} |")
    lines += ["", "Synthetic demographics do not change seizure behaviour in the generator, so subgroup gaps here "
              "reflect sample size, not real-world bias. Real bias can only be measured on real local data.", ""]


def main():
    lines = ["# AI evaluation (generated by `python -m scripts.evaluate_ai`)", "",
             "All numbers below are measured, not edited. Synthetic / placeholder data only.", ""]
    eval_classifier(lines)
    eval_risk(lines)
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
