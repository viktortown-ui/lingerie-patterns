import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateSchema } from "../src/core/validate/validate.js";
import { svgExport } from "../src/core/export/svgExport.js";
import { modules } from "../src/patterns/index.js";

const fixtureDir = join(process.cwd(), "tests", "fixtures");
const fixtures = readdirSync(fixtureDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(fixtureDir, name), "utf-8")));

function findFixture(schema) {
  return fixtures.find((fixture) => schema.fields.every((field) => field.key in fixture));
}

const pick = (source, keys) => Object.fromEntries(keys.map((key) => [key, source[key]]));

modules.forEach((module) => {
  const { schema } = module;
  assert.ok(schema, `${module.id} missing schema`);
  assert.equal(schema.id, module.id);
  assert.ok(schema.name);
  assert.ok(schema.unit);
  assert.ok(Array.isArray(schema.fields));
  assert.ok(schema.fields.length > 0);

  schema.fields.forEach((field) => {
    assert.ok(field.key);
    assert.ok(typeof field.min === "number");
    assert.ok(typeof field.max === "number");
    assert.ok(schema.defaults && Object.prototype.hasOwnProperty.call(schema.defaults, field.key));
  });

  if (schema.options?.length) {
    schema.options.forEach((option) => {
      assert.ok(option.key);
      assert.ok(Array.isArray(option.choices));
      assert.ok(option.choices.length > 0);
      assert.ok(
        option.choices.some(
          (choice) => String(choice.value) === String(schema.optionDefaults?.[option.key])
        ),
        `${module.id}.${option.key} has an invalid default`
      );
    });
    assert.ok(schema.optionDefaults);
  }

  const fixture = findFixture(schema);
  assert.ok(fixture, `No fixture covers ${module.id}`);

  const values = { ...schema.defaults, ...(schema.optionDefaults || {}), ...fixture };
  const measurements = pick(values, schema.fields.map((field) => field.key));
  const options = pick(values, (schema.options || []).map((option) => option.key));

  const fieldErrors = validateSchema(schema, values);
  assert.equal(Object.keys(fieldErrors).length, 0, `Schema errors for ${module.id}`);

  const draft = module.draft(measurements, options);
  assert.ok(draft.paths, `${module.id} missing paths`);
  assert.ok(draft.annotations, `${module.id} missing annotations`);
  assert.ok(draft.meta, `${module.id} missing meta`);
  assert.ok(draft.meta.title);
  assert.ok(draft.meta.unit);
  assert.ok(draft.meta.moduleId);
  assert.ok(draft.meta.moduleVersion);

  if (module.id.startsWith("panties_")) {
    assert.equal(schema.fields.length, 7, `${module.id} must use the seven-measurement contract`);
    assert.ok(draft.panels.length >= 3);
    draft.panels.forEach((panel) => {
      assert.ok(panel.paths.cut, `${module.id}.${panel.id} missing cut path`);
      assert.ok(panel.paths.seam, `${module.id}.${panel.id} missing seam path`);
      assert.notEqual(panel.paths.cut, panel.paths.seam);
    });
    assert.ok(draft.annotations.some((annotation) => annotation.type === "stretchline"));
    assert.equal(draft.meta.edgeAllowancesMm.fold, 0);
  }

  const svg = svgExport(draft, ["Contract"], {
    resolveText: (value) => value?.en || value?.ru || String(value ?? ""),
  });
  assert.ok(svg.includes("<svg"), `${module.id} svg missing <svg>`);
  assert.ok(svg.includes("viewBox"), `${module.id} svg missing viewBox`);
});
