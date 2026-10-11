import { useEffect, useMemo, useState } from "react";
import { makeApi } from "../shared/api.js";
import { AuthLayout } from "../shared/AuthLayout.jsx";
import { Icon } from "../shared/icons.jsx";
import { contentLang, dir, t } from "../shared/i18n.js";
import { AdherenceChart, RhythmStrip, SeizureTimeline } from "./charts.jsx";

const api = makeApi("nawba.clinic.token");
const CLANGS = { fr: "Français", ar: "العربية", darija: "دارجة" };

// F1: engine and summary messages arrive as {code, params, text}; render them from the translation file.
// Old alerts stored as plain English strings still display (fallback), as does `text` for an unknown code.
export function msgText(L, m) {
  if (!m) return "";
  if (typeof m === "string") return m;
  const key = `msg_${m.code}`;
  const locale = document.documentElement.lang === "fr" ? "fr-FR" : "ar-TN";
  const params = Object.fromEntries(Object.entries(m.params || {}).map(([k, v]) =>
    [k, typeof v === "number" ? v.toLocaleString(locale, { maximumFractionDigits: 1 }) : v]));
  const out = L(key, params);
  return out === key ? m.text : out;
}
const notesText = (L, a) => (a.confidence_notes ? a.confidence_notes.map((n) => msgText(L, n)).join(" ") : a.confidence_note);
const pointValue = (L, v) => (typeof v === "string" ? (L(`cat_${v}`) !== `cat_${v}` ? L(`cat_${v}`) : L(v)) : v);
// Severity is never colour alone: colour + icon + word, everywhere.
export const TIERS = {
  urgent: { icon: "alert-octagon", key: "c_urgent" },
  review: { icon: "alert-triangle", key: "c_review" },
  info: { icon: "info-circle", key: "c_info" },
  stable: { icon: "circle-check", key: "c_stable" },
};
const TIER_OF = { urgent: "urgent", high: "review", medium: "review", low: "info" };
const age = (y) => new Date().getFullYear() - y;

function Severity({ L, tier }) {
  const s = TIERS[tier];
  return <span className={`sev sev-${tier}`}><span className="sev-chip"><Icon name={s.icon} size={18} /></span>{L(s.key)}</span>;
}

