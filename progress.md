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

## UI redesign brief (second prompt) — done
- Pass 1: `docs/DESIGN_PLAN.md` (tokens, reference-project extraction from p-guard, wireframes, self-review).
- Pass 2: `frontend/src/shared/tokens.css` + `styles.css`, local fonts `src/shared/fonts/`, icons `src/shared/icons.jsx`,
  patient `src/patient/{App,Seizure,screens}.jsx`, clinician `src/clinic/{App,charts}.jsx`.
- Fixes 1–6 done (see checks.md UI8). Backend: rules-0.2.0 (Poisson trend, pregnancy eligibility, alert collapsing,
  tiers), generator mix 70/12/10/8, fictitious phones, `/patients/{id}/entries`, risk-0.2.0 (retrained on new mix).
- Evidence: `docs/ui/before|after/` (48 + 48), `frontend/e2e/{e2e,a11y,measure,screens}.mjs`, checks.md UI1–UI10.
- Decisions: severity tints added on team request (beyond "two loud places", kept to 6–7 % tints); dashboard advisory
  shows translation + exact English sentence (check 12); charts LTR in Arabic; nginx gzip for static only (BREACH).
- Failed attempts: fontsource CSS imports shipped every subset (CSS 34 KB) → replaced by own 8-file fonts.css;
  e2e "confirm" click missed twice (disabled-button race, then puppeteer scroll under the fixed strip) → wait for enabled
  + centre before click; the hard-coded "close to chance" verdict became false with new data → wording now data-driven.

## Open issues
- Engine alert reasons are English inside French/Arabic dashboards (needs reason templates + translations).
- Arabic/Darija strings and the pregnancy age range (12–55) are TODO-verify.
- Each e2e/screenshot run adds seizures to the demo caregiver's child (P-5EDBB8); reset the DB before a live demo.
- Disk on this machine is ~99 % full; prune dangling images after rebuilds.

## Next action
Reset the demo DB (`docker compose down && docker volume rm epilipsy_dbdata && docker compose up -d --wait`) before
the jury demo, then ask a native speaker to review `frontend/src/shared/strings.json` (ar, darija).

## Pre-demo hardening brief (third prompt) — done (F1–F10, see checks.md)
- Rules followed: no prune / volume rm executed by the agent; destructive script paths (`demo_reset.sh --yes`) left to a human.
- Verification method without touching the demo DB: throwaway project `nawba_check` (`scripts/check.override.yml`,
  ports 9443/9080, tmpfs DB, reuses `nawba-api:local` / `nawba-web:local`). Stop it with
  `docker compose -p nawba_check -f docker-compose.yml -f scripts/check.override.yml down`.
- Failed attempts: e2e English scan hung (background tab pauses requestAnimationFrame) → bringToFront; detector false
  positives on French words → English-only word list; demo_check cleared the shared localStorage → per-app keys;
  verify_clean_clone first draft used an invalid `--pull never` and `--rmi` that would have removed postgres.
- Human needed: run `scripts/demo_reset.sh` (the current demo DB predates F1/F3/F4: English reasons, no cast, no check.demo);
  run `scripts/verify_clean_clone.sh` on a machine with >= 2 GB free; decide disk cleanup (`scripts/disk_report.sh`);
  trust the certificate (`docs/DEMO_DAY.md`); native review of ar/darija strings; clinician review of rules and the
  pregnancy age range; counsel review of legal wording.
- Next brief in progress: landing page at /welcome (the user's newer request lifts the feature freeze for that page only).
