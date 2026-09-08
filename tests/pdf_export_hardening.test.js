import assert from "node:assert/strict";
import { Path } from "../src/core/geometry/Path.js";
import { pdfExport } from "../src/core/export/pdfExport.js";
import { exactPathBounds } from "../src/core/export/pathValidation.js";

function rectangle(widthMm, heightMm, insetMm = 0) {
  return new Path()
    .moveTo(insetMm, insetMm)
    .lineTo(widthMm - insetMm, insetMm)
    .lineTo(widthMm - insetMm, heightMm - insetMm)
    .lineTo(insetMm, heightMm - insetMm)
    .close();
}

function makeDraft(widthMm, heightMm, { withSeam = false } = {}) {
  const cut = rectangle(widthMm, heightMm);
  const paths = { cut };
  if (withSeam) paths.seam = rectangle(widthMm, heightMm, 2);
  return {
    panels: [
      {
        id: "sample",
        name: "Sample piece",
        cutQty: "1 on fold",
        material: "Test fabric",
        paths,
      },
    ],
    paths,
    annotations: [
      { type: "label", point: { x: widthMm / 2, y: heightMm / 2 }, text: "CENTER LABEL" },
    ],
    meta: {
      unit: "mm",
      title: "PDF hardening sample",
      moduleId: "pdf_test",
      moduleVersion: "1.0.0",
      seamAllowanceApplied: withSeam,
      seamAllowanceMm: withSeam ? 2 : 0,
    },
  };
}

