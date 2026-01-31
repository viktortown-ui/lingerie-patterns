import assert from "node:assert/strict";
import pantiesModule from "../src/patterns/panties_basic/module.js";
import rectangleModule from "../src/patterns/test_rectangle/module.js";
import { svgExport } from "../src/core/export/svgExport.js";
import { pdfExport } from "../src/core/export/pdfExport.js";

const draft = pantiesModule.draft(
  { waist: 70, hip: 95, rise: 23, legOpening: 55 },
  { seamAllowance: 0, style: "classic" }
);

{
  const svg = svgExport(draft, ["Test"]);
  assert.ok(svg.includes("<svg"));
  assert.ok(svg.includes("viewBox"));
  assert.ok(svg.includes('id="calibration-50mm"'));
  assert.ok(svg.includes('id="calibration-100mm"'));
}

{
  const { data, pageCount } = pdfExport(draft, { marginMm: 10, paperSize: "A4" });
  assert.ok(data instanceof Blob);
  assert.ok(data.size > 0);
  assert.ok(pageCount > 0);
  const pdfText = await data.text();
  assert.ok(pdfText.includes("50mm"));
  assert.ok(pdfText.includes("100mm"));
  assert.ok(/^[\x00-\x7F]*$/.test(pdfText));
}

{
  const seamDraft = pantiesModule.draft(
    { waist: 70, hip: 95, rise: 23, legOpening: 55 },
    { seamAllowance: 6, style: "classic" }
  );
  const svg = svgExport(seamDraft, ["Test"]);
  assert.ok(svg.includes("stroke-dasharray"));
  assert.ok(svg.includes("Cut line / Stitch line"));
}

{
  const rectangleDraft = rectangleModule.draft(
    { width_cm: 20, height_cm: 30, seam_allowance_cm: 1 },
    {}
  );
  const { pageCount } = pdfExport(rectangleDraft, { marginMm: 10, paperSize: "A4" });
  assert.ok(pageCount > 0);
}
