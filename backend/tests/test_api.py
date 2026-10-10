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


def test_named_demo_cast_drives_the_demo_story(client):
    """F3: the four named fictitious patients produce the alerts the demo script relies on."""
    h = login(client, "dr.demo")
    by = {r["id"]: r for r in client.get("/clinic/patients", headers=h).json()}
    assert by["P-D3A001"]["tier"] == "urgent"            # Amine: prolonged seizure + rising
    assert by["P-D3A002"]["tier"] == "review"            # Sonia: adherence drop
    assert by["P-D3A003"]["tier"] in ("stable", "info")  # Hichem: stable
    assert by["P-D3A004"]["tier"] == "urgent"            # Mariem: pregnancy-sensitive drug
    amine = client.get("/clinic/patients/P-D3A001", headers=h).json()
    assert {a["type"] for a in amine["alerts"]} >= {"prolonged_seizure", "seizure_increase"}
    desc = next(s for s in amine["seizures"] if s["description"])
    assert desc["ai_category"] and desc["ai_highlights"]   # Darija description -> clinician-only suggestion
    assert all(p["phone"].startswith("+216 00 000 9") for p in [client.get(f"/clinic/patients/{i}", headers=h).json()["patient"]
                                                                for i in ("P-D3A001", "P-D3A004")])


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
    assert ranked[0]["tier"] == "urgent"
    assert len(ranked[0]["rhythm"]) == 30 and all(len(d) == 2 for d in ranked[0]["rhythm"])


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


def test_consent_gate_export_and_delete(client):
    h = login(client, "caregiver.demo")
    pts = client.get("/me", headers=h).json()["patients"]
    child = min(pts, key=lambda p: -p["birth_year"])  # youngest
    adult = max(pts, key=lambda p: -p["birth_year"])
    with SessionLocal() as db:
        db.get(m.Patient, child["id"]).consent_at = None
        db.commit()
    r = client.post("/sync", headers=h, json={"entries": [seizure(child["id"])]}).json()["results"][0]
    assert r == {"id": r["id"], "status": "rejected", "error": "consent required"}
    assert client.post(f"/patients/{child['id']}/consent", headers=h, json={"research": True}).status_code == 200
    assert client.post("/sync", headers=h, json={"entries": [seizure(child["id"])]}).json()["results"][0]["status"] == "created"
    assert client.get(f"/patients/{adult['id']}/export", headers=h).status_code == 403  # caregiver of an adult
    export = client.get(f"/patients/{child['id']}/export", headers=h).json()
    assert export["identity"]["name"] and export["seizures"]
    assert client.delete(f"/patients/{child['id']}", headers=h).json() == {"deleted": child["id"]}
    with SessionLocal() as db:
        assert db.get(m.Patient, child["id"]) is None
        assert not db.scalars(select(m.Seizure).where(m.Seizure.patient_id == child["id"])).first()


def test_ai_suggestion_is_clinician_only_and_feedback_needs_consent(client):
    hp = login(client, "patient.demo")
    pid = client.get("/me", headers=hp).json()["patients"][0]["id"]
    entry = seizure(pid, description="tah w bda yortoch w ma ja3rafnech", category="unclear")
    r = client.post("/sync", headers=hp, json={"entries": [entry]}).json()
    assert "ai" not in str(r).lower().replace("rejected", "")  # patient response carries no suggestion
    hd = login(client, "dr.demo")
    s = next(x for x in client.get(f"/clinic/patients/{pid}", headers=hd).json()["seizures"] if x["id"] == entry["data"]["id"])
    assert s["ai_category"] and s["ai_highlights"] and 0 < s["ai_confidence"] <= 1
    # no research consent -> correction recorded on the seizure, NOT kept for retraining
    r = client.post(f"/clinic/seizures/{s['id']}/category", headers=hd, json={"category": "generalized_tonic_clonic"}).json()
    assert r == {"confirmed_category": "generalized_tonic_clonic", "feedback_kept": False}
    with SessionLocal() as db:
        db.get(m.Patient, pid).research_consent = True
        db.commit()
    r = client.post(f"/clinic/seizures/{s['id']}/category", headers=hd, json={"category": "generalized_tonic_clonic"}).json()
    assert r["feedback_kept"] is True


def test_insights_risk_summary_and_fhir(client):
    hd = login(client, "dr.demo")
    pid = client.get("/clinic/patients", headers=hd).json()[1]["id"]
    ins = client.get(f"/clinic/patients/{pid}/insights", headers=hd).json()
    assert ins["risk"]["band"] in ("low", "medium", "high") and len(ins["risk"]["factors"]) == 3
    assert ins["risk"]["model_version"] and "not a prediction" in ins["risk"]["wording"]
    assert ins["summary"][0]["text"].endswith("previous 3 months.") and "points" in ins["summary"][0]
    bundle = client.get(f"/clinic/patients/{pid}/fhir", headers=hd).json()
    kinds = {e["resource"]["resourceType"] for e in bundle["entry"]}
    assert kinds == {"Patient", "Observation", "MedicationStatement"}
    assert "name" not in bundle["entry"][0]["resource"]  # pseudonymous
    assert client.get(f"/clinic/patients/{pid}/insights", headers=login(client, "patient.demo")).status_code == 403


