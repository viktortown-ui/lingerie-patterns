import assert from "node:assert/strict";
import pantiesModule from "../src/patterns/panties_basic/module.js";
import pantiesThongModule from "../src/patterns/panties_thong_basic/module.js";
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
  assert.ok(draft.panels.length > 1);
  const panelIds = draft.panels.map((panel) => panel.id);
  assert.ok(panelIds.includes("front"));
  assert.ok(panelIds.includes("back"));
  assert.ok(panelIds.includes("gusset"));
}

{
  const { data, pageCount } = pdfExport(draft, {
    marginMm: 10,
    paperSize: "A4",
    info: {
      moduleName: "Panties Basic",
      optionsSummary: "Style: Classic, Seam allowance: 0mm",
    },
    labels: {
      patternLabel: "Pattern",
      optionsLabel: "Options",
    },
  });
  assert.ok(data instanceof Blob);
  assert.ok(data.size > 0);
  assert.ok(pageCount > 0);
  const pdfText = await data.text();
  assert.ok(pdfText.includes("50mm"));
  assert.ok(pdfText.includes("100mm"));
  assert.ok(pdfText.includes("GLUE LINE"));
  assert.ok(pdfText.includes("Assembly Map"));
  assert.ok(pdfText.includes("Pattern: Panties Basic") || !pdfText.includes("module.panties_basic.name"));
  assert.ok(pdfText.includes("Options: Style: Classic"));
  assert.ok(pdfText.includes("Seam allowance: 0mm"));
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
  const seamDraft = pantiesModule.draft(
    { waist: 70, hip: 95, rise: 23, legOpening: 55 },
    { seamAllowance: 6, style: "classic" }
  );
  const { data } = pdfExport(seamDraft, { marginMm: 10, paperSize: "A4", info: { legendText: "Legend: cut line = solid, stitch line = dashed" } });
  const pdfText = await data.text();
  assert.ok(pdfText.includes("[4 2] 0 d"));
  assert.ok(pdfText.includes("Legend: cut line = solid, stitch line = dashed"));
}

{
  const rectangleDraft = rectangleModule.draft(
    { width_cm: 25, height_cm: 35, seam_allowance_cm: 0 },
    {}
  );
  const { data: a3Data, pageCount: a3Pages } = pdfExport(rectangleDraft, {
    marginMm: 10,
    paperSize: "A3",
  });
  assert.equal(a3Pages, 1);
  const a3Text = await a3Data.text();
  assert.ok(a3Text.includes("Page 1/1"));
  assert.ok(a3Text.includes("A3"));

  const { data: a4Data, pageCount: a4Pages } = pdfExport(rectangleDraft, {
    marginMm: 10,
    paperSize: "A4",
  });
  assert.equal(a4Pages, 4);
  const a4Text = await a4Data.text();
  assert.ok(a4Text.includes("Page 1/4"));
  assert.ok(a4Text.includes("A4"));
}

{
  const thongDraft = pantiesThongModule.draft(
    { waist: 70, hip: 95, rise: 23, legOpening: 55 },
    { seamAllowance: 0, thongWidthCm: 2 }
  );
  assert.ok(thongDraft.panels.length >= 3);
}

{
  const rectangleDraft = rectangleModule.draft(
    { width_cm: 20, height_cm: 30, seam_allowance_cm: 1 },
    {}
  );
  const { pageCount } = pdfExport(rectangleDraft, { marginMm: 10, paperSize: "A4" });
  assert.ok(pageCount > 0);
}
