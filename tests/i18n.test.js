import assert from "node:assert/strict";
import { setLocale, t } from "../src/ui/i18n/i18n.js";

setLocale("en");
const enTitle = t("home.title");
const enPreview = t("preview.fit");

setLocale("ru");
const ruTitle = t("home.title");
const ruPreview = t("preview.fit");

assert.notStrictEqual(enTitle, ruTitle);
assert.notStrictEqual(enPreview, ruPreview);
