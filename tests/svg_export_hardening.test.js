import assert from "node:assert/strict";
import { svgExport } from "../src/core/export/svgExport.js";
import { Path } from "../src/core/geometry/Path.js";
import { Point } from "../src/core/geometry/Point.js";
import { stretchline } from "../src/core/pattern/annotations.js";
import { modules } from "../src/patterns/index.js";

function rectangle(x, y, width, height) {
  return new Path()
    .moveTo(x, y)
    .lineTo(x + width, y)
    .lineTo(x + width, y + height)
    .lineTo(x, y + height)
    .close();
}

function pathTag(svg, dataName) {
  return [...svg.matchAll(/<path\b[^>]*data-name="([^"]+)"[^>]*>/g)].find(
    (match) => match[1] === dataName
  )?.[0];
}

function titleBlockBounds(svg) {
  return [...svg.matchAll(
    /<g data-panel-title-block="([^"]*)" data-min-x="([^"]+)" data-min-y="([^"]+)" data-max-x="([^"]+)" data-max-y="([^"]+)">/g
  )].map((match) => ({
    id: match[1],
    minX: Number(match[2]),
    minY: Number(match[3]),
    maxX: Number(match[4]),
    maxY: Number(match[5]),
  }));
}

function overlaps(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function escapeXmlForAssertion(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const stretch = stretchline(
  new Point(1, 6),
  new Point(9, 6),
  { ru: "Растяжение & <поперёк>", en: "Stretch across" }
);
assert.equal(stretch.type, "stretchline");
assert.deepEqual(stretch.start, new Point(1, 6));

const frontId = 'front&"';
const draft = {
  panels: [
    {
      id: frontId,
      name: { ru: 'Перед & <деталь> "А"', en: "Front" },
      cutQty: { ru: '1 "со сгибом"', en: "1 on fold" },
      material: { ru: "Трикотаж 'тест'", en: "Test knit" },
      paths: {
        cut: rectangle(0, 0, 10, 12),
        seam: rectangle(0.5, 0.5, 9, 11),
      },
    },
    {
      id: "back",
      name: { ru: "Спинка", en: "Back" },
      cutQty: { ru: "1", en: "1" },
      material: { ru: "Трикотаж", en: "Knit" },
      paths: {
        cut: rectangle(13, 0, 10, 12),
        seam: rectangle(13.5, 0.5, 9, 11),
      },
    },
  ],
  annotations: [stretch],
  meta: {
    unit: "cm",
    title: { ru: "Тест <SVG> & безопасность", en: "SVG safety" },
    moduleId: 'module<&"',
    moduleVersion: "1.0",
    seamAllowanceApplied: true,
    seamAllowanceMm: 5,
  },
};

const resolveText = (value) => value?.ru || value?.en || "";
const svg = svgExport(draft, [{ ru: "Обхват & <мерка>", en: "Measurement" }], {
  resolveText,
  preserveAspectRatio: 'xMinYMin meet" onload="alert(1)',
  labels: {
    pieceLabel: { ru: "Деталь", en: "Piece" },
    cutLabel: { ru: "Кроить", en: "Cut" },
    materialLabel: { ru: "Материал", en: "Material" },
    moduleLabel: { ru: "Модуль", en: "Module" },
    seamAllowanceLabel: { ru: "Припуск", en: "Seam allowance" },
    calibration: '<50 & "мм">',
  },
});

const cut = pathTag(svg, "front&amp;&quot;.cut");
const seam = pathTag(svg, "front&amp;&quot;.seam");
assert.ok(cut, "cut path must be exported with its semantic name");
assert.ok(seam, "seam path must be exported with its semantic name");
assert.match(cut, /data-role="cut"/);
assert.doesNotMatch(cut, /stroke-dasharray=/);
assert.match(seam, /data-role="seam"/);
assert.match(seam, /stroke-dasharray=/);

assert.match(svg, /data-annotation="stretchline"/);
assert.match(svg, /marker-start="url\(#stretch-arrow\)"/);
assert.match(svg, /marker-end="url\(#stretch-arrow\)"/);
assert.ok(svg.includes("Растяжение &amp; &lt;поперёк&gt;"));

assert.ok(svg.includes("Деталь: Перед &amp; &lt;деталь&gt; &quot;А&quot;"));
assert.ok(svg.includes("Кроить: 1 &quot;со сгибом&quot;"));
assert.ok(svg.includes("Материал: Трикотаж &apos;тест&apos;"));
assert.ok(svg.includes("Модуль: module&lt;&amp;&quot; v1.0"));
assert.ok(svg.includes("Обхват &amp; &lt;мерка&gt;"));
assert.ok(svg.includes("&lt;50 &amp; &quot;мм&quot;&gt;"));
assert.ok(svg.includes('preserveAspectRatio="xMinYMin meet&quot; onload=&quot;alert(1)"'));
assert.doesNotMatch(svg, /\[object Object\]/);

const blocks = titleBlockBounds(svg);
assert.equal(blocks.length, 2);
assert.equal(blocks[0].id, "front&amp;&quot;");
assert.equal(
  overlaps(blocks[0], { minX: 13, minY: 0, maxX: 23, maxY: 12 }),
  false,
  "the front title block must avoid the neighboring back panel"
);

const calibrationMatch = svg.match(
  /<g id="calibration-100mm" data-content-min-y="([^"]+)"[\s\S]*?<rect x="[^"]+" y="([^"]+)" width="([^"]+)" height="([^"]+)" \/>/
);
assert.ok(calibrationMatch, "100mm calibration must be present in exports");
const contentMinY = Number(calibrationMatch[1]);
const calibrationY = Number(calibrationMatch[2]);
const calibrationHeight = Number(calibrationMatch[4]);
assert.ok(
  calibrationY + calibrationHeight < contentMinY,
  "calibration must be completely above pattern and title-block content"
);

