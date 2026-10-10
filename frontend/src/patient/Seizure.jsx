import { useEffect, useState } from "react";
import { Icon } from "../shared/icons.jsx";
import { contentLang } from "../shared/i18n.js";

export const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const STEP_ICONS = ["clock", "shield-half", "bed"]; // pairs with the 3 config first-aid lines

// Today's doses from the schedule + what has been logged for each.
export function todaysDoses(meds, entries) {
  const today = new Date();
  return meds.flatMap((m) => m.times.map((time) => {
    const [h, mm] = time.split(":");
    const d = new Date(today); d.setHours(+h, +mm, 0, 0);
    const iso = d.toISOString();
    const done = entries.find((e) => e.type === "intake" && e.data.medication_id === m.id && e.data.scheduled_at === iso);
    return { med: m, time, iso, at: d, done };
  })).sort((a, b) => a.at - b.at);
}

export function Home({ L, lang, cfg, log, meds, entries, goMeds }) {
  const [flow, setFlow] = useState(null); // null | {start, manual}
  const doses = todaysDoses(meds, entries);
  const taken = doses.filter((d) => d.done?.data.status === "taken").length;
  const next = doses.find((d) => !d.done);

  return (
    <>
      <section className="card" aria-labelledby="today">
        <div className="spread">
          <h2 id="today" className="h-small">
            {doses.length ? L("today_status", { taken, total: doses.length }) : L("today_status_none")}
          </h2>
          <Icon name="pill" />
        </div>
        {doses.length > 0 && <div className="progress" aria-hidden="true"><span style={{ inlineSize: `${(taken / doses.length) * 100}%` }} /></div>}
      </section>

      <section className="hero" aria-label={L("seizure_now")}>
        <button className="seizure-btn" onClick={() => setFlow({ start: Date.now(), manual: false })}>
          <Icon name="wave-sine" size={32} />
          <span>{L("seizure_now")}</span>
        </button>
        <p className="muted small">{L("seizure_hint")}</p>
        <button className="btn btn-quiet" onClick={() => setFlow({ start: null, manual: true })}>{L("already_over")}</button>
      </section>

      <section className="card">
        <div className="spread">
          <span className="muted small">{L("next_dose")}</span>
          <Icon name="clock" size={18} />
        </div>
        {next ? (
          <div className="spread">
            <span><b className="dose-time num">{next.time}</b> {next.med.drug_name} {next.med.dose_text}</span>
            <button className="btn btn-primary" onClick={() => log("intake", { medication_id: next.med.id, scheduled_at: next.iso, status: "taken" })}>
              {L("mark_taken")}
            </button>
          </div>
        ) : (
          <button className="btn btn-quiet" onClick={goMeds}>{doses.length ? L("no_more_doses") : L("no_meds")}</button>
        )}
      </section>

      {flow && <SeizureFlow L={L} lang={lang} cfg={cfg} flow={flow} log={log} close={() => setFlow(null)} />}
    </>
  );
}

