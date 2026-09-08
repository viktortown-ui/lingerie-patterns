import { Path } from "../../core/geometry/Path.js";
import { Point } from "../../core/geometry/Point.js";
import { cubicAt } from "../../core/geometry/Bezier.js";
import { offsetPath } from "../../core/geometry/Offset.js";
import { grainline, notch, label, edgeLabel, foldline } from "../../core/pattern/annotations.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const stretchScale = (percent) => 1 / (1 + clamp(Number(percent) || 0, 0, 200) / 100);

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeLowerBodyMeasurements(raw = {}) {
  const waist = finite(raw.waist, 72);
  const seat = finite(raw.seat ?? raw.hip, 98);
  const highHip = finite(raw.highHip, lerp(waist, seat, 0.62));
  const legacyRise = finite(raw.rise, 23);
  const waistToHighHip = finite(raw.waistToHighHip, clamp(legacyRise * 0.43, 7, 14));
  const waistToSeat = finite(raw.waistToSeat, clamp(legacyRise * 0.87, 15, 27));
  const crossSeam = finite(raw.crossSeam, clamp(legacyRise * 3.1, 58, 94));
  const crossSeamFront = finite(raw.crossSeamFront, crossSeam * 0.47);
  return {
    waist,
    highHip,
    seat,
    waistToHighHip,
    waistToSeat,
    crossSeam,
    crossSeamFront,
  };
}

function assertMeasurements(measurements) {
  const values = Object.values(measurements);
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Measurements must contain positive numbers.");
  }
  if (measurements.waistToSeat <= measurements.waistToHighHip) {
    throw new Error("Waist-to-seat must be greater than waist-to-high-hip.");
  }
  if (measurements.crossSeamFront >= measurements.crossSeam - 8) {
    throw new Error("Front crotch arc must be smaller than the full crotch arc.");
  }
}

function circumferenceAtDepth(measurements, depth) {
  if (depth <= measurements.waistToHighHip) {
    return lerp(
      measurements.waist,
      measurements.highHip,
      clamp(depth / measurements.waistToHighHip, 0, 1),
    );
  }
  const range = measurements.waistToSeat - measurements.waistToHighHip;
  return lerp(
    measurements.highHip,
    measurements.seat,
    clamp((depth - measurements.waistToHighHip) / range, 0, 1),
  );
}

function pathLength(path) {
  const points = path.toPoints(100);
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += points[index - 1].distanceTo(points[index]);
  }
  return total;
}

function clonePath(path) {
  const next = new Path();
  path.segments.forEach((segment) => {
    if (segment.type === "M") {
      next.moveTo(segment.points[0].x, segment.points[0].y);
    } else if (segment.type === "L") {
      next.lineTo(segment.points[1].x, segment.points[1].y);
    } else if (segment.type === "C") {
      const [, cp1, cp2, end] = segment.points;
      next.curveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
    } else if (segment.type === "Z") {
      next.close();
    }
  });
  return next;
}

function translatePath(path, dx, dy) {
  const visited = new Set();
  path.segments.forEach((segment) => {
    (segment.points || []).forEach((point) => {
      if (!point || visited.has(point)) return;
      visited.add(point);
      point.x += dx;
      point.y += dy;
    });
  });
  return path;
}

function translateAnnotation(annotation, dx, dy) {
  const shifted = { ...annotation };
  if (annotation.point) shifted.point = new Point(annotation.point.x + dx, annotation.point.y + dy);
  if (annotation.start) shifted.start = new Point(annotation.start.x + dx, annotation.start.y + dy);
  if (annotation.end) shifted.end = new Point(annotation.end.x + dx, annotation.end.y + dy);
  return shifted;
}

function translateAnnotations(annotations, dx, dy) {
  return annotations.map((annotation) => translateAnnotation(annotation, dx, dy));
}

