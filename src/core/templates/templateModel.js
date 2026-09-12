import { moduleAcceptsDraftVersion } from "../pattern/PatternModule.js";

export const TEMPLATE_KIND = "lekalo-style-template";
export const TEMPLATE_FORMAT_VERSION = 1;
export const TEMPLATE_LIBRARY_KIND = "lekalo-template-library";
export const TEMPLATE_LIBRARY_FORMAT_VERSION = 1;
export const MAX_TEMPLATE_JSON_BYTES = 64 * 1024;
export const MAX_TEMPLATE_LIBRARY_JSON_BYTES = 1024 * 1024;
export const MAX_STORED_TEMPLATES = 100;

const TEMPLATE_KEYS = new Set([
  "kind",
  "formatVersion",
  "id",
  "version",
  "moduleId",
  "moduleVersion",
  "name",
  "description",
  "status",
  "license",
  "provenance",
  "options",
  "adjustments",
]);
const LICENSE_KEYS = new Set(["spdx", "name", "url"]);
const PROVENANCE_KEYS = new Set(["kind", "author", "source", "sourceUrl", "sourceVersion"]);
const LOCALIZED_KEYS = new Set(["ru", "en"]);
const TEMPLATE_STATUSES = new Set(["draft", "experimental", "ready-for-toile", "fit-validated", "deprecated"]);
const PROVENANCE_KINDS = new Set(["original", "derived", "imported", "built-in"]);
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const SAFE_SCHEMA_KEY = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SPDX_ID = /^(?:[A-Za-z0-9][A-Za-z0-9.+-]{0,63}|LicenseRef-[A-Za-z0-9.+-]{1,53})$/;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

export class TemplateValidationError extends Error {
  constructor(code, path, message, details = null) {
    super(message);
    this.name = "TemplateValidationError";
    this.code = code;
    this.path = path;
    this.details = details;
  }
}

function fail(code, path, message, details = null) {
  throw new TemplateValidationError(code, path, message, details);
}

function isRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertDataRecord(value, path) {
  if (!isRecord(value)) fail("invalid-object", path, `${path} must be a plain JSON object.`);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (descriptor.get || descriptor.set) {
      fail("executable-value", `${path}.${key}`, "Template data must not contain accessors or executable values.");
    }
  }
  return value;
}

function assertOnlyKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("unknown-field", `${path}.${key}`, `Unknown template field: ${path}.${key}.`);
  }
}

function normalizedString(value, path, { min = 1, max = 240 } = {}) {
  if (typeof value !== "string") fail("invalid-string", path, `${path} must be a string.`);
  const result = value.trim();
  if (result.length < min || result.length > max || CONTROL_CHARACTERS.test(result)) {
    fail("invalid-string", path, `${path} has an invalid length or contains control characters.`);
  }
  return result;
}

function normalizedOptionalString(value, path, options) {
  if (value === undefined) return undefined;
  return normalizedString(value, path, options);
}

function normalizedLocalizedText(value, path, { required = true, max = 600 } = {}) {
  if (value === undefined && !required) return undefined;
  assertDataRecord(value, path);
  assertOnlyKeys(value, LOCALIZED_KEYS, path);
  const result = {};
  for (const locale of ["ru", "en"]) {
    if (value[locale] !== undefined) result[locale] = normalizedString(value[locale], `${path}.${locale}`, { max });
  }
  if (!Object.keys(result).length) fail("missing-localized-text", path, `${path} must include ru or en text.`);
  return result;
}

