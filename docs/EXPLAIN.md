# EXPLAIN — what each part does and why (plain language)

Each build step adds 3–5 sentences here so every teammate can defend the code.

## Phase 0 — skeleton
The backend is a FastAPI app in `backend/nawba/`; `/health` lets Docker know it is alive.
Secrets (signing key, encryption key, DB password) are read only from environment variables; demo values live only in `.env.example`.
Every clinical number or message (5-minute threshold, 190, first-aid text, pregnancy-sensitive drugs) lives in one file, `config/clinical_rules.yaml`, marked TODO-verify, so a neurologist can review one file instead of hunting through code.
`make test` runs the Python tests against a throwaway SQLite database; Docker Compose runs the real system on PostgreSQL.

## Phase 1 — data model and synthetic data
`backend/nawba/models.py` defines the tables. Clinical tables only know a pseudonymous id like `P-7F3A9C`; the real name and phone live in `patient_identity`, encrypted with AES-256-GCM using a key from the environment.
Every logged entry (seizure, dose, report) uses an ID generated on the phone, so if the phone re-sends the same entry after a bad connection the database simply ignores the duplicate.
`backend/scripts/synthetic.py` invents 150 fake patients over 6 months with a fixed random seed, so everyone gets identical data. Each patient has a personal seizure rate, missed doses and poor sleep raise the chance of a seizure, and some patients get a hidden "deterioration start day" that we later use to measure whether our alerts catch it.
The multipliers in the generator are made-up modelling assumptions, not medical facts; any model trained on this data will mostly learn these assumptions back.

## Phase 2 — backend API
Login returns a signed token (HMAC-SHA256 with a server secret, 8 h expiry); every request sends it, and `deps.py` turns it back into a user.
One function, `can_access`, decides who may see a patient: the patient themself, a linked caregiver, or the patient's own clinician — everyone else gets "not found", so pseudonyms cannot be probed.
`POST /sync` receives the phone's offline queue and applies entries in order; each entry is validated (known category, known trigger tags, no future dates, size limits) and an ID already in the database is answered "duplicate" instead of stored twice.
Clinician actions on alerts (validate, dismiss, call) and every opening of a patient file are written to a hash-chained audit log; `python -m scripts.verify_audit` recomputes the chain and fails if any row was edited or deleted.

## Phase 5 — alert engine (built before the UI; see progress.md)
`backend/engine/alerts.py` is plain Python with no database code: give it one patient's logs and a "now", and it returns a list of alerts. This makes it easy to test and to replay day by day for evaluation.
Layer 1 (rules) flags seizures longer than the configured threshold, clusters (N seizures in a time window), injuries, and pregnancy while the medication list contains a drug flagged pregnancy-sensitive in the config.
Layer 2 (trends) compares the last 4 weeks to the same patient's previous 12 weeks, and flags when fewer than 80 % of logged doses were taken; Layer 3 (insights) says things like "4 of the last 5 seizures were logged within 24 h of a missed dose — an observation, not a proven cause".
Each alert carries its reasons, the exact records behind it and a confidence level; when many scheduled doses were never logged, confidence drops and the alert says the data is incomplete.
For a pregnancy alert the patient only ever sees "Do not stop your treatment on your own. Contact your doctor as soon as possible."; all other alerts are visible to the clinician only.

## Phases 3–4 — patient PWA and offline sync
`frontend/src/patient/App.jsx` is the patient/caregiver app. Logging a seizure takes 3 taps: "Seizure now" starts a timer, "Stop" ends it, and tapping what you saw saves it; trigger tags, injury and a free-text description are optional extras on the same screen.
While the timer runs, the screen shows short first-aid lines; past the configured threshold (5 min, TODO-verify) it turns red and shows a "call 190" button. All of that text comes from `config/clinical_rules.yaml` via `/config/public`, cached on the phone for offline use.
Every entry is first written to IndexedDB (`queue.js`) with a phone-made UUID and shown as "saved on this device"; when the network is back it is sent in order to `/sync` and turns "synced". The service worker (`public/sw.js`) keeps the app itself loading with no network.
Medication reminders say only "Time for your routine" — never the illness or the drug — because lock screens and shared phones are a real stigma risk. Logout first tries to sync, warns if entries would be lost, then wipes the device copy.
nginx (`frontend/nginx.conf`) serves both apps over HTTPS with a self-signed certificate made at first start, adds security headers, and forwards `/api/` to FastAPI.
