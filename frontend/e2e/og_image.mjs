// Generates frontend/public/welcome/og.png (1200x630) locally from HTML using the landing's own fonts.
import puppeteer from "puppeteer-core";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
const dir = new URL("../public/welcome/", import.meta.url);
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><link rel="stylesheet" href="${new URL("fonts.css", dir)}">
<style>body{margin:0;width:1200px;height:630px;background:#f3f6f9;font-family:"Readex Pro",sans-serif;color:#0f2742;display:flex;align-items:center;gap:56px;padding:0 72px;box-sizing:border-box}
.arch{width:380px;height:500px;flex:none;background:#1e50a2;border-radius:190px 190px 20px 20px;display:flex;align-items:center;justify-content:center}
.c{width:190px;height:190px;border-radius:50%;background:#fff;box-shadow:0 0 0 16px rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;color:#1e50a2;font-weight:600;font-size:30px;text-align:center}
h1{font-size:64px;line-height:1.08;margin:0 0 24px;letter-spacing:-.01em}p{font-size:28px;margin:0;color:#4a5b70;font-family:"IBM Plex Sans Arabic",sans-serif}
.b{display:inline-block;margin-top:28px;background:#f4ebd0;border-radius:999px;padding:8px 20px;font-size:22px;font-weight:600}</style></head>
<body><div class="arch"><div class="c">Crise<br>en cours</div></div><div><h1>Noter une crise en trois touches. Même sans internet.</h1>
<p>Nawba — suivi de l'épilepsie, pensé pour la Tunisie.</p><span class="b">Prototype, données synthétiques</span></div></body></html>`;
fs.writeFileSync(new URL("_og.html", dir), html);
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true, args: ["--allow-file-access-from-files"] });
const p = await b.newPage();
await p.setViewport({ width: 1200, height: 630 });
await p.goto(new URL("_og.html", dir).href, { waitUntil: "networkidle0" });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: new URL("og.png", dir).pathname });
await b.close();
fs.unlinkSync(new URL("_og.html", dir));
console.log("og.png", fs.statSync(new URL("og.png", dir)).size, "bytes");
