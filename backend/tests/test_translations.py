"""F1: every engine/summary message and every alert type is translated into French, Arabic and Darija,
with exactly the same {placeholders} as the English template."""
import json
import re
from pathlib import Path

from ai.summary import SUMMARY_EN
from engine.alerts import ALERT_TYPES, MESSAGES_EN

# /shared is the frontend translation folder mounted read-only by `make test`; fall back to the repo path.
STRINGS = next(p for p in (Path("/shared/strings.json"), Path(__file__).resolve().parents[2] / "frontend/src/shared/strings.json") if p.exists())
S = json.loads(STRINGS.read_text(encoding="utf-8"))
LANGS = ("fr", "ar", "darija")
fields = lambda s: set(re.findall(r"{(\w+)(?::[^}]*)?}", s))  # noqa: E731  ({odds:,} counts as {odds})


def test_every_message_code_has_three_translations_with_same_placeholders():
    for code, english in {**MESSAGES_EN, **SUMMARY_EN}.items():
        for lang in LANGS:
            text = S[lang].get(f"msg_{code}")
            assert text, f"msg_{code} missing in {lang}"
            assert fields(text) == fields(english), f"msg_{code} placeholders differ in {lang}"


def test_every_alert_type_and_confidence_level_is_translated():
    for lang in LANGS:
        for t in ALERT_TYPES:
            assert S[lang].get(f"type_{t}"), f"type_{t} missing in {lang}"
        for c in ("high", "medium", "low"):
            assert S[lang].get(f"conf_{c}"), f"conf_{c} missing in {lang}"


def test_engine_only_emits_known_types_and_codes():
    from tests.test_engine import NOW, run, sz  # reuse the engine scenarios
    alerts = run([sz(1, 30, duration=400), sz(2, 5, injury=True), sz(3, 4), sz(4, 3)])
    for a in alerts:
        assert a["type"] in ALERT_TYPES
        for m in a["reasons"] + a["confidence_notes"]:
            assert m["code"] in MESSAGES_EN and m["text"]
    assert NOW


def test_review_notice_matches_the_translation_file():
    from nawba.legal import REVIEW_NOTICE
    assert REVIEW_NOTICE == {lang: S[lang]["review_notice"] for lang in LANGS}
