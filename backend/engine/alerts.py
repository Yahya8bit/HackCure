"""Explainable, advisory alert engine. Pure Python: no database, no web.

    evaluate(patient, seizures, intakes, reports, medications, now, cfg) -> list[alert dict]

Inputs are plain dicts (see the field names used below). Every alert carries
type, severity, plain-language reasons, the data points behind it and a
confidence level. The engine never diagnoses and never suggests a dose change;
it only tells the clinician what the logged data shows.

Three layers, all thresholds from config/clinical_rules.yaml (TODO-verify):
  1. rules     prolonged seizure, cluster, injury, pregnancy + sensitive drug
  2. trends    recent seizure rate vs the patient's own baseline; adherence drop
  3. insights  "k of the last n seizures were within 24 h of X" (observation, not cause)
"""
import math
from datetime import datetime, timedelta

RULE_LOOKBACK = timedelta(days=14)  # direct-report rules only look at recent events


def poisson_tail(k: int, lam: float) -> float:
    """P(X >= k) for X ~ Poisson(lam): how often k or more seizures happen by chance at rate lam."""
    return max(0.0, 1.0 - sum(math.exp(-lam) * lam ** i / math.factorial(i) for i in range(k)))


def pregnancy_eligible(patient: dict, now: datetime, cfg: dict) -> bool:
    """Same rule as the patient app's pregnancy option (config pregnancy_eligibility, TODO-verify)."""
    e = cfg["pregnancy_eligibility"]
    age = now.year - patient.get("birth_year", now.year)
    return patient.get("sex") == e["sex"] and e["min_age"] <= age <= e["max_age"]


def _week(now: datetime) -> str:
    y, w, _ = now.isocalendar()
    return f"{y}-W{w:02d}"


def _point(kind: str, row: dict, at_key: str, value) -> dict:
    return {"kind": kind, "id": row["id"], "at": row[at_key].isoformat(), "value": value}


def completeness(intakes, medications, now, cfg) -> tuple[float, str, str]:
    """Share of scheduled doses in the adherence window that were logged at all."""
    days = cfg["adherence"]["window_days"]
    expected = days * sum(len(m["times"]) for m in medications) or 1
    logged = sum(1 for i in intakes if now - timedelta(days=days) <= i["scheduled_at"] <= now)
    ratio = min(logged / expected, 1.0)
    c = cfg["confidence"]
    level = "high" if ratio >= c["high_min_completeness"] else "medium" if ratio >= c["medium_min_completeness"] else "low"
    note = f"{logged} of {expected} scheduled doses in the last {days} days were logged ({ratio:.0%})."
    if level != "high":
        note += " Data is incomplete, so this alert is less certain."
    return ratio, level, note


def _alert(key, type_, severity, reasons, points, confidence, note, cfg):
    return {"key": key, "type": type_, "severity": severity, "reasons": reasons, "data_points": points,
            "confidence": confidence, "confidence_note": note, "rules_version": cfg["version"]}


def rule_alerts(patient, seizures, medications, now, cfg):
    out = []
    direct = ("high", "Directly reported by the patient or caregiver.")
    recent = [s for s in seizures if now - RULE_LOOKBACK <= s["started_at"] <= now]

    limit = cfg["prolonged_seizure"]["threshold_seconds"]
    for s in recent:
        if s["duration_s"] is not None and s["duration_s"] > limit:
            out.append(_alert(f"prolonged:{s['id']}", "prolonged_seizure", cfg["prolonged_seizure"]["severity"],
                              [f"Seizure lasted {s['duration_s'] // 60} min {s['duration_s'] % 60} s, above the "
                               f"{limit // 60}-minute threshold."],
                              [_point("seizure", s, "started_at", s["duration_s"])], *direct, cfg))
        if s["injury"]:
            out.append(_alert(f"injury:{s['id']}", "injury", cfg["injury"]["severity"],
                              ["An injury was reported with this seizure."],
                              [_point("seizure", s, "started_at", "injury")], *direct, cfg))

    n, window = cfg["cluster"]["count"], timedelta(hours=cfg["cluster"]["window_hours"])
    i = 0
    while i < len(recent):
        group = [s for s in recent[i:] if s["started_at"] - recent[i]["started_at"] <= window]
        if len(group) >= n:
            out.append(_alert(f"cluster:{group[0]['id']}", "cluster", cfg["cluster"]["severity"],
                              [f"{len(group)} seizures within {cfg['cluster']['window_hours']} h "
                               f"(threshold: {n})."],
                              [_point("seizure", s, "started_at", s["category"]) for s in group], *direct, cfg))
            i += len(group)
        else:
            i += 1

    sensitive = [d.lower() for d in cfg["pregnancy_sensitive_drugs"]["drugs"]]
    flagged = [m for m in medications if any(d in m["drug_name"].lower() for d in sensitive)]
    if patient.get("pregnant") and flagged and pregnancy_eligible(patient, now, cfg):
        names = ", ".join(m["drug_name"] for m in flagged)
        out.append(_alert(f"pregnancy:{patient['id']}", "pregnancy_sensitive_drug",
                          cfg["pregnancy_sensitive_drugs"]["severity"],
                          [f"Pregnancy reported while the medication list includes {names}, "
                           "flagged pregnancy-sensitive in the configuration. Please review promptly. "
                           "The patient was told not to stop treatment on their own and to contact their doctor."],
                          [{"kind": "medication", "id": m["id"], "at": None, "value": m["drug_name"]} for m in flagged],
                          *direct, cfg))
    return out


