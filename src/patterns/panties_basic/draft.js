import { Path } from "../../core/geometry/Path.js";
import { Point } from "../../core/geometry/Point.js";
import { offsetPath } from "../../core/geometry/Offset.js";
import { grainline, notch, label } from "../../core/pattern/annotations.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function draftPanties(measurements, options = {}) {
  const { waist, hip, rise, legOpening } = measurements;
  if ([waist, hip, rise, legOpening].some((value) => typeof value !== "number" || Number.isNaN(value))) {
    throw new Error("Invalid measurements provided");
  }

  const waistWidth = waist / 4 + 2;
  const hipWidth = hip / 4 + 3;
  const riseHeight = rise;
  const crotchWidth = clamp(legOpening / 8, 5, 9);
  const legCurveDepth = clamp(hipWidth * 0.35, 6, 12);

  // Base block (front) in cm. Start at waist left.
  const path = new Path();
  path
    .moveTo(0, 0)
    .lineTo(waistWidth, 0)
    .curveTo(waistWidth + 1, riseHeight * 0.3, hipWidth, riseHeight * 0.6, hipWidth, riseHeight)
    .curveTo(hipWidth, riseHeight + legCurveDepth, crotchWidth, riseHeight + legCurveDepth, crotchWidth, riseHeight)
    .lineTo(0, riseHeight)
    .close();

  const seamAllowance = options.seamAllowance === "on" ? 0.8 : 0;
  const seamPath = seamAllowance ? offsetPath(path, seamAllowance) : null;

  const paths = {
    front: path,
  };

  if (seamPath) {
    paths.front_seam = seamPath;
  }

  const annotations = [
    grainline(new Point(hipWidth * 0.5, 2), new Point(hipWidth * 0.5, riseHeight - 2)),
    notch(new Point(hipWidth * 0.5, riseHeight)),
    label(new Point(hipWidth * 0.2, riseHeight * 0.5), "Front")
  ];

  return {
    paths,
    annotations,
    meta: {
      unit: "cm",
      title: "Panties Basic",
      moduleId: "panties_basic",
      moduleVersion: "0.1.0",
      seamAllowanceApplied: seamAllowance > 0,
    },
  };
}
