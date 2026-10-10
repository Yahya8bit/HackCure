import { useEffect, useState } from "react";
import { makeApi } from "../shared/api.js";
import { AdherenceChart, SeizureTimeline } from "./charts.jsx";

const api = makeApi("nawba.clinic.token");
export const ADVISORY = "Advisory only. The clinician decides.";
const age = (birthYear) => new Date().getFullYear() - birthYear;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString() : "—");
const label = (s) => s.replaceAll("_", " ");

export default function App() {
  const [view, setView] = useState(null); // null = list, else patient id
  if (!api.loggedIn()) return <Login />;
  return (
    <main className="wide">
      <header>
        <strong>Nawba · Clinician</strong>
        <button className="link" onClick={() => { api.logout(); window.location.reload(); }}>Log out</button>
      </header>
      {view ? <Detail id={view} back={() => setView(null)} /> : <PatientList open={setView} />}
      <footer className="advisory" role="contentinfo">{ADVISORY}</footer>
    </main>
  );
}

function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await api.login(u, p);
      if (r.role !== "clinician") { api.logout(); throw new Error(); }
      window.location.reload();
    } catch { setErr("Wrong credentials or not a clinician account"); }
  };
  return (
    <main>
      <form className="card" onSubmit={submit}>
        <h2>Nawba · Clinician</h2>
        <input aria-label="Username" placeholder="Username" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" />
        <input aria-label="Password" placeholder="Password" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
        <button className="primary">Sign in</button>
        {err && <p className="error">{err}</p>}
      </form>
      <footer className="advisory">{ADVISORY}</footer>
    </main>
  );
}

