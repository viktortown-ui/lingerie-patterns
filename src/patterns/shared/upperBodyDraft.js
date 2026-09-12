import { Path } from "../../core/geometry/Path.js";
import { Point } from "../../core/geometry/Point.js";
import { offsetPath } from "../../core/geometry/Offset.js";
import {
  edgeLabel,
  foldline,
  grainline,
  label,
  notch,
  stretchline,
} from "../../core/pattern/annotations.js";
import { calculateBraletteBandGeometry } from "./upperBodySchema.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const bilingual = (ru, en) => ({ ru, en });
const stretchScale = (percent) => 1 / (1 + clamp(Number(percent) || 0, 0, 200) / 100);

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const UPPER_BODY_FALLBACKS = Object.freeze({
  bust: 92,
  underbust: 78,
  waist: 72,
  highBust: 88,
  frontWidth: 35,
  backWidth: 36,
  shoulderLength: 12.5,
  frontWaistLength: 45,
  backWaistLength: 41,
  bustHeight: 27,
  bustPointDistance: 19,
});

function normalizeMeasurements(raw, keys) {
  return Object.fromEntries(keys.map((key) => [key, finite(raw[key], UPPER_BODY_FALLBACKS[key])]));
}

export function normalizeBraletteMeasurements(raw = {}) {
  return normalizeMeasurements(raw, ["bust", "underbust", "bustHeight", "bustPointDistance"]);
}

export function normalizeCropTopMeasurements(raw = {}) {
  return normalizeMeasurements(raw, [
    "bust",
    "waist",
    "highBust",
    "frontWidth",
    "backWidth",
    "shoulderLength",
    "frontWaistLength",
    "backWaistLength",
  ]);
}

function assertPositiveMeasurements(measurements) {
  if (Object.values(measurements).some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Upper-body measurements must contain positive finite numbers.");
  }
}

function assertBraletteMeasurements(measurements) {
  assertPositiveMeasurements(measurements);
  if (measurements.bust < measurements.underbust + 4) {
    throw new Error("Bust and underbust measurements are incompatible.");
  }
  if (measurements.bustPointDistance >= measurements.bust * 0.5) {
    throw new Error("Bust-point distance is incompatible with the full bust circumference.");
  }
}

function assertCropTopMeasurements(measurements) {
  assertPositiveMeasurements(measurements);
  if (measurements.bust <= measurements.highBust) {
    throw new Error("Bust and high-bust measurements are incompatible.");
  }
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
  return {
    ...annotation,
    ...(annotation.point ? { point: new Point(annotation.point.x + dx, annotation.point.y + dy) } : {}),
    ...(annotation.start ? { start: new Point(annotation.start.x + dx, annotation.start.y + dy) } : {}),
    ...(annotation.end ? { end: new Point(annotation.end.x + dx, annotation.end.y + dy) } : {}),
  };
}

function makePanelPaths(seam, seamAllowanceMm) {
  if (seamAllowanceMm <= 0) return { cut: seam };
  return { cut: offsetPath(seam, seamAllowanceMm / 10), seam };
}

function movePanel(paths, dx, dy) {
  Object.values(paths).forEach((path) => translatePath(path, dx, dy));
  return paths;
}

function rootPaths(panels) {
  return Object.fromEntries(
    panels.flatMap((panel) => Object.entries(panel.paths).map(([name, path]) => [`${panel.id}_${name}`, path])),
  );
}

function rectangleBand(width, height, taper = 0) {
  return new Path()
    .moveTo(0, 0)
    .lineTo(width, 0)
    .lineTo(width - taper, height)
    .curveTo(width * 0.7, height + 0.18, width * 0.3, height + 0.18, taper, height)
    .lineTo(0, 0)
    .close();
}

function cupShape(width, height, coverage) {
  const apexX = width * (coverage === "full" ? 0.48 : coverage === "low" ? 0.56 : 0.52);
  const innerLift = coverage === "full" ? 0 : coverage === "low" ? height * 0.16 : height * 0.08;
  const seam = new Path()
    .moveTo(0, height)
    .curveTo(width * 0.05, height * 0.56, apexX * 0.55, innerLift, apexX, innerLift)
    .curveTo(apexX + (width - apexX) * 0.45, innerLift, width, height * 0.35, width, height * 0.62)
    .curveTo(width, height * 0.8, width, height * 0.94, width, height)
    .lineTo(0, height)
    .close();
  return { seam, width, height, baseY: height };
}

