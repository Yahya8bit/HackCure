// Hand-written SVG charts (no chart library). Colour-blind safe: cobalt vs urgent red differ in
// lightness as well as hue, "above threshold" is also a different SHAPE (triangle), injury is a ring.
import { contentLang } from "../shared/i18n.js";

// Loud place #2: 30 days, one bar per day; a red cap marks a day with a seizure above the threshold.
export function RhythmStrip({ days, L }) {
  const W = 150, H = 30, bw = W / 30, max = Math.max(2, ...days.map((d) => d[0]));
  const total = days.reduce((a, d) => a + d[0], 0), over = days.reduce((a, d) => a + d[1], 0);
  return (
    <svg className="rhythm" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
         aria-label={`${total} ${L("seizure").toLowerCase()} / 30 j${over ? `, ${over} ${L("c_leg_over").toLowerCase()}` : ""}`}>
      <line className="base" x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} />
      {days.map(([n, o], i) => {
        if (!n) return null;
        const h = Math.max(4, (n / max) * (H - 6));
        return (
          <g key={i}>
            <rect className="bar" x={i * bw + 0.5} y={H - h} width={bw - 1} height={h} rx="1" />
            {o > 0 && <rect className="over" x={i * bw + 0.5} y={H - h - 4} width={bw - 1} height="3" />}
          </g>
        );
      })}
    </svg>
  );
}

const W = 960, H = 280, PL = 76, PR = 24, PT = 16, PB = 48;

