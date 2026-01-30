import assert from "node:assert/strict";
import pantiesModule from "../src/patterns/panties_basic/module.js";
import { svgExport } from "../src/core/export/svgExport.js";
import { pdfExport } from "../src/core/export/pdfExport.js";

const draft = pantiesModule.draft(
  { waist: 70, hip: 95, rise: 23, legOpening: 55 },
  { seamAllowance: "off", style: "classic" }
);

{
  const svg = svgExport(draft, ["Test"]);
  assert.ok(svg.includes("<svg"));
  assert.ok(svg.includes("viewBox"));
}

{
  const { data, pageCount } = pdfExport(draft, { marginMm: 10 });
  assert.ok(data instanceof Blob);
  assert.ok(pageCount > 0);
}
