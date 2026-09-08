const SUPPORTED_UNITS = new Set(["mm", "cm", "in"]);

export const PatternBatchMethod = Object.freeze({
  INDIVIDUAL_REDRAFT: "individual-redraft",
  MEASUREMENT_RULE_REDRAFT: "measurement-rule-redraft",
});

export class PatternBatchValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "PatternBatchValidationError";
    this.issues = issues;
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PatternBatchValidationError(`${label} must be an object.`, [label]);
  }
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clonePlain(item)]));
  }
  return value;
}

function assertFiniteTree(value, path) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new PatternBatchValidationError(`${path} must be finite.`, [path]);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteTree(item, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => assertFiniteTree(item, `${path}.${key}`));
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizedId(value, label) {
  const id = String(value ?? "").trim();
  if (!id) {
    throw new PatternBatchValidationError(`${label} must have a non-empty id.`, [`${label}.id`]);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) {
    throw new PatternBatchValidationError(
      `${label}.id may contain only Latin letters, digits, dot, underscore, and hyphen.`,
      [`${label}.id`],
    );
  }
  return id;
}

function moduleDescriptor(patternModule) {
  if (!patternModule || typeof patternModule !== "object") {
    throw new PatternBatchValidationError("A pattern module is required.", ["module"]);
  }
  if (typeof patternModule.draft !== "function") {
    throw new PatternBatchValidationError("The pattern module must provide draft().", ["module.draft"]);
  }
  const schema = patternModule.schema;
  if (!schema || typeof schema !== "object") {
    throw new PatternBatchValidationError("The pattern module must provide a schema.", ["module.schema"]);
  }
  const unit = schema.unit;
  if (!SUPPORTED_UNITS.has(unit)) {
    throw new PatternBatchValidationError(`Unsupported or missing schema unit: ${String(unit)}.`, ["module.schema.unit"]);
  }
  return {
    id: String(patternModule.id || schema.id || "pattern"),
    version: String(patternModule.version || "0.0.0"),
    schema,
    unit,
  };
}

function measurementFields(schema) {
  return Array.isArray(schema.fields) ? schema.fields.filter((field) => field?.key) : [];
}

function canonicalizeOptions(schema, options) {
  const result = { ...options };
  (Array.isArray(schema.options) ? schema.options : []).forEach((option) => {
    const value = result[option.key];
    const exact = (option.choices || []).find((choice) => Object.is(choice.value, value));
    const compatible = exact || (option.choices || []).find((choice) => String(choice.value) === String(value));
    if (compatible) result[option.key] = compatible.value;
  });
  return result;
}

function localizedMessage(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(localizedMessage).filter(Boolean).join("; ");
  if (value && typeof value === "object") return value.en || value.ru || stableStringify(value);
  return String(value ?? "Invalid value");
}

function validateMeasurements(schema, measurements, options, path) {
  assertPlainObject(measurements, `${path}.measurements`);
  assertPlainObject(options, `${path}.options`);
  assertFiniteTree(measurements, `${path}.measurements`);
  assertFiniteTree(options, `${path}.options`);

  const issues = [];
  const measurementKeys = new Set(measurementFields(schema).map((field) => field.key));
  Object.keys(measurements).forEach((key) => {
    if (!measurementKeys.has(key)) issues.push(`${path}.measurements.${key}: unknown measurement`);
  });
  const optionDefinitions = Array.isArray(schema.options) ? schema.options.filter((option) => option?.key) : [];
  const optionKeys = new Set(optionDefinitions.map((option) => option.key));
  Object.keys(options).forEach((key) => {
    if (!optionKeys.has(key)) issues.push(`${path}.options.${key}: unknown option`);
  });
  optionDefinitions.forEach((option) => {
    const value = options[option.key];
    const allowed = (option.choices || []).some((choice) => Object.is(choice.value, value));
    if (!allowed) issues.push(`${path}.options.${option.key}: unsupported choice ${String(value)}`);
  });
  measurementFields(schema).forEach((field) => {
    const value = measurements[field.key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push(`${path}.measurements.${field.key}: a finite number is required`);
      return;
    }
    if (Number.isFinite(field.min) && value < field.min) {
      issues.push(`${path}.measurements.${field.key}: minimum is ${field.min}`);
    }
    if (Number.isFinite(field.max) && value > field.max) {
      issues.push(`${path}.measurements.${field.key}: maximum is ${field.max}`);
    }
  });

  if (typeof schema.validate === "function") {
    const schemaErrors = schema.validate({ ...measurements, ...options }) || {};
    Object.entries(schemaErrors).forEach(([key, messages]) => {
      const message = localizedMessage(messages);
      if (message) issues.push(`${path}.${key}: ${message}`);
    });
  }

  if (issues.length) {
    throw new PatternBatchValidationError(`Invalid pattern variant ${path}.`, issues);
  }
}

