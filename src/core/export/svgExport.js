import { Units } from "../geometry/Units.js";
import { collectPaths } from "../pattern/panels.js";
import { exactPathBounds, validateClosedPathGeometry } from "./pathValidation.js";

const SUPPORTED_UNITS = new Set(["mm", "cm", "in"]);

function validatePath(path, label) {
  if (!path || !Array.isArray(path.segments) || typeof path.bounds !== "function"
    || typeof path.toSVGPath !== "function" || !path.segments.length) {
    throw new TypeError(`${label} is not a valid non-empty Path.`);
  }
  const pointCounts = { M: 1, L: 2, C: 4, Z: 0 };
  let currentPoint = null;
  path.segments.forEach((segment, segmentIndex) => {
    if (!segment || !Object.prototype.hasOwnProperty.call(pointCounts, segment.type)) {
      throw new TypeError(`${label}.segments[${segmentIndex}] has an unsupported type.`);
    }
    const points = segment.points || [];
    if (points.length !== pointCounts[segment.type]) {
      throw new TypeError(`${label}.segments[${segmentIndex}] is malformed.`);
    }
    points.forEach((point, pointIndex) => {
      if (!point || typeof point.x !== "number" || typeof point.y !== "number"
        || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new TypeError(`${label}.segments[${segmentIndex}].points[${pointIndex}] must be finite.`);
      }
    });
    if (segmentIndex === 0 && segment.type !== "M") {
      throw new TypeError(`${label} must begin with M.`);
    }
    if (segment.type === "M") {
      if (segmentIndex !== 0) throw new TypeError(`${label} must contain exactly one subpath.`);
      currentPoint = points[0];
    } else if (segment.type === "L" || segment.type === "C") {
      const start = points[0];
      if (!currentPoint || Math.abs(start.x - currentPoint.x) > 1e-9 || Math.abs(start.y - currentPoint.y) > 1e-9) {
        throw new TypeError(`${label}.segments[${segmentIndex}] is disconnected.`);
      }
      currentPoint = points.at(-1);
    } else if (segment.type === "Z" && segmentIndex !== path.segments.length - 1) {
      throw new TypeError(`${label} may close only at its final segment.`);
    }
  });
  if (path.segments.at(-1)?.type !== "Z") {
    throw new TypeError(`${label} must end with Z.`);
  }
  const bounds = path.bounds();
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) {
    throw new TypeError(`${label} has invalid bounds.`);
  }
  validateClosedPathGeometry(path, label);
  return exactPathBounds(path, label);
}

function validateAnnotations(annotations) {
  if (!Array.isArray(annotations)) throw new TypeError("SVG annotations must be an array.");
  const pointIsFinite = (point) => point && typeof point.x === "number" && typeof point.y === "number"
    && Number.isFinite(point.x) && Number.isFinite(point.y);
  annotations.forEach((annotation, index) => {
    if (!annotation || typeof annotation !== "object") {
      throw new TypeError(`annotations[${index}] must be an object.`);
    }
    if (["grainline", "stretchline", "foldline"].includes(annotation.type)) {
      if (!pointIsFinite(annotation.start) || !pointIsFinite(annotation.end)) {
        throw new TypeError(`annotations[${index}] must have finite start and end points.`);
      }
      return;
    }
    if (["notch", "control", "label"].includes(annotation.type)) {
      if (!pointIsFinite(annotation.point)) {
        throw new TypeError(`annotations[${index}] must have a finite point.`);
      }
      return;
    }
    throw new TypeError(`annotations[${index}] has unsupported type ${String(annotation.type)}.`);
  });
}

function xmlSafeText(value) {
  let result = "";
  for (const character of String(value ?? "")) {
    const codePoint = character.codePointAt(0);
    const allowed = codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    result += allowed && !(codePoint >= 0x7f && codePoint <= 0x9f) ? character : "\ufffd";
  }
  return result;
}

