"""Routes used by the patient / caregiver app (and login for everyone)."""
import logging
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import alert_service, audit
from .db import get_db
from .deps import accessible_patient_ids, current_user, patient_access
from .models import (AiFeedback, Alert, CareLink, Intake, Medication, Patient, PatientIdentity, Report,
                     Seizure, User)
from .schemas import ENTRY_MODELS, Login, SyncIn
from .security import check_password, decrypt, make_token
from .settings import rules

router = APIRouter()
ROW = {"seizure": Seizure, "intake": Intake, "report": Report}


@router.post("/auth/login")
def login(body: Login, db: Session = Depends(get_db)):
    user = db.scalars(select(User).where(User.username == body.username)).first()
    if not user or not check_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong username or password")
    return {"token": make_token(user.id, user.role), "role": user.role}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    patients = []
    for pid in accessible_patient_ids(db, user):
        p = patient_access(db, user, pid)
        entry = {"id": pid, "birth_year": p.birth_year, "consent_at": p.consent_at,
                 "research_consent": p.research_consent}
        if user.role != "clinician":  # patient/caregiver see the name of who they log for
            ident = db.get(PatientIdentity, pid)
            entry["name"] = decrypt(ident.name_enc) if ident else None
        patients.append(entry)
    return {"username": user.username, "role": user.role, "patients": patients}


@router.get("/config/public")
def public_config():
    """Non-secret clinical display config for the app (cached offline by the PWA)."""
    r = rules()
    return {k: r[k] for k in ("version", "first_aid", "emergency_message", "pregnancy_patient_message",
                              "seizure_categories", "trigger_tags")} | {
        "prolonged_seconds": r["prolonged_seizure"]["threshold_seconds"],
        "emergency_number": r["emergency"]["number"],
    }


@router.get("/patients/{patient_id}/medications")
def medications(patient_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    patient_access(db, user, patient_id)
    meds = db.scalars(select(Medication).where(Medication.patient_id == patient_id, Medication.active))
    return [{"id": m.id, "drug_name": m.drug_name, "dose_text": m.dose_text, "times": m.times} for m in meds]


def add_ai_suggestion(row: Seizure) -> None:
    """Clinician-only category suggestion for a free-text description. Never returned to the
    patient/caregiver (they only see "description saved"). A model failure never blocks logging."""
    try:
        from ai.classifier import suggest
        s = suggest(row.description)
        row.ai_category, row.ai_confidence = s["category"], s["confidence"]
        row.ai_highlights, row.ai_model_version = s["highlights"], s["model_version"]
    except Exception:  # noqa: BLE001 - advisory feature; the seizure entry itself must still be saved
        logging.getLogger("nawba").exception("description classifier failed")


@router.post("/sync")
def sync(body: SyncIn, lang: Literal["fr", "ar", "en"] = "fr",
         user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Apply queued offline entries IN ORDER. The client UUID is the primary key,
    so a re-sent entry is reported as `duplicate` and never stored twice."""
    if user.role == "clinician":
        raise HTTPException(403, "Clinicians do not log patient entries")
    allowed = set(accessible_patient_ids(db, user))
    results, touched, pregnancy = [], set(), set()
    for entry in body.entries:
        try:
            item = ENTRY_MODELS[entry.type].model_validate(entry.data)
        except ValidationError as e:
            results.append({"id": entry.data.get("id"), "status": "rejected", "error": e.errors()[0]["msg"]})
            continue
        if item.patient_id not in allowed:
            results.append({"id": item.id, "status": "rejected", "error": "no access to patient"})
            continue
        if db.get(Patient, item.patient_id).consent_at is None:
            results.append({"id": item.id, "status": "rejected", "error": "consent required"})
            continue
        model = ROW[entry.type]
        if db.get(model, item.id):
            results.append({"id": item.id, "status": "duplicate"})
            continue
        row = model(**item.model_dump(), logged_by=user.id)
        if entry.type == "seizure" and item.description:
            add_ai_suggestion(row)
        db.add(row)
        db.flush()
        if entry.type == "report" and item.kind == "pregnancy":
            patient_access(db, user, item.patient_id).pregnant = True
            pregnancy.add(item.patient_id)
        touched.add(item.patient_id)
        results.append({"id": item.id, "status": "created"})
    db.commit()
    for pid in sorted(touched):
        alert_service.refresh(db, pid)
    messages = [m for pid in sorted(pregnancy) if (m := alert_service.patient_message(db, pid, lang))]
    return {"results": results, "messages": messages}


# --- consent and data rights (check 7) -----------------------------------------
class ConsentIn(BaseModel):
    research: bool = False


def _may_manage(db: Session, user: User, patient_id: str):
    """The patient, or a caregiver of a CHILD patient, may give consent / export / delete."""
    p = patient_access(db, user, patient_id)
    if user.role == "clinician" or (user.role == "caregiver" and date.today().year - p.birth_year >= 18):
        raise HTTPException(403, "Only the patient (or a parent for a child) can do this")
    return p


@router.post("/patients/{patient_id}/consent")
def give_consent(patient_id: str, body: ConsentIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _may_manage(db, user, patient_id)
    p.consent_at, p.research_consent = datetime.now(timezone.utc), body.research
    db.commit()
    audit.append(db, user.username, "consent", patient_id, f"research={body.research}")
    return {"consent_at": p.consent_at, "research_consent": p.research_consent}


@router.get("/patients/{patient_id}/export")
def export_data(patient_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _may_manage(db, user, patient_id)
    ident = db.get(PatientIdentity, patient_id)
    rows = lambda model: [{c.name: getattr(r, c.name) for c in model.__table__.columns}  # noqa: E731
                          for r in db.scalars(select(model).where(model.patient_id == patient_id))]
    audit.append(db, user.username, "export", patient_id)
    return {"patient": {c.name: getattr(p, c.name) for c in Patient.__table__.columns},
            "identity": {"name": decrypt(ident.name_enc), "phone": decrypt(ident.phone_enc)} if ident else None,
            "medications": rows(Medication), "seizures": rows(Seizure), "intakes": rows(Intake), "reports": rows(Report)}


@router.delete("/patients/{patient_id}")
def delete_data(patient_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Right to erasure: removes identity, all logs, alerts and accounts of this patient.
    The audit log keeps only the pseudonym and the fact of deletion."""
    _may_manage(db, user, patient_id)
    seizure_ids = select(Seizure.id).where(Seizure.patient_id == patient_id)
    db.execute(delete(AiFeedback).where(AiFeedback.seizure_id.in_(seizure_ids)))
    for model in (Seizure, Intake, Report, Alert, Medication, PatientIdentity, CareLink):
        db.execute(delete(model).where(model.patient_id == patient_id))
    db.execute(delete(User).where(User.patient_id == patient_id))
    db.execute(delete(Patient).where(Patient.id == patient_id))
    db.commit()
    audit.append(db, user.username, "delete_patient_data", patient_id)
    return {"deleted": patient_id}
