// Landing page checks (LP2-LP9):  NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e/landing_check.mjs [base]
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "https://localhost:8443";
const URL_ = `${BASE}/welcome/`;
const ok = (m) => console.log("PASS", m);
const report = {};

// Same audit as e2e/a11y.mjs: real contrast vs effective background, 48 px targets.
function audit(checkTargets) {
  const parse = (c) => { const n = (c.match(/[\d.]+/g) || []).map(Number); return c.startsWith("color(") ? [...n.slice(0, 3).map((v) => v * 255), ...n.slice(3)] : n; };
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0.5)) return c.slice(0, 3); } return [255, 255, 255]; };
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const contrast = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || !visible(el) || el.closest("svg, .skip")) continue;
    const s = getComputedStyle(el), fg = parse(s.color).slice(0, 3), [a, b] = [lum(fg), lum(bgOf(el))];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const need = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && +s.fontWeight >= 600) ? 3 : 4.5;
    if (ratio < need) contrast.push(`${ratio.toFixed(2)} "${n.textContent.trim().slice(0, 40)}"`);
  }
  // inline links inside running text (footnote, source) are exempt from the 48 px rule (WCAG 2.5.8 inline exception)
  const small = !checkTargets ? [] : [...document.querySelectorAll("a[href], button, summary")].filter(visible)
    .filter((el) => !el.closest("p, li sup, .sources"))
    .map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.height < 47.5 || r.width < 47.5)
    .map(([el, r]) => `${el.tagName} ${Math.round(r.width)}x${Math.round(r.height)} "${el.textContent.trim().slice(0, 30)}"`);
  return { contrast, small };
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true, args: ["--ignore-certificate-errors"] });
try {
  for (const lang of ["fr", "ar"]) {
    for (const [w, h, size] of [[390, 844, "mobile"], [1440, 900, "desktop"]]) {
      const ctx = await browser.createBrowserContext();
      const p = await ctx.newPage();
      await p.setViewport({ width: w, height: h });
      const external = [];
      let bytes = 0;
      const cdp = await p.createCDPSession();
      await cdp.send("Network.enable");
      cdp.on("Network.loadingFinished", (e) => (bytes += e.encodedDataLength));
      p.on("request", (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) external.push(r.url()); });
      await p.goto(`${URL_}?lang=${lang}`, { waitUntil: "networkidle0" });
      await p.waitForFunction((l) => document.documentElement.lang === l, {}, lang);
      // LP3: zero external requests
      assert.deepEqual(external, [], `${lang} ${size}: external requests`);
      // LP4: language and direction
      const dir = await p.evaluate(() => document.documentElement.dir);
      assert.equal(dir, lang === "ar" ? "rtl" : "ltr");
      if (lang === "ar") assert.match(await p.$eval("h1", (e) => e.textContent), /[؀-ۿ]/, "Arabic h1");
      // LP5: contrast + targets (targets on mobile)
      const a = await p.evaluate(audit, size === "mobile");
      report[`${lang}-${size}`] = { contrast_failures: a.contrast.length, target_failures: a.small.length, transfer_kb: Math.round(bytes / 1024) };
      assert.deepEqual(a.contrast, [], `${lang} ${size} contrast`);
      assert.deepEqual(a.small, [], `${lang} ${size} targets`);
      // LP9: transfer under 400 KB (compressed bytes on the wire, cold cache)
      assert.ok(bytes < 400 * 1024, `${lang} ${size}: ${bytes} bytes`);
      await ctx.close();
    }
  }
  ok(`fr+ar, mobile+desktop: 0 external requests, dir correct, 0 contrast / 0 target failures, transfer ${JSON.stringify(Object.fromEntries(Object.entries(report).map(([k, v]) => [k, v.transfer_kb + " KB"])))}`);

  const p = await browser.newPage();
  await p.goto(URL_, { waitUntil: "networkidle0" });
  // LP2: one h1, links to the app and the dashboard resolve
  assert.equal(await p.$$eval("h1", (e) => e.length), 1);
  for (const href of ["/", "/clinic"]) {
    assert.ok(await p.$(`a[href="${href}"]`), `link ${href}`);
    const r = await fetch(BASE + href);
    assert.equal(r.status, 200, href);
  }
  ok("one h1; links to / and /clinic present and serving 200");
  // LP5: visible focus, reduced motion
  await p.keyboard.press("Tab");
  const focus = await p.evaluate(() => { const s = getComputedStyle(document.activeElement); return [document.activeElement.className, s.outlineStyle, s.outlineWidth]; });
  assert.notEqual(focus[1], "none", "focus outline");
  const rm = await browser.newPage();
  await rm.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await rm.goto(URL_, { waitUntil: "networkidle0" });
  assert.equal(await rm.$eval(".sync-line path", (e) => getComputedStyle(e).animationName), "none");
  ok(`focus visible (${focus[1]} ${focus[2]} on the skip link), reduced motion disables the sync animation`);
  // LP7: no implied diagnosis, certification, anonymity, GDPR or medical-device status (fr and ar)
  for (const lang of ["fr", "ar"]) {
    await p.goto(`${URL_}?lang=${lang}`, { waitUntil: "networkidle0" });
    await p.waitForFunction((l) => document.documentElement.lang === l, {}, lang);
    const bad = await p.evaluate(() => {
      const text = document.body.innerText;
      const hits = [/certifi/i, /anonym/i, /RGPD|GDPR/i, /dispositif médical|medical device/i, /معتمد|مجهول الهوية/].filter((r) => r.test(text)).map(String);
      // "diagnostic" may only appear as a negation: the "does not" list or the FAQ answer that starts with "Non"/"لا"
      for (const el of document.querySelectorAll("body *")) {
        if (el.children.length || !/diagnos|تشخيص|يشخص/i.test(el.textContent)) continue;
        if (!el.closest(".dont, .faq")) hits.push(`diagnosis outside a negation: "${el.textContent.trim().slice(0, 50)}"`);
      }
      return hits;
    });
    assert.deepEqual(bad, [], `${lang} claims`);
  }
  ok("no wording implying diagnosis, certification, anonymity, GDPR or medical-device status (fr, ar)");
  // Pricing is a planned model: no amount may appear until real prices exist (claims rule: no invented numbers)
  for (const lang of ["fr", "ar"]) {
    await p.goto(`${URL_}?lang=${lang}`, { waitUntil: "networkidle0" });
    await p.waitForFunction((l) => document.documentElement.lang === l, {}, lang);
    const pricing = await p.$eval("#tarifs", (e) => e.innerText);
    assert.doesNotMatch(pricing, /\d+\s*(DT|TND|dinars?|€|EUR|\$|د\.?ت|دينار)|(DT|TND|€|\$)\s*\d/i, `${lang}: a price amount appeared`);
    assert.match(pricing, lang === "fr" ? /prévu/ : /مخطط/, `${lang}: pricing marked as planned`);
  }
  ok("pricing section: marked as planned, no invented amounts (fr, ar)");
  // LP8: offline — after one visit, the page reloads with the network fully off (service worker cache)
  const off = await browser.newPage();
  await off.goto(URL_, { waitUntil: "networkidle0" });
  await off.evaluate(() => navigator.serviceWorker.ready);
  await off.reload({ waitUntil: "networkidle0" }); // second load goes through the service worker and fills its cache
  await off.setOfflineMode(true);
  await off.reload({ waitUntil: "load" });
  assert.match(await off.$eval("h1", (e) => e.textContent), /trois touches|ثلاث لمسات/); // remembered language
  const fontsOk = await off.evaluate(async () => { await document.fonts.ready; return document.fonts.check('600 20px "Readex Pro"'); });
  assert.ok(fontsOk, "local font available offline");
  ok("page reloads with the network OFF (service worker), local fonts still render");
  console.log("LANDING CHECK PASSED", JSON.stringify(report));
} finally {
  await browser.close();
}