function escapeXml(value) {
  return xmlSafeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function mergeBounds(boundsList) {
  if (!boundsList.length) throw new TypeError("Cannot merge an empty bounds list.");
  return boundsList.reduce((result, bounds) => ({
    minX: Math.min(result.minX, bounds.minX),
    minY: Math.min(result.minY, bounds.minY),
    maxX: Math.max(result.maxX, bounds.maxX),
    maxY: Math.max(result.maxY, bounds.maxY),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function boundsOverlapArea(a, b, padding = 0) {
  const overlapX = Math.max(
    0,
    Math.min(a.maxX, b.maxX + padding) - Math.max(a.minX, b.minX - padding)
  );
  const overlapY = Math.max(
    0,
    Math.min(a.maxY, b.maxY + padding) - Math.max(a.minY, b.minY - padding)
  );
  return overlapX * overlapY;
}

function overlapsAny(bounds, obstacles, padding = 0) {
  return obstacles.some((obstacle) => boundsOverlapArea(bounds, obstacle, padding) > 0);
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

function wrapWithAutoSize(text, { maxChars, fontSize, minFontSize = fontSize * 0.7, maxLines = 3 }) {
  if (!text) return { lines: [], fontSize };
  let nextFontSize = fontSize;
  let nextMaxChars = maxChars;
  let lines = wrapText(text, nextMaxChars);

  while (lines.length > maxLines && nextFontSize > minFontSize + Number.EPSILON) {
    nextFontSize = Math.max(minFontSize, nextFontSize * 0.9);
    const scale = fontSize / nextFontSize;
    nextMaxChars = Math.max(1, Math.round(maxChars * scale));
    lines = wrapText(text, nextMaxChars);
  }

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const lastIndex = lines.length - 1;
    const lastLine = lines[lastIndex];
    lines[lastIndex] = `${lastLine.slice(0, Math.max(1, nextMaxChars - 3)).trimEnd()}...`;
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
      return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");
  return `<text x="${x}" y="${y}" font-size="${formatFontSize(fontSize)}" fill="${fill}">${tspans}</text>`;
}

function resolveLabelText(value, resolveText) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return `${value}`;
  if (value && typeof value === "object") {
    const resolved = resolveText ? resolveText(value) : null;
    if (typeof resolved === "string" || typeof resolved === "number") return `${resolved}`;
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
              )}" fill="#444" text-anchor="middle" dominant-baseline="middle">${escapeXml(label)}</text>`
            : "",
        ].join("\n");
      }
      if (anno.type === "stretchline") {
        const midX = (anno.start.x + anno.end.x) / 2;
        const midY = (anno.start.y + anno.end.y) / 2;
        const label = showLabels ? resolveLabelText(anno.label, resolveText) : "";
        return [
          `<g data-annotation="stretchline">`,
          `<line x1="${anno.start.x}" y1="${anno.start.y}" x2="${anno.end.x}" y2="${anno.end.y}" stroke="#7a356a" stroke-width="${formatLength(
            grainlineStrokeWidth
          )}" stroke-dasharray="${formatLength(grainlineStrokeWidth * 4)} ${formatLength(
            grainlineStrokeWidth * 3
          )}" marker-start="url(#stretch-arrow)" marker-end="url(#stretch-arrow)" />`,
          label
            ? `<text x="${midX}" y="${midY}" dy="-${formatLength(
                labelFontSize * 0.45
              )}" font-size="${formatFontSize(
                labelFontSize * 0.9
              )}" fill="#6a285a" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="${formatLength(
                labelStrokeWidth
              )}" stroke-linejoin="round">${escapeXml(label)}</text>`
            : "",
          `</g>`,
        ]
          .filter(Boolean)
          .join("\n");
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
        )}" stroke-linejoin="round">${escapeXml(text)}</text>`;
      }
      return "";
    })
    .join("\n");
}

function panelBounds(panel) {
  const paths = panel?.paths ? Object.values(panel.paths) : [];
  if (!paths.length) return null;
  return mergeBounds(paths.map((path, index) => exactPathBounds(path, `panel.paths.${index}`)));
}

