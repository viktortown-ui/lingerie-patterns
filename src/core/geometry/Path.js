import { Point } from "./Point.js";
import { sampleCubic } from "./Bezier.js";

export class Path {
  constructor() {
    this.segments = [];
    this.currentPoint = null;
  }

  moveTo(x, y) {
    const point = new Point(x, y);
    this.segments.push({ type: "M", points: [point] });
    this.currentPoint = point;
    return this;
  }

  lineTo(x, y) {
    const point = new Point(x, y);
    this.segments.push({ type: "L", points: [this.currentPoint, point] });
    this.currentPoint = point;
    return this;
  }

  curveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    const cp1 = new Point(cp1x, cp1y);
    const cp2 = new Point(cp2x, cp2y);
    const point = new Point(x, y);
    this.segments.push({ type: "C", points: [this.currentPoint, cp1, cp2, point] });
    this.currentPoint = point;
    return this;
  }

  close() {
    this.segments.push({ type: "Z" });
    return this;
  }

  toSVGPath() {
    const parts = [];
    this.segments.forEach((segment) => {
      if (segment.type === "M") {
        const [p] = segment.points;
        parts.push(`M ${p.x} ${p.y}`);
      } else if (segment.type === "L") {
        const [, p] = segment.points;
        parts.push(`L ${p.x} ${p.y}`);
      } else if (segment.type === "C") {
        const [, cp1, cp2, p] = segment.points;
        parts.push(`C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${p.x} ${p.y}`);
      } else if (segment.type === "Z") {
        parts.push("Z");
      }
    });
    return parts.join(" ");
  }

  toPoints(segmentsPerCurve = 20) {
    const points = [];
    this.segments.forEach((segment) => {
      if (segment.type === "M") {
        points.push(segment.points[0]);
      }
      if (segment.type === "L") {
        points.push(segment.points[1]);
      }
      if (segment.type === "C") {
        const [p0, p1, p2, p3] = segment.points;
        const curvePoints = sampleCubic(p0, p1, p2, p3, segmentsPerCurve);
        points.push(...curvePoints.slice(1));
      }
    });
    return points;
  }

  bounds() {
    const points = this.toPoints();
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }
}
