import { Path } from "../../core/geometry/Path.js";
import { Point } from "../../core/geometry/Point.js";
import { offsetPath } from "../../core/geometry/Offset.js";
import { grainline, notch, label, edgeLabel, foldline } from "../../core/pattern/annotations.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function translatePath(path, dx, dy) {
  const visited = new Set();
  path.segments.forEach((segment) => {
    if (!segment.points) return;
    segment.points.forEach((point) => {
      if (visited.has(point)) return;
      point.x += dx;
      point.y += dy;
      visited.add(point);
    });
  });
  return path;
}

function clonePath(path) {
  const next = new Path();
  path.segments.forEach((segment) => {
    if (segment.type === "M") {
      const [p] = segment.points;
      next.moveTo(p.x, p.y);
    } else if (segment.type === "L") {
      const [, p] = segment.points;
      next.lineTo(p.x, p.y);
    } else if (segment.type === "C") {
      const [, cp1, cp2, p] = segment.points;
      next.curveTo(cp1.x, cp1.y, cp2.x, cp2.y, p.x, p.y);
    } else if (segment.type === "Z") {
      next.close();
    }
  });
  return next;
}

function translatePoint(point, dx, dy) {
  return new Point(point.x + dx, point.y + dy);
}

function translateAnnotations(annotations, dx, dy) {
  return annotations.map((anno) => {
    if (anno.start && anno.end) {
      return {
        ...anno,
        start: translatePoint(anno.start, dx, dy),
        end: translatePoint(anno.end, dx, dy),
      };
    }
    if (anno.point) {
      return { ...anno, point: translatePoint(anno.point, dx, dy) };
    }
    return anno;
  });
}

