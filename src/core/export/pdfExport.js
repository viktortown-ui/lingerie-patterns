import { Units } from "../geometry/Units.js";
import { collectPaths, hasSeamPaths } from "../pattern/panels.js";

const PAPER_SIZES = {
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
};

function mergeBounds(paths) {
  const boundsList = paths.map((path) => path.bounds());
  const minX = Math.min(...boundsList.map((b) => b.minX));
  const minY = Math.min(...boundsList.map((b) => b.minY));
  const maxX = Math.max(...boundsList.map((b) => b.maxX));
  const maxY = Math.max(...boundsList.map((b) => b.maxY));
  return { minX, minY, maxX, maxY };
}

function pathToPdf(path, unitScale) {
  const parts = [];
  path.segments.forEach((segment) => {
    if (segment.type === "M") {
      const [p] = segment.points;
      parts.push(`${p.x * unitScale} ${p.y * unitScale} m`);
    }
    if (segment.type === "L") {
      const [, p] = segment.points;
      parts.push(`${p.x * unitScale} ${p.y * unitScale} l`);
    }
    if (segment.type === "C") {
      const [, cp1, cp2, p] = segment.points;
      parts.push(
        `${cp1.x * unitScale} ${cp1.y * unitScale} ${cp2.x * unitScale} ${cp2.y * unitScale} ${p.x * unitScale} ${p.y * unitScale} c`
      );
    }
    if (segment.type === "Z") {
      parts.push("h");
    }
  });
  parts.push("S");
  return parts.join("\n");
}

function assemblyMarks({ marginPt, contentWidthPt, contentHeightPt }) {
  const mark = Units.toPtFromMm(4);
  const cross = Units.toPtFromMm(3);
  const corners = [
    { x: marginPt, y: marginPt },
    { x: marginPt + contentWidthPt, y: marginPt },
    { x: marginPt, y: marginPt + contentHeightPt },
    { x: marginPt + contentWidthPt, y: marginPt + contentHeightPt },
  ];
  const crosses = corners
    .map((corner) =>
      [
        `${corner.x - cross} ${corner.y} m ${corner.x + cross} ${corner.y} l`,
        `${corner.x} ${corner.y - cross} m ${corner.x} ${corner.y + cross} l`,
      ].join("\n")
    )
    .join("\n");
  const midpoints = [
    { x: marginPt + contentWidthPt / 2, y: marginPt },
    { x: marginPt + contentWidthPt / 2, y: marginPt + contentHeightPt },
    { x: marginPt, y: marginPt + contentHeightPt / 2 },
    { x: marginPt + contentWidthPt, y: marginPt + contentHeightPt / 2 },
  ];
  const midCrosses = midpoints
    .map((point) =>
      [
        `${point.x - cross} ${point.y} m ${point.x + cross} ${point.y} l`,
        `${point.x} ${point.y - cross} m ${point.x} ${point.y + cross} l`,
      ].join("\n")
    )
    .join("\n");
  return [
    `0 ${marginPt} m ${mark} ${marginPt} l`,
    `${marginPt} 0 m ${marginPt} ${mark} l`,
    `${contentWidthPt + marginPt - mark} ${marginPt} m ${contentWidthPt + marginPt} ${marginPt} l`,
    `${contentWidthPt + marginPt} ${marginPt} m ${contentWidthPt + marginPt} ${mark} l`,
    `${marginPt} ${contentHeightPt + marginPt} m ${mark} ${contentHeightPt + marginPt} l`,
    `${marginPt} ${contentHeightPt + marginPt - mark} m ${marginPt} ${contentHeightPt + marginPt} l`,
    `${contentWidthPt + marginPt - mark} ${contentHeightPt + marginPt} m ${contentWidthPt + marginPt} ${contentHeightPt + marginPt} l`,
    `${contentWidthPt + marginPt} ${contentHeightPt + marginPt - mark} m ${contentWidthPt + marginPt} ${contentHeightPt + marginPt} l`,
    crosses,
    midCrosses,
  ].join("\n");
}

function calibrationMark({ marginPt, pageHeightPt }) {
  const size = Units.toPtFromMm(50);
  const largeSize = Units.toPtFromMm(100);
  const x = marginPt;
  const y = pageHeightPt - marginPt - size;
  const largeX = x + size + Units.toPtFromMm(6);
  const largeY = pageHeightPt - marginPt - largeSize;
  return [
    "1 0 0 RG",
    "1 0 0 rg",
    `${x} ${y} m ${x + size} ${y} l`,
    `${x + size} ${y} l ${x + size} ${y + size} l`,
    "S",
    `${largeX} ${largeY} ${largeSize} ${largeSize} re`,
    "S",
    "BT",
    "/F1 8 Tf",
    `${x} ${y - Units.toPtFromMm(4)} Td`,
    "(50mm) Tj",
    "ET",
    "BT",
    "/F1 8 Tf",
    `${largeX} ${largeY - Units.toPtFromMm(4)} Td`,
    "(100mm) Tj",
    "ET",
    "0 0 0 RG",
    "0 0 0 rg",
  ].join("\n");
}

