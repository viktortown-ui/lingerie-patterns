import { Point } from "./Point.js";
import { Path } from "./Path.js";

function normal(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy) || 1;
  return new Point(-dy / length, dx / length);
}

function offsetPolyline(points, offset) {
  const shifted = points.map((point, index) => {
    const isLast = index === points.length - 1;
    const prevIndex = Math.max(0, index - 1);
    const nextIndex = Math.min(points.length - 1, index + 1);
    const n = isLast ? normal(points[prevIndex], points[index]) : normal(points[index], points[nextIndex]);
    return new Point(point.x + n.x * offset, point.y + n.y * offset);
  });
  return shifted;
}

export function offsetPath(path, offset) {
  const points = path.toPoints();
  if (points.length < 2) return path;
  const area =
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + (point.x * next.y - next.x * point.y);
    }, 0) / 2;
  const direction = area > 0 ? -1 : 1;
  const shifted = offsetPolyline(points, offset * direction);
  const offsetPath = new Path();
  offsetPath.moveTo(shifted[0].x, shifted[0].y);
  for (let i = 1; i < shifted.length; i += 1) {
    offsetPath.lineTo(shifted[i].x, shifted[i].y);
  }
  return offsetPath;
}
