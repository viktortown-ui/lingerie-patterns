import { Path } from "../../core/geometry/Path.js";
import { Point } from "../../core/geometry/Point.js";
import { offsetPath } from "../../core/geometry/Offset.js";
import { grainline, notch, label } from "../../core/pattern/annotations.js";

export function draftRectangle(measurements) {
  const { width_cm: width, height_cm: height, seam_allowance_cm: seamAllowance } = measurements;
  if ([width, height, seamAllowance].some((value) => typeof value !== "number" || Number.isNaN(value))) {
    throw new Error("Invalid measurements provided");
  }

  const panel = new Path();
  panel
    .moveTo(0, 0)
    .lineTo(width, 0)
    .lineTo(width, height)
    .lineTo(0, height)
    .close();

  const seamPath = seamAllowance > 0 ? offsetPath(panel, seamAllowance) : null;

  const paths = {
    panel,
  };

  if (seamPath) {
    paths.panel_seam = seamPath;
  }

  const annotations = [
    grainline(new Point(width * 0.5, 1), new Point(width * 0.5, height - 1)),
    notch(new Point(width * 0.25, 0)),
    notch(new Point(width * 0.75, height)),
    label(new Point(width * 0.5, height * 0.5), { en: "Panel", ru: "Панель" }),
  ];

  return {
    panels: [
      {
        id: "panel",
        name: "Panel",
        paths,
      },
    ],
    paths,
    annotations,
    meta: {
      unit: "cm",
      title: { en: "Test Rectangle", ru: "Тестовый прямоугольник" },
      moduleId: "test_rectangle",
      moduleVersion: "0.1.0",
      seamAllowanceApplied: seamAllowance > 0,
    },
  };
}
