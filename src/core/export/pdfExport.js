import { Units } from "../geometry/Units.js";
import { collectPaths } from "../pattern/panels.js";
import { resolveExportSafety } from "./exportSafety.js";
import { exactPathBounds, validateClosedPathGeometry } from "./pathValidation.js";

const PAPER_SIZES = Object.freeze({
  A4: { label: "A4", widthMm: 210, heightMm: 297 },
  A3: { label: "A3", widthMm: 297, heightMm: 420 },
  LETTER: { label: "Letter", widthMm: 215.9, heightMm: 279.4 },
  A0: { label: "A0", widthMm: 841, heightMm: 1189 },
});

const HEADER_HEIGHT_MM = 14;
const FOOTER_HEIGHT_MM = 12;
const DEFAULT_MARGIN_MM = 10;
const DEFAULT_OVERLAP_MM = 10;
const MIN_TITLE_BLOCK_PANEL_WIDTH_MM = 75;
const ROUNDING_EPSILON_PT = Units.toPtFromMm(0.0001);
const SUPPORTED_UNITS = new Set(["mm", "cm", "in"]);
const MAX_TILE_GRID_CELLS = 10000;
const MAX_PATTERN_PAGES = 512;
const MAX_REPEATED_GEOMETRY_CHARS = 16 * 1024 * 1024;
const GEOMETRY_CLIP_PADDING_PT = Units.toPtFromMm(0.35 / 2);
const CYRILLIC_TO_LATIN = Object.freeze({
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", Ё: "Yo", Ж: "Zh", З: "Z", И: "I", Й: "Y",
  К: "K", Л: "L", М: "M", Н: "N", О: "O", П: "P", Р: "R", С: "S", Т: "T", У: "U", Ф: "F",
  Х: "Kh", Ц: "Ts", Ч: "Ch", Ш: "Sh", Щ: "Shch", Ъ: "", Ы: "Y", Ь: "", Э: "E", Ю: "Yu", Я: "Ya",
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
});

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    throw new TypeError("PDF values must be finite numbers.");
  }
  const normalized = Math.abs(value) < 0.0000005 ? 0 : value;
  return Number(normalized.toFixed(6)).toString();
}

function sanitizePdfText(value) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[А-ЯЁа-яё]/g, (character) => CYRILLIC_TO_LATIN[character] ?? "")
    .replace(/[^\x20-\x7e]/g, "");
}

function escapePdfText(value) {
  return sanitizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function commentText(value) {
  return sanitizePdfText(value).replace(/[^A-Za-z0-9_.:=+/-]+/g, "_");
}

function resolveLabelText(value, resolveText) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (resolveText) {
      const resolved = resolveText(value);
      if (typeof resolved === "string" && resolved) return resolved;
    }
    return value.en || value.ru || "";
  }
  return "";
}

function displayText(value, resolveText, fallback) {
  const resolved = sanitizePdfText(resolveLabelText(value, resolveText));
  return resolved || fallback;
}

function textCommand(text, x, y, fontSize = 8) {
  const escaped = escapePdfText(text);
  if (!escaped) return "";
  return [
    "BT",
    `/F1 ${formatNumber(fontSize)} Tf`,
    `1 0 0 1 ${formatNumber(x)} ${formatNumber(y)} Tm`,
    `(${escaped}) Tj`,
    "ET",
  ].join("\n");
}

function wrapText(value, maxChars = 80) {
  const text = sanitizePdfText(value).trim();
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    if (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let index = 0; index < word.length; index += maxChars) {
        const chunk = word.slice(index, index + maxChars);
        if (chunk.length === maxChars) lines.push(chunk);
        else line = chunk;
      }
      return;
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  });

  if (line) lines.push(line);
  return lines;
}

function pathBounds(path) {
  if (!path || !Array.isArray(path.segments)) return null;
  try {
    return exactPathBounds(path);
  } catch {
    return null;
  }
}

