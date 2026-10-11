# LANDING — public page for Nawba (`/welcome`)

Audiences: (1) a parent on a phone who must understand in 10 seconds and feel reassured, (2) a neurologist who wants
to see the time saved and join a pilot, (3) a juror who wants an honest, secure, credible project with its limits.

Static HTML + one CSS file + one small JS file (language switch). No framework, no cookies, no analytics, no
third-party request. Served by the existing nginx container at `/welcome/`; `/` (family app) and `/clinic`
(dashboard) are unchanged.

## 1. Inspiration (structure and tone only — nothing copied)

- **reservations.tn** (from the brief's notes; not opened): sticky header with one primary button and a language
  switch; a hero with a concrete promise and the action right there; a trust strip under the hero; a real
  3-step "comment ça marche"; a plain FAQ; a call to action for the other side of the platform; a sticky mobile
  action bar; a calm voice. → All adopted, adapted to two audiences (families, neurologists).
- **defendr.gg**: only its metadata was known (one platform, several audiences, bilingual from the start). → Adopted:
  distinct sections per audience, French + Arabic from day one. Not opened in a browser.
- Rejected for Nawba: WhatsApp contact (a third-party service, and health data must not flow there), booking-style
  price tables, logos/testimonials (we have none and will not invent them).

## 2. Tokens (same names as the app — `frontend/src/shared/tokens.css`)

| token | value | use |
|---|---|---|
| `--whitewash` | #F3F6F9 | page background |
| `--surface` | #FFFFFF | panels |
| `--cobalt` | #1E50A2 | primary buttons, links, the arch |
| `--deep-sea` | #0F2742 | text; the neurologist panel background |
| `--jasmine` | #F4EBD0 | the families panel, the prototype badge |
| `--urgent` / `--watch` / `--settled` | #B42318 / #B7791F / #2F7D57 | severity chips in the mock-up only, always icon + word |
| `--ink-muted` | #4A5B70 | secondary text (6.95:1) |
| `--watch-ink`, `--settled-ink` | #8A5A12, #276B4A | coloured TEXT (AA) |

Type: Readex Pro (variable, headings) and IBM Plex Sans Arabic (body), from `@fontsource-variable/readex-pro` and
`@fontsource/ibm-plex-sans-arabic`, only the latin, latin-ext and arabic woff2 subsets, local, with unicode-range.
Scale 14 / 16 / 20 / 28 / 40 / 56 (56 only for the desktop h1). Measure ≤ 66ch. Tabular figures.
Radius 6 (chips, inputs) / 12 (panels, buttons) / 20 (the device mock-ups); the arch is the only curved motif.
One shadow, for the two device mock-ups. Motion: the sync line draws once and the "Synchronisé" pill fades in;
nothing else moves; `prefers-reduced-motion` shows the final state at once.

## 3. Sections and copy (French first; Arabic in `frontend/public/welcome/i18n.ar.json`, every entry TODO-verify)

1. **Header** — logo arch + "Nawba"; nav: Familles · Neurologues · Comment ça marche · Confiance · FAQ;
   switch FR / العربية; primary button **Essayer l'app famille** → `/`.
2. **Hero** — h1 **Noter une crise en trois touches. Même sans internet.**
   Support: *La famille note les crises et les prises de traitement. Le neurologue voit d'abord qui a besoin de lui,
   et pourquoi.* Buttons: **Essayer l'app famille** (`/`) · **Voir le tableau du neurologue** (`/clinic`).
   Badge: **Prototype de démonstration, données synthétiques.** Visual: cobalt arch holding the family phone
   ("Une crise commence" control, "Aujourd'hui : 1 prise sur 2") and the queue (3 rows: Urgent / À revoir /
   Stable, each icon + word, short reason, 30-day rhythm strip), joined by a line labelled **Synchronisé**;
   caption **Exemple, données synthétiques**.
3. **Trust strip** — Fonctionne sans internet · Votre médecin décide, pas l'application · Des rappels qui ne
   parlent jamais d'épilepsie · Vos données supprimées quand vous le voulez.
4. **Pourquoi** — one sourced fact (footnote ¹): *En février 2026, l'association tunisienne de lutte contre
   l'épilepsie disait que la majorité des Tunisiens n'ont pas encore accepté cette maladie et que beaucoup de
   patients se tournent vers la médecine alternative.* Then a statement of purpose (not a fact): *Nawba est fait pour que les crises vécues à la maison
   arrivent jusqu'au neurologue, avec leur contexte.*
5. **Pour les familles** (jasmine panel, phone-like list) and **Pour les neurologues** (deep-sea panel, table-like
   list) — different shapes on purpose, not twin cards.
6. **Comment ça marche** — 1 Noter (même hors ligne) · 2 Synchroniser (quand le réseau revient) · 3 Décider
   (le neurologue valide).
7. **Confiance** — two columns *Ce que Nawba fait* / *Ce que Nawba ne fait pas*, then the limits paragraph.
8. **Le pilote** — 3 months: partner hospital, INPDP authorization, local validation set-up; 6 months: validation
   with a neurologist on Tunisian patients, measure, then decide. **Rejoindre le pilote** (mailto with a prefilled
   subject; no form posting, no tracking).
8b. **Tarifs (prévus)** — added on team request: three offers drawn differently (lilac Familles "Gratuit",
   outlined Établissement pilote "Gratuit pendant le pilote", aubergine Cliniques "Abonnement par établissement —
   tarif à définir après le pilote"). No invented amounts.
9. **FAQ** — 7 questions from the brief, `<details>`.
10. **Footer** — prototype notice; *Ne remplace pas un médecin. En cas d'urgence, appelez le 190.*; links: app,
    dashboard, confidentialité (#confiance), crédits (fonts OFL, icons MIT); "Projet HackCure, ESEN" (text only —
    no URL invented). Mobile: sticky bottom bar **Essayer l'app famille**.

## 4. Wireframes

Desktop (1440):
```
┌─[⌒ Nawba]  Familles Neurologues Comment Confiance FAQ        FR|ع  [Essayer l'app famille]─┐
│                                                                                           │
│  Prototype de démonstration, données synthétiques          ╭──────────────────────────╮   │
│  Noter une crise en trois touches.                         │  cobalt arch              │   │
│  Même sans internet.                    (h1, 56)           │ ┌phone┐ ─Synchronisé─ ┌queue┐│   │
│  La famille note… Le neurologue voit…                      │ │ (●) │               │▲ Urg.││   │
│  [Essayer l'app famille] [Voir le tableau du neurologue]   │ └─────┘               └─────┘│   │
│                                                            ╰── Exemple, données synth. ─╯   │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ [i] sans internet │ [i] votre médecin décide │ [i] rappels discrets │ [i] suppression     │  [i] = inline SVG icon
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ Pourquoi (one sourced fact + footnote)                                                    │
│ ┌ Pour les familles (jasmine, rounded) ┐   ┌ Pour les neurologues (deep-sea, square) ────┐ │
│ 1 Noter ──── 2 Synchroniser ──── 3 Décider                                                 │
│ Ce que Nawba fait | Ce que Nawba ne fait pas ; limites                                    │
│ Le pilote: 3 mois | 6 mois  [Rejoindre le pilote]                                          │
│ FAQ ▸ ▸ ▸                                                                                  │
│ footer                                                                                     │
```
Mobile (390): header = logo + FR|ع + menu-less nav (horizontal scroll of 5 anchors); hero text, then the arch with
the two mock-ups stacked (phone, line rotated vertical, queue); trust strip 2×2; panels stacked; sticky bottom bar.

## 5. Claims audit (LP6)

| Claim on the page | Status | Evidence |
|---|---|---|
| Log a seizure in three taps | true of the prototype | e2e counts 3 taps (`frontend/e2e/e2e.mjs`) |
| Works without internet | true of the prototype | offline log + sync in e2e; zero external requests |
| Your doctor decides, not the app | true (design) | advisory notice; no diagnosis/dose code paths |
| Reminders never mention epilepsy | true | `strings.test.js` discreet-reminder test |
| Delete your data at any time | true | `DELETE /patients/{id}`, test; hospital-record caveat stated in FAQ (TODO-verify counsel) |
| Identity encrypted separately from notes | true | AES-256-GCM `patient_identity`, test |
| AI runs locally, no outside API | true | `backend/ai/`, zero external requests (e2e) |
| Audit log, export | true | hash-chained audit, export + FHIR |
| Risk model does not beat a seizure count | true | `docs/EVALUATION_SUMMARY.md` |
| Association statement, Feb 2026 | sourced | African Manager 10/02/2026 (TAP), WebManagerCenter 02/2026 — linked in footnote |
| "More than 70,000 Tunisians live with epilepsy" (Razi, July 2025) | **excluded** | the cited La Presse page returns 404 (checked 2026-10-11) and the same figure is quoted for Alzheimer's (Sept 2026); TODO-verify from the original interview before adding |
| Free for families; clinic subscriptions later | **planned** (said as planned) | business intention, no price set |
| Pilot 3/6 months, INPDP | **planned** | — |
| Emergency number 190 (SAMU) | TODO-verify | same value as `config/clinical_rules.yaml` |
| Hosting in Tunisia | **planned** | README "Hosting and outside calls" |
| Pricing section: families free, pilot site free during the pilot, clinics subscription | **planned** (heading "Tarifs (prévus)") | no amount anywhere: `landing_check.mjs` fails if a price (DT/TND/€/$/دينار) appears in `#tarifs` |

Never claimed: diagnosis, certification, anonymity (data is pseudonymous), GDPR compliance, medical-device status.

## 6. Measured results (from `frontend/e2e/landing_check.mjs`)

- Zero external requests in French and Arabic, mobile and desktop.
- Transfer on a cold load (compressed bytes on the wire, all files): 86–200 KB depending on language, viewport and
  service-worker timing across two runs (budget 400 KB). The OG image (62 KB) is fetched only by link previews.
- WCAG audit (same method as the app): 0 contrast failures, 0 targets under 48 px on mobile (first run found the
  language buttons at 44 px — fixed), visible 3 px focus, reduced motion disables the only animation.
- Offline: after one visit, the page reloads with the network fully off (the app's service worker), fonts included.
- Vocabulary decision: the brief's mock-up label "Une crise commence" was replaced by the app's own button label
  "Crise en cours" (rule: same vocabulary as the app).

## 7. Making it the site root later
Today `/` is the family app. To make the landing page the root: move the patient app to `/app/` (Vite `base` for the
patient entry, service-worker scope `/app/`, the PWA manifest `start_url`), then in `frontend/nginx.conf` serve
`welcome/index.html` at `location = /` and keep `/clinic` as is. Update the e2e/demo-check base paths.

## 8. Self-review (pass 1 → pass 2): what read like a startup template, and what changed

1. **An unsourced "fact" slipped into my own draft.** "Entre deux consultations, les crises passent souvent
   inaperçues" is a factual claim with no source. → Rewritten as a statement of purpose, not of fact:
   *"Nawba est fait pour que les crises vécues à la maison arrivent jusqu'au neurologue, avec leur contexte."*
2. **The 70,000 figure from the brief** could not be verified (dead source, number confused with Alzheimer's) →
   left off the page, kept in the claims audit as TODO-verify. The section keeps only the sourced association quote.
3. **Twin feature cards** ("Pour les familles" / "Pour les neurologues" as two identical bullet lists) is the
   template default the brief forbids. → Families: a warm jasmine panel written as what *you* do, in the app's own
   words (Crise en cours, J'ai pris, Entrées). Neurologists: a deep-sea panel laid out as two columns
   *Ce que vous voyez* / *Ce que vous faites*. Different colour, shape and grammar.
4. **Emoji in the trust-strip wireframe** (placeholder habit). → Inline SVG icons from the Tabler set already
   bundled in the app (MIT, recorded) — no second icon library.
5. **"Contactez-nous" button with an invented address** is a fake claim waiting to happen. → **Rejoindre le pilote**
   opens the visitor's mail app with a prefilled subject and body and no recipient; the page says plainly that the
   pilot contact address will be published by the team (TODO: `PILOT_EMAIL` in `welcome/landing.js`).
6. **A generic "Our mission" / "Why us" register.** → Every heading is a plain sentence a parent would say or a
   label from the app ("Comment ça marche", "Ce que Nawba ne fait pas"); no eyebrow labels, no ALL CAPS.
7. **HackCure / ESEN as links**: I do not have verified URLs → plain text, no invented link.
8. **Hero mock-ups could be read as real data** → caption "Exemple, données synthétiques" inside the arch, and the
   patient names in the mock-ups are the fictitious demo cast ("Amine K. (fictif)").

## 9. Later changes (team requests)
- Pricing section `#tarifs` + nav link "Tarifs" (planned model only; guarded by a test against invented prices).
- Palette switched to epilepsy-awareness purple (see `docs/DESIGN_PLAN.md` §7); the arch stays the recurring shape.

## Dark "SaaS" redesign (TaskGo-style reference)

Layout taken from a TaskGo-style reference: centred hero over a purple glow, product shown inside a browser window with floating chips, pill buttons, bento cards, a numbers row, steps beside a gradient panel, card FAQ, a glowing closing CTA (the pilot), and a giant faded wordmark in the footer. The palette is still Nawba's purple/aubergine; the mock-up inside the window keeps the app's light tokens.

Reference elements deliberately **not** copied, because of the claims rules:
- the partner-logo strip (we have no partners): replaced by the four promises as pills;
- the "40% / 3x / 100% / 10k+" stats: replaced by "Nawba en quatre chiffres", four checkable product facts (3 taps, 3 languages, 0 outside service, 30-day rhythm);
- the testimonials (we have none);
- the monthly/yearly price toggle and "Most popular" badge (there are no amounts and no customers).

New strings `fl1-4`, `win_title`, `fa_h`, `fa_sub`, `fa1-4` are in i18n.ar.json as TODO-verify. LANDING CHECK passes on the dev server (0 contrast/target failures, fr+ar, mobile+desktop; transfer 171–232 KB).
