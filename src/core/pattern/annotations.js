export function grainline(start, end) {
  return { type: "grainline", start, end };
}

export function notch(point, label = "notch") {
  return { type: "notch", point, label };
}

export function label(point, text) {
  return { type: "label", point, text };
}

export function edgeLabel(point, text) {
  return { type: "label", point, text, kind: "edge" };
}

export function foldline(start, end, labelText = "Fold") {
  return { type: "foldline", start, end, label: labelText };
}

export function controlPoint(point, labelText = "CP") {
  return { type: "control", point, label: labelText };
}
