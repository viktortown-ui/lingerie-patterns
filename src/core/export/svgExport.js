import { Units } from "../geometry/Units.js";
import { collectPaths, hasSeamPaths } from "../pattern/panels.js";

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

function renderMultilineText({
  x,
  y,
  lines,
  fontSize,
  fill,
  lineHeight,
  formatFontSize,
  formatLength,
}) {
  if (!lines.length) return "";
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? "0" : formatLength(lineHeight);
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
    controlSize,
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
      if (anno.type === "foldline") {
        const midX = (anno.start.x + anno.end.x) / 2;
        const midY = (anno.start.y + anno.end.y) / 2;
        const label = showLabels ? resolveLabelText(anno.label, resolveText) : "";
        return [
          `<line x1="${anno.start.x}" y1="${anno.start.y}" x2="${anno.end.x}" y2="${anno.end.y}" stroke="#666" stroke-width="${formatLength(
            grainlineStrokeWidth
          )}" stroke-dasharray="${formatLength(grainlineStrokeWidth * 6)} ${formatLength(
            grainlineStrokeWidth * 4
          )}" />`,
          label
            ? `<text x="${midX}" y="${midY}" font-size="${formatFontSize(
                labelFontSize * 0.9
              )}" fill="#444" text-anchor="middle" dominant-baseline="middle">${label}</text>`
            : "",
        ].join("\n");
      }
      if (anno.type === "control") {
        const size = formatLength(controlSize);
        return [
          `<circle cx="${anno.point.x}" cy="${anno.point.y}" r="${size}" fill="none" stroke="#555" stroke-width="${formatLength(
            grainlineStrokeWidth
          )}" />`,
          `<line x1="${anno.point.x - controlSize}" y1="${anno.point.y}" x2="${anno.point.x + controlSize}" y2="${anno.point.y}" stroke="#555" stroke-width="${formatLength(
            grainlineStrokeWidth
          )}" />`,
          `<line x1="${anno.point.x}" y1="${anno.point.y - controlSize}" x2="${anno.point.x}" y2="${anno.point.y + controlSize}" stroke="#555" stroke-width="${formatLength(
            grainlineStrokeWidth
          )}" />`,
        ].join("\n");
      }
      if (anno.type === "label") {
        if (!showLabels) return "";
        const text = resolveLabelText(anno.text, resolveText);
        const fontSize = anno.kind === "edge" ? labelFontSize * 0.9 : labelFontSize;
        const fill = anno.kind === "edge" ? "#0b4b8a" : "#111";
        return `<text x="${anno.point.x}" y="${anno.point.y}" font-size="${formatFontSize(
          fontSize
        )}" fill="${fill}" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#fff" stroke-width="${formatLength(
          labelStrokeWidth
        )}" stroke-linejoin="round">${text}</text>`;
      }
      return "";
    })
    .join("\n");
}

function panelBounds(panel) {
  const paths = panel?.paths ? Object.values(panel.paths) : [];
  if (!paths.length) return null;
  return mergeBounds(paths.map((path) => path.bounds()));
}

function buildTitleBlock(panel, draftMeta, resolveText, labels, unit) {
  const pieceName = panel.name || panel.id || labels.pieceLabel || "Piece";
  const lines = [`${labels.pieceLabel || "Piece"}: ${pieceName}`];
  if (panel.cutQty) lines.push(`${labels.cutLabel || "Cut"}: ${panel.cutQty}`);
  if (panel.material) lines.push(`${labels.materialLabel || "Material"}: ${panel.material}`);
  const moduleId = draftMeta?.moduleId || "module";
  const moduleVersion = draftMeta?.moduleVersion || "0.0";
  lines.push(`${labels.moduleLabel || "Module"}: ${moduleId} v${moduleVersion}`);
  const seamValue = Number.isFinite(draftMeta?.seamAllowanceMm) ? `${draftMeta.seamAllowanceMm}mm` : "0mm";
  lines.push(`${labels.seamAllowanceLabel || "Seam allowance"}: ${seamValue}`);
  return lines.map((line) => resolveLabelText(line, resolveText));
}

