import assert from "node:assert/strict";
import test from "node:test";
import {
  calibrationText,
  isConfirmedCalibration,
  staticPreviewAriaLabel,
} from "../src/ui/screens/StaticPattern.js";

test("static pattern UI confirms only finite, bounded physical scales", () => {
  assert.equal(isConfirmedCalibration({ requiresCalibration: false, millimetersPerUnit: 0.5 }), true);
  assert.equal(isConfirmedCalibration({ requiresCalibration: false, millimetersPerUnit: 1e-6 }), true);
  assert.equal(isConfirmedCalibration({ requiresCalibration: false, millimetersPerUnit: 1e6 }), true);

  for (const millimetersPerUnit of [null, undefined, NaN, Infinity, -Infinity, 0, -1, 5e-324, 1e6 + 1]) {
    assert.equal(
      isConfirmedCalibration({ requiresCalibration: false, millimetersPerUnit }),
      false,
      `scale ${String(millimetersPerUnit)} must not be confirmed`,
    );
  }
  assert.equal(isConfirmedCalibration({ requiresCalibration: true, millimetersPerUnit: 1 }), false);
  assert.equal(isConfirmedCalibration({ millimetersPerUnit: 1 }), false);
  assert.equal(isConfirmedCalibration({ requiresCalibration: false, millimetersPerUnit: "1" }), false);
  assert.equal(isConfirmedCalibration({ requiresCalibration: false, status: "unknown", millimetersPerUnit: 1 }), false);
  assert.equal(isConfirmedCalibration({ requiresCalibration: false, known: false, millimetersPerUnit: 1 }), false);
});

test("static pattern calibration text is localized and fails closed", () => {
  const confirmed = { requiresCalibration: false, millimetersPerUnit: 0.5 };
  assert.equal(calibrationText(confirmed, "ru"), "Масштаб распознан: 0.5 мм/ед.");
  assert.equal(calibrationText(confirmed, "en"), "Scale detected: 0.5 mm/unit");
  assert.equal(
    calibrationText({ requiresCalibration: false, millimetersPerUnit: Infinity }, "ru"),
    "Масштаб не подтверждён",
  );
  assert.equal(
    calibrationText({ requiresCalibration: false, millimetersPerUnit: 5e-324 }, "en"),
    "Scale is not confirmed",
  );
});

test("static pattern preview has a localized accessible name", () => {
  assert.equal(staticPreviewAriaLabel("ru"), "Предпросмотр импортированного статического лекала");
  assert.equal(staticPreviewAriaLabel("en"), "Imported static pattern preview");
});
