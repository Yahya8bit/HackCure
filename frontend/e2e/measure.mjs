// First-load measurement (UI9) + external-request audit (UI3).
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e/measure.mjs [base]
// Cold cache, Chrome "Fast 3G" throttling, 5 runs per page, median reported.
import puppeteer, { PredefinedNetworkConditions } from "puppeteer-core";

const BASE = process.argv[2] || "https://localhost:8443";
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true, args: ["--ignore-certificate-errors"] });
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const external = new Set();
const out = {};
try {
  for (const path of ["/", "/clinic"]) {
    const loads = [], bytes = [];
    for (let i = 0; i < 5; i++) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      const cdp = await page.createCDPSession();
      await cdp.send("Network.enable");
      let total = 0;
      cdp.on("Network.loadingFinished", (e) => (total += e.encodedDataLength));
      page.on("request", (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) external.add(r.url()); });
      await page.emulateNetworkConditions(PredefinedNetworkConditions["Fast 3G"]);
      await page.goto(BASE + path, { waitUntil: "networkidle0" });
      await page.waitForSelector("input[type=password]");
      loads.push(await page.evaluate(() => Math.round(performance.getEntriesByType("navigation")[0].loadEventEnd)));
      bytes.push(total);
      await ctx.close();
    }
    out[path] = { load_ms_median: median(loads), transferred_kb_median: Math.round(median(bytes) / 1024) };
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ...out, external_requests: [...external] }, null, 2));
