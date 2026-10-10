# Threat model — Nawba (hackathon prototype)

Scope: the code in this repository running via `docker compose` (patient PWA, clinician dashboard,
FastAPI API, PostgreSQL, nginx). Assets: seizure/medication logs, identity (name, phone),
pregnancy status, alerts, the audit log. Every mitigation below points to the code that implements it;
"Residual risk" says honestly what is NOT solved. Status: prototype, not hardened for production.

Actors: patient, caregiver (parent/relative), clinician, system admin, outside attacker,
someone holding or borrowing the patient's phone.

---

## 1. Data leak (database, network, backups, exports)

| Mitigation | Where |
|---|---|
| Pseudonymous patient IDs (`P-7F3A9C`) in every clinical table; name and phone live only in `patient_identity`, encrypted with AES-256-GCM (random nonce per value, key from `ENCRYPTION_KEY` env) | `backend/nawba/models.py`, `security.py` |
| TLS on every external connection (nginx, TLS 1.2/1.3, HSTS); HTTP redirects to HTTPS; the API and DB ports are not published to the host | `frontend/nginx.conf`, `docker-compose.yml` |
| Secrets only from environment; demo values only in `.env.example`; `.env` is git-ignored | `settings.py`, `.gitignore` |
| FHIR export contains the pseudonym only (no name/phone); every export is audited | `api_clinic.py::fhir_export` |
| No external services or AI APIs: all models run locally; no record content leaves the server | `backend/ai/` |
| Input validation (types, enums from config, sizes, no future dates) and a 1 MB body cap | `schemas.py`, `nginx.conf` |
| Pinned dependencies, vulnerability scan (pip-audit, npm audit: 0 known after upgrade) | `checks.md` #19 |
| Login errors do not reveal whether the username exists; unknown/forbidden patients return 404 (no pseudonym probing) | `api_patient.py::login`, `deps.py::patient_access` |

