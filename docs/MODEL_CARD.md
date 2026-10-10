# MODEL_CARD — Nawba AI module

Two small local models. No external AI API, no generative language model. Both are **advisory, clinician-only**,
and **not clinically validated**. All numbers are copied from files produced by scripts in this repository
(`backend/reports/ai_evaluation.md`, from `python -m scripts.evaluate_ai`, run 2026-10-10); none are rounded up or edited.

> **Read this first.** Both models were trained and tested on data the team made up: a 75-row placeholder text file
> written by the AI assistant, and synthetic patients generated from rules we chose. A model trained on synthetic data
> mostly recovers the rules used to generate that data. These results prove that the **pipeline** works end-to-end;
> they say nothing about clinical validity.

---

## Model 1 — Caregiver description classifier (`desc-clf-0.1.0`)

| | |
|---|---|
| **Purpose** | Suggest one seizure category from a caregiver's free-text description in Darija (Latin "Arabizi" or Arabic script), Arabic or French, e.g. "tah w bda yortoch w ma ja3rafnech". Saves the clinician reading time; it does not classify seizures for the patient. |
| **Intended users** | Neurologists, in the dashboard only. The caregiver only ever sees "description saved". |
| **Output** | One of `generalized_tonic_clonic`, `focal_impaired_awareness`, `absence`, `myoclonic`, `unclear` (list from `config/clinical_rules.yaml`, TODO-verify) + confidence + the words that pushed the score up (highlighted). Below confidence 0.45 (TODO-verify) the output is `unclear`. |
| **Model** | Character n-gram TF-IDF (`char_wb`, 2–5 characters) + multinomial logistic regression (C = 5, class-balanced). Character pieces make "yortoch / yorto3ch / yertoch" look alike. Code: `backend/ai/classifier.py`. |
| **Training data** | `data/descriptions_labeled.csv`: **75 placeholder sentences written by the AI assistant**, labels not reviewed by any clinician; 4 scripts (arabizi 24, french 23, arabic_darija 14, arabic 14). **TODO for the team: replace with ≥ 150 real-style examples reviewed by a medical student or neurologist.** |
| **Split** | Stratified 70/30, seed 0, made before any tuning → train 52, test 23. Hyper-parameters were never tuned on the test set. |
| **Version** | `desc-clf-0.1.0`; stored with every suggestion (`seizures.ai_model_version`). |

### Metrics (test set, n = 23)

| metric | value |
|---|---|
| Accuracy with the `unclear` threshold (what the clinician sees) | **0.174** |
| Accuracy of the raw top choice (no threshold) | 0.565 |

Per class, with threshold: absence P 0.00 / R 0.00; focal_impaired_awareness P 1.00 / R 0.20;
generalized_tonic_clonic P 0.00 / R 0.00; myoclonic P 0.00 / R 0.00; unclear P 0.14 / R 1.00.
Full confusion matrix in `backend/reports/ai_evaluation.md`: 18 of 23 test sentences were returned as `unclear`.

**Interpretation:** with 52 training sentences the model is rarely ≥ 45 % confident, so it mostly (and safely) says
"unclear". The threshold behaves as intended — it refuses rather than guesses — but the model is **not useful yet**.
The threshold was fixed in the config before evaluation; it should be re-chosen by cross-validation on the training
data once real data exists.

### Subgroup results (by script, test set)

| script | n | accuracy | flag |
|---|---|---|---|
| arabic | 2 | 0.000 | flagged worse |
| arabic_darija | 5 | 0.200 | |
| arabizi | 10 | 0.200 | |
| french | 6 | 0.167 | |

With 2–10 examples per group, one sentence moves accuracy by 10–50 points: these differences are noise, but the flag is
kept as required. Child/adult, sex and region are not recorded for the text data.

### Limitations
Placeholder data; no real caregiver language; no spelling-variant stress test; no negation handling ("ma tahch" = did
not fall); a single description can fit several categories; Arabic diacritics and Darija code-switching barely covered.

---

## Model 2 — 7-day elevated-seizure risk estimate (`risk-0.1.0`)