function normalizedHttpUrl(value, path) {
  const text = normalizedString(value, path, { max: 1000 });
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    fail("invalid-url", path, `${path} must be an absolute HTTP(S) URL.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail("invalid-url", path, `${path} must use HTTP or HTTPS.`);
  }
  return parsed.href;
}

function normalizedLicense(value) {
  assertDataRecord(value, "template.license");
  assertOnlyKeys(value, LICENSE_KEYS, "template.license");
  const spdx = normalizedString(value.spdx, "template.license.spdx", { max: 64 });
  if (!SPDX_ID.test(spdx)) fail("invalid-license", "template.license.spdx", "License must use an SPDX identifier or LicenseRef identifier.");
  const result = { spdx };
  const name = normalizedOptionalString(value.name, "template.license.name", { max: 120 });
  if (name !== undefined) result.name = name;
  if (value.url !== undefined) result.url = normalizedHttpUrl(value.url, "template.license.url");
  return result;
}

function normalizedProvenance(value) {
  assertDataRecord(value, "template.provenance");
  assertOnlyKeys(value, PROVENANCE_KEYS, "template.provenance");
  const kind = normalizedString(value.kind, "template.provenance.kind", { max: 32 });
  if (!PROVENANCE_KINDS.has(kind)) fail("invalid-provenance", "template.provenance.kind", `Unsupported provenance kind: ${kind}.`);
  const result = {
    kind,
    author: normalizedString(value.author, "template.provenance.author", { max: 160 }),
    source: normalizedString(value.source, "template.provenance.source", { max: 500 }),
  };
  if (value.sourceUrl !== undefined) result.sourceUrl = normalizedHttpUrl(value.sourceUrl, "template.provenance.sourceUrl");
  const sourceVersion = normalizedOptionalString(value.sourceVersion, "template.provenance.sourceVersion", { max: 80 });
  if (sourceVersion !== undefined) result.sourceVersion = sourceVersion;
  return result;
}

function schemaMap(entries, kind) {
  const result = new Map();
  for (const entry of entries || []) {
    if (!entry || typeof entry.key !== "string" || !SAFE_SCHEMA_KEY.test(entry.key)) {
      fail("invalid-module-schema", `module.schema.${kind}`, `The module contains an invalid ${kind} key.`);
    }
    if (result.has(entry.key)) fail("invalid-module-schema", `module.schema.${kind}.${entry.key}`, `Duplicate ${kind} key.`);
    result.set(entry.key, entry);
  }
  return result;
}

function assertJsonScalar(value, path) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  fail("executable-value", path, `${path} must be a finite JSON scalar.`);
}

function sameScalar(left, right) {
  return Object.is(left, right);
}

function normalizedOptions(value, schema) {
  assertDataRecord(value, "template.options");
  const definitions = schemaMap(schema.options, "options");
  const result = {};
  for (const key of Object.keys(value)) {
    const definition = definitions.get(key);
    if (!definition) fail("unknown-option", `template.options.${key}`, `Unknown option for ${schema.id}: ${key}.`);
    const optionValue = assertJsonScalar(value[key], `template.options.${key}`);
    if (!(definition.choices || []).some((choice) => sameScalar(choice.value, optionValue))) {
      fail("invalid-option", `template.options.${key}`, `Option ${key} is not one of the module's allowed values.`);
    }
    result[key] = optionValue;
  }
  return result;
}

function normalizedAdjustments(value, schema) {
  assertDataRecord(value, "template.adjustments");
  const definitions = schemaMap(schema.adjustments, "adjustments");
  const result = {};
  for (const key of Object.keys(value)) {
    const definition = definitions.get(key);
    if (!definition) fail("unknown-adjustment", `template.adjustments.${key}`, `Unknown adjustment for ${schema.id}: ${key}.`);
    const adjustmentValue = value[key];
    if (typeof adjustmentValue !== "number" || !Number.isFinite(adjustmentValue)) {
      fail("invalid-adjustment", `template.adjustments.${key}`, `Adjustment ${key} must be a finite number.`);
    }
    if (adjustmentValue < definition.min || adjustmentValue > definition.max) {
      fail("adjustment-out-of-range", `template.adjustments.${key}`, `Adjustment ${key} is outside ${definition.min}…${definition.max}.`);
    }
    if (Number.isFinite(definition.step) && definition.step > 0) {
      const origin = Number.isFinite(definition.min) ? definition.min : (definition.default || 0);
      const steps = (adjustmentValue - origin) / definition.step;
      if (Math.abs(steps - Math.round(steps)) > 1e-8) {
        fail("adjustment-step-mismatch", `template.adjustments.${key}`, `Adjustment ${key} does not match step ${definition.step}.`);
      }
    }
    result[key] = adjustmentValue;
  }
  return result;
}

function assertModule(module, moduleId, moduleVersion) {
  if (!module || module.id !== moduleId || !module.schema || module.schema.id !== moduleId) {
    fail("unknown-module", "template.moduleId", `Pattern module is unavailable: ${moduleId}.`);
  }
  if (!moduleAcceptsDraftVersion(module, moduleVersion)) {
    fail(
      "module-version-mismatch",
      "template.moduleVersion",
      `Template requires ${moduleId} ${moduleVersion}; current module is ${module.version}.`,
      { expected: moduleVersion, actual: module.version },
    );
  }
}

