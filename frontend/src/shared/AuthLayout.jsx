import { useState } from "react";
import { Icon } from "./icons.jsx";

// Split-screen sign-in shared by the family app and the clinician dashboard.
// Left: the cobalt arch (Nawba's one recurring shape, drawn in CSS/SVG — no image, works offline)
// with a "back to the home page" pill. Right: the form. No social logins and no self sign-up:
// accounts are created by the care team, and no outside identity service is called.
export function AuthLayout({ L, title, subtitle, langSwitch, onLogin, note, userHint = "auth_user_hint" }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { setErr(await onLogin(u, p)); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <aside className="auth-visual">
        <a className="auth-back" href="/welcome/">
          <span className="auth-back-icon"><Icon name="arrow-left" size={18} /></span>{L("auth_back")}
        </a>
        <div className="auth-arch" aria-hidden="true">
          <div className="auth-control"><Icon name="wave-sine" size={28} /><span>{L("seizure_now")}</span></div>
        </div>
        <p className="auth-tagline">{L("auth_tagline")}</p>
        <p className="auth-synthetic">{L("synthetic")}</p>
      </aside>
      <main className="auth-main">
        <div className="auth-lang">{langSwitch}</div>
        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="auth-brand"><Logo /><span>Nawba</span></div>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
          <label className="field">
            <span>{L("username")}</span>
            <input className="input" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username"
                   placeholder={L(userHint)} required />
          </label>
          <label className="field">
            <span>{L("password")}</span>
            <span className="pw">
              <input className="input" type={show ? "text" : "password"} value={p} onChange={(e) => setP(e.target.value)}
                     autoComplete="current-password" required />
              <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-pressed={show}
                      aria-label={L(show ? "hide_password" : "show_password")}>
                <Icon name={show ? "eye-off" : "eye"} size={20} />
              </button>
            </span>
          </label>
          {err && <p className="error-box" role="alert">{err}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{L("sign_in")}</button>
          <p className="auth-note muted small">{note}</p>
        </form>
        <a className="auth-help" href="/welcome/#faq">
          <span className="auth-help-icon"><Icon name="help-circle" size={20} /></span>
          <span><b>{L("auth_help")}</b> <span className="auth-help-link">{L("auth_help_link")}</span></span>
        </a>
      </main>
    </div>
  );
}

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="var(--cobalt)" />
      <path d="M8 22V13a6 6 0 0 1 12 0v9" fill="none" stroke="var(--surface)" strokeWidth="2.5" />
    </svg>
  );
}
