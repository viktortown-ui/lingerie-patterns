import { collectPaths } from "../pattern/panels.js";
import { parseAsciiDxf } from "./dxfParser.js";
import { qualifyExportFilename, resolveExportSafety } from "./exportSafety.js";

const UNIT_INFO = Object.freeze({
  in: { mm: 25.4, insUnits: 1, measurement: 0 },
  mm: { mm: 1, insUnits: 4, measurement: 1 },
  cm: { mm: 10, insUnits: 5, measurement: 1 },
});
const MIN_CURVE_TOLERANCE_MM = 0.01;
const MAX_DXF_VERTICES_PER_PATH = 2048;
const MAX_DXF_VERTICES_TOTAL = 8192;

export const DXF_LAYERS = Object.freeze(["CUT", "SEAM", "NOTCH", "GRAIN", "TEXT"]);
export const DXF_SEMANTIC_PROFILE = "lekalo-apparel-semantic-v1";

export class DxfValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "DxfValidationError";
    this.issues = issues;
  }
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new DxfValidationError(`${label} must be finite.`, [label]);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new DxfValidationError(`${label} must be positive.`, [label]);
  return number;
}

function formatNumber(value) {
  const number = finite(value, "DXF coordinate");
  if (Object.is(number, -0) || Math.abs(number) < 0.0000005) return "0";
  return number.toFixed(6).replace(/\.?0+$/, "");
}

function pointIsFinite(point) {
  return point && typeof point.x === "number" && typeof point.y === "number"
    && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function pointsEqual(a, b, epsilon = 1e-9) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function orientation(value, epsilon = 1e-9) {
  if (value > epsilon) return 1;
  if (value < -epsilon) return -1;
  return 0;
}

function pointOnSegmentInterior(point, start, end, epsilon = 1e-9) {
  if (Math.abs(cross(start, end, point)) > epsilon) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = (point.x - start.x) * dx + (point.y - start.y) * dy;
  return projection > epsilon && projection < lengthSquared - epsilon;
}

function collinearOverlap(a, b, c, d, epsilon = 1e-9) {
  const useX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const first = useX ? [a.x, b.x] : [a.y, b.y];
  const second = useX ? [c.x, d.x] : [c.y, d.y];
  return Math.min(Math.max(...first), Math.max(...second))
    - Math.max(Math.min(...first), Math.min(...second)) > epsilon;
}

function segmentsIntersect(a, b, c, d) {
  const signs = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)]
    .map((value) => orientation(value));
  if (signs[0] * signs[1] < 0 && signs[2] * signs[3] < 0) return true;
  if (pointOnSegmentInterior(a, c, d) || pointOnSegmentInterior(b, c, d)) return true;
  if (pointOnSegmentInterior(c, a, b) || pointOnSegmentInterior(d, a, b)) return true;
  return signs.every((value) => value === 0) && collinearOverlap(a, b, c, d);
}

function firstSelfIntersection(points) {
  const segments = points.map((point, index) => [point, points[(index + 1) % points.length]]);
  for (let first = 0; first < segments.length; first += 1) {
    for (let second = first + 1; second < segments.length; second += 1) {
      const adjacent = second === first + 1 || (first === 0 && second === segments.length - 1);
      if (!adjacent && segmentsIntersect(...segments[first], ...segments[second])) {
        return [first, second];
      }
    }
  }
  return null;
}

function distanceToLine(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= Number.EPSILON) return Math.hypot(point.x - start.x, point.y - start.y);
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / length;
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function flattenCubic(p0, p1, p2, p3, tolerance, output, depth = 0) {
  const flatness = Math.max(distanceToLine(p1, p0, p3), distanceToLine(p2, p0, p3));
  if (flatness <= tolerance || depth >= 14) {
    output.push({ x: p3.x, y: p3.y });
    return;
  }
  const p01 = midpoint(p0, p1);
  const p12 = midpoint(p1, p2);
  const p23 = midpoint(p2, p3);
  const p012 = midpoint(p01, p12);
  const p123 = midpoint(p12, p23);
  const split = midpoint(p012, p123);
  flattenCubic(p0, p01, p012, split, tolerance, output, depth + 1);
  flattenCubic(split, p123, p23, p3, tolerance, output, depth + 1);
}

