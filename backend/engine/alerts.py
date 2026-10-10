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

# Every message is stored as {code, params, text}: the dashboards translate `code` with `params`
# from frontend/src/shared/strings.json (key "msg_<code>"); `text` is the English fallback,
# identical to the sentences used before localisation.
MESSAGES_EN = {
    "prolonged": "Seizure lasted {m} min {s} s, above the {limit}-minute threshold.",
    "injury": "An injury was reported with this seizure.",
    "cluster": "{n} seizures within {hours} h (threshold: {count}).",
    "pregnancy": ("Pregnancy reported while the medication list includes {drugs}, flagged pregnancy-sensitive in the "
                  "configuration. Please review promptly. The patient was told not to stop treatment on their own "
                  "and to contact their doctor."),
    "trend": ("{n} seizures in the last {recent_days} days vs about {expected} expected from this patient's previous "
              "{baseline_days} days (this many by chance: about 1 in {odds})."),
    "adherence": "{taken} of {total} logged doses taken in the last {days} days ({pct}%, below {min_pct}%).",
    "insight_missed_dose": ("{k} of the last {n} seizures were logged within {hours} h of a missed dose. "
                            "This is an observation, not a proven cause."),
    "insight_poor_sleep": ("{k} of the last {n} seizures were logged within {hours} h of a night of poor sleep. "
                           "This is an observation, not a proven cause."),
    # confidence notes
    "direct": "Directly reported by the patient or caregiver.",
    "completeness": "{logged} of {expected} scheduled doses in the last {days} days were logged ({pct}%).",
    "incomplete": "Data is incomplete, so this alert is less certain.",
    "short_baseline": "Less than the full baseline period is available for this patient.",
    "self_reported": "Based on self-reported logs; unlogged triggers are not counted.",
}


ALERT_TYPES = ("prolonged_seizure", "injury", "cluster", "pregnancy_sensitive_drug", "seizure_increase",
               "adherence_drop", "insight_missed_dose", "insight_poor_sleep")


def msg(code: str, **params) -> dict:
    return {"code": code, "params": params, "text": MESSAGES_EN[code].format(**params)}


def note_text(notes: list[dict]) -> str:
    return " ".join(n["text"] for n in notes)


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


def completeness(intakes, medications, now, cfg) -> tuple[float, str, list]:
    """Share of scheduled doses in the adherence window that were logged at all."""
    days = cfg["adherence"]["window_days"]
    expected = days * sum(len(m["times"]) for m in medications) or 1
    logged = sum(1 for i in intakes if now - timedelta(days=days) <= i["scheduled_at"] <= now)
    ratio = min(logged / expected, 1.0)
    c = cfg["confidence"]
    level = "high" if ratio >= c["high_min_completeness"] else "medium" if ratio >= c["medium_min_completeness"] else "low"
    notes = [msg("completeness", logged=logged, expected=expected, days=days, pct=round(ratio * 100))]
    if level != "high":
        notes.append(msg("incomplete"))
    return ratio, level, notes


def _alert(key, type_, severity, reasons, points, confidence, notes, cfg):
    return {"key": key, "type": type_, "severity": severity, "reasons": reasons, "data_points": points,
            "confidence": confidence, "confidence_notes": notes, "confidence_note": note_text(notes),
            "rules_version": cfg["version"]}


def rule_alerts(patient, seizures, medications, now, cfg):
    out = []
    direct = ("high", [msg("direct")])
    recent = [s for s in seizures if now - RULE_LOOKBACK <= s["started_at"] <= now]

    limit = cfg["prolonged_seizure"]["threshold_seconds"]
    for s in recent:
        if s["duration_s"] is not None and s["duration_s"] > limit:
            out.append(_alert(f"prolonged:{s['id']}", "prolonged_seizure", cfg["prolonged_seizure"]["severity"],
                              [msg("prolonged", m=s["duration_s"] // 60, s=s["duration_s"] % 60, limit=limit // 60)],
                              [_point("seizure", s, "started_at", s["duration_s"])], *direct, cfg))
        if s["injury"]:
            out.append(_alert(f"injury:{s['id']}", "injury", cfg["injury"]["severity"],
                              [msg("injury")],
                              [_point("seizure", s, "started_at", "injury")], *direct, cfg))

    n, window = cfg["cluster"]["count"], timedelta(hours=cfg["cluster"]["window_hours"])
    i = 0
    while i < len(recent):
        group = [s for s in recent[i:] if s["started_at"] - recent[i]["started_at"] <= window]
        if len(group) >= n:
            out.append(_alert(f"cluster:{group[0]['id']}", "cluster", cfg["cluster"]["severity"],
                              [msg("cluster", n=len(group), hours=cfg["cluster"]["window_hours"], count=n)],
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
                          [msg("pregnancy", drugs=names)],
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
            c, n = "low", [*note, msg("short_baseline")]
        out.append(_alert(f"trend:{_week(now)}", "seizure_increase", t["severity"],
                          [msg("trend", n=len(recent), recent_days=t["recent_days"], expected=f"{base_rate:.1f}",
                               baseline_days=t["baseline_days"], odds=f"{max(int(1 / max(p, 1e-9)), 1):,}")],
                          [_point("seizure", s, "started_at", s["category"]) for s in recent], c, n, cfg))

    a = cfg["adherence"]
    window = [x for x in intakes if now - timedelta(days=a["window_days"]) <= x["scheduled_at"] <= now]
    if window:
        taken = sum(x["status"] == "taken" for x in window)
        ratio = taken / len(window)
        if ratio < a["min_taken_ratio"]:
            missed = [x for x in window if x["status"] == "missed"]
            out.append(_alert(f"adherence:{_week(now)}", "adherence_drop", a["severity"],
                              [msg("adherence", taken=taken, total=len(window), days=a["window_days"],
                                   pct=round(ratio * 100), min_pct=round(a["min_taken_ratio"] * 100))],
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
        "missed_dose": (None, lambda s: "missed_dose" in s["triggers"] or any(s["started_at"] - w <= t <= s["started_at"] for t in missed)),
        "poor_sleep": (None, lambda s: "poor_sleep" in s["triggers"] or any(s["started_at"] - w <= t <= s["started_at"] for t in sleep)),
    }
    out = []
    for kind, (_, hit) in checks.items():
        matches = [s for s in last if hit(s)]
        if len(matches) >= ins["min_matches"]:
            out.append(_alert(f"insight:{kind}:{last[-1]['id']}", f"insight_{kind}", "low",
                              [msg(f"insight_{kind}", k=len(matches), n=len(last), hours=ins["window_hours"])],
                              [_point("seizure", s, "started_at", kind) for s in matches],
                              "medium", [msg("self_reported")], cfg))
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
