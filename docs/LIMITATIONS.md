# LIMITATIONS — what Nawba does not do (yet)

Honest list for the jury and for whoever continues this work.

## Clinical
- **Not clinically validated.** Every threshold, message and drug rule is TODO-verify (`docs/CLINICAL_RULES.md`).
- **Not a certified medical device**; regulatory classification not determined (TODO-verify).
- No alert ≠ the patient is fine: unlogged seizures are invisible.
- Trend rule false-alarm rate is high on synthetic data (33/80 stable patients flagged at least once in 10 weeks at default thresholds) — see `backend/reports/alert_evaluation.md`.
- Seizure categories are a simplified list, not the full ILAE classification.
- Pregnancy-sensitive drug list is a short example (valproate family only).

## Data and AI
- **All data is synthetic** (`scripts/synthetic.py`) or **placeholder** (`data/descriptions_labeled.csv`, 75 sentences written by the AI assistant). No real patient data exists in the repo.
- The description classifier is not useful yet (17 % accuracy with its safety threshold, 57 % raw, on 23 test sentences).
- The risk model does **not** demonstrably beat a simple 4-week seizure-count baseline (AUC 0.533 vs 0.511, bootstrap interval includes 0).
- Subgroup "bias" results are on synthetic data where demographics have no effect; real bias is unmeasured.

## Product
- No in-app caregiver invitation / revocation flow (links are seeded).
- Reminders fire only while the app is open or backgrounded (no push server).
- Clinicians see new alerts only when they open the dashboard (no real-time notification, no SMS).
- No app PIN / biometric lock for shared phones.
- Arabic and Darija wording is provisional (TODO-verify by native speakers).
- No Alembic migrations: schema changes require a fresh database.

## Security / operations
- Encryption key lives in the app environment (no KMS/HSM, no rotation); clinical logs are pseudonymous, not encrypted.
- Audit chain can be rewritten wholesale by a DB admin (no external anchoring yet).
- No token revocation, no 2FA, no account lockout; rate limiter is per worker in memory.
- Self-signed TLS certificate for local use only.
- Measured on one laptop only (load test: median 411 ms, p95 751 ms at 50 concurrent phones).

## Legal (TODO-verify)
- Real use requires patient consent **and** authorization from INPDP (Tunisian personal data protection authority) before processing health data.