function deterministicManifest({ module, method, variants, source }) {
  const value = stableValue({
    schemaVersion: 1,
    moduleId: module.id,
    moduleVersion: module.version,
    unit: module.unit,
    method,
    source,
    variants: variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      measurements: variant.measurements,
      options: variant.options,
      adjustments: variant.adjustments,
      provenance: variant.provenance,
    })),
  });
  return {
    ...value,
    digest: `fnv1a-${fnv1a(stableStringify(value))}`,
  };
}

function methodNotice(method) {
  if (method === PatternBatchMethod.INDIVIDUAL_REDRAFT) {
    return {
      ru: "Каждый вариант заново построен по индивидуальному профилю мерок. Это не промышленная градация от базового размера.",
      en: "Each variant was freshly drafted from an individual measurement profile. This is not industrial grading from a base size.",
    };
  }
  return {
    ru: "Размеры заново построены после применения числовых прибавок к меркам. Это размерный ряд по правилам, но не промышленная поточечная градация и не подтверждённый производственный стандарт.",
    en: "Sizes were freshly drafted after applying measurement increments. This is a rule-based size set, not industrial point grading or a verified production standard.",
  };
}

function adjustmentDefaults(schema) {
  return Object.fromEntries(
    (Array.isArray(schema.adjustments) ? schema.adjustments : [])
      .filter((adjustment) => adjustment?.key)
      .map((adjustment) => [adjustment.key, adjustment.default ?? 0]),
  );
}

function validateAdjustments(schema, adjustments, path) {
  assertPlainObject(adjustments, `${path}.adjustments`);
  assertFiniteTree(adjustments, `${path}.adjustments`);
  const definitions = Array.isArray(schema.adjustments) ? schema.adjustments : [];
  const byKey = new Map(definitions.filter((definition) => definition?.key).map((definition) => [definition.key, definition]));
  const issues = [];
  Object.entries(adjustments).forEach(([key, value]) => {
    const definition = byKey.get(key);
    if (!definition) {
      issues.push(`${path}.adjustments.${key}: unknown adjustment`);
      return;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push(`${path}.adjustments.${key}: a finite number is required`);
      return;
    }
    if (Number.isFinite(definition.min) && value < definition.min) {
      issues.push(`${path}.adjustments.${key}: minimum is ${definition.min}`);
    }
    if (Number.isFinite(definition.max) && value > definition.max) {
      issues.push(`${path}.adjustments.${key}: maximum is ${definition.max}`);
    }
  });
  if (issues.length) throw new PatternBatchValidationError(`Invalid adjustments for ${path}.`, issues);
}

function draftVariant(patternModule, descriptor, id, name, measurements, options, adjustments, provenance) {
  validateMeasurements(descriptor.schema, measurements, options, `variants.${id}`);
  validateAdjustments(descriptor.schema, adjustments, `variants.${id}`);
  const draft = patternModule.draft(
    clonePlain(measurements),
    clonePlain(options),
    clonePlain(adjustments),
  );
  if (!draft || typeof draft !== "object") {
    throw new PatternBatchValidationError(`draft() returned no draft for ${id}.`, [`variants.${id}.draft`]);
  }
  draft.meta = {
    ...(draft.meta || {}),
    batchVariant: {
      id,
      method: provenance.method,
      industrialPointGrade: false,
      productionQualified: false,
      adjustments: clonePlain(adjustments),
    },
  };
  return {
    id,
    name,
    measurements: clonePlain(measurements),
    options: clonePlain(options),
    adjustments: clonePlain(adjustments),
    provenance,
    draft,
  };
}

