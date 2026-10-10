// Sign-in screenshots: NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e/login_shots.mjs [outdir] [base]
import puppeteer from "puppeteer-core";
const OUT = process.argv[2] || "../docs/ui/login", BASE = process.argv[3] || "https://localhost:8443";
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true, args: ["--ignore-certificate-errors"] });
try {
  for (const [path, app] of [["/", "patient"], ["/clinic", "clinic"]]) for (const lang of ["fr", "ar"]) for (const [w, h, n] of [[390, 844, "mobile"], [1440, 900, "desktop"]]) {
    const p = await b.newPage(); await p.setViewport({ width: w, height: h });
    await p.goto(BASE + path, { waitUntil: "networkidle0" });
    await p.evaluate((l) => { localStorage.clear(); localStorage.setItem("nawba.lang", JSON.stringify(l)); localStorage.setItem("nawba.clinic.lang", l); }, lang);
    await p.reload({ waitUntil: "networkidle0" });
    await p.screenshot({ path: `${OUT}/${app}-${lang}-${n}.png` }); await p.close();
  }
} finally { await b.close(); }
