import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Two separate bundles: the patient PWA (index.html) and the clinician dashboard (clinic.html).
// Dev server (`npm run dev`) proxies /api to the running Docker stack, so start that first.
export default defineConfig({
  plugins: [react()],
  esbuild: { jsx: "automatic" },
  build: { rollupOptions: { input: { patient: "index.html", clinic: "clinic.html" } } },
  server: { proxy: { "/api": { target: "https://localhost:8443", secure: false, changeOrigin: true } } },
});
