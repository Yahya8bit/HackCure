# DEMO_DAY — running Nawba in front of a jury

Everything runs locally with no internet. Logins (demo password `demo1234` from `.env`):
`dr.demo` (clinician), `caregiver.demo` (logs for Amine K. and Sonia B.), `patient.demo` (Mariem S.).
All patients are fictitious; phone numbers are `+216 00 000 9xx`.

## Pre-demo checklist (the evening before, then 30 minutes before)

| # | Step | Command / action | Done |
|---|---|---|---|
| 1 | Disk is not critical | `scripts/disk_report.sh` (reports only) | ☐ |
| 2 | Fresh demo data (fixed seed, named cast) — deletes this project's demo database only | `scripts/demo_reset.sh` then type `yes` (≈ 40 s) | ☐ |
| 3 | Smoke test passes | `scripts/demo_check.sh` → `DEMO CHECK PASSED` | ☐ |
| 4 | Certificate trusted or accepted in every browser you will use (see below) | open https://localhost:8443/ and /clinic | ☐ |
| 5 | **Offline test**: Wi-Fi off, stack still starts and passes | `docker compose up -d --wait --no-build && scripts/demo_check.sh` | ☐ |
| 6 | Hotspot (only if a phone is used): laptop IP in `TLS_EXTRA_SAN`, phone joined, cert accepted on phone | see HTTPS section | ☐ |
| 7 | Battery full, charger plugged, sleep/screen-lock disabled | OS settings | ☐ |
| 8 | Browser zoom 125 % for the projector; patient app in DevTools device mode (390 px) | Ctrl + / DevTools | ☐ |
| 9 | Notifications off, other tabs closed, logged in as `caregiver.demo` (tab 1) and `dr.demo` (tab 2) | | ☐ |
| 10 | Re-run step 2 right before going on stage if you rehearsed on the same data | | ☐ |

`demo_check.sh` writes only to a fifth test patient (P-D3A005), so it does not change the story below.

## The 3-minute demo (named cast, all fictitious)

| Time | What you show | What you say |
|---|---|---|
| 0:00 | Title | "Amine is 8. His parents live 90 minutes from the neurologist. Between visits, nobody sees his seizures — Nawba changes that, even without internet." |
| 0:20 | Tab 1 `caregiver.demo` (Amine). DevTools → Network → **Offline**. Tap **Crise en cours** → first-aid steps and timer ring → **Arrêter le chrono** → open "Ajouter des détails", type the Darija description `tah w bda yortoch w ma ja3rafnech` → tap **Chute et convulsions**. | "Three taps, even offline. The family can describe it in Darija." Point at **Enregistré sur cet appareil**. |
| 1:00 | Network back **Online** → Entrées tab turns **Synchronisé**. | "Saved on the phone first; synced when the network returns, never twice." |
| 1:15 | Tab 2 `dr.demo`: the queue. Amine on top: **Urgent** (icon + word), reason in French, 30-day rhythm strip. Switch to **العربية** for 5 seconds. | "One row per patient, ranked, with the reason — in French, Arabic or Darija." Mention Mariem (pregnancy + valproate) also on top. |
| 1:45 | Open Amine → "Descriptions des proches": the Darija sentence with **highlighted words** and the suggested category. | "A local model suggests a category to the doctor only; the family just sees *description enregistrée*. Trained on placeholder data — the doctor confirms or corrects." |
| 2:10 | Sticky bar: **Valider** → reason chip **Vu en consultation** → **Confirmer : Valider** (3 steps). Open "Historique des alertes": *Validé par dr.demo*. | "Every action is written to a hash-chained audit log." Optionally run `docker compose exec api python -m scripts.verify_audit` → `OK`. |
| 2:35 | `docs/EVALUATION_SUMMARY.md` | "Honest numbers: the calm queue catches 15 of 17 synthetic deteriorations, later than a sensitive one; our risk model does **not** beat a simple seizure count. Next step: validation on Tunisian patients with a neurologist and INPDP authorization." |

## Failure playbook