function resolveLabelText(value, resolveText) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (resolveText) return resolveText(value);
    return value.en || value.ru || "";
  }
  return "";
}

function annotationPaths(annotations, unitScale) {
  const arrowSize = Units.toPtFromMm(3);
  const arrowAngle = Math.PI / 6;
  const parts = [];

  annotations.forEach((anno) => {
    if (anno.type === "grainline") {
      const x1 = anno.start.x * unitScale;
      const y1 = anno.start.y * unitScale;
      const x2 = anno.end.x * unitScale;
      const y2 = anno.end.y * unitScale;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const leftX = x2 - arrowSize * Math.cos(angle - arrowAngle);
      const leftY = y2 - arrowSize * Math.sin(angle - arrowAngle);
      const rightX = x2 - arrowSize * Math.cos(angle + arrowAngle);
      const rightY = y2 - arrowSize * Math.sin(angle + arrowAngle);
      parts.push(`${x1} ${y1} m ${x2} ${y2} l`);
      parts.push(`${x2} ${y2} m ${leftX} ${leftY} l`);
      parts.push(`${x2} ${y2} m ${rightX} ${rightY} l`);
    }
    if (anno.type === "notch") {
      const x = anno.point.x * unitScale;
      const y = anno.point.y * unitScale;
      const size = Units.toPtFromMm(2.5);
      parts.push(`${x - size} ${y} m ${x + size} ${y} l`);
      parts.push(`${x} ${y - size} m ${x} ${y + size} l`);
    }
  });

  if (!parts.length) return "";
  return `${parts.join("\n")}\nS`;
}

function labelCommands({
  annotations,
  resolveText,
  unitScale,
  offsetPtX,
  offsetPtY,
  minXPt,
  minYPt,
  pageHeightPt,
  marginPt,
  contentWidthPt,
  contentHeightPt,
}) {
  const labels = annotations.filter((anno) => anno.type === "label");
  const commands = [];
  const tileMinXPt = minXPt + offsetPtX;
  const tileMaxXPt = tileMinXPt + contentWidthPt;
  const tileMinYPt = minYPt + offsetPtY;
  const tileMaxYPt = tileMinYPt + contentHeightPt;

  labels.forEach((anno) => {
    const xPt = anno.point.x * unitScale;
    const yPt = anno.point.y * unitScale;
    if (xPt < tileMinXPt || xPt > tileMaxXPt || yPt < tileMinYPt || yPt > tileMaxYPt) {
      return;
    }
    const pageX = xPt + marginPt - offsetPtX - minXPt;
    const pageY = pageHeightPt - (yPt + marginPt + offsetPtY + minYPt);
    commands.push("BT");
    const labelText = resolveLabelText(anno.text, resolveText);
    if (!labelText) return;
    commands.push("/F1 8 Tf");
    commands.push(`${pageX} ${pageY} Td`);
    commands.push(`(${String(labelText).replace(/[()]/g, "")}) Tj`);
    commands.push("ET");
  });

  return commands.join("\n");
}

