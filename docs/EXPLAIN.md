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

## Phase 6 — neurologist dashboard
`frontend/src/clinic/App.jsx` lists the clinician's own patients, ranked by their most severe open alert and then by how recent it is; each row shows the top reason in plain words.
The patient page shows a 6-month seizure timeline (dot height = duration, red = above the threshold, ring = injury), a weekly adherence bar chart (grey = nothing logged, which is missing data, not missed doses), logged triggers, patient reports and alert history.
Each alert card shows its reasons, confidence, the data points behind it, and Validate / Dismiss / Call buttons: click, optionally type why, confirm — two steps, each written to the hash-chained audit log by the API.
"Advisory only. The clinician decides." is fixed at the bottom of every dashboard page and repeated on every alert card.

## Phase 6b — AI module (local, advisory, clinician-only)
`backend/ai/classifier.py` turns a caregiver's free-text description (Darija in Latin or Arabic letters, Arabic, French) into a suggested seizure category. It uses character pieces of 2–5 letters (so "yortoch" and "yorto3ch" look alike) and a logistic regression; below a confidence threshold from the config it says "unclear". The suggestion, its confidence and the words that drove it are stored on the seizure and shown only to the clinician; the caregiver only sees "description saved".
`backend/ai/risk.py` estimates the chance of a worse-than-usual week for each patient from 7 readable features (recent seizures vs personal baseline, missed doses, poor sleep, triggers, how complete the logs are). Each factor's push = coefficient × standardised value, so the "top 3 factors" are exact arithmetic. It is shown as low/medium/high with the model version and the words "not a prediction or a diagnosis".
`backend/ai/summary.py` writes the consultation summary from fixed sentence templates — no language model — and attaches the ids of the records behind each sentence.
When a clinician confirms or corrects a category, it is kept for retraining only if the patient opted in; `scripts/retrain_classifier.py` never runs on its own, and saving a new version needs a named approver and is written to the audit log.
`scripts/evaluate_ai.py` measures both models honestly on data held out before any tuning. Result: the risk model does NOT demonstrably beat a simple "seizures in the last 4 weeks" baseline — the synthetic task is close to random — and we say so.

## UI redesign — tokens, shell, patient app, dashboard
All colours, type sizes, spacing, radii, shadows and motion are CSS variables in `frontend/src/shared/tokens.css`; `styles.css` only refers to them, and uses "logical" properties (start/end instead of left/right) so Arabic and Darija flip to right-to-left with no extra rules.
Fonts (Readex Pro, IBM Plex Sans Arabic) and icons (Tabler, MIT) are files inside the repo — the e2e test fails if the page makes any request outside our own server, so the app stays fully offline.
The patient app has one loud element, a big round "Crise en cours" button that becomes a timer ring and turns red only after the configured threshold; finishing still takes 3 taps (start, stop, what you saw), and the test counts them.
The clinician queue shows one row per patient with a 30-day "rhythm strip" (a tiny bar per day, red cap = seizure above threshold), severity as colour + icon + word, and filters by tier (urgent / needs review / information / stable). Validate / Dismiss / Call is three steps — choose (the consequence is written under the button), give a reason, confirm — and each is audited.
Alert fatigue fix: duplicate alerts of the same type now merge into one open alert with an occurrence count, the trend rule became a statistical significance test against the patient's own rate, and the default queue went from "75 of 140 patients" to 32 of 150 needing a decision.

## UI redesign — accessibility, severity colours, performance
`frontend/e2e/a11y.mjs` opens 22 screens in real Chrome (French and Arabic) and measures every visible text's contrast against its real background, every tap target's size on a 390 px phone, the keyboard focus outline, and that animations stop when the phone asks for reduced motion; it found two real problems (a green "synced" label at 4.28:1 and 40 px language buttons), both fixed.
Severity colours (requested by the team): every queue row, alert card, the action bar and history dots are tinted by tier — red urgent, amber needs review, blue information — but the icon and the word stay, so colour-blind users lose nothing.
Pressing Enter on the clinician login used to switch the page to French, because the language buttons inside the form acted as "submit" buttons; they are now plain buttons and the e2e test checks an Arabic login stays Arabic.
nginx now gzips static files (not API answers, which hold patient data), which made both apps load about 23 % faster than before the redesign despite the bundled fonts.

