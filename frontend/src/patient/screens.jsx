import { useEffect, useState } from "react";
import { AuthLayout } from "../shared/AuthLayout.jsx";
import { Icon } from "../shared/icons.jsx";
import { contentLang } from "../shared/i18n.js";
import { clearAll } from "./queue.js";
import { fmt, todaysDoses } from "./Seizure.jsx";

export function Login({ L, langSwitch, api }) {
  const onLogin = async (u, p) => {
    try { await api.login(u, p); window.location.reload(); return null; }
    catch (x) { return x.status === 401 ? L("wrong_login") : L("error_network"); }
  };
  return <AuthLayout L={L} title={L("auth_title_patient")} subtitle={L("auth_sub_patient")} langSwitch={langSwitch}
                     onLogin={onLogin} note={L("auth_note_patient")} />;
}

const DATA_SECTIONS = [["data_keep", "lock"], ["data_who", "user"], ["data_child", "user"], ["data_not", "stethoscope"], ["data_rights", "shield-lock"]];
function DataSections({ L }) {
  return DATA_SECTIONS.map(([k, icon]) => (
    <section key={k} className="entry">
      <span className="entry-icon"><Icon name={icon} size={18} /></span>
      <div className="entry-main"><h3>{L(`${k}_title`)}</h3><p className="muted">{L(`${k}_body`)}</p></div>
    </section>
  ));
}

export function Consent({ L, pid, api, onDone, langSwitch }) {
  const [research, setResearch] = useState(false);
  const [err, setErr] = useState(null);
  const accept = async () => {
    try { onDone(await api.post(`/patients/${pid}/consent`, { research })); }
    catch (x) { setErr(x.status ? L("error_generic") : L("error_network")); }
  };
  return (
    <div className="app">
      <main className="screen">
        <div className="spread"><h1>{L("consent_title")}</h1>{langSwitch}</div>
        <div className="card"><DataSections L={L} /></div>
        <label className="switch card"><span>{L("consent_research")}</span>
          <input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} /></label>
        <button className="btn btn-primary btn-lg" onClick={accept}>{L("consent_accept")}</button>
        {err && <p className="error-box" role="alert">{err}</p>}
      </main>
    </div>
  );
}