| | |
|---|---|
| **Purpose** | Rank which patients may need attention this week, with reasons. |
| **Intended users** | Neurologists, dashboard only. **Never shown to patients. Never phrased as a certainty** ("Statistical estimate from logged data, not a prediction or a diagnosis."). |
| **Output** | Band low / medium / high (cut-offs 0.3 / 0.6, TODO-verify), the top 3 contributing factors in plain language, model version, and a low-data warning. |
| **Label** | "Elevated week" = seizures in the next 7 days ≥ max(2, 1.5 × the patient's own weekly rate over the previous 12 weeks) (TODO-verify). |
| **Features (7)** | seizures in last 28 d; seizures in last 7 d; recent rate vs own baseline; missed doses (14 d); poor-sleep nights (14 d); seizures with a logged trigger (28 d); share of scheduled doses that were logged (completeness). |
| **Model** | Standardised features + logistic regression. Explanation = coefficient × standardised value per feature (exact, no approximation). Code: `backend/ai/risk.py`. |
| **Training data** | Synthetic only: 150 patients × 6 months from `scripts/synthetic.py` (seed 42). Split **by patient**: 105 train / 45 held-out test (seed 7). One snapshot per patient-week over the last 10 weeks → 945 train rows (235 positive), 405 test rows (114 positive). |
| **Threshold** | 0.255, chosen by Youden's J on training data only. |
| **Version** | `risk-0.1.0`. |

### Metrics (held-out synthetic patients, 405 rows)

| | ROC AUC | Brier | sensitivity | false-alarm rate |
|---|---|---|---|---|
| model `risk-0.1.0` | 0.533 | 0.209 | 0.395 | 0.375 |
| non-AI baseline: seizures in last 4 weeks | 0.511 | 0.210 | 0.596 | 0.595 |

AUC difference model − baseline: +0.022, 95 % patient-bootstrap interval [−0.046, +0.078].

**Does the model beat the baseline? No — not demonstrably.** The interval includes zero; both are close to chance
(AUC 0.5). Why: in the generator, next week's seizures depend mostly on random draws and on next week's missed doses,
which nobody can know in advance; and the label compares next week to a baseline that already includes recent weeks.
So on this synthetic task there is little to predict. We report this rather than tuning the label until it looks good.

### Subgroup results (held-out)

| subgroup | n | positives | AUC | sensitivity | false-alarm rate | flag |
|---|---|---|---|---|---|---|
| child | 99 | 26 | 0.401 | 0.269 | 0.356 | flagged worse |
| adult | 306 | 88 | 0.567 | 0.432 | 0.381 | |
| female | 207 | 69 | 0.534 | 0.377 | 0.362 | |
| male | 198 | 45 | 0.531 | 0.422 | 0.386 | |
| rural | 126 | 41 | 0.627 | 0.561 | 0.365 | |
| urban | 279 | 73 | 0.479 | 0.301 | 0.379 | |

The synthetic generator does not make children, women or rural patients behave differently, so these gaps reflect small
samples, not real bias. Real bias can only be measured on real local data — which is exactly why the "child" flag must
be re-checked first.

### Limitations
Synthetic data; near-chance discrimination; no calibration step beyond logistic regression; features depend on
self-logging (a patient who stops logging looks "low risk" — the low-data warning partly covers this); no seasonality,
no medication changes, no EEG or clinical history.

---

## Human oversight (both models)
- Outputs appear only in the clinician dashboard next to "Advisory only. The clinician decides."
- The clinician confirms or corrects every suggested category; the final category is the clinician's (`seizures.confirmed_category`) and the action is audited.
- Corrections are kept for retraining **only** with the patient's research consent (`ai_feedback`).
- Retraining is never automatic: `python -m scripts.retrain_classifier` is a dry run by default; saving a new version requires `--approve "<name>" --version <label>` and is written to the hash-chained audit log.

## Before any real clinical use (all TODO)
1. Replace the placeholder text data with ≥ 150 (better ≥ 1,000) real, consented, de-identified descriptions labelled by neurologists, with inter-rater agreement measured.
2. Local validation on Tunisian patients (prospective, with neurologist ground truth), including the subgroups above.
3. Neurologist review of every threshold in `docs/CLINICAL_RULES.md`.
4. Regulatory classification as software (possibly a medical device — TODO-verify with the Tunisian authorities) and INPDP authorization for health data.
5. Monitoring after deployment: drift, override rate (how often clinicians correct the model), subgroup performance.
