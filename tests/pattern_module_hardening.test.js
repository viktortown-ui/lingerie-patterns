import assert from "node:assert/strict";
import test from "node:test";
import {
  PatternModule,
  PatternModuleValidationError,
} from "../src/core/pattern/PatternModule.js";
import { getModule, getModules, registerModule } from "../src/core/pattern/registry.js";

const draft = (measurements) => ({ width: measurements.width });

function validDescriptor(overrides = {}) {
  const schema = {
    id: "contract_sample",
    name: { ru: "Контрольный модуль", en: "Contract sample" },
    unit: "cm",
    sections: [
      { id: "measurements", title: { ru: "Мерки", en: "Measurements" } },
      { id: "style", title: { ru: "Фасон", en: "Style" } },
    ],
    fields: [
      {
        key: "width",
        section: "measurements",
        label: { ru: "Ширина", en: "Width" },
        min: 1,
        max: 100,
        step: 0.5,
      },
    ],
    defaults: { width: 20 },
    options: [
      {
        key: "shape",
        section: "style",
        label: { ru: "Форма", en: "Shape" },
        choices: [
          { label: { ru: "Прямая", en: "Straight" }, value: "straight" },
          { label: { ru: "Изогнутая", en: "Curved" }, value: "curved" },
        ],
        default: "straight",
      },
    ],
    optionDefaults: { shape: "straight" },
    adjustments: [
      {
        key: "edgeCurve",
        label: { ru: "Кривая края", en: "Edge curve" },
        axis: "y",
        min: -2,
        max: 2,
        step: 0.1,
        default: 0,
      },
    ],
    adjustmentDefaults: { edgeCurve: 0 },
  };
  return {
    id: "contract_sample",
    name: schema.name,
    category: "test.contract",
    version: "1.2.3",
    status: "experimental",
    tags: ["test"],
    schema,
    draft,
    ...overrides,
  };
}

function replaceSchema(descriptor, patch) {
  return { ...descriptor, schema: { ...descriptor.schema, ...patch } };
}

test("PatternModule validates and deeply freezes metadata while preserving draft()", () => {
  const source = validDescriptor();
  const module = new PatternModule(source);

  assert.equal(module.draft, draft);
  assert.deepEqual(module.draft({ width: 24 }), { width: 24 });
  assert.ok(Object.isFrozen(module));
  assert.ok(Object.isFrozen(module.name));
  assert.ok(Object.isFrozen(module.tags));
  assert.ok(Object.isFrozen(module.schema));
  assert.ok(Object.isFrozen(module.schema.fields));
  assert.ok(Object.isFrozen(module.schema.fields[0]));
  assert.ok(Object.isFrozen(module.schema.defaults));
  assert.equal(Object.isFrozen(source.schema), false, "freezing a module must not mutate shared source metadata");
  assert.throws(() => module.tags.push("mutated"), TypeError);
  assert.throws(() => { module.schema.defaults.width = 99; }, TypeError);
  assert.equal(module.schema.defaults.width, 20);
});

test("PatternModule rejects missing required descriptor fields", () => {
  assert.throws(() => new PatternModule(), PatternModuleValidationError);
  assert.throws(
    () => new PatternModule(validDescriptor({ name: "" })),
    /module\.name: must be a non-empty string/,
  );
  assert.throws(
    () => new PatternModule(validDescriptor({ category: "" })),
    /module\.category: must be a non-empty string/,
  );
  assert.throws(
    () => new PatternModule(validDescriptor({ draft: null })),
    /module\.draft: must be a function/,
  );
});

test("PatternModule enforces schema identity, semantic versions, and status enum", () => {
  const descriptor = validDescriptor();
  assert.throws(
    () => new PatternModule(replaceSchema(descriptor, { id: "another_module" })),
    /module\.schema\.id: must exactly match module\.id/,
  );
  assert.throws(
    () => new PatternModule(validDescriptor({ version: "latest" })),
    /module\.version: must be a semantic version/,
  );
  assert.throws(
    () => new PatternModule(validDescriptor({ version: "1.0.0-01" })),
    /leading zero/,
  );
  assert.throws(
    () => new PatternModule(validDescriptor({ status: "production-ready" })),
    /module\.status: must be one of/,
  );
});

test("PatternModule rejects duplicate field, option, and adjustment keys", () => {
  const descriptor = validDescriptor();
  assert.throws(
    () => new PatternModule(replaceSchema(descriptor, {
      fields: [...descriptor.schema.fields, { ...descriptor.schema.fields[0] }],
    })),
    /duplicate schema key width/,
  );
  assert.throws(
    () => new PatternModule(replaceSchema(descriptor, {
      options: [{ ...descriptor.schema.options[0], key: "width" }],
      optionDefaults: { width: "straight" },
    })),
    /duplicate schema key width/,
  );
  assert.throws(
    () => new PatternModule(replaceSchema(descriptor, {
      adjustments: [{ ...descriptor.schema.adjustments[0], key: "shape" }],
      adjustmentDefaults: { shape: 0 },
    })),
    /duplicate schema key shape/,
  );
});

test("PatternModule rejects missing, out-of-range, and inconsistent defaults", () => {
  const descriptor = validDescriptor();
  assert.throws(
    () => new PatternModule(replaceSchema(descriptor, { defaults: {} })),
    /missing default for width/,
  );
  assert.throws(
    () => new PatternModule(replaceSchema(descriptor, { defaults: { width: 101 } })),
    /must be between 1 and 100/,
  );
  assert.throws(
    () => new PatternModule(replaceSchema(descriptor, {
      optionDefaults: { shape: "curved" },
    })),
    /must exactly match the option default/,
  );
  assert.throws(
    () => new PatternModule(replaceSchema(descriptor, {
      adjustments: [{ ...descriptor.schema.adjustments[0], default: 3 }],
      adjustmentDefaults: { edgeCurve: 3 },
    })),
    /must be between -2 and 2/,
  );
});

test("registry freezes valid plain descriptors and rejects duplicate ids without replacement", () => {
  const descriptor = validDescriptor({
    id: "registry_contract_sample",
    schema: { ...validDescriptor().schema, id: "registry_contract_sample" },
  });
  const registered = registerModule(descriptor);
  assert.ok(registered instanceof PatternModule);
  assert.ok(Object.isFrozen(registered));
  assert.equal(getModule(registered.id), registered);
  assert.equal(getModules().filter((module) => module.id === registered.id).length, 1);

  const duplicate = validDescriptor({
    id: registered.id,
    schema: { ...validDescriptor().schema, id: registered.id },
    version: "1.2.4",
  });
  assert.throws(() => registerModule(duplicate), /already registered/);
  assert.equal(getModule(registered.id), registered, "duplicate registration must keep the original module");
});
