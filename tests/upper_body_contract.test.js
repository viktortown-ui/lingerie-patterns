import assert from "node:assert/strict";
import test from "node:test";

import braletteModule from "../src/patterns/bralette_soft/module.js";
import cropTopModule from "../src/patterns/crop_top_basic/module.js";
import { buildDxfExport } from "../src/core/export/dxfExport.js";
import { pdfExport } from "../src/core/export/pdfExport.js";
import { svgExport } from "../src/core/export/svgExport.js";
import { validateSchema } from "../src/core/validate/validate.js";

const modules = [braletteModule, cropTopModule];
const EPSILON = 1e-6;

function measurementsAt(schema, boundary) {
  if (boundary === "default") return { ...schema.defaults };
  return Object.fromEntries(schema.fields.map((field) => [field.key, field[boundary]]));
}

function assertClosedFinite(path, context) {
  assert.equal(path.segments.at(-1)?.type, "Z", `${context} must be closed`);
  const points = path.toPoints(60);
  assert.ok(points.length >= 4, `${context} must have usable geometry`);
  points.forEach((point) => {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${context} has non-finite coordinates`);
  });
  const bounds = path.bounds();
  assert.ok(bounds.maxX > bounds.minX && bounds.maxY > bounds.minY, `${context} must have positive bounds`);
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegmentInterior(point, start, end) {
  if (Math.abs(cross(start, end, point)) > EPSILON) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const projection = (point.x - start.x) * dx + (point.y - start.y) * dy;
  return projection > EPSILON && projection < dx * dx + dy * dy - EPSILON;
}

function segmentsIntersect(a, b, c, d) {
  const signs = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)]
    .map((value) => value > EPSILON ? 1 : value < -EPSILON ? -1 : 0);
  if (signs[0] * signs[1] < 0 && signs[2] * signs[3] < 0) return true;
  return pointOnSegmentInterior(a, c, d)
    || pointOnSegmentInterior(b, c, d)
    || pointOnSegmentInterior(c, a, b)
    || pointOnSegmentInterior(d, a, b);
}

function firstSelfIntersection(path) {
  const points = path.toPoints(64).filter((point, index, list) => (
    index === 0 || Math.hypot(point.x - list[index - 1].x, point.y - list[index - 1].y) > EPSILON
  ));
  if (points.length > 1 && Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) <= EPSILON) {
    points.pop();
  }
  const segments = points.map((point, index) => [point, points[(index + 1) % points.length]]);
  for (let first = 0; first < segments.length; first += 1) {
    for (let second = first + 1; second < segments.length; second += 1) {
      if (second === first + 1 || (first === 0 && second === segments.length - 1)) continue;
      if (segmentsIntersect(...segments[first], ...segments[second])) return [first, second];
    }
  }
  return null;
}

modules.forEach((module) => {
  ["min", "default", "max"].forEach((boundary) => {
    test(`${module.id}: ${boundary} measurements make closed exportable pieces`, () => {
      const measurements = measurementsAt(module.schema, boundary);
      const values = { ...measurements, ...module.schema.optionDefaults };
      assert.deepEqual(validateSchema(module.schema, values), {});
      const draft = module.draft(measurements, module.schema.optionDefaults);
      assert.equal(draft.meta.moduleId, module.id);
      assert.equal(draft.meta.fitStatus, "experimental");
      assert.ok(draft.meta.warnings?.length, "experimental status must be visible in output");
      assert.ok(draft.panels.length >= 2);
      draft.panels.forEach((panel) => {
        assert.ok(panel.paths.cut, `${panel.id} needs a cut path`);
        Object.entries(panel.paths).forEach(([name, path]) => assertClosedFinite(path, `${module.id}.${panel.id}.${name}`));
        assert.equal(firstSelfIntersection(panel.paths.cut), null, `${module.id}.${panel.id}.cut must not self-intersect`);
      });
      assert.ok(draft.annotations.some((annotation) => annotation.type === "stretchline"));
      const svg = svgExport(draft, [], { mode: "export" });
      assert.match(svg, /^<\?xml[\s\S]*<svg/);
      assert.match(svg, /data-role="cut"/);
      const pdf = pdfExport(draft, { paperSize: "A0", marginMm: 10 });
      assert.ok(pdf.data instanceof Blob && pdf.data.size > 1000);
      assert.ok(pdf.pageCount >= 1);
      const dxf = buildDxfExport(draft, { outputUnit: "mm", curveTolerance: 0.2 });
      assert.equal(dxf.report.internalParserRoundTrip, true);
      assert.equal(dxf.report.aamaAstmCertified, false);
    });
  });
});

test("crop top keeps side and shoulder seams matched while stretch changes width", () => {
  const low = cropTopModule.draft(cropTopModule.schema.defaults, { ...cropTopModule.schema.optionDefaults, workingStretchX: 5 });
  const high = cropTopModule.draft(cropTopModule.schema.defaults, { ...cropTopModule.schema.optionDefaults, workingStretchX: 30 });
  assert.equal(low.meta.engineering.sideDifferenceMm, 0);
  assert.equal(low.meta.engineering.shoulderDifferenceMm, 0);
  assert.ok(high.meta.engineering.frontHalfWidthCm < low.meta.engineering.frontHalfWidthCm);
});

test("soft bralette uses one band target and never claims an underwire", () => {
  const draft = braletteModule.draft(braletteModule.schema.defaults, braletteModule.schema.optionDefaults);
  assert.ok(draft.meta.engineering.cupWidthCm > 0);
  assert.ok(draft.meta.engineering.cupHeightCm > 0);
  assert.ok(draft.meta.engineering.bandDifferenceMm <= 1);
  assert.equal(draft.meta.checks.find((check) => check.id === "wire")?.status, "pass");
});

test("soft bralette blocks proportions that cannot fit the minimum side wing", () => {
  const measurements = {
    ...braletteModule.schema.defaults,
    bust: 150,
    underbust: 60,
    highBust: 90,
    bustPointDistance: 29,
  };
  const options = { ...braletteModule.schema.optionDefaults, workingStretchX: 25 };
  const errors = validateSchema(braletteModule.schema, { ...measurements, ...options });
  assert.ok(errors.underbust?.length, "schema must explain the incompatible underband proportions");
  assert.throws(
    () => braletteModule.draft(measurements, options),
    /cannot fit the minimum 8 cm side wing/i,
  );
});