## Pre-demo F1 — alert reasons in French, Arabic and Darija
The engine no longer writes finished English sentences; each reason, confidence note and summary line is stored as a code plus numbers, e.g. `{"code": "prolonged", "params": {"m": 5, "s": 3, "limit": 5}}`, together with the old English sentence as a fallback.
The dashboard looks up `msg_prolonged` in `strings.json` and fills in the numbers, so the same alert reads in French, Arabic or Darija; Darija was added to the dashboard's language switch.
A test checks that every message code and alert type exists in all three languages with exactly the same placeholders, and the browser test scans the French and Arabic dashboards for English words (a control run on old data finds 30, a fresh run finds 0).
Nothing about when an alert fires changed: the evaluation report is byte-identical. A small start-up step adds new optional database columns without deleting anything, so the existing demo database keeps working; old alerts keep their English text until the demo reset.

## Pre-demo F2 — optional "seuil bas" view in the clinician queue
The calm default queue still uses the configured trend test (p < 0.01). A switch, off by default, labelled "Voir aussi les alertes à seuil bas (+N patients)", also shows patients whose seizure count passes the looser p < 0.05 test from the evaluated trade-off table.
It is presentation only: the same engine function (`trend_test`) is called with a second, separately named config value, and no alert is created or changed — a test checks the alert count before and after.
The evaluation script now checks the two rising patients the default misses: both appear in the low-threshold view, but already on their onset day, which means their counts were borderline by chance; one of them is no longer in the view on the last day. We report that rather than claim the view "catches" them.
Numbers in alert reasons are now formatted per language (9 041 and 6,3 in French).

## Pre-demo F3 — reproducible demo reset with a named cast
`backend/scripts/demo_cast.py` adds four fictitious patients with no randomness at all: Amine (8, seizures getting more frequent, one lasting 6 min 40 s, plus a Darija description), Sonia (34, half her doses missed in the last two weeks), Hichem (45, stable) and Mariem (29, on valproate, pregnancy reported). Their phone numbers are +216 00 000 9xx, which no real line uses.
`scripts/demo_reset.sh` stops this project's containers, deletes only this project's database volume, and starts again so the seed recreates everything; it asks for "yes" (or `--yes`), has a `--dry-run`, never builds or pulls (offline), and prints the demo logins.
A test checks that the cast produces the alerts the demo script relies on; a fresh start with seeding and model training took 38 s on this laptop, measured on a throwaway stack.

## Pre-demo F4 — one-command smoke test
`scripts/demo_check.sh` drives real Chrome against the running stack: the three roles log in, a seizure is logged offline in 3 taps and syncs, the alert shows up on the dashboard with a French reason (no English), it is validated in 3 steps, the audit chain verifies, and no request leaves the server; any failure exits non-zero.
It writes only to a fifth fictitious "test" patient through its own account (`check.demo`), so running it before the demo does not change the story of Amine, Sonia, Hichem and Mariem.
If the database was seeded before this account existed, it stops with "run scripts/demo_reset.sh" instead of a vague timeout. It passed on a fresh throwaway stack several times in a row.

## Pre-demo F5 — disk report (never deletes)
`scripts/disk_report.sh` only reads: free space with a status line, `docker system df`, this project's images, untagged images with their age, the size of this repository and the biggest folders in the home directory.
It then prints suggestions as plain text for a person to review — remove one specific old image, the build cache, or package caches — and warns against `docker image prune -a`, `docker volume prune` and `system prune`, which can also delete images the demo needs offline or other projects' data.
After any cleanup the advice is to start the stack with Wi-Fi off and run the smoke test, to prove everything still starts without internet.

