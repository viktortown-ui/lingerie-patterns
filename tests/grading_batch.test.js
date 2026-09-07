import test from "node:test";
import assert from "node:assert/strict";
import pantiesModule from "../src/patterns/panties_basic/module.js";
import braletteModule from "../src/patterns/bralette_soft/module.js";
import {
  PatternBatchMethod,
  PatternBatchValidationError,
  createIndividualPatternBatch,
  createRuleBasedSizeBatch,
  serializePatternBatchManifest,
} from "../src/core/grading/patternBatch.js";

const defaults = { ...pantiesModule.schema.defaults };
const options = { ...pantiesModule.schema.optionDefaults };

test("individual profiles are redrafted independently and labelled honestly", () => {
  const profiles = [
    {
      id: "anna",
      name: "Анна",
      measurements: { ...defaults, waist: 68, seat: 94 },
      adjustments: { frontWaistDepth: 0.7 },
    },
    { id: "maria", name: "Мария", measurements: { ...defaults, waist: 82, seat: 108 } },
  ];
  const before = JSON.stringify(profiles);
  const first = createIndividualPatternBatch(pantiesModule, profiles, { commonOptions: options });
  const second = createIndividualPatternBatch(pantiesModule, profiles, { commonOptions: options });

  assert.equal(first.method, PatternBatchMethod.INDIVIDUAL_REDRAFT);
  assert.equal(first.industrialPointGrade, false);
  assert.equal(first.productionQualified, false);
  assert.match(first.notice.ru, /не промышленная градация/i);
  assert.deepEqual(first.variants.map((variant) => variant.id), ["anna", "maria"]);
  assert.notEqual(first.variants[0].draft, first.variants[1].draft);
  assert.equal(first.variants[0].draft.meta.batchVariant.method, PatternBatchMethod.INDIVIDUAL_REDRAFT);
  assert.equal(first.variants[0].draft.meta.batchVariant.industrialPointGrade, false);
  assert.equal(first.variants[0].adjustments.frontWaistDepth, 0.7);
  assert.equal(first.variants[0].provenance.adjustments.frontWaistDepth, 0.7);
  assert.equal(first.manifest.variants[0].adjustments.frontWaistDepth, 0.7);
  assert.equal(first.variants[0].draft.meta.engineering.adjustments.frontWaistDepth, 0.7);
  assert.equal(first.manifest.digest, second.manifest.digest);
  assert.equal(JSON.stringify(first.manifest), JSON.stringify(second.manifest));
  assert.equal(serializePatternBatchManifest(first), serializePatternBatchManifest(second));
  assert.equal(JSON.stringify(profiles), before, "source profiles must not be mutated");
  assert.ok(!serializePatternBatchManifest(first).includes('"draft"'));
});

test("manifest bytes are canonical across equivalent measurement key order", () => {
  const reversedDefaults = Object.fromEntries(Object.entries(defaults).reverse());
  const first = createIndividualPatternBatch(
    pantiesModule,
    [{ id: "M", name: "M", measurements: defaults }],
    { commonOptions: options },
  );
  const second = createIndividualPatternBatch(
    pantiesModule,
    [{ id: "M", name: "M", measurements: reversedDefaults }],
    { commonOptions: { ...options } },
  );
  assert.equal(first.manifest.digest, second.manifest.digest);
  assert.equal(JSON.stringify(first.manifest), JSON.stringify(second.manifest));
});

test("measurement rules produce a deterministic named size set without claiming point grading", () => {
  const batch = createRuleBasedSizeBatch(
    pantiesModule,
    {
      ruleId: "demo-lower-body-v1",
      baseProfile: { id: "M", measurements: defaults },
      sizes: [
        {
          id: "S",
          deltas: { waist: -4, highHip: -4, seat: -4, crossSeam: -2, crossSeamFront: -1 },
        },
        { id: "M", deltas: {} },
        {
          id: "L",
          deltas: { waist: 4, highHip: 4, seat: 4, crossSeam: 2, crossSeamFront: 1 },
        },
      ],
    },
    { commonOptions: options, commonAdjustments: { sideHeight: 0.5 } },
  );

  assert.equal(batch.method, PatternBatchMethod.MEASUREMENT_RULE_REDRAFT);
  assert.equal(batch.industrialPointGrade, false);
  assert.equal(batch.productionQualified, false);
  assert.match(batch.notice.en, /not industrial point grading/i);
  assert.deepEqual(batch.variants.map((variant) => variant.id), ["S", "M", "L"]);
  assert.equal(batch.variants[0].measurements.waist, defaults.waist - 4);
  assert.equal(batch.variants[1].measurements.waist, defaults.waist);
  assert.equal(batch.variants[2].measurements.waist, defaults.waist + 4);
  assert.equal(batch.variants[2].provenance.ruleId, "demo-lower-body-v1");
  assert.equal(batch.variants[2].adjustments.sideHeight, 0.5);
  assert.equal(batch.manifest.variants[2].adjustments.sideHeight, 0.5);
  assert.equal(batch.variants[2].draft.meta.batchVariant.productionQualified, false);
});

