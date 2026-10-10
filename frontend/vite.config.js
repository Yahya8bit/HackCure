import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Two separate bundles: the patient PWA (index.html) and the clinician dashboard (clinic.html).
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { patient: "index.html", clinic: "clinic.html" } } },
  server: { proxy: { "/api": { target: "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") } } },
});
