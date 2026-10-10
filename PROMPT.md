# PROMPT.md — original build brief (verbatim)

Model routing note from the team: use Sonnet as the main model; Opus for
(1) plan and architecture, Phases 0–2, (2) security pass and THREAT_MODEL.md,
Phase 9, and (3) AI evaluation and model card, Phase 10. Use Haiku only for
cheap, low-risk jobs (boilerplate, formatting, test scaffolding), never for
clinical rules, encryption or the audit log.

---

<goal>
Build Nawba (placeholder name) in this repository: an offline-first
epilepsy follow-up platform for Tunisia.
- Patient / caregiver app (PWA): log seizures in 3 taps with a built-in
  timer, log medication intake, record possible triggers and side
  effects, discreet reminders, French / Arabic / Darija labels.
- Neurologist dashboard: patients ranked by need for attention, each
  alert with plain-language reasons and a confidence level, and
  Validate / Dismiss / Call actions recorded in an audit log.
- Alert engine: clinical safety rules + per-patient trend detection +
  explainable trigger insights. Advisory only; the clinician decides.

Context: 24-hour health hackathon (HackCure, ESEN). Jury of engineers,
doctors and professors who weigh innovation, security, ethics,
scalability, business viability and feasibility. Every team member
must be able to explain the code, so prefer simple, readable,
explainable solutions.

Leave a working result, checks.md and progress.md so another session
can continue. Define completion before starting. Stop when all
acceptance checks pass or the run limit is reached.
</goal>

<role>
Act as builder and maintainer. Read existing files and inspect current
work before editing. Make routine decisions inside scope. Record every
choice that affects the result in progress.md.
</role>

<principles>
- Establish a baseline before changing the system (run tests first).
- Run a change, inspect the result, keep useful improvements, record
  failed attempts too.
- Prefer the simpler solution when results are comparable.
- The app never diagnoses, never changes or suggests changing a dose,
  and never tells a patient to stop a medication. It informs, reminds,
  records and alerts the clinician.
- Any clinical threshold, first-aid instruction or drug-safety rule is
  marked TODO-verify (to be confirmed by a neurologist or an official
  guideline) and stored in one config file, never hard-coded in many
  places.
</principles>

<inputs>
Deliverable: `docker compose up` runs the complete system locally with
no internet. Root files: README.md, checks.md, progress.md, PROMPT.md.
Docs: docs/EXPLAIN.md, docs/THREAT_MODEL.md, docs/LIMITATIONS.md,
docs/CLINICAL_RULES.md, docs/LICENSES.md, docs/MODEL_CARD.md.

Stack (change only with a recorded reason): React PWA (service worker
+ IndexedDB) for patient app, React for dashboard, FastAPI backend,
PostgreSQL (SQLite allowed for quick local tests), Python alert
engine, Docker Compose. No paid or external services. No record
content sent to external APIs.

Allowed changes: only inside this repository.
Run limit: 15 checkpoints or the hackathon hard stop, whichever first.

Acceptance checks:

PATIENT / CAREGIVER APP
 1. Log a seizure in at most 3 taps: start/stop timer (or manual
    duration), seizure category (simple list), optional trigger tags
    (missed dose, poor sleep, fever, stress, other) and injury yes/no.
 2. While the timer runs, the screen shows short first-aid guidance
    and an emergency instruction when duration exceeds the configured
    threshold (default 5 minutes, TODO-verify), including the
    emergency number 190 (TODO-verify).
 3. Medication schedule with intake confirmation and missed-dose
    logging. Reminders are DISCREET: the notification text never
    mentions epilepsy or the drug name (stigma protection).
 4. Caregiver mode: a parent or relative can log for a patient
    (including a child). Roles distinguish patient, caregiver,
    clinician.
 5. Works offline: entries saved in IndexedDB, queued, and synced in
    order when the network returns; client-generated IDs prevent
    duplicates; UI shows "saved on this device" vs "synced".
 6. Labels available in French and Arabic, with Darija phrasing for
    key buttons (strings in a translation file, easy to edit).
 7. Consent screen on first use (plain language), with the right to
    export or delete one's data.