function buildTitleBlock(panel, draftMeta, resolveText, labels) {
  const localized = (value, fallback = "") => resolveLabelText(value, resolveText) || fallback;
  const pieceLabel = localized(labels.pieceLabel, "Piece");
  const cutLabel = localized(labels.cutLabel, "Cut");
  const materialLabel = localized(labels.materialLabel, "Material");
  const moduleLabel = localized(labels.moduleLabel, "Module");
  const seamLabel = localized(labels.seamAllowanceLabel, "Seam allowance");
  const pieceName = localized(panel.name, localized(panel.id, pieceLabel));
  const cutQty = localized(panel.cutQty);
  const material = localized(panel.material);
  const lines = [`${pieceLabel}: ${pieceName}`];
  if (cutQty) lines.push(`${cutLabel}: ${cutQty}`);
  if (material) lines.push(`${materialLabel}: ${material}`);
  const moduleId = localized(draftMeta?.moduleId, "module");
  const moduleVersion = localized(draftMeta?.moduleVersion, "0.0");
  lines.push(`${moduleLabel}: ${moduleId} v${moduleVersion}`);
  const seamValue = Number.isFinite(draftMeta?.seamAllowanceMm) ? `${draftMeta.seamAllowanceMm}mm` : "0mm";
  lines.push(`${seamLabel}: ${seamValue}`);
  return lines;
}

function titleBlockCandidates(bounds, width, height, gap) {
  const centerX = bounds.minX + (bounds.maxX - bounds.minX - width) / 2;
  const centerY = bounds.minY + (bounds.maxY - bounds.minY - height) / 2;
  return [
    { minX: bounds.maxX + gap, minY: bounds.minY },
    { minX: bounds.maxX + gap, minY: centerY },
    { minX: bounds.maxX + gap, minY: bounds.maxY - height },
    { minX: bounds.minX, minY: bounds.maxY + gap },
    { minX: centerX, minY: bounds.maxY + gap },
    { minX: bounds.maxX - width, minY: bounds.maxY + gap },
    { minX: bounds.minX - gap - width, minY: bounds.minY },
    { minX: bounds.minX - gap - width, minY: centerY },
    { minX: bounds.minX - gap - width, minY: bounds.maxY - height },
    { minX: bounds.minX, minY: bounds.minY - gap - height },
    { minX: centerX, minY: bounds.minY - gap - height },
    { minX: bounds.maxX - width, minY: bounds.minY - gap - height },
  ].map((candidate) => ({
    minX: candidate.minX,
    minY: candidate.minY,
    maxX: candidate.minX + width,
    maxY: candidate.minY + height,
  }));
}