function contentStreams(pdfText) {
  return [...pdfText.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((match) => match[1]);
}

function physicalPageCount(pdfText) {
  const match = pdfText.match(/\/Type \/Pages \/Count (\d+)/);
  assert.ok(match, "PDF page tree must declare its page count");
  return Number(match[1]);
}

function mediaBoxes(pdfText) {
  return [...pdfText.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((match) => ({
    width: Number(match[1]),
    height: Number(match[2]),
  }));
}

function tileWindow(stream) {
  const match = stream.match(
    /% TILE_WINDOW_MM (R\d+C\d+) X0=([\d.-]+) X1=([\d.-]+) Y0=([\d.-]+) Y1=([\d.-]+) OVERLAP=([\d.-]+)/
  );
  assert.ok(match, "tile stream must expose its deterministic print window");
  return {
    id: match[1],
    x0: Number(match[2]),
    x1: Number(match[3]),
    y0: Number(match[4]),
    y1: Number(match[5]),
    overlap: Number(match[6]),
  };
}

function closeTo(actual, expected, tolerance = 0.00001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

{
  const result = pdfExport(makeDraft(100, 120, { withSeam: true }), {
    paperSize: "A4",
    info: { instructionText: "Custom print instruction." },
  });
  assert.equal(typeof result?.then, "undefined", "pdfExport must remain synchronous");
  assert.ok(result.data instanceof Blob);
  assert.equal(result.pageCount, 1, "pageCount remains the number of pattern sheets");
  assert.equal(result.totalPageCount, 2, "totalPageCount includes the calibration page");

  const pdfText = await result.data.text();
  const streams = contentStreams(pdfText);
  assert.equal(physicalPageCount(pdfText), 2, "the calibration page is additional to the pattern sheet count");
  assert.equal(streams.length, 2);
  assert.match(streams[0], /% PAGE_KIND CALIBRATION_INSTRUCTIONS/);
  assert.doesNotMatch(streams[0], /BEGIN_PATTERN_GEOMETRY/, "the instruction page must contain no pattern geometry");
  assert.match(streams[0], /100mm x 100mm/);
  const calibration50 = streams[0].match(/% CALIBRATION_50MM_SIZE_PT ([\d.]+)/);
  assert.ok(calibration50);
  const escaped50 = calibration50[1].replace(".", "\\.");
  assert.match(
    streams[0],
    new RegExp(`[\\d.]+ [\\d.]+ ${escaped50} ${escaped50} re S`),
    "the 50mm calibration control must be a complete square"
  );
  assert.match(streams[0], /50mm x 50mm/);
  assert.match(streams[0], /Assembly Map/);

  const tile = streams[1];
  assert.match(tile, /% PATH_ROLE CUT SOLID NAME sample.cut\n[\d.]+ w\n\[\] 0 d/);
  assert.match(tile, /% PATH_ROLE STITCH DASHED NAME sample.seam\n[\d.]+ w\n\[4 2\] 0 d/);
  assert.match(tile, /% TITLE_BLOCK_UPRIGHT sample/);
  assert.match(tile, /% LABEL_UPRIGHT/);
  const flippedGeometryStart = tile.indexOf("1 0 0 -1");
  const flippedGeometryEnd = tile.indexOf("\nQ", flippedGeometryStart);
  assert.ok(flippedGeometryStart >= 0 && flippedGeometryEnd > flippedGeometryStart);
  assert.doesNotMatch(
    tile.slice(flippedGeometryStart, flippedGeometryEnd),
    /\nBT\n/,
    "text and title blocks must not be emitted under the flipped pattern transform"
  );
}

{
  const narrowResult = pdfExport(makeDraft(74, 120), { paperSize: "A4" });
  assert.equal(narrowResult.pageCount, 1);
  assert.equal(narrowResult.totalPageCount, 2);
  const narrowStreams = contentStreams(await narrowResult.data.text());
  assert.doesNotMatch(
    narrowStreams[1],
    /% TITLE_BLOCK_UPRIGHT/,
    "narrow gusset-like panels must not receive a title block that obscures construction marks"
  );
  assert.match(narrowStreams[1], /\(CENTER LABEL\) Tj/, "the panel's annotation label remains its identifier");

  const wideStreams = contentStreams((await pdfExport(makeDraft(75, 120), { paperSize: "A4" }).data.text()));
  assert.match(wideStreams[1], /% TITLE_BLOCK_UPRIGHT sample/, "the 75mm threshold still permits a full title block");
}

{
  const paperCases = [
    ["A4", 210, 297],
    ["A3", 297, 420],
    ["Letter", 215.9, 279.4],
    ["A0", 841, 1189],
  ];
  for (const [paperSize, widthMm, heightMm] of paperCases) {
    const { data, pageCount } = pdfExport(makeDraft(80, 80), { paperSize });
    assert.equal(pageCount, 1);
    const pdfText = await data.text();
    const boxes = mediaBoxes(pdfText);
    assert.equal(boxes.length, 2, `${paperSize} must be used for both physical pages`);
    boxes.forEach((box) => {
      closeTo(box.width, (widthMm / 25.4) * 72);
      closeTo(box.height, (heightMm / 25.4) * 72);
    });
    const calibration = pdfText.match(/% CALIBRATION_100MM_SIZE_PT ([\d.]+)/);
    assert.ok(calibration);
    closeTo(Number(calibration[1]), (100 / 25.4) * 72);
  }

  const aliasBoxes = mediaBoxes(await pdfExport(makeDraft(80, 80), { paperSize: "US-Letter" }).data.text());
  closeTo(aliasBoxes[0].width, (215.9 / 25.4) * 72);
  assert.throws(() => pdfExport(makeDraft(80, 80), { paperSize: "A5" }), /Unsupported PDF paper size/);
  assert.throws(() => pdfExport(makeDraft(80, 80), { paperSize: "bogus" }), /Unsupported PDF paper size/);
  assert.throws(() => pdfExport(makeDraft(80, 80), { paperSize: null }), /Unsupported PDF paper size/);
  assert.throws(() => pdfExport(makeDraft(80, 80), { orientation: "sideways" }), /Unsupported PDF orientation/);
}

{
  // A4's reserved pattern viewport is exactly 190 x 251mm. With a real 10mm
  // overlap the stride is 180 x 241mm, so this geometry ends exactly on R2C2.
  const { data, pageCount } = pdfExport(makeDraft(370, 492), { paperSize: "A4", marginMm: 10 });
  assert.equal(pageCount, 4, "exact tile-boundary geometry must not create an empty lower row");
  const pdfText = await data.text();
  const streams = contentStreams(pdfText);
  assert.equal(physicalPageCount(pdfText), 5);
  const tileStreams = streams.slice(1);
  const windows = Object.fromEntries(tileStreams.map((stream) => {
    const window = tileWindow(stream);
    return [window.id, window];
  }));
  assert.deepEqual(Object.keys(windows), ["R1C1", "R1C2", "R2C1", "R2C2"]);
  closeTo(windows.R1C1.x1 - windows.R1C2.x0, 10);
  closeTo(windows.R1C1.y1 - windows.R2C1.y0, 10);
  Object.values(windows).forEach((window) => closeTo(window.overlap, 10));
  assert.match(tileStreams[1], /GLUE LINE X - 10mm overlap/);
  assert.match(tileStreams[2], /GLUE LINE Y - 10mm overlap/);

  const repeatedGeometry = tileStreams.map((stream) =>
    stream.match(/% BEGIN_PATTERN_GEOMETRY\n([\s\S]*?)\n% END_PATTERN_GEOMETRY/)?.[1]
  );
  assert.ok(repeatedGeometry.every(Boolean));
  repeatedGeometry.slice(1).forEach((commands) => {
    assert.equal(commands, repeatedGeometry[0], "every overlapping tile must repeat the same source geometry");
  });
}

{
  const { data, pageCount } = pdfExport(makeDraft(190, 251), { paperSize: "A4", marginMm: 10 });
  assert.equal(pageCount, 1, "an exact viewport fit must not create an off-by-one row or column");
  const pdfText = await data.text();
  assert.equal(physicalPageCount(pdfText), 2);
  assert.doesNotMatch(pdfText, /PATTERN_TILE R2C1|PATTERN_TILE R1C2/);
}

{
  const topLeft = new Path().moveTo(0, 0).lineTo(100, 0).lineTo(100, 100).lineTo(0, 100).close();
  const topRight = new Path().moveTo(200, 0).lineTo(370, 0).lineTo(370, 200).lineTo(200, 200).close();
  const bottomLeft = new Path().moveTo(0, 292).lineTo(170, 292).lineTo(170, 492).lineTo(0, 492).close();
  const sparseDraft = {
    panels: [
      { id: "top_left", paths: { cut: topLeft } },
      { id: "top_right", paths: { cut: topRight } },
      { id: "bottom_left", paths: { cut: bottomLeft } },
    ],
    annotations: [],
    meta: { unit: "mm", title: "Sparse tile test" },
  };
  const { data, pageCount, totalPageCount } = pdfExport(sparseDraft, { paperSize: "A4", marginMm: 10 });
  assert.equal(pageCount, 3, "a grid cell with no pattern-piece bounds must not become a blank print page");
  assert.equal(totalPageCount, 4);
  const pdfText = await data.text();
  assert.equal(physicalPageCount(pdfText), 4);
  assert.doesNotMatch(pdfText, /% PAGE_KIND PATTERN_TILE R2C2/);
  assert.match(pdfText, /\(R2C2 X\) Tj/, "the assembly map must still explain the omitted grid cell");
  assert.match(pdfText, /Grey map cells marked X contain no pattern geometry and are not printed/);
}

{
  assert.throws(
    () => pdfExport({ panels: [], paths: {}, annotations: [], meta: { unit: "mm" } }),
    /at least one non-empty pattern path/
  );
  assert.throws(() => pdfExport(makeDraft(20, 20), { marginMm: -1 }), /marginMm/);
}

{
  const invalidUnit = makeDraft(20, 20);
  invalidUnit.meta.unit = "px";
  assert.throws(() => pdfExport(invalidUnit), /Unsupported PDF source unit/);
  const missingUnit = makeDraft(20, 20);
  delete missingUnit.meta.unit;
  assert.throws(() => pdfExport(missingUnit), /Unsupported PDF source unit/);

  const invalidPath = makeDraft(20, 20);
  invalidPath.panels[0].paths.cut.segments[1].points[1].x = Number.NaN;
  assert.throws(() => pdfExport(invalidPath), /must be finite/);
  const missingMove = makeDraft(20, 20);
  missingMove.panels[0].paths.cut.segments.shift();
  assert.throws(() => pdfExport(missingMove), /must begin with M/);

  const invalidAnnotation = makeDraft(20, 20);
  invalidAnnotation.annotations[0].point.x = Number.POSITIVE_INFINITY;
  assert.throws(() => pdfExport(invalidAnnotation), /finite point/);

  const degenerate = new Path().moveTo(0, 0).lineTo(0, 0).lineTo(0, 0).close();
  assert.throws(
    () => pdfExport({ paths: { cut: degenerate }, annotations: [], meta: { unit: "mm" } }),
    /invalid bounds|at least three distinct/,
  );
  const crossing = new Path()
    .moveTo(0, 0)
    .lineTo(100, 100)
    .lineTo(0, 100)
    .lineTo(80, 0)
    .close();
  assert.throws(
    () => pdfExport({ paths: { cut: crossing }, annotations: [], meta: { unit: "mm" } }),
    /self-intersection/,
  );
}

{
  const enormous = makeDraft(1_000_000_000, 20);
  const startedAt = Date.now();
  assert.throws(() => pdfExport(enormous), /tile grid exceeds the safe limit/);
  assert.ok(Date.now() - startedAt < 1000, "oversized tile grids must fail before page allocation");

  assert.throws(
    () => pdfExport(makeDraft(200, 20), { paperSize: "A4", marginMm: 10, overlapMm: 189.99999 }),
    /tile grid exceeds the safe limit/,
    "near-viewport overlap must not allocate millions of pages",
  );
}

{
  const boundaryMark = makeDraft(100, 251);
  boundaryMark.annotations = [{ type: "notch", point: { x: 50, y: 251 } }];
  const result = pdfExport(boundaryMark, { paperSize: "A4", marginMm: 10 });
  assert.equal(result.pageCount, 2, "a boundary notch must extend the tiled bounds instead of being clipped away");
  const pdfText = await result.data.text();
  assert.match(pdfText, /% PAGE_KIND PATTERN_TILE R2C1/);
}

{
  const localized = makeDraft(100, 120);
  localized.meta.title = { ru: "Русская выкройка", en: "Russian pattern" };
  localized.annotations = [{ type: "label", point: { x: 50, y: 60 }, text: { ru: "ЦЕНТР", en: "CENTER" } }];
  const { data } = pdfExport(localized, { resolveText: (value) => value?.ru || value?.en || "" });
  const pdfText = await data.text();
  assert.match(pdfText, /Russkaya vykroyka/);
  assert.match(pdfText, /TsENTR/);
}

{
  const result = pdfExport(makeDraft(100, 120), { paperSize: "A4" });
  const tile = contentStreams(await result.data.text())[1];
  const geometryClip = tile.match(/\nq\n([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) re W n\n1 0 0 -1/);
  assert.ok(geometryClip, "pattern geometry must have a dedicated clip rectangle");
  assert.ok(Number(geometryClip[1]) < (10 / 25.4) * 72, "cut ink may extend into the left print margin");
  assert.ok(Number(geometryClip[2]) < (22 / 25.4) * 72, "cut ink may extend below the content viewport");
}

{
  const curve = new Path()
    .moveTo(0, 0)
    .curveTo(0, -1000, 100, -900, 100, 0)
    .lineTo(100, 100)
    .lineTo(0, 100)
    .close();
  const sampledMinY = curve.bounds().minY;
  const exactMinY = exactPathBounds(curve).minY;
  assert.ok(exactMinY < sampledMinY - 0.4, "analytic bounds include extrema between fixed sample positions");

  const curvedDraft = {
    paths: { cut: curve },
    annotations: [],
    meta: { unit: "mm", title: "Bezier bounds" },
  };
  const pdfText = await pdfExport(curvedDraft, { paperSize: "A0" }).data.text();
  const tile = contentStreams(pdfText)[1];
  const transform = tile.match(/1 0 0 -1 ([\d.-]+) ([\d.-]+) cm/);
  assert.ok(transform);
  const pageHeightPt = (1189 / 25.4) * 72;
  const contentTopPt = (24 / 25.4) * 72;
  closeTo(Number(transform[2]), pageHeightPt - contentTopPt + (exactMinY / 25.4) * 72, 0.00001);
}