function validatePath(path, label) {
  if (!path || !Array.isArray(path.segments) || typeof path.bounds !== "function") {
    throw new TypeError(`${label} is not a valid Path.`);
  }
  if (!path.segments.length) {
    throw new TypeError(`${label} must not be empty.`);
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
  if (!pathBounds(path)) {
    throw new TypeError(`${label} has invalid bounds.`);
  }
  validateClosedPathGeometry(path, label);
}

function validateAnnotations(annotations) {
  if (!Array.isArray(annotations)) {
    throw new TypeError("PDF annotations must be an array.");
  }
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

function annotationPrintBounds(annotations, unitScale, resolveText) {
  const bounds = [];
  const mm = (value) => Units.toPtFromMm(value);
  const pushPoint = (point, paddingPt) => {
    const x = point.x * unitScale;
    const y = point.y * unitScale;
    bounds.push({ minX: x - paddingPt, minY: y - paddingPt, maxX: x + paddingPt, maxY: y + paddingPt });
  };
  const pushLine = (start, end, paddingPt) => {
    const x1 = start.x * unitScale;
    const y1 = start.y * unitScale;
    const x2 = end.x * unitScale;
    const y2 = end.y * unitScale;
    bounds.push({
      minX: Math.min(x1, x2) - paddingPt,
      minY: Math.min(y1, y2) - paddingPt,
      maxX: Math.max(x1, x2) + paddingPt,
      maxY: Math.max(y1, y2) + paddingPt,
    });
  };
  const pushText = (point, rawText, fontSize) => {
    const text = sanitizePdfText(rawText);
    if (!text) return;
    const x = point.x * unitScale;
    const y = point.y * unitScale;
    const sidePadding = mm(0.5);
    const estimatedWidth = Math.max(fontSize, text.length * fontSize * 0.56);
    bounds.push({
      minX: x - sidePadding,
      minY: y - fontSize - sidePadding,
      maxX: x + estimatedWidth + sidePadding,
      maxY: y + sidePadding,
    });
  };

  annotations.forEach((annotation) => {
    if (annotation.type === "grainline" || annotation.type === "stretchline") {
      pushLine(annotation.start, annotation.end, mm(3.25));
    } else if (annotation.type === "foldline") {
      pushLine(annotation.start, annotation.end, mm(0.25));
    } else if (annotation.type === "notch") {
      pushPoint(annotation.point, mm(2.75));
    } else if (annotation.type === "control") {
      pushPoint(annotation.point, mm(2.25));
    }

    if (annotation.type === "label") {
      pushText(annotation.point, resolveLabelText(annotation.text, resolveText), annotation.kind === "edge" ? 6.5 : 7.5);
    } else if (annotation.type === "foldline" || annotation.type === "stretchline") {
      pushText({
        x: (annotation.start.x + annotation.end.x) / 2,
        y: (annotation.start.y + annotation.end.y) / 2,
      }, resolveLabelText(annotation.label, resolveText), 6.5);
    }
  });
  return bounds;
}

function mergeBounds(paths) {
  const boundsList = paths.map(pathBounds).filter(Boolean);
  if (!boundsList.length) {
    throw new TypeError("PDF export requires at least one non-empty pattern path.");
  }
  return {
    minX: Math.min(...boundsList.map((bounds) => bounds.minX)),
    minY: Math.min(...boundsList.map((bounds) => bounds.minY)),
    maxX: Math.max(...boundsList.map((bounds) => bounds.maxX)),
    maxY: Math.max(...boundsList.map((bounds) => bounds.maxY)),
  };
}

function panelBounds(panel) {
  const paths = Object.values(panel?.paths || {});
  if (!paths.length) return null;
  try {
    return mergeBounds(paths);
  } catch {
    return null;
  }
}

function normalizePaperSize(value) {
  const key = String(value === undefined ? "A4" : value).trim().toUpperCase().replace(/[\s_-]+/g, "");
  if (key === "USLETTER") return PAPER_SIZES.LETTER;
  const paper = PAPER_SIZES[key];
  if (!paper) throw new RangeError(`Unsupported PDF paper size: ${String(value)}.`);
  return paper;
}

function normalizeOrientation(value) {
  const orientation = String(value === undefined ? "portrait" : value).trim().toLowerCase();
  if (orientation !== "portrait" && orientation !== "landscape") {
    throw new RangeError(`Unsupported PDF orientation: ${String(value)}.`);
  }
  return orientation;
}

function positiveNumber(value, fallback, name, { allowZero = false } = {}) {
  const candidate = value ?? fallback;
  const valid = Number.isFinite(candidate) && (allowZero ? candidate >= 0 : candidate > 0);
  if (!valid) throw new RangeError(`${name} must be ${allowZero ? "zero or " : ""}a positive number.`);
  return candidate;
}

function tileCountForSpan(spanPt, viewportPt, stridePt) {
  if (spanPt <= viewportPt + ROUNDING_EPSILON_PT) return 1;
  const extraSpan = Math.max(0, spanPt - viewportPt - ROUNDING_EPSILON_PT);
  return 1 + Math.ceil(extraSpan / stridePt);
}

function pathRole(entry) {
  const name = String(entry.pathName || entry.name || "").toLowerCase();
  const tokens = name.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((token) => token.includes("seam") || token.includes("stitch"))) {
    return "stitch";
  }
  if (tokens.some((token) => token.includes("cut"))) return "cut";
  return "cut";
}

function pathToPdf(path, unitScale) {
  const commands = [];
  path.segments.forEach((segment) => {
    if (segment.type === "M") {
      const point = segment.points?.[0];
      if (point) commands.push(`${formatNumber(point.x * unitScale)} ${formatNumber(point.y * unitScale)} m`);
    } else if (segment.type === "L") {
      const point = segment.points?.[1];
      if (point) commands.push(`${formatNumber(point.x * unitScale)} ${formatNumber(point.y * unitScale)} l`);
    } else if (segment.type === "C") {
      const [, cp1, cp2, point] = segment.points || [];
      if (cp1 && cp2 && point) {
        commands.push(
          `${formatNumber(cp1.x * unitScale)} ${formatNumber(cp1.y * unitScale)} ` +
            `${formatNumber(cp2.x * unitScale)} ${formatNumber(cp2.y * unitScale)} ` +
            `${formatNumber(point.x * unitScale)} ${formatNumber(point.y * unitScale)} c`
        );
      }
    } else if (segment.type === "Z") {
      commands.push("h");
    }
  });
  commands.push("S");
  return commands.join("\n");
}

function geometryCommands(pathEntries, unitScale) {
  const cutWidth = Units.toPtFromMm(0.35);
  const stitchWidth = Units.toPtFromMm(0.25);
  const commands = ["% BEGIN_PATTERN_GEOMETRY", "0 0 0 RG", "0 0 0 rg"];

  pathEntries.forEach((entry) => {
    const role = pathRole(entry);
    const name = commentText(entry.name || entry.pathName || "path");
    if (role === "stitch") {
      commands.push(`% PATH_ROLE STITCH DASHED NAME ${name}`);
      commands.push(`${formatNumber(stitchWidth)} w`);
      commands.push("[4 2] 0 d");
    } else {
      commands.push(`% PATH_ROLE CUT SOLID NAME ${name}`);
      commands.push(`${formatNumber(cutWidth)} w`);
      commands.push("[] 0 d");
    }
    commands.push(pathToPdf(entry.path, unitScale));
  });

  commands.push("[] 0 d", "% END_PATTERN_GEOMETRY");
  return commands.join("\n");
}

function arrowHead(commands, start, end, arrowSizePt) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const spread = Math.PI / 7;
  const left = {
    x: end.x - arrowSizePt * Math.cos(angle - spread),
    y: end.y - arrowSizePt * Math.sin(angle - spread),
  };
  const right = {
    x: end.x - arrowSizePt * Math.cos(angle + spread),
    y: end.y - arrowSizePt * Math.sin(angle + spread),
  };
  commands.push(
    `${formatNumber(end.x)} ${formatNumber(end.y)} m ${formatNumber(left.x)} ${formatNumber(left.y)} l`,
    `${formatNumber(end.x)} ${formatNumber(end.y)} m ${formatNumber(right.x)} ${formatNumber(right.y)} l`
  );
}

