# NEXT — good ideas deliberately NOT built (feature freeze before the demo)

Each item was noticed during the pre-demo hardening; none is implemented.

- **Alembic migrations** instead of `ensure_columns()` (which only adds nullable columns).
- **Caregiver invitation and revocation flow** approved by the patient (links are seeded today).
- **App PIN / biometric lock** for shared phones.
- **Real push reminders** (Web Push via a self-hosted server) instead of in-app timers.
- **Clinician notification** of urgent alerts (SMS/email gateway hosted in Tunisia), with rate limits.
- **Audit-chain anchoring**: publish the latest hash daily outside the database; DB permissions so the app can only INSERT into `audit_log`.
- **Key management** (KMS/HSM) and key rotation for `ENCRYPTION_KEY`.
- **Global rate limiter** (nginx `limit_req` or Redis) instead of per-worker memory.
- **Per-alert "seuil bas" history**: record when a patient first appeared in the low-threshold view.
- **Arabic-Indic digit option** in the Arabic UI (currently Latin digits).
- **Translation of risk-factor numbers and data-point values** (dates are localized; some raw values are shown as-is).
- **Classifier**: replace the 75-row placeholder with ≥ 150 clinician-reviewed descriptions; choose the `unclear` threshold by cross-validation.
- **Risk model**: a label definition that predicts something beyond the seizure count, evaluated on real data.
- **Second-machine CI job** running `scripts/verify_clean_clone.sh` automatically.
