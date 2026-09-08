import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  importStaticSvg,
  MAX_STATIC_SVG_BYTES,
  readStaticSvgFile,
  StaticSvgImportError,
} from "../src/core/import/index.js";

function expectCode(code) {
  return (error) => error instanceof StaticSvgImportError && error.code === code;
}

function svg(body, attributes = 'viewBox="0 0 100 50" width="100mm" height="50mm"') {
  return `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`;
}

test("imports inert path geometry, normalizes commands, calibration, and source hash", async () => {
  const source = svg('<path id="piece" fill="none" stroke="#111" d="M 0 0 h 10 v 10 l -5 0 Q 2 8 0 5 C 0 4 0 2 0 0 Z"/>');
  const result = await importStaticSvg(source);

  assert.equal(result.kind, "lekalo-static-pattern");
  assert.equal(result.editable, false);
  assert.equal(result.calibration.status, "derived");
  assert.equal(result.calibration.millimetersPerUnit, 1);
  assert.equal(result.statistics.entityCount, 1);
  assert.deepEqual(result.entities[0].segments.map((segment) => segment.type), ["M", "L", "L", "L", "C", "C", "Z"]);
  assert.deepEqual(result.entities[0].presentation, { fill: "none", stroke: "#111" });
  assert.match(result.source.hash.value, /^[0-9a-f]{64}$/u);
  assert.equal(result.source.sha256, result.source.hash.value);
  assert.equal(result.source.byteLength, new TextEncoder().encode(source).byteLength);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.entities[0].segments), true);
});

test("imports line, polyline, polygon and rect with safe nested transforms", async () => {
  const result = await importStaticSvg(svg(`
    <g id="translated" transform="translate(5 7)" stroke="black">
      <line id="line1" x1="0" y1="0" x2="10" y2="0"/>
      <g id="scaled" transform="scale(2)">
        <polyline points="0,0 2,0 2,2"/>
      </g>
    </g>
    <polygon points="0 0 4 0 4 4"/>
    <rect x="10" y="10" width="4" height="2" transform="rotate(90 12 11)"/>
  `));

  assert.equal(result.statistics.entityCount, 4);
  assert.deepEqual(result.entities[0].segments[0].values, [5, 7]);
  assert.deepEqual(result.entities[1].segments[1].values, [9, 7]);
  assert.deepEqual(result.entities[1].groups, ["translated", "scaled"]);
  assert.equal(result.entities[2].segments.at(-1).type, "Z");
  assert.deepEqual(result.entities[0].presentation, { stroke: "black" });
  assert.ok(result.bounds.width > 0);
});

test("file reader rejects declared and actual oversize before unsafe processing", async () => {
  let reads = 0;
  const declaredOversize = {
    size: MAX_STATIC_SVG_BYTES + 1,
    async text() { reads += 1; return ""; },
  };
  await assert.rejects(() => readStaticSvgFile(declaredOversize), expectCode("file-too-large"));
  assert.equal(reads, 0);

  const lyingFile = {
    size: 1,
    async text() { reads += 1; return svg('<line x2="1" y2="1"/>'); },
  };
  await assert.rejects(() => readStaticSvgFile(lyingFile, { maxBytes: 16 }), expectCode("file-too-large"));
  assert.equal(reads, 1);
});

test("enforces entity and expanded command limits", async () => {
  await assert.rejects(
    () => importStaticSvg(svg('<line/><line/>'), { maxEntities: 1 }),
    expectCode("too-many-entities"),
  );
  await assert.rejects(
    () => importStaticSvg(svg('<path d="M0 0 L1 1 2 2 3 3"/>'), { maxPathCommands: 3 }),
    expectCode("too-many-path-commands"),
  );
  await assert.rejects(
    () => importStaticSvg(svg("<g><g><line/></g></g>"), { maxElements: 3 }),
    expectCode("too-many-elements"),
  );
  await assert.rejects(
    () => importStaticSvg(svg("<g><g><line/></g></g>"), { maxDepth: 3 }),
    expectCode("svg-too-deep"),
  );
});

test("implicit moveto coordinate pairs preserve the subpath close point", async () => {
  const result = await importStaticSvg(svg('<path d="M0 0 10 0 10 10 Z l5 0"/>'));
  assert.deepEqual(result.entities[0].segments.at(-1), { type: "L", values: [5, 0] });
});

test("rejects active content, references, entity syntax, and CSS URLs", async () => {
  const cases = [
    [svg('<script>alert(1)</script>'), "forbidden-element"],
    [svg('<foreignObject/>'), "forbidden-element"],
    [svg('<line onload="alert(1)"/>'), "event-attribute-forbidden"],
    [svg('<path href="https://example.com/a" d="M0 0L1 1"/>'), "reference-attribute-forbidden"],
    [svg('<image src="https://example.com/a.png"/>'), "unsupported-element"],
    [svg('<path style="stroke:red" d="M0 0L1 1"/>'), "style-attribute-forbidden"],
    [svg('<path fill="url(https://example.com/a)" d="M0 0L1 1"/>'), "css-url-forbidden"],
    ['<!DOCTYPE svg><svg viewBox="0 0 1 1"><line/></svg>', "doctype-forbidden"],
    [svg('<path d="M0 0L1 1"/><desc>A &amp; B</desc>'), "entity-reference-forbidden"],
  ];
  for (const [source, code] of cases) {
    await assert.rejects(() => importStaticSvg(source), expectCode(code), code);
  }
});

