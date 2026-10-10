# Nawba — offline-first epilepsy follow-up for Tunisia (hackathon prototype)

Patients and caregivers log seizures in 3 taps (even offline), confirm doses and report triggers in French, Arabic or
Darija. Neurologists see who needs attention first, why, and how sure the system is — then validate, dismiss or call.
**Advisory only. The clinician decides.** All data in this repository is synthetic.

## Install and run (no internet needed at runtime)

Requirements: Docker with Compose v2. First build downloads images and packages once; after that everything runs offline.

```bash
cp .env.example .env            # demo secrets only — change them for anything real
docker compose up -d --build --wait
```

| What | URL | Login (password `demo1234`) |
|---|---|---|
| Patient / caregiver app (PWA) | https://localhost:8443/ | `patient.demo`, `caregiver.demo` |
| Neurologist dashboard | https://localhost:8443/clinic | `dr.demo` (140 patients), `dr.other` (10) |

The certificate is self-signed: accept the browser warning once. Reset the demo data with
`docker compose down && docker volume rm epilipsy_dbdata && docker compose up -d --wait`.

## Architecture

```
 phone (PWA)                         laptop (dashboard)
 React + IndexedDB queue             React, SVG charts
 + service worker (offline)                │
        │  HTTPS (self-signed locally)      │
        └──────────────┬───────────────────┘
                 nginx (TLS, CSP, static files)          frontend/
                       │ /api/
                 FastAPI  ── auth / RBAC / validation / rate limit / audit     backend/nawba/
                   │   └── alert engine (pure Python: rules, trends, insights) backend/engine/
                   │   └── local AI (classifier, risk, template summary)       backend/ai/
                 PostgreSQL  (clinical logs by pseudonym; identity AES-256-GCM encrypted)
 config/clinical_rules.yaml — the ONLY place for clinical thresholds/messages (all TODO-verify)
```

Layers stay separate: the engine and AI never touch the database; `nawba/alert_service.py` is the only glue.

## Tests and evaluation

```bash
make test                                   # backend: 19 pytest tests, run inside the api image
cd frontend && npm install && npm test      # translation + discreet-reminder tests (node:test)
cd frontend && npm run e2e                  # headless Chrome: offline log -> sync -> alert -> validate -> audit
docker compose exec api python -m scripts.verify_audit       # audit hash chain
docker compose run --rm api python -m scripts.evaluate_alerts   # check 22: sensitivity / false alarms / time to flag
docker compose run --rm api python -m scripts.evaluate_ai       # checks 27, 29, 30: AI metrics vs baseline, subgroups
docker run --rm --network host -v ./load:/load grafana/k6:0.55.0 run /load/sync.js   # load test, see load/RESULTS.md
```
Results: `checks.md`, `backend/reports/`, `load/RESULTS.md`. The e2e test expects Chrome at `/usr/bin/google-chrome`
(override with `CHROME=`). The load test needs `LOADTEST_ACCOUNTS=1` at seed time (see `load/RESULTS.md`).

## 3-minute demo script

1. **(0:00) Problem.** "In Tunisia, follow-up between consultations is a paper diary — or nothing. Nawba makes it 3 taps, offline, in Darija."
2. **(0:20) Patient app, offline.** Log in as `caregiver.demo`. In DevTools set *Offline*. Tap **Crise en cours** → the timer shows first-aid steps (from the config, TODO-verify). Tap **Arrêter**, tap **Chute et convulsions**. History shows **"Enregistré sur cet appareil"**. Switch to Arabic/Darija to show RTL labels.
3. **(0:50) Back online.** Turn the network on → the entry turns **"Synchronisé"**. Point out: phone-generated IDs make re-sends harmless.
4. **(1:05) Pregnancy safety rule.** As `patient.demo` (on valproate): Signaler → Je suis enceinte → Confirmer. The patient sees only: *"Do not stop your treatment on your own. Contact your doctor as soon as possible."*
5. **(1:25) Dashboard.** Log in as `dr.demo`. The list is ranked by severity; the pregnancy alert is on top with plain reasons, data points and confidence. Footer: *Advisory only. The clinician decides.*
6. **(1:50) Patient detail.** Timeline, adherence (grey = not logged ≠ missed), triggers, template summary with linked data, the 7-day risk band with its top-3 factors and model version. **Validate** → reason → confirm (2 steps). Run `verify_audit` to show the hash chain.
7. **(2:30) Honesty slide.** Alert evaluation: rising patients flagged 28/29, median 12 days — but 33/80 stable patients flagged. Risk model does **not** beat the simple baseline. All thresholds TODO-verify. Next step: neurologist review + INPDP authorization.

## Limitations
See `docs/LIMITATIONS.md`. Headline: synthetic and placeholder data only; not clinically validated; the AI models are
pipeline demonstrations, not useful predictors yet; no push notifications; no caregiver invitation flow.

## Legal context (TODO-verify)
Health data is sensitive personal data. Before any real use, Nawba requires the patients' informed consent **and**
authorization from the Tunisian national personal data protection authority (**INPDP**). Nawba is **not a certified
medical device**; its regulatory classification must be established before clinical use. These statements are
TODO-verify with a lawyer.

## Documentation
`docs/EXPLAIN.md` (plain-language walkthrough), `docs/THREAT_MODEL.md`, `docs/CLINICAL_RULES.md`, `docs/MODEL_CARD.md`,
`docs/LIMITATIONS.md`, `docs/LICENSES.md`, `PROMPT.md` (the original brief), `progress.md` (handoff), `checks.md`.
