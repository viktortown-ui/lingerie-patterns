const MIN_GEOMETRY_SPAN = 0.000001;
const MIN_MILLIMETERS_PER_UNIT = 0.000001;
const MAX_MILLIMETERS_PER_UNIT = 1_000_000;

function finite(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError("Static SVG geometry contains a non-finite coordinate.");
  return Number(number.toFixed(6));
}

function usableSpan(value) {
  return Number.isFinite(value)
    && value >= MIN_GEOMETRY_SPAN
    && value <= 10_000_000;
}

export function resolveStaticViewport(geometry) {
  const viewport = geometry?.viewport;
  if (viewport?.viewBox && typeof viewport.viewBox === "object") {
    const x = finite(viewport.viewBox.minX ?? viewport.viewBox.x ?? 0);
    const y = finite(viewport.viewBox.minY ?? viewport.viewBox.y ?? 0);
    const width = finite(viewport.viewBox.width);
    const height = finite(viewport.viewBox.height);
    if (usableSpan(width) && usableSpan(height)) return { x, y, width, height };
  }
  if (Array.isArray(viewport) && viewport.length === 4) {
    const [x, y, width, height] = viewport.map(finite);
    if (usableSpan(width) && usableSpan(height)) return { x, y, width, height };
  }
  if (viewport && typeof viewport === "object") {
    const x = finite(viewport.x ?? viewport.minX ?? 0);
    const y = finite(viewport.y ?? viewport.minY ?? 0);
    const width = finite(viewport.width);
    const height = finite(viewport.height);
    if (usableSpan(width) && usableSpan(height)) return { x, y, width, height };
  }
  const bounds = geometry?.bounds;
  if (bounds && typeof bounds === "object") {
    const x = finite(bounds.minX ?? bounds.x ?? 0);
    const y = finite(bounds.minY ?? bounds.y ?? 0);
    const maxX = Number(bounds.maxX);
    const maxY = Number(bounds.maxY);
    const width = Number.isFinite(maxX) ? finite(maxX - x) : finite(bounds.width);
    const height = Number.isFinite(maxY) ? finite(maxY - y) : finite(bounds.height);
    if (usableSpan(width) && usableSpan(height)) return { x, y, width, height };
  }
  throw new TypeError("Static SVG geometry has no usable viewport.");
}

export function staticSegmentsToPathData(segments) {
  if (!Array.isArray(segments) || !segments.length) throw new TypeError("Static SVG entity has no segments.");
  return segments.map((segment) => {
    const type = segment?.type;
    if (!new Set(["M", "L", "C", "Z"]).has(type)) {
      throw new TypeError(`Unsupported normalized segment: ${String(type)}`);
    }
    if (type === "Z") return "Z";
    const expected = type === "C" ? 6 : 2;
    if (!Array.isArray(segment.values) || segment.values.length !== expected) {
      throw new TypeError(`Invalid ${type} segment.`);
    }
    return `${type} ${segment.values.map(finite).join(" ")}`;
  }).join(" ");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function serializeStaticPatternSvg(geometry) {
  if (!geometry || !Array.isArray(geometry.entities) || !geometry.entities.length) {
    throw new TypeError("Static pattern contains no drawable entities.");
  }
  const { x, y, width, height } = resolveStaticViewport(geometry);
  const scale = Number(geometry.calibration?.millimetersPerUnit);
  const calibrationClaimed = geometry.calibration?.requiresCalibration === false;
  if (calibrationClaimed && (!Number.isFinite(scale)
    || scale < MIN_MILLIMETERS_PER_UNIT
    || scale > MAX_MILLIMETERS_PER_UNIT)) {
    throw new TypeError("Static pattern contains an invalid confirmed calibration.");
  }
  let physicalSize = "";
  if (calibrationClaimed) {
    const physicalWidth = finite(width * scale);
    const physicalHeight = finite(height * scale);
    if (!usableSpan(physicalWidth) || !usableSpan(physicalHeight)) {
      throw new TypeError("Static pattern physical dimensions are outside the supported range.");
    }
    physicalSize = ` width="${physicalWidth}mm" height="${physicalHeight}mm" data-mm-per-unit="${finite(scale)}"`;
  }
  const paths = geometry.entities.map((entity, index) => {
    const id = typeof entity.id === "string" && entity.id ? entity.id : `entity-${index + 1}`;
    return `  <path id="${escapeXml(id)}" d="${escapeXml(staticSegmentsToPathData(entity.segments))}" fill="none" stroke="#111111" stroke-width="0.35" vector-effect="non-scaling-stroke"/>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}"${physicalSize}>`,
    ...paths,
    "</svg>",
  ].join("\n");
}
