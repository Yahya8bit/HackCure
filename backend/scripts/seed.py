"""Load synthetic data + demo accounts into an EMPTY database. Safe to re-run (no-op if seeded).

Demo accounts (password from DEMO_PASSWORD env, see .env.example):
  dr.demo         clinician owning most patients
  dr.other        clinician owning 10 patients (to show clinician scoping)
  caregiver.demo  linked to one child and one adult patient
  patient.demo    the patient account of one adult patient
"""
import os
from datetime import datetime, timezone

from sqlalchemy import insert, select

from nawba import models as m
from nawba.alert_service import refresh
from nawba.db import Base, SessionLocal, engine, ensure_columns
from nawba.security import encrypt, hash_password
from nawba.settings import env
from scripts.synthetic import generate


def seed(end: datetime | None = None) -> bool:
    Base.metadata.create_all(engine)
    ensure_columns()
    db = SessionLocal()
    try:
        if db.scalars(select(m.User).limit(1)).first():
            return False
        pw = hash_password(env("DEMO_PASSWORD"))
        dr = m.User(username="dr.demo", password_hash=pw, role="clinician")
        dr2 = m.User(username="dr.other", password_hash=pw, role="clinician")
        cg = m.User(username="caregiver.demo", password_hash=pw, role="caregiver")
        db.add_all([dr, dr2, cg])
        db.flush()

        data = generate(end=end or datetime.now(timezone.utc))
        pts = data["patients"]
        for i, p in enumerate(pts):
            db.add(m.Patient(id=p["id"], clinician_id=dr2.id if i >= len(pts) - 10 else dr.id,
                             birth_year=p["birth_year"], sex=p["sex"], region=p["region"],
                             pregnant=p["pregnant"], consent_at=datetime.now(timezone.utc)))
        db.flush()
        db.add_all(m.PatientIdentity(patient_id=p["id"], name_enc=encrypt(p["name"]), phone_enc=encrypt(p["phone"])) for p in pts)

        med_ids = {}
        for med in data["medications"]:
            row = m.Medication(**med)
            db.add(row)
            db.flush()
            med_ids[med["patient_id"]] = row.id
        db.execute(insert(m.Seizure), data["seizures"])
        db.execute(insert(m.Intake), [{**x, "medication_id": med_ids[x["patient_id"]]} for x in data["intakes"]])
        db.execute(insert(m.Report), data["reports"])

        child = next(p for p, t in zip(pts, data["truth"].values()) if t["child"])
        adult = next(p for p, t in zip(pts, data["truth"].values()) if not t["child"] and p["sex"] == "F" and not p["pregnant"])
        # Demo: the patient.demo account is on valproate so the pregnancy rule can be shown live.
        db.get(m.Medication, med_ids[adult["id"]]).drug_name = "valproate"
        db.add_all([m.CareLink(caregiver_id=cg.id, patient_id=child["id"]),
                    m.CareLink(caregiver_id=cg.id, patient_id=adult["id"]),
                    m.User(username="patient.demo", password_hash=pw, role="patient", patient_id=adult["id"])])
        if os.environ.get("LOADTEST_ACCOUNTS") == "1":  # load test only: 50 phones spread over all patients
            for k in range(50):
                u = m.User(username=f"load.{k}", password_hash=pw, role="caregiver")
                db.add(u)
                db.flush()
                db.add_all(m.CareLink(caregiver_id=u.id, patient_id=p["id"]) for p in pts[k * 3:k * 3 + 3])
        db.commit()
        for p in pts:
            refresh(db, p["id"])
        return True
    finally:
        db.close()


if __name__ == "__main__":
    print("seeded" if seed() else "already seeded, skipped")