function pathIsClosed(path) {
  return Array.isArray(path?.segments) && path.segments.at(-1)?.type === "Z";
}

function flattenClosedPath(path, tolerance, label) {
  if (!path || !Array.isArray(path.segments) || path.segments.length < 3) {
    throw new DxfValidationError(`${label} is not a valid Path.`, [label]);
  }
  if (!pathIsClosed(path)) {
    throw new DxfValidationError(`${label} must be explicitly closed before DXF export.`, [label]);
  }
  const moveCount = path.segments.filter((segment) => segment.type === "M").length;
  const closeCount = path.segments.filter((segment) => segment.type === "Z").length;
  if (moveCount !== 1 || closeCount !== 1 || path.segments[0].type !== "M") {
    throw new DxfValidationError(`${label} must contain one closed subpath.`, [label]);
  }

  const output = [];
  let currentPoint = null;
  path.segments.forEach((segment, index) => {
    const points = segment.points || [];
    points.forEach((point, pointIndex) => {
      if (!pointIsFinite(point)) {
        throw new DxfValidationError(
          `${label}.segments[${index}].points[${pointIndex}] must be finite.`,
          [`${label}.segments[${index}].points[${pointIndex}]`],
        );
      }
    });
    if (segment.type === "M") {
      output.push({ x: Number(points[0].x), y: Number(points[0].y) });
      currentPoint = points[0];
    } else if (segment.type === "L") {
      if (points.length !== 2) throw new DxfValidationError(`${label} has a malformed line segment.`, [label]);
      if (!currentPoint || !pointsEqual(points[0], currentPoint)) {
        throw new DxfValidationError(`${label}.segments[${index}] is disconnected.`, [label]);
      }
      output.push({ x: Number(points[1].x), y: Number(points[1].y) });
      currentPoint = points[1];
    } else if (segment.type === "C") {
      if (points.length !== 4) throw new DxfValidationError(`${label} has a malformed cubic segment.`, [label]);
      if (!currentPoint || !pointsEqual(points[0], currentPoint)) {
        throw new DxfValidationError(`${label}.segments[${index}] is disconnected.`, [label]);
      }
      flattenCubic(
        ...points.map((point) => ({ x: Number(point.x), y: Number(point.y) })),
        tolerance,
        output,
      );
      currentPoint = points[3];
    } else if (segment.type !== "Z") {
      throw new DxfValidationError(`${label} has unsupported segment type ${segment.type}.`, [label]);
    }
  });

  const deduplicated = output.filter((point, index) => index === 0 || !pointsEqual(point, output[index - 1]));
  if (deduplicated.length > 1 && pointsEqual(deduplicated[0], deduplicated.at(-1))) deduplicated.pop();
  if (deduplicated.length < 3) {
    throw new DxfValidationError(`${label} must contain at least three distinct vertices.`, [label]);
  }
  if (deduplicated.length > MAX_DXF_VERTICES_PER_PATH) {
    throw new DxfValidationError(
      `${label} exceeds the safe limit of ${MAX_DXF_VERTICES_PER_PATH} flattened vertices.`,
      [label],
    );
  }
  const intersection = firstSelfIntersection(deduplicated);
  if (intersection) {
    throw new DxfValidationError(
      `${label} must not self-intersect (segments ${intersection[0]} and ${intersection[1]}).`,
      [label],
    );
  }
  return deduplicated;
}

function pathLayer(entry) {
  const name = String(entry.pathName || entry.name || "").toLowerCase();
  return name.includes("seam") || name.includes("stitch") ? "SEAM" : "CUT";
}

function localized(value, resolveText) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const resolved = typeof resolveText === "function" ? resolveText(value) : null;
    return String(resolved ?? value.en ?? value.ru ?? "");
  }
  return "";
}

