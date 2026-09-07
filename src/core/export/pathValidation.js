const EPSILON = 1e-9;
const MAX_VALIDATION_POINTS = 2048;
const CURVE_SAMPLES = 24;

function pointsEqual(a, b, epsilon = EPSILON) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function orientation(value, epsilon = EPSILON) {
  if (value > epsilon) return 1;
  if (value < -epsilon) return -1;
  return 0;
}

function pointOnSegmentInterior(point, start, end, epsilon = EPSILON) {
  if (Math.abs(cross(start, end, point)) > epsilon) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = (point.x - start.x) * dx + (point.y - start.y) * dy;
  return projection > epsilon && projection < lengthSquared - epsilon;
}

function collinearOverlap(a, b, c, d, epsilon = EPSILON) {
  const useX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const firstMin = Math.min(useX ? a.x : a.y, useX ? b.x : b.y);
  const firstMax = Math.max(useX ? a.x : a.y, useX ? b.x : b.y);
  const secondMin = Math.min(useX ? c.x : c.y, useX ? d.x : d.y);
  const secondMax = Math.max(useX ? c.x : c.y, useX ? d.x : d.y);
  return Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin) > epsilon;
}

function segmentsIntersect(a, b, c, d) {
  const signs = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)]
    .map((value) => orientation(value));
  if (signs[0] * signs[1] < 0 && signs[2] * signs[3] < 0) return true;
  if (pointOnSegmentInterior(a, c, d) || pointOnSegmentInterior(b, c, d)) return true;
  if (pointOnSegmentInterior(c, a, b) || pointOnSegmentInterior(d, a, b)) return true;
  return signs.every((value) => value === 0) && collinearOverlap(a, b, c, d);
}

function cubicCoordinate(p0, p1, p2, p3, t) {
  const oneMinusT = 1 - t;
  return oneMinusT ** 3 * p0
    + 3 * oneMinusT ** 2 * t * p1
    + 3 * oneMinusT * t ** 2 * p2
    + t ** 3 * p3;
}

function cubicExtrema(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 3 * p0 - 6 * p1 + 3 * p2;
  const c = -3 * p0 + 3 * p1;
  const quadratic = 3 * a;
  const linear = 2 * b;
  if (Math.abs(quadratic) <= EPSILON) {
    if (Math.abs(linear) <= EPSILON) return [];
    const root = -c / linear;
    return root > 0 && root < 1 ? [root] : [];
  }
  const discriminant = linear * linear - 4 * quadratic * c;
  if (!Number.isFinite(discriminant) || discriminant < 0) return [];
  const rootDiscriminant = Math.sqrt(discriminant);
  return [
    (-linear + rootDiscriminant) / (2 * quadratic),
    (-linear - rootDiscriminant) / (2 * quadratic),
  ].filter((root) => Number.isFinite(root) && root > 0 && root < 1);
}

/** Returns bounds that include analytic cubic Bezier extrema. */
export function exactPathBounds(path, label = "path") {
  if (!path || !Array.isArray(path.segments) || !path.segments.length) {
    throw new TypeError(`${label} is not a valid non-empty Path.`);
  }
  const points = [];
  path.segments.forEach((segment) => {
    if (segment?.type === "M") {
      points.push(segment.points?.[0]);
    } else if (segment?.type === "L") {
      points.push(segment.points?.at(-1));
    } else if (segment?.type === "C") {
      const [p0, p1, p2, p3] = segment.points || [];
      points.push(p3);
      if (p0 && p1 && p2 && p3) {
        const roots = new Set([
          ...cubicExtrema(p0.x, p1.x, p2.x, p3.x),
          ...cubicExtrema(p0.y, p1.y, p2.y, p3.y),
        ]);
        roots.forEach((t) => points.push({
          x: cubicCoordinate(p0.x, p1.x, p2.x, p3.x, t),
          y: cubicCoordinate(p0.y, p1.y, p2.y, p3.y, t),
        }));
      }
    }
  });
  if (!points.length || points.some((point) => !point
    || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new TypeError(`${label} has invalid analytic bounds.`);
  }
  const bounds = {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (![...Object.values(bounds), width, height].every(Number.isFinite)
    || width <= EPSILON || height <= EPSILON) {
    throw new TypeError(`${label} has invalid or unbounded analytic bounds.`);
  }
  return bounds;
}

/** Validates that a physical export contour is bounded, non-degenerate, and simple. */
export function validateClosedPathGeometry(path, label = "path") {
  if (!path || typeof path.toPoints !== "function") {
    throw new TypeError(`${label} cannot be converted to points.`);
  }

  const sampled = path.toPoints(CURVE_SAMPLES);
  if (!Array.isArray(sampled)) {
    throw new TypeError(`${label} returned an invalid point list.`);
  }
  if (sampled.length > MAX_VALIDATION_POINTS + 1) {
    throw new RangeError(`${label} exceeds the ${MAX_VALIDATION_POINTS}-point validation limit.`);
  }

  const points = [];
  sampled.forEach((point, index) => {
    if (!point || typeof point.x !== "number" || typeof point.y !== "number"
      || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new TypeError(`${label}.points[${index}] must be finite.`);
    }
    if (!points.length || !pointsEqual(points.at(-1), point)) {
      points.push({ x: point.x, y: point.y });
    }
  });
  if (points.length > 1 && pointsEqual(points[0], points.at(-1))) points.pop();
  if (points.length < 3) {
    throw new TypeError(`${label} must contain at least three distinct contour points.`);
  }
  if (points.length > MAX_VALIDATION_POINTS) {
    throw new RangeError(`${label} exceeds the ${MAX_VALIDATION_POINTS}-point validation limit.`);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  const width = maxX - minX;
  const height = maxY - minY;
  const boundsArea = width * height;
  if (![minX, minY, maxX, maxY, width, height, boundsArea].every(Number.isFinite)
    || width <= EPSILON || height <= EPSILON) {
    throw new TypeError(`${label} has invalid or unbounded dimensions.`);
  }

  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      if (pointsEqual(points[first], points[second])) {
        throw new TypeError(`${label} contains a repeated contour vertex.`);
      }
    }
  }

  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  const area = Math.abs(twiceArea) / 2;
  const minimumArea = Math.max(EPSILON * EPSILON, boundsArea * 1e-12);
  if (!Number.isFinite(area) || area <= minimumArea) {
    throw new TypeError(`${label} has zero or unstable enclosed area.`);
  }

  // A turn that immediately doubles back overlaps its neighbouring edge. The
  // general intersection loop skips neighbouring edges because their shared
  // endpoint is otherwise expected.
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (pointOnSegmentInterior(next, previous, current)
      || pointOnSegmentInterior(previous, current, next)) {
      throw new TypeError(`${label} contains overlapping neighbouring edges.`);
    }
  }

  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      const adjacent = first === second || firstNext === second || secondNext === first;
      if (!adjacent && segmentsIntersect(
        points[first],
        points[firstNext],
        points[second],
        points[secondNext]
      )) {
        throw new TypeError(`${label} contains a self-intersection.`);
      }
    }
  }

  return {
    points,
    bounds: { minX, minY, maxX, maxY },
    area,
  };
}