def test_rate_limiter_blocks_after_limit():
    from nawba.security import rate_limited
    assert not any(rate_limited("test-ip", limit=3) for _ in range(3))
    assert rate_limited("test-ip", limit=3)


def test_input_validation_rejects_bad_entries(client):
    h = login(client, "caregiver.demo")
    pid = client.get("/me", headers=h).json()["patients"][0]["id"]
    bad = [seizure(pid, duration_s=-5), seizure(pid, triggers=["witchcraft"]), seizure(pid, started_at="2999-01-01T00:00:00Z"),
           {"type": "seizure", "data": {"id": "not-a-uuid", "patient_id": pid}}]
    assert [x["status"] for x in client.post("/sync", headers=h, json={"entries": bad}).json()["results"]] == ["rejected"] * 4
    assert client.post("/sync", headers=h, json={"entries": [{"type": "drop_table", "data": {}}]}).status_code == 422


def test_pregnancy_option_only_for_eligible_patients(client):
    with SessionLocal() as db:  # link the caregiver to a young girl (an earlier test deleted the seeded child)
        cg = db.scalars(select(m.User).where(m.User.username == "caregiver.demo")).one()
        girl = db.scalars(select(m.Patient).where(m.Patient.sex == "F", m.Patient.birth_year > datetime.now().year - 10)).first()
        if not db.get(m.CareLink, (cg.id, girl.id)):
            db.add(m.CareLink(caregiver_id=cg.id, patient_id=girl.id))
            db.commit()
        gid = girl.id
    h = login(client, "caregiver.demo")
    child = next(p for p in client.get("/me", headers=h).json()["patients"] if p["id"] == gid)
    assert child["can_report_pregnancy"] is False
    report = {"type": "report", "data": {"id": str(uuid.uuid4()), "patient_id": child["id"],
              "at": datetime.now(timezone.utc).isoformat(), "kind": "pregnancy"}}
    r = client.post("/sync", headers=h, json={"entries": [report]}).json()["results"][0]
    assert r["status"] == "rejected" and "not applicable" in r["error"]
    assert login(client, "patient.demo") and client.get("/me", headers=login(client, "patient.demo")).json()["patients"][0]["can_report_pregnancy"]


def test_duplicate_alerts_collapse_into_one_per_type(client):
    h = login(client, "patient.demo")
    pid = client.get("/me", headers=h).json()["patients"][0]["id"]
    for _ in range(2):
        client.post("/sync", headers=h, json={"entries": [seizure(pid, duration_s=400)]})
    detail = client.get(f"/clinic/patients/{pid}", headers=login(client, "dr.demo")).json()
    prolonged = [a for a in detail["alerts"] if a["type"] == "prolonged_seizure" and a["status"] == "open"]
    assert len(prolonged) == 1 and prolonged[0]["occurrences"] >= 2


def test_entries_endpoint_lists_recent_logs_for_any_device(client):
    h = login(client, "patient.demo")
    pid = client.get("/me", headers=h).json()["patients"][0]["id"]
    entries = client.get(f"/patients/{pid}/entries", headers=h).json()
    assert entries and {e["type"] for e in entries} >= {"seizure", "intake"}
    assert entries == sorted(entries, key=lambda e: e["at"], reverse=True)
    assert client.get(f"/patients/{pid}/entries", headers=login(client, "dr.other")).status_code == 404


def test_synthetic_phone_numbers_are_fictitious():
    from scripts.synthetic import generate
    assert all(p["phone"].startswith("+216 00 000 ") and "(fictif)" in p["name"] for p in generate()["patients"])


def test_sensitive_queue_view_is_presentation_only(client):
    h = login(client, "dr.demo")
    with SessionLocal() as db:
        n_alerts = db.query(m.Alert).count()
    default = client.get("/clinic/patients", headers=h).json()
    extended = client.get("/clinic/patients?sensitive=1", headers=h).json()
    assert not any(r.get("sensitive_only") for r in default)
    extra = [r for r in extended if r.get("sensitive_only")]
    assert all(r["tier"] in ("info", "stable") and r["sensitive_reason"]["code"] == "trend" for r in extra)
    assert [r["id"] for r in default] == [r["id"] for r in extended]  # same rows, only marked
    with SessionLocal() as db:
        assert db.query(m.Alert).count() == n_alerts  # no alert created