function PatientList({ open }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/clinic/patients").then(setRows).catch((e) => setRows(e)); }, []);
  if (!rows) return <p>Loading…</p>;
  if (rows instanceof Error) return <p className="error">{rows.message}</p>;
  return (
    <section className="card">
      <h2>Patients by need for attention</h2>
      <p className="muted">Ranked by most severe open alert, then most recent. {rows.filter((r) => r.open_alerts).length} of {rows.length} patients have open alerts.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Severity</th><th>Patient</th><th>Age / sex / region</th><th>Top reason</th><th>Open</th><th>Last alert</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => open(r.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && open(r.id)}>
                <td><span className={`sev ${r.top_severity || "none"}`}>{r.top_severity || "none"}</span></td>
                <td><b>{r.id}</b></td>
                <td>{age(r.birth_year)} · {r.sex} · {r.region}</td>
                <td>{r.top_reason || <span className="muted">No open alert</span>}</td>
                <td>{r.open_alerts}</td>
                <td>{day(r.last_alert_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Detail({ id, back }) {
  const [d, setD] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [ins, setIns] = useState(null);
  const load = () => api.get(`/clinic/patients/${id}`).then(setD).catch((e) => setD(e));
  useEffect(() => {
    load();
    api.get("/config/public").then(setCfg);
    api.get(`/clinic/patients/${id}/insights`).then(setIns).catch(() => setIns({}));
  }, [id]);
  if (!d) return <p>Loading…</p>;
  if (d instanceof Error) return <p className="error">{d.message}</p>;
  const p = d.patient;
  const triggerCounts = {};
  d.seizures.forEach((s) => s.triggers.forEach((t) => (triggerCounts[t] = (triggerCounts[t] || 0) + 1)));
  const open = d.alerts.filter((a) => a.status === "open");
  const closed = d.alerts.filter((a) => a.status !== "open");

  return (
    <>
      <button className="link no-print" onClick={back}>← All patients</button>
      <section className="card">
        <h2>{p.id} · {p.name}</h2>
        <p className="muted">{age(p.birth_year)} y · {p.sex} · {p.region}{p.pregnant ? " · pregnancy reported" : ""} · {p.phone}</p>
        <div className="row no-print">
          <button onClick={() => window.print()}>Print summary</button>
          <button onClick={() => downloadFhir(id)}>Export FHIR JSON</button>
        </div>
        <p className="print-advisory">{ADVISORY}</p>
        <p>Medication: {d.medications.filter((m) => m.active).map((m) => `${m.drug_name} ${m.dose_text} at ${m.times.join(", ")}`).join("; ") || "none recorded"}</p>
      </section>

      <div className="grid2">
        <Summary ins={ins} />
        <Risk risk={ins?.risk} />
      </div>
      <Descriptions seizures={d.seizures.filter((s) => s.description)} categories={cfg?.seizure_categories || []} onDone={load} />

      <section className="card">
        <h3>Open alerts ({open.length})</h3>
        <p className="advisory-inline">{ADVISORY}</p>
        {open.length === 0 && <p className="muted">No open alerts.</p>}
        {open.map((a) => <AlertCard key={a.id} a={a} phone={p.phone} onDone={load} />)}
      </section>

      <div className="grid2">
        <section className="card">
          <h3>Seizure timeline (last 6 months)</h3>
          <SeizureTimeline seizures={d.seizures} threshold={cfg?.prolonged_seconds} />
          <p className="muted">{d.seizures.length} seizures logged. Red = longer than threshold, ring = injury.</p>
        </section>
        <section className="card">
          <h3>Adherence (weekly % of logged doses taken)</h3>
          <AdherenceChart days={d.adherence} />
          <p className="muted">Grey = no doses logged that week (missing data, not missed doses).</p>
        </section>
        <section className="card">
          <h3>Logged triggers</h3>
          {Object.keys(triggerCounts).length === 0 ? <p className="muted">None logged.</p> : (
            <ul>{Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]).map(([t, n]) => <li key={t}>{label(t)}: {n} seizure(s)</li>)}</ul>
          )}
          <h3>Patient reports</h3>
          <ul>{d.reports.slice(-8).reverse().map((r) => <li key={r.id}>{day(r.at)} · {label(r.kind)}{r.detail ? `: ${r.detail}` : ""}</li>)}</ul>
        </section>
        <section className="card">
          <h3>Alert history ({closed.length})</h3>
          <ul>{closed.map((a) => <li key={a.id}>{day(a.created_at)} · <span className={`sev ${a.severity}`}>{a.severity}</span> {label(a.type)} — <b>{a.status}</b></li>)}</ul>
        </section>
      </div>
    </>
  );
}

// Validate / Dismiss / Call: click the action (step 1), optionally type why, confirm (step 2).
// Every confirmed action is written to the hash-chained audit log by the API.
function AlertCard({ a, phone, onDone }) {
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState(null);
  const confirm = async () => {
    try {
      if (action === "call") window.location.href = `tel:${phone.replaceAll(" ", "")}`;
      await api.post(`/clinic/alerts/${a.id}/action`, { action, reason });
      setAction(null); setReason(""); onDone();
    } catch (e) { setErr(e.message); }
  };
  return (
    <article className={`card alert ${a.severity}`}>
      <div className="row"><span className={`sev ${a.severity}`}>{a.severity}</span><b>{label(a.type)}</b><span className="muted">{day(a.created_at)}</span></div>
      <ul>{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      <p><b>Confidence: {a.confidence}.</b> <span className="muted">{a.confidence_note}</span></p>
      <details>
        <summary>Data behind this alert ({a.data_points.length})</summary>
        <ul>{a.data_points.map((p, i) => <li key={i}>{p.kind} {p.at ? day(p.at) : ""} · {String(p.value)} <code>{String(p.id).slice(0, 8)}</code></li>)}</ul>
      </details>
      <p className="muted">Rules {a.rules_version}. {ADVISORY}</p>
      {action ? (
        <div className="row">
          <input aria-label="Reason" placeholder={`Why ${action}? (optional)`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          <button className="primary" onClick={confirm}>Confirm {action}</button>
          <button className="link" onClick={() => setAction(null)}>Cancel</button>
        </div>
      ) : (
        <div className="row no-print">
          <button onClick={() => setAction("validate")}>Validate</button>
          <button onClick={() => setAction("dismiss")}>Dismiss</button>
          <button onClick={() => setAction("call")}>Call</button>
        </div>
      )}
      {err && <p className="error">{err}</p>}
    </article>
  );
}

async function downloadFhir(id) {
  const bundle = await api.get(`/clinic/patients/${id}/fhir`);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/fhir+json" }));
  a.download = `${id}-fhir.json`;
  a.click();
}

// Template sentences (no language model). Each one opens to show the records it was computed from.
function Summary({ ins }) {
  return (
    <section className="card">
      <h3>Consultation summary (last 30 days)</h3>
      {!ins ? <p>Loading…</p> : (
        <ul>
          {ins.summary?.map((s) => (
            <li key={s.text}>
              <details>
                <summary>{s.text}</summary>
                <small className="muted">{s.points.length ? s.points.map((p) => `${p.kind} ${p.id.slice(0, 8)}`).join(" · ") : "no records"}</small>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Risk({ risk }) {
  if (!risk) return <section className="card"><h3>7-day risk estimate</h3><p>Loading…</p></section>;
  if (risk.error) return <section className="card"><h3>7-day risk estimate</h3><p className="muted">{risk.error}</p></section>;
  return (
    <section className="card">
      <h3>7-day risk estimate <span className={`sev ${risk.band}`}>{risk.band}</span></h3>
      <p className="muted">{risk.wording} Clinician view only — never shown to patients.</p>
      <p>Top contributing factors:</p>
      <ol>{risk.factors.map((f) => <li key={f}>{f}</li>)}</ol>
      {risk.low_data && <p className="error">Few doses were logged recently: this estimate is less reliable.</p>}
      <p className="muted">Model {risk.model_version} · trained on synthetic data only · {ADVISORY}</p>
    </section>
  );
}

// Caregiver free-text descriptions with the model's suggested category. Clinician confirms or corrects.
function Descriptions({ seizures, categories, onDone }) {
  if (!seizures.length) return null;
  return (
    <section className="card">
      <h3>Caregiver descriptions</h3>
      <p className="muted">Suggested categories come from a local text model trained on placeholder data. Confirm or correct each one. {ADVISORY}</p>
      {seizures.slice().reverse().map((s) => <DescriptionRow key={s.id} s={s} categories={categories} onDone={onDone} />)}
    </section>
  );
}

function DescriptionRow({ s, categories, onDone }) {
  const [choice, setChoice] = useState(s.confirmed_category || s.ai_category || "unclear");
  const hl = new Set((s.ai_highlights || []).map((w) => w.toLowerCase()));
  const save = async () => { await api.post(`/clinic/seizures/${s.id}/category`, { category: choice }); onDone(); };
  return (
    <div className="dose">
      <div>
        <p>“{s.description.split(/(\s+)/).map((w, i) => (hl.has(w.toLowerCase()) ? <mark key={i}>{w}</mark> : w))}”</p>
        <small className="muted">
          {day(s.started_at)} · logged as {label(s.category)} · suggestion: <b>{label(s.ai_category || "none")}</b>
          {s.ai_confidence != null && ` (confidence ${Math.round(s.ai_confidence * 100)}%)`} {s.ai_model_version}
          {s.confirmed_category && ` · confirmed: ${label(s.confirmed_category)}`}
        </small>
      </div>
      <span className="row no-print">
        <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Category">
          {categories.map((c) => <option key={c} value={c}>{label(c)}</option>)}
        </select>
        <button onClick={save}>{choice === s.ai_category ? "Confirm" : "Correct"}</button>
      </span>
    </div>
  );
}
