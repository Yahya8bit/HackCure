"""Authentication and role-based access. Every patient-scoped route goes through `patient_access`."""
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import CareLink, Patient, User
from .security import read_token


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    payload = read_token(authorization.removeprefix("Bearer ").strip())
    user = db.get(User, payload["uid"]) if payload else None
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


def clinician(user: User = Depends(current_user)) -> User:
    if user.role != "clinician":
        raise HTTPException(403, "Clinicians only")
    return user


def can_access(db: Session, user: User, patient_id: str) -> bool:
    if user.role == "patient":
        return user.patient_id == patient_id
    if user.role == "caregiver":
        return db.get(CareLink, (user.id, patient_id)) is not None
    if user.role == "clinician":
        p = db.get(Patient, patient_id)
        return p is not None and p.clinician_id == user.id
    return False


def accessible_patient_ids(db: Session, user: User) -> list[str]:
    if user.role == "patient":
        return [user.patient_id] if user.patient_id else []
    if user.role == "caregiver":
        return list(db.scalars(select(CareLink.patient_id).where(CareLink.caregiver_id == user.id)))
    return list(db.scalars(select(Patient.id).where(Patient.clinician_id == user.id)))


def patient_access(db: Session, user: User, patient_id: str) -> Patient:
    # 404 rather than 403 so callers cannot probe which pseudonyms exist.
    if not can_access(db, user, patient_id):
        raise HTTPException(404, "Patient not found")
    return db.get(Patient, patient_id)
