"""Routes used by the patient / caregiver app (and login for everyone)."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import alert_service
from .db import get_db
from .deps import accessible_patient_ids, current_user, patient_access
from .models import Intake, Medication, PatientIdentity, Report, Seizure, User
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
        entry = {"id": pid, "birth_year": p.birth_year, "consent_at": p.consent_at}
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
        model = ROW[entry.type]
        if db.get(model, item.id):
            results.append({"id": item.id, "status": "duplicate"})
            continue
        db.add(model(**item.model_dump(), logged_by=user.id))
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