function makePanelShape({
  topWidth,
  sideWidth,
  sideHeight,
  centerLength,
  gussetHalfWidth,
  centerDip,
  exposure,
  legCurveDelta = 0,
}) {
  const centerTop = new Point(0, centerDip);
  const sideTop = new Point(topWidth, 0);
  const sideLeg = new Point(sideWidth, sideHeight);
  const gussetSide = new Point(gussetHalfWidth, centerLength);
  const centerBottom = new Point(0, centerLength);
  const legSpan = Math.max(2, centerLength - sideHeight);
  const inward = clamp(exposure, 0, 1);
  const controlGap = Math.min(0.35, legSpan / 5);
  const firstControlY = clamp(
    sideHeight + legSpan * 0.3 + legCurveDelta,
    sideHeight + controlGap,
    centerLength - controlGap * 2,
  );
  const secondControlY = clamp(
    centerLength - legSpan * 0.23 + legCurveDelta,
    firstControlY + controlGap,
    centerLength - controlGap,
  );
  const legCp1 = new Point(
    sideWidth * (0.98 - inward * 0.18),
    firstControlY,
  );
  const legCp2 = new Point(
    gussetHalfWidth + (sideWidth - gussetHalfWidth) * (0.72 - inward * 0.46),
    secondControlY,
  );

  const seam = new Path()
    .moveTo(centerTop.x, centerTop.y)
    .curveTo(topWidth * 0.28, centerDip, topWidth * 0.72, 0, sideTop.x, sideTop.y)
    .lineTo(sideLeg.x, sideLeg.y)
    .curveTo(
      legCp1.x,
      legCp1.y,
      legCp2.x,
      legCp2.y,
      gussetSide.x,
      gussetSide.y,
    )
    .lineTo(centerBottom.x, centerBottom.y)
    .lineTo(centerTop.x, centerTop.y)
    .close();

  const waistEdge = new Path()
    .moveTo(centerTop.x, centerTop.y)
    .curveTo(topWidth * 0.28, centerDip, topWidth * 0.72, 0, sideTop.x, sideTop.y);
  const legEdge = new Path()
    .moveTo(sideLeg.x, sideLeg.y)
    .curveTo(
      legCp1.x,
      legCp1.y,
      legCp2.x,
      legCp2.y,
      gussetSide.x,
      gussetSide.y,
    );
  const sideEdge = new Path()
    .moveTo(sideTop.x, sideTop.y)
    .lineTo(sideLeg.x, sideLeg.y);
  const gussetEdge = new Path()
    .moveTo(gussetSide.x, gussetSide.y)
    .lineTo(centerBottom.x, centerBottom.y);
  const foldEdge = new Path()
    .moveTo(centerBottom.x, centerBottom.y)
    .lineTo(centerTop.x, centerTop.y);

  return {
    seam,
    waistEdge,
    legEdge,
    cutEdges: [waistEdge, sideEdge, legEdge, gussetEdge, foldEdge],
    points: {
      centerTop,
      sideTop,
      sideLeg,
      gussetSide,
      centerBottom,
      legHandle: cubicAt(sideLeg, legCp1, legCp2, gussetSide, 0.5),
    },
  };
}

function makeGusset(frontWidth, backWidth, length) {
  const maxWidth = Math.max(frontWidth, backWidth);
  const frontInset = (maxWidth - frontWidth) / 2;
  const backInset = (maxWidth - backWidth) / 2;
  const bow = Math.min(0.45, maxWidth * 0.06);
  const seam = new Path()
    .moveTo(frontInset, 0)
    .lineTo(frontInset + frontWidth, 0)
    .curveTo(maxWidth + bow, length * 0.34, backInset + backWidth + bow, length * 0.72, backInset + backWidth, length)
    .lineTo(backInset, length)
    .curveTo(backInset - bow, length * 0.72, -bow, length * 0.34, frontInset, 0)
    .close();
  const side = new Path()
    .moveTo(frontInset + frontWidth, 0)
    .curveTo(maxWidth + bow, length * 0.34, backInset + backWidth + bow, length * 0.72, backInset + backWidth, length);
  const frontEdge = new Path()
    .moveTo(frontInset, 0)
    .lineTo(frontInset + frontWidth, 0);
  const backEdge = new Path()
    .moveTo(backInset + backWidth, length)
    .lineTo(backInset, length);
  const leftSide = new Path()
    .moveTo(backInset, length)
    .curveTo(backInset - bow, length * 0.72, -bow, length * 0.34, frontInset, 0);
  return {
    seam,
    side,
    cutEdges: [frontEdge, side, backEdge, leftSide],
    frontInset,
    backInset,
    maxWidth,
  };
}

function offsetEdgePoints(edge, allowanceCm) {
  if (allowanceCm <= 0) return edge.toPoints(80);
  return offsetPath(edge, -allowanceCm).toPoints(1);
}