function topShape({ halfWidth, taper, length, armholeDepth, necklineDepth, neckWidth, shoulderRun, shoulderDrop }) {
  const center = halfWidth;
  const leftUnderarm = new Point(0, armholeDepth);
  const rightUnderarm = new Point(halfWidth * 2, armholeDepth);
  const leftHem = new Point(taper, length);
  const rightHem = new Point(halfWidth * 2 - taper, length);
  const leftNeck = new Point(center - neckWidth, 0);
  const rightNeck = new Point(center + neckWidth, 0);
  const leftShoulder = new Point(leftNeck.x - shoulderRun, shoulderDrop);
  const rightShoulder = new Point(rightNeck.x + shoulderRun, shoulderDrop);
  const shoulderVectorLength = Math.hypot(shoulderRun, shoulderDrop) || 1;
  const shoulderTangentX = shoulderRun / shoulderVectorLength * 1.8;
  const shoulderTangentY = shoulderDrop / shoulderVectorLength * 1.8;
  const seam = new Path()
    .moveTo(center, necklineDepth)
    .curveTo(center - neckWidth * 0.6, necklineDepth, center - neckWidth * 0.68, 0, leftNeck.x, leftNeck.y)
    .lineTo(leftShoulder.x, leftShoulder.y)
    .curveTo(leftShoulder.x - shoulderTangentX, leftShoulder.y + shoulderTangentY, 0.3, armholeDepth * 0.68, leftUnderarm.x, leftUnderarm.y)
    .lineTo(leftHem.x, leftHem.y)
    .curveTo(halfWidth * 0.58, length + 0.22, halfWidth * 1.42, length + 0.22, rightHem.x, rightHem.y)
    .lineTo(rightUnderarm.x, rightUnderarm.y)
    .curveTo(halfWidth * 2 - 0.3, armholeDepth * 0.68, rightShoulder.x + shoulderTangentX, rightShoulder.y + shoulderTangentY, rightShoulder.x, rightShoulder.y)
    .lineTo(rightNeck.x, rightNeck.y)
    .curveTo(center + neckWidth * 0.68, 0, center + neckWidth * 0.6, necklineDepth, center, necklineDepth)
    .close();
  return { seam, halfWidth, length, armholeDepth, center };
}

function commonOptions(raw = {}) {
  return {
    fabricMaxStretch: finite(raw.fabricMaxStretch, 50),
    workingStretchX: finite(raw.workingStretchX, 15),
    workingStretchY: finite(raw.workingStretchY, 5),
    recovery: raw.recovery || "good",
    elasticWorkingStretch: finite(raw.elasticWorkingStretch, 15),
    elasticMaxStretch: finite(raw.elasticMaxStretch, 80),
    seamAllowance: clamp(finite(raw.seamAllowance, 6), 0, 20),
  };
}