export function SeizureTimeline({ L, lang, seizures, threshold }) {
  const end = Date.now(), start = end - 182 * 864e5;
  const pts = seizures.filter((s) => new Date(s.started_at) >= start);
  const maxMin = Math.max(6, Math.ceil(Math.max(0, ...pts.map((s) => (s.duration_s || 0) / 60))));
  const x = (iso) => PL + ((new Date(iso) - start) / (end - start)) * (W - PL - PR);
  const y = (sec) => H - PB - ((sec || 0) / 60 / maxMin) * (H - PT - PB);
  const locale = contentLang(lang) === "fr" ? "fr-FR" : "ar-TN";
  const months = Array.from({ length: 7 }, (_, i) => { const d = new Date(end); d.setMonth(d.getMonth() - 6 + i, 1); return d; }).filter((d) => d >= start);
  const yTicks = Array.from({ length: maxMin / 2 + 1 }, (_, i) => i * 2).filter((m) => m <= maxMin);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${L("c_seizures_chart")}: ${pts.length}`}>
        {yTicks.map((m) => (
          <g key={m}>
            <line className="grid" x1={PL} x2={W - PR} y1={y(m * 60)} y2={y(m * 60)} />
            <text x={PL - 8} y={y(m * 60) + 4} textAnchor="end">{m}</text>
          </g>
        ))}
        <line className="axis" x1={PL} x2={W - PR} y1={H - PB} y2={H - PB} />
        <line className="axis" x1={PL} x2={PL} y1={PT} y2={H - PB} />
        {months.map((d) => <text key={d.toISOString()} x={x(d.toISOString())} y={H - PB + 18} textAnchor="middle">{d.toLocaleDateString(locale, { month: "short" })}</text>)}
        <text x={(W + PL) / 2} y={H - 6} textAnchor="middle">{L("c_axis_date")}</text>
        <text x={14} y={(H - PB + PT) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(H - PB + PT) / 2})`}>{L("c_axis_duration")}</text>
        <line className="thr" x1={PL} x2={W - PR} y1={y(threshold)} y2={y(threshold)} />
        <text className="thr-label" x={W - PR} y={y(threshold) - 6} textAnchor="end">{L("c_threshold", { n: threshold / 60 })}</text>
        {pts.map((s) => {
          const cx = x(s.started_at), cy = y(s.duration_s), long = (s.duration_s || 0) > threshold;
          return (
            <g key={s.id}>
              <title>{new Date(s.started_at).toLocaleString(locale)} · {s.duration_s ?? "?"} s · {L(`cat_${s.category}`)}</title>
              {long ? <path d={`M${cx} ${cy - 7} L${cx + 7} ${cy + 5} L${cx - 7} ${cy + 5} Z`} fill="var(--urgent)" />
                : <circle cx={cx} cy={cy} r="5" fill="var(--purple)" fillOpacity="0.8" />}
              {s.injury && <circle cx={cx} cy={cy} r="10" fill="none" stroke="var(--aubergine)" strokeWidth="2" />}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--purple)" /></svg>{L("c_leg_seizure")}</span>
        <span><svg width="14" height="12" aria-hidden="true"><path d="M7 0 L14 12 L0 12 Z" fill="var(--urgent)" /></svg>{L("c_leg_over")}</span>
        <span><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="var(--aubergine)" strokeWidth="2" /></svg>{L("c_leg_injury")}</span>
        <span><svg width="20" height="8" aria-hidden="true"><line x1="0" x2="20" y1="4" y2="4" stroke="var(--urgent)" strokeWidth="2" strokeDasharray="6 4" /></svg>{L("c_threshold", { n: threshold / 60 })}</span>
      </div>
    </>
  );
}

export function AdherenceChart({ L, days }) {
  const end = Date.now(), weeks = Array.from({ length: 26 }, () => ({ taken: 0, missed: 0 }));
  days.forEach((d) => {
    const w = 25 - Math.floor((end - new Date(d.date)) / (7 * 864e5));
    if (w >= 0 && w < 26) { weeks[w].taken += d.taken; weeks[w].missed += d.missed; }
  });
  const bw = (W - PL - PR) / 26, y = (r) => H - PB - r * (H - PT - PB);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={L("c_adherence_chart")}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--watch-tint)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--watch)" strokeWidth="3" />
          </pattern>
        </defs>
        {[0, 0.5, 0.8, 1].map((r) => (
          <g key={r}>
            <line className={r === 0.8 ? "thr" : "grid"} x1={PL} x2={W - PR} y1={y(r)} y2={y(r)} />
            <text x={PL - 8} y={y(r) + 4} textAnchor="end">{Math.round(r * 100)}%</text>
          </g>
        ))}
        <line className="axis" x1={PL} x2={W - PR} y1={H - PB} y2={H - PB} />
        {weeks.map((w, i) => {
          const n = w.taken + w.missed, r = n ? w.taken / n : 0;
          return (
            <g key={i}>
              <title>{n ? `${w.taken}/${n} (${Math.round(r * 100)}%)` : L("c_leg_none")}</title>
              {n ? <rect x={PL + i * bw + 2} width={bw - 4} y={y(r)} height={H - PB - y(r)} fill={r < 0.8 ? "url(#hatch)" : "var(--purple)"} rx="2" />
                : <rect x={PL + i * bw + 2} width={bw - 4} y={y(1)} height={H - PB - y(1)} fill="none" stroke="var(--line)" strokeDasharray="3 3" rx="2" />}
            </g>
          );
        })}
        {[0, 13, 25].map((i) => <text key={i} x={PL + i * bw + bw / 2} y={H - PB + 18} textAnchor="middle">{i === 25 ? "0" : `−${25 - i}`}</text>)}
        <text x={(W + PL) / 2} y={H - 6} textAnchor="middle">{L("c_axis_weeks")}</text>
        <text x={14} y={(H - PB + PT) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(H - PB + PT) / 2})`}>{L("c_axis_pct")}</text>
      </svg>
      <div className="legend">
        <span><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="2" fill="var(--purple)" /></svg>{L("c_leg_ok")}</span>
        <span><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="2" fill="url(#hatch)" stroke="var(--watch)" /></svg>{L("c_leg_low")}</span>
        <span><svg width="14" height="14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" rx="2" fill="none" stroke="var(--ink-muted)" strokeDasharray="3 2" /></svg>{L("c_leg_none")}</span>
      </div>
    </>
  );
}
