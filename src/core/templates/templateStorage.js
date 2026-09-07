import {
  assertTemplateForResolver,
  exportTemplateLibraryJson,
  MAX_STORED_TEMPLATES,
  MAX_TEMPLATE_LIBRARY_JSON_BYTES,
  TEMPLATE_FORMAT_VERSION,
  TEMPLATE_KIND,
  TEMPLATE_LIBRARY_FORMAT_VERSION,
  TEMPLATE_LIBRARY_KIND,
  TemplateValidationError,
} from "./templateModel.js";

export const DEFAULT_TEMPLATE_STORAGE_KEY = "lekalo-style-templates-v1";
export const DEFAULT_TEMPLATE_QUARANTINE_KEY = "lekalo-style-templates-quarantine-v1";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
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

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function utf8Length(text) {
  return new TextEncoder().encode(text).byteLength;
}

function fail(code, path, message) {
  throw new TemplateValidationError(code, path, message);
}

function parseEnvelope(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("invalid-json", "templateLibrary", "Stored template library is not valid JSON.");
  }
  if (!isRecord(parsed)) fail("invalid-object", "templateLibrary", "Stored template library must be an object.");
  const keys = Object.keys(parsed);
  if (keys.some((key) => !new Set(["kind", "formatVersion", "templates"]).has(key))) {
    fail("unknown-field", "templateLibrary", "Stored template library contains an unknown field.");
  }
  if (parsed.kind !== TEMPLATE_LIBRARY_KIND || parsed.formatVersion !== TEMPLATE_LIBRARY_FORMAT_VERSION) {
    fail("unsupported-library-format", "templateLibrary", "Stored template library has an unsupported format.");
  }
  if (!Array.isArray(parsed.templates) || parsed.templates.length > MAX_STORED_TEMPLATES) {
    fail("invalid-template-count", "templateLibrary.templates", "Stored template count is invalid.");
  }
  return parsed;
}

