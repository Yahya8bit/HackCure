# CLINICAL_RULES — every clinical rule, threshold and message

**Status: every item is TODO-verify.** Nothing below has been confirmed by a neurologist or an official guideline.
All values live in ONE file, `config/clinical_rules.yaml` (rules version `rules-0.2.0`); the code reads them from there.
To validate an item: a neurologist fills in *Validated by* and *Source* here **and** the matching `validated_by` /
`source` fields in the YAML, then bumps `version`. Every alert stores the rules version that produced it.

Principles enforced in code: the app never diagnoses, never changes or suggests changing a dose, and never tells a
patient to stop a medication. Alerts go to the clinician; "Advisory only. The clinician decides."

## A. Alert rules (engine layer 1 — `backend/engine/alerts.py::rule_alerts`)

| # | Rule | Config key | Current value | Severity | Status | Validated by | Source |
|---|---|---|---|---|---|---|---|
| A1 | Prolonged seizure: logged duration above threshold → alert | `prolonged_seizure.threshold_seconds` | 300 s (5 min) | urgent | TODO-verify | | |
| A2 | Seizure cluster: N or more seizures within a window → alert | `cluster.count`, `cluster.window_hours` | 3 within 24 h | urgent | TODO-verify | | |
| A3 | Injury reported with a seizure → alert | `injury.severity` | — | high | TODO-verify | | |
| A4 | Pregnancy reported while the medication list contains a drug flagged pregnancy-sensitive → urgent clinician alert; patient sees only message M3. Applies only to eligible patients (A6) | `pregnancy_sensitive_drugs.drugs` | valproate, valproic acid, depakine, divalproex (substring match, case-insensitive) | urgent | TODO-verify (drug list incomplete by design) | | |
| A6 | Pregnancy eligibility: the "Je suis enceinte" option, the server-side check and rule A4 apply only to sex F within an age range | `pregnancy_eligibility.sex/min_age/max_age` | F, 12–55 years | — | TODO-verify (placeholder range) | | |
| A5 | Direct-report rules only look at the last 14 days | `RULE_LOOKBACK` in `engine/alerts.py` (technical, not clinical) | 14 days | — | TODO-verify | | |

## B. Trend rules (engine layer 2 — `trend_alerts`)

| # | Rule | Config key | Current value | Severity | Status | Validated by | Source |
|---|---|---|---|---|---|---|---|
| B1 | Seizure increase: the recent count would occur by chance less than `max_p_value` of the time at the patient's own baseline rate (Poisson; baseline floored at 1 seizure), and ≥ minimum count | `trend.recent_days`, `trend.baseline_days`, `trend.max_p_value`, `trend.min_recent_count` | last 28 d vs previous 84 d; p < 0.01; min 3 | medium ("needs review") | TODO-verify — trade-off table in `backend/reports/alert_evaluation.md` | | |
| B2 | Adherence drop: share of logged doses taken in the window below threshold | `adherence.window_days`, `adherence.min_taken_ratio` | 14 d; 80 % | medium | TODO-verify | | |

## C. Insights (engine layer 3 — `insight_alerts`; observation, never cause)

| # | Rule | Config key | Current value | Status | Validated by | Source |
|---|---|---|---|---|---|---|
| C1 | "k of the last n seizures were logged within W h of a missed dose" | `insight.last_n_seizures`, `insight.min_matches`, `insight.window_hours` | n = 5, k ≥ 3, W = 24 h | TODO-verify | | |
| C2 | Same for a poor-sleep night | same keys | same | TODO-verify | | |

## D. Confidence (all alerts)

| # | Rule | Config key | Current value | Status | Validated by | Source |
|---|---|---|---|---|---|---|
| D1 | Data completeness = logged doses / scheduled doses over the adherence window; ≥ high → "high", ≥ medium → "medium", else "low" + "Data is incomplete" note | `confidence.high_min_completeness`, `confidence.medium_min_completeness` | 0.8 / 0.5 | TODO-verify | | |
| D2 | Trend alert confidence forced to "low" when less than the full baseline period exists | code (`trend_alerts`) | — | TODO-verify | | |

## E. Messages shown to patients / caregivers

