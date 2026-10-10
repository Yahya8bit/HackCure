// Run with: npm test   (node's built-in test runner, no extra dependency)
import assert from "node:assert";
import test from "node:test";
import { strings, t } from "./i18n.js";

test("every French key has an Arabic translation", () => {
  const missing = Object.keys(strings.fr).filter((k) => !(k in strings.ar));
  assert.deepStrictEqual(missing, []);
});

test("darija only overrides existing keys and falls back to Arabic", () => {
  for (const k of Object.keys(strings.darija)) assert.ok(k in strings.fr, k);
  assert.strictEqual(t("darija", "entries_title"), strings.ar.entries_title);
});

test("reminder text is discreet: no epilepsy words, no drug names (stigma protection)", () => {
  const forbidden = /(épilep|epilep|crise|seizure|nawba|نوبة|صرع|valpro|lev|carbama|lamotri|médicament|دواء)/i;
  for (const lang of ["fr", "ar", "darija"]) assert.ok(!forbidden.test(t(lang, "reminder_text")), lang);
});

test("F8: delete text lists what is deleted, the audit exception and the hospital-record caveat", () => {
  for (const lang of ["fr", "ar", "darija"]) assert.ok(t(lang, "delete_body").includes("P-…"), lang);
  assert.match(t("fr", "delete_body"), /crises, prises, signalements, alertes/);
  assert.match(t("fr", "delete_body"), /dossier de l'hôpital peuvent être conservées/);
  assert.doesNotMatch(t("fr", "delete_body"), /anonym/i); // pseudonymous, never "anonymous"
});

test("F8: consent addresses a parent or guardian, and the review notice exists in 3 languages", () => {
  assert.match(t("fr", "data_child_body"), /parent ou le tuteur légal/);
  for (const lang of ["fr", "ar", "darija"]) {
    assert.ok(strings[lang].review_notice, lang);
    assert.ok(strings[lang === "darija" ? "darija" : lang].data_child_body || strings.ar.data_child_body, lang);
  }
});
