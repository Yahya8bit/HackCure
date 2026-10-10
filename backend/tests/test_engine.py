from datetime import datetime, timedelta, timezone

from engine.alerts import evaluate
from nawba.settings import rules

NOW = datetime(2026, 10, 10, 12, tzinfo=timezone.utc)
MED = [{"id": 1, "drug_name": "levetiracetam", "times": ["08:00", "20:00"]}]
PATIENT = {"id": "P-000001", "pregnant": False, "sex": "F", "birth_year": 1995}


def sz(i, hours_ago, duration=60, injury=False, triggers=()):
    return {"id": f"s{i}", "started_at": NOW - timedelta(hours=hours_ago), "duration_s": duration,
            "category": "absence", "triggers": list(triggers), "injury": injury}


def full_intakes(days=14, missed_every=0):
    out = []
    for d in range(days):
        for h in (8, 20):
            k = len(out)
            out.append({"id": f"i{k}", "scheduled_at": NOW.replace(hour=h) - timedelta(days=d + 1),
                        "status": "missed" if missed_every and k % missed_every == 0 else "taken"})
    return out


def types(alerts):
    return sorted(a["type"] for a in alerts)


def run(seizures=(), intakes=None, reports=(), meds=MED, patient=PATIENT):
    return evaluate(patient, list(seizures), full_intakes() if intakes is None else intakes, list(reports), meds, NOW, rules())


def test_quiet_patient_has_no_alerts():
    assert run([sz(1, 24 * 40)]) == []


def test_prolonged_injury_cluster():
    alerts = run([sz(1, 30, duration=400), sz(2, 5, injury=True), sz(3, 4), sz(4, 3)])
    # 4 recent seizures vs an empty baseline also (correctly) raises seizure_increase
    assert types(alerts) == ["cluster", "injury", "prolonged_seizure", "seizure_increase"]
    for a in alerts:  # check 11: every alert is explainable
        assert a["reasons"] and a["data_points"] and a["confidence"] in ("high", "medium", "low")
    assert {a["severity"] for a in alerts if a["type"] in ("cluster", "prolonged_seizure")} == {"urgent"}


def test_pregnancy_with_sensitive_drug_only():
    preg = {"id": "P-000001", "pregnant": True, "sex": "F", "birth_year": 1995}
    assert types(run(patient=preg)) == []
    alerts = run(patient=preg, meds=[{"id": 2, "drug_name": "Valproate", "times": ["08:00"]}])
    assert types(alerts) == ["pregnancy_sensitive_drug"] and alerts[0]["severity"] == "urgent"
    # fix 1: the rule only applies within the configured sex / age range (6-year-old girl -> no alert)
    child = {"id": "P-000002", "pregnant": True, "sex": "F", "birth_year": NOW.year - 6}
    assert types(run(patient=child, meds=[{"id": 2, "drug_name": "valproate", "times": ["08:00"]}])) == []


def test_trend_against_personal_baseline_is_a_significance_test():
    baseline = [sz(i, 24 * (40 + 20 * i)) for i in range(3)]  # 3 in the previous 12 weeks -> ~1 expected per 4 weeks
    rising = [sz(10 + i, 24 * (2 + 5 * i)) for i in range(5)]  # 5 in the last 4 weeks: P(X>=5 | 1) ~ 0.004
    alert = next(a for a in run(baseline + rising) if a["type"] == "seizure_increase")
    assert "by chance: about 1 in" in alert["reasons"][0]["text"] and alert["reasons"][0]["code"] == "trend"
    assert "seizure_increase" not in types(run(baseline + rising[:3]))  # 3 vs 1 expected: P ~ 0.08, not significant
    busy = [sz(20 + i, 24 * (30 + 3 * i)) for i in range(25)]  # high-rate patient: 25 in baseline
    assert "seizure_increase" not in types(run(busy + rising))  # 5 recent is normal for them


def test_adherence_drop_and_low_confidence_when_data_missing():
    alerts = run(intakes=full_intakes(missed_every=3))
    adh = next(a for a in alerts if a["type"] == "adherence_drop")
    assert adh["confidence"] == "high"
    sparse = run(intakes=full_intakes(days=4, missed_every=2))
    adh = next(a for a in sparse if a["type"] == "adherence_drop")
    assert adh["confidence"] == "low" and "incomplete" in adh["confidence_note"]
    assert [n["code"] for n in adh["confidence_notes"]] == ["completeness", "incomplete"]


def test_insight_is_observation_not_cause():
    seizures = [sz(i, 24 * 3 * i + 2, triggers=["missed_dose"] if i < 4 else []) for i in range(5)]
    insight = next(a for a in run(seizures) if a["type"] == "insight_missed_dose")
    assert "4 of the last 5" in insight["reasons"][0]["text"] and "not a proven cause" in insight["reasons"][0]["text"]
    assert insight["reasons"][0]["params"] == {"k": 4, "n": 5, "hours": 24}
