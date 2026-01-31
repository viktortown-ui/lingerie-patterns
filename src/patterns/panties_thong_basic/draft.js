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

export function draftThong(measurements, options = {}) {
  const { waist, hip, rise, legOpening } = measurements;
  if ([waist, hip, rise, legOpening].some((value) => typeof value !== "number" || Number.isNaN(value))) {
    throw new Error("Invalid measurements provided");
  }

  const thongWidthCm = clamp(Number(options.thongWidthCm ?? 3), 1.5, 4);
  const thongHalf = thongWidthCm / 2;
  const frontRise = rise;
  const backRise = rise * 1.05;
  const frontWaist = waist / 4 + 1.2;
  const frontHip = hip / 4 + 2.2;
  const backWaist = waist / 4 + 0.8;
  const backHip = hip / 4 + 3;
  const legDepthBase = clamp(legOpening / 9, 5, 11);
  const frontLegDepth = clamp(legDepthBase + frontHip * 0.18, 5, 12);
  const backLegDepth = clamp(legDepthBase + backHip * 0.26, 7, 15);
  const gussetWidth = thongWidthCm;
  const gussetLength = clamp(rise * 0.7, 9, 16);

  const frontPath = new Path();
  frontPath
    .moveTo(0, 0)
    .lineTo(frontWaist, 0)
    .curveTo(frontWaist + 1, frontRise * 0.25, frontHip, frontRise * 0.5, frontHip, frontRise * 0.6)
    .curveTo(
      frontHip,
      frontRise + frontLegDepth,
      thongHalf + 0.6,
      frontRise + frontLegDepth * 0.35,
      thongHalf,
      frontRise
    )
    .lineTo(0, frontRise)
    .close();

  const backPath = new Path();
  backPath
    .moveTo(0, 0)
    .lineTo(backWaist, 0)
    .curveTo(backWaist + 1, backRise * 0.3, backHip, backRise * 0.6, backHip, backRise * 0.75)
    .curveTo(
      backHip,
      backRise + backLegDepth,
      thongHalf + 0.3,
      backRise + backLegDepth * 0.25,
      thongHalf,
      backRise
    )
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
    notch(new Point(frontHip, frontRise * 0.6)),
    notch(new Point(thongHalf, frontRise)),
    label(new Point(frontHip * 0.35, frontRise * 0.5), { en: "Thong Front", ru: "Перед стрингов" }),
    edgeLabel(new Point(frontWaist * 0.5, 1), { en: "Waistline", ru: "Линия талии" }),
    foldline(new Point(0, 0), new Point(0, frontRise), { en: "Fold", ru: "Сгиб" }),
  ];
  const backAnnotations = translateAnnotations(
    [
      grainline(new Point(backWaist * 0.5, 2), new Point(backWaist * 0.5, backRise - 2)),
      notch(new Point(backHip, backRise * 0.7)),
      notch(new Point(thongHalf, backRise)),
      label(new Point(backHip * 0.35, backRise * 0.5), { en: "Thong Back", ru: "Спинка стрингов" }),
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
      title: { en: "Panties Thong Basic", ru: "Базовые стринги" },
      moduleId: "panties_thong_basic",
      moduleVersion: "0.2.0",
      seamAllowanceApplied: seamAllowance > 0,
      seamAllowanceMm: seamAllowance > 0 ? seamAllowanceMm : 0,
    },
  };
}
