# DEMO_DAY — running Nawba in front of a jury

Everything runs locally with no internet. Logins (demo password `demo1234` from `.env`):
`dr.demo` (clinician), `caregiver.demo` (logs for Amine K. and Sonia B.), `patient.demo` (Mariem S.).
All patients are fictitious; phone numbers are `+216 00 000 9xx`.

<!-- F10: checklist, 3-minute script and failure playbook are added below the reference sections. -->

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
