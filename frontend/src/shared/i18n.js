import strings from "./strings.json" with { type: "json" };

export const LANGS = { fr: "Français", ar: "العربية", darija: "Darija تونسي" };

// darija -> ar -> fr fallback, so a missing translation never shows a raw key to the user.
export function t(lang, key) {
  return strings[lang]?.[key] ?? strings.ar[key] ?? strings.fr[key] ?? key;
}

export const dir = (lang) => (lang === "fr" ? "ltr" : "rtl");

export { strings };