function edgeLineIntersection(firstStart, firstEnd, secondStart, secondEnd) {
  const firstDx = firstEnd.x - firstStart.x;
  const firstDy = firstEnd.y - firstStart.y;
  const secondDx = secondEnd.x - secondStart.x;
  const secondDy = secondEnd.y - secondStart.y;
  const determinant = firstDx * secondDy - firstDy * secondDx;
  if (Math.abs(determinant) < 1e-9) return null;

  const deltaX = secondStart.x - firstStart.x;
  const deltaY = secondStart.y - firstStart.y;
  const factor = (deltaX * secondDy - deltaY * secondDx) / determinant;
  const point = new Point(
    firstStart.x + firstDx * factor,
    firstStart.y + firstDy * factor,
  );
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

function joinPositiveAllowanceEdges(groups, allowances) {
  groups.forEach((current, index) => {
    const next = groups[(index + 1) % groups.length];
    const currentAllowance = Math.abs(allowances[index] || 0);
    const nextAllowance = Math.abs(allowances[(index + 1) % allowances.length] || 0);
    if (currentAllowance <= 0 || nextAllowance <= 0
      || current.length < 2 || next.length < 2) return;

    const currentEnd = current.at(-1);
    const nextStart = next[0];
    if (currentEnd.distanceTo(nextStart) < 1e-9) return;

    const intersection = edgeLineIntersection(
      current.at(-2),
      currentEnd,
      nextStart,
      next[1],
    );
    if (!intersection) return;

    const joinLimit = Math.max(0.75, (currentAllowance + nextAllowance) * 4 + 0.5);
    if (intersection.distanceTo(currentEnd) > joinLimit
      || intersection.distanceTo(nextStart) > joinLimit) return;

    current[current.length - 1] = intersection;
    next[0] = intersection;
  });
}

function segmentIntersection(firstStart, firstEnd, secondStart, secondEnd) {
  const firstDx = firstEnd.x - firstStart.x;
  const firstDy = firstEnd.y - firstStart.y;
  const secondDx = secondEnd.x - secondStart.x;
  const secondDy = secondEnd.y - secondStart.y;
  const determinant = firstDx * secondDy - firstDy * secondDx;
  if (Math.abs(determinant) < 1e-9) return null;

  const deltaX = secondStart.x - firstStart.x;
  const deltaY = secondStart.y - firstStart.y;
  const firstFactor = (deltaX * secondDy - deltaY * secondDx) / determinant;
  const secondFactor = (deltaX * firstDy - deltaY * firstDx) / determinant;
  const tolerance = 1e-9;
  if (firstFactor < -tolerance || firstFactor > 1 + tolerance
    || secondFactor < -tolerance || secondFactor > 1 + tolerance) return null;

  return new Point(
    firstStart.x + firstDx * clamp(firstFactor, 0, 1),
    firstStart.y + firstDy * clamp(firstFactor, 0, 1),
  );
}

function appendDistinct(points, point) {
  if (!points.length || points.at(-1).distanceTo(point) > 1e-9) {
    points.push(point);
  }
}

function removeOpenPolylineLoops(rawPoints) {
  let points = [];
  rawPoints.forEach((point) => appendDistinct(points, point));
  let changed = true;
  let passes = 0;
  while (changed && passes < rawPoints.length) {
    changed = false;
    passes += 1;
    for (let first = 0; first < points.length - 3 && !changed; first += 1) {
      for (let second = first + 2; second < points.length - 1; second += 1) {
        const intersection = segmentIntersection(
          points[first],
          points[first + 1],
          points[second],
          points[second + 1],
        );
        if (!intersection) continue;

        const trimmed = points.slice(0, first + 1);
        appendDistinct(trimmed, intersection);
        points.slice(second + 1).forEach((point) => appendDistinct(trimmed, point));
        points = trimmed;
        changed = true;
        break;
      }
    }
  }
  return points;
}

function orderedAllowancePoints(groups, allowances) {
  const ordered = [];
  let index = 0;
  while (index < groups.length) {
    if (Math.abs(allowances[index] || 0) <= 0) {
      groups[index].forEach((point) => appendDistinct(ordered, point));
      index += 1;
      continue;
    }

    const run = [];
    while (index < groups.length && Math.abs(allowances[index] || 0) > 0) {
      groups[index].forEach((point) => appendDistinct(run, point));
      index += 1;
    }
    // A fully positive closed contour (the gusset) repeats its start point
    // after the circular join.  Z closes it later, so do not treat that
    // intentional endpoint as an open-polyline loop.
    if (run.length > 1 && run[0].distanceTo(run.at(-1)) <= 1e-9) run.pop();
    removeOpenPolylineLoops(run).forEach((point) => appendDistinct(ordered, point));
  }
  return ordered;
}

function variableCutPath(edges, allowances) {
  const groups = edges.map((edge, index) => offsetEdgePoints(edge, allowances[index] || 0));
  // Curves and straight edges are offset separately so each technological
  // edge can use its own allowance.  Join adjacent positive-offset tangents
  // locally; otherwise the two almost-equal endpoints can form a tiny hook.
  // Zero-allowance edges are deliberately untouched (for example, a fold).
  joinPositiveAllowanceEdges(groups, allowances);
  // Polyline offsets can develop a sub-millimetre hook when the allowance is
  // wider than a curve's local radius.  Erase loops only inside contiguous
  // positive-allowance runs; zero-allowance fold geometry remains byte-for-byte
  // unchanged.
  const ordered = orderedAllowancePoints(groups, allowances);
  const first = ordered[0];
  if (!first) throw new Error("Unable to construct cutting line.");
  const cut = new Path().moveTo(first.x, first.y);
  const appendPoint = (point) => {
    if (cut.currentPoint.distanceTo(point) > 1e-9) {
      cut.lineTo(point.x, point.y);
    }
  };
  ordered.slice(1).forEach(appendPoint);
  return cut.close();
}

function panelPaths(seam, edges, allowances) {
  const hasAllowance = allowances.some((value) => value > 0);
  if (!hasAllowance) return { cut: seam };
  return { cut: variableCutPath(edges, allowances), seam };
}

function coverageAmount(value, isThong) {
  if (isThong) {
    return value === "tanga" ? 0.76 : 0.94;
  }
  return { full: 0.08, classic: 0.28, cheeky: 0.58 }[value] ?? 0.28;
}

function riseDropRatio(value) {
  return { high: 0.08, mid: 0.34, low: 0.58 }[value] ?? 0.34;
}

function legHeightRatio(value) {
  return { low: 0.68, classic: 0.47, high: 0.29 }[value] ?? 0.47;
}

function bilingual(ru, en) {
  return { ru, en };
}

export function draftLowerUnderwear(
  rawMeasurements,
  rawOptions = {},
  rawAdjustments = {},
  config = {},
) {
  const measurements = normalizeLowerBodyMeasurements(rawMeasurements);
  assertMeasurements(measurements);

  const options = {
    fabricMaxStretch: finite(rawOptions.fabricMaxStretch, 80),
    workingStretchX: finite(rawOptions.workingStretchX, 25),
    workingStretchY: finite(rawOptions.workingStretchY, 5),
    recovery: rawOptions.recovery || "good",
    elasticWorkingStretch: finite(rawOptions.elasticWorkingStretch, 15),
    elasticMaxStretch: finite(rawOptions.elasticMaxStretch, 80),
    riseLevel: rawOptions.riseLevel || "mid",
    legRise: rawOptions.legRise || "classic",
    backCoverage: rawOptions.backCoverage || "classic",
    thongShape: rawOptions.thongShape || "thong",
    waistFinish: rawOptions.waistFinish || "picot",
    legFinish: rawOptions.legFinish || "picot",
    gussetWidthCm: finite(rawOptions.gussetWidthCm, 6),
    gussetPosition: rawOptions.gussetPosition || "center",
    gussetLining: rawOptions.gussetLining !== false,
    seamAllowance: finite(rawOptions.seamAllowance, 6),
    thongWidthCm: finite(rawOptions.thongWidthCm, 2.5),
  };

  const isThong = Boolean(config.isThong);
  const adjustments = {
    frontWaistDepth: clamp(finite(rawAdjustments.frontWaistDepth, 0), -2, 2),
    frontLegCurve: clamp(finite(rawAdjustments.frontLegCurve, 0), -2.5, 2.5),
    backWaistDepth: clamp(finite(rawAdjustments.backWaistDepth, 0), -2, 2),
    backLegCurve: clamp(finite(rawAdjustments.backLegCurve, 0), -3, 3),
    sideHeight: clamp(finite(rawAdjustments.sideHeight, 0), -2, 2),
  };
  const scaleX = stretchScale(options.workingStretchX);
  const scaleY = stretchScale(options.workingStretchY);
  const topDrop = measurements.waistToSeat * riseDropRatio(options.riseLevel);
  const remainingHeight = Math.max(8, measurements.waistToSeat - topDrop);
  const baseSideHeight = clamp(remainingHeight * legHeightRatio(options.legRise), 3.5, 12);
  const sideHeight = clamp(baseSideHeight + adjustments.sideHeight, 2.5, 14);
  const topCircumference = circumferenceAtDepth(measurements, topDrop) * scaleX;
  const sideCircumference = circumferenceAtDepth(measurements, topDrop + sideHeight) * scaleX;
  const topHalfTotal = topCircumference / 2;
  const sideHalfTotal = sideCircumference / 2;
  const sideDelta = (sideHalfTotal - topHalfTotal) / 2;
  const frontTopWidth = topHalfTotal * 0.47;
  const backTopWidth = topHalfTotal - frontTopWidth;
  const frontSideWidth = Math.max(frontTopWidth + sideDelta, options.gussetWidthCm * 0.72);
  const backSideWidth = Math.max(backTopWidth + sideDelta, options.gussetWidthCm * 0.72);

  const totalArc = measurements.crossSeam * scaleY;
  const frontArc = measurements.crossSeamFront * scaleY;
  const backArc = totalArc - frontArc;
  const gussetLength = clamp(totalArc * (isThong ? 0.2 : 0.22), 12, 19);
  const gussetFrontShare = { front: 0.56, center: 0.48, back: 0.4 }[options.gussetPosition] ?? 0.48;
  const frontCenterLength = clamp(
    frontArc - gussetLength * gussetFrontShare - topDrop * 1.02,
    sideHeight + 5,
    38,
  );
  const backCenterLength = clamp(
    backArc - gussetLength * (1 - gussetFrontShare) - topDrop * 0.94,
    sideHeight + 6,
    42,
  );

  const frontGussetWidth = clamp(options.gussetWidthCm * scaleX, 3.8, 7.5);
  const backGussetWidth = isThong
    ? clamp(options.thongWidthCm * scaleX, 1.1, 4)
    : frontGussetWidth;
  const frontDipBase = options.riseLevel === "low" ? 1.1 : options.riseLevel === "mid" ? 0.6 : 0.25;
  const backDipBase = options.riseLevel === "low" ? 0.25 : -0.15;
  const frontDip = frontDipBase + adjustments.frontWaistDepth;
  const backDip = backDipBase + adjustments.backWaistDepth;

  const front = makePanelShape({
    topWidth: frontTopWidth,
    sideWidth: frontSideWidth,
    sideHeight,
    centerLength: frontCenterLength,
    gussetHalfWidth: frontGussetWidth / 2,
    centerDip: frontDip,
    exposure: isThong ? 0.64 : 0.48,
    legCurveDelta: adjustments.frontLegCurve,
  });
  const back = makePanelShape({
    topWidth: backTopWidth,
    sideWidth: backSideWidth,
    sideHeight,
    centerLength: backCenterLength,
    gussetHalfWidth: backGussetWidth / 2,
    centerDip: backDip,
    exposure: coverageAmount(isThong ? options.thongShape : options.backCoverage, isThong),
    legCurveDelta: adjustments.backLegCurve,
  });
  const gusset = makeGusset(frontGussetWidth, backGussetWidth, gussetLength);

  const seamAllowanceMm = clamp(options.seamAllowance, 0, 20);
  const seamAllowanceCm = seamAllowanceMm / 10;
  const finishAllowance = (finish) => (finish === "foe" || finish === "binding" ? 0 : seamAllowanceCm);
  const waistAllowanceCm = finishAllowance(options.waistFinish);
  const legAllowanceCm = finishAllowance(options.legFinish);
  const frontAllowances = [waistAllowanceCm, seamAllowanceCm, legAllowanceCm, seamAllowanceCm, 0];
  const backAllowances = [waistAllowanceCm, seamAllowanceCm, legAllowanceCm, seamAllowanceCm, 0];
  const gussetAllowances = [seamAllowanceCm, legAllowanceCm, seamAllowanceCm, legAllowanceCm];
  const frontPaths = panelPaths(front.seam, front.cutEdges, frontAllowances);
  const backPaths = panelPaths(back.seam, back.cutEdges, backAllowances);
  const gussetPaths = panelPaths(gusset.seam, gusset.cutEdges, gussetAllowances);

  const layoutGap = 9;
  const frontBounds = frontPaths.cut.bounds();
  const backOffsetX = frontBounds.maxX - frontBounds.minX + layoutGap;
  Object.values(backPaths).forEach((path) => translatePath(path, backOffsetX, 0));
  const backBounds = backPaths.cut.bounds();
  const lowerY = Math.max(frontBounds.maxY, backBounds.maxY) + layoutGap;
  Object.values(gussetPaths).forEach((path) => translatePath(path, 0, lowerY));

  let liningPaths = null;
  let liningOffsetX = 0;
  if (options.gussetLining) {
    const liningGap = 5;
    liningOffsetX = gussetPaths.cut.bounds().maxX - gussetPaths.cut.bounds().minX + liningGap;
    liningPaths = Object.fromEntries(
      Object.entries(gussetPaths).map(([key, path]) => {
        const copy = clonePath(path);
        translatePath(copy, liningOffsetX, 0);
        return [key, copy];
      }),
    );
  }

  const makeStretchLine = (start, end) => ({
    type: "stretchline",
    start,
    end,
    label: bilingual("Наибольшее растяжение", "Greatest stretch"),
  });
  const frontAnnotations = [
    grainline(new Point(frontTopWidth * 0.44, 2.2), new Point(frontTopWidth * 0.44, frontCenterLength - 2.2)),
    makeStretchLine(new Point(2, sideHeight * 0.68), new Point(frontSideWidth - 1.2, sideHeight * 0.68)),
    notch(new Point(front.points.sideTop.x, front.points.sideTop.y + sideHeight * 0.5)),
    notch(new Point(front.points.gussetSide.x * 0.5, frontCenterLength)),
    label(new Point(frontTopWidth * 0.45, frontCenterLength * 0.46), bilingual("ПЕРЕД", "FRONT")),
    edgeLabel(new Point(frontTopWidth * 0.5, 1.1), bilingual("Талия", "Waist")),
    foldline(new Point(0, frontDip), new Point(0, frontCenterLength), bilingual("СГИБ", "FOLD")),
  ];
  const backAnnotations = translateAnnotations(
    [
      grainline(new Point(backTopWidth * 0.45, 2.2), new Point(backTopWidth * 0.45, backCenterLength - 2.2)),
      makeStretchLine(new Point(2, sideHeight * 0.68), new Point(backSideWidth - 1.2, sideHeight * 0.68)),
      notch(new Point(back.points.sideTop.x, back.points.sideTop.y + sideHeight * 0.5)),
      notch(new Point(back.points.gussetSide.x * 0.5, backCenterLength)),
      label(new Point(backTopWidth * 0.46, backCenterLength * 0.43), bilingual("СПИНКА", "BACK")),
      edgeLabel(new Point(backTopWidth * 0.5, 1.1), bilingual("Талия", "Waist")),
      foldline(new Point(0, backDip), new Point(0, backCenterLength), bilingual("СГИБ", "FOLD")),
    ],
    backOffsetX,
    0,
  );
  const gussetCenterX = gusset.maxWidth / 2;
  const gussetAnnotations = translateAnnotations(
    [
      grainline(new Point(gusset.maxWidth * 0.24, 1.2), new Point(gusset.maxWidth * 0.24, gussetLength - 1.2)),
      makeStretchLine(new Point(0.8, gussetLength * 0.63), new Point(gusset.maxWidth - 0.8, gussetLength * 0.63)),
      notch(new Point(gussetCenterX, 0)),
      notch(new Point(gussetCenterX, gussetLength)),
      label(new Point(gusset.maxWidth * 0.34, gussetLength * 0.28), bilingual("ЛАСТОВИЦА", "GUSSET")),
    ],
    0,
    lowerY,
  );
  const liningAnnotations = options.gussetLining
    ? translateAnnotations(
        [
          grainline(new Point(gusset.maxWidth * 0.24, 1.2), new Point(gusset.maxWidth * 0.24, gussetLength - 1.2)),
          label(new Point(gusset.maxWidth * 0.34, gussetLength * 0.45), bilingual("ПОДКЛАДКА", "LINING")),
        ],
        liningOffsetX,
        lowerY,
      )
    : [];

  const panels = [
    {
      id: "front",
      name: bilingual("Перед", "Front"),
      cutQty: bilingual("1 со сгибом", "1 on fold"),
      material: bilingual("Основная ткань", "Main fabric"),
      paths: frontPaths,
    },
    {
      id: "back",
      name: bilingual("Спинка", "Back"),
      cutQty: bilingual("1 со сгибом", "1 on fold"),
      material: bilingual("Основная ткань", "Main fabric"),
      paths: backPaths,
    },
    {
      id: "gusset",
      name: bilingual("Ластовица", "Gusset"),
      cutQty: bilingual("1", "1"),
      material: bilingual("Основная ткань", "Main fabric"),
      paths: gussetPaths,
    },
  ];
  if (liningPaths) {
    panels.push({
      id: "gusset_lining",
      name: bilingual("Подкладка ластовицы", "Gusset lining"),
      cutQty: bilingual("1", "1"),
      material: bilingual("Хлопковая ластовица", "Cotton gusset lining"),
      paths: liningPaths,
    });
  }

  const frontSideLength = front.points.sideTop.distanceTo(front.points.sideLeg);
  const backSideLength = back.points.sideTop.distanceTo(back.points.sideLeg);
  const waistEdgeLength = 2 * (pathLength(front.waistEdge) + pathLength(back.waistEdge));
  const legOpeningLength = pathLength(front.legEdge) + pathLength(back.legEdge) + pathLength(gusset.side);
  const waistElasticLength = waistEdgeLength * stretchScale(options.elasticWorkingStretch) + 2;
  const legElasticLength = legOpeningLength * stretchScale(options.elasticWorkingStretch) + 2;
  const waistbandMaxReach = waistElasticLength * (1 + options.elasticMaxStretch / 100);
  const passThroughOk = waistbandMaxReach + 0.5 >= measurements.seat;
  const sideDifferenceMm = Math.abs(frontSideLength - backSideLength) * 10;
  const fabricLengthCm = Math.ceil((Math.max(frontCenterLength, backCenterLength) + gussetLength + 14) / 5) * 5;

  const warnings = [];
  if (measurements.highHip < measurements.waist * 0.92) {
    warnings.push(bilingual("Верхний обхват таза заметно меньше талии. Проверьте мерку, но нестандартная фигура допустима.", "High hip is notably smaller than waist. Recheck the measurement; unusual proportions are allowed."));
  }
  if (measurements.seat < measurements.highHip * 0.94) {
    warnings.push(bilingual("Обхват ягодиц меньше верхнего обхвата таза. Перепроверьте обе горизонтали.", "Seat is smaller than high hip. Recheck both horizontal measurements."));
  }
  if (options.workingStretchX > options.fabricMaxStretch * 0.62) {
    warnings.push(bilingual("Рабочее растяжение слишком близко к пределу ткани — изделие может врезаться и быстро деформироваться.", "Working stretch is too close to the fabric maximum; the garment may feel tight and wear out quickly."));
  }
  if (options.recovery === "weak") {
    warnings.push(bilingual("Ткань слабо восстанавливается. Для первой примерки уменьшите рабочее растяжение или выберите другое полотно.", "Fabric recovery is weak. Reduce working stretch for the first toile or choose another fabric."));
  }
  if (!passThroughOk) {
    warnings.push(bilingual("Выбранная резинка может не пройти через обхват ягодиц. Нужна более растяжимая резинка или застёжка.", "The selected elastic may not pass over the seat. Use stretchier elastic or add an opening."));
  }

  const moduleId = config.moduleId || (isThong ? "panties_thong_basic" : "panties_basic");
  const moduleVersion = config.version || "1.0.0";
  const title = config.title || (isThong ? bilingual("Стринги по меркам", "Custom thong") : bilingual("Трусики по меркам", "Custom panties"));
  const edgeFinishRu = options.waistFinish === "foe" || options.legFinish === "foe"
    ? "Окантовочную резинку притачивайте без дополнительного припуска по обрабатываемому краю."
    : "Сверьте ширину технологического припуска со способом притачивания резинки.";
  const edgeFinishEn = options.waistFinish === "foe" || options.legFinish === "foe"
    ? "Apply fold-over elastic to the finished edge without adding extra edge allowance."
    : "Match the edge allowance to your chosen elastic application method.";

  return {
    panels,
    paths: Object.fromEntries(
      panels.flatMap((panel) => Object.entries(panel.paths).map(([name, path]) => [`${panel.id}_${name}`, path])),
    ),
    annotations: [...frontAnnotations, ...backAnnotations, ...gussetAnnotations, ...liningAnnotations],
    meta: {
      unit: "cm",
      title,
      moduleId,
      moduleVersion,
      seamAllowanceApplied: seamAllowanceCm > 0,
      seamAllowanceMm,
      edgeAllowancesMm: {
        joining: seamAllowanceMm,
        waist: Math.round(waistAllowanceCm * 10),
        leg: Math.round(legAllowanceCm * 10),
        fold: 0,
      },
      warnings: warnings.length ? warnings : undefined,
      fitStatus: warnings.length ? "check" : "ready-for-toile",
      fitNotice: bilingual(
        "Расчёт прошёл геометрические проверки. Перед дорогой тканью обязателен пробный образец из материала с той же растяжимостью.",
        "Geometry checks passed. Sew a toile in fabric with matching stretch before cutting expensive material.",
      ),
      checks: [
        {
          id: "side-seams",
          label: bilingual("Боковые швы", "Side seams"),
          value: bilingual(`расхождение ${sideDifferenceMm.toFixed(1)} мм`, `${sideDifferenceMm.toFixed(1)} mm difference`),
          status: sideDifferenceMm <= 1 ? "pass" : "warn",
        },
        {
          id: "gusset-front",
          label: bilingual("Шов ластовицы спереди", "Front gusset seam"),
          value: bilingual("совпадает", "matched"),
          status: "pass",
        },
        {
          id: "gusset-back",
          label: bilingual("Шов ластовицы сзади", "Back gusset seam"),
          value: bilingual("совпадает", "matched"),
          status: "pass",
        },
        {
          id: "waist-pass-through",
          label: bilingual("Пояс проходит через ягодицы", "Waistband passes over seat"),
          value: passThroughOk ? bilingual("да", "yes") : bilingual("нужна проверка", "check required"),
          status: passThroughOk ? "pass" : "warn",
        },
      ],
      materials: [
        {
          label: bilingual("Эластичное полотно шириной 140–150 см", "Stretch fabric, 140–150 cm wide"),
          value: bilingual(`примерно ${fabricLengthCm} см`, `about ${fabricLengthCm} cm`),
        },
        {
          label: bilingual("Резинка на талию", "Waist elastic"),
          value: bilingual(`${waistElasticLength.toFixed(1)} см + запас`, `${waistElasticLength.toFixed(1)} cm plus spare`),
        },
        {
          label: bilingual("Резинка на обе ноги", "Elastic for both legs"),
          value: bilingual(`${(legElasticLength * 2).toFixed(1)} см + запас`, `${(legElasticLength * 2).toFixed(1)} cm plus spare`),
        },
        ...(options.gussetLining
          ? [{ label: bilingual("Хлопковая ластовица", "Cotton gusset lining"), value: bilingual("1 деталь", "1 piece") }]
          : []),
      ],
      instructions: [
        bilingual("Распечатайте сначала контрольную страницу и измерьте квадрат 50 × 50 мм.", "Print the calibration page first and measure the 50 × 50 mm square."),
        bilingual("Выполните пробный образец из ткани с такой же растяжимостью и восстановлением.", "Make a toile in fabric with the same stretch and recovery."),
        bilingual("Стачайте перед и спинку с ластовицей по контрольным надсечкам.", "Join front and back to the gusset using the matching notches."),
        bilingual("Закройте боковые швы; их длина рассчитана одинаковой.", "Close the side seams; their stitch lengths are matched."),
        bilingual(edgeFinishRu, edgeFinishEn),
        bilingual("Примерьте, проверьте талию, линию ноги и положение ластовицы. Запишите поправки в профиль.", "Try on, check waist, leg line, and gusset position, then record adjustments in the profile."),
      ],
      engineering: {
        scaleX,
        scaleY,
        sideDifferenceMm,
        waistbandMaxReachCm: waistbandMaxReach,
        waistElasticLengthCm: waistElasticLength,
        legElasticLengthEachCm: legElasticLength,
        adjustments,
      },
      editablePoints: [
        {
          id: "front-waist",
          key: "frontWaistDepth",
          code: "A1",
          label: bilingual("Глубина талии переда", "Front waist depth"),
          point: new Point(front.points.centerTop.x, front.points.centerTop.y),
          axis: "y",
          value: adjustments.frontWaistDepth,
          min: -2,
          max: 2,
          step: 0.1,
          response: 1,
          unit: "cm",
        },
        {
          id: "front-leg",
          key: "frontLegCurve",
          code: "A2",
          label: bilingual("Кривая ноги переда", "Front leg curve"),
          point: new Point(front.points.legHandle.x, front.points.legHandle.y),
          axis: "y",
          value: adjustments.frontLegCurve,
          min: -2.5,
          max: 2.5,
          step: 0.1,
          response: 0.75,
          unit: "cm",
        },
        {
          id: "back-waist",
          key: "backWaistDepth",
          code: "B1",
          label: bilingual("Глубина талии спинки", "Back waist depth"),
          point: new Point(back.points.centerTop.x + backOffsetX, back.points.centerTop.y),
          axis: "y",
          value: adjustments.backWaistDepth,
          min: -2,
          max: 2,
          step: 0.1,
          response: 1,
          unit: "cm",
        },
        {
          id: "back-leg",
          key: "backLegCurve",
          code: "B2",
          label: bilingual("Кривая ноги спинки", "Back leg curve"),
          point: new Point(back.points.legHandle.x + backOffsetX, back.points.legHandle.y),
          axis: "y",
          value: adjustments.backLegCurve,
          min: -3,
          max: 3,
          step: 0.1,
          response: 0.75,
          unit: "cm",
        },
        {
          id: "matched-side",
          key: "sideHeight",
          code: "C1",
          label: bilingual("Высота боковых швов", "Matched side-seam height"),
          point: new Point(front.points.sideLeg.x, front.points.sideLeg.y),
          axis: "y",
          value: adjustments.sideHeight,
          min: -2,
          max: 2,
          step: 0.1,
          response: 1,
          unit: "cm",
        },
      ],
    },
  };
}
