import { Units } from "../geometry/Units.js";

function mergeBounds(boundsList) {
  const minX = Math.min(...boundsList.map((b) => b.minX));
  const minY = Math.min(...boundsList.map((b) => b.minY));
  const maxX = Math.max(...boundsList.map((b) => b.maxX));
  const maxY = Math.max(...boundsList.map((b) => b.maxY));
  return { minX, minY, maxX, maxY };
}

function wrapText(text, maxCharsPerLine) {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
      return;
    }
    if (current) {
      lines.push(current);
      current = word;
      return;
    }
    const chunks = word.match(new RegExp(`.{1,${maxCharsPerLine}}`, "g")) || [word];
    lines.push(...chunks.slice(0, -1));
    current = chunks[chunks.length - 1];
  });

  if (current) lines.push(current);
  return lines;
}

function renderMultilineText({ x, y, lines, fontSize, fill, lineHeight }) {
  if (!lines.length) return "";
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? "0" : `${lineHeight}px`;
      return `<tspan x="${x}" dy="${dy}">${line}</tspan>`;
    })
    .join("");
  return `<text x="${x}" y="${y}" font-size="${fontSize}px" fill="${fill}">${tspans}</text>`;
}

function resolveLabelText(value, resolveText) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (resolveText) return resolveText(value);
    return value.en || value.ru || "";
  }
  return "";
}

function renderAnnotations(annotations = [], { resolveText, labelFontSize }) {
  return annotations
    .map((anno) => {
      if (anno.type === "grainline") {
        return `<line x1="${anno.start.x}" y1="${anno.start.y}" x2="${anno.end.x}" y2="${anno.end.y}" stroke="#333" stroke-width="0.2" marker-end="url(#arrow)" />`;
      }
      if (anno.type === "notch") {
        return `<circle cx="${anno.point.x}" cy="${anno.point.y}" r="0.2" fill="#333" />`;
      }
      if (anno.type === "label") {
        const text = resolveLabelText(anno.text, resolveText);
        return `<text x="${anno.point.x}" y="${anno.point.y}" font-size="${labelFontSize}px" fill="#333">${text}</text>`;
      }
      return "";
    })
    .join("\n");
}

