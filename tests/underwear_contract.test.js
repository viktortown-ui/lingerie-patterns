import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateSchema } from "../src/core/validate/validate.js";
import pantiesModule from "../src/patterns/panties_basic/module.js";
import pantiesThongModule from "../src/patterns/panties_thong_basic/module.js";

const modules = [pantiesModule, pantiesThongModule];
const EPSILON = 1e-7;

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
}

const edgeMin = fixture("edge-min");
const defaults = fixture("m");
const edgeMax = fixture("edge-max");

const measurementCases = [
  {
    name: "minimum boundaries",
    measurements: edgeMin,
    options: {
      fabricMaxStretch: 30,
      workingStretchX: 10,
      workingStretchY: 0,
      recovery: "weak",
      elasticWorkingStretch: 10,
      elasticMaxStretch: 40,
      riseLevel: "high",
      legRise: "low",
      backCoverage: "full",
      thongShape: "tanga",
      thongWidthCm: 1.5,
      waistFinish: "foe",
      legFinish: "foe",
      gussetWidthCm: 5,
      gussetPosition: "front",
      gussetLining: false,
      seamAllowance: 0,
    },
  },
  { name: "defaults", measurements: defaults, options: {} },
  {
    name: "maximum boundaries",
    measurements: edgeMax,
    options: {
      fabricMaxStretch: 120,
      workingStretchX: 40,
      workingStretchY: 15,
      recovery: "strong",
      elasticWorkingStretch: 25,
      elasticMaxStretch: 100,
      riseLevel: "low",
      legRise: "high",
      backCoverage: "cheeky",
      thongShape: "thong",
      thongWidthCm: 3.5,
      waistFinish: "band",
      legFinish: "binding",
      gussetWidthCm: 7,
      gussetPosition: "back",
      gussetLining: true,
      seamAllowance: 10,
    },
  },
  {
    name: "athletic proportions",
    measurements: fixture("athletic"),
    options: { workingStretchX: 20, workingStretchY: 5, legRise: "high", seamAllowance: 8 },
  },
  {
    name: "curvy proportions",
    measurements: fixture("curvy"),
    options: { workingStretchX: 30, riseLevel: "high", backCoverage: "full", seamAllowance: 6 },
  },
  {
    name: "long vertical proportions",
    measurements: fixture("tall"),
    options: { workingStretchY: 10, riseLevel: "low", gussetPosition: "front", seamAllowance: 8 },
  },
];

