import { useCallback, useEffect, useState } from "react";
import { makeApi } from "../shared/api.js";
import { Icon } from "../shared/icons.jsx";
import { contentLang, dir, LANGS, t } from "../shared/i18n.js";
import { allEntries, clearAll, enqueue, sync } from "./queue.js";
import { Consent, Entries, Login, MyData, Report, Treatment } from "./screens.jsx";
import { Home } from "./Seizure.jsx";

export const api = makeApi("nawba.patient.token");

// Small offline cache: last answer from the API, kept on the phone.
export const cached = (key, value) => {
  try {
    if (value !== undefined) localStorage.setItem(key, JSON.stringify(value));
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch { return null; }
};
export async function getCached(path, key) {
  try { return cached(key, await api.get(path)); } catch { return cached(key); }
}

const TABS = [
  ["home", "home", "wave-sine"],
  ["meds", "medications", "pill"],
  ["report", "reports", "message-report"],
  ["entries", "entries", "list-details"],
  ["data", "data", "shield-lock"],
];

const initials = (name, id) => (name ? name.replace(/\(.*\)/, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") : id.slice(2, 4));

export default function App() {
  const [lang, setLang] = useState(cached("nawba.lang") || "fr");
  const [me, setMe] = useState(cached("nawba.me"));
  const [pid, setPid] = useState(cached("nawba.pid"));
  const [cfg, setCfg] = useState(cached("nawba.config"));
  const [meds, setMeds] = useState([]);
  const [tab, setTab] = useState("home");
  const [entries, setEntries] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState(null);
  const [notice, setNotice] = useState(null);
  const [menu, setMenu] = useState(false);
  const L = useCallback((k, vars) => t(lang, k, vars), [lang]);

  const refresh = useCallback(async () => {
    const before = (await allEntries()).filter((e) => e.status === "local").length;
    const msgs = await sync(api, lang);
    if (msgs.length) setNotice(msgs[0]);
    const all = await allEntries();
    if (before && !all.some((e) => e.status === "local")) setToast({ text: t(lang, "toast_synced"), kind: "synced" });
    setEntries(all.reverse());
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
      if (!m) return;
      setMe(m);
      if (!m.patients.some((p) => p.id === pid)) setPid(cached("nawba.pid", m.patients[0]?.id ?? null));
    });
    refresh();
  }, [pid, refresh]);

  useEffect(() => {
    if (pid) getCached(`/patients/${pid}/medications`, `nawba.meds.${pid}`).then((m) => setMeds(m || []));
  }, [pid]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const langSwitch = (
    <div className="segmented" role="group" aria-label={L("language")}>
      {Object.entries(LANGS).map(([k, v]) => (
        <button type="button" key={k} lang={k === "fr" ? "fr" : "ar"} aria-pressed={lang === k} onClick={() => setLang(k)}>{v}</button>
      ))}
    </div>
  );

  if (!api.loggedIn()) return <Login L={L} langSwitch={langSwitch} api={api} />;
  if (!me || !cfg) return <div className="app"><main className="screen"><div className="skeleton skeleton-lg" /></main></div>;
  const patient = me.patients.find((p) => p.id === pid);
  if (!patient) return <div className="app"><main className="screen"><p>{L("loading")}</p></main></div>;
  if (!patient.consent_at) {
    return <Consent L={L} pid={pid} api={api} langSwitch={langSwitch}
      onDone={(c) => setMe(cached("nawba.me", { ...me, patients: me.patients.map((p) => (p.id === pid ? { ...p, ...c } : p)) }))} />;
  }

  const log = async (type, data, toastKey = "toast_saved") => {
    await enqueue(type, { patient_id: pid, ...data });
    setToast({ text: L(toastKey), kind: "local" });
    await refresh();
  };
  const pending = entries.filter((e) => e.status === "local").length;
  const logout = async () => {
    await sync(api, lang);
    const left = (await allEntries()).filter((e) => e.status === "local").length;
    if (left && !window.confirm(`${left} × ${L("sync_local")}. ${L("delete_body")}`)) return;
    api.logout(); localStorage.clear(); await clearAll();
    if ("caches" in window) for (const k of await caches.keys()) if (k.startsWith("nawba")) await caches.delete(k); // any cache version
    window.location.reload();
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="spread">
          <div className="who-wrap">
            <button className="who" aria-haspopup={me.patients.length > 1} aria-expanded={menu}
              onClick={() => me.patients.length > 1 && setMenu(!menu)} aria-label={me.patients.length > 1 ? L("switch_person") : undefined}>
              <span className="avatar" aria-hidden="true">{initials(patient.name, patient.id)}</span>
              <span className="who-name">{patient.name || patient.id}</span>
              {me.patients.length > 1 && <Icon name="chevron-right" size={16} className="icon-dir" />}
            </button>
            {menu && (
              <div className="who-menu">
                {me.patients.map((p) => (
                  <button key={p.id} className="btn btn-start who-option"
                    onClick={() => { setPid(cached("nawba.pid", p.id)); setMenu(false); }}>
                    <span className="avatar" aria-hidden="true">{initials(p.name, p.id)}</span>{p.name || p.id}
                  </button>
                ))}
              </div>
            )}
          </div>
          {langSwitch}
        </div>
        <div className="row">
          <span className={`pill ${pending ? "pill-local" : "pill-synced"}`} role="status">
            <Icon name={pending ? "device-mobile" : "cloud-check"} size={16} />
            {pending ? `${L("sync_local")} (${pending})` : L("sync_synced")}
          </span>
          {cfg.synthetic_data && <span className="pill pill-synthetic">{L("synthetic")}</span>}
          {!online && <span className="offline-note"><Icon name="device-mobile" size={16} />{L("error_network")}</span>}
        </div>
      </header>

      <main className="screen" id="main">
        {notice && <p className="notice" role="alert"><Icon name="alert-octagon" />{notice}</p>}
        {tab === "home" && <Home L={L} lang={lang} cfg={cfg} log={log} meds={meds} entries={entries} pid={pid} getCached={getCached} go={setTab} />}
        {tab === "meds" && <Treatment L={L} meds={meds} entries={entries} log={log} />}
        {tab === "report" && <Report L={L} log={log} patient={patient} />}
        {tab === "entries" && <Entries L={L} lang={lang} pid={pid} entries={entries} getCached={getCached} goLog={() => setTab("home")} />}
        {tab === "data" && <MyData L={L} pid={pid} api={api} logout={logout} />}
      </main>

      {toast && (
        <div className={`toast confirm`} role="status">
          <Icon name={toast.kind === "synced" ? "cloud-check" : "check"} className="check-pop" />{toast.text}
        </div>
      )}

      <nav className="tabbar" aria-label="Navigation">
        {TABS.map(([key, label, icon]) => (
          <button key={key} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>
            <Icon name={icon} size={24} />
            <span>{L(label)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
