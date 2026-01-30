export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}
