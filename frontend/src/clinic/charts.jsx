// Two small hand-written SVG charts (no chart library to audit or license).
const W = 520, H = 160, PAD = 28;

export function SeizureTimeline({ seizures, threshold = 300 }) {
  const end = Date.now(), start = end - 182 * 864e5;
  const pts = seizures.filter((s) => new Date(s.started_at) >= start);
  const maxMin = Math.max(6, ...pts.map((s) => (s.duration_s || 0) / 60));
  const x = (iso) => PAD + ((new Date(iso) - start) / (end - start)) * (W - 2 * PAD);
  const y = (sec) => H - PAD - ((sec || 0) / 60 / maxMin) * (H - 2 * PAD);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${pts.length} seizures over 6 months; height is duration`}>
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#999" />
      <line x1={PAD} x2={W - PAD} y1={y(threshold)} y2={y(threshold)} stroke="#a3241c" strokeDasharray="4 3" />
      <text x={W - PAD} y={y(threshold) - 4} textAnchor="end">threshold</text>
      <text x={PAD} y={H - 8}>6 months ago</text>
      <text x={W - PAD} y={H - 8} textAnchor="end">today</text>
      <text x={4} y={PAD}>{Math.round(maxMin)} min</text>
      {pts.map((s) => {
        const long = (s.duration_s || 0) > threshold;
        return (
          <circle key={s.id} cx={x(s.started_at)} cy={y(s.duration_s)} r={s.injury ? 6 : 4}
                  fill={long ? "#a3241c" : "#1f5f5b"} fillOpacity={0.75} stroke={s.injury ? "#000" : "none"}>
            <title>{new Date(s.started_at).toLocaleString()} · {s.duration_s ?? "?"} s · {s.category}{s.triggers.length ? ` · ${s.triggers.join(", ")}` : ""}</title>
          </circle>
        );
      })}
    </svg>
  );
}

export function AdherenceChart({ days }) {
  // Group daily {date, taken, missed} into 26 weekly bars ending today.
  const end = Date.now(), weeks = Array.from({ length: 26 }, () => ({ taken: 0, missed: 0 }));
  days.forEach((d) => {
    const w = 25 - Math.floor((end - new Date(d.date)) / (7 * 864e5));
    if (w >= 0 && w < 26) { weeks[w].taken += d.taken; weeks[w].missed += d.missed; }
  });
  const bw = (W - 2 * PAD) / 26;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly share of logged doses taken">
      <line x1={PAD} x2={W - PAD} y1={PAD + (H - 2 * PAD) * 0.2} y2={PAD + (H - 2 * PAD) * 0.2} stroke="#bbb" strokeDasharray="3 3" />
      <text x={4} y={PAD + (H - 2 * PAD) * 0.2 + 3}>80%</text>
      <text x={4} y={H - PAD}>0%</text>
      {weeks.map((w, i) => {
        const n = w.taken + w.missed, ratio = n ? w.taken / n : 0, h = n ? ratio * (H - 2 * PAD) : H - 2 * PAD;
        return (
          <rect key={i} x={PAD + i * bw + 1} width={bw - 2} y={H - PAD - h} height={h}
                fill={!n ? "#ddd" : ratio < 0.8 ? "#c2571a" : "#2f6b3a"}>
            <title>{n ? `${w.taken}/${n} taken (${Math.round(ratio * 100)}%)` : "no doses logged"}</title>
          </rect>
        );
      })}
      <text x={PAD} y={H - 8}>26 weeks ago</text>
      <text x={W - PAD} y={H - 8} textAnchor="end">this week</text>
    </svg>
  );
}
