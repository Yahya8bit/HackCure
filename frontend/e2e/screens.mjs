// Screenshot every screen (UI4).  NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e/screens.mjs <outdir> [base]
// Buttons are found through the translation file, so the script survives a redesign as long as keys stay.
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { t } from "../src/shared/i18n.js";

const OUT = process.argv[2] || "../docs/ui/after";
const BASE = process.argv[3] || "https://localhost:8443";
const SIZES = [[390, 844, "mobile"], [1440, 900, "desktop"]];
const LANGS = ["fr", "ar"];
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function click(page, texts) {
  const h = await page.waitForFunction((txts) => [...document.querySelectorAll("button, a, [role=tab], tr")]
    .find((el) => txts.some((x) => el.textContent.trim().includes(x))), { timeout: 8000 }, texts);
  await h.asElement().click();
  await sleep(500);
}

async function login(page, path, user, lang) {
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  await page.evaluate((l) => { localStorage.clear(); localStorage.setItem("nawba.lang", JSON.stringify(l)); localStorage.setItem("nawba.clinic.lang", l); }, lang);
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("input[autocomplete=username]", user);
  await page.type("input[type=password]", "demo1234");
  await page.keyboard.press("Enter");
  await sleep(1500);
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true, args: ["--ignore-certificate-errors"] });
try {
  for (const lang of LANGS) {
    for (const [w, h, size] of SIZES) {
      const L = (k) => [t(lang, k), t("darija", k)];
      const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${lang}-${size}-${name}.png` }); console.log(lang, size, name); };
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h });

      await page.goto(BASE + "/", { waitUntil: "networkidle0" });
      await page.evaluate((l) => { localStorage.clear(); localStorage.setItem("nawba.lang", JSON.stringify(l)); }, lang);
      await page.reload({ waitUntil: "networkidle0" });
      await shot(page, "p0-login");
      await login(page, "/", "caregiver.demo", lang);
      await shot(page, "p1-home");
      await click(page, L("seizure_now"));
      await shot(page, "p2-timer");
      await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 301000; });
      await sleep(1200);
      await shot(page, "p3-timer-urgent");
      await click(page, L("stop"));
      await shot(page, "p4-finish");
      await click(page, L("cat_absence"));
      await click(page, L("medications"));
      await shot(page, "p5-treatment");
      await click(page, L("reports"));
      await shot(page, "p6-report");
      await click(page, L("entries"));
      await shot(page, "p7-entries");
      await click(page, L("data"));
      await shot(page, "p8-mydata");
      await page.close();

      const clinic = await browser.newPage();
      await clinic.setViewport({ width: w, height: h });
      await login(clinic, "/clinic", "dr.demo", lang);
      await shot(clinic, "c1-queue");
      await clinic.evaluate(() => document.querySelector("tr.clickable, [data-row]")?.click());
      await sleep(2500);
      await shot(clinic, "c2-detail");
      await clinic.evaluate(() => window.scrollTo(0, 900));
      await sleep(300);
      await shot(clinic, "c3-detail-charts");
      await clinic.close();
    }
  }
} finally {
  await browser.close();
}