function assertOptionRelationships(schema, options, adjustments) {
  if (typeof schema.validate !== "function") return;
  const values = {
    ...(schema.defaults || {}),
    ...(schema.optionDefaults || {}),
    ...(schema.adjustmentDefaults || {}),
    ...options,
    ...adjustments,
  };
  let errors;
  try {
    errors = schema.validate(values) || {};
  } catch (error) {
    fail("module-validation-failed", "template", "The module could not validate this template.", { cause: String(error?.message || error) });
  }
  for (const key of [...Object.keys(options), ...Object.keys(adjustments)]) {
    if (Array.isArray(errors[key]) ? errors[key].length : errors[key]) {
      const group = Object.hasOwn(options, key) ? "options" : "adjustments";
      fail("invalid-combination", `template.${group}.${key}`, `Template setting ${key} conflicts with another setting.`);
    }
  }
}

/**
 * Validates and returns a newly allocated, allowlisted template object.
 * The result contains settings only: body measurements are deliberately unsupported.
 */
export function assertTemplate(input, module) {
  assertDataRecord(input, "template");
  if (Object.hasOwn(input, "measurements")) {
    fail("measurements-forbidden", "template.measurements", "Style templates must never contain body measurements.");
  }
  assertOnlyKeys(input, TEMPLATE_KEYS, "template");
  if (input.kind !== TEMPLATE_KIND) fail("invalid-kind", "template.kind", `Expected ${TEMPLATE_KIND}.`);
  if (input.formatVersion !== TEMPLATE_FORMAT_VERSION) {
    fail("unsupported-format-version", "template.formatVersion", `Unsupported template format version: ${input.formatVersion}.`);
  }

  const id = normalizedString(input.id, "template.id", { max: 80 });
  if (!SAFE_ID.test(id)) fail("invalid-id", "template.id", "Template id must contain lowercase ASCII letters, digits, dot, underscore, or hyphen.");
  const moduleId = normalizedString(input.moduleId, "template.moduleId", { max: 80 });
  if (!SAFE_ID.test(moduleId)) fail("invalid-module-id", "template.moduleId", "Module id is invalid.");
  const version = normalizedString(input.version, "template.version", { max: 80 });
  const moduleVersion = normalizedString(input.moduleVersion, "template.moduleVersion", { max: 80 });
  if (!SEMVER.test(version)) fail("invalid-version", "template.version", "Template version must be semantic version text.");
  if (!SEMVER.test(moduleVersion)) fail("invalid-version", "template.moduleVersion", "Module version must be semantic version text.");
  assertModule(module, moduleId, moduleVersion);

  const status = normalizedString(input.status, "template.status", { max: 32 });
  if (!TEMPLATE_STATUSES.has(status)) fail("invalid-status", "template.status", `Unsupported template status: ${status}.`);
  const options = normalizedOptions(input.options, module.schema);
  const adjustments = normalizedAdjustments(input.adjustments, module.schema);
  assertOptionRelationships(module.schema, options, adjustments);

  const result = {
    kind: TEMPLATE_KIND,
    formatVersion: TEMPLATE_FORMAT_VERSION,
    id,
    version,
    moduleId,
    moduleVersion,
    name: normalizedLocalizedText(input.name, "template.name", { max: 120 }),
  };
  const description = normalizedLocalizedText(input.description, "template.description", { required: false, max: 600 });
  if (description !== undefined) result.description = description;
  result.status = status;
  result.license = normalizedLicense(input.license);
  result.provenance = normalizedProvenance(input.provenance);
  result.options = options;
  result.adjustments = adjustments;
  return result;
}

function utf8Length(text) {
  return new TextEncoder().encode(text).byteLength;
}

function parseBoundedJson(text, maxBytes, label) {
  if (typeof text !== "string") fail("invalid-json-input", label, `${label} must be JSON text.`);
  if (utf8Length(text) > maxBytes) fail("json-too-large", label, `${label} exceeds the ${maxBytes}-byte limit.`, { maxBytes });
  try {
    return JSON.parse(text);
  } catch {
    fail("invalid-json", label, `${label} is not valid JSON.`);
  }
}

