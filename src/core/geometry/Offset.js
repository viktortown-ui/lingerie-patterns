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
    if (index === points.length - 1) {
      return point.clone();
    }
    const n = normal(points[index], points[index + 1]);
    return new Point(point.x + n.x * offset, point.y + n.y * offset);
  });
  return shifted;
}

export function offsetPath(path, offset) {
  const points = path.toPoints();
  if (points.length < 2) return path;
  const shifted = offsetPolyline(points, offset);
  const offsetPath = new Path();
  offsetPath.moveTo(shifted[0].x, shifted[0].y);
  for (let i = 1; i < shifted.length; i += 1) {
    offsetPath.lineTo(shifted[i].x, shifted[i].y);
  }
  return offsetPath;
}
