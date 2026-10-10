"""Synthetic data generator — fixed seed, NO real data.

Generates ~150 patients over 6 months as plain dicts (no DB), so the seed
script, the alert evaluation and the AI training all use the same data.

Model of a patient (deliberately simple and explainable):
  - a personal baseline seizure rate (seizures/week);
  - each missed dose raises the seizure chance for the next 24 h (x2.5);
  - each poor-sleep night raises it too (x1.8);
  - archetypes add a known pattern on top:
      stable          baseline only, good adherence
      rising          rate x3 from a hidden `onset_day` (ground truth for evaluation)
      poor_adherence  adherence falls from ~95 % to ~55 % from `onset_day`
      cluster         occasional days with 3-4 seizures within a few hours
  - ~20 % of patients also have missing-data gaps (no intake logging for 1-3 weeks).
These multipliers are synthetic assumptions, NOT clinical facts.
"""
import random
import uuid
from datetime import datetime, timedelta, timezone

SEED = 42
N_PATIENTS = 150
DAYS = 182
DEFAULT_END = datetime(2026, 10, 10, tzinfo=timezone.utc)

# Mix revised in the UI/alert-fatigue pass: 50 % deteriorating patients at once was not plausible
# for a clinic list (TODO-verify a realistic mix with a neurologist).
ARCHETYPES = [("stable", 0.70), ("rising", 0.12), ("poor_adherence", 0.10), ("cluster", 0.08)]
DRUGS = [("levetiracetam", "500 mg"), ("valproate", "500 mg"), ("carbamazepine", "200 mg"), ("lamotrigine", "100 mg")]
CATEGORIES = ["generalized_tonic_clonic", "focal_impaired_awareness", "absence", "myoclonic"]
FIRST = ["Amine", "Yassine", "Mariem", "Sarra", "Ahmed", "Nour", "Rania", "Skander", "Ines", "Walid", "Hiba", "Omar"]
LAST = ["Ben Ali", "Trabelsi", "Jebali", "Gharbi", "Mejri", "Bouazizi", "Chaabane", "Hammami", "Ayari", "Sassi"]

MISSED_DOSE_HAZARD = 2.5
POOR_SLEEP_HAZARD = 1.8
RISING_FACTOR = 3.0


def _uuid(rng: random.Random) -> str:
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def _pick(rng, weighted):
    r, acc = rng.random(), 0.0
    for value, w in weighted:
        acc += w
        if r < acc:
            return value
    return weighted[-1][0]


def generate(seed: int = SEED, n: int = N_PATIENTS, days: int = DAYS, end: datetime = DEFAULT_END) -> dict:
    rng = random.Random(seed)
    start = (end - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    out = {"patients": [], "medications": [], "seizures": [], "intakes": [], "reports": [], "truth": {}}

    for i in range(n):
        pid = f"P-{rng.getrandbits(24):06X}"
        archetype = _pick(rng, ARCHETYPES)
        child = rng.random() < 0.25
        sex = rng.choice("FM")
        age = rng.randint(4, 17) if child else rng.randint(18, 70)
        drug, dose = rng.choice(DRUGS)
        pregnant = (not child and sex == "F" and age < 40 and rng.random() < 0.08)
        onset = rng.randint(days - 80, days - 20) if archetype in ("rising", "poor_adherence") else None
        gaps = []
        if rng.random() < 0.20:
            g0 = rng.randint(0, days - 30)
            gaps.append((g0, g0 + rng.randint(7, 21)))

        out["patients"].append({
            "id": pid, "birth_year": end.year - age, "sex": sex,
            "region": "rural" if rng.random() < 0.4 else "urban", "pregnant": pregnant,
            "name": f"{rng.choice(FIRST)} {rng.choice(LAST)[0]}. (fictif)", "phone": f"+216 00 000 {i:03d}",  # clearly fictitious: no real number starts with 00 000
        })
        times = ["08:00", "20:00"]
        out["medications"].append({"patient_id": pid, "drug_name": drug, "dose_text": dose, "times": times})
        out["truth"][pid] = {"archetype": archetype, "onset_day": onset, "child": child,
                             "missing_gaps": gaps, "start": start.isoformat()}

        weekly = rng.uniform(0.15, 1.2)
        main_cat = rng.choice(CATEGORIES)
        p_taken = rng.uniform(0.9, 0.99)
        last_missed = None  # datetime of last missed dose
        for d in range(days):
            day = start + timedelta(days=d)
            in_gap = any(a <= d < b for a, b in gaps)
            taken_p = 0.55 if archetype == "poor_adherence" and d >= onset else p_taken
            for t in times:
                at = day.replace(hour=int(t[:2]))
                status = "taken" if rng.random() < taken_p else "missed"
                if status == "missed":
                    last_missed = at
                if not in_gap:
                    out["intakes"].append({"id": _uuid(rng), "patient_id": pid, "scheduled_at": at, "status": status})
            poor_sleep = rng.random() < 0.08
            if poor_sleep:
                out["reports"].append({"id": _uuid(rng), "patient_id": pid, "at": day.replace(hour=7), "kind": "poor_sleep", "detail": None})

            hazard = weekly / 7
            if archetype == "rising" and d >= onset:
                hazard *= RISING_FACTOR
            missed_recent = last_missed is not None and (day + timedelta(hours=12) - last_missed) <= timedelta(hours=24)
            if missed_recent:
                hazard *= MISSED_DOSE_HAZARD
            if poor_sleep:
                hazard *= POOR_SLEEP_HAZARD
            count = 1 if rng.random() < min(hazard, 0.9) else 0
            if archetype == "cluster" and rng.random() < 0.012:
                count = rng.randint(3, 4)
            for k in range(count):
                at = day.replace(hour=rng.randint(9, 22)) + timedelta(minutes=k * rng.randint(20, 90))
                triggers = []
                if missed_recent and rng.random() < 0.7:
                    triggers.append("missed_dose")
                if poor_sleep and rng.random() < 0.7:
                    triggers.append("poor_sleep")
                if rng.random() < 0.05:
                    triggers.append(rng.choice(["fever", "stress", "other"]))
                duration = int(min(rng.lognormvariate(4.4, 0.6), 900))  # median ~80 s; a few > 5 min
                out["seizures"].append({
                    "id": _uuid(rng), "patient_id": pid, "started_at": at, "duration_s": duration,
                    "category": main_cat if rng.random() < 0.85 else "unclear",
                    "triggers": triggers, "injury": rng.random() < 0.03, "description": None,
                })
    return out


if __name__ == "__main__":
    data = generate()
    from collections import Counter
    print({k: len(v) for k, v in data.items()})
    print(Counter(t["archetype"] for t in data["truth"].values()))
    # self-check: fixed seed is reproducible
    assert generate()["seizures"][0]["id"] == data["seizures"][0]["id"]
    assert len(data["patients"]) == N_PATIENTS