## Pre-demo F6 — a certificate you can trust once
The HTTPS certificate used to be recreated inside the web container on every rebuild, so trusting it in the browser would have stopped working at the next rebuild; it is now written once to `./certs/` (not committed) and reused, which we checked by recreating the container and comparing fingerprints.
It now lists `localhost` and `127.0.0.1` as subject alternative names (modern browsers require this), and `TLS_EXTRA_SAN` can add the laptop's hotspot IP for phones.
`docs/DEMO_DAY.md` explains how to trust it in Chrome, Firefox or Android, or simply to accept it in each browser before the jury arrives.

## Pre-demo F7 — clean-clone check
`scripts/verify_clean_clone.sh` answers "does a fresh copy of the repository build, start and pass the smoke test?": it clones the committed code into a temporary folder, builds it under its own project name and ports (9443) with a throw-away database, runs `scripts/demo_check.sh`, then removes only its own containers, its two images and the temporary folder.
It first checks free disk space and stops, building nothing, under 2 GB; on this laptop it stopped at 0.67 GB, so the full run still has to be done on a second machine.
Reviewing it found two traps we avoided: Docker's "remove images" shortcut would also have deleted the shared PostgreSQL image the offline demo needs, and the build must not try to pull from the internet.

## Pre-demo F8 — legal and consent texts
The delete screen now says exactly what is erased (name and phone, seizures, doses, reports, alerts, treatment list, relatives' access, the account), that the audit log keeps only the pseudonymous code and the date, and that information already copied into a hospital record may be kept by the hospital; a test checks the database really matches that list.
The consent and "my data" screens have a section saying that for a child, a parent or legal guardian gives consent and manages the data.
Every export (the patient's JSON download and the FHIR file) and every printout carries "Pour revue par le médecin, ce n'est pas un compte rendu médical." in French, Arabic and Darija; the backend copy is tested against the translation file so they cannot drift apart.
Agreeing that clinicians' corrections may train the model is a separate, optional consent that is off unless ticked, and retraining still needs a named human approval. All legal wording is TODO-verify with counsel.

## Pre-demo F9 — evaluation summary built by copying, not retyping
`scripts/eval_summary.py` builds `docs/EVALUATION_SUMMARY.md` by copying tables straight out of the generated reports (and the "before" alert report from git history), so no number is retyped or rounded; a check confirmed all 68 table rows appear verbatim in the sources.
That check caught one of our own mistakes: "33/80 = 0.413" had been typed by hand in two documents, while the report says 0.412; it is corrected.
The summary says plainly that the before/after alert figures come from different synthetic populations, that the risk model does not demonstrably beat a simple seizure count, and lists what is not validated.

## Pre-demo F10 — demo day guide
`docs/DEMO_DAY.md` is the one page to follow on demo day: a numbered checklist (disk report, reset, smoke test, certificate, a test with Wi-Fi off, battery, zoom), a 3-minute script built on the named cast (Amine's offline seizure with a Darija description, sync, the ranked queue in French and Arabic, the doctor-only suggestion with highlighted words, Validate in 3 steps, the audit log, and the honest numbers), and a failure playbook.
Ideas that came up but were not built because of the feature freeze are listed in `docs/NEXT.md`.

## Landing page — `/welcome`
`frontend/public/welcome/` is a plain static page (HTML, one CSS file, a 2 KB script) that Vite copies as-is and nginx serves at `/welcome/`; the family app at `/` and the dashboard at `/clinic` are untouched.
It is French in the HTML; the FR/العربية switch swaps every marked text from `i18n.ar.json` (each entry flagged TODO-verify for a native speaker), sets `dir="rtl"`, and the layout mirrors itself because the CSS only uses start/end, never left/right.
The hero's two "devices" are built in HTML and SVG — the family phone and the neurologist queue, labelled "Exemple, données synthétiques" — joined by a line that draws once and a "Synchronisé" pill; with reduced motion they simply appear.
Every factual sentence is either true of the prototype, sourced in a footnote, or labelled as planned; the "70 000 Tunisians" figure was left out because its source page is gone (see the claims audit in `docs/LANDING.md`).
