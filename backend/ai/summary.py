"""Consultation summary from fixed sentence templates (no generative language model).

Every sentence carries the ids of the records it was computed from, so the
dashboard can show exactly which data points back each statement.
"""
from datetime import datetime, timedelta

# Same pattern as the alert engine: {code, params, text}; dashboards translate "msg_<code>".
SUMMARY_EN = {
    "sum_count": "{n} seizure(s) in the last 30 days vs {before}/month over the previous 3 months.",
    "sum_missed": "{k} of {n} were logged within {hours} h of a missed dose (observation, not a proven cause).",
    "sum_adherence": "{taken} of {total} logged doses taken in the last 30 days ({pct}%).",
    "sum_no_doses": "No doses were logged in the last 30 days (adherence unknown).",
    "sum_longest": "Longest seizure in the last 30 days: {m} min {s} s on {date}.",
    "sum_injuries": "{n} injury(ies) reported in the last 30 days.",
    "sum_reports": "Reported in the last 30 days: {sleep} poor-sleep night(s), {side} side-effect report(s).",
}


def _line(code, points, **params):
    return {"code": code, "params": params, "text": SUMMARY_EN[code].format(**params), "points": points}


def _pts(kind, rows):
    return [{"kind": kind, "id": r["id"]} for r in rows]


def summarize(seizures, intakes, reports, now: datetime, window_hours: int = 24) -> list[dict]:
    d30, d120 = now - timedelta(days=30), now - timedelta(days=120)
    recent = [s for s in seizures if d30 < s["started_at"] <= now]
    before = [s for s in seizures if d120 < s["started_at"] <= d30]
    out = [_line("sum_count", _pts("seizure", recent), n=len(recent), before=f"{len(before) / 3:.1f}")]

    missed = [i for i in intakes if i["status"] == "missed"]
    w = timedelta(hours=window_hours)
    after_missed = [s for s in recent if "missed_dose" in s["triggers"]
                    or any(s["started_at"] - w <= m["scheduled_at"] <= s["started_at"] for m in missed)]
    if recent:
        out.append(_line("sum_missed", _pts("seizure", after_missed), k=len(after_missed), n=len(recent), hours=window_hours))

    month = [i for i in intakes if d30 < i["scheduled_at"] <= now]
    if month:
        taken = sum(i["status"] == "taken" for i in month)
        out.append(_line("sum_adherence", _pts("intake", [i for i in month if i["status"] == "missed"]),
                         taken=taken, total=len(month), pct=round(taken / len(month) * 100)))
    else:
        out.append(_line("sum_no_doses", []))

    timed = [s for s in recent if s["duration_s"] is not None]
    if timed:
        longest = max(timed, key=lambda s: s["duration_s"])
        out.append(_line("sum_longest", _pts("seizure", [longest]), m=longest["duration_s"] // 60,
                         s=longest["duration_s"] % 60, date=f"{longest['started_at']:%Y-%m-%d}"))
    injuries = [s for s in recent if s["injury"]]
    if injuries:
        out.append(_line("sum_injuries", _pts("seizure", injuries), n=len(injuries)))
    sleep = [r for r in reports if d30 < r["at"] <= now and r["kind"] == "poor_sleep"]
    side = [r for r in reports if d30 < r["at"] <= now and r["kind"] == "side_effect"]
    if sleep or side:
        out.append(_line("sum_reports", _pts("report", sleep + side), sleep=len(sleep), side=len(side)))
    return out


if __name__ == "__main__":
    from datetime import timezone
    now = datetime(2026, 10, 10, tzinfo=timezone.utc)
    s = [{"id": f"s{i}", "started_at": now - timedelta(days=i * 4 + 1), "duration_s": 60 + i, "triggers": [], "injury": False} for i in range(6)]
    i = [{"id": "i1", "scheduled_at": now - timedelta(days=1, hours=2), "status": "missed"}]
    lines = summarize(s, i, [], now)
    assert lines[0]["text"].startswith("6 seizure(s) in the last 30 days") and len(lines[0]["points"]) == 6
    assert lines[1]["text"].startswith("1 of 6")
    print("\n".join(x["text"] for x in lines))
