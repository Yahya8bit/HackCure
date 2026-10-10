// Thin fetch wrapper. The token lives in sessionStorage-like scope per app (key passed in),
// so the patient app and the dashboard never share a session on a shared device.
export function makeApi(tokenKey) {
  const token = () => localStorage.getItem(tokenKey);
  async function call(method, path, body) {
    const res = await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) localStorage.removeItem(tokenKey);
    if (!res.ok) throw Object.assign(new Error((await res.json().catch(() => ({}))).detail || res.statusText), { status: res.status });
    return res.json();
  }
  return {
    get: (p) => call("GET", p),
    post: (p, b) => call("POST", p, b ?? {}),
    del: (p) => call("DELETE", p),
    async login(username, password) {
      const r = await call("POST", "/auth/login", { username, password });
      localStorage.setItem(tokenKey, r.token);
      return r;
    },
    logout: () => localStorage.removeItem(tokenKey),
    loggedIn: () => !!token(),
  };
}