function ago(iso, lang) {
  if (!iso) return "—";
  const rtf = new Intl.RelativeTimeFormat(contentLang(lang) === "fr" ? "fr" : "ar", { numeric: "auto" });
  const mins = Math.round((new Date(iso) - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  if (Math.abs(mins) < 60 * 48) return rtf.format(Math.round(mins / 60), "hour");
  return rtf.format(Math.round(mins / 1440), "day");
}

export default function App() {
  const [lang, setLang] = useState(localStorage.getItem("nawba.clinic.lang") || "fr");
  const [view, setView] = useState(null);
  const [search, setSearch] = useState("");
  const [me, setMe] = useState(null);
  const L = (k, v) => t(lang, k, v);
  useEffect(() => { if (api.loggedIn()) api.get("/me").then(setMe).catch(() => {}); }, []);
  useEffect(() => {
    localStorage.setItem("nawba.clinic.lang", lang);
    document.documentElement.dir = dir(lang);
    document.documentElement.lang = contentLang(lang);
  }, [lang]);

  const langSwitch = (
    <div className="segmented" role="group" aria-label={L("language")}>
      {Object.entries(CLANGS).map(([k, v]) => <button type="button" key={k} lang={k} aria-pressed={lang === k} onClick={() => setLang(k)}>{v}</button>)}
    </div>
  );
  // Check 12: the exact English sentence is always shown next to the translation.
  const ADVISORY_EN = "Advisory only. The clinician decides.";
  const advisory = (
    <footer className="advisory" role="note"><Icon name="info-circle" size={18} />
      <span>{L("c_advisory")}</span><span lang="en" dir="ltr" className="advisory-en">{ADVISORY_EN}</span>
    </footer>
  );

  if (!api.loggedIn()) return <Login L={L} langSwitch={langSwitch} advisory={advisory} />;
  const logout = () => { api.logout(); window.location.reload(); };
  return (
    <div className="clinic shell">
      <aside className="side" aria-label={L("c_nav")}>
        <div className="side-brand"><Logo /><span><b>Nawba</b><small>{L("c_clinic")}</small></span></div>
        <nav className="side-nav">
          <button className="side-link" aria-current={!view ? "page" : undefined} onClick={() => setView(null)}>
            <Icon name="list-details" size={20} />{L("c_nav_queue")}
          </button>
          {view && (
            <button className="side-link side-sub" aria-current="page">
              <Icon name="user" size={20} />{L("c_nav_patient", { id: view })}
            </button>
          )}
        </nav>
        <div className="side-user">
          <span className="avatar" aria-hidden="true">{(me?.username || "?").slice(0, 2).toUpperCase()}</span>
          <span><b>{me?.username || "…"}</b><small>{L("c_role_clinician")}</small></span>
        </div>
        <button className="side-link" onClick={logout}><Icon name="logout" size={20} />{L("c_logout")}</button>
      </aside>
      <div className="shell-main">
        <header className="c-top">
          <label className="c-search">
            <span className="visually-hidden">{L("c_search")}</span>
            <Icon name="search" size={18} />
            <input className="input" placeholder={L("c_search")} value={search}
                   onChange={(e) => { setSearch(e.target.value.toUpperCase()); setView(null); }} />
          </label>
          {langSwitch}
          <span className="user-chip"><span className="avatar" aria-hidden="true">{(me?.username || "?").slice(0, 2).toUpperCase()}</span>{me?.username}</span>
          <button className="btn btn-quiet top-logout" onClick={logout}><Icon name="logout" size={18} />{L("c_logout")}</button>
        </header>
        <main className="c-main">
          {view ? <Detail L={L} lang={lang} id={view} back={() => setView(null)} /> : <Queue L={L} lang={lang} search={search} open={setView} />}
        </main>
      </div>
      {advisory}
    </div>
  );
}

function Logo() {
  // Heart with a pulse line, same file as the favicon and the landing page.
  return <img src="/logo.svg" width="32" height="32" alt="" />;
}

function Login({ L, langSwitch, advisory }) {
  const onLogin = async (u, p) => {
    try {
      const r = await api.login(u, p);
      if (r.role !== "clinician") { api.logout(); return L("c_wrong"); }
      window.location.reload();
      return null;
    } catch { return L("c_wrong"); }
  };
  return (
    <div className="clinic clinic-auth">
      <AuthLayout L={L} title={L("c_signin")} subtitle={L("c_auth_sub")} langSwitch={langSwitch} onLogin={onLogin} note={L("c_auth_note")} userHint="c_auth_user_hint" />
      {advisory}
    </div>
  );
}

function Queue({ L, lang, search, open }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState(new Set(["urgent", "review"])); // default: what needs a decision
  const [sensitive, setSensitive] = useState(false); // F2: optional low-threshold view, off by default
  useEffect(() => { api.get("/clinic/patients?sensitive=1").then(setRows).catch((e) => setRows(e)); }, []);
  const counts = useMemo(() => {
    const c = { urgent: 0, review: 0, info: 0, stable: 0 };
    (Array.isArray(rows) ? rows : []).forEach((r) => c[r.tier]++);
    return c;
  }, [rows]);
  if (!rows) return <div className="stack"><div className="skeleton" /><div className="skeleton skeleton-lg" /></div>;
  if (rows instanceof Error) return <p className="error-box">{L("error_generic")}</p>;
  const toggle = (k) => setFilter((f) => { const n = new Set(f); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const extra = rows.filter((r) => r.sensitive_only);
  const shown = rows.filter((r) => (search ? r.id.includes(search) : filter.has(r.tier) || (sensitive && r.sensitive_only)));
  return (
    <>
      <header className="page-head">
        <h1>{L("c_queue_title")}</h1>
        <p className="muted">{L("c_queue_sub")}</p>
      </header>
      <div className="kpis" role="group" aria-label={L("c_severity")}>
        {Object.keys(TIERS).map((k) => (
          <button key={k} className={`kpi kpi-filter tier-${k}`} aria-pressed={filter.has(k)} onClick={() => toggle(k)}>
            <span className="kpi-chip"><Icon name={TIERS[k].icon} size={22} /></span>
            <span className="kpi-value num">{counts[k]}</span>
            <span className="kpi-label">{L(TIERS[k].key)}</span>
          </button>
        ))}
      </div>
      <div className="sensitive-row">
        <label className="switch">
          <input type="checkbox" role="switch" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />
          <span><b>{L("c_sensitive_toggle")}</b> <span className="muted num">({L("c_sensitive_more", { n: extra.length })})</span></span>
        </label>
        {sensitive && <p className="muted small">{L("c_sensitive_note")}</p>}
      </div>
      <div className="queue">
        <table>
          <thead>
            <tr><th>{L("c_severity")}</th><th>{L("c_patient")}</th><th>{L("c_reason")}</th><th>{L("c_rhythm")}</th><th>{L("c_adherence")}</th><th>{L("c_last")}</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} data-row={r.id} className={`tier-${r.tier}`} tabIndex={0}
                  onClick={() => open(r.id)} onKeyDown={(e) => e.key === "Enter" && open(r.id)}>
                <td>
                  {r.sensitive_only && sensitive && !filter.has(r.tier)
                    ? <span className="sev sev-info"><span className="sev-chip"><Icon name="info-circle" size={18} /></span>{L("c_sensitive_badge")}</span>
                    : <Severity L={L} tier={r.tier} />}
                </td>
                <td>
                  <div className="pid">{r.id}</div>
                  <div className="muted">{L("c_age_sex", { age: age(r.birth_year), sex: L(`c_${r.sex}`), region: L(`c_${r.region}`) })}</div>
                </td>
                <td className="reason">
                  {r.sensitive_only && sensitive && !filter.has(r.tier) ? msgText(L, r.sensitive_reason)
                    : r.top_reason ? msgText(L, r.top_reason) : <span className="muted">{L("c_none")}</span>}
                  {r.more > 0 && <div className="more">{L("c_more", { n: r.more })}</div>}
                </td>
                <td><RhythmStrip days={r.rhythm} L={L} /></td>
                <td>
                  {r.adherence_30d == null ? <span className="muted">{L("c_adh_unknown")}</span> : (
                    <span className="adh num">
                      <span className="adh-bar" aria-hidden="true">
                        <span style={{ inlineSize: `${r.adherence_30d * 100}%`, background: r.adherence_30d < 0.8 ? "var(--watch)" : "var(--settled)" }} />
                      </span>
                      {Math.round(r.adherence_30d * 100)} %
                    </span>
                  )}
                </td>
                <td className="muted num">{ago(r.last_alert_at, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <div className="empty"><p>{L("c_empty_filter")}</p></div>}
      </div>
    </>
  );
}

function Detail({ L, lang, id, back }) {
  const [d, setD] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [ins, setIns] = useState(null);
  const [sel, setSel] = useState(null);
  const load = () => api.get(`/clinic/patients/${id}`).then((x) => { setD(x); setSel((s) => x.alerts.find((a) => a.id === s && a.status === "open")?.id ?? x.alerts.find((a) => a.status === "open")?.id ?? null); }).catch((e) => setD(e));
  useEffect(() => {
    load();
    api.get("/config/public").then(setCfg);
    api.get(`/clinic/patients/${id}/insights`).then(setIns).catch(() => setIns({}));
  }, [id]);
  if (!d) return <div className="stack"><div className="skeleton" /><div className="skeleton skeleton-lg" /></div>;
  if (d instanceof Error) return <p className="error-box">{L("error_generic")}</p>;
  const p = d.patient;
  const open = d.alerts.filter((a) => a.status === "open");
  const selected = open.find((a) => a.id === sel);
  const worst = ["urgent", "review", "info"].find((tr) => open.some((a) => TIER_OF[a.severity] === tr)) || "stable";
  const triggerCounts = {};
  d.seizures.forEach((s) => s.triggers.forEach((x) => (triggerCounts[x] = (triggerCounts[x] || 0) + 1)));
  // patient KPIs (computed from the same records the charts use)
  const DAY = 864e5, now = Date.now();
  const inDays = (iso, a, b) => { const age = (now - new Date(iso)) / DAY; return age >= a && age < b; };
  const sz30 = d.seizures.filter((s) => inDays(s.started_at, 0, 30)).length;
  const szPrev = d.seizures.filter((s) => inDays(s.started_at, 30, 60)).length;
  const adh = d.adherence.filter((x) => inDays(x.date, 0, 30)).reduce((a, x) => [a[0] + x.taken, a[1] + x.taken + x.missed], [0, 0]);
  const adhPct = adh[1] ? Math.round((adh[0] / adh[1]) * 100) : null;

  return (
    <>
      <div className="spread no-print">
        <button className="btn btn-quiet back" onClick={back}><Icon name="arrow-left" size={18} />{L("c_back")}</button>
        <div className="row">
          <button className="btn" onClick={() => window.print()}>{L("c_print")}</button>
          <button className="btn btn-primary" onClick={() => downloadFhir(id)}><Icon name="download" size={18} />{L("c_fhir")}</button>
        </div>
      </div>
      {/* context bar: everything about who this is, on one line */}
      <section className="context-bar" aria-label={L("c_patient")}>
        <span className={`sev sev-${worst}`}><span className="dot" aria-hidden="true" />{L(TIERS[worst].key)}</span>
        <h1 className="pid">{p.id}</h1>
        <span>{L("c_age_sex", { age: age(p.birth_year), sex: L(`c_${p.sex}`), region: L(`c_${p.region}`) })}</span>
        <span>{p.name}</span>
        <span className="num">{p.phone}</span>
        <span>{L("c_medication")} : {d.medications.filter((m) => m.active).map((m) => `${m.drug_name} ${m.dose_text}`).join("; ") || "—"}</span>
      </section>
      <div className="kpis">
        <Kpi icon="wave-sine" label={L("c_kpi_seizures")} value={sz30}
             delta={szPrev || sz30 ? { up: sz30 > szPrev, text: L("c_vs_before", { n: szPrev }) } : null} />
        <Kpi icon="pill" label={L("c_kpi_adherence")} value={adhPct == null ? "—" : `${adhPct} %`} tone={adhPct != null && adhPct < 80 ? "review" : null} />
        <Kpi icon="alert-triangle" label={L("c_kpi_open")} value={open.length} tone={open.length ? worst : null} />
        <Kpi icon="info-circle" label={L("c_kpi_risk")} value={ins?.risk?.band ? L(`c_band_${ins.risk.band}`) : "—"}
             tone={{ high: "urgent", medium: "review", low: "stable" }[ins?.risk?.band] || null} />
      </div>
      <div className="print-only print-notice">
        <p className="strong">{L("c_advisory")}</p>
        {/* F8: every printout carries the review-only notice in the three languages */}
        <p lang="fr">{t("fr", "review_notice")}</p>
        <p lang="ar" dir="rtl">{t("ar", "review_notice")}</p>
        <p lang="ar" dir="rtl">{t("darija", "review_notice")}</p>
      </div>

      <ActionBar L={L} alert={selected} phone={p.phone} onDone={load} />

      <section className="card">
        <h2>{L("c_open_alerts")} ({open.length})</h2>
        {open.length === 0 ? <p className="muted">{L("c_no_open")}</p> : (
          <div className="alert-list">
            {open.map((a) => (
              <button key={a.id} className={`alert-item tier-${TIER_OF[a.severity]}`} aria-pressed={a.id === sel} onClick={() => setSel(a.id)}>
                <Severity L={L} tier={TIER_OF[a.severity]} />
                <span className="stack" style={{ gap: "var(--s-1)" }}>
                  <span className="row"><b>{L(`type_${a.type}`)}</b><span className="status-pill status-open">{L("c_status_open")}</span></span>
                  {a.reasons.map((r, i) => <span key={i}>{msgText(L, r)}</span>)}
                  <span className="muted small">
                    {L("c_confidence", { c: L(`conf_${a.confidence}`) })} · {notesText(L, a)}
                    {a.occurrences > 1 && ` · ${L("c_occurrences", { n: a.occurrences })}`}
                  </span>
                  <details onClick={(e) => e.stopPropagation()}>
                    <summary className="summary-line small">{L("c_data_behind", { n: a.data_points.length })}</summary>
                    <ul className="small muted">
                      {a.data_points.map((dp, i) => (
                        <li key={i} className="num">{L(dp.kind)}{dp.at ? ` · ${new Date(dp.at).toLocaleString()}` : ""} · {pointValue(L, dp.value)} · <code>{String(dp.id).slice(0, 8)}</code></li>
                      ))}
                    </ul>
                  </details>
                </span>
              </button>
            ))}
          </div>
        )}
        </section>

      <div className="grid-2">
        <Summary L={L} ins={ins} />
        <Risk L={L} risk={ins?.risk} />
      </div>

      <section className="card">
        <h2>{L("c_seizures_chart")}</h2>
        <SeizureTimeline L={L} lang={lang} seizures={d.seizures} threshold={cfg?.prolonged_seconds ?? 300} />
      </section>
      <section className="card">
        <h2>{L("c_adherence_chart")}</h2>
        <AdherenceChart L={L} days={d.adherence} />
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>{L("c_triggers")}</h2>
          {Object.keys(triggerCounts).length === 0 ? <p className="muted">—</p> : (
            <ul>{Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => <li key={k}>{L(`trig_${k}`)} : <span className="num">{n}</span></li>)}</ul>
          )}
          <h2>{L("c_reports")}</h2>
          <ul>{d.reports.slice(-6).reverse().map((r) => <li key={r.id}><time className="muted num">{new Date(r.at).toLocaleDateString()}</time> · {L(`report_${r.kind}`)}{r.detail ? ` : ${r.detail}` : ""}</li>)}</ul>
        </section>
        <History L={L} lang={lang} alerts={d.alerts} />
      </div>
      <Descriptions L={L} seizures={d.seizures.filter((s) => s.description)} categories={cfg?.seizure_categories || []} onDone={load} />
    </>
  );
}

// Big-number card with a tinted icon chip; `delta` shows direction with an arrow AND a word, never colour alone.
function Kpi({ icon, label, value, tone, delta }) {
  return (
    <div className={`kpi ${tone ? `tier-${tone}` : ""}`}>
      <span className="kpi-chip"><Icon name={icon} size={22} /></span>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value num">{value}</span>
      {delta && <span className={`kpi-delta ${delta.up ? "up" : "down"}`}>{delta.up ? "▲" : "▼"} {delta.text}</span>}
    </div>
  );
}

// Validate / Dismiss / Call in 3 steps: (1) choose the action — its consequence is stated,
// (2) give a reason (quick chips or text) — written to the audit log, (3) confirm.
function ActionBar({ L, alert, phone, onDone }) {
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState(null);
  useEffect(() => { setAction(null); setReason(""); setErr(null); }, [alert?.id]);
  if (!alert) return <div className="action-bar no-print"><p className="muted">{L("c_select_alert")}</p></div>;
  const ACTIONS = [["validate", "c_validate", "circle-check"], ["dismiss", "c_dismiss", "x"], ["call", "c_call", "phone"]];
  const confirm = async () => {
    try {
      if (action === "call") window.location.href = `tel:${phone.replaceAll(" ", "")}`;
      await api.post(`/clinic/alerts/${alert.id}/action`, { action, reason: reason.trim() });
      onDone();
    } catch { setErr(L("error_generic")); }
  };
  const step = !action ? 1 : !reason.trim() ? 2 : 3;
  return (
    <section className={`action-bar no-print tier-${TIER_OF[alert.severity]}`} aria-label={L("c_open_alerts")}>
      <div className="spread">
        <span className="row"><Severity L={L} tier={TIER_OF[alert.severity]} /><b>{msgText(L, alert.reasons[0])}</b></span>
        <span className="muted small">{L("c_step", { n: step })}</span>
      </div>
      <div className="row">
        {ACTIONS.map(([k, key, icon]) => (
          <button key={k} className={`btn ${action === k ? "btn-primary" : ""}`} aria-pressed={action === k} onClick={() => setAction(k)}>
            <Icon name={icon} size={18} />{L(key)}
          </button>
        ))}
      </div>
      <p className="muted small">
        {action ? L(`c_${action}_means`) : ACTIONS.map(([k, key]) => `${L(key)} : ${L(`c_${k}_means`)}`).join("  ·  ")}
      </p>
      {action && (
        <>
          <label className="field">
            <span>{L("c_reason_label")}</span>
            <div className="chips">
              {L("c_reason_quick").split("|").map((q) => <button key={q} className="chip" aria-pressed={reason === q} onClick={() => setReason(q)}>{q}</button>)}
            </div>
            <input className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={L("c_reason_label")} />
          </label>
          <div className="row">
            <button className="btn btn-primary" disabled={!reason.trim()} onClick={confirm}>{L("c_confirm", { a: L(`c_${action}`) })}</button>
            <button className="btn btn-quiet" onClick={() => setAction(null)}>{L("cancel")}</button>
          </div>
        </>
      )}
      {err && <p className="error-box">{err}</p>}
    </section>
  );
}

async function downloadFhir(id) {
  const bundle = await api.get(`/clinic/patients/${id}/fhir`);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" }));
  a.download = `${id}-fhir.json`;
  a.click();
}

function Summary({ L, ins }) {
  return (
    <section className="card">
      <h2>{L("c_summary")}</h2>
      {!ins ? <div className="skeleton skeleton-lg" /> : (
        <ul className="stack">
          {ins.summary?.map((s) => (
            <li key={s.text}>
              <details>
                <summary className="summary-line">{msgText(L, s)}</summary>
                <small className="muted num">{s.points.length ? s.points.map((x) => `${L(x.kind)} ${x.id.slice(0, 8)}`).join(" · ") : "—"}</small>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Risk({ L, risk }) {
  if (!risk) return <section className="card"><h2>{L("c_risk")}</h2><div className="skeleton skeleton-lg" /></section>;
  if (risk.error) return <section className="card"><h2>{L("c_risk")}</h2><p className="muted">{risk.error}</p></section>;
  const tier = { low: "stable", medium: "review", high: "urgent" }[risk.band];
  const max = Math.max(...risk.contributions.map((c) => Math.abs(c.contribution)), 0.01);
  return (
    <section className="card">
      <div className="spread"><h2>{L("c_risk")}</h2><span className={`sev sev-${tier}`}><span className="sev-chip"><Icon name={TIERS[tier].icon} size={18} /></span>{L(`c_band_${risk.band}`)}</span></div>
      <p className="muted small">{L("c_risk_note")}</p>
      {risk.contributions.map((c) => (
        <div className="factor" key={c.key}>
          <span>{L(`c_f_${c.key}`)} <span className="muted num">({c.value})</span></span>
          <span className="factor-track" aria-hidden="true">
            <span className={`factor-fill ${c.contribution > 0 ? "up" : "down"}`} style={{ inlineSize: `${(Math.abs(c.contribution) / max) * 50}%` }} />
          </span>
          <span className={c.contribution > 0 ? "sev-urgent" : "sev-stable"}>{c.contribution > 0 ? `▲ ${L("c_raises")}` : `▼ ${L("c_lowers")}`}</span>
        </div>
      ))}
      {risk.low_data && <p className="error-box small">{L("c_low_data")}</p>}
      <p className="muted small">{risk.model_version} · {L("c_advisory")}</p>
    </section>
  );
}

function History({ L, lang, alerts }) {
  const items = alerts.flatMap((a) => [
    { at: a.created_at, text: `${L(`type_${a.type}`)} — ${msgText(L, a.reasons[0])}`, tier: TIER_OF[a.severity] },
    ...(a.history || []).map((h) => ({ at: h.at, text: `${L(`c_${h.action}${h.action.endsWith("e") ? "d" : "ed"}`)} ${L("c_by", { who: h.by })}${h.reason ? ` — « ${h.reason} »` : ""}`, tier: null })),
  ]).sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, 12);
  return (
    <section className="card">
      <h2>{L("c_history")}</h2>
      <ol className="history">
        {items.map((h, i) => (
          <li key={i} className={h.tier ? `tier-${h.tier}` : ""}>
            <time className="muted small num">{new Date(h.at).toLocaleString(contentLang(lang) === "fr" ? "fr-FR" : "ar-TN")}</time>
            <div>{h.tier && <Severity L={L} tier={h.tier} />} {h.text}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Descriptions({ L, seizures, categories, onDone }) {
  return (
    <section className="card">
      <h2>{L("c_descriptions")}</h2>
      <p className="muted small">{L("c_desc_note")} {L("c_advisory")}</p>
      {!seizures.length && <p className="muted">{L("c_no_desc")}</p>}
      {seizures.slice().reverse().map((s) => <DescriptionRow key={s.id} L={L} s={s} categories={categories} onDone={onDone} />)}
    </section>
  );
}

function DescriptionRow({ L, s, categories, onDone }) {
  const [choice, setChoice] = useState(s.confirmed_category || s.ai_category || "unclear");
  const hl = new Set((s.ai_highlights || []).map((w) => w.toLowerCase()));
  const save = async () => { await api.post(`/clinic/seizures/${s.id}/category`, { category: choice }); onDone(); };
  return (
    <div className="dose">
      <div className="stack" style={{ gap: "var(--s-1)" }}>
        <p>“{s.description.split(/(\s+)/).map((w, i) => (hl.has(w.toLowerCase()) ? <mark key={i}>{w}</mark> : w))}”</p>
        <small className="muted">
          {new Date(s.started_at).toLocaleDateString()} · {L(`cat_${s.category}`)} → <b>{s.ai_category ? L(`cat_${s.ai_category}`) : "—"}</b>
          {s.ai_confidence != null && ` (${Math.round(s.ai_confidence * 100)} %)`} · {s.ai_model_version}
          {s.confirmed_category && ` · ✓ ${L(`cat_${s.confirmed_category}`)}`}
        </small>
      </div>
      <span className="row no-print">
        <select className="input" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label={L("c_reason")}>
          {categories.map((c) => <option key={c} value={c}>{L(`cat_${c}`)}</option>)}
        </select>
        <button className="btn" onClick={save}>{choice === s.ai_category ? L("c_confirm_cat") : L("c_correct_cat")}</button>
      </span>
    </div>
  );
}