function buildPdf(pages, pageSizePt) {
  const objects = [];
  const offsets = [];

  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = 2;
  objects.push("");

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const pageIds = pages.map((page) => {
    const contentId = addObject(`<< /Length ${page.stream.length} >>\nstream\n${page.stream}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> /MediaBox [0 0 ${pageSizePt.width} ${pageSizePt.height}] /Contents ${contentId} 0 R >>`
    );
    return pageId;
  });

  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  objects.forEach((obj, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

export function pdfExport(draft, options = {}) {
  const unit = draft.meta?.unit || "cm";
  const marginMm = options.marginMm ?? 10;
  const paper = PAPER_SIZES[options.paperSize] || PAPER_SIZES.A4;
  const info = options.info || {};
  const resolveText = options.resolveText;
  const labels = options.labels || {};
  const pathEntries = collectPaths(draft);
  const paths = pathEntries.map((entry) => entry.path);
  const bounds = mergeBounds(paths);
  const widthMm = Units.toMm(bounds.maxX - bounds.minX, unit);
  const heightMm = Units.toMm(bounds.maxY - bounds.minY, unit);

  const contentWidthMm = paper.widthMm - marginMm * 2;
  const contentHeightMm = paper.heightMm - marginMm * 2;

  const cols = Math.max(1, Math.ceil(widthMm / contentWidthMm));
  const rows = Math.max(1, Math.ceil(heightMm / contentHeightMm));

  const pageSizePt = {
    width: Units.toPtFromMm(paper.widthMm),
    height: Units.toPtFromMm(paper.heightMm),
  };

  const unitScale = Units.toPtFromMm(Units.toMm(1, unit));
  const minXPt = bounds.minX * unitScale;
  const minYPt = bounds.minY * unitScale;

  const pages = [];
  const seamAllowanceApplied = Boolean(draft.meta?.seamAllowanceApplied && hasSeamPaths(pathEntries));
  const cutLineWidth = Units.toPtFromMm(0.6);
  const seamLineWidth = Units.toPtFromMm(0.35);
  const patternLabel = labels.patternLabel || "Pattern";
  const generatedLabel = labels.generatedLabel || "Generated";
  const optionsLabel = labels.optionsLabel || "Options";
  const seamAllowanceLabel = labels.seamAllowanceLabel || "Seam allowance";

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const offsetMmX = col * contentWidthMm;
      const offsetMmY = row * contentHeightMm;
      const offsetPtX = Units.toPtFromMm(offsetMmX);
      const offsetPtY = Units.toPtFromMm(offsetMmY);
      const marginPt = Units.toPtFromMm(marginMm);
      const contentWidthPt = Units.toPtFromMm(contentWidthMm);
      const contentHeightPt = Units.toPtFromMm(contentHeightMm);

      const pathCommands = pathEntries
        .map((entry) => {
          const isSeam = (entry.pathName || entry.name).toLowerCase().includes("seam");
          const seamStyle = isSeam && seamAllowanceApplied;
          const dash = seamStyle ? "[3 2] 0 d" : "[] 0 d";
          const width = seamStyle ? `${seamLineWidth} w` : `${cutLineWidth} w`;
          return [width, dash, pathToPdf(entry.path, unitScale)].join("\n");
        })
        .join("\n");
      const annotationCommands = annotationPaths(draft.annotations || [], unitScale);
      const marks = assemblyMarks({ marginPt, contentWidthPt, contentHeightPt });
      const calibration =
        row === 0 && col === 0 ? calibrationMark({ marginPt, pageHeightPt: pageSizePt.height }) : "";
      const pageLabel = `R${row + 1}C${col + 1}`;
      const labelText = labelCommands({
        annotations: draft.annotations || [],
        resolveText,
        unitScale,
        offsetPtX,
        offsetPtY,
        minXPt,
        minYPt,
        pageHeightPt: pageSizePt.height,
        marginPt,
        contentWidthPt,
        contentHeightPt,
      });

      const infoLines = [];
      if (row === 0 && col === 0) {
        if (info.moduleName) infoLines.push(`${patternLabel}: ${info.moduleName}`);
        if (info.generatedAt) infoLines.push(`${generatedLabel}: ${info.generatedAt}`);
        if (info.optionsSummary) infoLines.push(`${optionsLabel}: ${info.optionsSummary}`);
        if (info.seamAllowance) infoLines.push(`${seamAllowanceLabel}: ${info.seamAllowance}`);
      }

      const infoBlock = infoLines.length
        ? [
            "BT",
            "/F1 8 Tf",
            "12 TL",
            `${marginPt} ${marginPt + Units.toPtFromMm(18)} Td`,
            infoLines
              .map((line, index) =>
                [index > 0 ? "T*" : "", `(${line.replace(/[()]/g, "")}) Tj`].join(" ").trim()
              )
              .join("\n"),
            "ET",
          ].join("\n")
        : "";

      const legendBlock =
        seamAllowanceApplied && row === 0 && col === 0 && info.legendText
          ? [
              "BT",
              "/F1 8 Tf",
              `${marginPt} ${marginPt + Units.toPtFromMm(10)} Td`,
              `(${info.legendText.replace(/[()]/g, "")}) Tj`,
              "ET",
            ].join("\n")
          : "";

      const instructions =
        row === 0 && col === 0 && info.instructionText
          ? [
              "BT",
              "/F1 8 Tf",
              `${marginPt} ${pageSizePt.height - marginPt - Units.toPtFromMm(10)} Td`,
              `(${info.instructionText.replace(/[()]/g, "")}) Tj`,
              "ET",
            ].join("\n")
          : "";

      const stream = [
        "q",
        `1 0 0 -1 0 ${pageSizePt.height} cm`,
        `${marginPt} ${marginPt} ${contentWidthPt} ${contentHeightPt} re W n`,
        `1 0 0 1 ${marginPt - offsetPtX - minXPt} ${marginPt + offsetPtY + minYPt} cm`,
        "0 0 0 RG",
        pathCommands,
        annotationCommands,
        "Q",
        "q",
        "0 0 0 rg",
        "0.5 w",
        marks,
        "S",
        calibration,
        instructions,
        "BT",
        "/F1 10 Tf",
        `${pageSizePt.width - marginPt - Units.toPtFromMm(30)} ${pageSizePt.height - marginPt - 12} Td`,
        `(${pageLabel}) Tj`,
        "ET",
        labelText,
        infoBlock,
        legendBlock,
        "Q",
      ].join("\n");

      pages.push({ stream });
    }
  }

  const pdfText = buildPdf(pages, pageSizePt);
  const data = new Blob([pdfText], { type: "application/pdf" });
  return { data, pageCount: pages.length };
}
