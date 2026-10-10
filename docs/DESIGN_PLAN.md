# DESIGN_PLAN — Nawba UI redesign

Concept: **calm under pressure.** Whitewashed walls, one cobalt door. The page is quiet so that the two things that
matter — the seizure control on the phone, the rhythm strip in the clinician queue — can be loud.

Constraints that win over taste: fully offline (fonts + icons bundled, zero external requests), RTL for Arabic and
Darija, WCAG AA, 48 px touch targets, `prefers-reduced-motion`, and no behaviour change (3-tap log, 3-step clinician
action, offline queue, roles, audit). Everything below is defined once in `frontend/src/shared/tokens.css`.

---

## 1. Tokens

### Colour
| token | value | use | contrast (text on white / on whitewash) |
|---|---|---|---|
| `--whitewash` | #F3F6F9 | page background | — |
| `--surface` | #FFFFFF | cards, sheets, table | — |
| `--cobalt` | #1E50A2 | primary actions, active tab, focus ring, links | 7.71 / 7.11 |
| `--cobalt-tint` | `color-mix(cobalt 10%, white)` | selected chips, active row | — |
| `--deep-sea` | #0F2742 | text, headings | 15.12 / 13.94 |
| `--ink-muted` | #4A5B70 | secondary text | 6.95 / 6.41 |
| `--line` | #D5DEE8 | the few borders that group information | non-text only |
| `--jasmine` | #F4EBD0 | empty states, "saved" warmth, synthetic-data marker | deep-sea on it 12.7 |
| `--urgent` | #B42318 | urgent fill/icon and text | 6.57 / 6.06 |
| `--watch` | #B7791F | watch fill/icon **only** (3.64:1 fails AA for text) | — |
| `--watch-ink` | #8A5A12 | watch **text** | 5.91 / — |
| `--settled` | #2F7D57 | settled/synced icon and text on white | 5.01 / 4.62 |
| `--*-tint` | `color-mix(<colour> 12%, white)` | soft background behind a status | — |

Severity is never colour alone: **urgent** = octagon-alert icon + "Urgent"; **needs review** (`watch`) = triangle
icon + "À revoir"; **information** = info-circle + "Information"; **stable** = check-circle + "Stable".

### Type
- Families: **Readex Pro** (headings, the whole patient UI), **IBM Plex Sans Arabic** (body text, dashboard data).
  Both cover Arabic + Latin. Bundled as local woff2 via `@fontsource` (OFL-1.1), split by `unicode-range` so a
  French page never downloads the Arabic subset and vice versa. Weights: Readex 400/600, Plex 400/600.
- Scale (only these): `--fs-14` 14 · `--fs-16` 16 · `--fs-20` 20 · `--fs-28` 28 · `--fs-40` 40 px.
- Numbers: `font-variant-numeric: tabular-nums` everywhere a number can change (timer, counts, dates, table).
- Measure: `max-inline-size: 66ch` on prose.
- Headings weight 600, letter-spacing −0.01em (Latin only; Arabic gets 0 — negative tracking breaks joined script).

