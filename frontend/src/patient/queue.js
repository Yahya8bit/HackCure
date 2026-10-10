// Offline-first queue in IndexedDB.
// Every entry gets a UUID on the phone (crypto.randomUUID) and an auto-increment `seq`.
// Sync sends entries in `seq` order; the server stores each UUID once, so a retry after a
// dropped connection is answered "duplicate" and nothing is ever saved twice.
const DB = "nawba", STORE = "queue";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "seq", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

export const newId = () => crypto.randomUUID();

export function enqueue(type, data) {
  return tx("readwrite", (s) => s.add({ type, data: { id: newId(), ...data }, status: "local", createdAt: Date.now() }));
}

export const allEntries = () => tx("readonly", (s) => s.getAll());

export function clearAll() {
  return tx("readwrite", (s) => s.clear());
}

let syncing = false;
// Push pending entries in order. Returns server messages (e.g. the pregnancy safety message).
export async function sync(api, lang) {
  if (syncing || !navigator.onLine || !api.loggedIn()) return [];
  syncing = true;
  try {
    const pending = (await allEntries()).filter((e) => e.status === "local").sort((a, b) => a.seq - b.seq);
    const messages = [];
    for (let i = 0; i < pending.length; i += 100) {
      const batch = pending.slice(i, i + 100);
      const res = await api.post(`/sync?lang=${lang === "fr" ? "fr" : "ar"}`, { entries: batch.map(({ type, data }) => ({ type, data })) });
      const byId = Object.fromEntries(res.results.map((r) => [r.id, r]));
      await tx("readwrite", (s) => {
        for (const e of batch) {
          const r = byId[e.data.id];
          if (!r) continue;
          s.put({ ...e, status: r.status === "rejected" ? "rejected" : "synced", error: r.error });
        }
      });
      messages.push(...res.messages);
    }
    return messages;
  } catch {
    return []; // network dropped mid-sync: entries stay "local" and are retried later
  } finally {
    syncing = false;
  }
}