export function draftSoftBralette(rawMeasurements, rawOptions = {}, config = {}) {
  const measurements = normalizeBraletteMeasurements(rawMeasurements);
  assertBraletteMeasurements(measurements);
  const options = {
    ...commonOptions(rawOptions),
    cupCoverage: rawOptions.cupCoverage || "medium",
    bandHeightCm: clamp(finite(rawOptions.bandHeightCm, 6), 4, 8),
    strapWidthCm: clamp(finite(rawOptions.strapWidthCm, 1.5), 1, 2),
    closure: rawOptions.closure || "pullover",
    cupLining: rawOptions.cupLining !== false,
  };
  const bandGeometry = calculateBraletteBandGeometry({ ...measurements, ...options });
  if (!bandGeometry || bandGeometry.requiredWingWidth < 8) {
    throw new Error("The selected bralette proportions cannot fit the minimum 8 cm side wing.");
  }
  const {
    scaleX,
    cupWidth,
    bridgeWidth,
    targetBandLength,
    closureExtension,
    frontBandWidth,
    requiredWingWidth,
  } = bandGeometry;
  const scaleY = stretchScale(options.workingStretchY);
  const bustDifference = measurements.bust - measurements.underbust;
  const coverageFactor = { low: 0.88, medium: 1, full: 1.12 }[options.cupCoverage] || 1;
  const cupHeight = clamp((measurements.bustHeight * 0.5 + bustDifference * 0.18) * scaleY * coverageFactor, 11, 25);
  const wingWidth = requiredWingWidth;
  const cup = cupShape(cupWidth, cupHeight, options.cupCoverage);
  const frontBand = rectangleBand(frontBandWidth, options.bandHeightCm, 0.18);
  const backWing = rectangleBand(wingWidth, options.bandHeightCm, 0.55);
  const cupPaths = makePanelPaths(cup.seam, options.seamAllowance);
  const bandY = cupHeight + 8;
  const frontBandPaths = movePanel(makePanelPaths(frontBand, options.seamAllowance), 0, bandY);
  const wingX = frontBandWidth + 8;
  const backWingPaths = movePanel(makePanelPaths(backWing, options.seamAllowance), wingX, bandY);
  const panels = [
    { id: "cup", name: bilingual("Мягкая чашка", "Soft cup"), cutQty: options.cupLining ? bilingual("2 зеркально из основы + 2 из подкладки", "2 mirrored main + 2 lining") : bilingual("2 зеркально", "2 mirrored"), material: bilingual("Эластичное полотно", "Stretch fabric"), paths: cupPaths },
    { id: "front_band", name: bilingual("Передняя часть пояса", "Front underband"), cutQty: bilingual("1", "1"), material: bilingual("Эластичное полотно", "Stretch fabric"), paths: frontBandPaths },
    { id: "back_wing", name: bilingual("Боковая часть пояса", "Back wing"), cutQty: bilingual("2 зеркально", "2 mirrored"), material: bilingual("Эластичное полотно", "Stretch fabric"), paths: backWingPaths },
  ];
  const annotations = [
    grainline(new Point(cupWidth * 0.48, cupHeight * 0.18), new Point(cupWidth * 0.48, cupHeight * 0.84)),
    stretchline(new Point(cupWidth * 0.16, cupHeight * 0.68), new Point(cupWidth * 0.84, cupHeight * 0.68), bilingual("Наибольшее растяжение", "Greatest stretch")),
    notch(new Point(0, cup.baseY), bilingual("Центр переда", "Centre front")),
    notch(new Point(cupWidth, cup.baseY), bilingual("Бок чашки", "Cup side")),
    label(new Point(cupWidth * 0.28, cupHeight * 0.52), bilingual("ЧАШКА", "CUP")),
    edgeLabel(new Point(cupWidth * 0.5, cupHeight - 0.5), bilingual("Шов чашки к поясу", "Cup-to-band seam")),
    translateAnnotation(stretchline(new Point(1, options.bandHeightCm * 0.5), new Point(frontBandWidth - 1, options.bandHeightCm * 0.5), bilingual("Наибольшее растяжение", "Greatest stretch")), 0, bandY),
    translateAnnotation(notch(new Point(frontBandWidth / 2, 0), bilingual("Центр переда", "Centre front")), 0, bandY),
    translateAnnotation(label(new Point(frontBandWidth * 0.35, options.bandHeightCm * 0.72), bilingual("ПЕРЕДНИЙ ПОЯС", "FRONT BAND")), 0, bandY),
    translateAnnotation(stretchline(new Point(1, options.bandHeightCm * 0.5), new Point(wingWidth - 1, options.bandHeightCm * 0.5), bilingual("Наибольшее растяжение", "Greatest stretch")), wingX, bandY),
    translateAnnotation(label(new Point(wingWidth * 0.28, options.bandHeightCm * 0.72), bilingual("БОК / СПИНКА", "SIDE / BACK")), wingX, bandY),
  ];
  const actualBandLength = frontBandWidth + wingWidth * 2 - closureExtension;
  const bandDifferenceMm = Math.abs(actualBandLength - targetBandLength) * 10;
  const elasticLength = targetBandLength * stretchScale(options.elasticWorkingStretch) + closureExtension + 4;
  const warnings = [bilingual("Экспериментальная мягкая основа без каркасов: перед основной тканью обязательны макет, примерка и проверка поддержки.", "Experimental wireless soft base: make and fit a toile, then verify support before using final fabric.")];
  if (options.recovery === "weak") warnings.push(bilingual("Для бралетта выбрана ткань со слабым восстановлением — поддержка может быть недостаточной.", "Weak fabric recovery may provide insufficient bralette support."));
  return {
    panels,
    paths: rootPaths(panels),
    annotations,
    meta: {
      unit: "cm",
      title: config.title || bilingual("Мягкий бралетт без каркасов", "Wireless soft bralette"),
      moduleId: config.moduleId || "bralette_soft",
      moduleVersion: config.version || "0.3.0",
      seamAllowanceApplied: options.seamAllowance > 0,
      seamAllowanceMm: options.seamAllowance,
      edgeAllowancesMm: { joining: options.seamAllowance, neckline: options.seamAllowance, underband: options.seamAllowance, fold: 0 },
      warnings,
      fitStatus: "experimental",
      fitNotice: bilingual("Математика деталей согласована; поддержка и форма чашки подтверждаются только реальной примеркой.", "Piece geometry is consistent; cup shape and support require a physical fitting."),
      checks: [
        { id: "cup-band", label: bilingual("Основание чашки и разметка пояса", "Cup base and band placement"), value: bilingual("единый параметр", "shared parameter"), status: "pass" },
        { id: "band-sides", label: bilingual("Боковые швы пояса", "Underband side seams"), value: bilingual("совпадают", "matched"), status: "pass" },
        { id: "band-length", label: bilingual("Расчётная длина пояса", "Calculated underband length"), value: bilingual(`расхождение ${bandDifferenceMm.toFixed(1)} мм`, `${bandDifferenceMm.toFixed(1)} mm difference`), status: bandDifferenceMm <= 1 ? "pass" : "warn" },
        { id: "wire", label: bilingual("Каркас", "Underwire"), value: bilingual("не используется", "not used"), status: "pass" },
      ],
      materials: [
        { label: bilingual("Эластичное полотно шириной 140–150 см", "Stretch fabric, 140–150 cm wide"), value: bilingual("примерно 40 см", "about 40 cm") },
        { label: bilingual("Резинка под грудь", "Underbust elastic"), value: bilingual(`${elasticLength.toFixed(1)} см + запас`, `${elasticLength.toFixed(1)} cm plus spare`) },
        { label: bilingual(`Бретельная резинка ${options.strapWidthCm} см`, `${options.strapWidthCm} cm strap elastic`), value: bilingual("около 100 см; уточнить на примерке", "about 100 cm; confirm at fitting") },
        ...(options.cupLining ? [{ label: bilingual("Эластичная подкладка чашек", "Stretch cup lining"), value: bilingual("примерно 25 см", "about 25 cm") }] : []),
      ],
      instructions: [
        bilingual("Распечатайте контрольную страницу и проверьте масштаб 50 × 50 мм.", "Print the calibration page and verify the 50 × 50 mm square."),
        bilingual("Сшейте пробные чашки и проверьте положение основания, объём и покрытие.", "Sew trial cups and check base position, volume, and coverage."),
        bilingual("Притачайте чашки к передней части пояса по надсечкам.", "Attach cups to the front band using the notches."),
        bilingual("Соедините боковые части, затем установите выбранную застёжку или замкните пояс.", "Join the side wings, then add the chosen closure or close the band."),
        bilingual("Установите регулируемые бретели только после примерки длины.", "Fit adjustable straps only after checking their length on the body."),
      ],
      engineering: { scaleX, scaleY, cupWidthCm: cupWidth, cupHeightCm: cupHeight, targetBandLengthCm: targetBandLength, actualBandLengthCm: actualBandLength, bandDifferenceMm },
    },
  };
}

