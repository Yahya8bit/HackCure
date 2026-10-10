import strings from "./strings.json" with { type: "json" };

// Native names, as the brief asks. Darija is written in Arabic script here (TODO-verify).
export const LANGS = { fr: "Français", ar: "العربية", darija: "دارجة" };

// darija -> ar -> fr fallback, so a missing translation never shows a raw key to the user.
export function t(lang, key, vars) {
  const s = strings[lang]?.[key] ?? strings.ar[key] ?? strings.fr[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? "") : s;
}

export const dir = (lang) => (lang === "fr" ? "ltr" : "rtl");
// Arabic-script content (config texts, html lang) for both Arabic and Darija.
export const contentLang = (lang) => (lang === "fr" ? "fr" : "ar");

export { strings };