function placeTitleBlock(panelBoundsValue, width, height, obstacles, gap, clearance) {
  const candidates = titleBlockCandidates(panelBoundsValue, width, height, gap);
  const clearCandidate = candidates.find((candidate) => !overlapsAny(candidate, obstacles, clearance));
  if (clearCandidate) return clearCandidate;

  const outerBounds = mergeBounds(obstacles);
  const outerCandidates = [
    { minX: outerBounds.maxX + gap, minY: panelBoundsValue.minY },
    { minX: panelBoundsValue.minX, minY: outerBounds.maxY + gap },
    { minX: outerBounds.minX - gap - width, minY: panelBoundsValue.minY },
    { minX: panelBoundsValue.minX, minY: outerBounds.minY - gap - height },
  ].map((candidate) => ({
    minX: candidate.minX,
    minY: candidate.minY,
    maxX: candidate.minX + width,
    maxY: candidate.minY + height,
  }));
  const clearOuterCandidate = outerCandidates.find(
    (candidate) => !overlapsAny(candidate, obstacles, clearance)
  );
  if (clearOuterCandidate) return clearOuterCandidate;

  return candidates.reduce((best, candidate) => {
    const overlap = obstacles.reduce(
      (total, obstacle) => total + boundsOverlapArea(candidate, obstacle, clearance),
      0
    );
    return !best || overlap < best.overlap ? { bounds: candidate, overlap } : best;
  }, null).bounds;
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
  const gap = Units.fromMm(6, unit);
  const clearance = Units.fromMm(2, unit);
  const blocks = [];
  const boundsList = [];
  const allPanelBounds = panels.map((panel) => panelBounds(panel)).filter(Boolean);

  panels.forEach((panel) => {
    const bounds = panelBounds(panel);
    if (!bounds) return;
    const lines = buildTitleBlock(panel, draftMeta, resolveText, labels)
      .filter(Boolean)
      .flatMap((line) => wrapText(line, 28));
    if (!lines.length) return;
    const blockHeight = padding * 2 + lines.length * lineHeight;
    const placed = placeTitleBlock(
      bounds,
      blockWidth,
      blockHeight,
      [...allPanelBounds, ...boundsList],
      gap,
      clearance
    );
    const x = placed.minX;
    const y = placed.minY;

    const textSpans = lines
      .map((line, index) => {
        const textY = y + padding + lineHeight * (index + 0.8);
        return `<text x="${x + padding}" y="${textY}" font-size="${formatFontSize(
          fontSize
        )}" fill="#111">${escapeXml(line)}</text>`;
      })
      .join("\n");

    const panelKey = resolveLabelText(panel.id, resolveText) || resolveLabelText(panel.name, resolveText);
    blocks.push(
      [
        `<g data-panel-title-block="${escapeXml(panelKey)}" data-min-x="${placed.minX}" data-min-y="${placed.minY}" data-max-x="${placed.maxX}" data-max-y="${placed.maxY}">`,
        `<rect x="${x}" y="${y}" width="${blockWidth}" height="${blockHeight}" fill="#fff" stroke="#666" stroke-width="${formatLength(
          Units.fromMm(0.2, unit)
        )}" rx="${formatLength(Units.fromMm(1, unit))}" />`,
        textSpans,
        `</g>`,
      ].join("\n")
    );
    boundsList.push(placed);
  });

  return { markup: blocks.join("\n"), bounds: boundsList };
}

function pathRole(entry) {
  const name = String(entry.pathName || entry.name || "").toLowerCase();
  if (name.includes("seam") || name.includes("stitch")) return "seam";
  if (name === "cut" || name.includes("cutting") || /(^|[._-])cut($|[._-])/.test(name)) {
    return "cut";
  }
  return "outline";
}

function pathDataName(entry, resolveText) {
  const panelName = resolveLabelText(entry.panelId, resolveText);
  if (panelName && entry.pathName) return `${panelName}.${entry.pathName}`;
  return resolveLabelText(entry.name, resolveText);
}

