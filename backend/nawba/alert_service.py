"""Glue between storage and the pure alert engine: load rows -> engine -> store new alerts."""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from engine.alerts import evaluate

from .models import Alert, Intake, Medication, Patient, Report, Seizure
from .settings import rules


def utc(dt: datetime | None) -> datetime | None:
    # SQLite drops tzinfo; PostgreSQL keeps it. Normalise everything to aware UTC.
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


def load(db: Session, patient_id: str) -> dict:
    rows = lambda model: db.scalars(select(model).where(model.patient_id == patient_id)).all()  # noqa: E731
    p = db.get(Patient, patient_id)
    return {
        "patient": {"id": p.id, "pregnant": p.pregnant, "birth_year": p.birth_year},
        "seizures": [{"id": s.id, "started_at": utc(s.started_at), "duration_s": s.duration_s, "category": s.category,
                      "triggers": s.triggers or [], "injury": s.injury} for s in rows(Seizure)],
        "intakes": [{"id": i.id, "scheduled_at": utc(i.scheduled_at), "status": i.status} for i in rows(Intake)],
        "reports": [{"id": r.id, "at": utc(r.at), "kind": r.kind} for r in rows(Report)],
        "medications": [{"id": m.id, "drug_name": m.drug_name, "times": m.times} for m in rows(Medication) if m.active],
    }


def refresh(db: Session, patient_id: str, now: datetime | None = None) -> list[dict]:
    """Run the engine for one patient and insert alerts whose key is new. Returns the new alerts."""
    d = load(db, patient_id)
    found = evaluate(d["patient"], d["seizures"], d["intakes"], d["reports"], d["medications"],
                     now or datetime.now(timezone.utc), rules())
    known = set(db.scalars(select(Alert.key).where(Alert.patient_id == patient_id)))
    new = [a for a in found if a["key"] not in known]
    db.add_all(Alert(patient_id=patient_id, **a) for a in new)
    db.commit()
    return new


def patient_message(db: Session, patient_id: str, lang: str = "fr") -> str | None:
    """The ONLY alert-related text a patient/caregiver ever sees: shown after a pregnancy
    report when the pregnancy-sensitive-drug rule holds. Everything else is clinician-only."""
    exists = db.scalars(select(Alert.id).where(Alert.patient_id == patient_id,
                                               Alert.type == "pregnancy_sensitive_drug")).first()
    msg = rules()["pregnancy_patient_message"]
    return msg.get(lang, msg["en"]) if exists else None
