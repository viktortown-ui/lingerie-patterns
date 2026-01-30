import assert from "node:assert/strict";
import pantiesModule from "../src/patterns/panties_basic/module.js";

{
  const { schema } = pantiesModule;
  assert.ok(schema.fields.length > 0);
  schema.fields.forEach((field) => {
    assert.ok(field.key);
    assert.ok(typeof field.min === "number");
    assert.ok(typeof field.max === "number");
  });
}

{
  const draft = pantiesModule.draft(
    { waist: 70, hip: 95, rise: 23, legOpening: 55 },
    { seamAllowance: "off", style: "classic" }
  );
  assert.ok(draft.paths);
  assert.ok(draft.annotations);
  assert.ok(draft.meta);
}
