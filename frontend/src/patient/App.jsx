import { useCallback, useEffect, useState } from "react";
import { makeApi } from "../shared/api.js";
import { dir, LANGS, t } from "../shared/i18n.js";
import { allEntries, clearAll, enqueue, sync } from "./queue.js";

const api = makeApi("nawba.patient.token");
const cached = (key, value) => {
  if (value !== undefined) localStorage.setItem(key, JSON.stringify(value));
  return JSON.parse(localStorage.getItem(key) || "null");
};
// Fetch from the API when online, fall back to the last copy saved on the phone.
async function getCached(path, key) {
  try { return cached(key, await api.get(path)); } catch { return cached(key); }
}
const contentLang = (lang) => (lang === "fr" ? "fr" : "ar");

export default function App() {
  const [lang, setLang] = useState(cached("nawba.lang") || "fr");
  const [me, setMe] = useState(null);
  const [pid, setPid] = useState(cached("nawba.pid"));
  const [cfg, setCfg] = useState(cached("nawba.config"));
  const [tab, setTab] = useState("seizure");
  const [entries, setEntries] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [notice, setNotice] = useState(null);
  const L = (k) => t(lang, k);

  const refresh = useCallback(async () => {
    const msgs = await sync(api, lang);
    if (msgs.length) setNotice(msgs[0]);
    setEntries((await allEntries()).reverse());
  }, [lang]);

  useEffect(() => {
    cached("nawba.lang", lang);
    document.documentElement.dir = dir(lang);
    document.documentElement.lang = contentLang(lang);
  }, [lang]);

  useEffect(() => {
    const up = () => { setOnline(navigator.onLine); refresh(); };
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    const timer = setInterval(refresh, 30000);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", up); clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    if (!api.loggedIn()) return;
    getCached("/config/public", "nawba.config").then(setCfg);
    getCached("/me", "nawba.me").then((m) => {
      setMe(m);
      if (m && !m.patients.some((p) => p.id === pid)) setPid(cached("nawba.pid", m.patients[0]?.id ?? null));
    });
    refresh();
  }, [pid, refresh]);

  if (!api.loggedIn()) return <Login L={L} lang={lang} setLang={setLang} />;
  if (!me) return <main><p>…</p></main>;
  const patient = me.patients.find((p) => p.id === pid);
  if (!patient || !cfg) return <main><p>…</p></main>;
  if (!patient.consent_at) return <Consent L={L} pid={pid} onDone={(c) => setMe({ ...me, patients: me.patients.map((p) => (p.id === pid ? { ...p, ...c } : p)) })} />;

  // Logout wipes this device (shared phones), but never silently drops unsynced entries.
  const logout = async () => {
    await sync(api, lang);
    const pending = (await allEntries()).filter((e) => e.status === "local").length;
    if (pending && !window.confirm(`${pending} × ${L("saved_local")} — ${L("delete_confirm")}`)) return;
    api.logout(); localStorage.clear(); await clearAll(); await caches.delete("nawba-v1"); window.location.reload();
  };
  const log = async (type, data) => { await enqueue(type, { patient_id: pid, ...data }); await refresh(); };

  return (
    <main>
      <header>
        <strong>{L("app_name")}</strong>
        <select aria-label={L("language")} value={lang} onChange={(e) => setLang(e.target.value)}>
          {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="link" onClick={logout}>{L("logout")}</button>
      </header>
      {me.patients.length > 1 && (
        <label className="for">{L("logging_for")}{" "}
          <select value={pid} onChange={(e) => setPid(cached("nawba.pid", e.target.value))}>
            {me.patients.map((p) => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
          </select>
        </label>
      )}
      {!online && <p className="offline">{L("offline")}</p>}
      {notice && <p className="notice" role="alert" onClick={() => setNotice(null)}>{notice}</p>}

      {tab === "seizure" && <SeizureLog L={L} lang={lang} cfg={cfg} log={log} />}
      {tab === "meds" && <Meds L={L} pid={pid} log={log} entries={entries} />}
      {tab === "report" && <Reports L={L} log={log} />}
      {tab === "history" && <History L={L} entries={entries.filter((e) => e.data.patient_id === pid)} />}
      {tab === "data" && <MyData L={L} pid={pid} />}

      <nav>
        {[["seizure", "seizure"], ["meds", "medications"], ["report", "reports"], ["history", "history"], ["data", "my_data"]].map(([k, label]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{L(label)}</button>
        ))}
      </nav>
    </main>
  );
}

function Login({ L, lang, setLang }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try { await api.login(u, p); window.location.reload(); } catch { setErr(L("wrong_login")); }
  };
  return (
    <main>
      <header><strong>{L("app_name")}</strong>
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </header>
      <form onSubmit={submit} className="card">
        <input aria-label={L("username")} placeholder={L("username")} value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" />
        <input aria-label={L("password")} placeholder={L("password")} type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
        <button className="primary">{L("sign_in")}</button>
        {err && <p className="error">{err}</p>}
      </form>
    </main>
  );
}

function Consent({ L, pid, onDone }) {
  const [research, setResearch] = useState(false);
  const [err, setErr] = useState(null);
  const accept = async () => {
    try { onDone(await api.post(`/patients/${pid}/consent`, { research })); } catch (e) { setErr(e.message); }
  };
  return (
    <main>
      <section className="card">
        <h2>{L("consent_title")}</h2>
        <p>{L("consent_body")}</p>
        <label><input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} /> {L("consent_research")}</label>
        <button className="primary" onClick={accept}>{L("consent_accept")}</button>
        {err && <p className="error">{err}</p>}
      </section>
    </main>
  );
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Tap 1: start timer. Tap 2: stop. Tap 3: pick what you saw -> saved.
// Trigger tags, injury and free-text description are optional extras on the same screen.
function SeizureLog({ L, lang, cfg, log }) {
  const [phase, setPhase] = useState("idle"); // idle | running | manual | classify | saved
  const [startedAt, setStartedAt] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(null);
  const [triggers, setTriggers] = useState([]);
  const [injury, setInjury] = useState(false);
  const [description, setDescription] = useState("");
  const [manual, setManual] = useState({ m: "", s: "" });
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [phase, startedAt]);

  const reset = () => { setPhase("idle"); setElapsed(0); setTriggers([]); setInjury(false); setDescription(""); setManual({ m: "", s: "" }); };
  const save = async (category) => {
    const start = startedAt ?? Date.now() - (duration ?? 0) * 1000;
    await log("seizure", { started_at: new Date(start).toISOString(), duration_s: duration, category, triggers, injury,
                           description: description.trim() || null });
    setSavedMsg(description.trim() ? L("description_saved") : L("saved"));
    reset();
    setPhase("saved");
  };
  const toggle = (tag) => setTriggers((x) => (x.includes(tag) ? x.filter((y) => y !== tag) : [...x, tag]));
  const cl = contentLang(lang);

  if (phase === "running") {
    const over = elapsed > cfg.prolonged_seconds;
    return (
      <section className={`card timer ${over ? "danger" : ""}`}>
        <div className="clock" aria-live="polite">{fmt(elapsed)}</div>
        {over && (
          <div className="emergency" role="alert">
            <p>{cfg.emergency_message[cl]}</p>
            <a className="call" href={`tel:${cfg.emergency_number}`}>{L("call_now")} {cfg.emergency_number}</a>
          </div>
        )}
        <h3>{L("first_aid_title")}</h3>
        <ul>{cfg.first_aid[cl].map((line) => <li key={line}>{line}</li>)}</ul>
        <button className="primary big" onClick={() => { setDuration(elapsed); setPhase("classify"); }}>{L("stop")}</button>
      </section>
    );
  }
  if (phase === "manual") {
    return (
      <section className="card">
        <label>{L("duration")}
          <span className="row">
            <input inputMode="numeric" value={manual.m} onChange={(e) => setManual({ ...manual, m: e.target.value.replace(/\D/g, "") })} aria-label={L("minutes")} /> {L("minutes")}
            <input inputMode="numeric" value={manual.s} onChange={(e) => setManual({ ...manual, s: e.target.value.replace(/\D/g, "") })} aria-label={L("seconds")} /> {L("seconds")}
          </span>
        </label>
        <button className="primary" onClick={() => { setStartedAt(null); setDuration(Number(manual.m || 0) * 60 + Number(manual.s || 0)); setPhase("classify"); }}>{L("confirm")}</button>
        <button className="link" onClick={reset}>{L("cancel")}</button>
      </section>
    );
  }
  if (phase === "classify") {
    return (
      <section className="card">
        <p className="muted">{L("duration")}: {fmt(duration)}</p>
        <h3>{L("choose_category")}</h3>
        <div className="choices">
          {cfg.seizure_categories.map((c) => <button key={c} className="choice" onClick={() => save(c)}>{L(`cat_${c}`)}</button>)}
        </div>
        <details>
          <summary>{L("options")}</summary>
          <div className="chips">
            {cfg.trigger_tags.map((tag) => (
              <button key={tag} className={triggers.includes(tag) ? "chip on" : "chip"} aria-pressed={triggers.includes(tag)} onClick={() => toggle(tag)}>{L(`trig_${tag}`)}</button>
            ))}
            <button className={injury ? "chip on" : "chip"} aria-pressed={injury} onClick={() => setInjury(!injury)}>{L("injury")}</button>
          </div>
          <textarea maxLength={1000} placeholder={L("describe")} value={description} onChange={(e) => setDescription(e.target.value)} />
        </details>
      </section>
    );
  }
  return (
    <section className="card center">
      {phase === "saved" && <p className="ok" role="status">{savedMsg} ✓</p>}
      <button className="primary huge" onClick={() => { setStartedAt(Date.now()); setElapsed(0); setPhase("running"); }}>{L("seizure_now")}</button>
      <button className="link" onClick={() => setPhase("manual")}>{L("already_over")}</button>
    </section>
  );
}

function Meds({ L, pid, log, entries }) {
  const [meds, setMeds] = useState(cached(`nawba.meds.${pid}`) || []);
  const [reminders, setReminders] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");
  useEffect(() => { getCached(`/patients/${pid}/medications`, `nawba.meds.${pid}`).then((m) => setMeds(m || [])); }, [pid]);
  const reminderText = L("reminder_text");
  useEffect(() => (reminders ? scheduleReminders(meds, reminderText) : undefined), [reminders, meds, reminderText]);

  const today = new Date();
  const at = (time) => { const [h, m] = time.split(":"); const d = new Date(today); d.setHours(+h, +m, 0, 0); return d.toISOString(); };
  const statusOf = (medId, iso) => entries.find((e) => e.type === "intake" && e.data.medication_id === medId && e.data.scheduled_at === iso);
  return (
    <section className="card">
      <h3>{L("today")}</h3>
      {meds.flatMap((m) => m.times.map((time) => {
        const iso = at(time), done = statusOf(m.id, iso);
        return (
          <div className="dose" key={m.id + time}>
            <span><b>{time}</b> {m.drug_name} {m.dose_text}</span>
            {done ? <Badge L={L} e={done} label={L(done.data.status)} /> : (
              <span className="row">
                <button className="ok-btn" onClick={() => log("intake", { medication_id: m.id, scheduled_at: iso, status: "taken" })}>{L("taken")}</button>
                <button className="miss-btn" onClick={() => log("intake", { medication_id: m.id, scheduled_at: iso, status: "missed" })}>{L("missed")}</button>
              </span>
            )}
          </div>
        );
      }))}
      {!reminders && "Notification" in window && (
        <button className="link" onClick={() => Notification.requestPermission().then((p) => setReminders(p === "granted"))}>{L("reminders_on")}</button>
      )}
    </section>
  );
}

// Discreet reminders: the text never names the illness or the drug (stigma protection on lock screens).
// ponytail: timers only fire while the app is open or backgrounded; true background push needs a push server.
function scheduleReminders(meds, text) {
  const now = Date.now();
  const ids = meds.flatMap((m) => m.times).map((time) => {
    const [h, mm] = time.split(":"); const d = new Date(); d.setHours(+h, +mm, 0, 0);
    const wait = d.getTime() - now;
    return wait > 0 ? setTimeout(() => navigator.serviceWorker?.ready.then((r) => r.showNotification("Nawba", { body: text, tag: "routine" })), wait) : null;
  });
  return () => ids.forEach((id) => id && clearTimeout(id));
}

function Reports({ L, log }) {
  const [side, setSide] = useState("");
  const [askPregnancy, setAskPregnancy] = useState(false);
  const [done, setDone] = useState(false);
  const report = async (kind, detail = null) => { await log("report", { at: new Date().toISOString(), kind, detail }); setDone(true); setSide(""); setAskPregnancy(false); };
  return (
    <section className="card">
      {done && <p className="ok" role="status">{L("saved")} ✓</p>}
      <button className="choice" onClick={() => report("poor_sleep")}>{L("poor_sleep")}</button>
      <div className="row">
        <input maxLength={200} placeholder={L("side_effect_hint")} value={side} onChange={(e) => setSide(e.target.value)} />
        <button className="choice" disabled={!side.trim()} onClick={() => report("side_effect", side.trim())}>{L("side_effect")}</button>
      </div>
      {askPregnancy
        ? <button className="choice" onClick={() => report("pregnancy")}>{L("confirm")}: {L("pregnancy")}</button>
        : <button className="choice" onClick={() => setAskPregnancy(true)}>{L("pregnancy")}</button>}
    </section>
  );
}

function Badge({ L, e, label }) {
  const s = { local: "saved_local", synced: "synced", rejected: "rejected" }[e.status];
  return <span className={`badge ${e.status}`} title={e.error || ""}>{label ? `${label} · ` : ""}{L(s)}</span>;
}

function History({ L, entries }) {
  return (
    <section className="card">
      <ul className="history">
        {entries.slice(0, 50).map((e) => (
          <li key={e.seq}>
            <span>{L(e.type)} · {new Date(e.data.started_at || e.data.scheduled_at || e.data.at).toLocaleString()}</span>
            <Badge L={L} e={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function MyData({ L, pid }) {
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState(null);
  const exportData = async () => {
    try {
      const data = await api.get(`/patients/${pid}/export`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = `nawba-${pid}.json`;
      a.click();
    } catch (e) { setMsg(e.message); }
  };
  const remove = async () => {
    try { await api.del(`/patients/${pid}`); await clearAll(); localStorage.clear(); setMsg(L("deleted")); setTimeout(() => window.location.reload(), 1500); }
    catch (e) { setMsg(e.message); }
  };
  return (
    <section className="card">
      <p>{L("consent_body")}</p>
      <button className="choice" onClick={exportData}>{L("export_data")}</button>
      {confirming
        ? <><p className="error">{L("delete_confirm")}</p><button className="miss-btn" onClick={remove}>{L("confirm")}</button> <button className="link" onClick={() => setConfirming(false)}>{L("cancel")}</button></>
        : <button className="miss-btn" onClick={() => setConfirming(true)}>{L("delete_data")}</button>}
      {msg && <p role="status">{msg}</p>}
    </section>
  );
}