function preserveOpaqueTemplate(value, index) {
  const path = `templateLibrary.templates[${index}]`;
  if (!isRecord(value)) fail("invalid-object", path, "An incompatible template must still be a plain object.");
  if (Object.hasOwn(value, "measurements")) {
    fail("measurements-forbidden", `${path}.measurements`, "Style templates must never contain body measurements.");
  }
  if (Object.keys(value).some((key) => !TEMPLATE_KEYS.has(key))) {
    fail("unknown-field", path, "An incompatible template contains an unknown field.");
  }
  if (value.kind !== TEMPLATE_KIND || value.formatVersion !== TEMPLATE_FORMAT_VERSION) {
    fail("unsupported-format-version", path, "An incompatible template has an unsupported format.");
  }
  for (const key of ["id", "moduleId"]) {
    if (typeof value[key] !== "string" || !SAFE_ID.test(value[key])) {
      fail("invalid-id", `${path}.${key}`, "An incompatible template has an invalid identifier.");
    }
  }
  if (typeof value.moduleVersion !== "string" || !SEMVER.test(value.moduleVersion)) {
    fail("invalid-version", `${path}.moduleVersion`, "An incompatible template has an invalid module version.");
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * LocalStorage-compatible template library with lossless quarantine for valid
 * data that cannot be activated because its module/version is unavailable.
 */
export class TemplateStorage {
  constructor({
    storage = null,
    resolveModule,
    key = DEFAULT_TEMPLATE_STORAGE_KEY,
    quarantineKey = key === DEFAULT_TEMPLATE_STORAGE_KEY
      ? DEFAULT_TEMPLATE_QUARANTINE_KEY
      : `${key}-quarantine`,
  } = {}) {
    this.storage = storage;
    this.resolveModule = resolveModule;
    this.key = key;
    this.quarantineKey = quarantineKey;
    this.lastError = null;
    this.lastWarning = null;
    this.preservedTemplates = [];
    this.quarantineBackupTemplates = [];
    this.loaded = false;
    this.libraryWriteBlocked = false;
  }

  load() {
    this.loaded = true;
    this.libraryWriteBlocked = false;
    this.lastError = null;
    this.lastWarning = null;
    this.preservedTemplates = [];
    this.quarantineBackupTemplates = [];
    if (!this.storage || typeof this.storage.getItem !== "function") return [];
    const texts = [];
    try {
      texts.push({ key: this.key, text: this.storage.getItem(this.key) });
      texts.push({ key: this.quarantineKey, text: this.storage.getItem(this.quarantineKey) });
    } catch (error) {
      this.lastError = { code: "storage-read-failed", error };
      this.libraryWriteBlocked = true;
      return [];
    }
    try {
      const active = [];
      const preserved = [];
      const quarantineBackup = [];
      const seen = new Map();
      let quarantineFailure = null;
      for (const { key, text } of texts) {
        if (text === null || text === "") continue;
        const activeStart = active.length;
        const preservedStart = preserved.length;
        const backupStart = quarantineBackup.length;
        try {
          if (typeof text !== "string" || utf8Length(text) > MAX_TEMPLATE_LIBRARY_JSON_BYTES) {
            fail("stored-library-too-large", key, "Stored template library exceeds its safe size limit.");
          }
          const envelope = parseEnvelope(text);
          envelope.templates.forEach((template, index) => {
            const path = `${key}.templates[${index}]`;
            const id = isRecord(template) && typeof template.id === "string" ? template.id : "";
            if (!id) fail("invalid-id", `${path}.id`, "Stored template id is invalid.");
            const fingerprint = JSON.stringify(template);
            const previous = seen.get(id);
            // The main active library has already passed strict validation. A
            // leftover quarantine copy can therefore be ignored before parsing,
            // including after an interrupted cleanup of an older schema.
            if (previous
              && key === this.quarantineKey
              && previous.key === this.key
              && previous.isCompatible) return;
            let normalized;
            let isCompatible = true;
            try {
              normalized = assertTemplateForResolver(template, this.resolveModule);
            } catch (error) {
              if (!(error instanceof TemplateValidationError)
                || !["module-version-mismatch", "unknown-module"].includes(error.code)) throw error;
              normalized = preserveOpaqueTemplate(template, index);
              isCompatible = false;
            }
            if (key === this.quarantineKey) quarantineBackup.push(normalized);
            if (previous) {
              if (previous.fingerprint === fingerprint) return;
              // The active library is authoritative after an interrupted
              // two-key write. This keeps the compatible replacement usable
              // while the stale quarantine copy remains recoverable.
              fail("duplicate-template-id", `${path}.id`, "Stored template ids must be unique.");
            }
            seen.set(id, { fingerprint, key, isCompatible });
            if (isCompatible) active.push(normalized);
            else preserved.push(normalized);
          });
          if (active.length > MAX_STORED_TEMPLATES || preserved.length > MAX_STORED_TEMPLATES) {
            fail("invalid-template-count", "templateLibrary.templates", `Each template library may contain at most ${MAX_STORED_TEMPLATES} templates.`);
          }
        } catch (error) {
          if (key !== this.quarantineKey) throw error;
          active.length = activeStart;
          preserved.length = preservedStart;
          quarantineBackup.length = backupStart;
          for (const [id, metadata] of seen) {
            if (metadata.key === this.quarantineKey) seen.delete(id);
          }
          quarantineFailure = error;
          this.libraryWriteBlocked = true;
        }
      }
      this.preservedTemplates = preserved;
      this.quarantineBackupTemplates = quarantineBackup;
      if (quarantineFailure) {
        this.lastWarning = {
          code: "quarantine-library-invalid",
          reason: quarantineFailure instanceof TemplateValidationError
            ? quarantineFailure.code
            : "stored-library-invalid",
          error: quarantineFailure,
        };
      } else if (preserved.length) {
        this.lastWarning = { code: "incompatible-templates-preserved", count: preserved.length };
      }
      return active;
    } catch (error) {
      this.preservedTemplates = [];
      this.quarantineBackupTemplates = [];
      this.libraryWriteBlocked = true;
      this.lastError = {
        code: error instanceof TemplateValidationError ? error.code : "stored-library-invalid",
        error,
      };
      return [];
    }
  }

  save(templates, { dropIds = [] } = {}) {
    if (!this.loaded) this.load();
    if (this.libraryWriteBlocked) {
      this.lastError ||= { code: "quarantine-library-invalid" };
      return false;
    }
    this.lastError = null;
    const dropped = new Set(dropIds);
    try {
      const activeEnvelope = JSON.parse(exportTemplateLibraryJson(templates, this.resolveModule, { space: 0 }));
      const activeIds = new Set(activeEnvelope.templates.map((template) => template.id));
      const preserved = this.preservedTemplates.filter((template) => (
        !dropped.has(template.id) && !activeIds.has(template.id)
      ));
      const safetyUnion = new Map();
      this.quarantineBackupTemplates.forEach((template) => safetyUnion.set(template.id, template));
      preserved.forEach((template) => safetyUnion.set(template.id, template));
      if (safetyUnion.size > MAX_STORED_TEMPLATES) {
        fail("invalid-template-count", "templateLibrary.quarantine", `A quarantine may contain at most ${MAX_STORED_TEMPLATES} templates.`);
      }
      const activeText = `${JSON.stringify(activeEnvelope)}\n`;
      const quarantineText = `${JSON.stringify({
        kind: TEMPLATE_LIBRARY_KIND,
        formatVersion: TEMPLATE_LIBRARY_FORMAT_VERSION,
        templates: preserved,
      })}\n`;
      const safetyQuarantineText = `${JSON.stringify({
        kind: TEMPLATE_LIBRARY_KIND,
        formatVersion: TEMPLATE_LIBRARY_FORMAT_VERSION,
        templates: Array.from(safetyUnion.values()),
      })}\n`;
      if (utf8Length(activeText) > MAX_TEMPLATE_LIBRARY_JSON_BYTES
        || utf8Length(quarantineText) > MAX_TEMPLATE_LIBRARY_JSON_BYTES
        || utf8Length(safetyQuarantineText) > MAX_TEMPLATE_LIBRARY_JSON_BYTES) {
        fail("json-too-large", "templateLibrary", `A template library exceeds ${MAX_TEMPLATE_LIBRARY_JSON_BYTES} bytes.`);
      }
      if (!this.storage || typeof this.storage.setItem !== "function") {
        this.lastError = { code: "storage-unavailable" };
        return false;
      }
      // Three-phase localStorage commit: first preserve a safe union, then
      // publish the active library, and only then remove recovered/replaced
      // quarantine copies. A failure can leave a recoverable duplicate, but
      // can never erase the sole copy of a template.
      this.storage.setItem(this.quarantineKey, safetyQuarantineText);
      this.storage.setItem(this.key, activeText);
      this.storage.setItem(this.quarantineKey, quarantineText);
      this.preservedTemplates = preserved;
      this.quarantineBackupTemplates = preserved;
      this.loaded = true;
      this.libraryWriteBlocked = false;
      this.lastWarning = preserved.length
        ? { code: "incompatible-templates-preserved", count: preserved.length }
        : null;
      return true;
    } catch (error) {
      this.lastError = {
        code: error instanceof TemplateValidationError ? error.code : "storage-write-failed",
        error,
      };
      return false;
    }
  }

  upsert(template, { replaceExisting = true } = {}) {
    const normalized = assertTemplateForResolver(template, this.resolveModule);
    const existing = this.load();
    if (this.lastError) return false;
    const index = existing.findIndex((item) => item.id === normalized.id);
    if (index >= 0 && !replaceExisting) {
      this.lastError = { code: "template-exists" };
      return false;
    }
    const next = [...existing];
    if (index >= 0) next[index] = normalized;
    else next.push(normalized);
    return this.save(next, { dropIds: [normalized.id] });
  }

  remove(id) {
    const existing = this.load();
    if (this.lastError) return false;
    const next = existing.filter((template) => template.id !== id);
    return this.save(next, { dropIds: [id] });
  }
}
