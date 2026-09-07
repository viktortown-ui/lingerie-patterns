import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveStaticViewport,
  serializeStaticPatternSvg,
  staticSegmentsToPathData,
} from "../src/core/import/staticPatternSvg.js";
import { importStaticSvg } from "../src/core/import/staticSvg.js";

const geometry = {
  viewport: { minX: 0, minY: 0, width: 100, height: 200 },
  entities: [
    {
      id: "piece-1",
      segments: [
        { type: "M", values: [0, 0] },
        { type: "L", values: [100, 0] },
        { type: "C", values: [100, 60, 80, 150, 50, 200] },
        { type: "Z", values: [] },
      ],
    },
  ],
};

test("normalized static paths serialize without original SVG markup", () => {
  const svg = serializeStaticPatternSvg(geometry, { title: "A & B <safe>" });
  assert.match(svg, /viewBox="0 0 100 200"/);
  assert.match(svg, /M 0 0 L 100 0 C 100 60 80 150 50 200 Z/);
  assert.doesNotMatch(svg, /<title|A &amp; B &lt;safe&gt;/i);
  assert.doesNotMatch(svg, /script|foreignObject/i);
});

test("safe SVG survives import, normalized serialization, and re-import", async () => {
  const imported = await importStaticSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30" width="40mm" height="30mm">
      <path id="front" d="M0 0 L40 0 C40 10 25 30 0 30 Z"/>
    </svg>
  `);

  const serialized = serializeStaticPatternSvg(imported, { title: "Front & <safe>" });
  const reopened = await importStaticSvg(serialized);

  assert.doesNotMatch(serialized, /<title|Front &amp; &lt;safe&gt;/i);
  assert.equal(reopened.statistics.entityCount, imported.statistics.entityCount);
  assert.deepEqual(reopened.viewport.viewBox, imported.viewport.viewBox);
  assert.equal(reopened.calibration.status, "declared");
  assert.equal(reopened.calibration.millimetersPerUnit, imported.calibration.millimetersPerUnit);
  assert.equal(reopened.calibration.requiresCalibration, false);
  assert.deepEqual(reopened.entities[0].segments, imported.entities[0].segments);
});

test("normalized SVG preserves a confirmed physical scale", () => {
  const svg = serializeStaticPatternSvg({
    ...geometry,
    calibration: { requiresCalibration: false, millimetersPerUnit: 0.5 },
  });
  assert.match(svg, /width="50mm"/);
  assert.match(svg, /height="100mm"/);
  assert.match(svg, /data-mm-per-unit="0.5"/);
});

test("normalized SVG does not invent physical dimensions when scale is unknown", () => {
  const svg = serializeStaticPatternSvg({
    ...geometry,
    calibration: { requiresCalibration: true, millimetersPerUnit: null },
  });
  assert.doesNotMatch(svg, /width="[^"]+mm"/);
  assert.doesNotMatch(svg, /data-mm-per-unit/);
});

test("normalized SVG rejects invalid claimed calibration instead of rounding it to zero", () => {
  for (const millimetersPerUnit of [0, 5e-324, Infinity, 1_000_001]) {
    assert.throws(() => serializeStaticPatternSvg({
      ...geometry,
      calibration: { requiresCalibration: false, millimetersPerUnit },
    }), /invalid confirmed calibration/);
  }
});

test("static viewport rejects dimensions that round below the supported span", () => {
  assert.throws(() => resolveStaticViewport({
    viewport: { minX: 0, minY: 0, width: 5e-324, height: 10 },
  }), /no usable viewport/);
});

test("static viewport can fall back to finite bounds", () => {
  assert.deepEqual(resolveStaticViewport({ bounds: { minX: -5, minY: 2, maxX: 25, maxY: 52 } }), {
    x: -5,
    y: 2,
    width: 30,
    height: 50,
  });
});

test("static viewport reads the normalized importer viewBox", () => {
  assert.deepEqual(resolveStaticViewport({
    viewport: { viewBox: { minX: 4, minY: 6, width: 40, height: 60 } },
  }), { x: 4, y: 6, width: 40, height: 60 });
});

test("normalized renderer fails closed for unsupported or malformed segments", () => {
  assert.throws(() => staticSegmentsToPathData([{ type: "Q", values: [1, 2, 3, 4] }]), /Unsupported/);
  assert.throws(() => staticSegmentsToPathData([{ type: "M", values: [Infinity, 0] }]), /non-finite/);
});