### Space, radius, depth, motion
- Space (4-based): `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 24 · `--s-6` 32 · `--s-7` 48.
- Radius by hierarchy: `--r-sm` 6 (chips, inputs, pills) · `--r-md` 12 (cards, buttons) · `--r-lg` 20 (sheets, the phone frame on desktop). The seizure control is a circle (50 %).
- Depth: one shadow `--shadow-1: 0 1px 2px rgb(15 39 66 / .06), 0 8px 24px -12px rgb(15 39 66 / .18)` for floating things only (phone frame, sticky action bar, dialogs). Cards are flat white on whitewash.
- Motion: `--ease: cubic-bezier(.2,.8,.2,1)`, 180 ms confirmations (saved / synced / dose taken check), the timer ring (continuous). All disabled under `prefers-reduced-motion: reduce` (ring becomes a stepped arc updated once per second).
- Targets: `--target: 48px` minimum for every tappable thing on the patient app.

## 2. What we take from the reference project (p-guard), adapted
Studied: its token CSS, Tailwind config, alert list and dashboard screenshots. Nothing copied.
1. **Semantic token layer** (bg / surface / border / text / muted / accent / status) with *derived* tints via `color-mix` instead of hand-picked pale colours → adopted, with our palette.
2. **Page tint vs white surface** so cards read without heavy borders → adopted (whitewash vs white).
3. **Severity chip = tinted square icon + severity word in colour under the title**, critical rows get a faint wash instead of a coloured side-stripe → adopted for the queue and alert history.
4. **Segmented filter group** (one bordered pill row, active segment filled) → adopted for the summary-strip filters and the 7 / 30-day chart toggle.
5. **Outlined status pill** ("En cours") → adopted as the sync pill and alert status.
6. **Muted relative-time column** ("il y a 2 j") → adopted ("il y a 2 h").
7. **Skeleton blocks instead of "Loading…"** → adopted for the queue and detail.
8. **One short fade (≤ 220 ms) on content swap; motion opt-out** → adopted, narrower (only confirmations).

Rejected (brief wins): teal accent; Inter; stacked radial-gradient backdrops ("no decorative gradients"); saturated
filled KPI tiles (would add a third loud place); dark theme (not asked; doubles contrast work); 28 px card padding
everywhere (too airy for a one-handed phone — we use 16/24).

## 3. Principles
1. **Two loud places, everything else quiet.** If a third thing starts competing, it gets quieter, not them.
2. **One name per action through its whole flow.** "Enregistrer" → "Enregistré"; "Valider" → "Validé".
3. **Severity = colour + icon + word.** Always all three.
4. **Logical properties only** (`margin-inline-start`, `inset-inline-end`, `text-align: start`) so RTL is free; icons with direction (arrows, chevrons) flip under `[dir=rtl]`.
5. **Empty states invite an action; errors say what happened and what to do.**
6. **The phone is not a shrunken desktop and the desktop is not a stretched phone.**

## 4. Wireframes

### P1 — Shell + home (390 px)
```
┌──────────────────────────────────────┐
│ (SB) Sarra ▾      FR│ع│دارجة   ⋯    │  avatar chip = who I log for; segmented language
│ ● Synchronisé            [Synthétique]│  sync pill + synthetic-data marker
├──────────────────────────────────────┤
│  Aujourd'hui : 1 prise sur 2          │  status card (flat)
│  ▓▓▓▓▓▓▓▓▓░░░░░░░░                    │
│                                        │
│              ╭────────╮                │
│            ╭─┤        ├─╮              │
│            │   Crise   │  ← 200 px     │  THE seizure control (cobalt circle)
│            │  en cours │    circle     │
│            ╰─┤        ├─╯              │
│              ╰────────╯                │
│        La crise est finie ? Saisir     │  quiet text button
│                                        │
│  Prochaine prise · 20:00  [ Pris ]     │  next-dose card
├──────────────────────────────────────┤
│ ◉ Crise  ◌ Traitement ◌ Signaler ◌ Mes │  icon + label, 56 px, active = cobalt bar on top
│                     entrées ◌ Données │  + safe-area padding
└──────────────────────────────────────┘
```

### P2 — Seizure in progress (full screen, nav hidden)
```
┌──────────────────────────────────────┐
│                                        │
│            ╭──────────╮                │  ring fills over the threshold duration
│          ╱      02:14   ╲              │  cobalt → urgent ONLY after threshold
│          ╲   en cours   ╱              │
│            ╰──────────╯                │
│  ① (shield) Protégez la tête…          │  3 steps from config (TODO-verify), icons
│  ② (clock)  Notez l'heure…             │
│  ③ (side)   Sur le côté après…         │
│                                        │
│  ┌──────── past threshold only ───────┐│
│  │ ⚠ Plus de 5 min. Appelez le 190    ││  urgent tint, big tel: button
│  │        [ ☎ Appeler le 190 ]         ││
│  └─────────────────────────────────────┘│
│        [      Arrêter le chrono      ]  │  tap 2
└──────────────────────────────────────┘
```

### P3 — Finish (same flow, tap 3 saves)
```
│ Durée  [ 2 ] min [ 14 ] s   (prefilled) │
│ Qu'avez-vous vu ?                       │
│ [Chute et convulsions] [Absent, gestes] │  type chips = tap 3 → saved
│ [Regard fixe] [Secousses] [Je ne sais pas]│
│ ▸ Ajouter des détails (facultatif)      │  collapsed: trigger chips, injury toggle,
│     Déclencheurs  [Dose oubliée] …      │  "Décrivez ce que vous avez vu" (example)
│     Blessure      [ Non | Oui ]  48 px   │
```
Toast after save: "Enregistré sur cet appareil ✓" (jasmine, 180 ms in) → later "Synchronisé".

### P4 — Treatment
```
│ Traitement du jour          1 sur 2     │
│ ┌ 08:00  Lévétiracétam 500 mg  ✓ Pris ┐ │  done: settled check (animated once)
│ └ 20:00  Lévétiracétam 500 mg [Pris][Oublié]┘
│ Rappels discrets  [ toggle ]            │
│ Le rappel ne mentionnera ni l'épilepsie │
│ ni le médicament.                       │
```

### P5 — Report
```
│ Qu'est-ce qui s'est passé ?             │
│ [Mauvaise nuit] [Fièvre] [Stress] [Dose oubliée]   chips → "Enregistré"
│ Effet indésirable                        │
│ [ ex. : vertiges le matin           ]   │
│                     [ Enregistrer ]     │
│ Grossesse (only if eligible: F + age range)│
```

### P6 — My entries
```
│ Aujourd'hui                              │
│  ◉ 14:02  Crise · 2 min 14 s   ● Enregistré sur cet appareil
│  ✓ 08:00  Prise · Pris          ● Synchronisé
│ Hier                                     │
│  …                                       │
│ empty: (jasmine panel) "Rien d'enregistré pour l'instant.  [Noter une crise]"
```

### P7 — My data
```
│ Vos données                              │
│ Ce que nous gardons · Qui peut les voir · Ce que Nawba ne fait pas · Vos droits
│ (4 short sections, 1–2 sentences each)   │
│ [ Télécharger mes données ]              │
│ [ Supprimer mes données ] → dialog: what is deleted, "Supprimer définitivement" / "Annuler"
```

### P8 — Desktop (patient app)
Phone-width column (420 px) centred on whitewash in a `--r-lg` white frame with `--shadow-1`; tab bar inside the
frame. Below 480 px the frame disappears and the app is full-bleed.

### C1 — Clinician queue (1440 px)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◯ Nawba  Consultation épilepsie · CHU démo   [ Rechercher un patient…]  FR│ع  Déconnexion │
├──────────────────────────────────────────────────────────────────────────────┤
│ [⬣ 4 Urgent] [△ 31 À revoir] [ⓘ 22 Information] [✓ 83 Stable]   ← filters    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Gravité        Patient            Motif principal              30 jours        Prises  Dernière│
│ ⬣ Urgent       P-B5A657 · 6 · F   Crise de 7 min 46 s (> 5)   ▁▁▃▁▁█▁▁…▲     92 %   il y a 2 h│
│                rural              +3 autres                                               │
│ △ À revoir     P-A62631 · 40 · F  5 crises en 28 j vs 1,7…    ▁▁▁▃▁▁▃▃…      71 %   hier    │
└──────────────────────────────────────────────────────────────────────────────┘
│ ⓘ Avis consultatif. Le clinicien décide.                                     │  slim strip
```
Rhythm strip: 30 columns × ~20 px, bar height = seizures that day, a small urgent-coloured cap marks a day with a
seizure above threshold; `aria-label` summarises ("5 crises en 30 jours, 1 au-dessus du seuil").

