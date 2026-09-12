import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the shared form hides the first value until a repeat is entered", () => {
  const source = read("../src/ui/components/MeasurementVerification.js");
  assert.match(source, /Первое значение сохранено и пока скрыто/u);
  assert.match(source, /First value saved and hidden for now/u);
  assert.match(source, /repeatedValue == null/u);
  const form = read("../src/ui/components/Form.js");
  assert.match(form, /measurementCheck\.invalidate\(field\.key, values\)/u);
});

test("every physical editor output passes through the repeat-measurement gate", () => {
  const source = read("../src/ui/screens/Editor.js");
  assert.match(source, /guardPhysicalExport\("SVG"/u);
  assert.match(source, /guardPhysicalExport\("PDF"/u);
  assert.match(source, /guardPhysicalExport\("DXF"/u);
  assert.match(source, /guardPhysicalExport\("DXF ZIP"/u);
  assert.match(source, /if \(!ensureMeasurementVerification\(\)\)/u);
});

test("derived grade sizes cannot inherit a verified measurement claim", () => {
  const source = read("../src/ui/screens/Editor.js");
  assert.doesNotMatch(source, /withMeasurementVerification\(variant\.draft/u);
  assert.match(source, /scope: "base-profile-only"/u);
  assert.match(source, /derivedSizesMeasured: false/u);
  assert.match(source, /derivedMeasurementsDirectlyVerified: false/u);
});

test("grade packages aggregate per-variant export safety", () => {
  const source = read("../src/ui/screens/Editor.js");
  assert.match(source, /resolveExportSafety\(\{ module, draft: variant\.draft \}\)/u);
  assert.match(source, /strictestExportSafety\(/u);
  assert.match(source, /variant\.safety\)/u);
  assert.match(source, /batchSafety\)/u);
});

test("external JSON can never import permission for physical export", () => {
  const source = read("../src/ui/screens/Editor.js");
  assert.match(source, /measurementVerification: _untrustedVerification/u);
  assert.match(source, /measurementVerification = sanitizeVerification\(\{\}\)/u);
  assert.match(source, /projectFormatVersion >= 2/u);
  assert.match(source, /missing its required module version/u);
  assert.match(source, /Repeat the measurements again before physical export/u);
});

test("project, profile, and local draft versions fail closed without silent overwrite", () => {
  const source = read("../src/ui/screens/Editor.js");
  assert.match(source, /!\[1, 2, 3\]\.includes\(projectFormatVersion\)/u);
  assert.match(source, /moduleAcceptsDraftVersion\(profileModule, profile\.schemaVersion\)/u);
  assert.match(source, /const isInitialFormRender = form == null/u);
  assert.match(source, /if \(!isInitialFormRender\) persistDraft\(\)/u);
  assert.match(source, /let draftPersistenceReady = false/u);
  assert.match(source, /if \(!draftPersistenceReady\) return/u);
  assert.match(source, /draftPersistenceReady = true/u);
  assert.match(source, /It was preserved unchanged and safe defaults were opened/u);
});

test("undo and redo let the shared form invalidate stale repeat measurements", () => {
  const source = read("../src/ui/screens/Editor.js");
  const restoreHistory = source.slice(source.indexOf("const restoreHistory"), source.indexOf("redoButton.addEventListener"));
  assert.doesNotMatch(restoreHistory, /Object\.assign\(values, restored\)/u);
  assert.match(restoreHistory, /form\?\.setValues\(restored\)/u);
});

test("a draft without its own verification cannot inherit a profile claim", () => {
  const source = read("../src/ui/screens/Editor.js");
  assert.match(source, /storedDraft \? storedDraft\.measurementVerification : lastProfile\?\.measurementVerification/u);
  assert.doesNotMatch(source, /storedDraft\?\.measurementVerification \|\| lastProfile/u);
});

test("style templates use the same declared module compatibility as drafts", () => {
  const source = read("../assets/js/main.js");
  assert.match(source, /moduleAcceptsDraftVersion\(module, candidate\.moduleVersion\)/u);
  assert.match(source, /module\.schema\.fields/u);
  assert.match(source, /Object\.hasOwn\(stored\.measurements \|\| \{\}, field\.key\)/u);
});
