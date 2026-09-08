import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeOptions, completeProfileValues, formatProfileDate, prepareImportedProfiles } from "../src/ui/utils/profiles.js";

test("partial legacy profile resets omitted values to schema defaults", () => {
  const schema = {
    defaults: { waist: 68, highHip: 88 },
    optionDefaults: { rise: "mid" },
    adjustmentDefaults: { frontCurve: 0 },
  };
  const result = completeProfileValues(schema, { measurements: { waist: 80 } });
  assert.deepEqual(result, { waist: 80, highHip: 88, rise: "mid", frontCurve: 0 });
});

test("id-less imported profiles receive unique ids before merge", () => {
  let next = 0;
  const profiles = prepareImportedProfiles(
    [{ name: "Legacy A" }, { name: "Legacy B" }],
    [{ id: "profile-1", name: "Existing" }],
    () => `profile-${++next}`,
    "crop_top_basic",
  );
  assert.deepEqual(profiles.map((profile) => profile.id), ["profile-2", "profile-3"]);
  assert.deepEqual(profiles.map((profile) => profile.name), ["Legacy A", "Legacy B"]);
  assert.deepEqual(profiles.map((profile) => profile.moduleId), ["crop_top_basic", "crop_top_basic"]);
});

test("profile backup import rejects mixed-invalid and duplicate-id input atomically", () => {
  const createId = () => "generated";
  assert.throws(
    () => prepareImportedProfiles([{ id: "ok", name: "Valid" }, null], [], createId),
    /invalid profile backup/i,
  );
  assert.throws(
    () => prepareImportedProfiles([{ id: "same", name: "A" }, { id: "same", name: "B" }], [], createId),
    /duplicate profile id/i,
  );
  assert.throws(
    () => prepareImportedProfiles([{ id: "known", name: "Broken", measurements: "oops" }], [], createId),
    /invalid profile backup/i,
  );
});

test("legacy profiles without a timestamp render a safe date placeholder", () => {
  assert.equal(formatProfileDate(undefined, "ru"), "—");
  assert.equal(formatProfileDate("not-a-date", "en"), "—");
  assert.notEqual(formatProfileDate("2026-09-07T00:00:00.000Z", "ru"), "—");
});

test("JSON option strings are canonicalized to schema choice types", () => {
  const schema = {
    options: [
      { key: "lining", choices: [{ value: true }, { value: false }] },
      { key: "width", choices: [{ value: 1.5 }, { value: 2 }] },
    ],
  };
  assert.deepEqual(canonicalizeOptions(schema, { lining: "false", width: "1.5" }), {
    lining: false,
    width: 1.5,
  });
});
