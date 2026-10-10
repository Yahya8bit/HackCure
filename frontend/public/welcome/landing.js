// Nawba landing page: language switch (French default in the HTML, Arabic from i18n.ar.json) and the
// pilot mail link. No cookies, no analytics, no external request. ~2 KB.
(() => {
  const PILOT_EMAIL = ""; // TODO (team): publish the pilot contact address; empty = the visitor fills it in
  const MAIL = {
    fr: { subject: "Nawba — pilote", body: "Bonjour, je suis neurologue et je souhaite participer au pilote Nawba." },
  };
  const nodes = [...document.querySelectorAll("[data-i18n]")];
  const labels = [...document.querySelectorAll("[data-i18n-label]")];
  const fr = new Map(nodes.map((n) => [n, n.textContent]));
  const frLabels = new Map(labels.map((n) => [n, n.getAttribute("aria-label")]));
  let ar = null;

  const mail = (lang) => {
    const m = lang === "ar" && ar ? { subject: "نوبة — تجربة", body: ar._mail.text } : MAIL.fr;
    document.getElementById("pilot-cta").href =
      `mailto:${PILOT_EMAIL}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
  };

  async function setLang(lang) {
    if (lang === "ar" && !ar) {
      try { ar = await (await fetch("i18n.ar.json")).json(); } catch { return; } // offline before first load: stay in French
    }
    for (const n of nodes) n.textContent = lang === "ar" ? (ar[n.dataset.i18n]?.text ?? fr.get(n)) : fr.get(n);
    for (const n of labels) n.setAttribute("aria-label", lang === "ar" ? (ar[n.dataset.i18nLabel]?.text ?? frLabels.get(n)) : frLabels.get(n));
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    mail(lang);
    try { localStorage.setItem("nawba.welcome.lang", lang); } catch {}
  }

  document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
  const wanted = new URLSearchParams(location.search).get("lang") || (() => { try { return localStorage.getItem("nawba.welcome.lang"); } catch { return null; } })();
  mail("fr");
  if (wanted === "ar") setLang("ar");
  // Same offline service worker as the family app: after one visit the page also opens with no network.
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
