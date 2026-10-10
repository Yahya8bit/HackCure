# EXPLAIN — what each part does and why (plain language)

Each build step adds 3–5 sentences here so every teammate can defend the code.

## Phase 0 — skeleton
The backend is a FastAPI app in `backend/nawba/`; `/health` lets Docker know it is alive.
Secrets (signing key, encryption key, DB password) are read only from environment variables; demo values live only in `.env.example`.
Every clinical number or message (5-minute threshold, 190, first-aid text, pregnancy-sensitive drugs) lives in one file, `config/clinical_rules.yaml`, marked TODO-verify, so a neurologist can review one file instead of hunting through code.
`make test` runs the Python tests against a throwaway SQLite database; Docker Compose runs the real system on PostgreSQL.
