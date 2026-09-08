import assert from "node:assert/strict";
import pantiesModule from "../src/patterns/panties_basic/module.js";

const expectedMeasurementKeys = [
  "waist",
  "highHip",
  "seat",
  "waistToHighHip",
  "waistToSeat",
  "crossSeam",
  "crossSeamFront",
];

const hasFinitePoints = (path) =>
  path
    .toPoints()
    .every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

{
  const { schema } = pantiesModule;
  assert.deepEqual(schema.fields.map((field) => field.key), expectedMeasurementKeys);
  schema.fields.forEach((field) => {
    assert.ok(field.key);
    assert.ok(typeof field.min === "number");
    assert.ok(typeof field.max === "number");
  });
  assert.ok(Object.keys(schema.optionDefaults).length >= 10);
}

{
  const draft = pantiesModule.draft(
    pantiesModule.schema.defaults,
    { ...pantiesModule.schema.optionDefaults, seamAllowance: 0 }
  );
  assert.ok(draft.paths);
  assert.ok(draft.annotations);
  assert.ok(draft.meta);
  assert.ok(!draft.paths.front_seam);
  assert.ok(draft.paths.front_cut);
  draft.panels.forEach((panel) => assert.deepEqual(Object.keys(panel.paths), ["cut"]));
}

{
  const draft = pantiesModule.draft(
    pantiesModule.schema.defaults,
    { ...pantiesModule.schema.optionDefaults, seamAllowance: 6 }
  );
  assert.ok(draft.paths.front_seam);
  assert.ok(hasFinitePoints(draft.paths.front_seam));
  draft.panels.forEach((panel) => {
    assert.ok(panel.paths.cut);
    assert.ok(panel.paths.seam);
  });
}
