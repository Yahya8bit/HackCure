import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev server only: serve the static landing page and the dashboard at the same URLs as nginx in production
// (/welcome/ -> public/welcome/index.html, /clinic -> clinic.html). Without this, Vite's SPA fallback
// answered /welcome/ with the family app.
const devRoutes = {
  name: "nawba-dev-routes",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query = ""] = req.url.split("?");
      const q = query ? `?${query}` : "";
      if (path === "/welcome" || path === "/welcome/") req.url = `/welcome/index.html${q}`;
      else if (path === "/clinic") req.url = `/clinic.html${q}`;
      next();
    });
  },
};

// Two separate bundles: the patient PWA (index.html) and the clinician dashboard (clinic.html).
// Dev server (`npm run dev`) proxies /api to the running Docker stack, so start that first.
export default defineConfig({
  plugins: [react(), devRoutes],
  esbuild: { jsx: "automatic" },
  build: { rollupOptions: { input: { patient: "index.html", clinic: "clinic.html" } } },
  server: { proxy: { "/api": { target: "https://localhost:8443", secure: false, changeOrigin: true } } },
});
