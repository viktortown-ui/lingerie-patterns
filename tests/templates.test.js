import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTemplate,
  BUILT_IN_UNDERWEAR_TEMPLATES,
  DEFAULT_TEMPLATE_QUARANTINE_KEY,
  exportTemplateJson,
  exportTemplateLibraryJson,
  importTemplateJson,
  importTemplateLibraryJson,
  MAX_TEMPLATE_JSON_BYTES,
  resolveTemplateSettings,
  TemplateStorage,
  TemplateValidationError,
} from "../src/core/templates/index.js";
import { modules } from "../src/patterns/index.js";

const resolveModule = (id) => modules.find((module) => module.id === id);
const clone = (value) => JSON.parse(JSON.stringify(value));

function expectCode(code) {
  return (error) => error instanceof TemplateValidationError && error.code === code;
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

test("built-in underwear templates are immutable, schema-valid, and contain no measurements", () => {
  assert.equal(BUILT_IN_UNDERWEAR_TEMPLATES.length, 5);
  assert.equal(Object.isFrozen(BUILT_IN_UNDERWEAR_TEMPLATES), true);
  for (const preset of BUILT_IN_UNDERWEAR_TEMPLATES) {
    const module = resolveModule(preset.moduleId);
    const normalized = assertTemplate(preset, module);
    const settings = resolveTemplateSettings(normalized, module);
    assert.equal(Object.hasOwn(normalized, "measurements"), false);
    assert.equal(Object.hasOwn(settings, "measurements"), false);
    assert.equal(JSON.stringify(normalized).includes('"measurements"'), false);
    assert.equal(normalized.license.spdx, "MIT");
    assert.equal(normalized.status, "ready-for-toile");
    assert.ok(normalized.provenance.author);
    assert.doesNotThrow(() => module.draft(module.schema.defaults, settings.options, settings.adjustments));
  }
});

test("template validation rejects measurements, unknown settings, bad choices, and adjustment range violations", () => {
  const source = BUILT_IN_UNDERWEAR_TEMPLATES[0];
  const module = resolveModule(source.moduleId);

  const withMeasurements = clone(source);
  withMeasurements.measurements = { waist: 72 };
  assert.throws(() => assertTemplate(withMeasurements, module), expectCode("measurements-forbidden"));

  const unknownOption = clone(source);
  unknownOption.options.notARealOption = true;
  assert.throws(() => assertTemplate(unknownOption, module), expectCode("unknown-option"));

  const invalidOption = clone(source);
  invalidOption.options.riseLevel = "ultra";
  assert.throws(() => assertTemplate(invalidOption, module), expectCode("invalid-option"));

  const wrongOptionType = clone(source);
  wrongOptionType.options.seamAllowance = "6";
  assert.throws(() => assertTemplate(wrongOptionType, module), expectCode("invalid-option"));

  const unknownAdjustment = clone(source);
  unknownAdjustment.adjustments.freehandPoint = 1;
  assert.throws(() => assertTemplate(unknownAdjustment, module), expectCode("unknown-adjustment"));

  const outOfRange = clone(source);
  outOfRange.adjustments.frontWaistDepth = 2.1;
  assert.throws(() => assertTemplate(outOfRange, module), expectCode("adjustment-out-of-range"));

  const incompatibleStretch = clone(source);
  incompatibleStretch.options.fabricMaxStretch = 30;
  incompatibleStretch.options.workingStretchX = 40;
  assert.throws(() => assertTemplate(incompatibleStretch, module), expectCode("invalid-combination"));
});

test("template data cannot carry functions, accessors, unsafe URLs, or incompatible module versions", () => {
  const source = BUILT_IN_UNDERWEAR_TEMPLATES[0];
  const module = resolveModule(source.moduleId);

  const executable = clone(source);
  executable.options.riseLevel = () => "high";
  assert.throws(() => assertTemplate(executable, module), expectCode("executable-value"));

  const accessor = clone(source);
  Object.defineProperty(accessor.provenance, "author", { enumerable: true, get() { return "unexpected"; } });
  assert.throws(() => assertTemplate(accessor, module), expectCode("executable-value"));

  const unsafeUrl = clone(source);
  unsafeUrl.provenance.sourceUrl = "javascript:alert(1)";
  assert.throws(() => assertTemplate(unsafeUrl, module), expectCode("invalid-url"));

  const stale = clone(source);
  stale.moduleVersion = "0.9.0";
  assert.throws(() => assertTemplate(stale, module), expectCode("module-version-mismatch"));

  const compatibleModule = {
    ...module,
    version: "1.1.0",
    compatibleDraftVersions: [source.moduleVersion],
  };
  assert.doesNotThrow(() => assertTemplate(source, compatibleModule));
});

test("single-template JSON import/export is bounded, deterministic, and module-aware", () => {
  const source = BUILT_IN_UNDERWEAR_TEMPLATES[3];
  const module = resolveModule(source.moduleId);
  const first = exportTemplateJson(source, module);
  const second = exportTemplateJson(importTemplateJson(first, resolveModule), module);
  assert.equal(second, first);
  assert.equal(first.endsWith("\n"), true);
  assert.equal(first.includes('"measurements"'), false);
  assert.deepEqual(importTemplateJson(first, resolveModule), assertTemplate(source, module));
  assert.throws(() => importTemplateJson("{broken", resolveModule), expectCode("invalid-json"));
  assert.throws(() => importTemplateJson(`"${"x".repeat(MAX_TEMPLATE_JSON_BYTES)}"`, resolveModule), expectCode("json-too-large"));

  const missingModule = clone(source);
  missingModule.moduleId = "missing_module";
  assert.throws(() => importTemplateJson(JSON.stringify(missingModule), resolveModule), expectCode("unknown-module"));
});

test("template libraries reject duplicates atomically and round-trip valid presets", () => {
  const templates = BUILT_IN_UNDERWEAR_TEMPLATES.slice(0, 3);
  const json = exportTemplateLibraryJson(templates, resolveModule);
  assert.deepEqual(importTemplateLibraryJson(json, resolveModule), templates.map((item) => assertTemplate(item, resolveModule(item.moduleId))));
  assert.equal(json.includes('"measurements"'), false);
  assert.throws(() => exportTemplateLibraryJson([templates[0], templates[0]], resolveModule), expectCode("duplicate-template-id"));

  const corrupted = JSON.parse(json);
  corrupted.templates[1].options.unknown = "bad";
  assert.throws(() => importTemplateLibraryJson(JSON.stringify(corrupted), resolveModule), expectCode("unknown-option"));
});

test("storage adapter uses injected Storage and refuses to overwrite corrupt persisted data", () => {
  const storage = new MemoryStorage();
  const adapter = new TemplateStorage({ storage, resolveModule });
  const first = BUILT_IN_UNDERWEAR_TEMPLATES[0];
  const second = BUILT_IN_UNDERWEAR_TEMPLATES[3];

  assert.deepEqual(adapter.load(), []);
  assert.equal(adapter.save([first]), true);
  assert.deepEqual(adapter.load().map((item) => item.id), [first.id]);
  assert.equal(adapter.upsert(second), true);
  assert.deepEqual(adapter.load().map((item) => item.id), [first.id, second.id]);
  assert.equal(adapter.remove(first.id), true);
  assert.deepEqual(adapter.load().map((item) => item.id), [second.id]);
  const persisted = storage.getItem(adapter.key);
  assert.equal(persisted.includes('"measurements"'), false);

  storage.setItem(adapter.key, "{broken");
  assert.deepEqual(adapter.load(), []);
  assert.equal(adapter.lastError.code, "invalid-json");
  assert.equal(adapter.upsert(first), false, "corrupt data must not be silently overwritten");
  assert.equal(storage.getItem(adapter.key), "{broken");
});

test("storage upsert validates before reading template identity", () => {
  const storage = new MemoryStorage();
  const adapter = new TemplateStorage({ storage, resolveModule });
  const accessor = clone(BUILT_IN_UNDERWEAR_TEMPLATES[0]);
  let reads = 0;
  Object.defineProperty(accessor, "id", {
    enumerable: true,
    get() {
      reads += 1;
      return "panties_basic.unsafe";
    },
  });
  assert.throws(() => adapter.upsert(accessor), expectCode("executable-value"));
  assert.equal(reads, 0);
  assert.equal(storage.getItem(adapter.key), null);
});

test("storage can refuse a cross-tab replacement that was not confirmed", () => {
  const storage = new MemoryStorage();
  const adapter = new TemplateStorage({ storage, resolveModule });
  const first = clone(BUILT_IN_UNDERWEAR_TEMPLATES[0]);
  first.id = "user.concurrent";
  assert.equal(adapter.upsert(first), true);

  const replacement = clone(BUILT_IN_UNDERWEAR_TEMPLATES[1]);
  replacement.id = first.id;
  assert.equal(adapter.upsert(replacement, { replaceExisting: false }), false);
  assert.equal(adapter.lastError.code, "template-exists");
  assert.deepEqual(adapter.load()[0].options, first.options);
});

test("blocked or absent storage fails closed without breaking template validation", () => {
  const blocked = new TemplateStorage({
    storage: {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
    },
    resolveModule,
  });
  assert.deepEqual(blocked.load(), []);
  assert.equal(blocked.lastError.code, "storage-read-failed");

  const absent = new TemplateStorage({ resolveModule });
  assert.equal(absent.save([BUILT_IN_UNDERWEAR_TEMPLATES[0]]), false);
  assert.equal(absent.lastError.code, "storage-unavailable");
});

test("maximum valid stored library remains readable after a successful save", () => {
  const storage = new MemoryStorage();
  const adapter = new TemplateStorage({ storage, resolveModule });
  const base = BUILT_IN_UNDERWEAR_TEMPLATES[0];
  const longUrl = `https://example.com/${"a".repeat(900)}`;
  const templates = Array.from({ length: 100 }, (_, index) => ({
    ...clone(base),
    id: `user.bulk-${String(index).padStart(3, "0")}`,
    name: { ru: "Н".repeat(120), en: "N".repeat(120) },
    description: { ru: "О".repeat(600), en: "D".repeat(600) },
    license: { spdx: "MIT", name: "L".repeat(120), url: longUrl },
    provenance: {
      ...clone(base.provenance),
      author: "A".repeat(160),
      source: "S".repeat(500),
      sourceUrl: longUrl,
    },
  }));

  assert.equal(adapter.save(templates), true);
  assert.ok(new TextEncoder().encode(storage.getItem(adapter.key)).byteLength > 512 * 1024);
  assert.equal(adapter.load().length, 100);
  assert.equal(adapter.lastError, null);
});

test("incompatible templates are quarantined without hiding or losing compatible ones", () => {
  const storage = new MemoryStorage();
  const adapter = new TemplateStorage({ storage, resolveModule });
  const stale = clone(BUILT_IN_UNDERWEAR_TEMPLATES[0]);
  stale.id = "user.stale";
  stale.moduleVersion = "0.9.0";
  const compatible = clone(BUILT_IN_UNDERWEAR_TEMPLATES[3]);
  compatible.id = "user.compatible";
  storage.setItem(adapter.key, JSON.stringify({
    kind: "lekalo-template-library",
    formatVersion: 1,
    templates: [stale, compatible],
  }));

  assert.deepEqual(adapter.load().map((item) => item.id), ["user.compatible"]);
  assert.equal(adapter.lastError, null);
  assert.deepEqual(adapter.lastWarning, { code: "incompatible-templates-preserved", count: 1 });

  const added = clone(BUILT_IN_UNDERWEAR_TEMPLATES[1]);
  added.id = "user.added";
  assert.equal(adapter.upsert(added), true);
  const raw = storage.getItem(adapter.key);
  assert.doesNotMatch(raw, /"user\.stale"/);
  assert.match(raw, /"user\.compatible"/);
  assert.match(raw, /"user\.added"/);
  assert.match(storage.getItem(adapter.quarantineKey), /"user\.stale"/);
  assert.deepEqual(adapter.load().map((item) => item.id).sort(), ["user.added", "user.compatible"]);
});

test("a full legacy quarantine cannot block a new compatible template", () => {
  const storage = new MemoryStorage();
  const adapter = new TemplateStorage({ storage, resolveModule });
  const base = BUILT_IN_UNDERWEAR_TEMPLATES[0];
  const stale = Array.from({ length: 100 }, (_, index) => ({
    ...clone(base),
    id: `user.stale-${String(index).padStart(3, "0")}`,
    moduleVersion: "0.9.0",
  }));
  storage.setItem(adapter.key, JSON.stringify({
    kind: "lekalo-template-library",
    formatVersion: 1,
    templates: stale,
  }));

  assert.deepEqual(adapter.load(), []);
  assert.equal(adapter.preservedTemplates.length, 100);
  const added = clone(BUILT_IN_UNDERWEAR_TEMPLATES[3]);
  added.id = "user.new-compatible";
  assert.equal(adapter.upsert(added), true);
  assert.deepEqual(adapter.load().map((item) => item.id), ["user.new-compatible"]);
  assert.equal(JSON.parse(storage.getItem(adapter.key)).templates.length, 1);
  assert.equal(JSON.parse(storage.getItem(DEFAULT_TEMPLATE_QUARANTINE_KEY)).templates.length, 100);
});

test("a failed active write keeps a recovered quarantine template", () => {
  const storage = new MemoryStorage();
  const recovered = clone(BUILT_IN_UNDERWEAR_TEMPLATES[0]);
  recovered.id = "user.recovered";
  storage.setItem(DEFAULT_TEMPLATE_QUARANTINE_KEY, JSON.stringify({
    kind: "lekalo-template-library",
    formatVersion: 1,
    templates: [recovered],
  }));
  const adapter = new TemplateStorage({ storage, resolveModule });
  assert.deepEqual(adapter.load().map((item) => item.id), ["user.recovered"]);

  let writes = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    writes += 1;
    if (writes === 2) throw new Error("quota");
    originalSetItem(key, value);
  };
  assert.equal(adapter.save([recovered]), false);
  assert.equal(adapter.lastError.code, "storage-write-failed");

  storage.setItem = originalSetItem;
  const reloaded = new TemplateStorage({ storage, resolveModule });
  assert.deepEqual(reloaded.load().map((item) => item.id), ["user.recovered"]);
});

