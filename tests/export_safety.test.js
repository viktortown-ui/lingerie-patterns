import assert from "node:assert/strict";
import test from "node:test";
import rectangleModule from "../src/patterns/test_rectangle/module.js";
import { buildDxfExport } from "../src/core/export/dxfExport.js";
import { parseAsciiDxf } from "../src/core/export/dxfParser.js";
import {
  EXPERIMENTAL_EXPORT_CODE,
  EXPERIMENTAL_EXPORT_SHORT_WARNING,
  EXPERIMENTAL_EXPORT_WARNING,
  qualifyExportFilename,
  resolveExportSafety,
  strictestExportSafety,
} from "../src/core/export/exportSafety.js";
import { pdfExport } from "../src/core/export/pdfExport.js";
import { svgExport } from "../src/core/export/svgExport.js";

function rectangleDraft({ experimental = false } = {}) {
  const draft = rectangleModule.draft(
    { width_cm: 25, height_cm: 35, seam_allowance_cm: 0 },
    {},
  );
  if (experimental) draft.meta.fitStatus = "experimental";
  return draft;
}

test("export safety resolves experimental status fail-safe from module or draft", () => {
  const readyDraft = rectangleDraft();
  const experimentalDraft = rectangleDraft({ experimental: true });

  assert.equal(resolveExportSafety({ draft: readyDraft, moduleStatus: "ready-for-toile" }).experimental, false);
  assert.equal(resolveExportSafety({ draft: experimentalDraft, moduleStatus: "ready-for-toile" }).experimental, true);
  assert.equal(resolveExportSafety({ draft: readyDraft, moduleStatus: "experimental" }).experimental, true);
  assert.equal(resolveExportSafety({ draft: readyDraft, module: { status: "experimental" } }).experimental, true);
  assert.equal(resolveExportSafety({ draft: { ...readyDraft, meta: { ...readyDraft.meta, moduleStatus: "experimental" } } }).experimental, true);
});

test("experimental filenames receive one stable warning suffix", () => {
  const safety = resolveExportSafety({ moduleStatus: "experimental" });
  assert.equal(qualifyExportFilename("bralette.svg", safety), "bralette_EXPERIMENTAL_TOILE_ONLY.svg");
  assert.equal(
    qualifyExportFilename("bralette_EXPERIMENTAL_TOILE_ONLY.svg", safety),
    "bralette_EXPERIMENTAL_TOILE_ONLY.svg",
  );
  assert.equal(qualifyExportFilename("panties.pdf", resolveExportSafety()), "panties.pdf");
});

test("a compound export inherits the strictest variant safety", () => {
  const ready = resolveExportSafety({ moduleStatus: "ready-for-toile" });
  const experimental = resolveExportSafety({ moduleStatus: "experimental" });
  assert.equal(strictestExportSafety([ready, ready]).experimental, false);
  assert.equal(strictestExportSafety([ready, experimental]).experimental, true);
  assert.equal(strictestExportSafety([experimental, ready]).code, EXPERIMENTAL_EXPORT_CODE);
});

test("SVG visibly and machine-readably marks experimental exports only", () => {
  const readySvg = svgExport(rectangleDraft(), ["Ready"]);
  const experimentalSvg = svgExport(rectangleDraft({ experimental: true }), ["Experimental"]);
  const previewSvg = svgExport(rectangleDraft({ experimental: true }), [], { mode: "preview" });

  assert.doesNotMatch(readySvg, /EXPERIMENTAL_TOILE_ONLY|lekalo-export-safety-warning/u);
  assert.match(experimentalSvg, /data-fit-status="experimental"/u);
  assert.match(experimentalSvg, new RegExp(`data-export-warning-code="${EXPERIMENTAL_EXPORT_CODE}"`, "u"));
  assert.match(experimentalSvg, /<metadata id="lekalo-export-safety">status=experimental;/u);
  assert.match(experimentalSvg, new RegExp(EXPERIMENTAL_EXPORT_SHORT_WARNING, "u"));
  assert.match(experimentalSvg, /NOT FOR PRODUCTION/u);
  assert.doesNotMatch(previewSvg, /EXPERIMENTAL_TOILE_ONLY|lekalo-export-safety-warning/u);
});