test("batch generation rejects duplicate ids, non-finite values, and unknown rule keys", () => {
  assert.throws(
    () =>
      createIndividualPatternBatch(
        pantiesModule,
        [
          { id: "same", measurements: defaults },
          { id: "same", measurements: defaults },
        ],
        { commonOptions: options },
      ),
    PatternBatchValidationError,
  );

  assert.throws(
    () =>
      createIndividualPatternBatch(
        pantiesModule,
        [{ id: "bad", measurements: { ...defaults, waist: Number.POSITIVE_INFINITY } }],
        { commonOptions: options },
      ),
    /must be finite/i,
  );

  assert.throws(
    () =>
      createRuleBasedSizeBatch(
        pantiesModule,
        {
          baseProfile: { id: "M", measurements: defaults },
          sizes: [{ id: "L", deltas: { imaginaryMeasure: 2 } }],
        },
        { commonOptions: options },
      ),
    /unknown measurement keys/i,
  );

  for (const invalidDelta of [true, null, "4"]) {
    assert.throws(
      () => createRuleBasedSizeBatch(
        pantiesModule,
        {
          baseProfile: { id: "M", measurements: defaults },
          sizes: [{ id: "L", deltas: { waist: invalidDelta } }],
        },
        { commonOptions: options },
      ),
      (error) => error instanceof PatternBatchValidationError
        && error.issues.some((issue) => issue.includes("deltas.waist")),
    );
  }

  assert.throws(
    () => createIndividualPatternBatch(
      pantiesModule,
      [{ id: "extra", measurements: { ...defaults, imaginaryMeasure: 10 } }],
      { commonOptions: options },
    ),
    (error) => error instanceof PatternBatchValidationError
      && error.issues.some((issue) => issue.includes("imaginaryMeasure") && issue.includes("unknown measurement")),
  );
});

test("schema ranges and relational constraints remain active for every variant", () => {
  assert.throws(
    () =>
      createIndividualPatternBatch(
        pantiesModule,
        [
          {
            id: "invalid",
            measurements: { ...defaults, waistToHighHip: 20, waistToSeat: 18 },
          },
        ],
        { commonOptions: options },
      ),
    (error) =>
      error instanceof PatternBatchValidationError &&
      error.issues.some((issue) => issue.includes("waistToSeat")),
  );
});

test("batch generation rejects unsupported and unknown option values", () => {
  assert.throws(
    () => createRuleBasedSizeBatch(
      pantiesModule,
      {
        baseProfile: { id: "M", measurements: defaults, options: { riseLevel: "INVALID" } },
        sizes: [{ id: "M", deltas: {} }],
      },
    ),
    (error) => error instanceof PatternBatchValidationError
      && error.issues.some((issue) => issue.includes("riseLevel") && issue.includes("unsupported choice")),
  );

  assert.throws(
    () => createIndividualPatternBatch(
      pantiesModule,
      [{ id: "M", measurements: defaults, options: { imaginaryOption: true } }],
      { commonOptions: options },
    ),
    (error) => error instanceof PatternBatchValidationError
      && error.issues.some((issue) => issue.includes("imaginaryOption") && issue.includes("unknown option")),
  );
});

test("JSON option strings are canonicalized before drafting and manifest creation", () => {
  const batch = createIndividualPatternBatch(
    pantiesModule,
    [{ id: "M", measurements: defaults, options: { gussetLining: "false" } }],
    { commonOptions: options },
  );
  assert.equal(batch.variants[0].options.gussetLining, false);
  assert.equal(batch.manifest.variants[0].options.gussetLining, false);
  assert.equal(batch.variants[0].draft.panels.some((panel) => panel.id === "gusset_lining"), false);
});

test("modules without adjustment controls reject injected adjustment records", () => {
  assert.equal(braletteModule.schema.adjustments, undefined);
  assert.throws(
    () => createIndividualPatternBatch(
      braletteModule,
      [{ id: "B", measurements: braletteModule.schema.defaults, adjustments: { imaginaryAdjustment: 1 } }],
      { commonOptions: braletteModule.schema.optionDefaults },
    ),
    (error) => error instanceof PatternBatchValidationError
      && error.issues.some((issue) => issue.includes("imaginaryAdjustment") && issue.includes("unknown adjustment")),
  );
});