test("a valid active template outranks a damaged leftover quarantine copy", () => {
  const storage = new MemoryStorage();
  const active = clone(BUILT_IN_UNDERWEAR_TEMPLATES[0]);
  active.id = "user.authoritative";
  const damaged = clone(active);
  damaged.options.notReal = true;
  storage.setItem("lekalo-style-templates-v1", JSON.stringify({
    kind: "lekalo-template-library",
    formatVersion: 1,
    templates: [active],
  }));
  storage.setItem(DEFAULT_TEMPLATE_QUARANTINE_KEY, JSON.stringify({
    kind: "lekalo-template-library",
    formatVersion: 1,
    templates: [damaged],
  }));

  const adapter = new TemplateStorage({ storage, resolveModule });
  assert.deepEqual(adapter.load().map((item) => item.id), ["user.authoritative"]);
  assert.equal(adapter.lastError, null);
});

test("a broken standalone quarantine cannot hide or overwrite a valid active library", () => {
  const storage = new MemoryStorage();
  const active = clone(BUILT_IN_UNDERWEAR_TEMPLATES[0]);
  active.id = "user.visible-active";
  storage.setItem("lekalo-style-templates-v1", JSON.stringify({
    kind: "lekalo-template-library",
    formatVersion: 1,
    templates: [active],
  }));
  storage.setItem(DEFAULT_TEMPLATE_QUARANTINE_KEY, "{broken");

  const adapter = new TemplateStorage({ storage, resolveModule });
  assert.deepEqual(adapter.load().map((item) => item.id), ["user.visible-active"]);
  assert.equal(adapter.lastError, null);
  assert.equal(adapter.lastWarning.code, "quarantine-library-invalid");
  assert.equal(adapter.upsert(clone(BUILT_IN_UNDERWEAR_TEMPLATES[1])), false);
  assert.equal(adapter.lastError.code, "quarantine-library-invalid");
  assert.equal(storage.getItem(DEFAULT_TEMPLATE_QUARANTINE_KEY), "{broken");
  assert.match(storage.getItem(adapter.key), /"user\.visible-active"/);
});
