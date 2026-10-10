# checks.md — acceptance checks

Verdict: pass / fail / unresolved. A check without evidence is **unresolved**.
Definition of done: every row below is `pass` with evidence, or the run limit (15 checkpoints) is reached.

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | Seizure log in ≤ 3 taps (timer/manual, category, triggers, injury) | unresolved | |
| 2 | First-aid guidance while timer runs; emergency + 190 past threshold | unresolved | |
| 3 | Medication schedule, intake/missed logging, discreet reminders | unresolved | |
| 4 | Caregiver mode; roles patient / caregiver / clinician | unresolved | |
| 5 | Offline IndexedDB queue, ordered sync, client IDs, saved vs synced | unresolved | |
| 6 | French + Arabic labels, Darija key buttons, translation file | unresolved | |
| 7 | Consent screen; export / delete own data | unresolved | |
| 8 | Rule layer (prolonged, cluster, injury, pregnancy + sensitive drug) | unresolved | |
| 9 | Trend layer (recent vs baseline; adherence drop) | unresolved | |
| 10 | Insight layer (observation, not cause) | unresolved | |
| 11 | Alert fields: type, severity, reasons, data points, confidence | unresolved | |
| 12 | "Advisory only. The clinician decides." footer + alert screens | unresolved | |
| 13 | Patient list ranked severity then recency, top reason | unresolved | |
| 14 | Patient detail: seizure timeline, adherence chart, triggers, alert history | unresolved | |
| 15 | Validate / Dismiss / Call ≤ 3 steps, hash-chained audit, verify script | unresolved | |
| 16 | FHIR-style JSON export + printable summary | unresolved | |
| 17 | Pseudonymous IDs; identity separate + AES-256 encrypted | unresolved | |
| 18 | Token auth, RBAC, caregiver/clinician scoping | unresolved | |
| 19 | TLS, validation, rate limit, env secrets, pinned deps, vuln scan | unresolved | |
| 20 | THREAT_MODEL.md covers the 5 named threats | unresolved | |
| 21 | Synthetic generator, fixed seed, ~150 patients, 6 months, archetypes | unresolved | |
| 22 | Alert evaluation: sensitivity, false alarm rate, median time to flag | unresolved | |
| 23 | Load test: median + p95 latency, conditions | unresolved | |
| 24 | README complete incl. legal note | unresolved | |
| 25 | CLINICAL_RULES.md, every rule TODO-verify + validator fields | unresolved | |
| 26 | Description classifier (char n-gram TF-IDF + LR), clinician-only | unresolved | |
| 27 | Labeled data, train/test split, per-class P/R, confusion matrix | unresolved | |
| 28 | Risk estimate, band, top-3 factors, model version, dashboard only | unresolved | |
| 29 | Risk eval vs non-AI baseline (AUC, Brier, sens, FAR) | unresolved | |
| 30 | Subgroup bias check for 26 and 28 | unresolved | |
| 31 | MODEL_CARD.md for each model | unresolved | |
| 32 | Feedback logging with consent; manual retrain, audited | unresolved | |
| 33 | Template consultation summary with links to data points | unresolved | |
