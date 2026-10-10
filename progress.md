# progress.md — handoff state

## Task
Build Nawba per PROMPT.md: offline-first epilepsy follow-up (patient PWA,
neurologist dashboard, explainable advisory alert engine, local AI module).
Constraints: no external/paid services, no real data, clinical values only in
`config/clinical_rules.yaml` (TODO-verify), never diagnose / change dose /
tell patient to stop medication. Done = all 33 checks in checks.md pass with
evidence, or 15 checkpoints reached.

## Checkpoints
| # | Phase | Status |
|---|---|---|
| 1 | Phase 0 skeleton | done |

## Outputs
- `config/clinical_rules.yaml` — all clinical thresholds/messages
- `backend/nawba/` — settings, db, models, security, audit, main
- `backend/tests/` — pytest; run `make test`
- `docker-compose.yml`, `backend/Dockerfile`, `.env.example`, `Makefile`

## Decisions
- Auth: stdlib HMAC-SHA256 signed tokens + scrypt password hashing instead of a JWT/passlib dependency (fewer deps, ~30 readable lines).
- Encryption: AES-256-GCM via `cryptography` (only crypto dependency).
- Schema: `create_all` at startup, no Alembic (hackathon scope).
- Offline dedup: client-generated UUID is the primary key of every log row.
- Alert engine (`backend/engine/`) will be pure Python with no DB imports so evaluation scripts can run it on synthetic data directly.
- Frontend: one Vite React project with two entry points (patient PWA, clinician dashboard) — separate bundles, shared i18n/api client.

## Open issues
- none yet

## Next action
Phase 1: synthetic data generator + seed script.
