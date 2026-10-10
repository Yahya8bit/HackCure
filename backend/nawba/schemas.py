"""Input validation at the trust boundary. Allowed categories/tags come from the clinical config."""
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, field_validator

from .settings import rules

Uuid = Annotated[str, Field(pattern=r"^[0-9a-fA-F-]{36}$")]
PatientId = Annotated[str, Field(pattern=r"^P-[0-9A-F]{6}$")]


def _not_future(v: datetime) -> datetime:
    if v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    if v > datetime.now(timezone.utc) + timedelta(hours=24):
        raise ValueError("timestamp is in the future")
    return v


class Login(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class SeizureIn(BaseModel):
    id: Uuid
    patient_id: PatientId
    started_at: datetime
    duration_s: int | None = Field(default=None, ge=0, le=4 * 3600)
    category: str
    triggers: list[str] = Field(default_factory=list, max_length=5)
    injury: bool = False
    description: str | None = Field(default=None, max_length=1000)

    _ts = field_validator("started_at")(_not_future)

    @field_validator("category")
    @classmethod
    def known_category(cls, v):
        if v not in rules()["seizure_categories"]:
            raise ValueError("unknown category")
        return v

    @field_validator("triggers")
    @classmethod
    def known_triggers(cls, v):
        if not set(v) <= set(rules()["trigger_tags"]):
            raise ValueError("unknown trigger tag")
        return list(dict.fromkeys(v))


class IntakeIn(BaseModel):
    id: Uuid
    patient_id: PatientId
    medication_id: int | None = None
    scheduled_at: datetime
    status: Literal["taken", "missed"]

    _ts = field_validator("scheduled_at")(_not_future)


class ReportIn(BaseModel):
    id: Uuid
    patient_id: PatientId
    at: datetime
    kind: Literal["poor_sleep", "side_effect", "pregnancy", "trigger"]
    detail: str | None = Field(default=None, max_length=200)

    _ts = field_validator("at")(_not_future)


class SyncEntry(BaseModel):
    type: Literal["seizure", "intake", "report"]
    data: dict


class SyncIn(BaseModel):
    entries: list[SyncEntry] = Field(max_length=500)


ENTRY_MODELS: dict[str, type[BaseModel]] = {"seizure": SeizureIn, "intake": IntakeIn, "report": ReportIn}
EntryIn = Union[SeizureIn, IntakeIn, ReportIn]


class MedicationIn(BaseModel):
    drug_name: str = Field(min_length=1, max_length=64)
    dose_text: str = Field(min_length=1, max_length=64)
    times: list[Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]] = Field(min_length=1, max_length=6)


class AlertAction(BaseModel):
    action: Literal["validate", "dismiss", "call"]
    reason: str = Field(default="", max_length=500)
