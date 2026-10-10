// k6 load test: many phones syncing their offline queues at once (check 23).
//   docker run --rm --network host -v ./load:/load grafana/k6:0.55.0 run /load/sync.js
// Each iteration = one phone sending a batch of 5 queued entries (4 dose confirmations + 1 seizure),
// which also triggers the alert engine for that patient, like a real sync.
import http from "k6/http";
import { check } from "k6";

// Local UUID v4 (no internet import needed): fine for load-test ids.
const uuidv4 = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
});
const BASE = __ENV.BASE || "https://localhost:8443/api";
export const options = {
  insecureSkipTLSVerify: true, // self-signed local certificate
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || "60s",
  summaryTrendStats: ["med", "p(95)", "p(99)", "max"],
};

export function setup() {
  // 50 load-test caregivers (seeded only with LOADTEST_ACCOUNTS=1), each linked to 3 different patients.
  const users = Array.from({ length: 50 }, (_, k) => `load.${k}`);
  return users.map((username) => {
    const r = http.post(`${BASE}/auth/login`, JSON.stringify({ username, password: "demo1234" }), { headers: { "Content-Type": "application/json" } });
    const token = r.json("token");
    const me = http.get(`${BASE}/me`, { headers: { Authorization: `Bearer ${token}` } }).json();
    return { token, patients: me.patients.map((p) => p.id) };
  });
}

export default function (accounts) {
  const a = accounts[(__VU - 1) % accounts.length];
  const pid = a.patients[__ITER % a.patients.length];
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const entries = [1, 2, 3, 4].map((i) => ({ type: "intake", data: { id: uuidv4(), patient_id: pid, scheduled_at: ago(i * 12), status: "taken" } }));
  entries.push({ type: "seizure", data: { id: uuidv4(), patient_id: pid, started_at: ago(1), duration_s: 60, category: "absence", triggers: [], injury: false } });
  const r = http.post(`${BASE}/sync`, JSON.stringify({ entries }), { headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.token}` } });
  check(r, { "status 200": (x) => x.status === 200 });
}