test("fails explicitly for every unsupported geometric feature", async () => {
  const cases = [
    [svg('<circle cx="10" cy="10" r="3"/>'), "unsupported-element"],
    [svg('<path class="cut" d="M0 0L1 1"/>'), "unsupported-attribute"],
    [svg('<path d="M0 0 A2 2 0 0 0 4 4"/>'), "unsupported-path-command"],
    [svg('<path d="M0 0 S2 2 4 4"/>'), "unsupported-path-command"],
    [svg('<line transform="skewX(10)"/>'), "unsupported-transform"],
    [svg('<line transform="translate(1) scale(2)"/>'), "unsupported-transform"],
    [svg('<rect width="3" height="4" rx="1"/>'), "unsupported-attribute"],
    [svg('<text x="1" y="1">label</text>'), "unsupported-element"],
  ];
  for (const [source, code] of cases) {
    await assert.rejects(() => importStaticSvg(source), expectCode(code), code);
  }
});

test("rejects malformed, non-finite, out-of-range and uncalibratable structure safely", async () => {
  const cases = [
    ['<svg viewBox="0 0 1 1"><line/></sv>', "malformed-xml"],
    ['<svg><line/></svg>', "missing-viewbox"],
    [svg('<path d="M0 0 LNaN 1"/>'), "unsupported-path-command"],
    [svg('<path d="M0 0 L100 1"/>'), "coordinate-out-of-range", { maxCoordinate: 10 }],
    [svg('<rect width="0" height="1"/>'), "invalid-number"],
    [svg('<line transform="scale(0)"/>'), "unsafe-transform"],
    [svg('<line/>', 'viewBox="0 0 -1 1"'), "invalid-viewbox"],
  ];
  for (const [source, code, options] of cases) {
    await assert.rejects(() => importStaticSvg(source, options), expectCode(code), code);
  }
});

test("reports missing calibration and accepts a consistent declared mm scale", async () => {
  const required = await importStaticSvg(svg('<line x2="10"/>', 'viewBox="0 0 100 50"'));
  assert.deepEqual(required.calibration, {
    status: "required",
    unit: "mm-per-svg-user-unit",
    millimetersPerUnit: null,
    millimetersPerUnitX: null,
    millimetersPerUnitY: null,
    requiresCalibration: true,
  });

  const declared = await importStaticSvg(svg(
    '<line x2="10"/>',
    'viewBox="0 0 100 50" data-mm-per-unit="0.5"',
  ));
  assert.equal(declared.calibration.status, "declared");
  assert.equal(declared.calibration.millimetersPerUnit, 0.5);
  assert.equal(declared.calibration.requiresCalibration, false);

  await assert.rejects(
    () => importStaticSvg(svg('<line/>', 'viewBox="0 0 100 50" width="100mm" height="50mm" data-mm-per-unit="2"')),
    expectCode("conflicting-calibration"),
  );
  await assert.rejects(
    () => importStaticSvg(svg('<line/>', 'viewBox="0 0 100 50" width="100mm" height="100mm"')),
    expectCode("non-uniform-calibration"),
  );
  await assert.rejects(
    () => importStaticSvg(svg('<line/>', 'viewBox="0 0 100 50" data-mm-per-unit="5e-324"')),
    expectCode("calibration-out-of-range"),
  );
  await assert.rejects(
    () => importStaticSvg(svg('<line/>', 'viewBox="0 0 5e-324 50"')),
    expectCode("invalid-viewbox"),
  );
  await assert.rejects(
    () => importStaticSvg(svg('<line/>', 'viewBox="0 0 10000000 50" data-mm-per-unit="1000000"')),
    expectCode("physical-size-out-of-range"),
  );
});

test("source hashing is deterministic and sensitive to exact source bytes", async () => {
  const first = svg('<line x2="1"/>');
  const second = svg('<line x2="2"/>');
  const [a, b, c] = await Promise.all([
    importStaticSvg(first),
    importStaticSvg(first),
    importStaticSvg(second),
  ]);
  assert.equal(a.source.hash.value, b.source.hash.value);
  assert.notEqual(a.source.hash.value, c.source.hash.value);
});

test("file hashing preserves the exact original UTF-8 bytes including BOM", async () => {
  const source = svg('<line x2="1"/>');
  const sourceBytes = new TextEncoder().encode(source);
  const payload = new Uint8Array(3 + sourceBytes.byteLength);
  payload.set([0xEF, 0xBB, 0xBF]);
  payload.set(sourceBytes, 3);
  const result = await readStaticSvgFile(new Blob([payload], { type: "image/svg+xml" }));

  assert.equal(result.source.byteLength, payload.byteLength);
  assert.equal(result.source.sha256, createHash("sha256").update(payload).digest("hex"));
});

test("accepts harmless XML preamble content but rejects ambiguous identity and version metadata", async () => {
  const result = await importStaticSvg(`<?xml version="1.0"?>
    <!-- geometry only -->
    <svg xmlns="http://www.w3.org/2000/svg" version="1.1" id="root" viewBox="0 0 10 10">
      <line id="edge" x2="2"/>
    </svg>`);
  assert.equal(result.viewport.rootId, "root");
  assert.equal(result.viewport.svgVersion, "1.1");

  await assert.rejects(
    () => importStaticSvg(svg('<g id="same"><line id="same"/></g>')),
    expectCode("duplicate-id"),
  );
  await assert.rejects(
    () => importStaticSvg(svg('<line/>', 'version="9" viewBox="0 0 100 50"')),
    expectCode("unsupported-svg-version"),
  );
});
