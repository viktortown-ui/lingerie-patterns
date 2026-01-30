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

function wrapWithAutoSize(text, { maxChars, fontSize, minFontSize = 9, maxLines = 3 }) {
  if (!text) return { lines: [], fontSize };
  let nextFontSize = fontSize;
  let nextMaxChars = maxChars;
  let lines = wrapText(text, nextMaxChars);

  while (lines.length > maxLines && nextFontSize > minFontSize) {
    nextFontSize -= 1;
    const scale = fontSize / nextFontSize;
    nextMaxChars = Math.round(maxChars * scale);
    lines = wrapText(text, nextMaxChars);
  }

  return { lines, fontSize: nextFontSize };
}

function renderMultilineText({ x, y, lines, fontSize, fill, lineHeightEm = 1.2, formatFontSize }) {
  if (!lines.length) return "";
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? "0" : `${lineHeightEm}em`;
      return `<tspan x="${x}" dy="${dy}">${line}</tspan>`;
    })
    .join("");
  return `<text x="${x}" y="${y}" font-size="${formatFontSize(fontSize)}" fill="${fill}">${tspans}</text>`;
}

function resolveLabelText(value, resolveText) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (resolveText) return resolveText(value);
    return value.en || value.ru || "";
  }
  return "";
}

function renderAnnotations(
  annotations = [],
  {
    resolveText,
    labelFontSize,
    labelStrokeWidth,
    grainlineStrokeWidth,
    notchRadius,
    showLabels,
    formatFontSize,
    formatLength,
  }
) {
  return annotations
    .map((anno) => {
      if (anno.type === "grainline") {
        return `<line x1="${anno.start.x}" y1="${anno.start.y}" x2="${anno.end.x}" y2="${anno.end.y}" stroke="#333" stroke-width="${formatLength(
          grainlineStrokeWidth
        )}" marker-end="url(#arrow)" />`;
      }
      if (anno.type === "notch") {
        return `<circle cx="${anno.point.x}" cy="${anno.point.y}" r="${formatLength(
          notchRadius
        )}" fill="#333" />`;
      }
      if (anno.type === "label") {
        if (!showLabels) return "";
        const text = resolveLabelText(anno.text, resolveText);
        return `<text x="${anno.point.x}" y="${anno.point.y}" font-size="${formatFontSize(
          labelFontSize
        )}" fill="#111" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#fff" stroke-width="${formatLength(
          labelStrokeWidth
        )}" stroke-linejoin="round">${text}</text>`;
      }
      return "";
    })
    .join("\n");
}

