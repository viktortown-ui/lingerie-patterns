export function grainline(start, end) {
  return { type: "grainline", start, end };
}

export function notch(point, label = "notch") {
  return { type: "notch", point, label };
}

export function label(point, text) {
  return { type: "label", point, text };
}