### C2 — Patient detail
```
│ ← File · P-B5A657 · 6 ans · F · rural · Sarra B. · +216 00 000 0xx    │
│ ┌ sticky ─────────────────────────────────────────────────────────────┐ │
│ │ Alerte : Crise de 7 min 46 s     [Valider] [Écarter] [Appeler]       │ │
│ │ Valider = l'alerte est vue et prise en charge, elle quitte la file.  │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ ┌ Résumé de consultation ───────┐ ┌ Estimation du risque (7 j) ───────┐  │
│ │ 6 crises en 30 j vs 2/mois …  │ │ ⬤ Moyen  (pas une prédiction)     │  │
│ │ 4 sur 6 dans les 24 h …       │ │ crises 4 sem.   ████▶ augmente    │  │
│ └───────────────────────────────┘ │ prises oubliées ██▶   augmente    │  │
│                                   │ données complètes ◀██ diminue     │  │
│ Crises (6 mois)  — y: durée (min), x: date, ┄ seuil 5 min, ○ blessure   │
│ Prises (26 semaines) — y: % prises, x: semaine, ┄ 80 %, gris = non noté │
│ Historique : ● 10/10 14:02 Validé par dr.demo — "vu en consultation"    │
```

---

## 5. Self-review (pass 1 → pass 2): what read like a template default, and what I changed

