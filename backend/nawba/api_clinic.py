"""Routes for the neurologist dashboard. Every route is clinician-only and
scoped to the clinician's own patients."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ai import risk
from engine.alerts import trend_test
from ai.summary import summarize

from . import alert_service, audit
from .db import get_db
from .deps import clinician, patient_access
from .models import AiFeedback, Alert, AuditEntry, Intake, Medication, Patient, PatientIdentity, Report, Seizure, User
from .schemas import AlertAction, MedicationIn
from .security import decrypt
from .settings import rules

router = APIRouter(prefix="/clinic")
SEVERITY_RANK = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
# Three tiers shown to the clinician (alert-fatigue fix): urgent / needs review / information.
TIER = {"urgent": "urgent", "high": "review", "medium": "review", "low": "info"}


def alert_json(a: Alert) -> dict:
    return {"id": a.id, "type": a.type, "severity": a.severity, "tier": TIER[a.severity], "reasons": a.reasons,
            "data_points": a.data_points, "confidence": a.confidence, "confidence_note": a.confidence_note,
            "confidence_notes": a.confidence_notes,
            "status": a.status, "rules_version": a.rules_version, "created_at": a.created_at,
            "updated_at": a.updated_at, "occurrences": a.occurrences}


@router.get("/patients")
def ranked_patients(sensitive: bool = False, user: User = Depends(clinician), db: Session = Depends(get_db)):
    """ONE row per patient: worst open alert (tier), "+N more", a 30-day rhythm strip and adherence.
    Ranked by tier, then most recent alert activity.
    `sensitive=1` (F2, presentation only): also mark patients outside the default queue whose seizure
    trend passes the lower `trend.sensitive_view_max_p_value`. No alert is created or changed."""
    patients = db.scalars(select(Patient).where(Patient.clinician_id == user.id)).all()
    ids = [p.id for p in patients]
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=30)
    limit = rules()["prolonged_seizure"]["threshold_seconds"]
    open_alerts, rhythm, adherence = defaultdict(list), defaultdict(lambda: [[0, 0] for _ in range(30)]), defaultdict(lambda: [0, 0])
    for a in db.scalars(select(Alert).where(Alert.status == "open", Alert.patient_id.in_(ids))):
        open_alerts[a.patient_id].append(a)
    for s in db.scalars(select(Seizure).where(Seizure.patient_id.in_(ids), Seizure.started_at >= since)):
        day = min(29, max(0, 29 - (now - alert_service.utc(s.started_at)).days))
        rhythm[s.patient_id][day][0] += 1
        rhythm[s.patient_id][day][1] += int((s.duration_s or 0) > limit)
    for pid, status, n in db.execute(select(Intake.patient_id, Intake.status, func.count()).where(
            Intake.patient_id.in_(ids), Intake.scheduled_at >= since).group_by(Intake.patient_id, Intake.status)):
        adherence[pid][0 if status == "taken" else 1] += n
    rows = []
    for p in patients:
        alerts = sorted(open_alerts[p.id], key=lambda a: (SEVERITY_RANK[a.severity], -alert_service.utc(a.updated_at).timestamp()))
        top = alerts[0] if alerts else None
        taken, missed = adherence[p.id]
        rows.append({"id": p.id, "birth_year": p.birth_year, "sex": p.sex, "region": p.region,
                     "tier": TIER[top.severity] if top else "stable",
                     "top_type": top.type if top else None, "top_reason": top.reasons[0] if top else None,
                     "open_alerts": len(alerts), "more": max(len(alerts) - 1, 0),
                     "last_alert_at": max(alert_service.utc(a.updated_at) for a in alerts) if alerts else None,
                     "rhythm": rhythm[p.id], "adherence_30d": round(taken / (taken + missed), 2) if taken + missed else None})
    if sensitive:
        cfg = rules()
        hist = defaultdict(list)
        for s in db.scalars(select(Seizure).where(Seizure.patient_id.in_(ids), Seizure.started_at >= now - timedelta(days=112))):
            hist[s.patient_id].append({"started_at": alert_service.utc(s.started_at)})
        for r in rows:
            if r["tier"] in ("info", "stable"):
                flagged, _, _, reason = trend_test(hist[r["id"]], now, cfg, max_p=cfg["trend"]["sensitive_view_max_p_value"])
                if flagged:
                    r.update(sensitive_only=True, sensitive_reason=reason)
    order = {"urgent": 0, "review": 1, "info": 2, "stable": 3}
    rows.sort(key=lambda r: (order[r["tier"]], -(r["last_alert_at"].timestamp() if r["last_alert_at"] else 0)))
    return rows


@router.get("/patients/{patient_id}")
def patient_detail(patient_id: str, user: User = Depends(clinician), db: Session = Depends(get_db)):
    p = patient_access(db, user, patient_id)
    audit.append(db, user.username, "view_patient", patient_id)  # insider-misuse trail
    ident = db.get(PatientIdentity, patient_id)
    history = defaultdict(list)  # who validated / dismissed / called, from the audit log
    for e in db.scalars(select(AuditEntry).where(AuditEntry.target.like(f"alert:%:{patient_id}")).order_by(AuditEntry.id)):
        history[e.target].append({"at": e.ts, "by": e.actor, "action": e.action.removeprefix("alert_"), "reason": e.reason})
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
        "alerts": [alert_json(a) | {"history": history.get(f"alert:{a.id}:{patient_id}", [])}
                   for a in q(Alert, Alert.created_at.desc())],
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
    d = alert_service.load(db, patient_id, since=datetime(1970, 1, 1, tzinfo=timezone.utc))  # full history
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