export function draftPanties(measurements, options = {}) {
  const { waist, hip, rise, legOpening } = measurements;
  if ([waist, hip, rise, legOpening].some((value) => typeof value !== "number" || Number.isNaN(value))) {
    throw new Error("Invalid measurements provided");
  }

  const gussetWidth = clamp(Number(options.gussetWidthCm ?? 6), 4.5, 8);
  const gussetHalf = gussetWidth / 2;
  const frontRise = rise;
  const backRise = rise * 1.1;
  const frontWaist = waist / 4 + 1.5;
  const frontHip = hip / 4 + 2.5;
  const backWaist = waist / 4 + 1;
  const backHip = hip / 4 + 3.2;
  const legDepthBase = clamp(legOpening / 8, 5, 12);
  const frontLegDepth = clamp(legDepthBase + frontHip * 0.15, 5, 11);
  const backLegDepth = clamp(legDepthBase + backHip * 0.22, 7, 14);
  const gussetLength = clamp(rise * 0.75, 10, 18);

  const frontPath = new Path();
  frontPath
    .moveTo(0, 0)
    .lineTo(frontWaist, 0)
    .curveTo(frontWaist + 1, frontRise * 0.25, frontHip, frontRise * 0.5, frontHip, frontRise * 0.6)
    .curveTo(frontHip, frontRise + frontLegDepth, gussetHalf + 0.8, frontRise + frontLegDepth * 0.35, gussetHalf, frontRise)
    .lineTo(0, frontRise)
    .close();

  const backPath = new Path();
  backPath
    .moveTo(0, 0)
    .lineTo(backWaist, 0)
    .curveTo(backWaist + 1, backRise * 0.3, backHip, backRise * 0.6, backHip, backRise * 0.7)
    .curveTo(backHip, backRise + backLegDepth, gussetHalf + 1.1, backRise + backLegDepth * 0.3, gussetHalf, backRise)
    .lineTo(0, backRise)
    .close();

  const gussetPath = new Path();
  gussetPath
    .moveTo(0, 0)
    .lineTo(gussetWidth, 0)
    .lineTo(gussetWidth, gussetLength)
    .lineTo(0, gussetLength)
    .close();

  const seamAllowanceMm = Number(options.seamAllowance ?? 0);
  const seamAllowance = Number.isFinite(seamAllowanceMm) && seamAllowanceMm > 0 ? seamAllowanceMm / 10 : 0;
  const frontSeam = seamAllowance ? offsetPath(frontPath, seamAllowance) : null;
  const backSeam = seamAllowance ? offsetPath(backPath, seamAllowance) : null;
  const gussetSeam = seamAllowance ? offsetPath(gussetPath, seamAllowance) : null;

  const layoutGap = 4;
  const frontBounds = frontPath.bounds();
  const backOffsetX = frontBounds.maxX - frontBounds.minX + layoutGap;
  translatePath(backPath, backOffsetX, 0);
  if (backSeam) translatePath(backSeam, backOffsetX, 0);

  const backBounds = backPath.bounds();
  const gussetOffsetY = Math.max(frontBounds.maxY, backBounds.maxY) + layoutGap;
  translatePath(gussetPath, 0, gussetOffsetY);
  if (gussetSeam) translatePath(gussetSeam, 0, gussetOffsetY);

  const liningEnabled = options.gussetLining !== false;
  const gussetLiningPath = liningEnabled ? clonePath(gussetPath) : null;
  const gussetLiningSeam = liningEnabled && gussetSeam ? clonePath(gussetSeam) : null;

  if (liningEnabled) {
    const gussetBounds = gussetPath.bounds();
    const liningOffsetX = gussetBounds.maxX - gussetBounds.minX + layoutGap;
    translatePath(gussetLiningPath, liningOffsetX, 0);
    if (gussetLiningSeam) translatePath(gussetLiningSeam, liningOffsetX, 0);
  }

  const frontAnnotations = [
    grainline(new Point(frontWaist * 0.5, 2), new Point(frontWaist * 0.5, frontRise - 2)),
    notch(new Point(frontHip, frontRise * 0.65)),
    notch(new Point(gussetHalf, frontRise)),
    label(new Point(frontHip * 0.35, frontRise * 0.5), { en: "Front", ru: "Перед" }),
    edgeLabel(new Point(frontWaist * 0.5, 1), { en: "Waistline", ru: "Линия талии" }),
    foldline(new Point(0, 0), new Point(0, frontRise), { en: "Fold", ru: "Сгиб" }),
  ];
  const backAnnotations = translateAnnotations(
    [
      grainline(new Point(backWaist * 0.5, 2), new Point(backWaist * 0.5, backRise - 2)),
      notch(new Point(backHip, backRise * 0.7)),
      notch(new Point(gussetHalf, backRise)),
      label(new Point(backHip * 0.35, backRise * 0.5), { en: "Back", ru: "Спинка" }),
      edgeLabel(new Point(backWaist * 0.5, 1), { en: "Waistline", ru: "Линия талии" }),
      foldline(new Point(0, 0), new Point(0, backRise), { en: "Fold", ru: "Сгиб" }),
    ],
    backOffsetX,
    0
  );
  const gussetAnnotations = translateAnnotations(
    [
      grainline(new Point(gussetWidth * 0.5, 1), new Point(gussetWidth * 0.5, gussetLength - 1)),
      notch(new Point(gussetWidth * 0.5, 0)),
      notch(new Point(gussetWidth * 0.5, gussetLength)),
      label(new Point(gussetWidth * 0.5, gussetLength * 0.5), { en: "Gusset", ru: "Ластовица" }),
    ],
    0,
    gussetOffsetY
  );

  const gussetLiningAnnotations = liningEnabled
    ? translateAnnotations(
        [
          grainline(new Point(gussetWidth * 0.5, 1), new Point(gussetWidth * 0.5, gussetLength - 1)),
          label(new Point(gussetWidth * 0.5, gussetLength * 0.5), {
            en: "Gusset lining",
            ru: "Подкладка ластовицы",
          }),
        ],
        gussetPath.bounds().maxX - gussetPath.bounds().minX + layoutGap,
        gussetOffsetY
      )
    : [];

  const panels = [
    {
      id: "front",
      name: "Front",
      cutQty: "1 on fold",
      material: "Main",
      paths: {
        outline: frontPath,
        ...(frontSeam ? { seam: frontSeam } : {}),
      },
    },
    {
      id: "back",
      name: "Back",
      cutQty: "1 on fold",
      material: "Main",
      paths: {
        outline: backPath,
        ...(backSeam ? { seam: backSeam } : {}),
      },
    },
    {
      id: "gusset",
      name: "Gusset",
      cutQty: 1,
      material: "Main",
      paths: {
        outline: gussetPath,
        ...(gussetSeam ? { seam: gussetSeam } : {}),
      },
    },
  ];

  if (liningEnabled) {
    panels.push({
      id: "gusset_lining",
      name: "Gusset lining",
      cutQty: 1,
      material: "Lining",
      paths: {
        outline: gussetLiningPath,
        ...(gussetLiningSeam ? { seam: gussetLiningSeam } : {}),
      },
    });
  }

  const warnings = [];
  if (hip < waist - 4) {
    warnings.push({
      en: "Warning: hip is much smaller than waist; pattern may be invalid.",
      ru: "Предупреждение: бёдра заметно меньше талии; выкройка может быть неверной.",
    });
  }

  return {
    panels,
    paths: {
      front: frontPath,
      ...(frontSeam ? { front_seam: frontSeam } : {}),
      back: backPath,
      ...(backSeam ? { back_seam: backSeam } : {}),
      gusset: gussetPath,
      ...(gussetSeam ? { gusset_seam: gussetSeam } : {}),
      ...(liningEnabled && gussetLiningPath ? { gusset_lining: gussetLiningPath } : {}),
      ...(liningEnabled && gussetLiningSeam ? { gusset_lining_seam: gussetLiningSeam } : {}),
    },
    annotations: [
      ...frontAnnotations,
      ...backAnnotations,
      ...gussetAnnotations,
      ...gussetLiningAnnotations,
    ],
    meta: {
      unit: "cm",
      title: { en: "Panties Basic", ru: "Базовые трусики" },
      moduleId: "panties_basic",
      moduleVersion: "0.2.0",
      seamAllowanceApplied: seamAllowance > 0,
      seamAllowanceMm: seamAllowance > 0 ? seamAllowanceMm : 0,
      warnings: warnings.length ? warnings : undefined,
    },
  };
}
