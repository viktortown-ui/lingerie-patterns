import { en } from "./en.js";
import { ru } from "./ru.js";

const dictionaries = { en, ru };
let locale = "en";

export function getLocale() {
  return locale;
}

export function setLocale(nextLocale) {
  locale = dictionaries[nextLocale] ? nextLocale : "en";
  return locale;
}

export function t(key) {
  return dictionaries[locale]?.[key] ?? key;
}

export function resolveText(value) {
  if (value == null) return "";
  if (typeof value === "string") {
    if (dictionaries[locale]?.[value]) {
      return t(value);
    }
    return value;
  }
  if (typeof value === "object") {
    if (value[locale]) return value[locale];
    if (value.en) return value.en;
  }
  return String(value);
}
