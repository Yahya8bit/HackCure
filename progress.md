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
| 8 | Phase 6b AI module + e2e browser test | done |
| 9 | Check 22 alert evaluation, check 23 load test | done |
| 10 | Phase 9 security pass (dep upgrades, tests, THREAT_MODEL) | done |
| 11 | Phase 10–11 docs (MODEL_CARD, CLINICAL_RULES, LICENSES, LIMITATIONS, README, checks.md) | done — all 33 checks pass with evidence |

## Outputs
- `frontend/` — patient PWA (`src/patient`), dashboard (`src/clinic`), shared i18n/api, `e2e/e2e.mjs`, nginx TLS
- `backend/engine/alerts.py`, `backend/ai/` (classifier, risk, summary), `backend/scripts/` (seed, synthetic, evaluate_alerts, evaluate_ai, train_risk, retrain_classifier, verify_audit)
- `backend/reports/` — measured evaluation outputs; `load/` — k6 script + RESULTS.md
- `docs/` — EXPLAIN, THREAT_MODEL, CLINICAL_RULES, MODEL_CARD, LIMITATIONS, LICENSES
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
- Classifier data is a 75-row placeholder (team must supply ≥150 reviewed rows); classifier not useful yet.
- Risk model does not beat the baseline (honest result; label design makes the synthetic task near-random).
- Trend alert false-alarm rate 33/80 on stable synthetic patients → alert fatigue (UI brief fix 3).
- Failed/abandoned attempts: (1) local .venv — removed after disk-full; (2) load test with 3 accounts — unrealistic hot
  patients (p95 4–5 s); replaced by 50 load accounts (`LOADTEST_ACCOUNTS=1`); (3) classifier loader picked the risk
  model file — fixed by glob `desc-clf-*`; (4) blank page from stale cached HTML / stale dev server — fixed with
  no-cache headers, 404 for missing assets, pinned JSX runtime.

## Next action
UI redesign brief (second pasted prompt): before-screenshots + bundle baseline, then docs/DESIGN_PLAN.md (pass 1).