export function Treatment({ L, meds, entries, log }) {
  const doses = todaysDoses(meds, entries);
  const taken = doses.filter((d) => d.done?.data.status === "taken").length;
  const [reminders, setReminders] = useState(() => localStorage.getItem("nawba.reminders") === "1" && typeof Notification !== "undefined" && Notification.permission === "granted");
  const [blocked, setBlocked] = useState(false);
  const text = L("reminder_text");
  useEffect(() => (reminders ? scheduleReminders(meds, text) : undefined), [reminders, meds, text]);
  const toggleReminders = async (on) => {
    if (!on) { setReminders(false); localStorage.setItem("nawba.reminders", "0"); return; }
    if (typeof Notification === "undefined") return setBlocked(true);
    const p = await Notification.requestPermission();
    setBlocked(p !== "granted");
    setReminders(p === "granted");
    localStorage.setItem("nawba.reminders", p === "granted" ? "1" : "0");
  };
  return (
    <>
      <section className="card">
        <div className="spread"><h2>{L("treatment_title")}</h2><span className="muted num">{taken}/{doses.length}</span></div>
        {doses.length === 0 && <div className="empty"><p>{L("no_meds")}</p></div>}
        {doses.map((d) => (
          <div className="dose" key={d.med.id + d.time}>
            <span><b className="dose-time num">{d.time}</b> {d.med.drug_name} <span className="muted">{d.med.dose_text}</span></span>
            {d.done ? (
              <span className={`dose-done ${d.done.data.status}`}>
                <Icon name={d.done.data.status === "taken" ? "circle-check" : "alert-triangle"} className="check-pop" />
                {L(d.done.data.status)}
              </span>
            ) : (
              <span className="row">
                <button className="btn btn-primary" onClick={() => log("intake", { medication_id: d.med.id, scheduled_at: d.iso, status: "taken" })}>
                  <Icon name="check" size={18} />{L("mark_taken")}</button>
                <button className="btn" onClick={() => log("intake", { medication_id: d.med.id, scheduled_at: d.iso, status: "missed" })}>{L("mark_missed")}</button>
              </span>
            )}
          </div>
        ))}
      </section>
      <section className="card">
        <label className="switch">
          <span className="row"><Icon name={reminders ? "bell" : "bell-off"} />{L("reminders_title")}</span>
          <input type="checkbox" role="switch" checked={reminders} onChange={(e) => toggleReminders(e.target.checked)} />
        </label>
        <p className="muted small">{L("reminders_explain")}</p>
        {blocked && <p className="error-box small">{L("reminders_blocked")}</p>}
      </section>
    </>
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

const QUICK = [["poor_sleep", "poor_sleep", "moon"], ["fever", "trigger", "thermometer"], ["stress", "trigger", "mood-sad"], ["missed_dose", "trigger", "pill"]];

export function Report({ L, log, patient }) {
  const [done, setDone] = useState({});
  const [side, setSide] = useState("");
  const [askPregnancy, setAskPregnancy] = useState(false);
  const report = async (key, kind, detail = null) => {
    await log("report", { at: new Date().toISOString(), kind, detail }, "saved");
    setDone((d) => ({ ...d, [key]: true }));
  };
  return (
    <>
      <section className="card">
        <h2>{L("report_title")}</h2>
        <p className="muted small">{L("report_hint")}</p>
        <div className="chips">
          {QUICK.map(([key, kind, icon]) => (
            <button key={key} className="chip" aria-pressed={!!done[key]} onClick={() => report(key, kind, kind === "trigger" ? key : null)}>
              <Icon name={done[key] ? "check" : icon} size={18} />{L(key)}
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <label className="field"><span>{L("side_effect")}</span>
          <input className="input" maxLength={200} placeholder={L("side_effect_hint")} value={side} onChange={(e) => setSide(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={!side.trim()} onClick={() => { report("side", "side_effect", side.trim()); setSide(""); }}>
          {done.side && !side ? L("saved") : L("save")}
        </button>
      </section>
      {/* Fix 1: shown only for a female patient within the configured age range (server decides). */}
      {patient.can_report_pregnancy && (
        <section className="card">
          {done.pregnancy ? <p className="dose-done taken"><Icon name="check" />{L("saved")}</p>
            : askPregnancy ? <button className="btn btn-primary" onClick={() => report("pregnancy", "pregnancy")}>{L("pregnancy_confirm")}</button>
              : <button className="btn" onClick={() => setAskPregnancy(true)}>{L("pregnancy")}</button>}
        </section>
      )}
    </>
  );
}

const ENTRY_ICON = { seizure: "wave-sine", intake: "pill", report: "message-report" };

function describe(L, e) {
  if (e.type === "seizure") return `${L("seizure")} · ${e.duration_s != null ? fmt(e.duration_s) : "?"}`;
  if (e.type === "intake") return `${L("intake")} · ${L(e.status)}`;
  return `${L(`report_${e.kind}`)}${e.detail ? ` · ${L(e.detail) === e.detail ? e.detail : L(e.detail)}` : ""}`;
}

// Fix 2: real list = server history (works on any device) + entries still waiting on this phone.
export function Entries({ L, lang, pid, entries, getCached, goLog }) {
  const [server, setServer] = useState(null);
  useEffect(() => { getCached(`/patients/${pid}/entries?days=30`, `nawba.entries.${pid}`).then((x) => setServer(x || [])); }, [pid, entries.length, getCached]);
  if (server === null) return <div className="skeleton skeleton-lg" />;
  const local = entries.filter((e) => e.data.patient_id === pid && e.status !== "synced")
    .map((e) => ({ ...e.data, type: e.type, id: e.data.id, at: e.data.started_at || e.data.scheduled_at || e.data.at, sync: e.status }));
  const localIds = new Set(local.map((e) => e.id));
  const all = [...local, ...server.filter((e) => !localIds.has(e.id)).map((e) => ({ ...e, sync: "synced" }))]
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  if (!all.length) {
    return (
      <div className="empty">
        <h2>{L("entries_title")}</h2>
        <p>{L("empty_entries")}</p>
        <button className="btn btn-primary" onClick={goLog}><Icon name="wave-sine" />{L("log_seizure")}</button>
      </div>
    );
  }
  const locale = contentLang(lang) === "fr" ? "fr-FR" : "ar-TN";
  const dayKey = (d) => new Date(d).toDateString();
  const today = dayKey(Date.now()), yesterday = dayKey(Date.now() - 864e5);
  const groups = [];
  for (const e of all) {
    const k = dayKey(e.at);
    if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  return (
    <section className="card">
      <h2>{L("entries_title")}</h2>
      {groups.slice(0, 14).map((g) => (
        <div key={g.k} className="day-group">
          <h3>{g.k === today ? L("today_label") : g.k === yesterday ? L("yesterday") : new Date(g.k).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}</h3>
          {g.items.map((e) => (
            <div className="entry" key={e.id}>
              <span className="entry-icon"><Icon name={ENTRY_ICON[e.type]} size={18} /></span>
              <div className="entry-main">
                <div>{describe(L, e)}</div>
                <time className="muted small">{new Date(e.at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</time>
              </div>
              <span className={`pill pill-${e.sync}`}>{L(e.sync === "local" ? "sync_local" : e.sync === "rejected" ? "rejected" : "sync_synced")}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

export function MyData({ L, pid, api, logout }) {
  const [dialog, setDialog] = useState(false);
  const [msg, setMsg] = useState(null);
  const exportData = async () => {
    try {
      const data = await api.get(`/patients/${pid}/export`); // carries the review-only notice (F8)
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = `nawba-${pid}.json`;
      a.click();
    } catch (x) { setMsg(x.status ? L("error_generic") : L("error_network")); }
  };
  const remove = async () => {
    try { await api.del(`/patients/${pid}`); await clearAll(); localStorage.clear(); setMsg(L("deleted")); setTimeout(() => window.location.reload(), 1500); }
    catch (x) { setMsg(x.status ? L("error_generic") : L("error_network")); }
    setDialog(false);
  };
  return (
    <>
      <section className="card"><h2>{L("data_title")}</h2><DataSections L={L} /></section>
      <section className="card">
        <button className="btn btn-lg" onClick={exportData}><Icon name="download" />{L("export_data")}</button>
        <button className="btn btn-lg" onClick={() => setDialog(true)}><Icon name="trash" />{L("delete_data")}</button>
        {msg && <p role="status" className="muted">{msg}</p>}
      </section>
      <button className="btn btn-quiet" onClick={logout}><Icon name="logout" />{L("logout")}</button>
      {dialog && (
        <div className="scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && setDialog(false)}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="del-t" aria-describedby="del-b">
            <h2 id="del-t">{L("delete_title")}</h2>
            <p id="del-b">{L("delete_body")}</p>
            <button className="btn btn-danger btn-lg" onClick={remove}>{L("delete_confirm_btn")}</button>
            <button className="btn btn-lg" autoFocus onClick={() => setDialog(false)}>{L("cancel")}</button>
          </div>
        </div>
      )}
    </>
  );
}