**Residual risk:** clinical logs are pseudonymous but **not encrypted** column-by-column — whoever gets the DB plus
the identity key can re-link everything. The encryption key sits in the same environment as the app; real use needs a
KMS/HSM, key rotation and encrypted disks/backups. Self-signed certificate locally (real CA needed). Pseudonyms can be
re-identified from rich timelines by someone with outside knowledge. The service worker caches `/me` (which includes
the patient's name) on the device for offline use.

## 2. Stigma exposure (lock screen, shared phones, people looking over a shoulder)

| Mitigation | Where |
|---|---|
| Reminder notifications are generic ("Time for your routine.") — never the illness or drug name. A unit test fails if any language's reminder mentions epilepsy, seizure, *nawba* or a drug | `strings.json`, `src/shared/strings.test.js` |
| Neutral app name/title "Nawba" and a plain icon; no medical imagery | `index.html`, `public/icon.svg` |
| Logout wipes the device copy (IndexedDB queue, localStorage, service-worker cache) — after first trying to sync, and warning if unsynced entries would be lost | `src/patient/App.jsx::logout` |
| Patient app and dashboard use separate token keys; the service worker never caches clinician pages or `/api/clinic` responses | `shared/api.js`, `public/sw.js` |
| The risk estimate and the AI category suggestion are never sent to the patient app | `api_clinic.py` (clinician-only routes) |

**Residual risk:** the app list still shows "Nawba" (which means "seizure/episode" in Arabic); a fully disguised name
is a team decision (TODO). No app PIN/biometric lock yet — on a shared phone anyone who opens the app sees the history.
The medication screen shows the drug name inside the app. Reminders only fire while the app/tab is alive (no push server).

## 3. Unauthorized caregiver access

| Mitigation | Where |
|---|---|
| Every patient-scoped request goes through one function `can_access`: patient → self only; caregiver → only patients with a `care_links` row; clinician → only patients whose `clinician_id` is theirs | `deps.py` |
| `/sync` re-checks access for **each** entry; entries for other patients are rejected | `api_patient.py::sync` (test `test_caregiver_sync_is_idempotent_and_scoped`) |
| Only the patient — or a caregiver of a **child** (< 18) — may consent, export or delete; a caregiver of an adult gets 403 | `api_patient.py::_may_manage` (test `test_consent_gate_export_and_delete`) |
| Tokens are HMAC-SHA256-signed, expire after 8 h; passwords hashed with scrypt | `security.py` |
| Rate limiting per client IP (sliding 60 s window) slows password guessing | `main.py`, `security.py` |

**Residual risk:** there is **no in-app flow to create or revoke a caregiver link** — links are created by the seed/admin.
A real deployment needs a patient-approved invitation, link expiry, and a list "who can see my data" with a revoke button.
No token revocation list (a stolen token works until expiry). No account lockout / 2FA. The rate limiter is per API
worker in memory (4 workers → up to 4× the configured limit). Age 18 as the caregiver cut-off is TODO-verify against
Tunisian law.

## 4. Insider misuse (curious clinician, admin)

| Mitigation | Where |
|---|---|
| A clinician only sees their own patients | `deps.py::can_access` (test `test_clinician_scoping`) |
| Every opening of a patient file, every alert action, category correction, export, consent, deletion and model approval is written to an **append-only, hash-chained** audit log (who, what, when, why); `python -m scripts.verify_audit` detects any edited or deleted row | `audit.py`, `scripts/verify_audit.py` (test `test_alert_action_is_audited_and_chain_detects_tampering`) |
| No API route updates or deletes audit rows | `api_*.py` |
| Clinician feedback is kept for retraining only with the patient's research consent; retraining needs a named human approver and is audited | `api_clinic.py::confirm_category`, `scripts/retrain_classifier.py` |

**Residual risk:** a DB administrator can rewrite the *entire* chain consistently. Fix: periodically publish/anchor the
latest hash outside the DB (signed, printed, or sent to the hospital), and use DB-level permissions so the app user can
only INSERT into `audit_log`. Nobody reviews the audit log yet — it needs a named reviewer and alerts on unusual access
(e.g. one clinician opening 100 files at night). Clinicians see name and phone in the detail view by design (to call).

## 5. False reassurance from the app

The most clinically dangerous failure: a patient or clinician trusting the app instead of their own judgment.

| Mitigation | Where |
|---|---|
| The app never diagnoses, never suggests dose changes, never tells a patient to stop medication. The only alert text a patient sees is the configured pregnancy message: "Do not stop your treatment on your own. Contact your doctor as soon as possible." | `alert_service.py::patient_message`, `config/clinical_rules.yaml` |
| First-aid guidance and the emergency instruction (call 190 past the threshold) are shown on the phone during the timer, independent of the network or the server | `src/patient/App.jsx::SeizureLog` (e2e checks it) |
| "Advisory only. The clinician decides." on every dashboard page and every alert card | `src/clinic/App.jsx` (e2e checks the footer) |
| Every alert shows its reasons, data points and a confidence level; incomplete logging lowers confidence and says so; missing weeks are grey in the adherence chart, not "good" | `engine/alerts.py::completeness`, `clinic/charts.jsx` |
| The risk estimate is labelled "Statistical estimate from logged data, not a prediction or a diagnosis", shows its model version, and warns on low data. The evaluation shows it does **not** beat a simple baseline, and the model card says so | `ai/risk.py`, `docs/MODEL_CARD.md` |
| Insights are phrased as observations ("4 of the last 5 … This is an observation, not a proven cause") | `engine/alerts.py::insight_alerts` |
| Every clinical threshold and message is TODO-verify in one file | `config/clinical_rules.yaml`, `docs/CLINICAL_RULES.md` |

**Residual risk:** **no alert does not mean the patient is fine** — unlogged seizures are invisible to the system, and
the trend rule still flags 18/107 stable synthetic patients at least once in 10 weeks (was 33/80 before the
rules-0.2.0 significance test), which can cause alert fatigue; alerts are grouped per patient and tiered to limit it. Alerts are not pushed to the clinician in real time
(they appear when the dashboard is opened). Nothing here is clinically validated.

---

## Other threats considered

| Threat | Mitigation / status |
|---|---|
| XSS stealing tokens from localStorage | React escapes output; strict CSP (`script-src 'self'`, no inline scripts). Residual: tokens in localStorage are readable by any script that runs. |
| Replay / duplicate offline entries | Client UUID is the primary key; re-sent entries answer `duplicate` (tested). |
| Spoofed `X-Real-IP` to dodge rate limits | API not published; nginx overwrites the header. Residual: if the API port is ever exposed, the header becomes spoofable. |
| Denial of service | Rate limit, 1 MB body cap, batch cap of 500 entries per sync. Residual: no global limit, no WAF. |
| Default demo credentials in production | Demo accounts exist only through the seed script; `.env.example` is marked DEMO. TODO: refuse to start with demo secrets outside demo mode. |
| Model poisoning via feedback | Feedback only from authenticated clinicians, only with consent; retraining is manual and audited, with old-vs-new comparison on a fixed test set. |

## Legal context (TODO-verify)
Health data processing in Tunisia requires the patient's consent and authorization from the national data protection
authority (INPDP, law 2004-63) before any real use. Nawba is **not** a certified medical device; its regulatory
classification must be determined before clinical use. TODO-verify both with a lawyer.