ALERT ENGINE (explainable, advisory)
 8. Rule layer (config file, TODO-verify): prolonged seizure above
    threshold -> urgent alert; seizure cluster (configurable count in
    a time window) -> urgent alert; injury reported -> alert;
    reported pregnancy for a patient whose medication list includes a
    drug flagged "pregnancy-sensitive" in the config (e.g. valproate,
    TODO-verify) -> urgent alert to the clinician, and the patient
    sees only: "Do not stop your treatment on your own. Contact your
    doctor as soon as possible."
 9. Trend layer: compare recent seizure frequency to the patient's own
    baseline (e.g. last 4 weeks vs previous 12 weeks) and flag
    significant increases; flag adherence drops.
10. Insight layer: simple, honest association between logged triggers
    and seizures (e.g. "4 of the last 5 seizures were logged within
    24 h of a missed dose"). Present as observation, never as cause.
11. Every alert carries: type, severity, plain-language reasons, the
    data points behind it, and a confidence level. Incomplete data
    lowers confidence and is shown.
12. Dashboard footer and every alert screen state: "Advisory only.
    The clinician decides."

NEUROLOGIST DASHBOARD
13. Patient list ranked by severity then recency; each row shows the
    top reason.
14. Patient detail: seizure timeline chart, adherence chart, triggers,
    alert history.
15. Validate / Dismiss / Call actions in at most 3 steps, each written
    to an append-only, hash-chained audit log (who, what, when, why).
    A script verifies the chain.
16. Export a consultation summary (FHIR-style JSON: Patient with
    pseudonymous id, Observation for seizures, MedicationStatement for
    adherence) and a printable summary page.

SECURITY & PRIVACY
17. Pseudonymous patient IDs; names and contact details stored
    separately from clinical logs, encrypted at rest (AES-256 key from
    environment).
18. Role-based access with token authentication; a caregiver sees only
    linked patients; a clinician sees only their patients.
19. TLS in docker compose (self-signed locally), input validation,
    rate limiting, secrets only from environment, demo credentials
    only in .env.example, pinned dependencies, dependency
    vulnerability scan result recorded in checks.md.
20. docs/THREAT_MODEL.md covers: data leak, stigma exposure (lock
    screen, shared phones), unauthorized caregiver access, insider
    misuse, false reassurance from the app, and the mitigation for
    each.

DATA, EVALUATION & HONESTY
21. Synthetic data generator (fixed seed): about 150 patients over 6
    months, including stable patients, patients with rising seizure
    frequency, patients with poor adherence, clusters, and missing
    data. No real data anywhere in the repo.
22. Evaluation script: on synthetic patients with known injected
    deterioration, report how many are flagged (sensitivity), how many
    stable patients are wrongly flagged (false alarm rate), and the
    median time to flag. Report real measured numbers in checks.md;
    never invent or round up.
23. Load test (Locust or k6) simulating many concurrent log syncs;
    record median and p95 latency and test conditions in checks.md.

DOCS
24. README: install steps, architecture diagram, how to run tests and
    the evaluation, the 3-minute demo script, limitations, and a short
    note on the legal context (health data requires consent and
    authorization from the national data protection authority INPDP
    before any real use; not a certified medical device; TODO-verify).
25. docs/CLINICAL_RULES.md lists every rule, threshold and message,
    each marked TODO-verify with a field for the validating
    neurologist's name and source.

AI MODULE (local, explainable, advisory; no external AI APIs)
26. Caregiver description classifier. A caregiver can describe a
    seizure in free text in Darija (Latin "Arabizi" or Arabic script),
    Arabic or French, e.g. "tah w bda yortoch w ma ja3rafnech".
    The model suggests one category from a small configurable list
    (default: generalized tonic-clonic, focal with impaired awareness,
    absence, myoclonic, unclear; TODO-verify with a neurologist),
    with a confidence level and the highlighted words that drove the
    suggestion. Below a confidence threshold it outputs "unclear".
    Model: character n-gram TF-IDF + logistic regression (robust to
    Arabizi spelling variation), trained locally.
    The suggestion is shown ONLY to the clinician, who confirms or
    corrects it. The patient/caregiver only sees "description saved".
27. Training data for check 26: data/descriptions_labeled.csv written
    by the team (target: at least 150 examples across the 3 scripts,
    labels reviewed by a medical student or neurologist if possible).
    If absent, create a clearly marked placeholder of 30 examples and
    a TODO asking the team to replace it. Split train/test before any
    tuning; never tune on the test set. Report per-class precision,
    recall and the confusion matrix in checks.md.
28. Seizure-risk estimate (dashboard only). For each patient, estimate
    the risk of an elevated-seizure period in the next 7 days from:
    recent seizure counts vs personal baseline, missed doses, logged
    sleep problems, trigger tags, data completeness.
    Model: logistic regression or gradient boosting, with per-patient
    feature contributions (e.g. SHAP or coefficient x value).
    Display as a band (low / medium / high), the top 3 contributing
    factors in plain language, and the model version.
    Never shown to patients. Never phrased as a certainty.
29. Honest evaluation of check 28 on held-out synthetic patients:
    ROC AUC, Brier score (calibration), sensitivity and false alarm
    rate at the chosen threshold, AND the same metrics for a simple
    non-AI baseline (seizure count in the last 4 weeks). Report
    whether the model beats the baseline. If it does not, say so.
    State in the model card that a model trained on synthetic data
    mostly recovers the rules used to generate that data and proves
    the pipeline, not clinical validity.
30. Bias check: report metrics for checks 26 and 28 by subgroup
    (child / adult, sex, rural / urban region, script used: Arabizi /
    Arabic / French). Flag any subgroup with clearly worse results.
31. docs/MODEL_CARD.md for each model: purpose, intended users,
    training data (synthetic), metrics, subgroup results, known
    limitations, human oversight, version, and what must happen
    before real clinical use (local validation on Tunisian patients,
    neurologist review, regulatory classification TODO-verify).
32. Feedback loop: clinician confirmations and corrections are logged
    (with consent) for future retraining. A retraining script exists
    but retraining is never automatic; a new model version requires a
    human decision and is recorded in the audit log.
33. Consultation summary for the neurologist: generated from templates
    (no generative language model), e.g. "6 seizures in the last 30
    days vs 2/month before; 4 of 6 within 24 h of a missed dose".
    Each sentence links to the underlying data points.
</inputs>

<build_order>
Phase 0: repo skeleton, Docker Compose with health checks, test
         command, progress.md.
Phase 1: data model + synthetic data generator (check 21).
Phase 2: backend API (patients, seizures, medications, alerts, audit).
Phase 3: patient PWA: seizure logging with timer, medication logging
         (checks 1 to 3).
Phase 4: offline queue and sync (check 5).
Phase 5: alert engine rules, trend, insights (checks 8 to 11).
Phase 6: neurologist dashboard (checks 12 to 15).
Phase 6b: AI module: classifier, risk estimate, summaries
         (checks 26 to 28, 32, 33).
Phase 7: caregiver mode, translations, consent (checks 4, 6, 7).
Phase 8: export (check 16).
Phase 9: security hardening and threat model (checks 17 to 20).
Phase 10: evaluation, AI evaluation, bias check, model cards, load
          test (checks 22, 23, 29 to 31).
Phase 11: docs and final verification of all checks (checks 24, 25).
A working end-to-end flow (log a seizure offline -> sync -> alert
appears on the dashboard -> clinician validates) must exist by the end
of Phase 6.
</build_order>

<rules>
- Read progress.md first, then inspect the files it references before
  trusting it.
- Work in small bounded steps. Run relevant tests after each step.
- Commit after every working step with a clear message. The repository
  history is graded.
- Never weaken an acceptance check to obtain a pass. Fix the cause or
  report the failure.
- Keep layers separate: frontend, API, alert engine, storage.
- After each step add 3 to 5 plain sentences to docs/EXPLAIN.md saying
  what the code does and why, so every teammate can defend it.
- Any legal, clinical or medication claim that is not verified must be
  marked TODO-verify, never stated as fact.
- Record the license of every dependency in docs/LICENSES.md.
- Avoid repeating a failed approach without a new reason.
</rules>

<execution_loop>
1. Inspect saved state and choose one bounded step.
2. Build or revise the artifact within scope.
3. Run the checks relevant to that change.
4. Keep useful work; undo only your own failed changes.
5. Record the outcome and checkpoint progress in progress.md.
6. Continue until completion, a blocker, or the run limit.
</execution_loop>

<handoff>
After each stage update progress.md:
Task: requested outcome and active constraints.
Outputs: exact paths of current files.
Completed: finished stages and observed check results.
Decisions: choices made and their supporting evidence.
Open issues: failures, uncertainties, blockers.
Next action: one concrete step to resume.
</handoff>

<delivery>
Return the running repository, checks.md (requirement | verdict |
evidence, using pass / fail / unresolved with file paths or command
output), and progress.md. State what was checked, what passed and what
remains unresolved. Mark any check without evidence as unresolved.
</delivery>
