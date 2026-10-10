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
