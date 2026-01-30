export class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  clone() {
    return new Point(this.x, this.y);
  }

  add(other) {
    return new Point(this.x + other.x, this.y + other.y);
  }

  subtract(other) {
    return new Point(this.x - other.x, this.y - other.y);
  }

  scale(factor) {
    return new Point(this.x * factor, this.y * factor);
  }

  distanceTo(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.hypot(dx, dy);
  }
}
