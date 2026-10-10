"""Routes for the neurologist dashboard. Every route is clinician-only and
scoped to the clinician's own patients."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ai import risk
from ai.summary import summarize

from . import alert_service, audit
from .db import get_db
from .deps import clinician, patient_access
from .models import AiFeedback, Alert, Intake, Medication, Patient, PatientIdentity, Report, Seizure, User
from .schemas import AlertAction, MedicationIn
from .security import decrypt
from .settings import rules

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
                      "ai_highlights": s.ai_highlights, "ai_model_version": s.ai_model_version,
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


# --- AI module, summaries and export (checks 16, 26, 28, 32, 33) -------------------
def _now():
    return datetime.now(timezone.utc)


@router.get("/patients/{patient_id}/insights")
def insights(patient_id: str, user: User = Depends(clinician), db: Session = Depends(get_db)):
    """Risk band + template consultation summary. Dashboard only — never exposed to patients."""
    patient_access(db, user, patient_id)
    d = alert_service.load(db, patient_id)
    out = {"summary": summarize(d["seizures"], d["intakes"], d["reports"], _now())}
    try:
        out["risk"] = risk.estimate(d["seizures"], d["intakes"], d["reports"], d["medications"], _now(), rules())
    except Exception as e:  # noqa: BLE001 - advisory panel; the rest of the page must still load
        out["risk"] = {"error": f"risk model unavailable: {e}"}
    return out


class CategoryIn(BaseModel):
    category: str


@router.post("/seizures/{seizure_id}/category")
def confirm_category(seizure_id: str, body: CategoryIn, user: User = Depends(clinician), db: Session = Depends(get_db)):
    """Clinician confirms or corrects the suggested category. The correction is kept for future
    retraining ONLY if the patient gave research consent. Retraining itself is never automatic."""
    if body.category not in rules()["seizure_categories"]:
        raise HTTPException(422, "unknown category")
    s = db.get(Seizure, seizure_id)
    if not s:
        raise HTTPException(404, "Seizure not found")
    p = patient_access(db, user, s.patient_id)
    s.confirmed_category = body.category
    kept = bool(p.research_consent and s.description)
    if kept:
        db.add(AiFeedback(seizure_id=s.id, text=s.description, suggested=s.ai_category, confirmed=body.category, clinician_id=user.id))
    db.commit()
    verb = "confirmed" if body.category == s.ai_category else "corrected"
    audit.append(db, user.username, f"category_{verb}", f"seizure:{s.id}:{s.patient_id}",
                 f"suggested={s.ai_category} final={body.category} feedback_kept={kept}")
    return {"confirmed_category": s.confirmed_category, "feedback_kept": kept}


@router.get("/patients/{patient_id}/fhir")
def fhir_export(patient_id: str, user: User = Depends(clinician), db: Session = Depends(get_db)):
    """FHIR-style (R4-shaped, not validated against a FHIR server) Bundle. Pseudonymous: no name/phone."""
    p = patient_access(db, user, patient_id)
    d = alert_service.load(db, patient_id)
    audit.append(db, user.username, "export_fhir", patient_id)
    ref = {"reference": f"Patient/{p.id}"}
    entries = [{"resource": {"resourceType": "Patient", "id": p.id,
                             "identifier": [{"system": "urn:nawba:pseudonym", "value": p.id}],
                             "gender": {"F": "female", "M": "male"}.get(p.sex, "unknown"), "birthDate": str(p.birth_year)}}]
    for s in d["seizures"]:
        entries.append({"resource": {
            "resourceType": "Observation", "id": s["id"], "status": "final", "subject": ref,
            "code": {"text": "Seizure event (patient/caregiver reported)"},
            "effectiveDateTime": s["started_at"].isoformat(),
            "valueQuantity": {"value": s["duration_s"], "unit": "s", "system": "http://unitsofmeasure.org", "code": "s"},
            "component": [{"code": {"text": "category"}, "valueString": s["category"]},
                          {"code": {"text": "triggers"}, "valueString": ",".join(s["triggers"]) or "none"},
                          {"code": {"text": "injury"}, "valueBoolean": s["injury"]}]}})
    since = _now() - timedelta(days=30)
    for m in d["medications"]:
        month = [i for i in d["intakes"] if i["scheduled_at"] > since]
        taken = sum(i["status"] == "taken" for i in month)
        entries.append({"resource": {
            "resourceType": "MedicationStatement", "id": f"med-{m['id']}", "status": "active", "subject": ref,
            "medicationCodeableConcept": {"text": m["drug_name"]},
            "effectivePeriod": {"start": since.isoformat(), "end": _now().isoformat()},
            "note": [{"text": f"Adherence (self-reported, last 30 days): {taken}/{len(month)} logged doses taken"}]}})
    return {"resourceType": "Bundle", "type": "collection", "timestamp": _now().isoformat(), "entry": entries}
