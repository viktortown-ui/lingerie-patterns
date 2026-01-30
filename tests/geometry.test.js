import assert from "node:assert/strict";
import { Point } from "../src/core/geometry/Point.js";
import { sampleCubic } from "../src/core/geometry/Bezier.js";
import { Path } from "../src/core/geometry/Path.js";
import { offsetPath } from "../src/core/geometry/Offset.js";

{
  const p1 = new Point(0, 0);
  const p2 = new Point(3, 4);
  assert.equal(p1.distanceTo(p2), 5);
}

{
  const p0 = new Point(0, 0);
  const p1 = new Point(10, 0);
  const p2 = new Point(10, 10);
  const p3 = new Point(0, 10);
  const points = sampleCubic(p0, p1, p2, p3, 10);
  assert.equal(points.length, 11);
  assert.deepEqual(points[0], p0);
  assert.deepEqual(points[points.length - 1], p3);
}

{
  const rect = new Path();
  rect.moveTo(0, 0).lineTo(10, 0).lineTo(10, 5).lineTo(0, 5).close();
  const offset = offsetPath(rect, 1);
  const bounds = offset.bounds();
  assert.ok(bounds.maxX > 10);
  assert.ok(bounds.maxY > 5);
}

{
  const curve = new Path();
  curve.moveTo(0, 0).curveTo(5, 0, 5, 10, 10, 10);
  const offset = offsetPath(curve, 1);
  const points = offset.toPoints();
  assert.ok(points.length > 0);
}
