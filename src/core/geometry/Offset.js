import { Point } from "./Point.js";
import { Path } from "./Path.js";

const EPSILON = 1e-9;

function normal(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy) || 1;
  return new Point(-dy / length, dx / length);
}

function lineIntersection(p1, p2, p3, p4) {
  const x1 = p1.x;
  const y1 = p1.y;
  const x2 = p2.x;
  const y2 = p2.y;
  const x3 = p3.x;
  const y3 = p3.y;
  const x4 = p4.x;
  const y4 = p4.y;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < EPSILON) return null;
  const det1 = x1 * y2 - y1 * x2;
  const det2 = x3 * y4 - y3 * x4;
  const x = (det1 * (x3 - x4) - (x1 - x2) * det2) / denom;
  const y = (det1 * (y3 - y4) - (y1 - y2) * det2) / denom;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return new Point(x, y);
}

function pointsEqual(p1, p2) {
  return Math.abs(p1.x - p2.x) < EPSILON && Math.abs(p1.y - p2.y) < EPSILON;
}

function offsetPolyline(points, offset, { closed, miterLimit }) {
  const totalPoints = points.length;
  if (totalPoints < 2) return [];

  const segmentCount = closed ? totalPoints : totalPoints - 1;
  const segments = [];

  for (let i = 0; i < segmentCount; i += 1) {
    const start = points[i];
    const end = points[(i + 1) % totalPoints];
    const n = normal(start, end);
    const startOffset = new Point(start.x + n.x * offset, start.y + n.y * offset);
    const endOffset = new Point(end.x + n.x * offset, end.y + n.y * offset);
    segments.push({ start: startOffset, end: endOffset });
  }

  const output = [];

  const pushPoint = (point) => {
    if (!output.length || !pointsEqual(output[output.length - 1], point)) {
      output.push(point);
    }
  };

  if (!closed) {
    pushPoint(segments[0].start);
  }

  for (let i = 0; i < totalPoints; i += 1) {
    if (!closed && (i === 0 || i === totalPoints - 1)) {
      continue;
    }
    const prevIndex = (i - 1 + segmentCount) % segmentCount;
    const nextIndex = i % segmentCount;
    const prevSeg = segments[prevIndex];
    const nextSeg = segments[nextIndex];
    const intersection = lineIntersection(prevSeg.start, prevSeg.end, nextSeg.start, nextSeg.end);
    if (intersection) {
      const distance = Math.hypot(intersection.x - points[i].x, intersection.y - points[i].y);
      if (distance <= miterLimit) {
        pushPoint(intersection);
        continue;
      }
    }
    pushPoint(prevSeg.end);
    pushPoint(nextSeg.start);
  }

  if (!closed) {
    pushPoint(segments[segmentCount - 1].end);
  }

  if (closed && output.length > 1 && pointsEqual(output[0], output[output.length - 1])) {
    output.pop();
  }

  return output;
}

export function offsetPath(path, offset) {
  if (!Number.isFinite(offset) || offset === 0) return path;
  const points = path.toPoints(80);
  if (points.length < 2) return path;
  const closed = path.segments.some((segment) => segment.type === "Z");
  const area = closed
    ? points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length];
        return sum + (point.x * next.y - next.x * point.y);
      }, 0) / 2
    : 0;
  const direction = closed && area > 0 ? -1 : 1;
  const offsetDistance = offset * direction;
  const miterLimit = Math.abs(offsetDistance) * 4;
  const shifted = offsetPolyline(points, offsetDistance, { closed, miterLimit });
  if (!shifted.length) return path;

  const offsetShape = new Path();
  offsetShape.moveTo(shifted[0].x, shifted[0].y);
  for (let i = 1; i < shifted.length; i += 1) {
    offsetShape.lineTo(shifted[i].x, shifted[i].y);
  }
  if (closed) {
    offsetShape.close();
  }
  return offsetShape;
}
