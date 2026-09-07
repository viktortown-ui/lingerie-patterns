const MODULE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SCHEMA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const SUPPORTED_SCHEMA_UNITS = new Set(["mm", "cm", "in"]);

export const PATTERN_MODULE_STATUSES = Object.freeze([
  "draft",
  "experimental",
  "ready-for-toile",
]);

const STATUS_SET = new Set(PATTERN_MODULE_STATUSES);

export class PatternModuleValidationError extends TypeError {
  constructor(message, path = "module") {
    super(`${path}: ${message}`);
    this.name = "PatternModuleValidationError";
    this.path = path;
  }
}

function fail(message, path) {
  throw new PatternModuleValidationError(message, path);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainObject(value, path) {
  if (!isPlainObject(value)) fail("must be a plain object", path);
}

function requireNonEmptyString(value, path) {
  if (typeof value !== "string" || !value.trim()) fail("must be a non-empty string", path);
}

function requireLocalizedText(value, path) {
  if (typeof value === "string") {
    requireNonEmptyString(value, path);
    return;
  }
  requirePlainObject(value, path);
  const translations = [value.ru, value.en].filter((item) => typeof item === "string" && item.trim());
  if (!translations.length) fail("must contain a non-empty ru or en translation", path);
}

function requireFiniteNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail("must be a finite number", path);
}

function requireKey(value, path) {
  requireNonEmptyString(value, path);
  if (!SCHEMA_KEY_PATTERN.test(value)) {
    fail("must start with a Latin letter and contain only Latin letters, digits, dot, underscore, or hyphen", path);
  }
}

function valueIdentity(value) {
  return `${typeof value}:${String(value)}`;
}

function validateSections(schema) {
  if (schema.sections == null) return new Set();
  if (!Array.isArray(schema.sections) || !schema.sections.length) {
    fail("must be a non-empty array when provided", "module.schema.sections");
  }
  const ids = new Set();
  schema.sections.forEach((section, index) => {
    const path = `module.schema.sections[${index}]`;
    requirePlainObject(section, path);
    requireKey(section.id, `${path}.id`);
    if (ids.has(section.id)) fail(`duplicate section id ${section.id}`, `${path}.id`);
    ids.add(section.id);
    requireLocalizedText(section.title, `${path}.title`);
  });
  return ids;
}

function validateSectionReference(section, sectionIds, path) {
  if (section == null) return;
  requireKey(section, path);
  if (!sectionIds.size) fail("cannot be used when schema.sections is omitted", path);
  if (!sectionIds.has(section)) {
    fail(`references unknown section ${section}`, path);
  }
}

function validateFields(schema, sectionIds, allKeys) {
  if (!Array.isArray(schema.fields) || !schema.fields.length) {
    fail("must be a non-empty array", "module.schema.fields");
  }
  requirePlainObject(schema.defaults, "module.schema.defaults");

  schema.fields.forEach((field, index) => {
    const path = `module.schema.fields[${index}]`;
    requirePlainObject(field, path);
    requireKey(field.key, `${path}.key`);
    if (allKeys.has(field.key)) fail(`duplicate schema key ${field.key}`, `${path}.key`);
    allKeys.add(field.key);
    requireLocalizedText(field.label, `${path}.label`);
    validateSectionReference(field.section, sectionIds, `${path}.section`);
    requireFiniteNumber(field.min, `${path}.min`);
    requireFiniteNumber(field.max, `${path}.max`);
    if (field.min >= field.max) fail("min must be less than max", path);
    if (field.step != null) {
      requireFiniteNumber(field.step, `${path}.step`);
      if (field.step <= 0) fail("must be greater than zero", `${path}.step`);
    }
    if (!Object.prototype.hasOwnProperty.call(schema.defaults, field.key)) {
      fail(`missing default for ${field.key}`, "module.schema.defaults");
    }
    const defaultValue = schema.defaults[field.key];
    requireFiniteNumber(defaultValue, `module.schema.defaults.${field.key}`);
    if (defaultValue < field.min || defaultValue > field.max) {
      fail(`must be between ${field.min} and ${field.max}`, `module.schema.defaults.${field.key}`);
    }
  });

  const fieldKeys = new Set(schema.fields.map((field) => field.key));
  Object.keys(schema.defaults).forEach((key) => {
    if (!fieldKeys.has(key)) fail(`contains unknown field ${key}`, `module.schema.defaults.${key}`);
  });
}