export function svgExport(draft, measurementsSummary = [], options = {}) {
  const pathEntries = collectPaths(draft);
  if (!pathEntries.length) throw new Error("Cannot export an SVG draft without paths.");
  const geometryBounds = mergeBounds(pathEntries.map((entry, index) =>
    validatePath(entry.path, `paths.${entry.name || index}`)));
  const meta = draft.meta || {};
  const unit = meta.unit;
  if (!SUPPORTED_UNITS.has(unit)) {
    throw new TypeError(`Unsupported SVG source unit: ${String(unit)}.`);
  }
  const annotations = draft?.annotations ?? [];
  validateAnnotations(annotations);
  const resolveText = options.resolveText;
  const labels = options.labels || {};
  const mode = options.mode || "export";
  const includeInfo = mode !== "preview";
  const isPreview = mode === "preview";
  const highlightSeamAllowance = Boolean(options.highlightSeamAllowance && isPreview);
  const includeCalibration = !isPreview;
  const showLabels = options.showLabels ?? true;
  const preserveAspectRatio = options.preserveAspectRatio || "xMinYMin meet";

  const formatLength = (value) => `${value}`;
  const formatFontSize = formatLength;
  const formatDashArray = (dash, gap) => `${formatLength(dash)} ${formatLength(gap)}`;

  const marginLeft = Units.fromMm(10, unit);
  const marginRight = Units.fromMm(10, unit);
  const marginTop = Units.fromMm(10, unit);
  const marginBottom = Units.fromMm(35, unit);
  const calibrationSize = Units.fromMm(50, unit);
  const calibrationLarge = Units.fromMm(100, unit);
  const calibrationGap = Units.fromMm(6, unit);
  const calibrationPadding = Units.fromMm(4, unit);
  const calibrationReserve = includeCalibration
    ? calibrationLarge + Units.fromMm(8, unit)
    : 0;

  const titleBlocks = includeInfo
    ? renderTitleBlocks({
        panels: draft.panels || [],
        draftMeta: meta,
        resolveText,
        labels,
        unit,
        formatFontSize,
        formatLength,
      })
    : { markup: "", bounds: [] };
  const contentBounds = titleBlocks.bounds.length
    ? mergeBounds([geometryBounds, ...titleBlocks.bounds])
    : geometryBounds;
  const exportBounds = {
    minX: contentBounds.minX - marginLeft,
    minY: contentBounds.minY - marginTop - calibrationReserve,
    maxX: contentBounds.maxX + marginRight,
    maxY: contentBounds.maxY + marginBottom,
  };
  if (includeCalibration) {
    const calibrationWidth =
      calibrationPadding * 2 + calibrationSize + calibrationGap + calibrationLarge;
    exportBounds.maxX = Math.max(exportBounds.maxX, exportBounds.minX + calibrationWidth);
  }
  const width = exportBounds.maxX - exportBounds.minX;
  const height = exportBounds.maxY - exportBounds.minY;
  const widthMm = Units.toMm(width, unit);
  const heightMm = Units.toMm(height, unit);
  if (![...Object.values(exportBounds), width, height, widthMm, heightMm].every(Number.isFinite)
    || width <= 0 || height <= 0 || widthMm <= 0 || heightMm <= 0) {
    throw new RangeError("SVG export bounds are invalid or exceed the supported numeric range.");
  }
  const viewBox = `${exportBounds.minX} ${exportBounds.minY} ${width} ${height}`;

  const summaryText = (Array.isArray(measurementsSummary) ? measurementsSummary : [])
    .map((value) => resolveLabelText(value, resolveText))
    .filter(Boolean)
    .join(", ");
  const seamAllowanceOff = resolveLabelText(labels.seamAllowanceOff, resolveText) || "Off";
  const seamAllowanceLabel =
    meta.seamAllowanceApplied && meta.seamAllowanceMm
      ? `${meta.seamAllowanceMm}mm`
      : seamAllowanceOff;
  const unitsLabel = resolveLabelText(labels.unitsLabel, resolveText) || "Units";
  const seamLabel = resolveLabelText(labels.seamAllowanceLabel, resolveText) || "Seam allowance";
  const scaleInfo = `${unitsLabel}: ${unit} | ${seamLabel}: ${seamAllowanceLabel}`;
  const calibX = exportBounds.minX + calibrationPadding;
  const calibLargeX = calibX + calibrationSize + calibrationGap;
  const calibLargeY = exportBounds.minY + calibrationPadding;
  const calibY = calibLargeY + calibrationSize;

  const infoFontSize = Units.fromMm(3.2, unit);
  const compactFontSize = Units.fromMm(2.6, unit);
  const lineHeightFactor = 1.2;

  const seamAllowanceApplied = pathEntries.some((entry) => pathRole(entry) === "seam");

  const titleText =
    resolveLabelText(meta.title, resolveText) ||
    resolveLabelText(labels.patternTitle, resolveText) ||
    "Pattern";
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
  const legendText = seamAllowanceApplied
    ? resolveLabelText(labels.legendLines, resolveText) || "Cut line / Stitch line"
    : "";
  const legendBlock = wrapWithAutoSize(legendText, {
    maxChars: 46,
    fontSize: compactFontSize,
    maxLines: 2,
    minFontSize: Units.fromMm(2, unit),
  });

  const summaryLinesFinal = summaryBlock.lines;
  const scaleLinesFinal = scaleBlock.lines;
  const titleLines = titleBlock.lines;

  const annotationMarkup = renderAnnotations(annotations, {
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
      const role = pathRole(entry);
      const dataName = pathDataName(entry, resolveText);
      const seamStyle = role === "seam";
      const seamStroke = highlightSeamAllowance ? 0.75 : 0.5;
      const strokeWidth = Units.fromMm(seamStyle ? seamStroke : 0.6, unit);
      const dashArray = seamStyle
        ? ` stroke-dasharray="${formatDashArray(Units.fromMm(4, unit), Units.fromMm(2.5, unit))}"`
        : "";
      const highlightBand =
        seamStyle && highlightSeamAllowance
          ? `<path d="${escapeXml(entry.path.toSVGPath())}" fill="none" stroke="#2a77b8" stroke-opacity="0.25" stroke-width="${formatLength(
              Units.fromMm(1.8, unit)
            )}" data-highlight-for="${escapeXml(dataName)}" />`
          : "";
      return [
        highlightBand,
        `<path d="${escapeXml(entry.path.toSVGPath())}" fill="none" stroke="#000" stroke-width="${formatLength(
          strokeWidth
        )}"${dashArray} data-name="${escapeXml(dataName)}" data-role="${role}" />`,
      ]
        .filter(Boolean)
        .join("\n");
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
  const calibrationLabel = resolveLabelText(labels.calibration, resolveText) || "50mm";
  const calibrationLargeLabel =
    resolveLabelText(labels.calibrationLarge, resolveText) || "100mm";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${widthMm}mm" height="${heightMm}mm" preserveAspectRatio="${escapeXml(
    preserveAspectRatio
  )}">
  ${includeInfo && summaryText ? `<metadata id="measurements-summary">${escapeXml(summaryText)}</metadata>` : ""}
  <defs>
    <marker id="arrow" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L4,2 L0,4 z" fill="#333" />
    </marker>
    <marker id="stretch-arrow" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto-start-reverse" markerUnits="strokeWidth">
      <path d="M0,0 L5,2.5 L0,5 z" fill="#7a356a" />
    </marker>
  </defs>
  <rect x="${exportBounds.minX}" y="${exportBounds.minY}" width="${width}" height="${height}" fill="white" />
  ${pathMarkup}
  ${annotationMarkup}
  ${titleBlocks.markup}
  ${includeCalibration ? `<g id="calibration-50mm" data-content-min-y="${contentBounds.minY}" stroke="#d11" stroke-width="${formatLength(
    Units.fromMm(0.4, unit)
  )}" fill="none">
    <line x1="${calibX}" y1="${calibY}" x2="${calibX + calibrationSize}" y2="${calibY}" />
    <line x1="${calibX + calibrationSize}" y1="${calibY}" x2="${calibX + calibrationSize}" y2="${calibY - calibrationSize}" />
    ${tickLabels}
    <text x="${calibX + calibrationSize / 2}" y="${calibY + Units.fromMm(9, unit)}" font-size="${formatFontSize(
      infoFontSize
    )}" fill="#d11" text-anchor="middle">${escapeXml(calibrationLabel)}</text>
  </g>
  <g id="calibration-100mm" data-content-min-y="${contentBounds.minY}" stroke="#d11" stroke-width="${formatLength(
    Units.fromMm(0.4, unit)
  )}" fill="none">
    <rect x="${calibLargeX}" y="${calibLargeY}" width="${calibrationLarge}" height="${calibrationLarge}" />
    <text x="${calibLargeX + calibrationLarge / 2}" y="${calibLargeY + calibrationLarge + Units.fromMm(5, unit)}" font-size="${formatFontSize(
      infoFontSize
    )}" fill="#d11" text-anchor="middle">${escapeXml(calibrationLargeLabel)}</text>
  </g>` : ``}
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