function annotationGeometryCommands(annotations, unitScale) {
  const solid = [];
  const dashed = [];
  const arrowSize = Units.toPtFromMm(3);

  (annotations || []).forEach((annotation) => {
    if (annotation.type === "grainline" || annotation.type === "stretchline") {
      if (!annotation.start || !annotation.end) return;
      const start = { x: annotation.start.x * unitScale, y: annotation.start.y * unitScale };
      const end = { x: annotation.end.x * unitScale, y: annotation.end.y * unitScale };
      solid.push(`${formatNumber(start.x)} ${formatNumber(start.y)} m ${formatNumber(end.x)} ${formatNumber(end.y)} l`);
      arrowHead(solid, start, end, arrowSize);
      if (annotation.type === "stretchline") arrowHead(solid, end, start, arrowSize);
    } else if (annotation.type === "notch" || annotation.type === "control") {
      if (!annotation.point) return;
      const x = annotation.point.x * unitScale;
      const y = annotation.point.y * unitScale;
      const size = Units.toPtFromMm(annotation.type === "notch" ? 2.5 : 2);
      solid.push(`${formatNumber(x - size)} ${formatNumber(y)} m ${formatNumber(x + size)} ${formatNumber(y)} l`);
      solid.push(`${formatNumber(x)} ${formatNumber(y - size)} m ${formatNumber(x)} ${formatNumber(y + size)} l`);
    } else if (annotation.type === "foldline" && annotation.start && annotation.end) {
      dashed.push(
        `${formatNumber(annotation.start.x * unitScale)} ${formatNumber(annotation.start.y * unitScale)} m ` +
          `${formatNumber(annotation.end.x * unitScale)} ${formatNumber(annotation.end.y * unitScale)} l`
      );
    }
  });

  if (!solid.length && !dashed.length) return "";
  const commands = ["% BEGIN_PATTERN_ANNOTATIONS", "0.5 0.5 0.5 RG", `${formatNumber(Units.toPtFromMm(0.25))} w`];
  if (solid.length) commands.push("[] 0 d", solid.join("\n"), "S");
  if (dashed.length) commands.push("[6 3] 0 d", dashed.join("\n"), "S", "[] 0 d");
  commands.push("% END_PATTERN_ANNOTATIONS");
  return commands.join("\n");
}