export function svgExport(draft, measurementsSummary = [], options = {}) {
  const pathEntries = Object.entries(draft.paths);
  const paths = pathEntries.map(([, path]) => path);
  const geometryBounds = mergeBounds(paths.map((path) => path.bounds()));
  const meta = draft.meta || {};
  const unit = meta.unit || "cm";
  const resolveText = options.resolveText;
  const labels = options.labels || {};
  const mode = options.mode || "export";
  const includeInfo = mode !== "preview";
  const isPreview = mode === "preview";
  const showLabels = options.showLabels ?? true;

  const formatFontSize = (value) =>
    isPreview ? `${value}px` : `${Units.toMm(value, unit)}mm`;
  const formatLength = (value) =>
    isPreview ? `${value}px` : `${Units.toMm(value, unit)}mm`;
  const formatDashArray = (dash, gap) =>
    isPreview
      ? `${formatLength(dash)} ${formatLength(gap)}`
      : `${Units.toMm(dash, unit)}mm ${Units.toMm(gap, unit)}mm`;

  const marginLeft = Units.fromMm(10, unit);
  const marginRight = Units.fromMm(10, unit);
  const marginTop = Units.fromMm(10, unit);
  const marginBottom = Units.fromMm(35, unit);

  const exportBounds = {
    minX: geometryBounds.minX - marginLeft,
    minY: geometryBounds.minY - marginTop,
    maxX: geometryBounds.maxX + marginRight,
    maxY: geometryBounds.maxY + marginBottom,
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

  const infoFontSize = isPreview ? 12 : Units.fromMm(3.2, unit);
  const compactFontSize = isPreview ? 10 : Units.fromMm(2.6, unit);
  const lineHeightEm = 1.2;

  const hasSeamPaths = pathEntries.some(([name]) => name.toLowerCase().includes("seam"));
  const seamAllowanceApplied = Boolean(meta.seamAllowanceApplied && hasSeamPaths);

  const titleText = resolveLabelText(meta.title, resolveText) || labels.patternTitle || "Pattern";
  const titleBlock = wrapWithAutoSize(titleText, { maxChars: 28, fontSize: infoFontSize, maxLines: 2 });

  const summaryBlock = wrapWithAutoSize(summaryText, {
    maxChars: 58,
    fontSize: infoFontSize,
    maxLines: 3,
    minFontSize: compactFontSize,
  });
  const scaleBlock = wrapWithAutoSize(scaleInfo, {
    maxChars: 58,
    fontSize: infoFontSize,
    maxLines: 2,
    minFontSize: compactFontSize,
  });
  const legendText = seamAllowanceApplied ? labels.legendLines || "Cut line / Stitch line" : "";
  const legendBlock = wrapWithAutoSize(legendText, {
    maxChars: 46,
    fontSize: compactFontSize,
    maxLines: 2,
    minFontSize: 9,
  });

  const summaryLinesFinal = summaryBlock.lines;
  const scaleLinesFinal = scaleBlock.lines;
  const titleLines = titleBlock.lines;

  const annotationMarkup = renderAnnotations(draft.annotations, {
    resolveText,
    labelFontSize: isPreview ? 12 : Units.fromMm(3, unit),
    labelStrokeWidth: isPreview ? 2 : Units.fromMm(0.3, unit),
    grainlineStrokeWidth: isPreview ? 1 : Units.fromMm(0.2, unit),
    notchRadius: isPreview ? 2 : Units.fromMm(0.2, unit),
    showLabels,
    formatFontSize,
    formatLength,
  });

  const pathMarkup = pathEntries
    .map(([name, path]) => {
      const isSeam = name.toLowerCase().includes("seam");
      const seamStyle = seamAllowanceApplied && isSeam;
      const strokeWidth = isPreview ? (seamStyle ? 1 : 1.5) : Units.fromMm(seamStyle ? 0.35 : 0.6, unit);
      const dashArray = seamStyle
        ? ` stroke-dasharray="${formatDashArray(isPreview ? 6 : Units.fromMm(3, unit), isPreview ? 4 : Units.fromMm(2, unit))}"`
        : "";
      return `<path d="${path.toSVGPath()}" fill="none" stroke="#000" stroke-width="${formatLength(
        strokeWidth
      )}"${dashArray} data-name="${name}" />`;
    })
    .join("\n");

  const infoX = exportBounds.minX + Units.fromMm(4, unit);
  const infoY = exportBounds.maxY - Units.fromMm(22, unit);
  const titleY = infoY - Units.fromMm(8, unit);
  const scaleBlockHeight = scaleBlock.fontSize * lineHeightEm * scaleLinesFinal.length;
  const summaryBlockHeight = summaryBlock.fontSize * lineHeightEm * summaryLinesFinal.length;
  const scaleY = infoY + infoFontSize * 0.2;
  const summaryY = scaleY + scaleBlockHeight + infoFontSize * 0.6;
  const legendY = summaryY + summaryBlockHeight + infoFontSize * 0.6;

  const annotationLegend = includeInfo
    ? renderMultilineText({
        x: infoX,
        y: legendY,
        lines: legendBlock.lines,
        fontSize: legendBlock.fontSize,
        fill: "#555",
        formatFontSize,
      })
    : "";

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
  <g id="calibration-50mm" stroke="#d11" stroke-width="${formatLength(
    isPreview ? 1 : Units.fromMm(0.4, unit)
  )}" fill="none">
    <line x1="${calibX}" y1="${calibY}" x2="${calibX + calibrationSize}" y2="${calibY}" />
    <line x1="${calibX + calibrationSize}" y1="${calibY}" x2="${calibX + calibrationSize}" y2="${calibY - calibrationSize}" />
    <text x="${calibX}" y="${calibY + Units.fromMm(2, unit)}" font-size="${formatFontSize(
      infoFontSize
    )}" fill="#d11">${labels.calibration || "50mm"}</text>
  </g>
  ${
    includeInfo
      ? renderMultilineText({
          x: infoX,
          y: titleY,
          lines: titleLines,
          fontSize: titleBlock.fontSize,
          fill: "#333",
          formatFontSize,
        })
      : ""
  }
  ${
    includeInfo
      ? renderMultilineText({
          x: infoX,
          y: scaleY,
          lines: scaleLinesFinal,
          fontSize: scaleBlock.fontSize,
          fill: "#555",
          formatFontSize,
        })
      : ""
  }
  ${
    includeInfo
      ? renderMultilineText({
          x: infoX,
          y: summaryY,
          lines: summaryLinesFinal,
          fontSize: summaryBlock.fontSize,
          fill: "#555",
          formatFontSize,
        })
      : ""
  }
  ${annotationLegend}
</svg>`;
}