export function svgExport(draft, measurementsSummary = [], options = {}) {
  const paths = Object.values(draft.paths);
  const bounds = mergeBounds(paths.map((path) => path.bounds()));
  const meta = draft.meta || {};
  const unit = meta.unit || "cm";
  const resolveText = options.resolveText;
  const labels = options.labels || {};

  const marginLeft = Units.fromMm(10, unit);
  const marginRight = Units.fromMm(10, unit);
  const marginTop = Units.fromMm(10, unit);
  const marginBottom = Units.fromMm(35, unit);

  const exportBounds = {
    minX: bounds.minX - marginLeft,
    minY: bounds.minY - marginTop,
    maxX: bounds.maxX + marginRight,
    maxY: bounds.maxY + marginBottom,
  };
  const width = exportBounds.maxX - exportBounds.minX;
  const height = exportBounds.maxY - exportBounds.minY;
  const viewBox = `${exportBounds.minX} ${exportBounds.minY} ${width} ${height}`;

  const summaryText = measurementsSummary.join(", ");
  const seamAllowanceLabel = meta.seamAllowanceApplied
    ? labels.seamAllowanceOn || "On"
    : labels.seamAllowanceOff || "Off";
  const scaleInfo = `${labels.unitsLabel || "Units"}: ${unit} | ${labels.seamAllowanceLabel || "Seam allowance"}: ${seamAllowanceLabel}`;
  const calibrationSize = Units.fromMm(50, unit);
  const calibX = exportBounds.minX + Units.fromMm(4, unit);
  const calibY = exportBounds.minY + Units.fromMm(4, unit) + calibrationSize;

  const infoFontSize = 12;
  const compactFontSize = 10;
  const infoLineHeight = infoFontSize * 1.35;
  const legendLineHeight = compactFontSize * 1.3;

  const titleText = resolveLabelText(meta.title, resolveText) || labels.patternTitle || "Pattern";
  const titleLines = wrapText(titleText, 28);

  const summaryLines = wrapText(summaryText, 58);
  const scaleLines = wrapText(scaleInfo, 58);
  const legendText = labels.legendLines || "Cut line / Stitch line";
  const legendLines = wrapText(legendText, 46);

  const denseSummary = summaryLines.length > 2;
  const summaryFontSize = denseSummary ? compactFontSize : infoFontSize;
  const summaryLinesFinal = denseSummary ? wrapText(summaryText, 70) : summaryLines;

  const denseScale = scaleLines.length > 2;
  const scaleFontSize = denseScale ? compactFontSize : infoFontSize;
  const scaleLinesFinal = denseScale ? wrapText(scaleInfo, 70) : scaleLines;

  const annotationMarkup = renderAnnotations(draft.annotations, {
    resolveText,
    labelFontSize: 12,
  });

  const pathMarkup = paths
    .map((path, index) => {
      const name = Object.keys(draft.paths)[index];
      const isSeam = name.toLowerCase().includes("seam");
      const strokeWidth = Units.fromMm(isSeam ? 0.35 : 0.6, unit);
      const dashArray = isSeam
        ? ` stroke-dasharray="${Units.fromMm(3, unit)} ${Units.fromMm(2, unit)}"`
        : "";
      return `<path d="${path.toSVGPath()}" fill="none" stroke="#000" stroke-width="${strokeWidth}"${dashArray} data-name="${name}" />`;
    })
    .join("\n");

  const infoX = exportBounds.minX + Units.fromMm(4, unit);
  const infoY = exportBounds.maxY - Units.fromMm(22, unit);
  const titleY = infoY - Units.fromMm(8, unit);
  const scaleY = infoY + infoLineHeight * 0.2;
  const summaryY = scaleY + infoLineHeight * (scaleLinesFinal.length + 0.6);
  const legendY = summaryY + infoLineHeight * (summaryLinesFinal.length + 0.6);

  const annotationLegend = renderMultilineText({
    x: infoX,
    y: legendY,
    lines: legendLines,
    fontSize: compactFontSize,
    fill: "#555",
    lineHeight: legendLineHeight,
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${Units.toMm(width, unit)}mm" height="${Units.toMm(height, unit)}mm">
  <defs>
    <marker id="arrow" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L4,2 L0,4 z" fill="#333" />
    </marker>
  </defs>
  <rect x="${exportBounds.minX}" y="${exportBounds.minY}" width="${width}" height="${height}" fill="white" />
  ${pathMarkup}
  ${annotationMarkup}
  <g id="calibration-50mm" stroke="#d11" stroke-width="${Units.fromMm(0.4, unit)}" fill="none">
    <line x1="${calibX}" y1="${calibY}" x2="${calibX + calibrationSize}" y2="${calibY}" />
    <line x1="${calibX + calibrationSize}" y1="${calibY}" x2="${calibX + calibrationSize}" y2="${calibY - calibrationSize}" />
    <text x="${calibX}" y="${calibY + Units.fromMm(2, unit)}" font-size="${infoFontSize}px" fill="#d11">${labels.calibration || "50mm"}</text>
  </g>
  ${renderMultilineText({
    x: infoX,
    y: titleY,
    lines: titleLines,
    fontSize: infoFontSize,
    fill: "#333",
    lineHeight: infoLineHeight,
  })}
  ${renderMultilineText({
    x: infoX,
    y: scaleY,
    lines: scaleLinesFinal,
    fontSize: scaleFontSize,
    fill: "#555",
    lineHeight: infoLineHeight,
  })}
  ${renderMultilineText({
    x: infoX,
    y: summaryY,
    lines: summaryLinesFinal,
    fontSize: summaryFontSize,
    fill: "#555",
    lineHeight: infoLineHeight,
  })}
  ${annotationLegend}
</svg>`;
}
