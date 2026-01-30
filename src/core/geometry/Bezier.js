import { Point } from "./Point.js";

export function cubicAt(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t * t2;
  return new Point(
    a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    a * p0.y + b * p1.y + c * p2.y + d * p3.y
  );
}

export function sampleCubic(p0, p1, p2, p3, segments = 20) {
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    points.push(cubicAt(p0, p1, p2, p3, t));
  }
  return points;
}