function truncateLine(value, maxChars) {
  const text = sanitizePdfText(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 3))}...`;
}

function titleBlockSpecs({ panels, draftMeta, resolveText, labels, unitScale }) {
  const specs = [];
  const padding = Units.toPtFromMm(2);

  (panels || []).forEach((panel) => {
    const bounds = panelBounds(panel);
    if (!bounds) return;
    const scaled = {
      minX: bounds.minX * unitScale,
      minY: bounds.minY * unitScale,
      maxX: bounds.maxX * unitScale,
      maxY: bounds.maxY * unitScale,
    };
    const panelWidth = scaled.maxX - scaled.minX;
    const panelHeight = scaled.maxY - scaled.minY;
    if (panelWidth <= 0 || panelHeight <= 0) return;
    if (panelWidth + ROUNDING_EPSILON_PT < Units.toPtFromMm(MIN_TITLE_BLOCK_PANEL_WIDTH_MM)) return;

    const inset = Math.min(Units.toPtFromMm(5), panelWidth * 0.08, panelHeight * 0.08);
    const width = Math.max(
      Math.min(Units.toPtFromMm(46), panelWidth - inset * 2),
      Math.min(panelWidth, Units.toPtFromMm(18))
    );
    const fontSize = width < Units.toPtFromMm(30) ? 5.5 : 6.5;
    const lineHeight = fontSize * 1.35;
    const rawLines = [
      `${labels.pieceLabel || "Piece"}: ${displayText(panel.name || panel.id, resolveText, panel.id || "Piece")}`,
      panel.cutQty ? `${labels.cutLabel || "Cut"}: ${displayText(panel.cutQty, resolveText, "")}` : "",
      panel.material ? `${labels.materialLabel || "Material"}: ${displayText(panel.material, resolveText, "")}` : "",
      `${labels.moduleLabel || "Module"}: ${draftMeta?.moduleId || "module"} v${draftMeta?.moduleVersion || "0.0"}`,
      `${labels.seamAllowanceLabel || "Seam allowance"}: ${Number.isFinite(draftMeta?.seamAllowanceMm) ? draftMeta.seamAllowanceMm : 0}mm`,
    ].filter(Boolean);
    const maxLines = Math.max(1, Math.floor((panelHeight - padding * 2) / lineHeight));
    const charLimit = Math.max(10, Math.floor((width - padding * 2) / (fontSize * 0.53)));
    const lines = rawLines.slice(0, maxLines).map((line) => truncateLine(line, charLimit));
    const height = Math.min(panelHeight, padding * 2 + lines.length * lineHeight);
    let x = scaled.minX + inset;
    let y = scaled.minY + inset;
    if (x + width > scaled.maxX) x = scaled.maxX - width;
    if (y + height > scaled.maxY) y = scaled.maxY - height;

    specs.push({
      id: panel.id || panel.name || "panel",
      x,
      y,
      width,
      height,
      padding,
      fontSize,
      lineHeight,
      lines,
    });
  });

  return specs;
}

function intersects(rect, tile) {
  return !(
    rect.x + rect.width < tile.minX - ROUNDING_EPSILON_PT ||
    rect.x > tile.maxX + ROUNDING_EPSILON_PT ||
    rect.y + rect.height < tile.minY - ROUNDING_EPSILON_PT ||
    rect.y > tile.maxY + ROUNDING_EPSILON_PT
  );
}

function intersectionArea(rect, tile) {
  const width = Math.max(0, Math.min(rect.x + rect.width, tile.maxX) - Math.max(rect.x, tile.minX));
  const height = Math.max(0, Math.min(rect.y + rect.height, tile.maxY) - Math.max(rect.y, tile.minY));
  return width * height;
}

function assignTitleBlocksToTiles(specs, tiles) {
  return specs.map((spec) => {
    let ownerTileId = null;
    let bestArea = -1;
    tiles.forEach(({ tile }) => {
      const area = intersectionArea(spec, tile);
      if (area > bestArea + ROUNDING_EPSILON_PT) {
        bestArea = area;
        ownerTileId = tile.id;
      }
    });
    return { ...spec, ownerTileId };
  });
}

function patternPointToPage(point, tile, layout) {
  return {
    x: layout.contentLeftPt + point.x - tile.minX,
    y: layout.pageHeightPt - layout.contentTopPt - (point.y - tile.minY),
  };
}

function titleBlocksForTile(specs, tile, layout) {
  const commands = [];
  specs.filter((spec) => spec.ownerTileId === tile.id || (!spec.ownerTileId && intersects(spec, tile))).forEach((spec) => {
    const topLeft = patternPointToPage({ x: spec.x, y: spec.y }, tile, layout);
    const bottom = topLeft.y - spec.height;
    commands.push(`% TITLE_BLOCK_UPRIGHT ${commentText(spec.id)}`);
    commands.push("0.25 0.25 0.25 RG", `${formatNumber(Units.toPtFromMm(0.2))} w`, "[] 0 d");
    commands.push(
      `${formatNumber(topLeft.x)} ${formatNumber(bottom)} ${formatNumber(spec.width)} ${formatNumber(spec.height)} re S`
    );
    spec.lines.forEach((line, index) => {
      const baseline = topLeft.y - spec.padding - spec.fontSize - index * spec.lineHeight;
      commands.push(textCommand(line, topLeft.x + spec.padding, baseline, spec.fontSize));
    });
  });
  return commands.filter(Boolean).join("\n");
}

function pointInsideTile(point, tile) {
  return (
    point.x >= tile.minX - ROUNDING_EPSILON_PT &&
    point.x <= tile.maxX + ROUNDING_EPSILON_PT &&
    point.y >= tile.minY - ROUNDING_EPSILON_PT &&
    point.y <= tile.maxY + ROUNDING_EPSILON_PT
  );
}

function pathBoundsIntersectTile(bounds, tile) {
  return !(
    bounds.maxX < tile.minX - ROUNDING_EPSILON_PT ||
    bounds.minX > tile.maxX + ROUNDING_EPSILON_PT ||
    bounds.maxY < tile.minY - ROUNDING_EPSILON_PT ||
    bounds.minY > tile.maxY + ROUNDING_EPSILON_PT
  );
}

function annotationTextForTile(annotations, tile, layout, unitScale, resolveText) {
  const commands = [];
  (annotations || []).forEach((annotation) => {
    let sourcePoint = null;
    let rawText = "";
    let fontSize = 7;
    if (annotation.type === "label" && annotation.point) {
      sourcePoint = annotation.point;
      rawText = resolveLabelText(annotation.text, resolveText);
      fontSize = annotation.kind === "edge" ? 6.5 : 7.5;
    } else if ((annotation.type === "foldline" || annotation.type === "stretchline") && annotation.start && annotation.end) {
      sourcePoint = {
        x: (annotation.start.x + annotation.end.x) / 2,
        y: (annotation.start.y + annotation.end.y) / 2,
      };
      rawText = resolveLabelText(annotation.label, resolveText);
      fontSize = 6.5;
    }
    const text = sanitizePdfText(rawText);
    if (!sourcePoint || !text) return;
    const point = { x: sourcePoint.x * unitScale, y: sourcePoint.y * unitScale };
    if (!pointInsideTile(point, tile)) return;
    const pagePoint = patternPointToPage(point, tile, layout);
    commands.push("% LABEL_UPRIGHT");
    commands.push(textCommand(text, pagePoint.x, pagePoint.y, fontSize));
  });
  return commands.filter(Boolean).join("\n");
}

function assemblyMarks(layout) {
  const { contentLeftPt: left, contentBottomPt: bottom, contentWidthPt: width, contentHeightPt: height } = layout;
  const right = left + width;
  const top = bottom + height;
  const arm = Units.toPtFromMm(4);
  const marks = [];
  [
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: left, y: top },
    { x: right, y: top },
  ].forEach(({ x, y }) => {
    marks.push(`${formatNumber(x - arm)} ${formatNumber(y)} m ${formatNumber(x + arm)} ${formatNumber(y)} l`);
    marks.push(`${formatNumber(x)} ${formatNumber(y - arm)} m ${formatNumber(x)} ${formatNumber(y + arm)} l`);
  });
  return ["0.35 0.35 0.35 RG", `${formatNumber(Units.toPtFromMm(0.2))} w`, marks.join("\n"), "S"].join("\n");
}

function tileGuides({ row, col, overlapPt, layout }) {
  const { contentLeftPt: left, contentBottomPt: bottom, contentWidthPt: width, contentHeightPt: height } = layout;
  const right = left + width;
  const top = bottom + height;
  const overlapLabel = `${formatNumber((overlapPt / 72) * 25.4)}mm`;
  const commands = [
    "% TILE_GUIDES",
    "0.7 0.7 0.7 RG",
    `${formatNumber(Units.toPtFromMm(0.18))} w`,
    `${formatNumber(left)} ${formatNumber(bottom)} ${formatNumber(width)} ${formatNumber(height)} re S`,
  ];

  if (col > 0) {
    const trimX = left + overlapPt;
    commands.push("0.15 0.45 0.85 RG", "[3 2] 0 d");
    commands.push(`${formatNumber(trimX)} ${formatNumber(bottom)} m ${formatNumber(trimX)} ${formatNumber(top)} l S`);
    commands.push("[] 0 d");
    commands.push(textCommand(`GLUE LINE X - ${overlapLabel} overlap`, trimX + Units.toPtFromMm(1.5), bottom - Units.toPtFromMm(4), 6.5));
  }
  if (row > 0) {
    const trimY = top - overlapPt;
    commands.push("0.15 0.45 0.85 RG", "[3 2] 0 d");
    commands.push(`${formatNumber(left)} ${formatNumber(trimY)} m ${formatNumber(right)} ${formatNumber(trimY)} l S`);
    commands.push("[] 0 d");
    commands.push(textCommand(`GLUE LINE Y - ${overlapLabel} overlap`, left + Units.toPtFromMm(2), top + Units.toPtFromMm(2.5), 6.5));
  }
  return commands.filter(Boolean).join("\n");
}

function headerFooter({ patternTitle, tileId, tileNumber, tileCount, paper, rows, cols, overlapPt, layout, safety }) {
  const { marginPt, pageWidthPt, pageHeightPt, contentTopPt, contentBottomPt } = layout;
  const headerBaseline = pageHeightPt - marginPt - Units.toPtFromMm(5);
  const footerBaseline = marginPt + Units.toPtFromMm(3.5);
  const title = truncateLine(patternTitle, 58);
  const rightHeader = `Tile ${tileId} | Page ${tileNumber}/${tileCount} | ${paper.label}`;
  const overlapLabel = `${formatNumber((overlapPt / 72) * 25.4)}mm`;
  const footer = `Print 100% | ${overlapLabel} overlap | Map ${rows}x${cols} | PDF page ${tileNumber + 1}/${tileCount + 1}`;
  const safetyCommands = safety?.experimental
    ? [
        `% EXPORT_WARNING_CODE ${commentText(safety.code)}`,
        "0.72 0.04 0.04 rg",
        textCommand(safety.shortWarning, marginPt, pageHeightPt - marginPt - Units.toPtFromMm(10.5), 6.5),
        "0 0 0 rg",
      ]
    : [];
  return [
    "% HEADER_FOOTER_UPRIGHT",
    "0 0 0 rg",
    textCommand(title, marginPt, headerBaseline, 8.5),
    textCommand(rightHeader, Math.max(marginPt, pageWidthPt - marginPt - Units.toPtFromMm(70)), headerBaseline, 7.5),
    ...safetyCommands,
    "0.65 0.65 0.65 RG",
    `${formatNumber(Units.toPtFromMm(0.18))} w`,
    `${formatNumber(marginPt)} ${formatNumber(pageHeightPt - contentTopPt)} m ${formatNumber(pageWidthPt - marginPt)} ${formatNumber(pageHeightPt - contentTopPt)} l S`,
    `${formatNumber(marginPt)} ${formatNumber(contentBottomPt)} m ${formatNumber(pageWidthPt - marginPt)} ${formatNumber(contentBottomPt)} l S`,
    "0 0 0 rg",
    textCommand(footer, marginPt, footerBaseline, 6.5),
  ].filter(Boolean).join("\n");
}

function assemblyMap({ rows, cols, x, y, width, height, activeTileIds = null, currentTileId = null }) {
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const fontSize = Math.max(3.5, Math.min(7, cellWidth * 0.18, cellHeight * 0.24));
  const activeSet = activeTileIds ? new Set(activeTileIds) : null;
  const commands = [
    textCommand("Assembly Map", x, y + height + Units.toPtFromMm(4), 8),
  ];
  if (activeSet) {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const tileId = `R${row + 1}C${col + 1}`;
        if (activeSet.has(tileId)) continue;
        const cellX = x + col * cellWidth;
        const cellY = y + height - (row + 1) * cellHeight;
        commands.push("0.92 0.92 0.92 rg");
        commands.push(`${formatNumber(cellX)} ${formatNumber(cellY)} ${formatNumber(cellWidth)} ${formatNumber(cellHeight)} re f`);
      }
    }
  }
  commands.push(
    "0 0 0 rg",
    "0.2 0.2 0.2 RG",
    `${formatNumber(Units.toPtFromMm(0.2))} w`,
    `${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re`
  );
  for (let col = 1; col < cols; col += 1) {
    const lineX = x + cellWidth * col;
    commands.push(`${formatNumber(lineX)} ${formatNumber(y)} m ${formatNumber(lineX)} ${formatNumber(y + height)} l`);
  }
  for (let row = 1; row < rows; row += 1) {
    const lineY = y + cellHeight * row;
    commands.push(`${formatNumber(x)} ${formatNumber(lineY)} m ${formatNumber(x + width)} ${formatNumber(lineY)} l`);
  }
  commands.push("S");

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const tileId = `R${row + 1}C${col + 1}`;
      const cellX = x + col * cellWidth;
      const cellY = y + height - (row + 1) * cellHeight;
      const isActive = !activeSet || activeSet.has(tileId);
      if (tileId === currentTileId) {
        commands.push("0.88 0.94 1 rg");
        commands.push(`${formatNumber(cellX)} ${formatNumber(cellY)} ${formatNumber(cellWidth)} ${formatNumber(cellHeight)} re f`);
        commands.push("0 0 0 rg");
      }
      commands.push(
        textCommand(
          isActive ? tileId : `${tileId} X`,
          cellX + Units.toPtFromMm(1.2),
          cellY + cellHeight / 2 - fontSize / 3,
          fontSize
        )
      );
    }
  }
  return commands.filter(Boolean).join("\n");
}

function calibrationPage({
  paper,
  patternTitle,
  rows,
  cols,
  tileCount,
  activeTileIds,
  overlapPt,
  info,
  labels,
  layout,
  hasStitchPaths,
  safety,
}) {
  const { marginPt, pageWidthPt, pageHeightPt } = layout;
  const commands = [
    "% PAGE_KIND CALIBRATION_INSTRUCTIONS",
    `% PAPER_SIZE ${commentText(paper.label)} ${formatNumber(pageWidthPt)}x${formatNumber(pageHeightPt)}pt`,
    "0 0 0 rg",
    textCommand("PATTERN PRINT GUIDE", marginPt, pageHeightPt - marginPt - Units.toPtFromMm(7), 14),
    textCommand(patternTitle, marginPt, pageHeightPt - marginPt - Units.toPtFromMm(15), 10),
  ];

  if (safety?.experimental) {
    commands.push(
      `% EXPORT_WARNING_CODE ${commentText(safety.code)}`,
      "0.72 0.04 0.04 rg",
      textCommand(safety.warning, marginPt, pageHeightPt - marginPt - Units.toPtFromMm(21), 8),
      "0 0 0 rg",
    );
  }

  const defaultInstructions = [
    "Print at 100% / Actual size. Disable Fit to page.",
    "Measure the 100mm square before cutting fabric.",
    `Join sheets by matching tile IDs. Keep the full ${formatNumber((overlapPt / 72) * 25.4)}mm overlap.`,
    "CUT line = solid. STITCH/SEAM line = dashed.",
  ];
  if (tileCount < rows * cols) {
    defaultInstructions.push("Grey map cells marked X contain no pattern geometry and are not printed.");
  }
  const extraInstructions = wrapText(info.instructionText || "", 82);
  const instructionLines = [...defaultInstructions, ...extraInstructions].slice(0, safety?.experimental ? 7 : 8);
  const instructionStartMm = safety?.experimental ? 28 : 24;
  instructionLines.forEach((line, index) => {
    commands.push(textCommand(line, marginPt, pageHeightPt - marginPt - Units.toPtFromMm(instructionStartMm) - index * Units.toPtFromMm(4.5), 8));
  });

  const squareSize = Units.toPtFromMm(100);
  const squareX = marginPt;
  const squareTop = pageHeightPt - marginPt - Units.toPtFromMm(62);
  const squareY = squareTop - squareSize;
  commands.push(`% CALIBRATION_100MM_SIZE_PT ${formatNumber(squareSize)}`);
  commands.push("0.8 0.05 0.05 RG", `${formatNumber(Units.toPtFromMm(0.35))} w`, "[] 0 d");
  commands.push(`${formatNumber(squareX)} ${formatNumber(squareY)} ${formatNumber(squareSize)} ${formatNumber(squareSize)} re S`);
  for (let tick = 0; tick <= 10; tick += 1) {
    const position = squareX + Units.toPtFromMm(tick * 10);
    const tickSize = Units.toPtFromMm(tick % 5 === 0 ? 4 : 2.5);
    commands.push(`${formatNumber(position)} ${formatNumber(squareTop)} m ${formatNumber(position)} ${formatNumber(squareTop - tickSize)} l`);
  }
  commands.push("S");
  commands.push(textCommand("100mm x 100mm - measure both sides", squareX, squareY - Units.toPtFromMm(5), 8));

  const mark50 = Units.toPtFromMm(50);
  const mark50X = squareX + squareSize + Units.toPtFromMm(8);
  const mark50Y = squareTop - mark50;
  commands.push(`% CALIBRATION_50MM_SIZE_PT ${formatNumber(mark50)}`);
  commands.push(`${formatNumber(mark50X)} ${formatNumber(mark50Y)} ${formatNumber(mark50)} ${formatNumber(mark50)} re S`);
  commands.push(textCommand("50mm x 50mm", mark50X, mark50Y - Units.toPtFromMm(5), 8));

  const infoLines = [];
  if (info.moduleName) infoLines.push(`${labels.patternLabel || "Pattern"}: ${info.moduleName}`);
  if (info.generatedAt) infoLines.push(`${labels.generatedLabel || "Generated"}: ${info.generatedAt}`);
  if (info.optionsSummary) infoLines.push(`${labels.optionsLabel || "Options"}: ${info.optionsSummary}`);
  if (info.seamAllowance) infoLines.push(`${labels.seamAllowanceLabel || "Seam allowance"}: ${info.seamAllowance}`);
  if (safety?.experimental) infoLines.push(`Export status: ${safety.shortWarning}`);
  infoLines.push(`Pattern sheets: ${tileCount}; PDF pages: ${tileCount + 1}; Paper: ${paper.label}`);
  infoLines.forEach((line, index) => {
    commands.push(textCommand(line, mark50X, mark50Y + mark50 - Units.toPtFromMm(8) - index * Units.toPtFromMm(4.5), 7));
  });

  if (hasStitchPaths) {
    const legendY = mark50Y - Units.toPtFromMm(18);
    commands.push("0 0 0 RG", `${formatNumber(Units.toPtFromMm(0.35))} w`, "[] 0 d");
    commands.push(`${formatNumber(mark50X)} ${formatNumber(legendY)} m ${formatNumber(mark50X + mark50)} ${formatNumber(legendY)} l S`);
    commands.push(textCommand("CUT - solid", mark50X, legendY + Units.toPtFromMm(2.5), 7));
    commands.push("[4 2] 0 d", `${formatNumber(mark50X)} ${formatNumber(legendY - Units.toPtFromMm(9))} m ${formatNumber(mark50X + mark50)} ${formatNumber(legendY - Units.toPtFromMm(9))} l S`, "[] 0 d");
    commands.push(textCommand("STITCH / SEAM - dashed", mark50X, legendY - Units.toPtFromMm(6.5), 7));
  }
  if (info.legendText) {
    commands.push(textCommand(info.legendText, mark50X, squareY + Units.toPtFromMm(3), 6.5));
  }

  const mapY = marginPt + Units.toPtFromMm(15);
  const mapHeight = Math.max(Units.toPtFromMm(25), Math.min(Units.toPtFromMm(50), squareY - mapY - Units.toPtFromMm(12)));
  const mapWidth = Math.min(Units.toPtFromMm(90), pageWidthPt - marginPt * 2);
  commands.push(assemblyMap({ rows, cols, x: marginPt, y: mapY, width: mapWidth, height: mapHeight, activeTileIds }));
  commands.push(textCommand(`GLUE LINE: trim only where marked; preserve the ${formatNumber((overlapPt / 72) * 25.4)}mm overlap.`, marginPt, marginPt + Units.toPtFromMm(5), 7));
  commands.push(textCommand(`Calibration / instructions | PDF page 1/${tileCount + 1}`, marginPt, marginPt, 6.5));
  return commands.filter(Boolean).join("\n");
}

function tilePage({
  row,
  col,
  rows,
  cols,
  tileNumber,
  tileCount,
  tile,
  overlapPt,
  paper,
  patternTitle,
  geometry,
  annotationGeometry,
  titleSpecs,
  annotations,
  unitScale,
  resolveText,
  layout,
  safety,
}) {
  const tileId = `R${row + 1}C${col + 1}`;
  const relativeX0Mm = ((tile.minX - tile.geometryMinX) / 72) * 25.4;
  const relativeY0Mm = ((tile.minY - tile.geometryMinY) / 72) * 25.4;
  const relativeX1Mm = relativeX0Mm + (layout.contentWidthPt / 72) * 25.4;
  const relativeY1Mm = relativeY0Mm + (layout.contentHeightPt / 72) * 25.4;
  const clip = `${formatNumber(layout.contentLeftPt)} ${formatNumber(layout.contentBottomPt)} ${formatNumber(layout.contentWidthPt)} ${formatNumber(layout.contentHeightPt)} re W n`;
  const geometryClip = `${formatNumber(Math.max(0, layout.contentLeftPt - GEOMETRY_CLIP_PADDING_PT))} ${formatNumber(Math.max(0, layout.contentBottomPt - GEOMETRY_CLIP_PADDING_PT))} ${formatNumber(Math.min(layout.pageWidthPt, layout.contentLeftPt + layout.contentWidthPt + GEOMETRY_CLIP_PADDING_PT) - Math.max(0, layout.contentLeftPt - GEOMETRY_CLIP_PADDING_PT))} ${formatNumber(Math.min(layout.pageHeightPt, layout.contentBottomPt + layout.contentHeightPt + GEOMETRY_CLIP_PADDING_PT) - Math.max(0, layout.contentBottomPt - GEOMETRY_CLIP_PADDING_PT))} re W n`;
  const translateX = layout.contentLeftPt - tile.minX;
  const translateY = layout.pageHeightPt - layout.contentTopPt + tile.minY;

  return [
    `% PAGE_KIND PATTERN_TILE ${tileId}`,
    `% TILE_WINDOW_MM ${tileId} X0=${formatNumber(relativeX0Mm)} X1=${formatNumber(relativeX1Mm)} Y0=${formatNumber(relativeY0Mm)} Y1=${formatNumber(relativeY1Mm)} OVERLAP=${formatNumber((overlapPt / 72) * 25.4)}`,
    `% RESERVED_HEADER_MM ${HEADER_HEIGHT_MM}`,
    `% RESERVED_FOOTER_MM ${FOOTER_HEIGHT_MM}`,
    "q",
    geometryClip,
    `1 0 0 -1 ${formatNumber(translateX)} ${formatNumber(translateY)} cm`,
    geometry,
    annotationGeometry,
    "Q",
    "q",
    clip,
    titleBlocksForTile(titleSpecs, tile, layout),
    annotationTextForTile(annotations, tile, layout, unitScale, resolveText),
    "Q",
    tileGuides({ row, col, overlapPt, layout }),
    assemblyMarks(layout),
    headerFooter({ patternTitle, tileId, tileNumber, tileCount, paper, rows, cols, overlapPt, layout, safety }),
  ].filter(Boolean).join("\n");
}

function buildPdf(pageStreams, pageSizePt) {
  const objects = [];
  const offsets = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pageIds = pageStreams.map((stream) => {
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> ` +
        `/MediaBox [0 0 ${formatNumber(pageSizePt.width)} ${formatNumber(pageSizePt.height)}] /Contents ${contentId} 0 R >>`
    );
  });

  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let pdf = "%PDF-1.4\n% Pattern Studio technical tiled PDF\n";
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
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
  const pathEntries = collectPaths(draft);
  if (!pathEntries.length) {
    throw new TypeError("PDF export requires at least one non-empty pattern path.");
  }
  pathEntries.forEach((entry, index) => validatePath(entry.path, `paths.${entry.name || index}`));
  const geometryBounds = mergeBounds(pathEntries.map((entry) => entry.path));
  const unit = draft?.meta?.unit;
  if (!SUPPORTED_UNITS.has(unit)) {
    throw new TypeError(`Unsupported PDF source unit: ${String(unit)}.`);
  }
  const annotations = draft?.annotations || [];
  validateAnnotations(annotations);
  const unitScale = Units.toPtFromMm(Units.toMm(1, unit));
  const resolveText = options.resolveText;
  const annotationBoundsList = annotationPrintBounds(annotations, unitScale, resolveText);
  const paperBase = normalizePaperSize(options.paperSize);
  const landscape = normalizeOrientation(options.orientation) === "landscape";
  const paper = landscape
    ? { ...paperBase, label: `${paperBase.label} Landscape`, widthMm: paperBase.heightMm, heightMm: paperBase.widthMm }
    : paperBase;
  const marginMm = positiveNumber(options.marginMm, DEFAULT_MARGIN_MM, "marginMm", { allowZero: true });
  const overlapMm = positiveNumber(options.overlapMm, DEFAULT_OVERLAP_MM, "overlapMm");
  const pageWidthPt = Units.toPtFromMm(paper.widthMm);
  const pageHeightPt = Units.toPtFromMm(paper.heightMm);
  const marginPt = Units.toPtFromMm(marginMm);
  const headerPt = Units.toPtFromMm(HEADER_HEIGHT_MM);
  const footerPt = Units.toPtFromMm(FOOTER_HEIGHT_MM);
  const overlapPt = Units.toPtFromMm(overlapMm);
  const contentWidthPt = pageWidthPt - marginPt * 2;
  const contentHeightPt = pageHeightPt - marginPt * 2 - headerPt - footerPt;
  if (contentWidthPt <= overlapPt || contentHeightPt <= overlapPt) {
    throw new RangeError("Paper margins and reserved header/footer leave no usable tiled pattern area.");
  }

  const geometryBoundsPt = {
    minX: geometryBounds.minX * unitScale,
    minY: geometryBounds.minY * unitScale,
    maxX: geometryBounds.maxX * unitScale,
    maxY: geometryBounds.maxY * unitScale,
  };
  const boundsPt = annotationBoundsList.reduce((result, bounds) => ({
    minX: Math.min(result.minX, bounds.minX),
    minY: Math.min(result.minY, bounds.minY),
    maxX: Math.max(result.maxX, bounds.maxX),
    maxY: Math.max(result.maxY, bounds.maxY),
  }), geometryBoundsPt);
  const widthPt = Math.max(0, boundsPt.maxX - boundsPt.minX);
  const heightPt = Math.max(0, boundsPt.maxY - boundsPt.minY);
  const strideXPt = contentWidthPt - overlapPt;
  const strideYPt = contentHeightPt - overlapPt;
  const cols = tileCountForSpan(widthPt, contentWidthPt, strideXPt);
  const rows = tileCountForSpan(heightPt, contentHeightPt, strideYPt);
  const gridCellCount = rows * cols;
  if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(cols)
    || !Number.isSafeInteger(gridCellCount) || gridCellCount > MAX_TILE_GRID_CELLS) {
    throw new RangeError(`PDF tile grid exceeds the safe limit of ${MAX_TILE_GRID_CELLS} cells.`);
  }
  const layout = {
    pageWidthPt,
    pageHeightPt,
    marginPt,
    contentLeftPt: marginPt,
    contentTopPt: marginPt + headerPt,
    contentBottomPt: marginPt + footerPt,
    contentWidthPt,
    contentHeightPt,
  };
  const labels = options.labels || {};
  const info = options.info || {};
  const safety = resolveExportSafety({ draft, module: options.module, moduleStatus: options.moduleStatus });
  const patternTitle = displayText(draft?.meta?.title, resolveText, "Pattern");
  const geometry = geometryCommands(pathEntries, unitScale);
  const annotationGeometry = annotationGeometryCommands(annotations, unitScale);
  const titleSpecs = titleBlockSpecs({
    panels: draft?.panels || [],
    draftMeta: draft?.meta || {},
    resolveText,
    labels,
    unitScale,
  });
  const hasStitchPaths = pathEntries.some((entry) => pathRole(entry) === "stitch");
  const pathBoundsList = pathEntries.map((entry) => {
    const bounds = pathBounds(entry.path);
    return {
      minX: bounds.minX * unitScale,
      minY: bounds.minY * unitScale,
      maxX: bounds.maxX * unitScale,
      maxY: bounds.maxY * unitScale,
    };
  });
  const tiles = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const tileMinX = boundsPt.minX + col * strideXPt;
      const tileMinY = boundsPt.minY + row * strideYPt;
      const tile = {
        id: `R${row + 1}C${col + 1}`,
        minX: tileMinX,
        minY: tileMinY,
        maxX: tileMinX + contentWidthPt,
        maxY: tileMinY + contentHeightPt,
        geometryMinX: boundsPt.minX,
        geometryMinY: boundsPt.minY,
      };
      if (pathBoundsList.some((bounds) => pathBoundsIntersectTile(bounds, tile))
        || annotationBoundsList.some((bounds) => pathBoundsIntersectTile(bounds, tile))) {
        tiles.push({ row, col, tile });
        if (tiles.length > MAX_PATTERN_PAGES) {
          throw new RangeError(`PDF export exceeds the safe limit of ${MAX_PATTERN_PAGES} pattern pages.`);
        }
      }
    }
  }

  const repeatedGeometryChars = (geometry.length + annotationGeometry.length) * tiles.length;
  if (!Number.isSafeInteger(repeatedGeometryChars) || repeatedGeometryChars > MAX_REPEATED_GEOMETRY_CHARS) {
    throw new RangeError("PDF geometry is too complex for safe tiled export.");
  }

  const activeTileIds = tiles.map(({ tile }) => tile.id);
  const assignedTitleSpecs = assignTitleBlocksToTiles(titleSpecs, tiles);
  const pageStreams = [
    calibrationPage({
      paper,
      patternTitle,
      rows,
      cols,
      tileCount: tiles.length,
      activeTileIds,
      overlapPt,
      info,
      labels,
      layout,
      hasStitchPaths,
      safety,
    }),
  ];
  tiles.forEach(({ row, col, tile }, index) => {
    pageStreams.push(
      tilePage({
        row,
        col,
        rows,
        cols,
        tileNumber: index + 1,
        tileCount: tiles.length,
        tile,
        overlapPt,
        paper,
        patternTitle,
        geometry,
        annotationGeometry,
        titleSpecs: assignedTitleSpecs,
        annotations,
        unitScale,
        resolveText,
        layout,
        safety,
      })
    );
  });

  const pdfText = buildPdf(pageStreams, { width: pageWidthPt, height: pageHeightPt });
  const data = new Blob([pdfText], { type: "application/pdf" });

  // pageCount intentionally remains the number of pattern sheets for backwards
  // compatibility. totalPageCount includes the leading calibration/instruction page.
  return { data, pageCount: tiles.length, totalPageCount: tiles.length + 1 };
}