function validateChoiceValue(value, path) {
  if (!["string", "number", "boolean"].includes(typeof value)) {
    fail("must be a string, finite number, or boolean", path);
  }
  if (typeof value === "number" && !Number.isFinite(value)) fail("must be finite", path);
}

function validateOptions(schema, sectionIds, allKeys) {
  const options = schema.options ?? [];
  if (!Array.isArray(options)) fail("must be an array", "module.schema.options");
  if (options.length) requirePlainObject(schema.optionDefaults, "module.schema.optionDefaults");
  if (schema.optionDefaults != null) requirePlainObject(schema.optionDefaults, "module.schema.optionDefaults");

  const optionKeys = new Set();
  options.forEach((option, index) => {
    const path = `module.schema.options[${index}]`;
    requirePlainObject(option, path);
    requireKey(option.key, `${path}.key`);
    if (allKeys.has(option.key)) fail(`duplicate schema key ${option.key}`, `${path}.key`);
    allKeys.add(option.key);
    optionKeys.add(option.key);
    requireLocalizedText(option.label, `${path}.label`);
    validateSectionReference(option.section, sectionIds, `${path}.section`);
    if (!Array.isArray(option.choices) || !option.choices.length) {
      fail("must be a non-empty array", `${path}.choices`);
    }
    const choiceValues = new Set();
    option.choices.forEach((choice, choiceIndex) => {
      const choicePath = `${path}.choices[${choiceIndex}]`;
      requirePlainObject(choice, choicePath);
      requireLocalizedText(choice.label, `${choicePath}.label`);
      validateChoiceValue(choice.value, `${choicePath}.value`);
      const identity = valueIdentity(choice.value);
      if (choiceValues.has(identity)) fail("contains a duplicate choice value", `${choicePath}.value`);
      choiceValues.add(identity);
    });
    if (!Object.prototype.hasOwnProperty.call(option, "default")) fail("is required", `${path}.default`);
    validateChoiceValue(option.default, `${path}.default`);
    if (!choiceValues.has(valueIdentity(option.default))) {
      fail("must equal one of the option choices", `${path}.default`);
    }
    if (!Object.prototype.hasOwnProperty.call(schema.optionDefaults || {}, option.key)) {
      fail(`missing default for ${option.key}`, "module.schema.optionDefaults");
    }
    if (!Object.is(schema.optionDefaults[option.key], option.default)) {
      fail("must exactly match the option default", `module.schema.optionDefaults.${option.key}`);
    }
  });

  Object.keys(schema.optionDefaults || {}).forEach((key) => {
    if (!optionKeys.has(key)) fail(`contains unknown option ${key}`, `module.schema.optionDefaults.${key}`);
  });
}

function validateAdjustments(schema, allKeys) {
  const adjustments = schema.adjustments ?? [];
  if (!Array.isArray(adjustments)) fail("must be an array", "module.schema.adjustments");
  if (schema.adjustmentDefaults != null) {
    requirePlainObject(schema.adjustmentDefaults, "module.schema.adjustmentDefaults");
  }
  const adjustmentKeys = new Set();
  adjustments.forEach((adjustment, index) => {
    const path = `module.schema.adjustments[${index}]`;
    requirePlainObject(adjustment, path);
    requireKey(adjustment.key, `${path}.key`);
    if (allKeys.has(adjustment.key)) fail(`duplicate schema key ${adjustment.key}`, `${path}.key`);
    allKeys.add(adjustment.key);
    adjustmentKeys.add(adjustment.key);
    requireLocalizedText(adjustment.label, `${path}.label`);
    requireFiniteNumber(adjustment.min, `${path}.min`);
    requireFiniteNumber(adjustment.max, `${path}.max`);
    if (adjustment.min >= adjustment.max) fail("min must be less than max", path);
    requireFiniteNumber(adjustment.step, `${path}.step`);
    if (adjustment.step <= 0) fail("must be greater than zero", `${path}.step`);
    requireFiniteNumber(adjustment.default, `${path}.default`);
    if (adjustment.default < adjustment.min || adjustment.default > adjustment.max) {
      fail(`must be between ${adjustment.min} and ${adjustment.max}`, `${path}.default`);
    }
    if (adjustment.axis != null && !["x", "y"].includes(adjustment.axis)) {
      fail("must be x or y", `${path}.axis`);
    }
    if (schema.adjustmentDefaults != null) {
      if (!Object.prototype.hasOwnProperty.call(schema.adjustmentDefaults, adjustment.key)) {
        fail(`missing default for ${adjustment.key}`, "module.schema.adjustmentDefaults");
      }
      if (!Object.is(schema.adjustmentDefaults[adjustment.key], adjustment.default)) {
        fail("must exactly match the adjustment default", `module.schema.adjustmentDefaults.${adjustment.key}`);
      }
    }
  });

  Object.keys(schema.adjustmentDefaults || {}).forEach((key) => {
    if (!adjustmentKeys.has(key)) {
      fail(`contains unknown adjustment ${key}`, `module.schema.adjustmentDefaults.${key}`);
    }
  });
}

