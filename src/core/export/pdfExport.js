import { Units } from "../geometry/Units.js";

const A4 = { widthMm: 210, heightMm: 297 };

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
  const mark = 12;
  return [
    `0 ${marginPt} m ${mark} ${marginPt} l`,
    `${marginPt} 0 m ${marginPt} ${mark} l`,
    `${contentWidthPt + marginPt - mark} ${marginPt} m ${contentWidthPt + marginPt} ${marginPt} l`,
    `${contentWidthPt + marginPt} ${marginPt} m ${contentWidthPt + marginPt} ${mark} l`,
    `${marginPt} ${contentHeightPt + marginPt} m ${mark} ${contentHeightPt + marginPt} l`,
    `${marginPt} ${contentHeightPt + marginPt - mark} m ${marginPt} ${contentHeightPt + marginPt} l`,
    `${contentWidthPt + marginPt - mark} ${contentHeightPt + marginPt} m ${contentWidthPt + marginPt} ${contentHeightPt + marginPt} l`,
    `${contentWidthPt + marginPt} ${contentHeightPt + marginPt - mark} m ${contentWidthPt + marginPt} ${contentHeightPt + marginPt} l`,
  ].join("\n");
}

function calibrationMark({ marginPt }) {
  const size = Units.toPtFromMm(10);
  const x = marginPt;
  const y = marginPt + size + 6;
  return [
    `${x} ${y} m ${x + size} ${y} l`,
    `${x + size} ${y} l ${x + size} ${y - size} l`,
    `${x + size} ${y - size} l ${x} ${y - size} l`,
    `${x} ${y - size} l ${x} ${y} l`,
    "S",
    "BT",
    "/F1 8 Tf",
    `${x} ${y + 4} Td`,
    "(10mm calibration) Tj",
    "ET",
  ].join("\n");
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
  const paths = Object.values(draft.paths);
  const bounds = mergeBounds(paths);
  const widthMm = Units.toMm(bounds.maxX - bounds.minX, unit);
  const heightMm = Units.toMm(bounds.maxY - bounds.minY, unit);

  const contentWidthMm = A4.widthMm - marginMm * 2;
  const contentHeightMm = A4.heightMm - marginMm * 2;

  const cols = Math.max(1, Math.ceil(widthMm / contentWidthMm));
  const rows = Math.max(1, Math.ceil(heightMm / contentHeightMm));

  const pageSizePt = {
    width: Units.toPtFromMm(A4.widthMm),
    height: Units.toPtFromMm(A4.heightMm),
  };

  const unitScale = Units.toPtFromMm(Units.toMm(1, unit));
  const minXPt = bounds.minX * unitScale;
  const minYPt = bounds.minY * unitScale;

  const pages = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const offsetMmX = col * contentWidthMm;
      const offsetMmY = row * contentHeightMm;
      const offsetPtX = Units.toPtFromMm(offsetMmX);
      const offsetPtY = Units.toPtFromMm(offsetMmY);
      const marginPt = Units.toPtFromMm(marginMm);
      const contentWidthPt = Units.toPtFromMm(contentWidthMm);
      const contentHeightPt = Units.toPtFromMm(contentHeightMm);

      const pathCommands = paths.map((path) => pathToPdf(path, unitScale)).join("\n");
      const marks = assemblyMarks({ marginPt, contentWidthPt, contentHeightPt });
      const calibration = row === 0 && col === 0 ? calibrationMark({ marginPt }) : "";

      const stream = [
        "q",
        `1 0 0 -1 0 ${pageSizePt.height} cm`,
        `${marginPt} ${marginPt} ${contentWidthPt} ${contentHeightPt} re W n`,
        `1 0 0 1 ${marginPt - offsetPtX - minXPt} ${marginPt + offsetPtY + minYPt} cm`,
        "0.5 w",
        pathCommands,
        "Q",
        "q",
        "0 0 0 rg",
        "0.5 w",
        marks,
        "S",
        calibration,
        "BT",
        "/F1 10 Tf",
        `${marginPt} ${pageSizePt.height - marginPt - 12} Td`,
        `(${row + 1},${col + 1}) Tj`,
        "ET",
        "Q",
      ].join("\n");

      pages.push({ stream });
    }
  }

  const pdfText = buildPdf(pages, pageSizePt);
  const data = new Blob([pdfText], { type: "application/pdf" });
  return { data, pageCount: pages.length };
}
