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
  // centre first: puppeteer's own scroll ignores scroll-padding and can park a button under the fixed advisory strip
  await handle.asElement().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await handle.asElement().click();
}
const bodyHas = (page, text, timeout = 10000) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

async function login(page, path, user) {
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  await page.type("input[autocomplete=username]", user);
  await page.type("input[type=password]", "demo1234");
  await page.keyboard.press("Enter");
}

const external = new Set();
let taps = 0;
const tap = async (page, sel, text) => { taps++; await clickText(page, sel, text); };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--ignore-certificate-errors"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => { throw e; });
  page.on("request", (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) external.add(r.url()); });
  await login(page, "/", "caregiver.demo");
  await bodyHas(page, "Crise en cours");
  const pid = await page.evaluate(() => localStorage.getItem("nawba.pid").replaceAll('"', ""));
  step(`caregiver logged in, logging for ${pid}`);

  // --- Timer path: first aid + emergency banner past the threshold (check 2) ---
  await tap(page, "button", "Crise en cours");                              // tap 1
  await bodyHas(page, "Premiers gestes");
  await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 301000; }); // fast-forward 5 min 1 s
  await bodyHas(page, "190");
  assert.ok(await page.$("a[href='tel:190']"), "emergency call link");
  step("timer shows first aid, and emergency message with 190 after the threshold");

  // --- Offline: stop, classify (tap 2, tap 3), entry stays on device (check 1, 5) ---
  await page.setOfflineMode(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await tap(page, "button", "Arrêter");                                     // tap 2
  await tap(page, "button", "Chute et convulsions");                       // tap 3 -> saved
  assert.equal(taps, 3, "seizure log must take at most 3 taps (UI7)");
  await bodyHas(page, "Enregistré");
  await clickText(page, "nav button", "Entrées");
  await bodyHas(page, "Enregistré sur cet appareil");
  step("seizure logged offline in exactly 3 taps -> 'saved on this device'");

  // --- Back online: queue syncs in order ---
  await page.setOfflineMode(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() => document.querySelector(".entry .pill")?.textContent.includes("Synchronisé"), { timeout: 15000 });
  step("back online -> entry 'synced'");

  // --- Clinician sees the urgent alert and validates it (checks 13, 15) ---
  const clinic = await browser.newPage();
  await login(clinic, "/clinic", "dr.demo");
  await bodyHas(clinic, "Motif principal");
  const footer = await clinic.$eval("footer.advisory", (el) => el.textContent);
  assert.ok(footer.includes("Advisory only. The clinician decides."), footer);
  const row = await clinic.$$eval("tr[data-row]", (rows, id) => rows.find((r) => r.textContent.includes(id))?.textContent, pid);
  assert.match(row, /Urgent/, "patient row shows severity word (UI6)");
  await clickText(clinic, "tr[data-row]", pid);
  await bodyHas(clinic, "Alertes ouvertes");
  const before = await clinic.$$eval(".alert-item", (els) => els.length);
  await bodyHas(clinic, "au-delà du seuil de 5 minutes"); // F1: reason rendered in French from its code
  let steps = 0;
  await clickText(clinic, ".action-bar button", "Valider"); steps++;         // step 1: action (consequence shown)
  await clickText(clinic, ".action-bar .chip", "Vu en consultation"); steps++; // step 2: reason
  await clickText(clinic, ".action-bar button:not([disabled])", "Confirmer"); steps++; // step 3: confirm (enabled once a reason exists)
  assert.ok(steps <= 3, "clinician action must take at most 3 steps (UI7)");
  await clinic.waitForFunction((n) => document.querySelectorAll(".alert-item").length === n - 1, { timeout: 10000 }, before);
  step(`dashboard shows ${pid} as Urgent (colour + icon + word); clinician validated an alert in ${steps} steps`);

  // --- Audit chain still verifies ---
  const token = await clinic.evaluate(() => localStorage.getItem("nawba.clinic.token"));
  const res = await fetch(`${BASE}/api/clinic/audit/verify`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  assert.equal(res.ok, true, JSON.stringify(res));
  step(`audit chain intact (${res.entries} entries)`);
  // --- Fix 5 regression: Arabic stays Arabic + RTL after logging in with the Enter key ---
  const ar = await browser.newPage();
  await ar.goto(`${BASE}/clinic`, { waitUntil: "networkidle0" });
  await ar.evaluate(() => { localStorage.clear(); localStorage.setItem("nawba.clinic.lang", "ar"); });
  await ar.reload({ waitUntil: "networkidle0" });
  await ar.type("input[autocomplete=username]", "dr.demo");
  await ar.type("input[type=password]", "demo1234");
  await ar.keyboard.press("Enter");
  await bodyHas(ar, "الخطورة");
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  step("Arabic dashboard stays Arabic and right-to-left after login");

  // --- F1: no English sentence in the French or Arabic dashboard (queue + patient detail) ---
  // The advisory strip's English copy is intentional (check 12) and marked lang="en", so it is skipped.
  // English-only words (no French/Arabic look-alikes such as "observation", "dose", "chance").
  const ENGLISH = /\b(the|were|with|seizures?|threshold|logged|reported|injury|proven|previous|expected|caregiver|baseline|taken|missed|high|medium|low)\b/i;
  const englishOn = (pg) => pg.evaluate((re) => {
    const rx = new RegExp(re, "i"), hits = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.parentElement.closest('[lang="en"], code, script, style, input')) continue;
      if (rx.test(n.textContent)) hits.push(n.textContent.trim().slice(0, 60));
    }
    return hits;
  }, ENGLISH.source);
  for (const [lng, pg] of [["ar", ar], ["fr", clinic]]) {
    await pg.bringToFront(); // waitForFunction polls with requestAnimationFrame, paused in background tabs
    if (lng === "fr") { await clickText(clinic, "button", "Retour"); await bodyHas(clinic, "Motif principal"); }
    assert.deepEqual(await englishOn(pg), [], `English text in the ${lng} queue`);
    await pg.evaluate(() => document.querySelector("tr[data-row]").click());
    await bodyHas(pg, lng === "fr" ? "Alertes ouvertes" : "التنبيهات المفتوحة");
    await sleep(1500); // insights panel
    assert.deepEqual(await englishOn(pg), [], `English text in the ${lng} patient detail`);
  }
  step("no English sentence in the French or Arabic dashboard (queue + detail)");

  // --- F2: the low-threshold switch adds exactly the "+N" rows it announces, and is off by default ---
  await clinic.bringToFront();
  await clickText(clinic, "button", "Retour");
  await bodyHas(clinic, "seuil bas");
  const label = await clinic.$eval(".sensitive-row label", (el) => el.textContent);
  const announced = Number(label.match(/\+(\d+)/)[1]);
  const rowsBefore = await clinic.$$eval("tr[data-row]", (r) => r.length);
  assert.equal(await clinic.$eval(".sensitive-row input", (i) => i.checked), false, "low-threshold view off by default");
  await clinic.click(".sensitive-row input");
  await sleep(300);
  const rowsAfter = await clinic.$$eval("tr[data-row]", (r) => r.length);
  assert.equal(rowsAfter - rowsBefore, announced);
  step(`low-threshold view: off by default, adds the announced ${announced} patient(s)`);

  assert.deepEqual([...external], [], "no external network requests (UI3)");
  step("no request left the origin (fonts, icons, scripts all local)");
  console.log("E2E PASSED");
} finally {
  await browser.close();
}
