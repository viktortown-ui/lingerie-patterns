import test from "node:test";
import assert from "node:assert/strict";
import pantiesModule from "../src/patterns/panties_basic/module.js";
import rectangleModule from "../src/patterns/test_rectangle/module.js";
import { Path } from "../src/core/geometry/Path.js";
import {
  DXF_LAYERS,
  DxfValidationError,
  buildDxfExport,
  dxfExport,
  validateDraftForDxf,
} from "../src/core/export/dxfExport.js";
import { DxfParseError, parseAsciiDxf } from "../src/core/export/dxfParser.js";

function boundsOf(vertices) {
  return {
    minX: Math.min(...vertices.map((point) => point.x)),
    minY: Math.min(...vertices.map((point) => point.y)),
    maxX: Math.max(...vertices.map((point) => point.x)),
    maxY: Math.max(...vertices.map((point) => point.y)),
  };
}

test("ASCII DXF round-trips semantic apparel layers and closed pattern paths", () => {
  const draft = pantiesModule.draft(
    pantiesModule.schema.defaults,
    { ...pantiesModule.schema.optionDefaults, seamAllowance: 6 },
  );
  const result = buildDxfExport(draft, {
    outputUnit: "mm",
    semanticProfile: "aama-astm-oriented-not-certified",
    resolveText: (value) => value?.ru ?? value?.en ?? value,
  });
  const parsed = parseAsciiDxf(result.data);

  assert.match(result.data, /^[\x00-\x7F]*$/);
  assert.equal(parsed.version, "AC1009");
  assert.equal(parsed.insUnits, 4);
  assert.deepEqual(parsed.layers.map((layer) => layer.name), [...DXF_LAYERS]);
  assert.ok(parsed.entities.some((entity) => entity.type === "POLYLINE" && entity.layer === "CUT"));
  assert.ok(parsed.entities.some((entity) => entity.type === "POLYLINE" && entity.layer === "SEAM"));
  assert.ok(parsed.entities.some((entity) => entity.type === "POINT" && entity.layer === "NOTCH"));
  assert.ok(parsed.entities.some((entity) => entity.type === "LINE" && entity.layer === "GRAIN"));
  assert.ok(parsed.entities.some((entity) => entity.type === "TEXT" && entity.layer === "TEXT"));
  parsed.entities
    .filter((entity) => entity.type === "POLYLINE")
    .forEach((entity) => {
      assert.equal(entity.closed, true);
      assert.ok(entity.vertices.length >= 3);
      assert.ok(entity.xdata.some((value) => value.startsWith("PIECE_ID=")));
      assert.ok(entity.xdata.some((value) => value === `PATH_ROLE=${entity.layer}`));
    });
  assert.equal(result.report.internalParserRoundTrip, true);
  assert.equal(result.report.externalCadRoundTrip, false);
  assert.equal(result.report.aamaAstmCertified, false);
  assert.equal(result.report.industrialProductionQualified, false);
  assert.match(result.data, /\\U\+0[0-9A-F]{3}/, "Cyrillic labels must remain ASCII-safe");
});

test("DXF coordinates are converted from centimetres to declared millimetres", () => {
  const draft = rectangleModule.draft(
    { width_cm: 25, height_cm: 35, seam_allowance_cm: 0 },
    {},
  );
  const parsed = parseAsciiDxf(dxfExport(draft, { outputUnit: "mm" }));
  const cut = parsed.entities.find((entity) => entity.type === "POLYLINE" && entity.layer === "CUT");
  const bounds = boundsOf(cut.vertices);

  assert.equal(parsed.insUnits, 4);
  assert.equal(bounds.maxX - bounds.minX, 250);
  assert.equal(bounds.maxY - bounds.minY, 350);
});

test("DXF output is deterministic for identical draft and options", () => {
  const draft = rectangleModule.draft(
    { width_cm: 20, height_cm: 30, seam_allowance_cm: 1 },
    {},
  );
  const first = dxfExport(draft, { outputUnit: "mm", curveTolerance: 0.1 });
  const second = dxfExport(draft, { outputUnit: "mm", curveTolerance: 0.1 });
  assert.equal(first, second);
});