function renderTitleBlocks({
  panels,
  draftMeta,
  resolveText,
  labels,
  unit,
  formatFontSize,
  formatLength,
}) {
  const blockWidth = Units.fromMm(42, unit);
  const padding = Units.fromMm(2.5, unit);
  const fontSize = Units.fromMm(2.6, unit);
  const lineHeight = fontSize * 1.25;
  const blocks = [];
  const boundsList = [];

  panels.forEach((panel) => {
    const bounds = panelBounds(panel);
    if (!bounds) return;
    const lines = buildTitleBlock(panel, draftMeta, resolveText, labels, unit).filter(Boolean);
    if (!lines.length) return;
    const blockHeight = padding * 2 + lines.length * lineHeight;
    let x = bounds.maxX + Units.fromMm(6, unit);
    let y = bounds.minY + Units.fromMm(6, unit);

    const textSpans = lines
      .map((line, index) => {
        const textY = y + padding + lineHeight * (index + 0.8);
        return `<text x="${x + padding}" y="${textY}" font-size="${formatFontSize(
          fontSize
        )}" fill="#111">${line}</text>`;
      })
      .join("\n");

    blocks.push(
      [
        `<rect x="${x}" y="${y}" width="${blockWidth}" height="${blockHeight}" fill="#fff" stroke="#666" stroke-width="${formatLength(
          Units.fromMm(0.2, unit)
        )}" rx="${formatLength(Units.fromMm(1, unit))}" />`,
        textSpans,
      ].join("\n")
    );
    boundsList.push({
      minX: x,
      minY: y,
      maxX: x + blockWidth,
      maxY: y + blockHeight,
    });
  });

  return { markup: blocks.join("\n"), bounds: boundsList };
}