const preview = svgExport(draft, [], { resolveText, mode: "preview" });
assert.doesNotMatch(preview, /data-panel-title-block=/);
assert.doesNotMatch(preview, /id="calibration-(?:50|100)mm"/);
assert.match(preview, /data-role="cut"/);
assert.match(preview, /data-role="seam"/);

const bilingualNameOnly = svgExport(
  {
    panels: [
      {
        name: { ru: "Деталь & без id", en: "Piece without id" },
        paths: { cut: rectangle(0, 0, 2, 2) },
      },
    ],
    annotations: [],
    meta: { unit: "cm" },
  },
  [],
  { resolveText, mode: "preview" }
);
assert.match(bilingualNameOnly, /data-name="Деталь &amp; без id\.cut"/);
assert.doesNotMatch(bilingualNameOnly, /\[object Object\]/);

for (const module of modules.filter((item) => !item.hidden)) {
  for (const language of ["ru", "en"]) {
    const measurements = { ...module.schema.defaults };
    const options = { ...module.schema.optionDefaults };
    const adjustments = { ...module.schema.adjustmentDefaults };
    const completeDraft = module.draft(measurements, options, adjustments);
    const summary = module.schema.fields.map((field) =>
      `${field.label?.[language] || field.key}: ${measurements[field.key]} ${module.unit}`
    );
    const completeSvg = svgExport(completeDraft, summary, {
      resolveText: (value) => value?.[language] || value?.en || value?.ru || String(value ?? ""),
    });
    const fontSizes = [...completeSvg.matchAll(/font-size="([^"]+)"/g)].map((match) => Number(match[1]));
    assert.ok(fontSizes.length > 0);
    assert.ok(fontSizes.every((value) => Number.isFinite(value) && value > 0), `${module.id}/${language}: positive font sizes`);
    const tspanOffsets = [...completeSvg.matchAll(/<tspan\b[^>]*\bdy="([^"]+)"/g)].map((match) => Number(match[1]));
    assert.ok(tspanOffsets.every((value) => Number.isFinite(value) && value >= 0), `${module.id}/${language}: valid line offsets`);
    assert.ok(completeSvg.includes(fieldText(module.schema.fields[0].label, language)), `${module.id}/${language}: summary is visible`);
    const summaryMetadata = completeSvg.match(/<metadata id="measurements-summary">([\s\S]*?)<\/metadata>/)?.[1];
    assert.ok(summaryMetadata, `${module.id}/${language}: full measurement metadata is present`);
    summary.forEach((item) => {
      assert.ok(
        summaryMetadata.includes(escapeXmlForAssertion(item)),
        `${module.id}/${language}: metadata retains ${item}`,
      );
    });
  }
}

function fieldText(labelValue, language) {
  return labelValue?.[language] || labelValue?.en || labelValue?.ru || "";
}

{
  const invalidUnit = { ...draft, meta: { ...draft.meta, unit: "px" } };
  assert.throws(() => svgExport(invalidUnit), /Unsupported SVG source unit/);
  const missingUnit = { ...draft, meta: { ...draft.meta } };
  delete missingUnit.meta.unit;
  assert.throws(() => svgExport(missingUnit), /Unsupported SVG source unit/);

  const invalidPath = rectangle(0, 0, 10, 10);
  invalidPath.segments[1].points[1].x = Number.NaN;
  assert.throws(
    () => svgExport({ paths: { cut: invalidPath }, annotations: [], meta: { unit: "cm" } }),
    /must be finite/,
  );

  const missingMove = rectangle(0, 0, 10, 10);
  missingMove.segments.shift();
  assert.throws(
    () => svgExport({ paths: { cut: missingMove }, annotations: [], meta: { unit: "cm" } }),
    /must begin with M/,
  );

  const invalidAnnotation = { ...draft, annotations: [{ type: "notch", point: { x: Infinity, y: 0 } }] };
  assert.throws(() => svgExport(invalidAnnotation), /finite point/);
}

{
  const degenerate = new Path().moveTo(0, 0).lineTo(0, 0).lineTo(0, 0).close();
  assert.throws(
    () => svgExport({ paths: { cut: degenerate }, annotations: [], meta: { unit: "mm" } }),
    /at least three distinct|invalid bounds/,
  );

  const crossing = new Path()
    .moveTo(0, 0)
    .lineTo(100, 100)
    .lineTo(0, 100)
    .lineTo(80, 0)
    .close();
  assert.throws(
    () => svgExport({ paths: { cut: crossing }, annotations: [], meta: { unit: "mm" } }),
    /self-intersection/,
  );

  const extreme = new Path()
    .moveTo(-1e308, 0)
    .lineTo(1e308, 0)
    .lineTo(0, 1)
    .close();
  assert.throws(
    () => svgExport({ paths: { cut: extreme }, annotations: [], meta: { unit: "mm" } }),
    /invalid|unbounded|numeric range/,
  );
}

{
  const unsafeTextDraft = {
    paths: { cut: rectangle(0, 0, 10, 10) },
    annotations: [{ type: "label", point: { x: 5, y: 5 }, text: "A\u0000B\ud800C\ufffeD\uffffE" }],
    meta: { unit: "mm" },
  };
  const safeSvg = svgExport(unsafeTextDraft, ["M\u0000N\ud800O"], { mode: "export" });
  assert.doesNotMatch(safeSvg, /[\u0000\ud800\ufffe\uffff]/);
  assert.match(safeSvg, /A\ufffdB\ufffdC\ufffdD\ufffdE/);
  assert.match(safeSvg, /M\ufffdN\ufffdO/);
}
