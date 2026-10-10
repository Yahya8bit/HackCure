"""Retrain the description classifier with clinician feedback. NEVER runs automatically.

    python -m scripts.retrain_classifier                       # dry run: metrics only, nothing saved
    python -m scripts.retrain_classifier --approve "Dr X" --version desc-clf-0.2.0

Feedback rows (clinician-confirmed categories, kept only with patient research
consent) are added to the TRAIN side only; the test split of the labeled CSV is
fixed, so old and new versions are compared on the same examples. Saving a new
version requires a named human approver and is written to the audit log.
"""
import argparse

from sklearn.metrics import accuracy_score, f1_score
from sqlalchemy import select

from ai import classifier
from nawba import audit
from nawba.db import SessionLocal
from nawba.models import AiFeedback
from scripts.evaluate_ai import classifier_split


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--approve", help="name of the person approving the new model version")
    ap.add_argument("--version", help="new version label, e.g. desc-clf-0.2.0")
    args = ap.parse_args()

    train, test = classifier_split()
    with SessionLocal() as db:
        feedback = db.scalars(select(AiFeedback)).all()
    texts = [r["text"] for r in train] + [f.text for f in feedback]
    labels = [r["label"] for r in train] + [f.confirmed for f in feedback]
    old = classifier.train([r["text"] for r in train], [r["label"] for r in train])
    new = classifier.train(texts, labels)
    xt, yt = [r["text"] for r in test], [r["label"] for r in test]
    for name, m in (("current recipe", old), ("with feedback", new)):
        pred = m.predict(xt)
        print(f"{name:15s} test accuracy={accuracy_score(yt, pred):.3f} macro-F1={f1_score(yt, pred, average='macro'):.3f}")
    print(f"feedback rows used: {len(feedback)}")

    if not (args.approve and args.version):
        print("Dry run: nothing saved. A new version needs --approve NAME --version LABEL (human decision).")
        return
    path = classifier.save(new, args.version)
    with SessionLocal() as db:
        audit.append(db, args.approve, "model_version_approved", args.version,
                     f"train={len(texts)} feedback={len(feedback)} file={path.name}")
    print(f"saved {path} and recorded approval by {args.approve} in the audit log")


if __name__ == "__main__":
    main()