test("PDF repeats the experimental warning on its guide and every pattern sheet", async () => {
  const ready = pdfExport(rectangleDraft(), { marginMm: 10, paperSize: "A4" });
  const experimental = pdfExport(rectangleDraft({ experimental: true }), {
    marginMm: 10,
    paperSize: "A4",
  });
  const readyText = await ready.data.text();
  const experimentalText = await experimental.data.text();
  const markerCount = experimentalText.match(new RegExp(`% EXPORT_WARNING_CODE ${EXPERIMENTAL_EXPORT_CODE}`, "gu"))?.length || 0;

  assert.doesNotMatch(readyText, /EXPERIMENTAL_TOILE_ONLY|EXPERIMENTAL - TOILE ONLY/u);
  assert.match(experimentalText, new RegExp(EXPERIMENTAL_EXPORT_WARNING, "u"));
  assert.match(experimentalText, /Export status: EXPERIMENTAL - TOILE ONLY - FIT NOT VERIFIED/u);
  assert.equal(markerCount, experimental.totalPageCount);
});

test("DXF embeds experimental status in comments, every contour, visible text, report, and filename", () => {
  const ready = buildDxfExport(rectangleDraft());
  const experimental = buildDxfExport(rectangleDraft({ experimental: true }), {
    includePieceMetadataText: false,
  });
  const readyParsed = parseAsciiDxf(ready.data);
  const parsed = parseAsciiDxf(experimental.data);
  const contours = parsed.entities.filter((entity) => entity.type === "POLYLINE");
  const warnings = parsed.entities.filter((entity) =>
    entity.type === "TEXT" && entity.xdata.includes("TEXT_ROLE=EXPORT_SAFETY_WARNING"));

  assert.ok(parsed.comments.includes(`EXPORT_WARNING_CODE=${EXPERIMENTAL_EXPORT_CODE}`));
  assert.ok(parsed.comments.includes("FIT_STATUS=experimental"));
  assert.ok(parsed.comments.includes("USAGE=toile-only"));
  assert.ok(parsed.comments.includes("PRODUCTION_VERIFIED=NO"));
  assert.ok(parsed.comments.includes(EXPERIMENTAL_EXPORT_WARNING));
  assert.ok(contours.length > 0);
  contours.forEach((entity) => {
    assert.ok(entity.xdata.includes("FIT_STATUS=experimental"));
    assert.ok(entity.xdata.includes(`EXPORT_WARNING_CODE=${EXPERIMENTAL_EXPORT_CODE}`));
    assert.ok(entity.xdata.includes("USAGE=toile-only"));
    assert.ok(entity.xdata.includes("PRODUCTION_VERIFIED=NO"));
  });
  assert.equal(warnings.length, rectangleDraft().panels.length);
  assert.ok(warnings.every((entity) => entity.text === EXPERIMENTAL_EXPORT_WARNING));
  assert.equal(experimental.fileName, "test_rectangle_EXPERIMENTAL_TOILE_ONLY.dxf");
  assert.equal(experimental.report.fitStatus, "experimental");
  assert.equal(experimental.report.usage, "toile-only");
  assert.equal(experimental.report.exportWarningCode, EXPERIMENTAL_EXPORT_CODE);

  assert.doesNotMatch(ready.data, /EXPERIMENTAL_TOILE_ONLY|FIT_STATUS=experimental/u);
  assert.ok(!readyParsed.entities.some((entity) => entity.xdata.includes("FIT_STATUS=experimental")));
  assert.equal(ready.fileName, "test_rectangle.dxf");
  assert.equal("fitStatus" in ready.report, false);
});

test("DXF keeps a visible experimental warning when a valid draft has no panel descriptors", () => {
  const draft = rectangleDraft({ experimental: true });
  draft.panels = [];
  const parsed = parseAsciiDxf(buildDxfExport(draft, { includePieceMetadataText: false }).data);
  const warnings = parsed.entities.filter((entity) =>
    entity.type === "TEXT" && entity.xdata.includes("TEXT_ROLE=EXPORT_SAFETY_WARNING"));
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].text, EXPERIMENTAL_EXPORT_WARNING);
});
