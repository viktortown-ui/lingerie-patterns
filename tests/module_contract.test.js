import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateSchema } from "../src/core/validate/validate.js";
import { svgExport } from "../src/core/export/svgExport.js";
import { PATTERN_FIT_RISK_LEVELS } from "../src/core/pattern/PatternModule.js";
import { modules } from "../src/patterns/index.js";

const fixtureDir = join(process.cwd(), "tests", "fixtures");
const fixtures = readdirSync(fixtureDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(fixtureDir, name), "utf-8")));

function findFixture(schema) {
  return fixtures.find((fixture) => schema.fields.every((field) => field.key in fixture));
}

const pick = (source, keys) => Object.fromEntries(keys.map((key) => [key, source[key]]));
const expectedFitRisk = {
  panties_basic: "moderate",
  panties_thong_basic: "moderate",
  bralette_soft: "high",
  crop_top_basic: "high",
};

modules.forEach((module) => {
  const { schema } = module;
  assert.ok(schema, `${module.id} missing schema`);
  assert.equal(schema.id, module.id);
  assert.ok(schema.name);
  assert.ok(schema.unit);
  assert.ok(Array.isArray(schema.fields));
  assert.ok(schema.fields.length > 0);
  assert.ok(PATTERN_FIT_RISK_LEVELS.includes(module.fitRisk?.level), `${module.id} missing fit-risk level`);
  assert.equal(module.fitRisk.level, expectedFitRisk[module.id], `${module.id} has an unexpected fit-risk level`);
  assert.ok(module.fitRisk.reason.ru.trim(), `${module.id} missing Russian fit-risk reason`);
  assert.ok(module.fitRisk.reason.en.trim(), `${module.id} missing English fit-risk reason`);
  assert.ok(Array.isArray(module.compatibleDraftVersions));
  module.compatibleDraftVersions.forEach((version) => {
    assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u);
    assert.notEqual(version, module.version);
  });

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
  assert.equal(draft.meta.moduleVersion, module.version);

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
