"""Named demo cast (F3) — 4 fictitious patients, fully deterministic (no randomness), added on top of
the 150 synthetic background patients by scripts/seed.py. All names and phone numbers are fictitious.

  P-D3A001  Amine K. (fictif), 8, boy      escalating seizures, one prolonged, a Darija description
  P-D3A002  Sonia B. (fictif), 34, woman   missed doses over the last two weeks
  P-D3A003  Hichem T. (fictif), 45, man    stable
  P-D3A004  Mariem S. (fictif), 29, woman  on valproate, pregnancy reported -> pregnancy-sensitive rule
"""
import uuid
from datetime import datetime, timedelta

CAST = [
    {"id": "P-D3A001", "name": "Amine K. (fictif)", "phone": "+216 00 000 901", "age": 8, "sex": "M", "region": "rural",
     "drug": ("levetiracetam", "250 mg")},
    {"id": "P-D3A002", "name": "Sonia B. (fictif)", "phone": "+216 00 000 902", "age": 34, "sex": "F", "region": "urban",
     "drug": ("lamotrigine", "100 mg")},
    {"id": "P-D3A003", "name": "Hichem T. (fictif)", "phone": "+216 00 000 903", "age": 45, "sex": "M", "region": "urban",
     "drug": ("carbamazepine", "200 mg")},
    {"id": "P-D3A004", "name": "Mariem S. (fictif)", "phone": "+216 00 000 904", "age": 29, "sex": "F", "region": "rural",
     "drug": ("valproate", "500 mg")},
]
DARIJA_DESCRIPTION = "tah w bda yortoch w ma ja3rafnech"  # "he fell, started shaking and did not recognise us"


def _id(*parts) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "nawba-demo/" + "/".join(map(str, parts))))


def build(end: datetime) -> dict:
    day = lambda d, h=10: (end - timedelta(days=d)).replace(hour=h, minute=0, second=0, microsecond=0)  # noqa: E731
    out = {"patients": [], "medications": [], "seizures": [], "intakes": [], "reports": []}
    for c in CAST:
        out["patients"].append({"id": c["id"], "birth_year": end.year - c["age"], "sex": c["sex"], "region": c["region"],
                                "pregnant": c["id"] == "P-D3A004", "name": c["name"], "phone": c["phone"]})
        out["medications"].append({"patient_id": c["id"], "drug_name": c["drug"][0], "dose_text": c["drug"][1], "times": ["08:00", "20:00"]})

    def seizure(pid, d, dur, cat="generalized_tonic_clonic", triggers=(), injury=False, description=None, h=16):
        out["seizures"].append({"id": _id(pid, "s", d, h), "patient_id": pid, "started_at": day(d, h), "duration_s": dur,
                                "category": cat, "triggers": list(triggers), "injury": injury, "description": description})

    # Amine: ~1 seizure a month before, then 6 in the last three weeks, one prolonged two days ago.
    for d in (110, 80, 50):
        seizure("P-D3A001", d, 70)
    for d, dur in ((20, 80), (15, 95), (11, 60), (7, 110), (4, 75)):
        seizure("P-D3A001", d, dur, triggers=("poor_sleep",) if d in (11, 4) else ())
    seizure("P-D3A001", 2, 400, injury=False, description=DARIJA_DESCRIPTION)
    # Hichem: one seizure a month, stable. Sonia: two in the period. Mariem: one, three months ago.
    for d in (100, 70, 40, 12):
        seizure("P-D3A003", d, 60, cat="focal_impaired_awareness")
    for d in (90, 25):
        seizure("P-D3A002", d, 50, cat="absence")
    seizure("P-D3A004", 95, 65)

    for c in CAST:
        for d in range(1, 121):
            for h in (8, 20):
                missed = (c["id"] == "P-D3A002" and d <= 14 and (d + h) % 2 == 0)  # Sonia: half her doses missed recently
                out["intakes"].append({"id": _id(c["id"], "i", d, h), "patient_id": c["id"], "scheduled_at": day(d, h),
                                       "status": "missed" if missed else "taken"})
    out["reports"].append({"id": _id("P-D3A004", "pregnancy"), "patient_id": "P-D3A004", "at": day(1, 9),
                           "kind": "pregnancy", "detail": None})
    out["reports"] += [{"id": _id("P-D3A001", "sleep", d), "patient_id": "P-D3A001", "at": day(d, 7), "kind": "poor_sleep", "detail": None}
                       for d in (11, 4)]
    return out