function ensureUniqueIds(items, label) {
  const seen = new Set();
  items.forEach((item, index) => {
    const id = normalizedId(item?.id, `${label}[${index}]`);
    if (seen.has(id)) {
      throw new PatternBatchValidationError(`Duplicate variant id: ${id}.`, [`${label}[${index}].id`]);
    }
    seen.add(id);
  });
}

function buildResult(descriptor, method, variants, source) {
  const manifest = deterministicManifest({ module: descriptor, method, variants, source });
  return {
    schemaVersion: 1,
    moduleId: descriptor.id,
    moduleVersion: descriptor.version,
    unit: descriptor.unit,
    method,
    industrialPointGrade: false,
    productionQualified: false,
    notice: methodNotice(method),
    variants,
    manifest,
  };
}

/**
 * Deterministically drafts one independent pattern for every named measurement profile.
 * The returned batch is explicitly marked as individual redrafting, not industrial grading.
 */
export function createIndividualPatternBatch(patternModule, profiles, settings = {}) {
  const descriptor = moduleDescriptor(patternModule);
  if (!Array.isArray(profiles) || profiles.length === 0) {
    throw new PatternBatchValidationError("At least one measurement profile is required.", ["profiles"]);
  }
  ensureUniqueIds(profiles, "profiles");
  const commonOptions = {
    ...(clonePlain(descriptor.schema.optionDefaults || {})),
    ...(clonePlain(settings.commonOptions || {})),
  };
  const commonAdjustments = {
    ...adjustmentDefaults(descriptor.schema),
    ...(clonePlain(settings.commonAdjustments || {})),
  };
  assertPlainObject(commonOptions, "settings.commonOptions");
  assertPlainObject(commonAdjustments, "settings.commonAdjustments");
  assertFiniteTree(commonOptions, "settings.commonOptions");
  assertFiniteTree(commonAdjustments, "settings.commonAdjustments");

  const variants = profiles.map((profile, index) => {
    assertPlainObject(profile, `profiles[${index}]`);
    const id = normalizedId(profile.id, `profiles[${index}]`);
    const measurements = clonePlain(profile.measurements);
    const options = canonicalizeOptions(descriptor.schema, { ...commonOptions, ...(clonePlain(profile.options || {})) });
    const adjustments = { ...commonAdjustments, ...(clonePlain(profile.adjustments || {})) };
    return draftVariant(
      patternModule,
      descriptor,
      id,
      String(profile.name || id),
      measurements,
      options,
      adjustments,
      {
        method: PatternBatchMethod.INDIVIDUAL_REDRAFT,
        profileId: id,
        source: "named-measurement-profile",
        adjustments: clonePlain(adjustments),
      },
    );
  });

  return buildResult(descriptor, PatternBatchMethod.INDIVIDUAL_REDRAFT, variants, {
    kind: "named-measurement-profiles",
  });
}

/**
 * Applies explicit measurement increments to one base profile, then redrafts every size.
 * This is intentionally not labelled as point grading: current Path objects do not carry
 * stable construction-point ids or a certified grade-rule table.
 */
