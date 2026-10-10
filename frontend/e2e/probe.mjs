import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--ignore-certificate-errors"] });
for (const [path, user] of [["/", "patient.demo"], ["/clinic", "dr.demo"]]) {
  const p = await b.newPage();
  p.on("console", (m) => console.log(path, "console:", m.type(), m.text()));
  p.on("pageerror", (e) => console.log(path, "PAGEERROR:", e.message));
  await p.goto("https://localhost:8443" + path, { waitUntil: "networkidle0" });
  await p.type("input[autocomplete=username]", user);
  await p.type("input[type=password]", "demo1234");
  await p.click("button.primary");
  await new Promise((r) => setTimeout(r, 3000));
  console.log(path, "TEXT:", (await p.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n/g, " | "));
}
await b.close();