function validateSchema(descriptor) {
  const schema = descriptor.schema;
  requirePlainObject(schema, "module.schema");
  requireNonEmptyString(schema.id, "module.schema.id");
  if (schema.id !== descriptor.id) fail("must exactly match module.id", "module.schema.id");
  requireLocalizedText(schema.name, "module.schema.name");
  requireNonEmptyString(schema.unit, "module.schema.unit");
  if (!SUPPORTED_SCHEMA_UNITS.has(schema.unit)) {
    fail("must be one of: mm, cm, in", "module.schema.unit");
  }
  if (schema.validate != null && typeof schema.validate !== "function") {
    fail("must be a function when provided", "module.schema.validate");
  }
  const sectionIds = validateSections(schema);
  const allKeys = new Set();
  validateFields(schema, sectionIds, allKeys);
  validateOptions(schema, sectionIds, allKeys);
  validateAdjustments(schema, allKeys);
}

function validateSemver(value, path) {
  requireNonEmptyString(value, path);
  const match = SEMVER_PATTERN.exec(value);
  if (!match) fail("must be a semantic version such as 1.0.0", path);
  const prerelease = match[4];
  if (prerelease?.split(".").some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) {
    fail("contains a prerelease numeric identifier with a leading zero", path);
  }
}

/** Validates either a constructor input or an already-created PatternModule. */
export function validatePatternModuleDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    fail("must be an object", "module");
  }
  requireNonEmptyString(descriptor.id, "module.id");
  if (!MODULE_ID_PATTERN.test(descriptor.id)) {
    fail("must use 1-64 Latin letters, digits, dot, underscore, or hyphen", "module.id");
  }
  requireLocalizedText(descriptor.name, "module.name");
  requireNonEmptyString(descriptor.category, "module.category");
  validateSemver(descriptor.version, "module.version");
  if (typeof descriptor.draft !== "function") fail("must be a function", "module.draft");
  if (!STATUS_SET.has(descriptor.status ?? "draft")) {
    fail(`must be one of: ${PATTERN_MODULE_STATUSES.join(", ")}`, "module.status");
  }
  if (descriptor.tags != null) {
    if (!Array.isArray(descriptor.tags)) fail("must be an array", "module.tags");
    descriptor.tags.forEach((tag, index) => requireNonEmptyString(tag, `module.tags[${index}]`));
  }
  if (descriptor.hidden != null && typeof descriptor.hidden !== "boolean") {
    fail("must be a boolean", "module.hidden");
  }
  if (descriptor.description != null) requireLocalizedText(descriptor.description, "module.description");
  validateSchema(descriptor);
  return descriptor;
}

function cloneAndFreeze(value, seen = new WeakMap()) {
  if (Array.isArray(value)) {
    if (seen.has(value)) return seen.get(value);
    const clone = [];
    seen.set(value, clone);
    value.forEach((item) => clone.push(cloneAndFreeze(item, seen)));
    return Object.freeze(clone);
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) return seen.get(value);
    const clone = Object.create(Object.getPrototypeOf(value));
    seen.set(value, clone);
    Object.entries(value).forEach(([key, item]) => {
      clone[key] = cloneAndFreeze(item, seen);
    });
    return Object.freeze(clone);
  }
  return value;
}

export class PatternModule {
  constructor({
    id,
    name,
    category,
    version,
    schema,
    draft,
    description = null,
    status = "draft",
    tags = [],
    hidden = false,
  } = {}) {
    const descriptor = {
      id,
      name,
      category,
      version,
      schema,
      draft,
      description,
      status,
      tags,
      hidden,
    };
    validatePatternModuleDescriptor(descriptor);

    this.id = id;
    this.name = cloneAndFreeze(name);
    this.category = category;
    this.version = version;
    this.schema = cloneAndFreeze(schema);
    this.draft = draft;
    this.description = cloneAndFreeze(description);
    this.status = status;
    this.tags = cloneAndFreeze(tags);
    this.hidden = hidden;
    Object.freeze(this);
  }
}
