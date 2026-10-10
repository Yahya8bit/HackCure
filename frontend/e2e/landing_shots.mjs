// Landing screenshots (LP4): NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e/landing_shots.mjs [outdir] [base]
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || "../docs/ui/landing", BASE = process.argv[3] || "https://localhost:8443";
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true, args: ["--ignore-certificate-errors"] });
try {
  for (const lang of ["fr", "ar"]) for (const [w, h, n] of [[390, 844, "mobile"], [1440, 900, "desktop"]]) {
    const p = await b.newPage();
    await p.setViewport({ width: w, height: h });
    await p.goto(`${BASE}/welcome/?lang=${lang}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1500)); // let the one-time sync animation finish
    await p.screenshot({ path: `${OUT}/${lang}-${n}-hero.png` });
    await p.screenshot({ path: `${OUT}/${lang}-${n}-full.png`, fullPage: true });
    console.log(lang, n);
    await p.close();
  }
} finally { await b.close(); }
