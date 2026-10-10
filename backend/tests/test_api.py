import os
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update

os.environ.setdefault("DEMO_PASSWORD", "demo1234")

from nawba import models as m  # noqa: E402
from nawba.audit import verify_chain  # noqa: E402
from nawba.db import SessionLocal  # noqa: E402
from nawba.main import app  # noqa: E402
from scripts.seed import seed  # noqa: E402


@pytest.fixture(scope="module")
def client():
    seed()
    with TestClient(app) as c:
        yield c


def login(c, user):
    r = c.post("/auth/login", json={"username": user, "password": "demo1234"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def seizure(pid, **kw):
    return {"type": "seizure", "data": {"id": str(uuid.uuid4()), "patient_id": pid,
            "started_at": datetime.now(timezone.utc).isoformat(), "duration_s": 60,
            "category": "absence", "triggers": ["poor_sleep"], "injury": False, **kw}}


def test_login_rejects_bad_password(client):
    assert client.post("/auth/login", json={"username": "dr.demo", "password": "nope"}).status_code == 401
    assert client.get("/me").status_code == 401


def test_caregiver_sync_is_idempotent_and_scoped(client):
    h = login(client, "caregiver.demo")
    pids = [p["id"] for p in client.get("/me", headers=h).json()["patients"]]
    assert len(pids) == 2
    entry = seizure(pids[0])
    r1 = client.post("/sync", headers=h, json={"entries": [entry, entry]}).json()["results"]
    assert [x["status"] for x in r1] == ["created", "duplicate"]
    r2 = client.post("/sync", headers=h, json={"entries": [entry]}).json()["results"]
    assert r2[0]["status"] == "duplicate"
    with SessionLocal() as db:
        other = db.scalars(select(m.Patient.id).where(m.Patient.id.not_in(pids))).first()
    r3 = client.post("/sync", headers=h, json={"entries": [seizure(other), seizure(pids[0], category="made_up")]}).json()
    assert [x["status"] for x in r3["results"]] == ["rejected", "rejected"]


def test_pregnancy_report_alerts_clinician_and_patient_sees_only_safe_message(client):
    h = login(client, "patient.demo")
    pid = client.get("/me", headers=h).json()["patients"][0]["id"]
    report = {"type": "report", "data": {"id": str(uuid.uuid4()), "patient_id": pid,
              "at": datetime.now(timezone.utc).isoformat(), "kind": "pregnancy"}}
    r = client.post("/sync?lang=en", headers=h, json={"entries": [report]}).json()
    assert r["messages"] == ["Do not stop your treatment on your own. Contact your doctor as soon as possible."]
    detail = client.get(f"/clinic/patients/{pid}", headers=login(client, "dr.demo")).json()
    assert any(a["type"] == "pregnancy_sensitive_drug" and a["severity"] == "urgent" for a in detail["alerts"])
    ranked = client.get("/clinic/patients", headers=login(client, "dr.demo")).json()
    assert ranked[0]["top_severity"] == "urgent"


def test_clinician_scoping(client):
    with SessionLocal() as db:
        other_dr = db.scalars(select(m.User).where(m.User.username == "dr.other")).one()
        foreign = db.scalars(select(m.Patient.id).where(m.Patient.clinician_id != other_dr.id)).first()
    h = login(client, "dr.other")
    assert len(client.get("/clinic/patients", headers=h).json()) == 10
    assert client.get(f"/clinic/patients/{foreign}", headers=h).status_code == 404
    assert client.get("/clinic/patients", headers=login(client, "patient.demo")).status_code == 403


def test_identity_encrypted_at_rest(client):
    with SessionLocal() as db:
        ident = db.scalars(select(m.PatientIdentity)).first()
    assert " " not in ident.name_enc and not ident.phone_enc.startswith("+216")


def test_alert_action_is_audited_and_chain_detects_tampering(client):
    h = login(client, "dr.demo")
    pid = client.get("/clinic/patients", headers=h).json()[0]["id"]
    with SessionLocal() as db:
        a = m.Alert(patient_id=pid, key="t", type="test", severity="high", reasons=["r"], data_points=[],
                    confidence="high", rules_version="t")
        db.add(a)
        db.commit()
        aid = a.id
    r = client.post(f"/clinic/alerts/{aid}/action", headers=h, json={"action": "validate", "reason": "seen"})
    assert r.json()["alert"]["status"] == "validated"
    assert client.get("/clinic/audit/verify", headers=h).json()["ok"]
    with SessionLocal() as db:
        db.execute(update(m.AuditEntry).where(m.AuditEntry.reason == "seen").values(reason="edited"))
        db.commit()
        assert verify_chain(db)[0] is False
