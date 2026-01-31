import { Path } from "../../core/geometry/Path.js";
import { Point } from "../../core/geometry/Point.js";
import { offsetPath } from "../../core/geometry/Offset.js";
import { grainline, notch, label, edgeLabel } from "../../core/pattern/annotations.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function draftThong(measurements, options = {}) {
  const { waist, hip, rise, legOpening } = measurements;
  if ([waist, hip, rise, legOpening].some((value) => typeof value !== "number" || Number.isNaN(value))) {
    throw new Error("Invalid measurements provided");
  }

  const waistWidth = waist / 4 + 1.5;
  const hipWidth = hip / 4 + 2.5;
  const riseHeight = rise;
  const legCurveDepth = clamp(hipWidth * 0.4, 6, 14);
  const thongWidth = clamp(Number(options.thongWidth ?? 3), 2, 6);

  const path = new Path();
  path
    .moveTo(0, 0)
    .lineTo(waistWidth, 0)
    .curveTo(waistWidth + 1, riseHeight * 0.3, hipWidth, riseHeight * 0.6, hipWidth, riseHeight)
    .curveTo(
      hipWidth,
      riseHeight + legCurveDepth,
      thongWidth,
      riseHeight + legCurveDepth,
      thongWidth,
      riseHeight + legCurveDepth * 0.6
    )
    .lineTo(0, riseHeight)
    .close();

  const seamAllowanceMm = Number(options.seamAllowance ?? 0);
  const seamAllowance = Number.isFinite(seamAllowanceMm) && seamAllowanceMm > 0 ? seamAllowanceMm / 10 : 0;
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
    label(new Point(hipWidth * 0.3, riseHeight * 0.5), { en: "Thong Front", ru: "Перед стрингов" }),
    edgeLabel(new Point(waistWidth * 0.5, 1), { en: "Waistline", ru: "Линия талии" }),
  ];

  return {
    panels: [
      {
        id: "front",
        name: "Front",
        cutQty: 1,
        material: "Main",
        paths,
      },
    ],
    paths,
    annotations,
    meta: {
      unit: "cm",
      title: { en: "Panties Thong Basic", ru: "Базовые стринги" },
      moduleId: "panties_thong_basic",
      moduleVersion: "0.1.0",
      seamAllowanceApplied: seamAllowance > 0,
      seamAllowanceMm: seamAllowance > 0 ? seamAllowanceMm : 0,
    },
  };
}