function asciixdata(entries) {
  return entries
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
    .map(([key, value]) => `${key}=${String(value)}`);
}

function toDxfAscii(value, maxLength = 240) {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ");
  let output = "";
  for (const character of text) {
    const code = character.codePointAt(0);
    const token = character === "\\"
      ? "\\\\"
      : code >= 0x20 && code <= 0x7e
        ? character
        : code <= 0xffff
          ? `\\U+${code.toString(16).toUpperCase().padStart(4, "0")}`
          : "?";
    if (output.length + token.length > maxLength) break;
    output += token;
  }
  return output;
}

function sourceBounds(entries) {
  const points = entries.flatMap((entry) => entry.points);
  if (!points.length) throw new DxfValidationError("The draft contains no DXF geometry.", ["draft.paths"]);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const bounds = {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
  Object.entries(bounds).forEach(([key, value]) => finite(value, `draft.bounds.${key}`));
  if (!(bounds.maxX > bounds.minX) || !(bounds.maxY > bounds.minY)) {
    throw new DxfValidationError("The draft must have positive width and height.", ["draft.bounds"]);
  }
  return bounds;
}

function annotationPoints(annotation, index) {
  const label = `draft.annotations[${index}]`;
  const requirePoint = (point, suffix) => {
    if (!pointIsFinite(point)) throw new DxfValidationError(`${label}.${suffix} must be finite.`, [`${label}.${suffix}`]);
  };
  if (["grainline", "stretchline", "foldline"].includes(annotation.type)) {
    requirePoint(annotation.start, "start");
    requirePoint(annotation.end, "end");
  } else if (["notch", "label", "control"].includes(annotation.type)) {
    requirePoint(annotation.point, "point");
  } else {
    throw new DxfValidationError(`Unsupported annotation type ${String(annotation.type)}.`, [`${label}.type`]);
  }
}

function transformFactory(bounds, scale, normalizeOrigin) {
  if (normalizeOrigin) {
    return (point) => ({
      x: (Number(point.x) - bounds.minX) * scale,
      y: (bounds.maxY - Number(point.y)) * scale,
    });
  }
  return (point) => ({ x: Number(point.x) * scale, y: -Number(point.y) * scale });
}

function transformedBounds(entries, transform) {
  const points = entries.flatMap((entry) => entry.points.map(transform));
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function pair(lines, code, value) {
  lines.push(String(code), String(value));
}

function addXdata(lines, metadata) {
  pair(lines, 1001, "LEKALO");
  metadata.forEach((value) => pair(lines, 1000, toDxfAscii(value)));
}

function addPolyline(lines, layer, points, metadata) {
  pair(lines, 0, "POLYLINE");
  pair(lines, 8, layer);
  pair(lines, 66, 1);
  pair(lines, 70, 1);
  // Required elevation/origin fields for the classic R12 2D POLYLINE entity.
  pair(lines, 10, 0);
  pair(lines, 20, 0);
  pair(lines, 30, 0);
  addXdata(lines, metadata);
  points.forEach((point) => {
    pair(lines, 0, "VERTEX");
    pair(lines, 8, layer);
    pair(lines, 10, formatNumber(point.x));
    pair(lines, 20, formatNumber(point.y));
    pair(lines, 30, 0);
  });
  pair(lines, 0, "SEQEND");
  pair(lines, 8, layer);
}

function addLine(lines, layer, start, end, metadata = []) {
  pair(lines, 0, "LINE");
  pair(lines, 8, layer);
  pair(lines, 10, formatNumber(start.x));
  pair(lines, 20, formatNumber(start.y));
  pair(lines, 30, 0);
  pair(lines, 11, formatNumber(end.x));
  pair(lines, 21, formatNumber(end.y));
  pair(lines, 31, 0);
  if (metadata.length) addXdata(lines, metadata);
}

function addPoint(lines, layer, point, metadata = []) {
  pair(lines, 0, "POINT");
  pair(lines, 8, layer);
  pair(lines, 10, formatNumber(point.x));
  pair(lines, 20, formatNumber(point.y));
  pair(lines, 30, 0);
  if (metadata.length) addXdata(lines, metadata);
}

function addText(lines, point, height, text, metadata = []) {
  pair(lines, 0, "TEXT");
  pair(lines, 8, "TEXT");
  pair(lines, 10, formatNumber(point.x));
  pair(lines, 20, formatNumber(point.y));
  pair(lines, 30, 0);
  pair(lines, 40, formatNumber(height));
  pair(lines, 1, toDxfAscii(text));
  if (metadata.length) addXdata(lines, metadata);
}

function addHeader(lines, outputUnit, bounds, profile, safety) {
  pair(lines, 0, "SECTION");
  pair(lines, 2, "HEADER");
  pair(lines, 9, "$ACADVER");
  pair(lines, 1, "AC1009");
  pair(lines, 9, "$INSUNITS");
  pair(lines, 70, UNIT_INFO[outputUnit].insUnits);
  pair(lines, 9, "$MEASUREMENT");
  pair(lines, 70, UNIT_INFO[outputUnit].measurement);
  pair(lines, 9, "$LUNITS");
  pair(lines, 70, 2);
  pair(lines, 9, "$LUPREC");
  pair(lines, 70, 6);
  pair(lines, 9, "$EXTMIN");
  pair(lines, 10, formatNumber(bounds.minX));
  pair(lines, 20, formatNumber(bounds.minY));
  pair(lines, 30, 0);
  pair(lines, 9, "$EXTMAX");
  pair(lines, 10, formatNumber(bounds.maxX));
  pair(lines, 20, formatNumber(bounds.maxY));
  pair(lines, 30, 0);
  pair(lines, 999, toDxfAscii(`LEKALO_PROFILE=${profile}`));
  pair(lines, 999, "AAMA_ASTM_CERTIFIED=NO");
  pair(lines, 999, "EXTERNAL_CAD_ROUND_TRIP=NOT_TESTED");
  if (safety?.experimental) {
    pair(lines, 999, `FIT_STATUS=${safety.status}`);
    pair(lines, 999, `EXPORT_WARNING_CODE=${safety.code}`);
    pair(lines, 999, `USAGE=${safety.usage}`);
    pair(lines, 999, "PRODUCTION_VERIFIED=NO");
    pair(lines, 999, safety.warning);
  }
  pair(lines, 0, "ENDSEC");
}

function addTables(lines) {
  const layerStyles = {
    CUT: { color: 7, type: "CONTINUOUS" },
    SEAM: { color: 1, type: "DASHED" },
    NOTCH: { color: 3, type: "CONTINUOUS" },
    GRAIN: { color: 5, type: "DASHED" },
    TEXT: { color: 2, type: "CONTINUOUS" },
  };
  pair(lines, 0, "SECTION");
  pair(lines, 2, "TABLES");

  pair(lines, 0, "TABLE");
  pair(lines, 2, "LTYPE");
  pair(lines, 70, 2);
  pair(lines, 0, "LTYPE");
  pair(lines, 2, "CONTINUOUS");
  pair(lines, 70, 0);
  pair(lines, 3, "Solid line");
  pair(lines, 72, 65);
  pair(lines, 73, 0);
  pair(lines, 40, 0);
  pair(lines, 0, "LTYPE");
  pair(lines, 2, "DASHED");
  pair(lines, 70, 0);
  pair(lines, 3, "Dashed line");
  pair(lines, 72, 65);
  pair(lines, 73, 2);
  pair(lines, 40, 6);
  pair(lines, 49, 4);
  pair(lines, 74, 0);
  pair(lines, 49, -2);
  pair(lines, 74, 0);
  pair(lines, 0, "ENDTAB");

  pair(lines, 0, "TABLE");
  pair(lines, 2, "LAYER");
  pair(lines, 70, DXF_LAYERS.length);
  DXF_LAYERS.forEach((name) => {
    pair(lines, 0, "LAYER");
    pair(lines, 2, name);
    pair(lines, 70, 0);
    pair(lines, 62, layerStyles[name].color);
    pair(lines, 6, layerStyles[name].type);
  });
  pair(lines, 0, "ENDTAB");

  pair(lines, 0, "TABLE");
  pair(lines, 2, "APPID");
  pair(lines, 70, 1);
  pair(lines, 0, "APPID");
  pair(lines, 2, "LEKALO");
  pair(lines, 70, 0);
  pair(lines, 0, "ENDTAB");
  pair(lines, 0, "ENDSEC");
}

function addEmptyBlocks(lines) {
  pair(lines, 0, "SECTION");
  pair(lines, 2, "BLOCKS");
  pair(lines, 0, "ENDSEC");
}

/** Strictly validates geometry and units without creating a file. */
export function validateDraftForDxf(draft, options = {}) {
  if (!draft || typeof draft !== "object") {
    throw new DxfValidationError("A draft object is required.", ["draft"]);
  }
  const sourceUnit = options.sourceUnit || draft.meta?.unit;
  const outputUnit = options.outputUnit || "mm";
  if (!UNIT_INFO[sourceUnit]) {
    throw new DxfValidationError(`Unsupported or missing source unit: ${String(sourceUnit)}.`, ["draft.meta.unit"]);
  }
  if (!UNIT_INFO[outputUnit]) {
    throw new DxfValidationError(`Unsupported output unit: ${String(outputUnit)}.`, ["options.outputUnit"]);
  }
  const tolerance = positive(options.curveTolerance ?? (outputUnit === "mm" ? 0.2 : 0.02), "curveTolerance");
  const minimumTolerance = MIN_CURVE_TOLERANCE_MM / UNIT_INFO[outputUnit].mm;
  if (tolerance < minimumTolerance) {
    throw new DxfValidationError(
      `curveTolerance must be at least ${minimumTolerance} ${outputUnit}.`,
      ["curveTolerance"],
    );
  }
  const scale = UNIT_INFO[sourceUnit].mm / UNIT_INFO[outputUnit].mm;
  const pathEntries = collectPaths(draft);
  if (!pathEntries.length) throw new DxfValidationError("The draft has no paths.", ["draft.paths"]);
  const flattened = pathEntries.map((entry, index) => ({
    ...entry,
    layer: pathLayer(entry),
    points: flattenClosedPath(entry.path, tolerance / scale, `draft.paths[${index}]`),
  }));
  const totalVertices = flattened.reduce((sum, entry) => sum + entry.points.length, 0);
  if (totalVertices > MAX_DXF_VERTICES_TOTAL) {
    throw new DxfValidationError(
      `The draft exceeds the safe limit of ${MAX_DXF_VERTICES_TOTAL} flattened vertices.`,
      ["draft.paths"],
    );
  }
  if (draft.annotations != null && !Array.isArray(draft.annotations)) {
    throw new DxfValidationError("draft.annotations must be an array.", ["draft.annotations"]);
  }
  const annotations = draft.annotations || [];
  annotations.forEach(annotationPoints);
  const bounds = sourceBounds(flattened);
  return { sourceUnit, outputUnit, tolerance, scale, flattened, annotations, bounds };
}

function quantizePolyline(points, label) {
  const quantized = points.map((point) => ({
    x: Number(formatNumber(point.x)),
    y: Number(formatNumber(point.y)),
  }));
  quantized.forEach((point, index) => {
    const next = quantized[(index + 1) % quantized.length];
    if (pointsEqual(point, next, 0)) {
      throw new DxfValidationError(`${label} collapses after six-decimal DXF quantization.`, [label]);
    }
  });
  const areaTwice = quantized.reduce((sum, point, index) => {
    const next = quantized[(index + 1) % quantized.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  if (!Number.isFinite(areaTwice) || Math.abs(areaTwice) <= 1e-12) {
    throw new DxfValidationError(`${label} has zero area after DXF quantization.`, [label]);
  }
  const intersection = firstSelfIntersection(quantized);
  if (intersection) {
    throw new DxfValidationError(`${label} self-intersects after DXF quantization.`, [label]);
  }
  return quantized;
}

/**
 * Creates an ASCII DXF R12 document and a validation report.
 * Named layers and XDATA are apparel-oriented; no AAMA/ASTM certification is claimed.
 */
export function buildDxfExport(draft, options = {}) {
  const validated = validateDraftForDxf(draft, options);
  const safety = resolveExportSafety({ draft, module: options.module, moduleStatus: options.moduleStatus });
  const normalizeOrigin = options.normalizeOrigin !== false;
  const transform = transformFactory(validated.bounds, validated.scale, normalizeOrigin);
  const exportEntries = validated.flattened.map((entry, index) => ({
    ...entry,
    points: quantizePolyline(entry.points.map(transform), `draft.paths[${index}]`),
  }));
  const bounds = transformedBounds(exportEntries, (point) => point);
  const resolveText = options.resolveText;
  const profile = options.semanticProfile || DXF_SEMANTIC_PROFILE;
  const lines = [];
  addHeader(lines, validated.outputUnit, bounds, profile, safety);
  addTables(lines);
  addEmptyBlocks(lines);
  pair(lines, 0, "SECTION");
  pair(lines, 2, "ENTITIES");

  exportEntries.forEach((entry) => {
    const panel = (draft.panels || []).find((candidate) => candidate.id === entry.panelId) || {};
    const metadata = asciixdata([
      ["PIECE_ID", entry.panelId || entry.name || "piece"],
      ["PIECE_NAME", localized(panel.name, resolveText)],
      ["PATH_NAME", entry.pathName || entry.name || "outline"],
      ["PATH_ROLE", entry.layer],
      ["CUT_QTY", localized(panel.cutQty, resolveText)],
      ["MATERIAL", localized(panel.material, resolveText)],
      ["MODULE_ID", draft.meta?.moduleId],
      ["MODULE_VERSION", draft.meta?.moduleVersion],
      ["SOURCE_UNIT", validated.sourceUnit],
      ["OUTPUT_UNIT", validated.outputUnit],
      ...(safety.experimental ? [
        ["FIT_STATUS", safety.status],
        ["EXPORT_WARNING_CODE", safety.code],
        ["USAGE", safety.usage],
        ["PRODUCTION_VERIFIED", "NO"],
      ] : []),
    ]);
    addPolyline(lines, entry.layer, entry.points, metadata);
  });

  let skippedControls = 0;
  validated.annotations.forEach((annotation, index) => {
    const annotationId = `ANNOTATION_INDEX=${index}`;
    if (["grainline", "stretchline", "foldline"].includes(annotation.type)) {
      const layer = annotation.type === "foldline" ? "SEAM" : "GRAIN";
      addLine(lines, layer, transform(annotation.start), transform(annotation.end), [
        annotationId,
        `ANNOTATION_TYPE=${annotation.type}`,
        `LABEL=${localized(annotation.label, resolveText)}`,
      ]);
    } else if (annotation.type === "notch") {
      addPoint(lines, "NOTCH", transform(annotation.point), [
        annotationId,
        "ANNOTATION_TYPE=notch",
        `LABEL=${localized(annotation.label, resolveText)}`,
      ]);
    } else if (annotation.type === "label") {
      addText(
        lines,
        transform(annotation.point),
        positive(options.textHeight ?? (validated.outputUnit === "mm" ? 3 : 0.3), "textHeight"),
        localized(annotation.text, resolveText),
        [annotationId, "ANNOTATION_TYPE=label"],
      );
    } else if (annotation.type === "control") {
      skippedControls += 1;
    }
  });

  let safetyWarningTextAdded = false;
  if (options.includePieceMetadataText !== false || safety.experimental) {
    const textHeight = positive(
      options.metadataTextHeight ?? (validated.outputUnit === "mm" ? 2.5 : 0.25),
      "metadataTextHeight",
    );
    (draft.panels || []).forEach((panel) => {
      const entries = exportEntries.filter((entry) => entry.panelId === panel.id);
      if (!entries.length) return;
      const panelPoints = entries.flatMap((entry) => entry.points);
      const panelBounds = {
        minX: Math.min(...panelPoints.map((point) => point.x)),
        minY: Math.min(...panelPoints.map((point) => point.y)),
        maxX: Math.max(...panelPoints.map((point) => point.x)),
        maxY: Math.max(...panelPoints.map((point) => point.y)),
      };
      const point = {
        x: (panelBounds.minX + panelBounds.maxX) / 2,
        y: (panelBounds.minY + panelBounds.maxY) / 2,
      };
      const parts = [
        `PIECE ${localized(panel.name, resolveText) || panel.id}`,
        panel.cutQty ? `CUT ${localized(panel.cutQty, resolveText)}` : "",
        panel.material ? `MATERIAL ${localized(panel.material, resolveText)}` : "",
        draft.meta?.moduleId ? `MODULE ${draft.meta.moduleId}@${draft.meta.moduleVersion || "0"}` : "",
      ].filter(Boolean);
      if (options.includePieceMetadataText !== false) {
        addText(lines, point, textHeight, parts.join(" | "), [
          `PIECE_ID=${panel.id || "piece"}`,
          "TEXT_ROLE=PIECE_METADATA",
        ]);
      }
      if (safety.experimental) {
        const warningPoint = {
          x: point.x,
          y: Math.max(panelBounds.minY + textHeight, point.y - textHeight * 2),
        };
        addText(lines, warningPoint, textHeight, safety.warning, [
          `PIECE_ID=${panel.id || "piece"}`,
          "TEXT_ROLE=EXPORT_SAFETY_WARNING",
          `EXPORT_WARNING_CODE=${safety.code}`,
        ]);
        safetyWarningTextAdded = true;
      }
    });
  }
  if (safety.experimental && !safetyWarningTextAdded) {
    const textHeight = positive(
      options.metadataTextHeight ?? (validated.outputUnit === "mm" ? 2.5 : 0.25),
      "metadataTextHeight",
    );
    addText(lines, { x: bounds.minX, y: bounds.minY + textHeight }, textHeight, safety.warning, [
      "PIECE_ID=pattern",
      "TEXT_ROLE=EXPORT_SAFETY_WARNING",
      `EXPORT_WARNING_CODE=${safety.code}`,
    ]);
  }

  pair(lines, 0, "ENDSEC");
  pair(lines, 0, "EOF");
  const data = `${lines.join("\r\n")}\r\n`;
  const parsed = parseAsciiDxf(data);
  const polylines = parsed.entities.filter((entity) => entity.type === "POLYLINE");
  if (polylines.length !== exportEntries.length) {
    throw new DxfValidationError("DXF round-trip lost one or more pattern paths.", ["roundTrip.paths"]);
  }

  return {
    data,
    fileName: qualifyExportFilename(
      `${String(draft.meta?.moduleId || "pattern").replace(/[^A-Za-z0-9._-]+/g, "-")}.dxf`,
      safety,
    ),
    report: {
      format: "ASCII DXF",
      dxfVersion: "AC1009",
      sourceUnit: validated.sourceUnit,
      outputUnit: validated.outputUnit,
      insUnits: UNIT_INFO[validated.outputUnit].insUnits,
      curveRepresentation: "adaptive-closed-polyline",
      curveTolerance: validated.tolerance,
      layers: [...DXF_LAYERS],
      pathCount: validated.flattened.length,
      entityCount: parsed.entities.length,
      semanticProfile: profile,
      internalParserRoundTrip: true,
      externalCadRoundTrip: false,
      aamaAstmCertified: false,
      industrialProductionQualified: false,
      skippedControls,
      ...(safety.experimental ? {
        fitStatus: safety.status,
        usage: safety.usage,
        exportWarningCode: safety.code,
      } : {}),
    },
  };
}

/** Convenience API matching svgExport(): returns only the DXF text. */
export function dxfExport(draft, options = {}) {
  return buildDxfExport(draft, options).data;
}