// Tap 1 (Home): start. Tap 2: stop. Tap 3: what you saw -> saved.
// Duration is prefilled; triggers, injury and a free-text description are optional and sit above the type chips.
function SeizureFlow({ L, lang, cfg, flow, log, close }) {
  const [phase, setPhase] = useState(flow.manual ? "finish" : "running");
  const [elapsed, setElapsed] = useState(0);
  const [mins, setMins] = useState(flow.manual ? "" : "0");
  const [secs, setSecs] = useState(flow.manual ? "" : "0");
  const [triggers, setTriggers] = useState([]);
  const [injury, setInjury] = useState(false);
  const [description, setDescription] = useState("");
  const cl = contentLang(lang);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - flow.start) / 1000)), 500);
    return () => clearInterval(id);
  }, [phase, flow.start]);

  const limit = cfg.prolonged_seconds;
  const over = elapsed > limit;
  const R = 104, C = 2 * Math.PI * R;
  const progress = Math.min(elapsed / limit, 1);

  const stop = () => { setMins(String(Math.floor(elapsed / 60))); setSecs(String(elapsed % 60)); setPhase("finish"); };
  const save = async (category) => {
    const duration = Number(mins || 0) * 60 + Number(secs || 0);
    const start = flow.start ?? Date.now() - duration * 1000;
    close();
    await log("seizure", { started_at: new Date(start).toISOString(), duration_s: duration, category, triggers, injury,
                           description: description.trim() || null },
              description.trim() ? "description_saved" : "toast_saved");
  };
  const toggle = (tag) => setTriggers((x) => (x.includes(tag) ? x.filter((y) => y !== tag) : [...x, tag]));

  return (
    <div className="focus-screen" role="dialog" aria-modal="true" aria-label={L("seizure_now")}>
      <div className="focus-inner">
        {phase === "running" ? (
          <>
            <div className={`ring ${over ? "over" : ""}`}>
              <svg viewBox="0 0 232 232" aria-hidden="true">
                <circle className="ring-track" cx="116" cy="116" r={R} fill="none" strokeWidth="12" />
                <circle className="ring-arc" cx="116" cy="116" r={R} fill="none" strokeWidth="12" strokeLinecap="round"
                        strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
              </svg>
              <div className="ring-label" aria-live="polite">
                <span className="clock num">{fmt(elapsed)}</span>
                <span className="muted">{L("in_progress")}</span>
              </div>
            </div>
            {over && (
              <div className="emergency confirm" role="alert">
                <p className="strong"><Icon name="alert-octagon" /> {cfg.emergency_message[cl]}</p>
                <a className="call-btn" href={`tel:${cfg.emergency_number}`}><Icon name="phone" />{L("call_number", { n: cfg.emergency_number })}</a>
              </div>
            )}
            <section className="stack" aria-labelledby="fa">
              <h2 id="fa">{L("first_aid_title")}</h2>
              <ol className="steps">
                {cfg.first_aid[cl].map((line, i) => (
                  <li key={line}><span className="step-icon"><Icon name={STEP_ICONS[i] || "info-circle"} /></span><span>{line}</span></li>
                ))}
              </ol>
            </section>
            <button className="btn btn-primary btn-block btn-lg" onClick={stop}>
              <Icon name="hand-stop" />{L("stop")}
            </button>
          </>
        ) : (
          <>
            <div className="spread">
              <h2>{L("finish_title")}</h2>
              <button className="btn btn-quiet" onClick={close} aria-label={L("cancel")}><Icon name="x" /></button>
            </div>
            <label className="field">
              <span>{L("duration")}</span>
              <span className="duration">
                <input className="input num" inputMode="numeric" aria-label={L("minutes")} value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} /> {L("minutes")}
                <input className="input num" inputMode="numeric" aria-label={L("seconds")} value={secs} onChange={(e) => setSecs(e.target.value.replace(/\D/g, ""))} /> {L("seconds")}
              </span>
            </label>
            <details>
              <summary><Icon name="pencil" size={18} />{L("add_details")}</summary>
              <div className="stack pad-block">
                <span className="muted small">{L("triggers_label")}</span>
                <div className="chips">
                  {cfg.trigger_tags.map((tag) => (
                    <button key={tag} className="chip" aria-pressed={triggers.includes(tag)} onClick={() => toggle(tag)}>{L(`trig_${tag}`)}</button>
                  ))}
                </div>
                <span className="muted small">{L("injury_q")}</span>
                <div className="toggle" role="group" aria-label={L("injury_q")}>
                  <button aria-pressed={!injury} onClick={() => setInjury(false)}>{L("no")}</button>
                  <button aria-pressed={injury} onClick={() => setInjury(true)}>{L("yes")}</button>
                </div>
                <label className="field">
                  <span>{L("describe")}</span>
                  <textarea className="textarea" maxLength={1000} placeholder={L("describe_example")} value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
              </div>
            </details>
            <p className="muted small">{L("finish_hint")}</p>
            <div className="choices stack">
              {cfg.seizure_categories.map((c) => (
                <button key={c} className="btn btn-block btn-lg btn-start" onClick={() => save(c)}>{L(`cat_${c}`)}</button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
