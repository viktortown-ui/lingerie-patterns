import { Units } from "../geometry/Units.js";

function mergeBounds(boundsList) {
  const minX = Math.min(...boundsList.map((b) => b.minX));
  const minY = Math.min(...boundsList.map((b) => b.minY));
  const maxX = Math.max(...boundsList.map((b) => b.maxX));
  const maxY = Math.max(...boundsList.map((b) => b.maxY));
  return { minX, minY, maxX, maxY };
}

function renderAnnotations(annotations = []) {
  return annotations
    .map((anno) => {
      if (anno.type === "grainline") {
        return `<line x1="${anno.start.x}" y1="${anno.start.y}" x2="${anno.end.x}" y2="${anno.end.y}" stroke="#333" stroke-width="0.2" marker-end="url(#arrow)" />`;
      }
      if (anno.type === "notch") {
        return `<circle cx="${anno.point.x}" cy="${anno.point.y}" r="0.2" fill="#333" />`;
      }
      if (anno.type === "label") {
        return `<text x="${anno.point.x}" y="${anno.point.y}" font-size="2" fill="#333">${anno.text}</text>`;
      }
      return "";
    })
    .join("\n");
}

export function svgExport(draft, measurementsSummary = []) {
  const paths = Object.values(draft.paths);
  const bounds = mergeBounds(paths.map((path) => path.bounds()));
  const padding = 2;
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${width} ${height}`;

  const meta = draft.meta || {};
  const summaryText = measurementsSummary.join(", ");
  const scaleInfo = `Units: ${meta.unit || "cm"} | Seam allowance: ${meta.seamAllowanceApplied ? "on" : "off"}`;
  const calibrationSize = Units.fromMm(50, meta.unit || "cm");
  const calibX = bounds.minX + 2;
  const calibY = bounds.minY + 2 + calibrationSize;

  const annotationMarkup = renderAnnotations(draft.annotations);

  const pathMarkup = paths
    .map((path, index) => `<path d="${path.toSVGPath()}" fill="none" stroke="#000" stroke-width="0.2" data-name="${Object.keys(draft.paths)[index]}" />`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${Units.toMm(width, meta.unit)}mm" height="${Units.toMm(height, meta.unit)}mm">
  <defs>
    <marker id="arrow" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L4,2 L0,4 z" fill="#333" />
    </marker>
  </defs>
  <rect x="${bounds.minX - padding}" y="${bounds.minY - padding}" width="${width}" height="${height}" fill="white" />
  ${pathMarkup}
  ${annotationMarkup}
  <g id="calibration-50mm" stroke="#d11" stroke-width="0.4" fill="none">
    <line x1="${calibX}" y1="${calibY}" x2="${calibX + calibrationSize}" y2="${calibY}" />
    <line x1="${calibX + calibrationSize}" y1="${calibY}" x2="${calibX + calibrationSize}" y2="${calibY - calibrationSize}" />
    <text x="${calibX}" y="${calibY + 1.2}" font-size="1.8" fill="#d11">50mm</text>
  </g>
  <rect x="${bounds.minX + 1}" y="${bounds.minY + 1}" width="1" height="1" fill="none" stroke="#555" stroke-width="0.1" />
  <text x="${bounds.minX + 2}" y="${bounds.minY + height - 1}" font-size="2" fill="#333">${meta.title || "Pattern"}</text>
  <text x="${bounds.minX + 2}" y="${bounds.minY + height - 3}" font-size="1.6" fill="#555">${scaleInfo}</text>
  <text x="${bounds.minX + 2}" y="${bounds.minY + height - 5}" font-size="1.6" fill="#555">${summaryText}</text>
</svg>`;
}