export function createRuleBasedSizeBatch(patternModule, specification, settings = {}) {
  const descriptor = moduleDescriptor(patternModule);
  assertPlainObject(specification, "specification");
  const baseProfile = specification.baseProfile;
  assertPlainObject(baseProfile, "specification.baseProfile");
  const baseId = normalizedId(baseProfile.id || "base", "specification.baseProfile");
  const baseMeasurements = clonePlain(baseProfile.measurements);
  const sizes = specification.sizes;
  if (!Array.isArray(sizes) || sizes.length === 0) {
    throw new PatternBatchValidationError("At least one named size rule is required.", ["specification.sizes"]);
  }
  ensureUniqueIds(sizes, "specification.sizes");
  const commonOptions = {
    ...(clonePlain(descriptor.schema.optionDefaults || {})),
    ...(clonePlain(baseProfile.options || {})),
    ...(clonePlain(settings.commonOptions || {})),
  };
  const commonAdjustments = {
    ...adjustmentDefaults(descriptor.schema),
    ...(clonePlain(baseProfile.adjustments || {})),
    ...(clonePlain(settings.commonAdjustments || {})),
  };
  assertPlainObject(baseMeasurements, "specification.baseProfile.measurements");
  assertPlainObject(commonOptions, "settings.commonOptions");
  assertPlainObject(commonAdjustments, "settings.commonAdjustments");
  assertFiniteTree(baseMeasurements, "specification.baseProfile.measurements");
  assertFiniteTree(commonOptions, "settings.commonOptions");
  assertFiniteTree(commonAdjustments, "settings.commonAdjustments");

  const ruleId = normalizedId(specification.ruleId || "custom-measurement-rule", "specification.ruleId");
  const measurementKeys = new Set(measurementFields(descriptor.schema).map((field) => field.key));
  const variants = sizes.map((size, index) => {
    assertPlainObject(size, `specification.sizes[${index}]`);
    assertPlainObject(size.deltas || {}, `specification.sizes[${index}].deltas`);
    assertFiniteTree(size.deltas || {}, `specification.sizes[${index}].deltas`);
    const nonNumericKeys = Object.entries(size.deltas || {})
      .filter(([, value]) => typeof value !== "number" || !Number.isFinite(value))
      .map(([key]) => key);
    if (nonNumericKeys.length) {
      throw new PatternBatchValidationError(
        `Measurement deltas in size ${size.id} must be finite numbers.`,
        nonNumericKeys.map((key) => `specification.sizes[${index}].deltas.${key}`),
      );
    }
    const unknownKeys = Object.keys(size.deltas || {}).filter((key) => !measurementKeys.has(key));
    if (unknownKeys.length) {
      throw new PatternBatchValidationError(
        `Unknown measurement keys in size ${size.id}: ${unknownKeys.join(", ")}.`,
        unknownKeys.map((key) => `specification.sizes[${index}].deltas.${key}`),
      );
    }
    const id = normalizedId(size.id, `specification.sizes[${index}]`);
    const deltas = clonePlain(size.deltas || {});
    const measurements = Object.fromEntries(
      Object.entries(baseMeasurements).map(([key, value]) => [key, value + (deltas[key] || 0)]),
    );
    const options = canonicalizeOptions(descriptor.schema, { ...commonOptions, ...(clonePlain(size.options || {})) });
    const adjustments = { ...commonAdjustments, ...(clonePlain(size.adjustments || {})) };
    return draftVariant(
      patternModule,
      descriptor,
      id,
      String(size.name || id),
      measurements,
      options,
      adjustments,
      {
        method: PatternBatchMethod.MEASUREMENT_RULE_REDRAFT,
        baseProfileId: baseId,
        ruleId,
        measurementDeltas: deltas,
        adjustments: clonePlain(adjustments),
        source: "explicit-measurement-increments",
      },
    );
  });

  return buildResult(descriptor, PatternBatchMethod.MEASUREMENT_RULE_REDRAFT, variants, {
    kind: "measurement-rule",
    baseProfileId: baseId,
    ruleId,
  });
}

/** Returns a stable, draft-free JSON payload suitable for project files and audit logs. */
export function serializePatternBatchManifest(batch, space = 2) {
  if (!batch?.manifest) {
    throw new PatternBatchValidationError("A generated pattern batch is required.", ["batch.manifest"]);
  }
  return JSON.stringify(stableValue(batch.manifest), null, space);
}