test("DXF text truncation never splits a Unicode escape", () => {
  const draft = rectangleModule.draft(
    { width_cm: 20, height_cm: 30, seam_allowance_cm: 0 },
    {},
  );
  draft.panels[0].name = `${"A".repeat(231)}Я`;
  const result = buildDxfExport(draft, { resolveText: (value) => value });
  assert.doesNotMatch(result.data, /\\U\+(?:[0-9A-F]{0,3})(?:\r?\n|$)/);
  assert.equal(result.report.internalParserRoundTrip, true);
});

test("DXF validation rejects missing units, open paths, and non-finite geometry", () => {
  const closed = new Path().moveTo(0, 0).lineTo(10, 0).lineTo(0, 10).close();
  assert.throws(
    () => validateDraftForDxf({ paths: { cut: closed }, annotations: [], meta: {} }),
    DxfValidationError,
  );

  const open = new Path().moveTo(0, 0).lineTo(10, 0).lineTo(0, 10);
  assert.throws(
    () => validateDraftForDxf({ paths: { cut: open }, annotations: [], meta: { unit: "cm" } }),
    /explicitly closed/i,
  );

  const nonFinite = new Path().moveTo(0, 0).lineTo(Number.NaN, 0).lineTo(0, 10).close();
  assert.throws(
    () => validateDraftForDxf({ paths: { cut: nonFinite }, annotations: [], meta: { unit: "cm" } }),
    /must be finite/i,
  );

  const selfIntersecting = new Path()
    .moveTo(0, 0)
    .lineTo(10, 10)
    .lineTo(0, 10)
    .lineTo(10, 0)
    .close();
  assert.throws(
    () => validateDraftForDxf({ paths: { cut: selfIntersecting }, annotations: [], meta: { unit: "cm" } }),
    /must not self-intersect/i,
  );

  const disconnected = new Path().moveTo(0, 0).lineTo(10, 0).lineTo(0, 10).close();
  disconnected.segments[1].points[0] = { x: 1, y: 1 };
  assert.throws(
    () => validateDraftForDxf({ paths: { cut: disconnected }, annotations: [], meta: { unit: "cm" } }),
    /disconnected/i,
  );

  assert.throws(
    () => validateDraftForDxf({ paths: { cut: closed }, annotations: {}, meta: { unit: "cm" } }),
    /annotations must be an array/i,
  );
});

test("DXF rejects unsafe flattening tolerances and quantized contour collapse", () => {
  const curve = new Path()
    .moveTo(0, 0)
    .curveTo(0, 100, 100, 100, 100, 0)
    .lineTo(0, 0)
    .close();
  const startedAt = Date.now();
  assert.throws(
    () => validateDraftForDxf(
      { paths: { cut: curve }, annotations: [], meta: { unit: "mm" } },
      { curveTolerance: 0.00001 },
    ),
    /curveTolerance must be at least/i,
  );
  assert.ok(Date.now() - startedAt < 500, "unsafe tolerance must fail before expensive flatten/intersection work");

  const microscopicEdge = new Path()
    .moveTo(0, 0)
    .lineTo(0.0000004, 0)
    .lineTo(0, 1)
    .close();
  assert.throws(
    () => buildDxfExport({ paths: { cut: microscopicEdge }, annotations: [], meta: { unit: "mm" } }),
    /collapses after six-decimal DXF quantization/i,
  );
});

test("strict parser rejects malformed or incomplete ASCII DXF", () => {
  const draft = rectangleModule.draft(
    { width_cm: 10, height_cm: 10, seam_allowance_cm: 0 },
    {},
  );
  const valid = dxfExport(draft);
  assert.throws(() => parseAsciiDxf(valid.replace(/0\r\nEOF\r\n$/, "")), DxfParseError);
  assert.throws(() => parseAsciiDxf(`${valid}7\r\n`), DxfParseError);
  assert.throws(
    () => parseAsciiDxf(valid.replace("8\r\nCUT", "8\r\nMISSING")),
    /undefined layer|layer differs/i,
  );
});
