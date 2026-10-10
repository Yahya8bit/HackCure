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
| 2 | Phase 1 data model + synthetic generator | done |
| 3 | Phase 2 backend API | done |
| 4 | Phase 5 alert engine (moved before UI) | done |
| 5 | Phase 7 backend: consent / export / delete | done |
| 6 | Phases 3–4 patient PWA + offline queue + TLS proxy | done |
| 7 | Phase 6 dashboard | done |

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
- Build order: alert engine (Phase 5) built before the UI because it is pure Python (no disk cost) and the e2e flow needs it.
- Tests run inside the api Docker image (`make test`) after the disk-full incident; frontend tests via `npm test` (node:test, no deps).
- Frontend deps limited to react, react-dom, vite, @vitejs/plugin-react; SVG charts, IndexedDB and service worker hand-written.
- Consent is enforced server-side: `/sync` rejects entries for a patient with no consent.
- Only the patient (or a caregiver of a child < 18) may consent/export/delete.
- Frontend: one Vite React project with two entry points (patient PWA, clinician dashboard) — separate bundles, shared i18n/api client.

## Open issues
- DISK: root filesystem was 100 % full mid-session (Docker build). Local `.venv` was deleted to recover;
  Python tests now run inside the api image (`make test`). ~1 GB free at Phase 6. Do not create large local envs.
- Model routing (PROMPT.md): the agent cannot switch its own model; Phases 0–6 were done on Opus in one session.
- E2E browser test not yet written (google-chrome exists at /usr/bin/google-chrome).

## Next action
Phase 6b: AI module (classifier, risk model, template summaries) + e2e browser test.