export function draftStretchCropTop(rawMeasurements, rawOptions = {}, config = {}) {
  const measurements = normalizeCropTopMeasurements(rawMeasurements);
  assertCropTopMeasurements(measurements);
  const options = { ...commonOptions(rawOptions), neckline: rawOptions.neckline || "round", topLength: rawOptions.topLength || "crop", fit: rawOptions.fit || "close", hemFinish: rawOptions.hemFinish || "turn" };
  const scaleX = stretchScale(options.workingStretchX);
  const scaleY = stretchScale(options.workingStretchY);
  const fitFactor = { snug: 0.96, close: 1, easy: 1.05 }[options.fit] || 1;
  const balance = clamp((measurements.frontWidth - measurements.backWidth) * 0.08, -1, 1);
  const frontHalfWidth = measurements.bust * 0.25 * scaleX * fitFactor + balance;
  const backHalfWidth = measurements.bust * 0.25 * scaleX * fitFactor - balance;
  const averageWaistLength = (measurements.frontWaistLength + measurements.backWaistLength) / 2;
  const lengthFactor = { short: 0.63, crop: 0.76, waist: 0.96 }[options.topLength] || 0.76;
  const length = clamp(averageWaistLength * lengthFactor * scaleY, 21, 54);
  const armholeDepth = clamp(averageWaistLength * 0.34 * scaleY, 11.5, Math.max(12.5, length - 7));
  const taper = clamp((measurements.bust - measurements.waist) * 0.125 * scaleX, 0, Math.min(frontHalfWidth, backHalfWidth) * 0.34);
  const neckWidth = clamp(measurements.highBust / 12, 5.8, 9.2);
  const shoulderDrop = clamp(measurements.shoulderLength * 0.22, 2, 4);
  const nominalRun = Math.sqrt(Math.max(1, measurements.shoulderLength ** 2 - shoulderDrop ** 2));
  const shoulderRun = clamp(nominalRun, 5, Math.min(frontHalfWidth, backHalfWidth) - neckWidth - 0.8);
  const frontNeckDepth = { crew: 6, round: 9.5, scoop: 13, v: 15 }[options.neckline] || 9.5;
  const backNeckDepth = options.neckline === "scoop" ? 4.5 : 3;
  const shapeSettings = { taper, length, armholeDepth, neckWidth, shoulderRun, shoulderDrop };
  const front = topShape({ ...shapeSettings, halfWidth: frontHalfWidth, necklineDepth: Math.min(frontNeckDepth, armholeDepth - 2) });
  const back = topShape({ ...shapeSettings, halfWidth: backHalfWidth, necklineDepth: backNeckDepth });
  const frontPaths = makePanelPaths(front.seam, options.seamAllowance);
  const backOffsetX = frontPaths.cut.bounds().maxX - frontPaths.cut.bounds().minX + 8;
  const backPaths = movePanel(makePanelPaths(back.seam, options.seamAllowance), backOffsetX, 0);
  const panels = [
    { id: "front", name: bilingual("Перед топа", "Top front"), cutQty: bilingual("1", "1"), material: bilingual("Эластичное полотно", "Stretch fabric"), paths: frontPaths },
    { id: "back", name: bilingual("Спинка топа", "Top back"), cutQty: bilingual("1", "1"), material: bilingual("Эластичное полотно", "Stretch fabric"), paths: backPaths },
  ];
  const panelAnnotations = (shape, name) => [
    grainline(new Point(shape.center, shape.armholeDepth + 1), new Point(shape.center, shape.length - 2)),
    stretchline(new Point(2, shape.armholeDepth + 3), new Point(shape.halfWidth * 2 - 2, shape.armholeDepth + 3), bilingual("Наибольшее растяжение", "Greatest stretch")),
    notch(new Point(0, shape.armholeDepth + (shape.length - shape.armholeDepth) * 0.48), bilingual("Боковой шов", "Side seam")),
    label(new Point(shape.center - shape.halfWidth * 0.2, shape.length * 0.56), name),
    edgeLabel(new Point(shape.center, 1.1), bilingual("Горловина", "Neckline")),
    edgeLabel(new Point(shape.center, shape.length - 0.8), bilingual("Низ", "Hem")),
  ];
  const annotations = [
    ...panelAnnotations(front, bilingual("ПЕРЕД", "FRONT")),
    ...panelAnnotations(back, bilingual("СПИНКА", "BACK")).map((annotation) => translateAnnotation(annotation, backOffsetX, 0)),
  ];
  const sideLength = Math.hypot(taper, length - armholeDepth);
  const shoulderLength = Math.hypot(shoulderRun, shoulderDrop);
  const hemCircumference = 2 * ((frontHalfWidth - taper) + (backHalfWidth - taper));
  const neckBinding = 2 * Math.PI * neckWidth * 0.9;
  const warnings = [bilingual("Экспериментальная основа эластичного топа: перед основной тканью проверьте пройму, горловину и длину на макете.", "Experimental stretch-top base: test the armhole, neckline, and length in a toile before using final fabric.")];
  if (options.recovery === "weak") warnings.push(bilingual("Слабое восстановление полотна может растянуть горловину и проймы.", "Weak recovery may let the neckline and armholes grow."));
  return {
    panels,
    paths: rootPaths(panels),
    annotations,
    meta: {
      unit: "cm",
      title: config.title || bilingual("Базовый эластичный топ", "Basic stretch crop top"),
      moduleId: config.moduleId || "crop_top_basic",
      moduleVersion: config.version || "0.3.0",
      seamAllowanceApplied: options.seamAllowance > 0,
      seamAllowanceMm: options.seamAllowance,
      edgeAllowancesMm: { joining: options.seamAllowance, neckline: options.seamAllowance, armhole: options.seamAllowance, hem: options.seamAllowance, fold: 0 },
      warnings,
      fitStatus: "experimental",
      fitNotice: bilingual("Боковые и плечевые швы согласованы; посадка пройм и горловины требует пробного образца.", "Side and shoulder seams match; armhole and neckline fit require a toile."),
      checks: [
        { id: "side-seams", label: bilingual("Боковые швы переда и спинки", "Front and back side seams"), value: bilingual("расхождение 0,0 мм", "0.0 mm difference"), status: "pass" },
        { id: "shoulder-seams", label: bilingual("Плечевые швы", "Shoulder seams"), value: bilingual("совпадают", "matched"), status: "pass" },
        { id: "stretch-limit", label: bilingual("Рабочее растяжение", "Working stretch"), value: options.workingStretchX <= options.fabricMaxStretch ? bilingual("в пределах материала", "within material limit") : bilingual("проверьте", "review"), status: options.workingStretchX <= options.fabricMaxStretch ? "pass" : "warn" },
      ],
      materials: [
        { label: bilingual("Эластичное полотно шириной 140–150 см", "Stretch fabric, 140–150 cm wide"), value: bilingual(`примерно ${Math.ceil((length + 15) / 5) * 5} см`, `about ${Math.ceil((length + 15) / 5) * 5} cm`) },
        { label: bilingual("Бейка горловины (ориентир)", "Neck binding estimate"), value: bilingual(`${neckBinding.toFixed(0)} см + запас`, `${neckBinding.toFixed(0)} cm plus spare`) },
        ...(options.hemFinish === "band" ? [{ label: bilingual("Пояс по низу", "Hem band"), value: bilingual(`${(hemCircumference * 0.9).toFixed(0)} см + запас`, `${(hemCircumference * 0.9).toFixed(0)} cm plus spare`) }] : []),
      ],
      instructions: [
        bilingual("Распечатайте контрольную страницу и подтвердите масштаб.", "Print the calibration page and verify the scale."),
        bilingual("Стабилизируйте плечевые швы тонкой тесьмой, если ткань сильно растягивается.", "Stabilize shoulder seams with narrow tape when the fabric is very stretchy."),
        bilingual("Соедините плечи, затем обработайте горловину и проймы пробным способом.", "Join shoulders, then test-finish the neckline and armholes."),
        bilingual("Стачайте одинаковые боковые швы по контрольным надсечкам.", "Join the matched side seams using the notches."),
        bilingual(options.hemFinish === "band" ? "Притачайте пояс по низу после проверки длины." : "Подогните низ после проверки длины на примерке.", options.hemFinish === "band" ? "Attach the hem band after checking the finished length." : "Turn the hem only after checking the length at fitting."),
      ],
      engineering: { scaleX, scaleY, sideLengthCm: sideLength, sideDifferenceMm: 0, shoulderLengthCm: shoulderLength, shoulderDifferenceMm: 0, frontHalfWidthCm: frontHalfWidth, backHalfWidthCm: backHalfWidth, lengthCm: length },
    },
  };
}
