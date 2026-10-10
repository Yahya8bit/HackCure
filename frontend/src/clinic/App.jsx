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
  const load = () => api.get(`/clinic/patients/${id}`).then(setD).catch((e) => setD(e));
  useEffect(() => { load(); api.get("/config/public").then(setCfg); }, [id]);
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
        <p>Medication: {d.medications.filter((m) => m.active).map((m) => `${m.drug_name} ${m.dose_text} at ${m.times.join(", ")}`).join("; ") || "none recorded"}</p>
      </section>

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