| # | Message | Config key | Text (fr / ar / en) | Status | Validated by | Source |
|---|---|---|---|---|---|---|
| M1 | First-aid guidance during the timer (3 steps since rules-0.2.0) | `first_aid.fr`, `first_aid.ar` | fr: "Restez calme. Le chrono note la durée." / "Protégez la tête, éloignez les objets. Ne mettez rien dans la bouche." / "Après la crise, placez la personne sur le côté." — ar: same 3 lines in Arabic | TODO-verify (content and Arabic wording) | | |
| M2 | Emergency instruction when the timer passes A1's threshold | `emergency_message`, `emergency.number` | fr: "La crise dure plus de 5 minutes : appelez le 190 maintenant." — number 190 | TODO-verify (190 = SAMU Tunisia; text hard-codes "5 minutes", keep in sync with A1) | | |
| M3 | Pregnancy + sensitive drug (the ONLY alert text a patient sees) | `pregnancy_patient_message` | en: "Do not stop your treatment on your own. Contact your doctor as soon as possible." (+ fr, ar) | TODO-verify | | |
| M4 | Reminder notification (discreet) | `reminder_text` in `frontend/src/shared/strings.json` | fr: "C'est l'heure de votre routine." | TODO-verify wording; must never name the illness or a drug (unit-tested) | | |
| M5 | Seizure category labels (lay wording) | `cat_*` in `strings.json` | e.g. "Chute et convulsions" for generalized tonic-clonic | TODO-verify lay wording and Darija/Arabic translations | | |

## F. Categories and tags

| # | Item | Config key | Current value | Status | Validated by | Source |
|---|---|---|---|---|---|---|
| F1 | Seizure categories (patient app + classifier) | `seizure_categories` | generalized_tonic_clonic, focal_impaired_awareness, absence, myoclonic, unclear | TODO-verify (simplified, not the full ILAE 2017 classification) | | |
| F2 | Trigger tags | `trigger_tags` | missed_dose, poor_sleep, fever, stress, other | TODO-verify | | |

## G. AI thresholds (dashboard only)

| # | Item | Config key | Current value | Status | Validated by | Source |
|---|---|---|---|---|---|---|
| G1 | Classifier: below this confidence the suggestion is "unclear" | `classifier.min_confidence` | 0.45 | TODO-verify | | |
| G2 | Risk label: "elevated week" = next-7-day count ≥ max(2, factor × personal weekly baseline) | `risk.horizon_days`, `risk.elevated_factor` | 7 d, 1.5× | TODO-verify | | |
| G3 | Risk bands | `risk.band_medium`, `risk.band_high` | 0.3 / 0.6 | TODO-verify | | |

## H. Non-clinical but safety-relevant choices

| # | Item | Where | Value | Status |
|---|---|---|---|---|
| H1 | Caregiver of a patient under this age may consent/export/delete for them | `api_patient.py::_may_manage` | 18 years | TODO-verify against Tunisian law |
| H2 | Synthetic-data hazard multipliers (missed dose ×2.5, poor sleep ×1.8, rising ×3) | `scripts/synthetic.py` | modelling assumptions | NOT clinical facts; for test data only |

## Change log

### rules-0.2.0 (UI redesign / alert-fatigue pass, 2026-10-10)
Problem: the dashboard showed 75 of 140 patients with open alerts, many with several duplicates. Causes found:
(1) the synthetic generator made 50 % of patients deteriorate at once (stable 50 / rising 20 / poor adherence 15 /
cluster 15 %) — not plausible for a clinic list; (2) rule B1 "recent ≥ 2× baseline and ≥ 3" fires on random
fluctuation for low-rate patients (33/80 stable patients flagged at least once in 10 weeks); (3) weekly trend/adherence
keys and per-seizure keys created a new alert row each week or event.

Changes:
- Generator mix → stable 70 / rising 12 / poor adherence 10 / cluster 8 % (TODO-verify a realistic mix).
- B1 changed from a 2× ratio to a Poisson significance test at p < 0.01 (check 9 asks for *significant* increases).
- Duplicates collapse: one open alert per patient and type; repeats increase `occurrences` and merge data points.
- Severities grouped into three tiers for the clinician: urgent / needs review (high, medium) / information (low).
- New A6 pregnancy eligibility (fix 1).

Measured effect (`python -m scripts.evaluate_alerts`; new data mix, so not a like-for-like comparison):

| | rules-0.1.0, old mix | rules-0.2.0, new mix |
|---|---|---|
| Trend sensitivity on rising patients | 28/29 = 0.966 | 15/17 = 0.882 |
| Median days from onset to first trend flag | 12 | 22 (slower) |
| Stable patients with a false trend alert in 10 weeks | 33/80 = 0.413 | 18/107 = 0.168 |
| Adherence sensitivity / false alarm | 18/18, 13/80 = 0.163 | 13/13, 18/107 = 0.168 |
| Patients in the default queue (urgent + needs review) on the last day | 75/140 had any open alert | 32/150 = 21.3 % |

Trade-off: fewer false alarms cost later detection and 2 missed rising patients. Choosing p (0.05 / 0.01 / 0.001) is a
clinical decision — see the trade-off table — and remains TODO-verify.