1. **Draft said "cards with soft shadows for every section".** That is the generic SaaS default and the brief says few shadows. → Cards are now flat white on whitewash; the only shadow is on things that float (phone frame on desktop, sticky action bar, dialog).
2. **Draft had a 4-up KPI card grid on the dashboard** (copied instinct from the reference's KPI tiles). The brief asks for counts that *are* filters and forbids identical card grids. → Replaced by one segmented filter strip; each count is a button with icon + word.
3. **Draft used one 12 px radius everywhere.** → Radius now follows hierarchy (6 chips/inputs, 12 cards/buttons, 20 frame/sheets); the seizure control is the only circle.
4. **Draft had an uppercase "EN COURS" eyebrow above the timer** and uppercase severity badges (the old UI did this too). → Sentence case everywhere; the timer label is a plain "en cours" under the digits.
5. **Draft used `--watch` #B7791F for "À revoir" text.** It measures 3.64:1 on white — fails AA. → Added `--watch-ink` #8A5A12 (5.91:1) for text; #B7791F only for icons/fills next to a word.
6. **Draft put the language switcher in a `<select>`** (old UI). The brief wants native names visible, and a select hides them. → Segmented control "Français · العربية · دارجة" on the patient top bar (fits at 390 px with `--fs-14`).
7. **Draft's risk factors were a bulleted list.** → Diverging horizontal bars with direction words ("augmente / diminue"), so direction is not colour-only.
8. **Draft's empty "Mes entrées" said "Aucune donnée".** → Invites an action: "Rien d'enregistré pour l'instant." + "Noter une crise".
9. **Draft shrank the advisory notice into the footer only.** → Slim persistent strip with an info icon, plus `padding-block-end` on `<main>` equal to its height so it never covers content.

## 6. Changes after pass 2 (build review)
- **Severity colours across the dashboard (team request).** Queue rows, alert cards, the sticky action bar, history
  dots and the patient badge are tinted by tier. This goes beyond "two loud places"; it is kept quiet on purpose —
  7 % tints for rows, 6 % for cards, full tint only for the selected item — and the icon + word remain, so the rhythm
  strip and the seizure control are still the boldest things on their screens. The a11y audit re-ran clean on the tints.
- `--settled-ink` (#276B4A) added after the audit measured green-on-green-tint text at 4.28:1.
- Language buttons and the reminder switch raised to 48 px after the audit.
- First-aid reduced to 3 steps in the config (brief), paired with clock / shield / side-position icons.
- Charts forced left-to-right inside Arabic pages (time axis), English engine text isolated with `unicode-bidi: plaintext`.
- Sticky action bar capped to the space above the advisory strip, with `scroll-padding`, so Confirm is never hidden.
