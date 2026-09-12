const METHOD_SET = new Set(["self", "helper"]);
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeKey(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 128
    && !UNSAFE_KEYS.has(value);
}

/**
 * Keeps only the small, local-only record needed to compare a second
 * measurement with the value used by the drafting engine.
 */
export function sanitizeMeasurementVerification(raw) {
  const source = isPlainRecord(raw) ? raw : {};
  const repeatedSource = isPlainRecord(source.repeated) ? source.repeated : {};
  const repeated = {};
  Object.entries(repeatedSource).forEach(([key, value]) => {
    if (Object.keys(repeated).length >= 64) return;
    if (typeof value !== "number" && typeof value !== "string") return;
    if (typeof value === "string" && !value.trim()) return;
    const number = Number(value);
    if (safeKey(key) && Number.isFinite(number) && number > 0) repeated[key] = number;
  });
  return {
    method: METHOD_SET.has(source.method) ? source.method : null,
    repeated,
  };
}

export function measurementVerificationFields(schema = {}) {
  return (Array.isArray(schema.fields) ? schema.fields : [])
    .filter((field) => field?.requiresRepeat !== false);
}

/** Removes repeat values that do not belong to the active pattern schema. */
export function sanitizeMeasurementVerificationForSchema(schema = {}, raw = {}) {
  const record = sanitizeMeasurementVerification(raw);
  const allowed = new Set(measurementVerificationFields(schema).map((field) => field.key));
  return {
    method: record.method,
    repeated: Object.fromEntries(
      Object.entries(record.repeated).filter(([key]) => allowed.has(key)),
    ),
  };
}

/** Invalidates one repeat after any edit of its primary measurement. */
export function invalidateMeasurementVerification(schema = {}, raw = {}, key) {
  const record = sanitizeMeasurementVerificationForSchema(schema, raw);
  if (typeof key !== "string" || !Object.hasOwn(record.repeated, key)) return record;
  const repeated = { ...record.repeated };
  delete repeated[key];
  return { ...record, repeated };
}

function toleranceFor(field) {
  const explicit = Number(field?.repeatTolerance);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const step = Number(field?.step);
  return Number.isFinite(step) && step > 0 ? step : 0.5;
}

/**
 * A repeat confirms consistency, not anatomical accuracy. The function is
 * deliberately pure so changing a primary measurement automatically makes a
 * previously entered repeat stale without silently rewriting either value.
 */
export function evaluateMeasurementVerification(schema, measurements = {}, raw = {}) {
  const fields = measurementVerificationFields(schema);
  const record = sanitizeMeasurementVerificationForSchema(schema, raw);
  const checks = fields.map((field) => {
    const original = Number(measurements?.[field.key]);
    const repeated = Number(record.repeated[field.key]);
    const tolerance = toleranceFor(field);
    const hasOriginal = Number.isFinite(original) && original > 0;
    const hasRepeatedValue = Number.isFinite(repeated) && repeated > 0;
    const repeatedInRange = hasRepeatedValue
      && (!Number.isFinite(Number(field.min)) || repeated >= Number(field.min))
      && (!Number.isFinite(Number(field.max)) || repeated <= Number(field.max));
    const hasRepeated = hasRepeatedValue && repeatedInRange;
    const difference = hasOriginal && hasRepeated ? Math.abs(original - repeated) : null;
    const status = hasRepeatedValue && !repeatedInRange
      ? "mismatch"
      : !hasOriginal || !hasRepeated
      ? "missing"
      : difference <= tolerance + Number.EPSILON
        ? "confirmed"
        : "mismatch";
    return {
      key: field.key,
      code: field.code || field.key,
      original: hasOriginal ? original : null,
      repeated: hasRepeated ? repeated : null,
      repeatedValue: hasRepeatedValue ? repeated : null,
      repeatedInRange,
      tolerance,
      difference,
      status,
    };
  });
  const mismatches = checks.filter((check) => check.status === "mismatch");
  const missing = checks.filter((check) => check.status === "missing");
  const confirmedCount = checks.filter((check) => check.status === "confirmed").length;
  const methodConfirmed = METHOD_SET.has(record.method);
  const status = mismatches.length
    ? "mismatch"
    : methodConfirmed && !missing.length && checks.length > 0
      ? "verified"
      : "incomplete";

  return {
    status,
    verified: status === "verified",
    method: record.method,
    methodConfirmed,
    total: checks.length,
    confirmedCount,
    missingKeys: missing.map((check) => check.key),
    mismatchKeys: mismatches.map((check) => check.key),
    checks,
    record,
  };
}

/** Adds a non-sensitive verification summary to physical export metadata. */
export function withMeasurementVerification(draft, evaluation) {
  if (!draft || typeof draft !== "object") return draft;
  const safeEvaluation = evaluation && typeof evaluation === "object" ? evaluation : {};
  return {
    ...draft,
    meta: {
      ...(draft.meta || {}),
      measurementVerification: {
        status: safeEvaluation.status === "verified"
          ? "verified"
          : safeEvaluation.status === "mismatch"
            ? "mismatch"
            : "incomplete",
        method: METHOD_SET.has(safeEvaluation.method) ? safeEvaluation.method : null,
        confirmedCount: Number.isSafeInteger(safeEvaluation.confirmedCount)
          ? safeEvaluation.confirmedCount
          : 0,
        total: Number.isSafeInteger(safeEvaluation.total) ? safeEvaluation.total : 0,
      },
    },
  };
}
