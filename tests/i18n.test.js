import assert from "node:assert/strict";
import { setLocale, t } from "../src/ui/i18n/i18n.js";

setLocale("en");
const enTitle = t("home.title");
const enPreview = t("preview.fit");
const enDownload = t("editor.downloadSvg");
const enLegend = t("export.legendShort");
const enSeamOn = t("export.seamAllowanceOn");

setLocale("ru");
const ruTitle = t("home.title");
const ruPreview = t("preview.fit");
const ruDownload = t("editor.downloadSvg");
const ruLegend = t("export.legendShort");
const ruSeamOn = t("export.seamAllowanceOn");

assert.notStrictEqual(enTitle, ruTitle);
assert.notStrictEqual(enPreview, ruPreview);
assert.notStrictEqual(enDownload, ruDownload);
assert.notStrictEqual(enLegend, ruLegend);
assert.notStrictEqual(enSeamOn, ruSeamOn);
