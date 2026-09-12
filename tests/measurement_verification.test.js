import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMeasurementVerification,
  invalidateMeasurementVerification,
  sanitizeMeasurementVerification,
  sanitizeMeasurementVerificationForSchema,
  withMeasurementVerification,
} from "../src/core/validate/measurementVerification.js";

const schema = {
  fields: [
    { key: "bust", code: "OG", min: 68, max: 160, step: 0.5 },
    { key: "waist", code: "OT", min: 48, max: 150, step: 0.5 },
    { key: "optional", step: 0.5, requiresRepeat: false },
  ],
};

test("measurement verification requires a method and a matching repeat", () => {
  const measurements = { bust: 92, waist: 72, optional: 10 };
  const incomplete = evaluateMeasurementVerification(schema, measurements, {
    repeated: { bust: 92, waist: 72 },
  });
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.confirmedCount, 2);
  assert.equal(incomplete.total, 2);

  const verified = evaluateMeasurementVerification(schema, measurements, {
    method: "helper",
    repeated: { bust: 92.5, waist: 71.5, optional: 999 },
  });
  assert.equal(verified.status, "verified");
  assert.equal(verified.verified, true);
});

test("a difference above field tolerance is a mismatch", () => {
  const result = evaluateMeasurementVerification(schema, { bust: 92, waist: 72 }, {
    method: "self",
    repeated: { bust: 92.51, waist: 72 },
  });
  assert.equal(result.status, "mismatch");
  assert.deepEqual(result.mismatchKeys, ["bust"]);
});

test("a repeat outside the measurement range never verifies a boundary value", () => {
  const result = evaluateMeasurementVerification(schema, { bust: 68, waist: 48 }, {
    method: "helper",
    repeated: { bust: 67.5, waist: 48 },
  });
  assert.equal(result.status, "mismatch");
  assert.deepEqual(result.mismatchKeys, ["bust"]);
  assert.equal(result.checks[0].repeatedValue, 67.5);
  assert.equal(result.checks[0].repeatedInRange, false);
});

test("changing a primary value invalidates an earlier repeat", () => {
  const record = { method: "self", repeated: { bust: 92, waist: 72 } };
  assert.equal(evaluateMeasurementVerification(schema, { bust: 92, waist: 72 }, record).verified, true);
  const invalidated = invalidateMeasurementVerification(schema, record, "bust");
  assert.deepEqual(invalidated.repeated, { waist: 72 });
  assert.equal(evaluateMeasurementVerification(schema, { bust: 92.5, waist: 72 }, invalidated).status, "incomplete");
});

test("schema sanitizing drops unrelated repeat keys and bounds the record", () => {
  const repeated = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`extra-${index}`, index + 1]));
  repeated.bust = 92;
  repeated.waist = 72;
  assert.deepEqual(sanitizeMeasurementVerificationForSchema(schema, {
    method: "helper",
    repeated: { bust: 92, waist: 72, unrelated: 999 },
  }), {
    method: "helper",
    repeated: { bust: 92, waist: 72 },
  });
  assert.ok(Object.keys(sanitizeMeasurementVerification({ repeated }).repeated).length <= 64);
});

test("unsafe and malformed persisted values are discarded", () => {
  const source = JSON.parse('{"method":"unknown","repeated":{"bust":"92.5","bad":-1,"__proto__":93}}');
  assert.deepEqual(sanitizeMeasurementVerification(source), {
    method: null,
    repeated: { bust: 92.5 },
  });
  assert.doesNotThrow(() => sanitizeMeasurementVerification({
    method: "self",
    repeated: {
      bust: true,
      waist: { valueOf() { throw new Error("must not execute"); } },
    },
  }));
  assert.deepEqual(sanitizeMeasurementVerification({ repeated: { bust: true } }).repeated, {});
});

test("export metadata contains only a verification summary", () => {
  const draft = { meta: { moduleId: "panties_basic" }, paths: { cut: {} } };
  const enriched = withMeasurementVerification(draft, {
    status: "verified",
    method: "helper",
    confirmedCount: 7,
    total: 7,
    record: { repeated: { waist: 72 } },
  });
  assert.equal(enriched.meta.measurementVerification.status, "verified");
  assert.equal(enriched.meta.measurementVerification.method, "helper");
  assert.equal("record" in enriched.meta.measurementVerification, false);
  assert.equal(draft.meta.measurementVerification, undefined);
});