function moduleOptions(module, overrides = {}) {
  const values = { ...module.schema.optionDefaults, ...overrides };
  return Object.fromEntries(module.schema.options.map((option) => [option.key, values[option.key]]));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function assertClose(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function sampledLoop(path) {
  const result = [];
  path.toPoints(64).forEach((point) => {
    if (!result.length || distance(result[result.length - 1], point) > EPSILON) {
      result.push(point);
    }
  });
  if (result.length > 1 && distance(result[0], result[result.length - 1]) <= EPSILON) {
    result.pop();
  }
  return result;
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function sign(value) {
  if (value > EPSILON) return 1;
  if (value < -EPSILON) return -1;
  return 0;
}

function pointOnSegmentInterior(point, start, end) {
  if (Math.abs(cross(start, end, point)) > EPSILON) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = (point.x - start.x) * dx + (point.y - start.y) * dy;
  return projection > EPSILON && projection < lengthSquared - EPSILON;
}

function collinearOverlap(a, b, c, d) {
  const useX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const valuesA = useX ? [a.x, b.x] : [a.y, b.y];
  const valuesB = useX ? [c.x, d.x] : [c.y, d.y];
  const overlap =
    Math.min(Math.max(...valuesA), Math.max(...valuesB)) -
    Math.max(Math.min(...valuesA), Math.min(...valuesB));
  return overlap > EPSILON;
}

function trueSegmentIntersection(a, b, c, d) {
  const orientations = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)];
  const signs = orientations.map(sign);
  if (signs[0] * signs[1] < 0 && signs[2] * signs[3] < 0) return true;
  if (pointOnSegmentInterior(a, c, d) || pointOnSegmentInterior(b, c, d)) return true;
  if (pointOnSegmentInterior(c, a, b) || pointOnSegmentInterior(d, a, b)) return true;
  return signs.every((value) => value === 0) && collinearOverlap(a, b, c, d);
}

function firstSelfIntersection(path) {
  const points = sampledLoop(path);
  const segments = points.map((point, index) => [point, points[(index + 1) % points.length]]);
  for (let first = 0; first < segments.length; first += 1) {
    for (let second = first + 1; second < segments.length; second += 1) {
      const adjacent =
        second === first + 1 || (first === 0 && second === segments.length - 1);
      if (adjacent) continue;
      if (trueSegmentIntersection(...segments[first], ...segments[second])) {
        return [first, second];
      }
    }
  }
  return null;
}

function assertUsableClosedPath(path, context) {
  assert.ok(path, `${context}: path is missing`);
  assert.equal(path.segments.at(-1)?.type, "Z", `${context}: contour must be closed`);
  path.segments.forEach((segment, segmentIndex) => {
    (segment.points || []).forEach((point, pointIndex) => {
      assert.ok(
        Number.isFinite(point.x) && Number.isFinite(point.y),
        `${context}: non-finite coordinate at segment ${segmentIndex}, point ${pointIndex}`
      );
    });
  });
  assert.ok(sampledLoop(path).length >= 3, `${context}: contour has fewer than three points`);
  assert.equal(
    firstSelfIntersection(path),
    null,
    `${context}: contour has a true self-intersection`
  );
}

function firstLine(path) {
  return path.segments.find((segment) => segment.type === "L");
}

function lineLength(segment) {
  return distance(segment.points[0], segment.points[1]);
}

function assertMatchedSideSeams(draft, context) {
  const front = draft.panels.find((panel) => panel.id === "front");
  const back = draft.panels.find((panel) => panel.id === "back");
  const frontSide = firstLine(front.paths.seam || front.paths.cut);
  const backSide = firstLine(back.paths.seam || back.paths.cut);
  const differenceMm = Math.abs(lineLength(frontSide) - lineLength(backSide)) * 10;
  assert.ok(differenceMm <= 1 + EPSILON, `${context}: side seams differ by ${differenceMm}mm`);
  assertClose(
    draft.meta.engineering.sideDifferenceMm,
    differenceMm,
    0.001,
    `${context}: engineering side-seam result`
  );
  assert.equal(draft.meta.checks.find((check) => check.id === "side-seams")?.status, "pass");
}

function sameLine(first, second) {
  const [a, b] = first.points;
  const [c, d] = second.points;
  return (
    (distance(a, c) <= EPSILON && distance(b, d) <= EPSILON) ||
    (distance(a, d) <= EPSILON && distance(b, c) <= EPSILON)
  );
}

function assertZeroFoldAllowance(draft, context) {
  assert.equal(draft.meta.edgeAllowancesMm.fold, 0, `${context}: fold allowance metadata`);
  ["front", "back"].forEach((panelId) => {
    const panel = draft.panels.find((candidate) => candidate.id === panelId);
    if (!panel.paths.seam) return;
    const seamLines = panel.paths.seam.segments.filter((segment) => segment.type === "L");
    const foldLine = seamLines.at(-1);
    const cutLines = panel.paths.cut.segments.filter((segment) => segment.type === "L");
    assert.ok(
      cutLines.some((line) => sameLine(line, foldLine)),
      `${context}.${panelId}: the fold moved despite its zero allowance`
    );
  });
}

function gussetWidths(draft) {
  const gusset = draft.panels.find((panel) => panel.id === "gusset");
  const stitch = gusset.paths.seam || gusset.paths.cut;
  const straightEdges = stitch.segments.filter((segment) => segment.type === "L");
  assert.equal(straightEdges.length, 2);
  return {
    front: lineLength(straightEdges[0]),
    back: lineLength(straightEdges[1]),
  };
}

test("boundary and proportion fixtures implement the seven-measurement contract", () => {
  const keys = pantiesModule.schema.fields.map((field) => field.key);
  assert.deepEqual(keys, [
    "waist",
    "highHip",
    "seat",
    "waistToHighHip",
    "waistToSeat",
    "crossSeam",
    "crossSeamFront",
  ]);
  pantiesModule.schema.fields.forEach((field) => {
    assert.equal(edgeMin[field.key], field.min, `${field.key} minimum fixture`);
    assert.equal(defaults[field.key], pantiesModule.schema.defaults[field.key], `${field.key} default fixture`);
    assert.equal(edgeMax[field.key], field.max, `${field.key} maximum fixture`);
  });

  const fixtureNames = [
    "athletic",
    "curvy",
    "edge-min",
    "edge-max",
    "l",
    "m",
    "petite",
    "s",
    "tall",
    "xl",
    "xs",
    "xxl",
  ];
  modules.forEach((module) => {
    fixtureNames.forEach((name) => {
      const values = { ...fixture(name), ...module.schema.optionDefaults };
      assert.deepEqual(validateSchema(module.schema, values), {}, `${module.id}: invalid ${name} fixture`);
    });
  });
});

modules.forEach((module) => {
  measurementCases.forEach((caseData) => {
    test(`${module.id}: ${caseData.name} produces closed non-self-intersecting contours`, () => {
      const options = moduleOptions(module, caseData.options);
      const draft = module.draft(caseData.measurements, options);
      const expectedScaleX = 1 / (1 + options.workingStretchX / 100);
      const expectedScaleY = 1 / (1 + options.workingStretchY / 100);
      assertClose(draft.meta.engineering.scaleX, expectedScaleX, 1e-12, "crosswise stretchScale");
      assertClose(draft.meta.engineering.scaleY, expectedScaleY, 1e-12, "lengthwise stretchScale");

      draft.panels.forEach((panel) => {
        assert.ok(panel.paths.cut, `${module.id}.${panel.id}: cut path is required`);
        if (options.seamAllowance === 0) {
          assert.equal(panel.paths.seam, undefined, `${module.id}.${panel.id}: unexpected seam path`);
        } else {
          assert.ok(panel.paths.seam, `${module.id}.${panel.id}: seam path is required`);
        }
        Object.entries(panel.paths).forEach(([pathName, path]) => {
          assertUsableClosedPath(path, `${module.id}.${caseData.name}.${panel.id}.${pathName}`);
        });
      });

      assertMatchedSideSeams(draft, `${module.id}.${caseData.name}`);
      assertZeroFoldAllowance(draft, `${module.id}.${caseData.name}`);
      assert.ok(draft.annotations.some((annotation) => annotation.type === "stretchline"));
    });
  });
});

test("stretch scale changes the drafted width deterministically", () => {
  const lowStretch = pantiesModule.draft(
    pantiesModule.schema.defaults,
    moduleOptions(pantiesModule, { workingStretchX: 10, seamAllowance: 0 })
  );
  const highStretch = pantiesModule.draft(
    pantiesModule.schema.defaults,
    moduleOptions(pantiesModule, { workingStretchX: 40, seamAllowance: 0 })
  );
  const lowWidth = lowStretch.panels.find((panel) => panel.id === "front").paths.cut.bounds().maxX;
  const highWidth = highStretch.panels.find((panel) => panel.id === "front").paths.cut.bounds().maxX;
  assert.ok(highWidth < lowWidth);
  assertClose(lowStretch.meta.engineering.scaleX, 1 / 1.1, 1e-12, "10% stretch scale");
  assertClose(highStretch.meta.engineering.scaleX, 1 / 1.4, 1e-12, "40% stretch scale");
});

test("guided A/B/C adjustments change only bounded parametric geometry", () => {
  modules.forEach((module) => {
    const base = module.draft(
      module.schema.defaults,
      moduleOptions(module, { seamAllowance: 0 }),
      module.schema.adjustmentDefaults
    );
    const adjusted = module.draft(
      module.schema.defaults,
      moduleOptions(module, { seamAllowance: 0 }),
      {
        frontWaistDepth: 1.4,
        frontLegCurve: -1.2,
        backWaistDepth: -0.8,
        backLegCurve: 1.7,
        sideHeight: 1.2,
      }
    );

    assert.equal(adjusted.meta.editablePoints.length, 5);
    assert.deepEqual(
      adjusted.meta.editablePoints.map((point) => point.code),
      ["A1", "A2", "B1", "B2", "C1"]
    );
    adjusted.meta.editablePoints.forEach((point) => {
      assert.ok(Number.isFinite(point.point.x) && Number.isFinite(point.point.y));
      assert.ok(point.value >= point.min && point.value <= point.max);
    });
    assert.notEqual(
      adjusted.panels.find((panel) => panel.id === "front").paths.cut.toSVGPath(),
      base.panels.find((panel) => panel.id === "front").paths.cut.toSVGPath()
    );
    assert.notEqual(
      adjusted.panels.find((panel) => panel.id === "back").paths.cut.toSVGPath(),
      base.panels.find((panel) => panel.id === "back").paths.cut.toSVGPath()
    );
    adjusted.panels.forEach((panel) => {
      Object.entries(panel.paths).forEach(([pathName, path]) => {
        assertUsableClosedPath(path, `${module.id}.adjusted.${panel.id}.${pathName}`);
      });
    });
    assertMatchedSideSeams(adjusted, `${module.id}.adjusted`);
  });
});

test("guided adjustments clamp hostile or out-of-range project values", () => {
  const draft = pantiesModule.draft(
    pantiesModule.schema.defaults,
    moduleOptions(pantiesModule, { seamAllowance: 0 }),
    {
      frontWaistDepth: 999,
      frontLegCurve: -999,
      backWaistDepth: Number.POSITIVE_INFINITY,
      backLegCurve: 999,
      sideHeight: -999,
    }
  );
  assert.deepEqual(draft.meta.engineering.adjustments, {
    frontWaistDepth: 2,
    frontLegCurve: -2.5,
    backWaistDepth: 0,
    backLegCurve: 3,
    sideHeight: -2,
  });
  draft.panels.forEach((panel) => assertUsableClosedPath(panel.paths.cut, `clamped.${panel.id}`));
  assertMatchedSideSeams(draft, "clamped");
});

test("mixed edge allowances do not create a backward hook at a curved gusset join", () => {
  const measurements = {
    waist: 68,
    highHip: 83,
    seat: 81.5,
    waistToHighHip: 12,
    waistToSeat: 23,
    crossSeam: 73.5,
    crossSeamFront: 40,
  };
  const options = moduleOptions(pantiesModule, {
    fabricMaxStretch: 50,
    workingStretchX: 35,
    workingStretchY: 15,
    recovery: "good",
    elasticWorkingStretch: 15,
    elasticMaxStretch: 80,
    riseLevel: "low",
    legRise: "high",
    backCoverage: "full",
    waistFinish: "foe",
    legFinish: "picot",
    gussetWidthCm: 6.5,
    gussetPosition: "center",
    gussetLining: false,
    seamAllowance: 8,
  });
  const adjustments = {
    frontWaistDepth: -0.8,
    frontLegCurve: -2.2,
    backWaistDepth: 0.9,
    backLegCurve: 2.8,
    sideHeight: 1.4,
  };
  assert.deepEqual(validateSchema(pantiesModule.schema, {
    ...measurements,
    ...options,
    ...adjustments,
  }), {});

  const draft = pantiesModule.draft(measurements, options, adjustments);
  draft.panels.forEach((panel) => {
    Object.entries(panel.paths).forEach(([pathName, path]) => {
      assertUsableClosedPath(path, `mixed-allowance.${panel.id}.${pathName}`);
    });
  });
});

const positiveAllowanceHookRegressions = [
  {
    name: "front curve with inverted waist-to-hip proportions",
    measurements: {
      waist: 150,
      highHip: 72,
      seat: 68,
      waistToHighHip: 9,
      waistToSeat: 23,
      crossSeam: 72,
      crossSeamFront: 41,
    },
    options: {
      fabricMaxStretch: 30,
      workingStretchX: 30,
      workingStretchY: 15,
      recovery: "good",
      elasticWorkingStretch: 20,
      elasticMaxStretch: 80,
      riseLevel: "high",
      legRise: "low",
      backCoverage: "cheeky",
      waistFinish: "band",
      legFinish: "picot",
      gussetWidthCm: 5.5,
      gussetPosition: "center",
      gussetLining: true,
      seamAllowance: 8,
    },
    adjustments: {
      frontWaistDepth: -2,
      frontLegCurve: -2.5,
      backWaistDepth: -2,
      backLegCurve: -3,
      sideHeight: -0.1,
    },
  },
  {
    name: "front curve with short high-rise geometry",
    measurements: {
      waist: 72,
      highHip: 134.5,
      seat: 68,
      waistToHighHip: 6.5,
      waistToSeat: 12,
      crossSeam: 87.5,
      crossSeamFront: 42.5,
    },
    options: {
      fabricMaxStretch: 120,
      workingStretchX: 10,
      workingStretchY: 15,
      recovery: "weak",
      elasticWorkingStretch: 15,
      elasticMaxStretch: 60,
      riseLevel: "low",
      legRise: "high",
      backCoverage: "classic",
      waistFinish: "picot",
      legFinish: "picot",
      gussetWidthCm: 6.5,
      gussetPosition: "front",
      gussetLining: true,
      seamAllowance: 8,
    },
    adjustments: {
      frontWaistDepth: -2,
      frontLegCurve: -2.4,
      backWaistDepth: 0,
      backLegCurve: 3,
      sideHeight: 2,
    },
  },
  {
    name: "back curve at maximum allowance",
    measurements: {
      waist: 48,
      highHip: 64.5,
      seat: 75.5,
      waistToHighHip: 15.5,
      waistToSeat: 25.5,
      crossSeam: 61.5,
      crossSeamFront: 31,
    },
    options: {
      fabricMaxStretch: 120,
      workingStretchX: 20,
      workingStretchY: 0,
      recovery: "strong",
      elasticWorkingStretch: 15,
      elasticMaxStretch: 80,
      riseLevel: "high",
      legRise: "high",
      backCoverage: "classic",
      waistFinish: "picot",
      legFinish: "picot",
      gussetWidthCm: 7,
      gussetPosition: "back",
      gussetLining: true,
      seamAllowance: 10,
    },
    adjustments: {
      frontWaistDepth: -2,
      frontLegCurve: -1.8,
      backWaistDepth: 1.8,
      backLegCurve: -3,
      sideHeight: 2,
    },
  },
];

positiveAllowanceHookRegressions.forEach(({ name, measurements, options: rawOptions, adjustments }) => {
  test(`positive allowance hook regression: ${name}`, () => {
    const options = moduleOptions(pantiesModule, rawOptions);
    assert.deepEqual(validateSchema(pantiesModule.schema, {
      ...measurements,
      ...options,
      ...adjustments,
    }), {});

    const draft = pantiesModule.draft(measurements, options, adjustments);
    draft.panels.forEach((panel) => {
      Object.entries(panel.paths).forEach(([pathName, path]) => {
        assertUsableClosedPath(path, `positive-allowance.${name}.${panel.id}.${pathName}`);
      });
    });
    assertZeroFoldAllowance(draft, `positive-allowance.${name}`);
    assertMatchedSideSeams(draft, `positive-allowance.${name}`);
  });
});

test("thong front and back gusset widths are independent", () => {
  const overrides = {
    workingStretchX: 20,
    gussetWidthCm: 6.5,
    thongWidthCm: 3,
    seamAllowance: 0,
  };
  const basic = pantiesModule.draft(
    pantiesModule.schema.defaults,
    moduleOptions(pantiesModule, overrides)
  );
  const thong = pantiesThongModule.draft(
    pantiesThongModule.schema.defaults,
    moduleOptions(pantiesThongModule, overrides)
  );
  const scale = 1 / 1.2;
  const basicWidths = gussetWidths(basic);
  const thongWidths = gussetWidths(thong);
  assertClose(basicWidths.front, 6.5 * scale, 1e-9, "basic front gusset width");
  assertClose(basicWidths.back, 6.5 * scale, 1e-9, "basic back gusset width");
  assertClose(thongWidths.front, 6.5 * scale, 1e-9, "thong front gusset width");
  assertClose(thongWidths.back, 3 * scale, 1e-9, "thong back gusset width");
  assert.notEqual(thongWidths.front, thongWidths.back);
});

test("relational validation rejects incompatible measurements and stretch settings", () => {
  modules.forEach((module) => {
    const valid = { ...module.schema.defaults, ...module.schema.optionDefaults };
    assert.deepEqual(validateSchema(module.schema, valid), {});

    const verticalOrder = { ...valid, waistToHighHip: 12, waistToSeat: 12 };
    assert.ok(validateSchema(module.schema, verticalOrder).waistToSeat);

    const crotchArc = { ...valid, crossSeam: 60, crossSeamFront: 52 };
    assert.ok(validateSchema(module.schema, crotchArc).crossSeamFront);

    const fabricStretch = { ...valid, fabricMaxStretch: 30, workingStretchX: 35 };
    assert.ok(validateSchema(module.schema, fabricStretch).workingStretchX);

    const elasticStretch = { ...valid, elasticMaxStretch: 40, elasticWorkingStretch: 60 };
    assert.ok(validateSchema(module.schema, elasticStretch).elasticWorkingStretch);

    const invalidChoice = { ...valid, gussetWidthCm: 999 };
    assert.ok(validateSchema(module.schema, invalidChoice).gussetWidthCm);
  });
});