def trend_alerts(patient, seizures, intakes, medications, now, cfg, first_data_at):
    out = []
    _, conf, note = completeness(intakes, medications, now, cfg)
    t = cfg["trend"]
    r0 = now - timedelta(days=t["recent_days"])
    b0 = r0 - timedelta(days=t["baseline_days"])
    recent = [s for s in seizures if r0 < s["started_at"] <= now]
    base = [s for s in seizures if b0 < s["started_at"] <= r0]
    # Expected count in a recent-sized window at the patient's own rate. At least 1 baseline seizure is
    # assumed so a short or seizure-free history does not make every small count look "significant".
    base_rate = max(len(base), 1) * t["recent_days"] / t["baseline_days"]
    p = poisson_tail(len(recent), base_rate)
    if len(recent) >= t["min_recent_count"] and p < t["max_p_value"]:
        c, n = conf, note
        if first_data_at is None or first_data_at > b0:
            c, n = "low", note + " Less than the full baseline period is available for this patient."
        out.append(_alert(f"trend:{_week(now)}", "seizure_increase", t["severity"],
                          [f"{len(recent)} seizures in the last {t['recent_days']} days vs about {base_rate:.1f} "
                           f"expected from this patient's previous {t['baseline_days']} days "
                           f"(this many by chance: about 1 in {max(int(1 / max(p, 1e-9)), 1):,})."],
                          [_point("seizure", s, "started_at", s["category"]) for s in recent], c, n, cfg))

    a = cfg["adherence"]
    window = [x for x in intakes if now - timedelta(days=a["window_days"]) <= x["scheduled_at"] <= now]
    if window:
        taken = sum(x["status"] == "taken" for x in window)
        ratio = taken / len(window)
        if ratio < a["min_taken_ratio"]:
            missed = [x for x in window if x["status"] == "missed"]
            out.append(_alert(f"adherence:{_week(now)}", "adherence_drop", a["severity"],
                              [f"{taken} of {len(window)} logged doses taken in the last {a['window_days']} days "
                               f"({ratio:.0%}, below {a['min_taken_ratio']:.0%})."],
                              [_point("intake", x, "scheduled_at", "missed") for x in missed], conf, note, cfg))
    return out


def insight_alerts(seizures, intakes, reports, now, cfg):
    """Observation only: how many recent seizures were logged shortly after a possible trigger."""
    ins = cfg["insight"]
    last = [s for s in seizures if s["started_at"] <= now][-ins["last_n_seizures"]:]
    if len(last) < ins["last_n_seizures"]:
        return []
    w = timedelta(hours=ins["window_hours"])
    missed = [x["scheduled_at"] for x in intakes if x["status"] == "missed"]
    sleep = [r["at"] for r in reports if r["kind"] == "poor_sleep"]
    checks = {
        "missed_dose": ("a missed dose", lambda s: "missed_dose" in s["triggers"] or any(s["started_at"] - w <= t <= s["started_at"] for t in missed)),
        "poor_sleep": ("a night of poor sleep", lambda s: "poor_sleep" in s["triggers"] or any(s["started_at"] - w <= t <= s["started_at"] for t in sleep)),
    }
    out = []
    for kind, (label, hit) in checks.items():
        matches = [s for s in last if hit(s)]
        if len(matches) >= ins["min_matches"]:
            out.append(_alert(f"insight:{kind}:{last[-1]['id']}", f"insight_{kind}", "low",
                              [f"{len(matches)} of the last {len(last)} seizures were logged within "
                               f"{ins['window_hours']} h of {label}. This is an observation, not a proven cause."],
                              [_point("seizure", s, "started_at", kind) for s in matches],
                              "medium", "Based on self-reported logs; unlogged triggers are not counted.", cfg))
    return out


def evaluate(patient, seizures, intakes, reports, medications, now, cfg) -> list[dict]:
    seizures = sorted((s for s in seizures if s["started_at"] <= now), key=lambda s: s["started_at"])
    intakes = [i for i in intakes if i["scheduled_at"] <= now]
    reports = [r for r in reports if r["at"] <= now]
    times = [s["started_at"] for s in seizures] + [i["scheduled_at"] for i in intakes]
    first = min(times) if times else None
    return (rule_alerts(patient, seizures, medications, now, cfg)
            + trend_alerts(patient, seizures, intakes, medications, now, cfg, first)
            + insight_alerts(seizures, intakes, reports, now, cfg))