export function svgExport(draft, measurementsSummary = [], options = {}) {
  const pathEntries = collectPaths(draft);
  const paths = pathEntries.map((entry) => entry.path);
  const geometryBounds = mergeBounds(paths.map((path) => path.bounds()));
  const meta = draft.meta || {};
  const unit = meta.unit || "cm";
  const resolveText = options.resolveText;
  const labels = options.labels || {};
  const mode = options.mode || "export";
  const includeInfo = mode !== "preview";
  const isPreview = mode === "preview";
  const highlightSeamAllowance = Boolean(options.highlightSeamAllowance && isPreview);
  const showLabels = options.showLabels ?? true;
  const preserveAspectRatio = options.preserveAspectRatio || "xMinYMin meet";

  const formatLength = (value) => `${value}`;
  const formatFontSize = formatLength;
  const formatDashArray = (dash, gap) => `${formatLength(dash)} ${formatLength(gap)}`;

  const marginLeft = Units.fromMm(10, unit);
  const marginRight = Units.fromMm(10, unit);
  const marginTop = Units.fromMm(10, unit);
  const marginBottom = Units.fromMm(35, unit);

  let exportBounds = {
    minX: geometryBounds.minX - marginLeft,
    minY: geometryBounds.minY - marginTop,
    maxX: geometryBounds.maxX + marginRight,
    maxY: geometryBounds.maxY + marginBottom,
  };
  const titleBlocks = renderTitleBlocks({
    panels: draft.panels || [],
    draftMeta: meta,
    resolveText,
    labels,
    unit,
    formatFontSize,
    formatLength,
  });
  if (titleBlocks.bounds.length) {
    const blockBounds = mergeBounds(titleBlocks.bounds);
    exportBounds = {
      minX: Math.min(exportBounds.minX, blockBounds.minX - Units.fromMm(2, unit)),
      minY: Math.min(exportBounds.minY, blockBounds.minY - Units.fromMm(2, unit)),
      maxX: Math.max(exportBounds.maxX, blockBounds.maxX + Units.fromMm(2, unit)),
      maxY: Math.max(exportBounds.maxY, blockBounds.maxY + Units.fromMm(2, unit)),
    };
  }
  const width = exportBounds.maxX - exportBounds.minX;
  const height = exportBounds.maxY - exportBounds.minY;
  const viewBox = `${exportBounds.minX} ${exportBounds.minY} ${width} ${height}`;

  const summaryText = measurementsSummary.join(", ");
  const seamAllowanceLabel =
    meta.seamAllowanceApplied && meta.seamAllowanceMm
      ? `${meta.seamAllowanceMm}mm`
      : labels.seamAllowanceOff || "Off";
  const scaleInfo = `${labels.unitsLabel || "Units"}: ${unit} | ${labels.seamAllowanceLabel || "Seam allowance"}: ${seamAllowanceLabel}`;
  const calibrationSize = Units.fromMm(50, unit);
  const calibX = exportBounds.minX + Units.fromMm(4, unit);
  const calibY = exportBounds.minY + Units.fromMm(4, unit) + calibrationSize;

  const infoFontSize = Units.fromMm(3.2, unit);
  const compactFontSize = Units.fromMm(2.6, unit);
  const lineHeightFactor = 1.2;

  const seamAllowanceApplied = Boolean(meta.seamAllowanceApplied && hasSeamPaths(pathEntries));

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
    labelFontSize: Units.fromMm(3, unit),
    labelStrokeWidth: Units.fromMm(0.3, unit),
    grainlineStrokeWidth: Units.fromMm(0.2, unit),
    notchRadius: Units.fromMm(0.2, unit),
    controlSize: Units.fromMm(0.6, unit),
    showLabels,
    formatFontSize,
    formatLength,
  });

  const pathMarkup = pathEntries
    .map((entry) => {
      const isSeam = (entry.pathName || entry.name).toLowerCase().includes("seam");
      const seamStyle = seamAllowanceApplied && isSeam;
      const seamStroke = highlightSeamAllowance ? 0.9 : 0.45;
      const strokeWidth = Units.fromMm(seamStyle ? seamStroke : 0.6, unit);
      const dashArray = seamStyle
        ? ` stroke-dasharray="${formatDashArray(
            Units.fromMm(highlightSeamAllowance ? 4 : 3, unit),
            Units.fromMm(highlightSeamAllowance ? 3 : 2, unit)
          )}"`
        : "";
      return `<path d="${entry.path.toSVGPath()}" fill="none" stroke="#000" stroke-width="${formatLength(
        strokeWidth
      )}"${dashArray} data-name="${entry.name}" />`;
    })
    .join("\n");

  const infoX = exportBounds.minX + Units.fromMm(4, unit);
  const infoY = exportBounds.maxY - Units.fromMm(22, unit);
  const titleY = infoY - Units.fromMm(8, unit);
  const scaleBlockHeight = scaleBlock.fontSize * lineHeightFactor * scaleLinesFinal.length;
  const summaryBlockHeight = summaryBlock.fontSize * lineHeightFactor * summaryLinesFinal.length;
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
        lineHeight: legendBlock.fontSize * lineHeightFactor,
        formatFontSize,
        formatLength,
      })
    : "";

  const calibrationLarge = Units.fromMm(100, unit);
  const calibLargeX = calibX + calibrationSize + Units.fromMm(6, unit);
  const calibLargeY = exportBounds.minY + Units.fromMm(4, unit);
  const tickStep = calibrationSize / 5;
  const tickHeight = Units.fromMm(2.4, unit);
  const tickLabelOffset = Units.fromMm(4.2, unit);
  const tickFontSize = Units.fromMm(2.6, unit);
  const tickLabels = Array.from({ length: 6 }, (_, index) => {
    const x = calibX + tickStep * index;
    const value = index * 10;
    return [
      `<line x1="${x}" y1="${calibY}" x2="${x}" y2="${calibY - tickHeight}" />`,
      `<text x="${x}" y="${calibY + tickLabelOffset}" font-size="${formatFontSize(
        tickFontSize
      )}" fill="#d11" text-anchor="middle">${value}</text>`,
    ].join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${Units.toMm(width, unit)}mm" height="${Units.toMm(height, unit)}mm" preserveAspectRatio="${preserveAspectRatio}">
  <defs>
    <marker id="arrow" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L4,2 L0,4 z" fill="#333" />
    </marker>
  </defs>
  <rect x="${exportBounds.minX}" y="${exportBounds.minY}" width="${width}" height="${height}" fill="white" />
  ${pathMarkup}
  ${annotationMarkup}
  ${titleBlocks.markup}
  <g id="calibration-50mm" stroke="#d11" stroke-width="${formatLength(
    Units.fromMm(0.4, unit)
  )}" fill="none">
    <line x1="${calibX}" y1="${calibY}" x2="${calibX + calibrationSize}" y2="${calibY}" />
    <line x1="${calibX + calibrationSize}" y1="${calibY}" x2="${calibX + calibrationSize}" y2="${calibY - calibrationSize}" />
    ${tickLabels}
    <text x="${calibX}" y="${calibY + Units.fromMm(2, unit)}" font-size="${formatFontSize(
      infoFontSize
    )}" fill="#d11">${labels.calibration || "50mm"}</text>
  </g>
  <g id="calibration-100mm" stroke="#d11" stroke-width="${formatLength(
    Units.fromMm(0.4, unit)
  )}" fill="none">
    <rect x="${calibLargeX}" y="${calibLargeY}" width="${calibrationLarge}" height="${calibrationLarge}" />
    <text x="${calibLargeX}" y="${calibLargeY + calibrationLarge + Units.fromMm(2, unit)}" font-size="${formatFontSize(
      infoFontSize
    )}" fill="#d11">${labels.calibrationLarge || "100mm"}</text>
  </g>
  ${
    includeInfo
      ? renderMultilineText({
          x: infoX,
          y: titleY,
          lines: titleLines,
          fontSize: titleBlock.fontSize,
          fill: "#333",
          lineHeight: titleBlock.fontSize * lineHeightFactor,
          formatFontSize,
          formatLength,
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
          lineHeight: scaleBlock.fontSize * lineHeightFactor,
          formatFontSize,
          formatLength,
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
          lineHeight: summaryBlock.fontSize * lineHeightFactor,
          formatFontSize,
          formatLength,
        })
      : ""
  }
  ${annotationLegend}
</svg>`;
}
