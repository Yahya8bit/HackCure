// Pre-demo smoke test (F4), run by scripts/demo_check.sh against a RUNNING stack.
// Writes only to the check patient P-D3A005 (account check.demo), never to the demo cast.
// Any failed step throws -> non-zero exit code.
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "https://localhost:8443";
const PASSWORD = process.env.DEMO_PASSWORD || "demo1234";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log("PASS", m);
const external = new Set();

async function click(page, sel, text) {
  const h = await page.waitForFunction((s, t) => [...document.querySelectorAll(s)].find((e) => e.textContent.includes(t)),
    { timeout: 15000 }, sel, text);
  await h.asElement().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await h.asElement().click();
}
const has = (page, text) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 15000 }, text);

async function open(browser, path, user, lang = "fr") {
  const page = await browser.newPage();
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith("data:") && !u.startsWith("blob:")) external.add(u); });
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  // localStorage is shared by every tab of this origin: clear only the keys of the app being opened,
  // otherwise opening the dashboard would log the caregiver tab out.
  await page.evaluate((l, clinic) => {
    const keys = clinic ? ["nawba.clinic.token"] : Object.keys(localStorage).filter((k) => k.startsWith("nawba.") && !k.startsWith("nawba.clinic"));
    keys.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("nawba.lang", JSON.stringify(l)); localStorage.setItem("nawba.clinic.lang", l);
  }, lang, path.startsWith("/clinic"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.type("input[autocomplete=username]", user);
  await page.type("input[type=password]", PASSWORD);
  await page.keyboard.press("Enter");
  // a clear message instead of a timeout when an account is missing (e.g. a database seeded before F4)
  const failed = await page.waitForFunction(() => document.querySelector(".error-box") || !document.querySelector("input[type=password]"),
    { timeout: 15000 }).then((h) => h.evaluate((x) => x !== true && x?.classList?.contains("error-box")));
  if (failed) throw new Error(`login failed for ${user}: run scripts/demo_reset.sh (the database may predate this account)`);
  return page;
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true,
  args: ["--ignore-certificate-errors"] });
try {
  // 1. the three roles can log in
  const patient = await open(browser, "/", "patient.demo");
  await has(patient, "Crise en cours");
  ok("patient login (patient.demo)");
  await patient.close();
  const cg = await open(browser, "/", "check.demo");
  await has(cg, "Crise en cours");
  ok("caregiver login (check.demo)");
  const dr = await open(browser, "/clinic", "dr.demo");
  await has(dr, "Motif principal");
  ok("clinician login (dr.demo)");

  // 2. a seizure logged OFFLINE in 3 taps, then synced
  await cg.bringToFront();
  await cg.setOfflineMode(true);
  await cg.evaluate(() => window.dispatchEvent(new Event("offline")));
  await click(cg, "button", "Crise en cours");                                   // tap 1
  await cg.evaluate(() => { const real = Date.now; Date.now = () => real() + 301000; }); // > 5 min threshold
  await sleep(1200);
  await click(cg, "button", "Arrêter");                                          // tap 2
  await click(cg, "button", "Chute et convulsions");                             // tap 3
  await click(cg, "nav button", "Entrées");
  await has(cg, "Enregistré sur cet appareil");
  ok("seizure saved on the device while offline (3 taps)");
  await cg.setOfflineMode(false);
  await cg.evaluate(() => window.dispatchEvent(new Event("online")));
  await cg.waitForFunction(() => document.querySelector(".entry .pill")?.textContent.includes("Synchronisé"), { timeout: 20000 });
  ok("seizure synced when back online");

  // 3. the alert appears on the dashboard with a localized (French) reason
  await dr.bringToFront();
  await dr.reload({ waitUntil: "networkidle0" });
  await has(dr, "Motif principal");
  const row = await dr.$$eval("tr[data-row]", (rows) => rows.find((r) => r.dataset.row === "P-D3A005")?.innerText || "");
  assert.match(row, /Urgent/, "check patient row is Urgent");
  // repeated runs can make a cluster alert the top reason; both French reasons mention "seuil"
  assert.match(row, /au-delà du seuil de 5 minutes|crises en \d+ h \(seuil/, "reason is localized in French");
  assert.doesNotMatch(row, /above the|threshold/i, "no English reason");
  ok("alert on the dashboard with a French reason");

  // 4. Validate in at most 3 steps
  await dr.evaluate(() => document.querySelector('tr[data-row="P-D3A005"]').click());
  await has(dr, "Alertes ouvertes");
  const before = await dr.$$eval(".alert-item", (e) => e.length);
  let steps = 0;
  await click(dr, ".action-bar button", "Valider"); steps++;
  await click(dr, ".action-bar .chip", "Vu en consultation"); steps++;
  await click(dr, ".action-bar button:not([disabled])", "Confirmer"); steps++;
  await dr.waitForFunction((n) => document.querySelectorAll(".alert-item").length === n - 1, { timeout: 15000 }, before);
  assert.ok(steps <= 3);
  ok(`Validate in ${steps} steps`);

  // 5. the audit chain verifies
  const token = await dr.evaluate(() => localStorage.getItem("nawba.clinic.token"));
  const audit = await fetch(`${BASE}/api/clinic/audit/verify`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  assert.equal(audit.ok, true, JSON.stringify(audit));
  ok(`audit chain verifies (${audit.entries} entries)`);

  // 6. nothing left the origin
  assert.deepEqual([...external], [], "external requests");
  ok("no external requests");
  console.log("DEMO CHECK PASSED");
} finally {
  await browser.close();
}
