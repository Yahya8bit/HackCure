"""Data model.

Identity (name, phone) lives in `patient_identity`, encrypted, separate from
clinical logs. Clinical tables only know the pseudonymous patient id.
Log rows (seizures, intakes, reports) use client-generated UUIDs as primary
keys, so re-sending the same offline entry can never create a duplicate.
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(16))  # patient | caregiver | clinician
    patient_id: Mapped[str | None] = mapped_column(ForeignKey("patients.id"), nullable=True)  # role=patient only


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # pseudonym, e.g. "P-7F3A9C"
    clinician_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    birth_year: Mapped[int] = mapped_column(Integer)
    sex: Mapped[str] = mapped_column(String(1))  # F | M
    region: Mapped[str] = mapped_column(String(8))  # rural | urban
    pregnant: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    research_consent: Mapped[bool] = mapped_column(Boolean, default=False)  # feedback reuse for retraining
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PatientIdentity(Base):
    """Directly identifying data. Encrypted at rest (AES-256-GCM)."""
    __tablename__ = "patient_identity"
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), primary_key=True)
    name_enc: Mapped[str] = mapped_column(Text)
    phone_enc: Mapped[str] = mapped_column(Text)


class CareLink(Base):
    __tablename__ = "care_links"
    caregiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), primary_key=True)


class Medication(Base):
    __tablename__ = "medications"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    drug_name: Mapped[str] = mapped_column(String(64))
    dose_text: Mapped[str] = mapped_column(String(64))  # as prescribed; the app never changes it
    times: Mapped[list] = mapped_column(JSON)  # ["08:00", "20:00"]
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Seizure(Base):
    __tablename__ = "seizures"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # client UUID
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    duration_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category: Mapped[str] = mapped_column(String(32))
    triggers: Mapped[list] = mapped_column(JSON, default=list)
    injury: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)  # caregiver free text
    ai_category: Mapped[str | None] = mapped_column(String(32), nullable=True)  # clinician-only suggestion
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_highlights: Mapped[list | None] = mapped_column(JSON, nullable=True)
    ai_model_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    confirmed_category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    logged_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Intake(Base):
    __tablename__ = "intakes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # client UUID
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    medication_id: Mapped[int | None] = mapped_column(ForeignKey("medications.id"), nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(8))  # taken | missed
    logged_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Report(Base):
    """Other patient-reported facts: poor sleep, side effect, pregnancy."""
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # client UUID
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # poor_sleep | side_effect | pregnancy | trigger
    detail: Mapped[str | None] = mapped_column(String(200), nullable=True)
    logged_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(120), index=True)  # dedup key from the engine
    type: Mapped[str] = mapped_column(String(32))
    severity: Mapped[str] = mapped_column(String(8))  # urgent | high | medium | low
    reasons: Mapped[list] = mapped_column(JSON)
    data_points: Mapped[list] = mapped_column(JSON)
    confidence: Mapped[str] = mapped_column(String(8))  # high | medium | low
    confidence_note: Mapped[str | None] = mapped_column(String(400), nullable=True)  # English fallback
    confidence_notes: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [{code, params, text}] for translation
    status: Mapped[str] = mapped_column(String(10), default="open")  # open | validated | dismissed
    # Duplicates collapse into one open alert per patient and type (alert-fatigue fix):
    occurrences: Mapped[int] = mapped_column(Integer, default=1)
    keys: Mapped[list] = mapped_column(JSON, default=list)  # every engine key folded into this alert
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    rules_version: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class AuditEntry(Base):
    """Append-only, hash-chained. hash = sha256(prev_hash + canonical JSON of the entry)."""
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[str] = mapped_column(String(40))  # ISO string, hashed as-is
    actor: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(48))
    target: Mapped[str] = mapped_column(String(80))
    reason: Mapped[str] = mapped_column(Text, default="")
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64), unique=True)


class AiFeedback(Base):
    """Clinician confirmation/correction of a classifier suggestion (kept only with consent)."""
    __tablename__ = "ai_feedback"
    id: Mapped[int] = mapped_column(primary_key=True)
    seizure_id: Mapped[str] = mapped_column(ForeignKey("seizures.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    suggested: Mapped[str | None] = mapped_column(String(32), nullable=True)
    confirmed: Mapped[str] = mapped_column(String(32))
    clinician_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
