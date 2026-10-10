"""Routes for the neurologist dashboard. Every route is clinician-only and
scoped to the clinician's own patients."""
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit
from .db import get_db
from .deps import clinician, patient_access
from .models import Alert, Intake, Medication, Patient, PatientIdentity, Report, Seizure, User
from .schemas import AlertAction, MedicationIn
from .security import decrypt

router = APIRouter(prefix="/clinic")
SEVERITY_RANK = {"urgent": 0, "high": 1, "medium": 2, "low": 3}


def alert_json(a: Alert) -> dict:
    return {"id": a.id, "type": a.type, "severity": a.severity, "reasons": a.reasons,
            "data_points": a.data_points, "confidence": a.confidence, "confidence_note": a.confidence_note,
            "status": a.status, "rules_version": a.rules_version, "created_at": a.created_at}


@router.get("/patients")
def ranked_patients(user: User = Depends(clinician), db: Session = Depends(get_db)):
    """Patients ranked by worst open alert severity, then most recent alert."""
    patients = db.scalars(select(Patient).where(Patient.clinician_id == user.id)).all()
    open_alerts = defaultdict(list)
    for a in db.scalars(select(Alert).where(Alert.status == "open", Alert.patient_id.in_([p.id for p in patients]))):
        open_alerts[a.patient_id].append(a)
    rows = []
    for p in patients:
        alerts = sorted(open_alerts[p.id], key=lambda a: (SEVERITY_RANK[a.severity], -a.created_at.timestamp()))
        top = alerts[0] if alerts else None
        rows.append({"id": p.id, "birth_year": p.birth_year, "sex": p.sex, "region": p.region,
                     "open_alerts": len(alerts), "top_severity": top.severity if top else None,
                     "top_reason": top.reasons[0] if top else None,
                     "last_alert_at": top and max(a.created_at for a in alerts)})
    rows.sort(key=lambda r: (SEVERITY_RANK.get(r["top_severity"], 9),
                             -(r["last_alert_at"].timestamp() if r["last_alert_at"] else 0)))
    return rows


@router.get("/patients/{patient_id}")
def patient_detail(patient_id: str, user: User = Depends(clinician), db: Session = Depends(get_db)):
    p = patient_access(db, user, patient_id)
    audit.append(db, user.username, "view_patient", patient_id)  # insider-misuse trail
    ident = db.get(PatientIdentity, patient_id)
    adherence = defaultdict(lambda: {"taken": 0, "missed": 0})
    for i in db.scalars(select(Intake).where(Intake.patient_id == patient_id)):
        adherence[i.scheduled_at.date().isoformat()][i.status] += 1
    q = lambda model, col: db.scalars(select(model).where(model.patient_id == patient_id).order_by(col)).all()  # noqa: E731
    return {
        "patient": {"id": p.id, "birth_year": p.birth_year, "sex": p.sex, "region": p.region, "pregnant": p.pregnant,
                    "name": decrypt(ident.name_enc) if ident else None, "phone": decrypt(ident.phone_enc) if ident else None},
        "medications": [{"id": m.id, "drug_name": m.drug_name, "dose_text": m.dose_text, "times": m.times, "active": m.active}
                        for m in q(Medication, Medication.id)],
        "seizures": [{"id": s.id, "started_at": s.started_at, "duration_s": s.duration_s, "category": s.category,
                      "triggers": s.triggers, "injury": s.injury, "description": s.description,
                      "ai_category": s.ai_category, "ai_confidence": s.ai_confidence,
                      "confirmed_category": s.confirmed_category} for s in q(Seizure, Seizure.started_at)],
        "adherence": [{"date": d, **v} for d, v in sorted(adherence.items())],
        "reports": [{"id": r.id, "at": r.at, "kind": r.kind, "detail": r.detail} for r in q(Report, Report.at)],
        "alerts": [alert_json(a) for a in q(Alert, Alert.created_at.desc())],
    }


@router.post("/patients/{patient_id}/medications")
def add_medication(patient_id: str, body: MedicationIn, user: User = Depends(clinician), db: Session = Depends(get_db)):
    """Record a prescription written by the clinician. The app itself never proposes doses."""
    patient_access(db, user, patient_id)
    med = Medication(patient_id=patient_id, **body.model_dump())
    db.add(med)
    db.commit()
    audit.append(db, user.username, "add_medication", patient_id, f"{body.drug_name} {body.dose_text}")
    return {"id": med.id}


@router.post("/alerts/{alert_id}/action")
def alert_action(alert_id: int, body: AlertAction, user: User = Depends(clinician), db: Session = Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(404, "Alert not found")
    patient_access(db, user, alert.patient_id)
    if body.action in ("validate", "dismiss"):
        alert.status = {"validate": "validated", "dismiss": "dismissed"}[body.action]
        db.commit()
    entry = audit.append(db, user.username, f"alert_{body.action}", f"alert:{alert.id}:{alert.patient_id}", body.reason)
    return {"alert": alert_json(alert), "audit_hash": entry.hash}


@router.get("/audit/verify")
def audit_verify(user: User = Depends(clinician), db: Session = Depends(get_db)):
    ok, n, msg = audit.verify_chain(db)
    return {"ok": ok, "entries": n, "message": msg}
