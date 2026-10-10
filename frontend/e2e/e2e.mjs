// End-to-end check in real headless Chrome against the running stack (docker compose up).
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e/e2e.mjs [base-url]
// Flow: caregiver logs a seizure OFFLINE in 3 taps -> "saved on this device" -> back online -> "synced"
//       -> urgent alert on the clinician dashboard -> Validate (2 steps) -> audit chain verifies.
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "https://localhost:8443";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (msg) => console.log("✓", msg);

async function clickText(page, selector, text) {
  const handle = await page.waitForFunction(
    (sel, txt) => [...document.querySelectorAll(sel)].find((el) => el.textContent.includes(txt)),
    { timeout: 10000 }, selector, text);
  await handle.asElement().click();
}
const bodyHas = (page, text, timeout = 10000) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

async function login(page, path, user) {
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  await page.type("input[autocomplete=username]", user);
  await page.type("input[type=password]", "demo1234");
  await page.click("button.primary");
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--ignore-certificate-errors"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => { throw e; });
  await login(page, "/", "caregiver.demo");
  await bodyHas(page, "Crise en cours");
  const pid = await page.evaluate(() => localStorage.getItem("nawba.pid").replaceAll('"', ""));
  step(`caregiver logged in, logging for ${pid}`);

  // --- Timer path: first aid + emergency banner past the threshold (check 2) ---
  await clickText(page, "button", "Crise en cours");                       // tap 1
  await bodyHas(page, "Premiers gestes");
  await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 301000; }); // fast-forward 5 min 1 s
  await bodyHas(page, "190");
  assert.ok(await page.$("a.call[href='tel:190']"), "emergency call link");
  step("timer shows first aid, and emergency message with 190 after the threshold");

  // --- Offline: stop, classify (tap 2, tap 3), entry stays on device (check 1, 5) ---
  await page.setOfflineMode(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await clickText(page, "button", "Arrêter");                               // tap 2
  await clickText(page, "button.choice", "Chute et convulsions");           // tap 3 -> saved
  await bodyHas(page, "Enregistré");
  await clickText(page, "nav button", "Mes entrées");
  await bodyHas(page, "Enregistré sur cet appareil");
  step("seizure logged offline in 3 taps -> 'saved on this device'");

  // --- Back online: queue syncs in order ---
  await page.setOfflineMode(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() => document.querySelector(".history .badge")?.textContent.includes("Synchronisé"), { timeout: 15000 });
  step("back online -> entry 'synced'");

  // --- Clinician sees the urgent alert and validates it (checks 13, 15) ---
  const clinic = await browser.newPage();
  await login(clinic, "/clinic", "dr.demo");
  await bodyHas(clinic, "Patients by need for attention");
  const footer = await clinic.$eval("footer.advisory", (el) => el.textContent);
  assert.equal(footer, "Advisory only. The clinician decides.");
  const row = await clinic.$$eval("tr.clickable", (rows, id) => rows.find((r) => r.textContent.includes(id))?.textContent, pid);
  assert.match(row, /URGENT/i, "patient row shows an urgent alert");
  await clickText(clinic, "tr.clickable", pid);
  await bodyHas(clinic, "Open alerts");
  const before = await clinic.$$eval(".alert", (els) => els.length);
  await bodyHas(clinic, "above the 5-minute threshold");
  await clickText(clinic, ".alert button", "Validate");                     // step 1
  await clinic.type(".alert input", "seen in e2e test");
  await clickText(clinic, ".alert button", "Confirm validate");             // step 2
  await clinic.waitForFunction((n) => document.querySelectorAll(".alert").length === n - 1, { timeout: 10000 }, before);
  step(`dashboard shows ${pid} as URGENT (prolonged seizure); clinician validated an alert in 2 steps`);

  // --- Audit chain still verifies ---
  const token = await clinic.evaluate(() => localStorage.getItem("nawba.clinic.token"));
  const res = await fetch(`${BASE}/api/clinic/audit/verify`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  assert.equal(res.ok, true, JSON.stringify(res));
  step(`audit chain intact (${res.entries} entries)`);
  console.log("E2E PASSED");
} finally {
  await browser.close();
}