| Symptom | Likely cause | Fix (in this order) |
|---|---|---|
| Venue Wi-Fi / internet down | — | Nothing to do: Nawba needs no internet. Keep the hotspot only for a phone. |
| Phone cannot reach the laptop | hotspot / IP changed | Show the patient app in the laptop browser with DevTools device mode instead. |
| Page does not load / 502 | a container stopped | `docker compose ps` → `docker compose up -d --wait --no-build` → `docker compose logs --tail 30 api` |
| Certificate warning | cert not trusted in this browser, or `certs/` was deleted | *Advanced → Proceed*; re-import `certs/server.crt` after the demo |
| Reasons appear in English, or `demo_check` says "login failed for check.demo" | database seeded before the latest version | `scripts/demo_reset.sh --yes` (≈ 40 s) |
| Queue looks different from the script (extra seizures, already validated) | rehearsal data left over | `scripts/demo_reset.sh --yes` |
| Blank page | stale browser cache | Ctrl + Shift + R; if still blank: DevTools → Application → Clear site data |
| "No space left on device" | disk full | `scripts/disk_report.sh`; remove specific items only; **never** `docker image prune -a` / `docker volume prune` |

## Questions the jury may ask — where the answers are

- What does not work yet / limits → `docs/LIMITATIONS.md`, `docs/EVALUATION_SUMMARY.md` ("What is NOT validated")
- Is it a medical device? Legal basis, INPDP, consent → `README.md` (Legal context), `docs/THREAT_MODEL.md` (Legal context) — all TODO-verify with counsel
- Who sees the data, encryption, audit, stigma → `docs/THREAT_MODEL.md`
- Where do thresholds come from? → `docs/CLINICAL_RULES.md` (every rule TODO-verify, with the change log)
- How good are the models? → `docs/MODEL_CARD.md`
- Short honest answers: *"Not clinically validated."* · *"Synthetic data only."* · *"The doctor decides; the app never changes a dose."* · *"No data leaves the server; no outside AI."*

## HTTPS: remove the browser warning before the demo (F6)

The stack serves HTTPS with a **self-signed** certificate made on first start and stored in `./certs/`
(git-ignored). It is reused across rebuilds, so you only need to trust it once per machine/browser.
No external service is involved.

Check what you are trusting:

```bash
openssl x509 -in certs/server.crt -noout -subject -ext subjectAltName -fingerprint -sha256
```

Then choose ONE option:

1. **Trust it in Chrome/Brave on Linux** (recommended): Settings → Privacy and security → Security →
   Manage certificates → *Authorities* → Import `certs/server.crt` → tick "Trust this certificate for
   identifying websites". Or from a terminal (needs `libnss3-tools`):
   `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "Nawba local demo" -i certs/server.crt`
2. **Firefox**: Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import.
3. **Accept it ahead of time** (no install): open https://localhost:8443/ and https://localhost:8443/clinic
   once before the jury arrives, choose *Advanced → Proceed*, and keep the tab open.
4. **Phones on the demo hotspot**: set `TLS_EXTRA_SAN=IP:<laptop hotspot IP>` in `.env`, delete
   `certs/server.*`, restart the web container (`docker compose up -d --no-build --force-recreate web`),
   then install `certs/server.crt` on the phone (Android: Settings → Security → Encryption & credentials →
   Install a certificate → CA certificate). Or use option 3 on the phone.

To remove the trust after the hackathon: delete the "Nawba local demo" entry in the same certificate manager.
The private key `certs/server.key` never leaves the laptop; do not commit or share it.

## Disk space: what NOT to do (F5)

This laptop's disk was ~99 % full during development. Before demo day, run the read-only report:

```bash
scripts/disk_report.sh        # reports only; never deletes
```

**Do not use** `docker image prune -a`, `docker volume prune` or `docker system prune -a --volumes`:
they also delete images the demo needs offline (you would need internet to rebuild) and other projects'
data. Remove specific items by ID instead, one at a time, after checking what they are.

**After any cleanup**, prove the demo still starts without internet: turn Wi-Fi off, then

```bash
docker compose up -d --wait --no-build
scripts/demo_check.sh
```
