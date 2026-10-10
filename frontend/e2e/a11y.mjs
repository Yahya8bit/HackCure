// Accessibility checklist (UI5) in real Chrome:  NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e/a11y.mjs [base]
// 1. WCAG AA contrast of every visible text node vs its effective background (4.5:1, 3:1 for large text)
// 2. 48 px minimum touch targets for every interactive element on the patient app at 390 px
// 3. visible keyboard focus (outline) on Tab
// 4. prefers-reduced-motion: animations collapse to 0 s
import puppeteer from "puppeteer-core";
import { t } from "../src/shared/i18n.js";

const BASE = process.argv[2] || "https://localhost:8443";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function audit() {
  // Chrome returns rgb()/rgba() (0-255) or color(srgb r g b / a) (0-1) for color-mix() values.
  const parse = (c) => {
    const n = (c.match(/[\d.]+/g) || []).map(Number);
    return c.startsWith("color(") ? [...n.slice(0, 3).map((v) => v * 255), ...n.slice(3)] : n;
  };
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c.length === 3 || (c.length === 4 && c[3] > 0.5)) return c.slice(0, 3);
    }
    return [255, 255, 255];
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.opacity !== "0"; };
  const contrast = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || !visible(el) || el.closest("svg, [disabled], .skeleton")) continue;
    const s = getComputedStyle(el);
    const fg = parse(s.color).slice(0, 3), bg = bgOf(el);
    const [a, b] = [lum(fg), lum(bg)];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 600;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio < need) contrast.push(`${ratio.toFixed(2)} < ${need}: "${n.textContent.trim().slice(0, 30)}"`);
  }
  const small = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, summary, [role=switch]")]
    .filter(visible).map((el) => [el, el.getBoundingClientRect()])
    .filter(([, r]) => r.height < 47.5 || r.width < 47.5)
    .map(([el, r]) => `${el.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || el.getAttribute("aria-label") || el.type || "").trim().slice(0, 24)}"`);
  return { contrast, small };
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true, args: ["--ignore-certificate-errors"] });
const report = { screens: 0, contrast: [], targets: [], focus: null, reducedMotion: null };
try {
  for (const lang of ["fr", "ar"]) {
    const L = (k) => [t(lang, k)];
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(BASE + "/", { waitUntil: "networkidle0" });
    await page.evaluate((l) => { localStorage.clear(); localStorage.setItem("nawba.lang", JSON.stringify(l)); }, lang);
    await page.reload({ waitUntil: "networkidle0" });
    const check = async (name, targets = true) => {
      const r = await page.evaluate(audit);
      report.screens++;
      report.contrast.push(...r.contrast.map((x) => `${lang} ${name}: ${x}`));
      if (targets) report.targets.push(...r.small.map((x) => `${lang} ${name}: ${x}`));
    };
    await check("login");
    await page.type("input[autocomplete=username]", "caregiver.demo");
    await page.type("input[type=password]", "demo1234");
    await page.keyboard.press("Enter");
    await sleep(1500);
    await check("home");
    // keyboard focus is visible
    if (lang === "fr") {
      await page.keyboard.press("Tab");
      report.focus = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2 ? `visible (${s.outlineWidth} ${s.outlineStyle})` : "MISSING"; });
    }
    // the seizure flow overlay: running timer, past-threshold emergency, finish screen
    const btn = async (txt) => { const h = await page.waitForFunction((x) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(x)), {}, txt); await h.asElement().click(); await sleep(600); };
    await btn(t(lang, "seizure_now"));
    await check("timer");
    await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 301000; });
    await sleep(1200);
    await check("timer-urgent");
    await btn(t(lang, "stop"));
    await page.evaluate(() => document.querySelector("details")?.setAttribute("open", ""));
    await check("finish");
    await page.evaluate(() => document.querySelector(".focus-screen [aria-label] svg")?.closest("button")?.click());
    await sleep(400);
    for (const tab of ["medications", "reports", "entries", "data"]) {
      const h = await page.waitForFunction((x) => [...document.querySelectorAll("nav button")].find((b) => x.some((s) => b.textContent.includes(s))), {}, L(tab));
      await h.asElement().click();
      await sleep(700);
      await check(tab);
    }
    await page.close();

    const clinic = await browser.newPage();
    await clinic.setViewport({ width: 1440, height: 900 });
    await clinic.goto(BASE + "/clinic", { waitUntil: "networkidle0" });
    await clinic.evaluate((l) => { localStorage.clear(); localStorage.setItem("nawba.clinic.lang", l); }, lang);
    await clinic.reload({ waitUntil: "networkidle0" });
    await clinic.type("input[autocomplete=username]", "dr.demo");
    await clinic.type("input[type=password]", "demo1234");
    await clinic.keyboard.press("Enter");
    await sleep(1500);
    const r1 = await clinic.evaluate(audit);
    report.contrast.push(...r1.contrast.map((x) => `${lang} queue: ${x}`));
    await clinic.evaluate(() => document.querySelector("tr[data-row]")?.click());
    await sleep(2500);
    const r2 = await clinic.evaluate(audit);
    report.contrast.push(...r2.contrast.map((x) => `${lang} detail: ${x}`));
    report.screens += 2;
    await clinic.close();
  }
  // reduced motion: confirmation animation collapses
  const p = await browser.newPage();
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.goto(BASE + "/", { waitUntil: "networkidle0" });
  report.reducedMotion = await p.evaluate(() => {
    const d = document.createElement("div"); d.className = "confirm"; document.body.append(d);
    return getComputedStyle(d).animationDuration;
  });
} finally {
  await browser.close();
}
const uniq = (xs) => [...new Set(xs.map((x) => x.replace(/^(\w+) [\w-]+: /, "$1 ")))];
console.log(JSON.stringify({ screens: report.screens, contrast_failures: report.contrast.length, unique_contrast: uniq(report.contrast),
  target_failures: report.targets.length, unique_targets: uniq(report.targets), focus: report.focus, reducedMotion: report.reducedMotion }, null, 2));