function resolveModule(resolveModule, moduleId) {
  if (typeof resolveModule !== "function") fail("missing-module-resolver", "resolver", "A module resolver function is required.");
  return resolveModule(moduleId);
}

/** Resolves a template's module only after rejecting accessor properties. */
export function assertTemplateForResolver(input, resolveModuleById) {
  assertDataRecord(input, "template");
  const moduleId = typeof input.moduleId === "string" ? input.moduleId : "";
  return assertTemplate(input, resolveModule(resolveModuleById, moduleId));
}

export function importTemplateJson(text, resolveModuleById) {
  const input = parseBoundedJson(text, MAX_TEMPLATE_JSON_BYTES, "templateJson");
  return assertTemplateForResolver(input, resolveModuleById);
}

export function exportTemplateJson(input, module, { space = 2 } = {}) {
  const indentation = Number.isInteger(space) && space >= 0 && space <= 4 ? space : 2;
  return `${JSON.stringify(assertTemplate(input, module), null, indentation)}\n`;
}

/** Returns safe style settings only; it never creates or accepts measurements. */
export function resolveTemplateSettings(input, module) {
  const template = assertTemplate(input, module);
  return {
    moduleId: template.moduleId,
    moduleVersion: template.moduleVersion,
    options: { ...(module.schema.optionDefaults || {}), ...template.options },
    adjustments: { ...(module.schema.adjustmentDefaults || {}), ...template.adjustments },
  };
}

export function importTemplateLibraryJson(text, resolveModuleById) {
  const input = parseBoundedJson(text, MAX_TEMPLATE_LIBRARY_JSON_BYTES, "templateLibraryJson");
  assertDataRecord(input, "templateLibrary");
  assertOnlyKeys(input, new Set(["kind", "formatVersion", "templates"]), "templateLibrary");
  if (input.kind !== TEMPLATE_LIBRARY_KIND || input.formatVersion !== TEMPLATE_LIBRARY_FORMAT_VERSION) {
    fail("unsupported-library-format", "templateLibrary", "Unsupported template library format.");
  }
  if (!Array.isArray(input.templates) || input.templates.length > MAX_STORED_TEMPLATES) {
    fail("invalid-template-count", "templateLibrary.templates", `A library may contain at most ${MAX_STORED_TEMPLATES} templates.`);
  }
  const seen = new Set();
  return input.templates.map((template, index) => {
    assertDataRecord(template, `templateLibrary.templates[${index}]`);
    const normalized = assertTemplateForResolver(template, resolveModuleById);
    if (seen.has(normalized.id)) fail("duplicate-template-id", `templateLibrary.templates[${index}].id`, `Duplicate template id: ${normalized.id}.`);
    seen.add(normalized.id);
    return normalized;
  });
}

export function exportTemplateLibraryJson(templates, resolveModuleById, { space = 2 } = {}) {
  if (!Array.isArray(templates) || templates.length > MAX_STORED_TEMPLATES) {
    fail("invalid-template-count", "templates", `A library may contain at most ${MAX_STORED_TEMPLATES} templates.`);
  }
  const seen = new Set();
  const normalized = templates.map((template, index) => {
    assertDataRecord(template, `templates[${index}]`);
    const value = assertTemplateForResolver(template, resolveModuleById);
    if (seen.has(value.id)) fail("duplicate-template-id", `templates[${index}].id`, `Duplicate template id: ${value.id}.`);
    seen.add(value.id);
    return value;
  });
  const indentation = Number.isInteger(space) && space >= 0 && space <= 4 ? space : 2;
  const json = `${JSON.stringify({
    kind: TEMPLATE_LIBRARY_KIND,
    formatVersion: TEMPLATE_LIBRARY_FORMAT_VERSION,
    templates: normalized,
  }, null, indentation)}\n`;
  if (utf8Length(json) > MAX_TEMPLATE_LIBRARY_JSON_BYTES) {
    fail(
      "json-too-large",
      "templateLibraryJson",
      `Template library exceeds the ${MAX_TEMPLATE_LIBRARY_JSON_BYTES}-byte limit.`,
      { maxBytes: MAX_TEMPLATE_LIBRARY_JSON_BYTES },
    );
  }
  return json;
}
